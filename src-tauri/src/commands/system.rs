use crate::commands::get_app_state;
use crate::system::SystemProxy;

/// 设置系统代理
#[tauri::command]
pub async fn set_system_proxy() -> Result<(), String> {
    let state = get_app_state();

    // 获取代理端口
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 设置 HTTP 代理
    SystemProxy::set_http_proxy("127.0.0.1", config.port).map_err(|e| e.to_string())?;

    // 设置 SOCKS 代理
    SystemProxy::set_socks_proxy("127.0.0.1", config.socks_port).map_err(|e| e.to_string())?;

    // 更新状态
    let mut system_proxy = state.system_proxy_enabled.lock().await;
    *system_proxy = true;

    log::info!("System proxy enabled");
    Ok(())
}

/// 清除系统代理
#[tauri::command]
pub async fn clear_system_proxy() -> Result<(), String> {
    let state = get_app_state();

    SystemProxy::clear_proxy().map_err(|e| e.to_string())?;

    // 更新状态
    let mut system_proxy = state.system_proxy_enabled.lock().await;
    *system_proxy = false;

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
