use crate::commands::get_app_state_or_err;
use crate::system::NetworkExtensionManager;
use crate::system::NetworkExtensionStatus;
use crate::system::SystemProxy;
use crate::tray_menu::TrayMenuState;
use crate::utils;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// 设置系统代理
#[tauri::command]
pub async fn set_system_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    crate::commands::require_active_subscription_with_proxies()?;

    // 从 settings.json 获取端口配置（运行时 config.yaml 中端口为 0）
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    let port = settings.mihomo.port.unwrap_or(7890);
    let socks_port = settings.mihomo.socks_port.unwrap_or(7891);

    // 先通过 mihomo API 恢复端口监听
    state
        .mihomo_api
        .set_ports(port, socks_port)
        .await
        .map_err(|e| format!("Failed to enable mihomo ports: {}", e))?;

    // 设置 HTTP 代理
    SystemProxy::set_http_proxy("127.0.0.1", port).map_err(|e| e.to_string())?;

    // 设置 SOCKS 代理
    SystemProxy::set_socks_proxy("127.0.0.1", socks_port).map_err(|e| e.to_string())?;

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

    log::info!("System proxy enabled with ports {}:{}", port, socks_port);
    Ok(())
}

/// 清除系统代理
#[tauri::command]
pub async fn clear_system_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    // 清除系统代理设置
    SystemProxy::clear_proxy().map_err(|e| e.to_string())?;

    // 通过 mihomo API 禁用端口监听（设为 0）
    if let Err(e) = state.mihomo_api.set_ports(0, 0).await {
        log::warn!("Failed to disable mihomo ports: {}", e);
        // 不阻断流程，继续更新状态
    }

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

    log::info!("System proxy cleared and mihomo ports disabled");
    Ok(())
}

/// 获取系统代理状态
#[tauri::command]
pub async fn get_system_proxy_status() -> Result<bool, String> {
    let state = get_app_state_or_err()?;
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
    let state = get_app_state_or_err()?;
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

// -----------------------------------------------------------------------------
// macOS Network Extension (placeholder)
// -----------------------------------------------------------------------------

/// 获取 Network Extension 状态（占位实现，供前端做引导/分流）
#[tauri::command]
pub async fn get_network_extension_status() -> Result<NetworkExtensionStatus, String> {
    NetworkExtensionManager::status().map_err(|e| e.to_string())
}

/// 打开系统设置中的 Network Extension 授权面板（尽力而为）
#[tauri::command]
pub async fn open_network_extension_settings() -> Result<(), String> {
    NetworkExtensionManager::open_settings().map_err(|e| e.to_string())
}

// -----------------------------------------------------------------------------
// Network info (Home cards)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIpInfo {
    pub ip: String,
    /// 国家或地区编码（如 CN, US, TW, HK 等）
    pub region_code: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIpInfo {
    pub preferred_ipv4: Option<String>,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
}

/// 解析 ip-api.com 返回的 JSON
/// 响应格式: {"query":"x.x.x.x","status":"success","countryCode":"US",...}
fn parse_ip_api_response(v: &serde_json::Value) -> Option<(String, String)> {
    let ip = v.get("query")?.as_str()?.to_string();
    let cc = v.get("countryCode")?.as_str()?.to_string();
    Some((ip, cc))
}

/// 获取公网 IP 信息
///
/// 使用 ip-api.com 查询，它返回完整的 IP 和国家代码信息。
/// 当代理运行时，通过代理发起请求以获取代理后的出口 IP；
/// 否则直接请求获取本机公网 IP。
#[tauri::command]
pub async fn get_public_ip_info() -> Result<Option<PublicIpInfo>, String> {
    const API_URL: &str = "http://ip-api.com/json";

    // 检查代理是否运行，如果运行则通过代理获取出口 IP
    let proxy_url = if let Ok(state) = super::get_app_state_or_err() {
        if state.mihomo_manager.is_running().await {
            // 使用 HTTP 代理端口
            let config = state.config_manager.load_mihomo_config().ok();
            let port = config.and_then(|c| c.port).unwrap_or(7890);
            Some(format!("http://127.0.0.1:{}", port))
        } else {
            None
        }
    } else {
        None
    };

    let mut client_builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10));

    // 如果代理运行，通过代理请求
    if let Some(ref proxy_addr) = proxy_url {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_addr) {
            client_builder = client_builder.proxy(proxy);
        }
    }

    let client = client_builder.build().map_err(|e| e.to_string())?;

    let resp = client
        .get(API_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let Some((ip, cc)) = parse_ip_api_response(&json) else {
        return Ok(None);
    };

    if ip.is_empty() || cc.is_empty() {
        return Ok(None);
    }

    Ok(Some(PublicIpInfo {
        ip,
        region_code: cc,
        source: API_URL.to_string(),
    }))
}

fn is_private_ipv4(ip: std::net::Ipv4Addr) -> bool {
    ip.is_private()
        && !ip.is_loopback()
        && !ip.is_link_local()
        && !ip.is_unspecified()
        && !ip.is_multicast()
}

/// 获取本机局域网 IP（枚举网卡地址）
#[tauri::command]
pub async fn get_local_ip_info() -> Result<LocalIpInfo, String> {
    use get_if_addrs::{get_if_addrs, IfAddr};

    let ifaces = get_if_addrs().map_err(|e| e.to_string())?;

    let mut ipv4: Vec<String> = Vec::new();
    let mut ipv6: Vec<String> = Vec::new();

    for iface in ifaces {
        match iface.addr {
            IfAddr::V4(v4) => {
                let ip = v4.ip;
                if ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_unspecified()
                    || ip.is_multicast()
                {
                    continue;
                }
                ipv4.push(ip.to_string());
            }
            IfAddr::V6(v6) => {
                let ip = v6.ip;
                // 过滤 ::1 / link-local / unspecified / multicast
                if ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_multicast()
                    || ip.is_unicast_link_local()
                {
                    continue;
                }
                ipv6.push(ip.to_string());
            }
        }
    }

    // 去重并排序，保证稳定输出
    ipv4.sort();
    ipv4.dedup();
    ipv6.sort();
    ipv6.dedup();

    let preferred_ipv4 = ipv4
        .iter()
        .find_map(|s| {
            s.parse::<std::net::Ipv4Addr>()
                .ok()
                .filter(|ip| is_private_ipv4(*ip))
                .map(|_| s.clone())
        })
        .or_else(|| ipv4.first().cloned());

    Ok(LocalIpInfo {
        preferred_ipv4,
        ipv4,
        ipv6,
    })
}

/// 获取终端代理命令（用于复制到剪贴板）
#[tauri::command]
pub async fn get_terminal_proxy_command() -> Result<String, String> {
    let state = get_app_state_or_err()?;
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    Ok(utils::build_terminal_proxy_command_with_ports(
        config.port.unwrap_or(7890),
        config.socks_port.unwrap_or(7891),
    ))
}

/// 复制文本到系统剪贴板（用于前端复制：避免 WebView clipboard 权限限制）
#[tauri::command]
pub async fn copy_to_clipboard(text: String) -> Result<(), String> {
    utils::copy_to_clipboard(&text)
}

/// 复制终端代理命令到系统剪贴板（复用菜单栏逻辑）
#[tauri::command]
pub async fn copy_terminal_proxy_command() -> Result<String, String> {
    let state = get_app_state_or_err()?;
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let command = utils::build_terminal_proxy_command_with_ports(
        config.port.unwrap_or(7890),
        config.socks_port.unwrap_or(7891),
    );
    utils::copy_to_clipboard(&command)?;
    Ok(command)
}

// -----------------------------------------------------------------------------
// Process icon (Connections / Requests)
// -----------------------------------------------------------------------------

/// 根据连接元数据中的进程信息获取应用图标（PNG data URL）。
/// - 优先使用 `processPath`（更准确）
/// - 兜底使用 `process`（best-effort）
#[tauri::command]
pub async fn get_process_icon(
    process_name: Option<String>,
    process_path: Option<String>,
) -> Result<Option<String>, String> {
    crate::system::get_process_icon_data_url(process_name, process_path).await
}

/// 检查当前应用是否以管理员权限运行
#[tauri::command]
pub fn is_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        crate::system::WinServiceManager::has_admin_privileges()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 以管理员权限重启应用 (Windows)
///
/// 这会触发 UAC 对话框，如果用户确认，应用将以管理员权限重新启动
#[tauri::command]
pub async fn restart_as_admin(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 获取当前可执行文件路径
        let exe_path =
            std::env::current_exe().map_err(|e| format!("无法获取当前程序路径: {}", e))?;

        log::info!("Restarting app as admin: {:?}", exe_path);

        // 使用 PowerShell Start-Process -Verb RunAs 触发 UAC
        // -WindowStyle Hidden 防止弹出 CMD 窗口
        let ps_command = format!(
            "$ErrorActionPreference = 'Stop'; \
            try {{ \
                Start-Process -FilePath '{}' -Verb RunAs -WindowStyle Hidden; \
            }} catch {{ \
                Write-Error $_.Exception.Message; \
                exit 1; \
            }}",
            exe_path.display()
        );

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &ps_command,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("执行提权命令失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("Failed to restart as admin: {}", stderr);

            // 检查是否是用户取消
            if stderr.contains("canceled")
                || stderr.contains("cancelled")
                || stderr.contains("拒绝")
                || stderr.contains("denied")
                || stderr.contains("The operation was canceled")
            {
                return Err("用户取消了管理员权限请求".to_string());
            }

            return Err(format!("以管理员权限重启失败: {}", stderr.trim()));
        }

        log::info!("New admin instance started, exiting current instance...");

        // 退出当前应用
        app.exit(0);

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("此功能仅支持 Windows".to_string())
    }
}

/// 直接删除数据目录和配置目录
#[cfg(not(target_os = "macos"))]
fn remove_directories_directly(data_dir: &std::path::Path, config_dir: &std::path::Path) {
    log::info!("Removing data directory: {:?}", data_dir);
    if data_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(data_dir) {
            log::warn!("Failed to remove data directory: {}", e);
        }
    }

    // 删除配置目录（如果与数据目录不同，Linux 上可能不同）
    if config_dir != data_dir && config_dir.exists() {
        log::info!("Removing config directory: {:?}", config_dir);
        if let Err(e) = std::fs::remove_dir_all(config_dir) {
            log::warn!("Failed to remove config directory: {}", e);
        }
    }
}

/// 重置所有用户数据并重启应用
///
/// 此操作将：
/// 1. 停止代理服务
/// 2. 清除系统代理设置
/// 3. 删除所有用户配置和数据
/// 4. 重启应用
#[tauri::command]
pub async fn reset_all_data(app: AppHandle) -> Result<(), String> {
    log::info!("Starting reset all data...");

    // 1. 停止 mihomo
    if let Ok(state) = get_app_state_or_err() {
        // 清除系统代理
        log::info!("Clearing system proxy...");
        if let Ok(enabled) = state.system_proxy_enabled.try_lock() {
            if *enabled {
                let _ = SystemProxy::clear_proxy();
            }
        } else {
            let _ = SystemProxy::clear_proxy();
        }

        // 停止 Sub-Store
        log::info!("Stopping Sub-Store...");
        if let Ok(manager) = state.substore_manager.try_lock() {
            manager.stop_sync();
        }

        // 停止 MiHomo
        log::info!("Stopping MiHomo...");
        state.mihomo_manager.stop_sync();
    }

    // 额外等待，确保所有进程完全退出并释放文件句柄
    log::info!("Waiting for all processes to fully exit...");
    std::thread::sleep(std::time::Duration::from_millis(500));

    // 2. 删除数据目录（mihomo 等二进制文件会在下次启动时自动复制）
    let data_dir = utils::get_app_data_dir().map_err(|e| format!("获取数据目录失败: {}", e))?;
    let config_dir = utils::get_app_config_dir().map_err(|e| format!("获取配置目录失败: {}", e))?;

    // macOS: 使用 helper 删除数据（需要 root 权限来删除 TUN 模式创建的文件）
    #[cfg(target_os = "macos")]
    {
        let helper_path = utils::ensure_helper_in_data_dir()
            .map_err(|e| format!("获取 helper 路径失败: {}", e))?;

        // 检查 helper 是否有 setuid root 权限
        let has_setuid = utils::is_setuid_root(&helper_path).unwrap_or(false);

        if has_setuid {
            // 直接运行 helper stop 和 reset
            log::info!("Using helper with setuid to stop mihomo and remove data directories");

            // 先停止 mihomo（以 root 权限）
            let stop_output = std::process::Command::new(&helper_path)
                .arg("stop")
                .output();
            if let Ok(out) = stop_output {
                if !out.status.success() {
                    log::warn!(
                        "Helper stop returned error: {}",
                        String::from_utf8_lossy(&out.stderr)
                    );
                }
            }

            // 等待进程完全停止
            std::thread::sleep(std::time::Duration::from_millis(500));

            // 构建 reset 命令参数
            let mut helper_args = vec!["reset".to_string(), data_dir.to_string_lossy().to_string()];
            if config_dir != data_dir {
                helper_args.push(config_dir.to_string_lossy().to_string());
            }

            let output = std::process::Command::new(&helper_path)
                .args(&helper_args)
                .output()
                .map_err(|e| format!("运行 helper 失败: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::warn!("Helper reset returned error: {}", stderr);
            }
        } else {
            // 通过 osascript 请求管理员权限运行 helper stop 和 reset
            log::info!("Helper not setuid, requesting admin privileges via osascript");

            // 为路径添加单引号以处理空格（单引号在 shell 中最安全）
            let quote_path = |p: &std::path::Path| -> String {
                format!("'{}'", p.to_string_lossy().replace("'", "'\\''"))
            };

            let helper_quoted = quote_path(&helper_path);
            let data_dir_quoted = quote_path(&data_dir);

            // 组合 stop 和 reset 命令，一次性请求管理员权限
            let helper_cmd = if config_dir != data_dir {
                let config_dir_quoted = quote_path(&config_dir);
                format!(
                    "{helper} stop; sleep 0.5; {helper} reset {data_dir} {config_dir}",
                    helper = helper_quoted,
                    data_dir = data_dir_quoted,
                    config_dir = config_dir_quoted
                )
            } else {
                format!(
                    "{helper} stop; sleep 0.5; {helper} reset {data_dir}",
                    helper = helper_quoted,
                    data_dir = data_dir_quoted
                )
            };

            let script = format!(
                "do shell script \"{}\" with administrator privileges",
                helper_cmd.replace("\"", "\\\"")
            );

            let output = std::process::Command::new("osascript")
                .args(["-e", &script])
                .output()
                .map_err(|e| format!("请求管理员权限失败: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stderr.contains("User canceled") || stderr.contains("-128") {
                    return Err("用户取消了管理员权限请求".to_string());
                }
                log::warn!("osascript reset returned error: {}", stderr);
            }
        }
        log::info!("Reset data directories completed");
    }

    // 非 macOS: 直接删除
    #[cfg(not(target_os = "macos"))]
    {
        remove_directories_directly(&data_dir, &config_dir);
    }

    log::info!("Reset completed, restarting app...");

    // 4. 检测是否在开发模式（通过检查是否在 target/debug 目录下运行）
    let exe_path = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {}", e))?;
    let is_dev_mode = exe_path.to_string_lossy().contains("target/debug");

    if is_dev_mode {
        log::info!("Development mode detected, exiting without restart (please restart manually)");
    } else {
        // 生产模式：启动新实例
        log::info!("Starting new instance: {:?}", exe_path);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            const DETACHED_PROCESS: u32 = 0x00000008;

            if let Err(e) = std::process::Command::new(&exe_path)
                .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
                .spawn()
            {
                log::error!("Failed to start new instance: {}", e);
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Err(e) = std::process::Command::new(&exe_path).spawn() {
                log::error!("Failed to start new instance: {}", e);
            }
        }

        log::info!("New instance started");
    }

    // 5. 退出当前应用
    log::info!("Exiting current instance...");
    app.exit(0);

    Ok(())
}

/// 让 Rust Analyzer / IDE 能追踪到通过 `tauri::generate_handler!` 注册的命令引用，
/// 避免出现误报的 dead_code 警告（命令实际会在运行时被 Tauri 调用）。
pub fn link_tauri_commands_for_ide() {
    let _ = get_process_icon;
    let _ = is_admin;
    let _ = restart_as_admin;
    let _ = reset_all_data;
}
