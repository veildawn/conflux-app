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

    // 获取代理端口
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 设置 HTTP 代理
    SystemProxy::set_http_proxy("127.0.0.1", config.port.unwrap_or(7890))
        .map_err(|e| e.to_string())?;

    // 设置 SOCKS 代理
    SystemProxy::set_socks_proxy("127.0.0.1", config.socks_port.unwrap_or(7891))
        .map_err(|e| e.to_string())?;

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
    let state = get_app_state_or_err()?;

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
    pub country_code: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIpInfo {
    pub preferred_ipv4: Option<String>,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
}

fn parse_public_ip_from_json(source: &str, v: &serde_json::Value) -> Option<(String, String)> {
    match source {
        "https://ipwho.is" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            let cc = v.get("country_code")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "https://api.myip.com" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            // myip.com: cc 为两位国家代码
            let cc = v.get("cc")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "https://ipapi.co/json" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            let cc = v.get("country_code")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "https://ident.me/json" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            let cc = v.get("cc")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "http://ip-api.com/json" => {
            let ip = v.get("query")?.as_str()?.to_string();
            let cc = v.get("countryCode")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "https://api.ip.sb/geoip" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            let cc = v.get("country_code")?.as_str()?.to_string();
            Some((ip, cc))
        }
        "https://ipinfo.io/json" => {
            let ip = v.get("ip")?.as_str()?.to_string();
            // ipinfo.io: country 为两位国家代码
            let cc = v.get("country")?.as_str()?.to_string();
            Some((ip, cc))
        }
        _ => None,
    }
}

/// 获取公网 IP 信息（并发请求多个源，返回最快成功结果）
#[tauri::command]
pub async fn get_public_ip_info() -> Result<Option<PublicIpInfo>, String> {
    use reqwest::header;

    let sources: [&str; 7] = [
        "https://ipwho.is",
        "https://api.myip.com",
        "https://ipapi.co/json",
        "https://ident.me/json",
        "http://ip-api.com/json",
        "https://api.ip.sb/geoip",
        "https://ipinfo.io/json",
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .default_headers({
            let mut headers = header::HeaderMap::new();
            // 伪装成普通浏览器 UA，减少部分接口拒绝概率
            headers.insert(
                header::USER_AGENT,
                header::HeaderValue::from_static(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                ),
            );
            headers
        })
        .build()
        .map_err(|e| e.to_string())?;

    // 用 JoinSet 并发执行；一旦拿到第一个成功结果，立刻 abort 其他请求
    let mut set = tokio::task::JoinSet::new();
    for &source in &sources {
        let client = client.clone();
        set.spawn(async move {
            let resp = client.get(source).send().await.ok()?;
            if !resp.status().is_success() {
                return None;
            }
            let json: serde_json::Value = resp.json().await.ok()?;
            let (ip, cc) = parse_public_ip_from_json(source, &json)?;
            if ip.is_empty() || cc.is_empty() {
                return None;
            }
            Some(PublicIpInfo {
                ip,
                country_code: cc,
                source: source.to_string(),
            })
        });
    }

    while let Some(join_res) = set.join_next().await {
        match join_res {
            Ok(Some(info)) => {
                set.abort_all();
                return Ok(Some(info));
            }
            Ok(None) => {}
            Err(_) => {}
        }
    }

    Ok(None)
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
