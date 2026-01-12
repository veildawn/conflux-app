//! 配置重载工具模块
//!
//! 提供统一的配置重载逻辑，包含：
//! - 重试机制
//! - 配置备份和回滚
//! - 健康检查
//! - 状态同步
//! - 智能重载策略（区分热重载和需要重启的配置变更）

use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::sleep;

use crate::commands::proxy::get_proxy_status;
use crate::commands::{get_app_state_or_err, try_get_app_state, AppState};
use crate::models::MihomoConfig;
use crate::tray_menu::TrayMenuState;

/// 配置变更类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigChangeType {
    /// 可以热重载的配置变更（无需重启进程）
    HotReload,
    /// 需要重启进程的配置变更
    RequiresRestart,
}

/// 检测配置变更结果
#[derive(Debug, Clone)]
pub struct ConfigChangeResult {
    pub change_type: ConfigChangeType,
    /// 如果需要重启，这里包含原因
    pub reason: Option<String>,
}

/// 检测两个配置之间的变更类型
///
/// 返回 `HotReload` 如果变更可以通过 API 热重载
/// 返回 `RequiresRestart` 如果变更需要重启进程
pub fn detect_config_change_type(old: &MihomoConfig, new: &MihomoConfig) -> ConfigChangeResult {
    // 端口变更需要重启
    if old.port != new.port || old.socks_port != new.socks_port || old.mixed_port != new.mixed_port
    {
        let reason = format!(
            "端口变更 (HTTP: {:?}->{:?}, SOCKS: {:?}->{:?}, Mixed: {:?}->{:?})",
            old.port, new.port, old.socks_port, new.socks_port, old.mixed_port, new.mixed_port
        );
        log::warn!("[ConfigChange] {}", reason);
        return ConfigChangeResult {
            change_type: ConfigChangeType::RequiresRestart,
            reason: Some(reason),
        };
    }

    // TUN 模式变更需要重启
    let old_tun_enabled = old.tun.as_ref().map(|t| t.enable).unwrap_or(false);
    let new_tun_enabled = new.tun.as_ref().map(|t| t.enable).unwrap_or(false);
    if old_tun_enabled != new_tun_enabled {
        let reason = format!(
            "TUN 模式变更 ({} -> {})",
            if old_tun_enabled { "开启" } else { "关闭" },
            if new_tun_enabled { "开启" } else { "关闭" }
        );
        log::warn!("[ConfigChange] {}", reason);
        return ConfigChangeResult {
            change_type: ConfigChangeType::RequiresRestart,
            reason: Some(reason),
        };
    }

    // TUN 栈变更需要重启
    let old_tun_stack = old.tun.as_ref().and_then(|t| t.stack.as_ref());
    let new_tun_stack = new.tun.as_ref().and_then(|t| t.stack.as_ref());
    if old_tun_enabled && old_tun_stack != new_tun_stack {
        let reason = format!(
            "TUN 栈变更 ({:?} -> {:?})",
            old_tun_stack.unwrap_or(&"无".to_string()),
            new_tun_stack.unwrap_or(&"无".to_string())
        );
        log::warn!("[ConfigChange] {}", reason);
        return ConfigChangeResult {
            change_type: ConfigChangeType::RequiresRestart,
            reason: Some(reason),
        };
    }

    // external-controller 变更需要重启
    if old.external_controller != new.external_controller {
        let reason = format!(
            "External Controller 变更 ({} -> {})",
            old.external_controller, new.external_controller
        );
        log::warn!("[ConfigChange] {}", reason);
        return ConfigChangeResult {
            change_type: ConfigChangeType::RequiresRestart,
            reason: Some(reason),
        };
    }

    // 其他变更可以热重载
    log::warn!("[ConfigChange] 配置变更可以热重载，无需重启核心");
    ConfigChangeResult {
        change_type: ConfigChangeType::HotReload,
        reason: None,
    }
}

/// 配置重载选项
#[derive(Clone)]
pub struct ReloadOptions {
    /// 最大重试次数
    pub max_retries: u32,
    /// 重试间隔（毫秒）
    pub retry_interval_ms: u64,
    /// 是否在失败时回滚配置
    pub rollback_on_failure: bool,
    /// 是否同步状态到前端
    pub sync_status: bool,
    /// 是否等待健康检查
    pub wait_for_healthy: bool,
    /// 健康检查等待时间（毫秒）
    pub health_check_delay_ms: u64,
}

impl Default for ReloadOptions {
    fn default() -> Self {
        Self {
            max_retries: 3,
            retry_interval_ms: 200, // 优化：从 500ms 降至 200ms
            rollback_on_failure: true,
            sync_status: true,
            wait_for_healthy: true,
            health_check_delay_ms: 50, // 优化：从 200ms 降至 50ms
        }
    }
}

impl ReloadOptions {
    /// 创建快速重载选项（少量重试，不回滚）
    pub fn quick() -> Self {
        Self {
            max_retries: 3, // 增加重试次数，处理瞬时网络问题
            retry_interval_ms: 100,
            rollback_on_failure: false,
            sync_status: true,
            wait_for_healthy: false,
            health_check_delay_ms: 0,
        }
    }

    /// 创建安全重载选项（带回滚）
    pub fn safe() -> Self {
        Self {
            max_retries: 3,
            retry_interval_ms: 300,
            rollback_on_failure: true,
            sync_status: true,
            wait_for_healthy: true,
            health_check_delay_ms: 50, // 优化：减少等待时间，从 200ms 降至 50ms
        }
    }
}

/// 配置备份
pub struct ConfigBackup {
    config_path: PathBuf,
    backup_path: PathBuf,
    #[allow(dead_code)]
    original_config: Option<MihomoConfig>,
}

impl ConfigBackup {
    /// 创建配置备份
    pub fn create(state: &AppState) -> Result<Self> {
        let config_path = state.config_manager.mihomo_config_path().clone();
        let backup_path = config_path.with_extension("yaml.bak");

        // 读取并备份当前配置
        let original_config = state.config_manager.load_mihomo_config().ok();

        // 复制配置文件到备份
        if config_path.exists() {
            fs::copy(&config_path, &backup_path)?;
            log::debug!("Config backup created at: {:?}", backup_path);
        }

        Ok(Self {
            config_path,
            backup_path,
            original_config,
        })
    }

    /// 回滚到备份的配置
    pub fn rollback(&self) -> Result<()> {
        if self.backup_path.exists() {
            fs::copy(&self.backup_path, &self.config_path)?;
            log::info!("Config rolled back from backup");
            Ok(())
        } else {
            Err(anyhow::anyhow!("Backup file not found"))
        }
    }

    /// 获取原始配置（用于状态恢复）
    #[allow(dead_code)]
    pub fn original_config(&self) -> Option<&MihomoConfig> {
        self.original_config.as_ref()
    }

    /// 清理备份文件
    pub fn cleanup(&self) {
        if self.backup_path.exists() {
            let _ = fs::remove_file(&self.backup_path);
            log::debug!("Config backup cleaned up");
        }
    }
}

impl Drop for ConfigBackup {
    fn drop(&mut self) {
        self.cleanup();
    }
}

/// 等待 API 就绪
///
/// 在核心启动过程中，进程可能已存在但 API 尚未就绪。
/// 此函数会等待 API 能够正常响应，避免后续操作失败。
/// 使用指数退避策略，初始间隔 100ms
async fn wait_for_api_ready(timeout_secs: u64) -> Result<(), String> {
    let state = get_app_state_or_err()?;
    let max_total_wait = Duration::from_secs(timeout_secs);
    let mut total_waited = Duration::ZERO;
    let mut current_interval = Duration::from_millis(100);
    let max_interval = Duration::from_millis(500);
    let mut attempt = 0;

    while total_waited < max_total_wait {
        attempt += 1;
        match state.mihomo_api.get_version().await {
            Ok(_) => {
                if attempt > 1 {
                    log::info!("API ready after {} attempts ({:?})", attempt, total_waited);
                }
                return Ok(());
            }
            Err(e) => {
                // 检查进程是否还在运行
                if !state.mihomo_manager.is_running().await {
                    return Err("代理核心已停止运行".to_string());
                }

                if total_waited + current_interval >= max_total_wait {
                    return Err(format!("等待 API 就绪超时: {}", e));
                }

                log::debug!(
                    "Waiting for API ready (attempt {}, {:?}): {}",
                    attempt,
                    total_waited,
                    e
                );
                sleep(current_interval).await;
                total_waited += current_interval;
                // 指数退避
                current_interval = std::cmp::min(current_interval * 2, max_interval);
            }
        }
    }

    Err("等待 API 就绪超时".to_string())
}

/// 重载配置
///
/// 这是配置重载的核心函数，流程：
/// 1. 检查核心进程是否运行，未运行则跳过（配置已保存，下次启动会加载）
/// 2. 等待 API 就绪（处理核心正在启动的情况）
/// 3. 执行配置重载
/// 4. 验证重载成功
pub async fn reload_config(app: Option<&AppHandle>, options: &ReloadOptions) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    // 如果 mihomo 进程没有运行，直接返回成功
    // 配置已保存，下次启动核心时会自动加载新配置
    if !state.mihomo_manager.is_running().await {
        log::debug!("MiHomo is not running, skip reload (config saved for next start)");
        return Ok(());
    }

    // 优化：不再无条件等待 API 就绪。
    // 如果 API 尚未就绪，第一次 reload_configs 会失败（网络错误），
    // 此时再进入 wait_for_api_ready 流程。

    let config_path = state.config_manager.mihomo_config_path();
    let config_path_str = config_path.to_str().unwrap_or("");

    // API 已就绪，执行配置重载（带少量重试处理瞬时错误）
    let mut last_error = String::new();
    let reload_retries = options.max_retries.min(5); // 限制重载重试次数

    for attempt in 1..=reload_retries {
        log::debug!("Config reload attempt {}/{}", attempt, reload_retries);

        match state.mihomo_api.reload_configs(config_path_str, true).await {
            Ok(_) => {
                log::info!("Config reloaded successfully");

                // 等待配置生效并验证
                if options.wait_for_healthy {
                    if options.health_check_delay_ms > 0 {
                        sleep(Duration::from_millis(options.health_check_delay_ms)).await;
                    }

                    // 检查 mihomo 是否仍在运行（配置可能导致崩溃）
                    if !state.mihomo_manager.is_running().await {
                        log::warn!("MiHomo crashed after config reload");
                        return Err("配置重载后代理核心崩溃".to_string());
                    }
                }

                // 同步状态到前端
                if options.sync_status {
                    if let Some(app) = app {
                        sync_proxy_status(app).await;
                        // 记录成功日志
                        let _ = app.emit(
                            "log-entry",
                            serde_json::json!({
                                "type": "info",
                                "payload": "[Config] 配置重载成功"
                            }),
                        );
                    }
                }

                return Ok(());
            }
            Err(e) => {
                last_error = e.to_string();

                // 如果是网络错误（可能是 API 未就绪或核心正忙），尝试等待
                if last_error.contains("connect")
                    || last_error.contains("connection")
                    || last_error.contains("sending request")
                {
                    log::warn!(
                        "Config reload failed on attempt {} with network error: {}",
                        attempt,
                        last_error
                    );
                    // 等待 API 就绪后重试
                    if let Err(wait_err) = wait_for_api_ready(3).await {
                        log::warn!("Wait for API ready failed: {}", wait_err);
                    }
                    continue;
                }

                log::warn!(
                    "Config reload failed on attempt {}: {}",
                    attempt,
                    last_error
                );

                // 如果是配置内容错误（核心已响应但拒绝配置），直接返回错误
                if last_error.contains("Failed to reload configs:") {
                    log::error!("Config rejected by core");
                    return Err(format!(
                        "配置错误: {}",
                        last_error.replace("Failed to reload configs:", "").trim()
                    ));
                }

                // 检查进程是否还在运行
                if !state.mihomo_manager.is_running().await {
                    log::error!("MiHomo stopped running during reload");
                    return Err(format!("代理核心停止运行: {}", last_error));
                }

                if attempt < reload_retries {
                    sleep(Duration::from_millis(options.retry_interval_ms)).await;
                }
            }
        }
    }

    // 记录最终失败日志到前端
    if let Some(app) = app {
        let _ = app.emit(
            "log-entry",
            serde_json::json!({
                "type": "error",
                "payload": format!("[Config] 配置重载失败: {}", last_error)
            }),
        );
    }

    Err(format!("配置重载失败: {}", last_error))
}

/// 应用配置变更（带备份和回滚）
///
/// 这个函数提供原子性的配置变更操作：
/// 1. 备份当前配置
/// 2. 保存新配置
/// 3. 重载配置
/// 4. 如果重载失败且 rollback_on_failure 为 true，回滚配置
pub async fn apply_config_change<F>(
    app: Option<&AppHandle>,
    options: &ReloadOptions,
    apply_fn: F,
) -> Result<(), String>
where
    F: FnOnce(&mut MihomoConfig) -> Result<(), String>,
{
    let state = get_app_state_or_err()?;

    // 创建配置备份
    let backup = if options.rollback_on_failure {
        Some(ConfigBackup::create(state).map_err(|e| e.to_string())?)
    } else {
        None
    };

    // 加载当前配置
    let mut config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 应用变更
    apply_fn(&mut config)?;

    // 验证配置
    state
        .config_manager
        .validate_mihomo_config(&config)
        .map_err(|e| e.to_string())?;

    // 保存配置
    state
        .config_manager
        .save_mihomo_config(&config)
        .map_err(|e| e.to_string())?;

    // 重载配置
    match reload_config(app, options).await {
        Ok(_) => {
            // 成功，清理备份
            if let Some(backup) = backup {
                backup.cleanup();
            }
            Ok(())
        }
        Err(e) => {
            // 失败，尝试回滚
            if let Some(ref backup) = backup {
                if options.rollback_on_failure {
                    log::warn!("Config reload failed, attempting rollback...");
                    if let Err(rollback_err) = backup.rollback() {
                        log::error!("Failed to rollback config: {}", rollback_err);
                    } else {
                        // 尝试用回滚后的配置重新加载
                        let _ = reload_config(app, &ReloadOptions::quick()).await;
                        log::info!("Config rolled back successfully");
                    }
                }
            }
            Err(e)
        }
    }
}

/// 应用 MiHomo 设置变更（保存到 settings.json，然后应用到 config.yaml）
///
/// 这个函数用于修改用户设置（端口、DNS、TUN 等），流程：
/// 1. 修改 settings.json 中的 mihomo 设置
/// 2. 将设置应用到当前 config.yaml
/// 3. 重载 MiHomo
pub async fn apply_mihomo_settings_change<F>(
    app: Option<&AppHandle>,
    options: &ReloadOptions,
    apply_fn: F,
) -> Result<(), String>
where
    F: FnOnce(&mut crate::models::MihomoSettings) -> Result<(), String>,
{
    let state = get_app_state_or_err()?;

    // 创建配置备份
    let backup = if options.rollback_on_failure {
        Some(ConfigBackup::create(state).map_err(|e| e.to_string())?)
    } else {
        None
    };

    // 1. 加载 settings.json
    let mut app_settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    // 2. 应用设置变更
    apply_fn(&mut app_settings.mihomo)?;

    // 3. 保存 settings.json
    state
        .config_manager
        .save_app_settings(&app_settings)
        .map_err(|e| e.to_string())?;

    // 4. 加载当前 config.yaml 并应用设置
    let mut config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 将 MihomoSettings 应用到 MihomoConfig
    apply_settings_to_config(&app_settings.mihomo, &mut config);

    // 5. 验证并保存 config.yaml
    state
        .config_manager
        .validate_mihomo_config(&config)
        .map_err(|e| e.to_string())?;

    state
        .config_manager
        .save_mihomo_config(&config)
        .map_err(|e| e.to_string())?;

    // 6. 重载配置
    match reload_config(app, options).await {
        Ok(_) => {
            if let Some(backup) = backup {
                backup.cleanup();
            }
            Ok(())
        }
        Err(e) => {
            if let Some(ref backup) = backup {
                if options.rollback_on_failure {
                    log::warn!("Settings change failed, attempting rollback...");
                    if let Err(rollback_err) = backup.rollback() {
                        log::error!("Failed to rollback: {}", rollback_err);
                    } else {
                        let _ = reload_config(app, &ReloadOptions::quick()).await;
                        log::info!("Settings rolled back successfully");
                    }
                }
            }
            Err(e)
        }
    }
}

/// 将 MihomoSettings 应用到 MihomoConfig
pub fn apply_settings_to_config(
    settings: &crate::models::MihomoSettings,
    config: &mut MihomoConfig,
) {
    config.port = settings.port;
    config.socks_port = settings.socks_port;
    config.mixed_port = settings.mixed_port;
    config.allow_lan = settings.allow_lan;
    config.ipv6 = settings.ipv6;
    config.tcp_concurrent = settings.tcp_concurrent;
    config.find_process_mode = settings.find_process_mode.clone();
    config.tun = Some(settings.tun.clone());
    config.dns = Some(settings.dns.clone());
    // API 认证配置（应用层管理）
    config.secret = settings.secret.clone();
    config.external_controller = settings.external_controller.clone();
}

/// 从 MihomoSettings 构建基础配置
///
/// 用于激活 profile 时，从 settings.json 中的设置构建 base_config，
/// 然后再合并 profile 内容（proxies/rules 等）生成完整的运行时配置。
pub fn build_base_config_from_settings(settings: &crate::models::MihomoSettings) -> MihomoConfig {
    let mut config = MihomoConfig::default();
    apply_settings_to_config(settings, &mut config);
    config
}

/// 同步代理状态到前端和托盘菜单
pub async fn sync_proxy_status(app: &AppHandle) {
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }
}

/// 安全重启代理（保持系统代理和增强模式状态）
///
/// 这个函数会：
/// 1. 记录当前的系统代理和增强模式状态
/// 2. 重启 mihomo 进程
/// 3. 等待健康检查通过
/// 4. 如果之前开启了这些功能，尝试恢复
pub async fn safe_restart_proxy(app: &AppHandle) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    // 记录当前状态
    let was_system_proxy_enabled = *state.system_proxy_enabled.lock().await;
    let was_enhanced_mode = *state.enhanced_mode.lock().await;

    log::info!(
        "Safe restart: system_proxy={}, enhanced_mode={}",
        was_system_proxy_enabled,
        was_enhanced_mode
    );

    // 如果系统代理已启用，先清除
    if was_system_proxy_enabled {
        if let Err(e) = crate::system::SystemProxy::clear_proxy() {
            log::warn!("Failed to clear system proxy before restart: {}", e);
        }
    }

    // 重启 mihomo
    // restart() 内部已经包含了完整的健康检查（通过 API 验证），
    // 如果 restart() 成功返回，说明 mihomo 已经正常运行
    state
        .mihomo_manager
        .restart()
        .await
        .map_err(|e| e.to_string())?;

    // 优化：减少等待时间，从 300ms 降至 100ms
    // TUN 模式初始化已经在 restart() 的健康检查中处理
    sleep(Duration::from_millis(100)).await;

    // 使用 API 健康检查而不是进程检测，因为 API 检查更可靠
    // 使用指数退避策略进行重试
    let mut healthy = false;
    let mut retry_interval = Duration::from_millis(100);
    let max_retry_interval = Duration::from_millis(500);
    let max_total_wait = Duration::from_secs(3);
    let mut total_waited = Duration::ZERO;

    while total_waited < max_total_wait {
        match state.mihomo_api.get_version().await {
            Ok(_) => {
                healthy = true;
                break;
            }
            Err(e) => {
                log::debug!(
                    "API health check failed after restart ({:?}): {}",
                    total_waited,
                    e
                );
                sleep(retry_interval).await;
                total_waited += retry_interval;
                retry_interval = std::cmp::min(retry_interval * 2, max_retry_interval);
            }
        }
    }

    if !healthy {
        return Err("代理核心重启后 API 未能正常响应".to_string());
    }

    // 恢复系统代理
    if was_system_proxy_enabled {
        let config = state
            .config_manager
            .load_mihomo_config()
            .map_err(|e| e.to_string())?;

        if let Err(e) =
            crate::system::SystemProxy::set_http_proxy("127.0.0.1", config.port.unwrap_or(7890))
        {
            log::warn!("Failed to restore HTTP proxy: {}", e);
        }
        if let Err(e) = crate::system::SystemProxy::set_socks_proxy(
            "127.0.0.1",
            config.socks_port.unwrap_or(7891),
        ) {
            log::warn!("Failed to restore SOCKS proxy: {}", e);
        }

        *state.system_proxy_enabled.lock().await = true;
    }

    // 更新增强模式状态（TUN 配置应该已经在配置文件中了）
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let current_tun_enabled = config.tun.as_ref().map(|t| t.enable).unwrap_or(false);
    *state.enhanced_mode.lock().await = current_tun_enabled;

    // 同步状态
    sync_proxy_status(app).await;

    log::info!("Safe restart completed successfully");
    Ok(())
}

/// 检查 mihomo 是否健康
#[allow(dead_code)]
pub async fn check_mihomo_healthy() -> bool {
    let Some(state) = try_get_app_state() else {
        return false;
    };

    if !state.mihomo_manager.is_running().await {
        return false;
    }

    // 尝试调用 API 检查
    match state.mihomo_api.get_version().await {
        Ok(_) => true,
        Err(e) => {
            log::warn!("Health check failed: {}", e);
            false
        }
    }
}
