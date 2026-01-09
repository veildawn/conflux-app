use crate::commands::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SubStoreSub {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub icon: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubStoreCollection {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub subscriptions: Option<Vec<String>>,
}

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

#[tauri::command]
pub async fn get_substore_subs(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<SubStoreSub>, String> {
    let manager = state.substore_manager.lock().await;

    // 检查 Sub-Store 是否运行
    if !manager.is_running().await {
        return Err("Sub-Store 服务未运行".to_string());
    }

    // 读取 Sub-Store 数据文件
    let data_file = manager
        .get_data_file_path(&app_handle)
        .map_err(|e| format!("获取数据文件路径失败: {}", e))?;

    let content =
        std::fs::read_to_string(&data_file).map_err(|e| format!("读取数据文件失败: {}", e))?;

    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析数据文件失败: {}", e))?;

    let subs_array = data
        .get("subs")
        .and_then(|v| v.as_array())
        .ok_or("未找到 subs 数据")?;

    let mut subs = Vec::new();
    for sub in subs_array {
        if let Some(name) = sub.get("name").and_then(|v| v.as_str()) {
            subs.push(SubStoreSub {
                name: name.to_string(),
                display_name: sub
                    .get("displayName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                icon: sub
                    .get("icon")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                url: None,
            });
        }
    }

    Ok(subs)
}

#[tauri::command]
pub async fn get_substore_collections(
    state: State<'_, AppState>,
) -> Result<Vec<SubStoreCollection>, String> {
    let manager = state.substore_manager.lock().await;

    // 检查 Sub-Store 是否运行
    if !manager.is_running().await {
        return Err("Sub-Store 服务未运行".to_string());
    }

    let api_url = manager.api_url();

    // 调用 Sub-Store API 获取组合配置列表
    let url = format!("{}/api/collections", api_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求 Sub-Store API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Sub-Store API 返回错误: {}", response.status()));
    }

    let collections: Vec<SubStoreCollection> = response
        .json()
        .await
        .map_err(|e| format!("解析 Sub-Store 响应失败: {}", e))?;

    Ok(collections)
}
