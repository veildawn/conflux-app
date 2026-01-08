//! Windows 服务控制命令
//!
//! 仅在 Windows 平台上可用

#[cfg(target_os = "windows")]
use crate::commands::get_app_state;

/// 获取服务状态
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn get_service_status() -> Result<crate::system::ServiceStatus, String> {
    crate::system::WinServiceManager::get_status()
        .await
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn get_service_status() -> Result<ServiceStatusDummy, String> {
    Ok(ServiceStatusDummy {
        installed: false,
        running: false,
        mihomo_running: false,
        mihomo_pid: None,
    })
}

/// 安装服务
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_service() -> Result<(), String> {
    use crate::system::WinServiceManager;

    // 检查是否已安装
    if WinServiceManager::is_installed().map_err(|e| e.to_string())? {
        return Err("服务已安装".to_string());
    }

    // 无论是否有权限，都使用提权方式安装（会触发 UAC）
    WinServiceManager::install().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn install_service() -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 卸载服务
///
/// 卸载服务后，mihomo 会以普通模式运行
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn uninstall_service(app: tauri::AppHandle) -> Result<(), String> {
    use crate::commands::reload::sync_proxy_status;
    use crate::system::WinServiceManager;

    // 检查是否已安装
    if !WinServiceManager::is_installed().map_err(|e| e.to_string())? {
        return Err("服务未安装".to_string());
    }

    let state = get_app_state();

    // 1. 检查 TUN 模式是否启用，如果启用需要先禁用
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    let tun_enabled = config.tun.as_ref().map(|t| t.enable).unwrap_or(false);

    if tun_enabled {
        log::info!("TUN mode is enabled, disabling TUN before uninstalling service...");

        if let Err(e) = state.config_manager.update_tun_mode(false) {
            log::error!("Failed to disable TUN mode: {}", e);
            return Err(format!("禁用 TUN 模式失败: {}", e));
        }

        {
            let mut enhanced_mode = state.enhanced_mode.lock().await;
            *enhanced_mode = false;
        }
    }

    // 2. 如果服务正在运行，先停止服务
    if WinServiceManager::is_running().unwrap_or(false) {
        log::info!("Service is running, stopping before uninstall...");
        if let Err(e) = WinServiceManager::stop() {
            log::warn!("Failed to stop service: {}", e);
        }
        // 等待服务停止
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    // 3. 重置 mihomo_manager 的内部状态
    log::info!("Resetting mihomo manager state...");
    {
        let mut service_mode = state.mihomo_manager.service_mode_flag().lock().await;
        *service_mode = false;
    }

    // 4. 清理可能的残留进程
    crate::mihomo::MihomoManager::cleanup_stale_processes();

    // 5. 使用提权方式卸载服务（会触发 UAC）
    log::info!("Uninstalling Windows service...");
    WinServiceManager::uninstall().map_err(|e| e.to_string())?;

    // 6. 等待服务完全卸载
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    // 7. 以普通模式启动 mihomo
    log::info!("Starting mihomo in normal mode...");
    if let Err(e) = state.mihomo_manager.start().await {
        log::error!("Failed to start mihomo in normal mode: {}", e);
        sync_proxy_status(&app).await;
        return Err(format!("以普通模式启动 mihomo 失败: {}", e));
    }

    log::info!("Mihomo started in normal mode successfully");

    // 8. 同步状态到前端
    sync_proxy_status(&app).await;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn uninstall_service(_app: tauri::AppHandle) -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 启动服务
///
/// 启动服务后，mihomo 会通过服务模式运行（无论 TUN 是否启用）
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn start_service(app: tauri::AppHandle) -> Result<(), String> {
    use crate::commands::reload::sync_proxy_status;
    use crate::system::WinServiceManager;

    let state = get_app_state();

    // 1. 先停止当前运行的 mihomo（如果有）
    log::info!("Stopping current mihomo before starting service...");
    if let Err(e) = state.mihomo_manager.stop().await {
        log::warn!("Failed to stop current mihomo: {}", e);
    }

    // 2. 启动 Windows 服务
    log::info!("Starting Windows service...");
    WinServiceManager::start().map_err(|e| e.to_string())?;

    // 3. 等待服务 IPC 就绪
    log::info!("Waiting for service IPC to be ready...");
    let mut ipc_ready = false;
    for i in 0..20 {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // 检查服务 IPC 是否就绪
        if let Ok(status) = WinServiceManager::get_status().await {
            if status.running {
                log::info!("Service IPC ready after {} attempts", i + 1);
                ipc_ready = true;
                break;
            }
        }
    }

    if !ipc_ready {
        log::error!("Service IPC not ready after 10 seconds");
        return Err("服务启动超时".to_string());
    }

    // 4. 通过服务启动 mihomo
    log::info!("Starting mihomo via service...");
    if let Err(e) = state.mihomo_manager.start().await {
        log::error!("Failed to start mihomo via service: {}", e);
        return Err(format!("通过服务启动 mihomo 失败: {}", e));
    }

    log::info!("Mihomo started via service successfully");

    // 5. 同步状态到前端
    sync_proxy_status(&app).await;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn start_service(_app: tauri::AppHandle) -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 停止服务
///
/// 停止服务后，mihomo 会以普通模式运行
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn stop_service(app: tauri::AppHandle) -> Result<(), String> {
    use crate::commands::reload::sync_proxy_status;
    use crate::system::WinServiceManager;

    let state = get_app_state();

    // 1. 检查 TUN 模式是否启用，如果启用需要先禁用
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    let tun_enabled = config.tun.as_ref().map(|t| t.enable).unwrap_or(false);

    if tun_enabled {
        log::info!("TUN mode is enabled, disabling TUN before stopping service...");

        if let Err(e) = state.config_manager.update_tun_mode(false) {
            log::error!("Failed to disable TUN mode: {}", e);
            return Err(format!("禁用 TUN 模式失败: {}", e));
        }

        {
            let mut enhanced_mode = state.enhanced_mode.lock().await;
            *enhanced_mode = false;
        }
    }

    // 2. 停止服务（这也会停止通过服务运行的 mihomo）
    log::info!("Stopping Windows service...");
    WinServiceManager::stop().map_err(|e| e.to_string())?;

    // 3. 等待服务完全停止
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    // 4. 重置 mihomo_manager 的内部状态
    log::info!("Resetting mihomo manager state...");
    {
        let mut service_mode = state.mihomo_manager.service_mode_flag().lock().await;
        *service_mode = false;
    }

    // 5. 清理可能的残留进程
    crate::mihomo::MihomoManager::cleanup_stale_processes();

    // 6. 以普通模式启动 mihomo
    log::info!("Starting mihomo in normal mode...");
    if let Err(e) = state.mihomo_manager.start().await {
        log::error!("Failed to start mihomo in normal mode: {}", e);
        sync_proxy_status(&app).await;
        return Err(format!("以普通模式启动 mihomo 失败: {}", e));
    }

    log::info!("Mihomo started in normal mode successfully");

    // 7. 同步状态到前端
    sync_proxy_status(&app).await;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn stop_service(_app: tauri::AppHandle) -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 重启服务
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn restart_service() -> Result<(), String> {
    crate::system::WinServiceManager::restart().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn restart_service() -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 检查是否有管理员权限
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn has_admin_privileges() -> bool {
    crate::system::WinServiceManager::has_admin_privileges()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn has_admin_privileges() -> bool {
    // 非 Windows 平台不需要服务模式
    false
}

/// 非 Windows 平台的 dummy 类型
#[cfg(not(target_os = "windows"))]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ServiceStatusDummy {
    pub installed: bool,
    pub running: bool,
    pub mihomo_running: bool,
    pub mihomo_pid: Option<u32>,
}
