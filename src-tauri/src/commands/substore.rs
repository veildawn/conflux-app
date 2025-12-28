use tauri::{AppHandle, State};
use crate::commands::AppState;

#[tauri::command]
pub async fn start_substore(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .substore_manager
        .lock()
        .await
        .start(app_handle)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_substore(state: State<'_, AppState>) -> Result<(), String> {
    state
        .substore_manager
        .lock()
        .await
        .stop()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_substore_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let manager = state.substore_manager.lock().await;
    let running = manager.is_running().await;
    let api_url = manager.api_url().to_string();
    let api_port = manager.api_port();

    Ok(serde_json::json!({
        "running": running,
        "api_url": api_url,
        "api_port": api_port
    }))
}
