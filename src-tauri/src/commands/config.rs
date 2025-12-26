use crate::commands::get_app_state;
use crate::models::{AppSettings, MihomoConfig};

/// 获取 MiHomo 配置
#[tauri::command]
pub async fn get_config() -> Result<MihomoConfig, String> {
    let state = get_app_state();
    
    state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())
}

/// 保存 MiHomo 配置
#[tauri::command]
pub async fn save_config(config: MihomoConfig) -> Result<(), String> {
    let state = get_app_state();
    
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
    
    // 如果 MiHomo 正在运行，重新加载配置
    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }
    
    log::info!("Config saved and reloaded");
    Ok(())
}

/// 获取应用设置
#[tauri::command]
pub async fn get_app_settings() -> Result<AppSettings, String> {
    let state = get_app_state();
    
    state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())
}

/// 保存应用设置
#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    let state = get_app_state();
    
    state
        .config_manager
        .save_app_settings(&settings)
        .map_err(|e| e.to_string())?;
    
    log::info!("App settings saved");
    Ok(())
}




