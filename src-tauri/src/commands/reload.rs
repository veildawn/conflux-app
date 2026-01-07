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

    /// 创建安全重载选项（多重试，带回滚）
    pub fn safe() -> Self {
        Self {
            max_retries: 3,
            retry_interval_ms: 500,
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

/// 重载配置（带重试机制）
///
/// 这是配置重载的核心函数，提供：
/// - 自动重试
/// - 配置备份和回滚
/// - 状态同步
pub async fn reload_config(app: Option<&AppHandle>, options: &ReloadOptions) -> Result<(), String> {
    let state = get_app_state();

    // 如果 mihomo 没有运行，直接返回
    if !state.mihomo_manager.is_running().await {
        log::debug!("MiHomo is not running, skip reload");
        return Ok(());
    }

    let config_path = state.config_manager.mihomo_config_path();
    let config_path_str = config_path.to_str().unwrap_or("");

    let mut last_error = String::new();

    for attempt in 1..=options.max_retries {
        log::debug!("Config reload attempt {}/{}", attempt, options.max_retries);

        match state.mihomo_api.reload_configs(config_path_str, true).await {
            Ok(_) => {
                log::info!("Config reloaded successfully on attempt {}", attempt);

                // 等待健康检查
                if options.wait_for_healthy {
                    // 短暂等待让 mihomo 应用配置
                    sleep(Duration::from_millis(200)).await;

                    // 检查 mihomo 是否仍在运行
                    if !state.mihomo_manager.is_running().await {
                        log::warn!("MiHomo crashed after config reload");
                        return Err("配置重载后代理核心崩溃".to_string());
                    }
                }

                // 同步状态
                if options.sync_status {
                    if let Some(app) = app {
                        sync_proxy_status(app).await;
                    }
                }

                return Ok(());
            }
            Err(e) => {
                last_error = e.to_string();
                log::warn!(
                    "Config reload failed on attempt {}: {}",
                    attempt,
                    last_error
                );

                // 如果 mihomo 已经停止运行，不需要再重试
                if !state.mihomo_manager.is_running().await {
                    log::error!("MiHomo stopped running during reload retries");
                    return Err(format!("代理核心停止运行: {}", last_error));
                }

                if attempt < options.max_retries {
                    sleep(Duration::from_millis(options.retry_interval_ms)).await;
                }
            }
        }
    }

    Err(format!(
        "配置重载失败（已重试 {} 次）: {}",
        options.max_retries, last_error
    ))
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
    state
        .mihomo_manager
        .restart()
        .await
        .map_err(|e| e.to_string())?;

    // 等待健康检查
    let mut healthy = false;
    for _ in 0..10 {
        sleep(Duration::from_millis(500)).await;
        if state.mihomo_manager.is_running().await {
            healthy = true;
            break;
        }
    }

    if !healthy {
        return Err("代理核心重启后未能正常运行".to_string());
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
