use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::models::WebDavConfig;
use crate::webdav::{ConflictInfo, SyncManager, SyncResult, SyncState, WebDavClient};

/// 将 settings.json 中的 autoStart 应用到系统
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_autostart_to_system(app: &AppHandle, enabled: bool) {
    use tauri_plugin_autostart::ManagerExt;

    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };

    match result {
        Ok(_) => log::info!("Applied autostart setting from config: {}", enabled),
        Err(e) => log::warn!("Failed to apply autostart setting: {}", e),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn apply_autostart_to_system(_app: &AppHandle, _enabled: bool) {
    // 移动平台不支持开机自启动
}

/// 测试 WebDAV 连接
#[tauri::command]
pub async fn test_webdav_connection(config: WebDavConfig) -> Result<bool, String> {
    let client = WebDavClient::new(&config.url, &config.username, &config.password)
        .map_err(|e| e.to_string())?;

    client.test_connection().await.map_err(|e| e.to_string())
}

/// 获取 WebDAV 配置
#[tauri::command]
pub async fn get_webdav_config(state: State<'_, AppState>) -> Result<WebDavConfig, String> {
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    Ok(settings.webdav)
}

/// 保存 WebDAV 配置
#[tauri::command]
pub async fn save_webdav_config(
    state: State<'_, AppState>,
    config: WebDavConfig,
) -> Result<(), String> {
    let mut settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    settings.webdav = config;

    state
        .config_manager
        .save_app_settings(&settings)
        .map_err(|e| e.to_string())
}

/// 上传配置到 WebDAV
#[tauri::command]
pub async fn webdav_upload(state: State<'_, AppState>) -> Result<SyncResult, String> {
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    if !settings.webdav.enabled {
        return Err("WebDAV 同步未启用".to_string());
    }

    let sync_manager = SyncManager::new(settings.webdav);
    sync_manager.upload_all().await.map_err(|e| e.to_string())
}

/// 从 WebDAV 下载配置
///
/// 下载后只应用系统级设置（autostart），不自动重载 MiHomo。
/// 用户需要手动激活 profile 才会生成运行时配置。
#[tauri::command]
pub async fn webdav_download(
    app: AppHandle,
    state: State<'_, AppState>,
    force: bool,
) -> Result<SyncResult, String> {
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    if !settings.webdav.enabled {
        return Err("WebDAV 同步未启用".to_string());
    }

    let sync_manager = SyncManager::new(settings.webdav);
    let result = sync_manager
        .download_all(force)
        .await
        .map_err(|e| e.to_string())?;

    // 下载成功后，只应用系统级设置
    if result.success {
        // 重新加载 settings.json
        let new_settings = state
            .config_manager
            .load_app_settings()
            .map_err(|e| e.to_string())?;

        // 应用开机自启动到系统
        apply_autostart_to_system(&app, new_settings.auto_start);

        // 注意：不自动重载 MiHomo
        // 用户需要手动激活 profile 才会从 settings.json + profile 生成完整运行时配置
        log::info!("WebDAV download completed. User needs to activate a profile to apply changes.");
    }

    Ok(result)
}

/// 获取同步状态
#[tauri::command]
pub async fn get_sync_status() -> Result<SyncState, String> {
    SyncManager::get_sync_status().map_err(|e| e.to_string())
}

/// 检查是否有冲突
#[tauri::command]
pub async fn check_webdav_conflict(
    state: State<'_, AppState>,
) -> Result<Option<ConflictInfo>, String> {
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    if !settings.webdav.enabled {
        return Ok(None);
    }

    let sync_manager = SyncManager::new(settings.webdav);
    sync_manager
        .check_conflict()
        .await
        .map_err(|e| e.to_string())
}

/// 解决冲突
/// choice: "local" 保留本地，"remote" 使用远端
#[tauri::command]
pub async fn resolve_webdav_conflict(
    app: AppHandle,
    state: State<'_, AppState>,
    choice: String,
) -> Result<SyncResult, String> {
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    if !settings.webdav.enabled {
        return Err("WebDAV 同步未启用".to_string());
    }

    let sync_manager = SyncManager::new(settings.webdav);

    match choice.as_str() {
        "local" => {
            // 保留本地，强制上传覆盖远端
            sync_manager.upload_all().await.map_err(|e| e.to_string())
        }
        "remote" => {
            // 使用远端，强制下载覆盖本地
            let result = sync_manager
                .download_all(true)
                .await
                .map_err(|e| e.to_string())?;

            // 下载成功后，只应用系统级设置
            if result.success {
                let new_settings = state
                    .config_manager
                    .load_app_settings()
                    .map_err(|e| e.to_string())?;

                // 应用开机自启动到系统
                apply_autostart_to_system(&app, new_settings.auto_start);

                // 注意：不自动重载 MiHomo
                // 用户需要手动激活 profile 才会从 settings.json + profile 生成完整运行时配置
                log::info!("Conflict resolved with remote. User needs to activate a profile to apply changes.");
            }

            Ok(result)
        }
        _ => Err("无效的选择，请使用 'local' 或 'remote'".to_string()),
    }
}
