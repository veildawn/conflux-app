//! 配置重载工具模块
//!
//! 提供统一的配置重载逻辑，包含：
//! - 重试机制
//! - 配置备份和回滚
//! - 健康检查
//! - 状态同步

use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::sleep;

use crate::commands::proxy::get_proxy_status;
use crate::commands::{get_app_state, AppState};
use crate::models::MihomoConfig;
use crate::tray_menu::TrayMenuState;
use crate::webdav::SyncManager;

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
}

impl Default for ReloadOptions {
    fn default() -> Self {
        Self {
            max_retries: 3,
            retry_interval_ms: 500,
            rollback_on_failure: true,
            sync_status: true,
            wait_for_healthy: true,
        }
    }
}

impl ReloadOptions {
    /// 创建快速重载选项（不重试，不回滚）
    pub fn quick() -> Self {
        Self {
            max_retries: 1,
            retry_interval_ms: 100,
            rollback_on_failure: false,
            sync_status: true,
            wait_for_healthy: false,
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
async fn wait_for_api_ready(timeout_secs: u64) -> Result<(), String> {
    let state = get_app_state();
    let max_attempts = timeout_secs * 2; // 每 500ms 检查一次

    for attempt in 1..=max_attempts {
        match state.mihomo_api.get_version().await {
            Ok(_) => {
                if attempt > 1 {
                    log::info!("API ready after {} attempts", attempt);
                }
                return Ok(());
            }
            Err(e) => {
                // 检查进程是否还在运行
                if !state.mihomo_manager.is_running().await {
                    return Err("代理核心已停止运行".to_string());
                }

                if attempt == max_attempts {
                    return Err(format!("等待 API 就绪超时: {}", e));
                }

                log::debug!("Waiting for API ready (attempt {}): {}", attempt, e);
                sleep(Duration::from_millis(500)).await;
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
    let state = get_app_state();

    // 如果 mihomo 进程没有运行，直接返回成功
    // 配置已保存，下次启动核心时会自动加载新配置
    if !state.mihomo_manager.is_running().await {
        log::debug!("MiHomo is not running, skip reload (config saved for next start)");
        return Ok(());
    }

    // 等待 API 就绪（处理核心正在启动的情况）
    // 这是关键：不要在 API 未就绪时盲目发送请求
    log::debug!("Waiting for API to be ready before reload...");
    wait_for_api_ready(10).await?;

    let config_path = state.config_manager.mihomo_config_path();
    let config_path_str = config_path.to_str().unwrap_or("");

    // API 已就绪，执行配置重载（带少量重试处理瞬时错误）
    let mut last_error = String::new();
    let reload_retries = options.max_retries.min(5); // 限制重载重试次数，因为 API 已就绪

    for attempt in 1..=reload_retries {
        log::debug!("Config reload attempt {}/{}", attempt, reload_retries);

        match state.mihomo_api.reload_configs(config_path_str, true).await {
            Ok(_) => {
                log::info!("Config reloaded successfully");

                // 等待配置生效并验证
                if options.wait_for_healthy {
                    sleep(Duration::from_millis(200)).await;

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
                    }
                }

                // 触发 WebDAV 自动上传（如果启用）
                trigger_auto_upload().await;

                return Ok(());
            }
            Err(e) => {
                last_error = e.to_string();
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
    let state = get_app_state();

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
    let state = get_app_state();

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
    let state = get_app_state();

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

    // 额外等待一小段时间让 mihomo 完全稳定
    // 这对于 TUN 模式切换特别重要，因为网络栈需要时间初始化
    sleep(Duration::from_millis(300)).await;

    // 使用 API 健康检查而不是进程检测，因为 API 检查更可靠
    // 进程检测可能因为 tasklist 延迟或进程名匹配问题而失败
    let healthy = match state.mihomo_api.get_version().await {
        Ok(_) => true,
        Err(e) => {
            log::warn!("API health check failed after restart: {}, retrying...", e);
            // 如果第一次检查失败，等待更长时间后重试
            sleep(Duration::from_millis(1000)).await;
            state.mihomo_api.get_version().await.is_ok()
        }
    };

    if !healthy {
        return Err("代理核心重启后 API 未能正常响应".to_string());
    }

    // 恢复系统代理
    if was_system_proxy_enabled {
        let config = state
            .config_manager
            .load_mihomo_config()
            .map_err(|e| e.to_string())?;

        if let Err(e) = crate::system::SystemProxy::set_http_proxy("127.0.0.1", config.port) {
            log::warn!("Failed to restore HTTP proxy: {}", e);
        }
        if let Err(e) = crate::system::SystemProxy::set_socks_proxy("127.0.0.1", config.socks_port)
        {
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
    let state = get_app_state();

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

/// 触发 WebDAV 自动上传（如果启用）
pub async fn trigger_auto_upload() {
    let state = get_app_state();

    // 加载应用设置，检查是否启用了自动上传
    let settings = match state.config_manager.load_app_settings() {
        Ok(s) => s,
        Err(e) => {
            log::debug!("Failed to load app settings for auto upload: {}", e);
            return;
        }
    };

    // 检查 WebDAV 是否启用且开启了自动上传
    if !settings.webdav.enabled || !settings.webdav.auto_upload {
        return;
    }

    log::info!("Triggering WebDAV auto upload...");

    // 异步执行上传，不阻塞主流程
    let webdav_config = settings.webdav.clone();
    tokio::spawn(async move {
        let sync_manager = SyncManager::new(webdav_config);
        match sync_manager.upload_all().await {
            Ok(result) => {
                if result.success {
                    log::info!("WebDAV auto upload completed: {}", result.message);
                } else {
                    log::warn!("WebDAV auto upload failed: {}", result.message);
                }
            }
            Err(e) => {
                log::warn!("WebDAV auto upload error: {}", e);
            }
        }
    });
}
