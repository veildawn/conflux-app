use crate::commands::get_app_state;
use crate::system::SystemProxy;
use crate::tray_menu::TrayMenuState;
use tauri::{AppHandle, Emitter, Manager};

/// 设置系统代理
#[tauri::command]
pub async fn set_system_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state();

    crate::commands::require_active_subscription_with_proxies()?;

    // 获取代理端口
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 设置 HTTP 代理
    SystemProxy::set_http_proxy("127.0.0.1", config.port).map_err(|e| e.to_string())?;

    // 设置 SOCKS 代理
    SystemProxy::set_socks_proxy("127.0.0.1", config.socks_port).map_err(|e| e.to_string())?;

    // 更新状态（注意：必须在调用 get_proxy_status 之前释放锁，否则会死锁）
    {
        let mut system_proxy = state.system_proxy_enabled.lock().await;
        *system_proxy = true;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = crate::commands::proxy::get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("System proxy enabled");
    Ok(())
}

/// 清除系统代理
#[tauri::command]
pub async fn clear_system_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state();

    SystemProxy::clear_proxy().map_err(|e| e.to_string())?;

    // 更新状态（注意：必须在调用 get_proxy_status 之前释放锁，否则会死锁）
    {
        let mut system_proxy = state.system_proxy_enabled.lock().await;
        *system_proxy = false;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = crate::commands::proxy::get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("System proxy cleared");
    Ok(())
}

/// 获取系统代理状态
#[tauri::command]
pub async fn get_system_proxy_status() -> Result<bool, String> {
    let state = get_app_state();
    let enabled = *state.system_proxy_enabled.lock().await;
    Ok(enabled)
}

/// 获取开机自启动状态
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// 设置开机自启动
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    // 1. 设置系统自启动
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }

    // 2. 同步保存到 settings.json
    let state = get_app_state();
    let mut settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;
    settings.auto_start = enabled;
    state
        .config_manager
        .save_app_settings(&settings)
        .map_err(|e| e.to_string())?;

    log::info!("Autostart set to: {}", enabled);
    Ok(())
}
