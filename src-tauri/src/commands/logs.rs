use tauri::AppHandle;

use super::get_app_state;
use crate::mihomo::LogLevel;

/// 开始日志流
#[tauri::command]
pub async fn start_log_stream(app: AppHandle, level: String) -> Result<(), String> {
    let state = get_app_state();
    let log_level = LogLevel::from(level.as_str());

    state
        .log_streamer
        .start(app, log_level)
        .await
        .map_err(|e| e.to_string())
}

/// 停止日志流
#[tauri::command]
pub async fn stop_log_stream() -> Result<(), String> {
    let state = get_app_state();
    state.log_streamer.stop();
    Ok(())
}

/// 设置日志级别
#[tauri::command]
pub async fn set_log_level(level: String) -> Result<(), String> {
    let state = get_app_state();
    let log_level = LogLevel::from(level.as_str());
    state.log_streamer.set_level(log_level).await;
    Ok(())
}
