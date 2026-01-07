//! Windows 服务控制命令
//!
//! 仅在 Windows 平台上可用

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
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn uninstall_service() -> Result<(), String> {
    use crate::system::WinServiceManager;

    // 检查是否已安装
    if !WinServiceManager::is_installed().map_err(|e| e.to_string())? {
        return Err("服务未安装".to_string());
    }

    // 使用提权方式卸载（会触发 UAC）
    WinServiceManager::uninstall().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn uninstall_service() -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 启动服务
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    crate::system::WinServiceManager::start().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    Err("服务模式仅支持 Windows".to_string())
}

/// 停止服务
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn stop_service() -> Result<(), String> {
    crate::system::WinServiceManager::stop().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn stop_service() -> Result<(), String> {
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


