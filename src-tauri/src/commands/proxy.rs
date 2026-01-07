use crate::commands::get_app_state;
use crate::models::{
    ConnectionsResponse, ProxyGroup, ProxyStatus, RuleItem, TrafficData, VersionInfo,
};
use crate::tray_menu::TrayMenuState;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// 启动代理
#[tauri::command]
pub async fn start_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state();

    state
        .mihomo_manager
        .start()
        .await
        .map_err(|e| e.to_string())?;

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("Proxy started successfully");
    Ok(())
}

/// 停止代理
#[tauri::command]
pub async fn stop_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state();

    // 如果系统代理已启用，先清除
    let mut system_proxy = state.system_proxy_enabled.lock().await;
    if *system_proxy {
        crate::system::SystemProxy::clear_proxy().map_err(|e| e.to_string())?;
        *system_proxy = false;
    }
    drop(system_proxy);

    // 如果增强模式已启用，重置状态
    let mut enhanced_mode = state.enhanced_mode.lock().await;
    *enhanced_mode = false;
    drop(enhanced_mode);

    state
        .mihomo_manager
        .stop()
        .await
        .map_err(|e| e.to_string())?;

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("Proxy stopped successfully");
    Ok(())
}

/// 重启代理
#[tauri::command]
pub async fn restart_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state();

    state
        .mihomo_manager
        .restart()
        .await
        .map_err(|e| e.to_string())?;

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("Proxy restarted successfully");
    Ok(())
}

/// 获取代理状态
#[tauri::command]
pub async fn get_proxy_status() -> Result<ProxyStatus, String> {
    let state = get_app_state();

    let running = state.mihomo_manager.is_running().await;
    let system_proxy = *state.system_proxy_enabled.lock().await;

    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let mut enhanced_mode = *state.enhanced_mode.lock().await;
    if running {
        if let Some(tun) = config.tun.as_ref() {
            enhanced_mode = tun.enable;
            let mut enhanced_mode_state = state.enhanced_mode.lock().await;
            *enhanced_mode_state = enhanced_mode;
        }
    }

    Ok(ProxyStatus {
        running,
        mode: config.mode,
        port: config.port,
        socks_port: config.socks_port,
        mixed_port: config.mixed_port,
        system_proxy,
        enhanced_mode,
        allow_lan: config.allow_lan,
        ipv6: config.ipv6,
        tcp_concurrent: config.tcp_concurrent,
    })
}

/// 设置 LAN 访问开关
#[tauri::command]
pub async fn set_allow_lan(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = get_app_state();

    state
        .config_manager
        .update_allow_lan(enabled)
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    Ok(())
}

/// 设置 HTTP/SOCKS 端口
#[tauri::command]
pub async fn set_ports(app: AppHandle, port: u16, socks_port: u16) -> Result<(), String> {
    let state = get_app_state();

    state
        .config_manager
        .update_ports(port, socks_port)
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    Ok(())
}

/// 设置 IPv6 开关
#[tauri::command]
pub async fn set_ipv6(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = get_app_state();

    state
        .config_manager
        .update_ipv6(enabled)
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    Ok(())
}

/// 设置 TCP 并发开关
#[tauri::command]
pub async fn set_tcp_concurrent(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = get_app_state();

    state
        .config_manager
        .update_tcp_concurrent(enabled)
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    Ok(())
}

/// 切换代理模式
#[tauri::command]
pub async fn switch_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let state = get_app_state();

    // 验证模式
    let valid_modes = ["rule", "global", "direct"];
    if !valid_modes.contains(&mode.as_str()) {
        return Err(format!("Invalid mode: {}", mode));
    }

    // 如果 MiHomo 正在运行，通过 API 切换模式
    if state.mihomo_manager.is_running().await {
        state
            .mihomo_api
            .patch_configs(&mode)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 保存到配置文件
    state
        .config_manager
        .update_mode(&mode)
        .map_err(|e| e.to_string())?;

    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("Proxy mode switched to: {}", mode);
    Ok(())
}

/// 获取代理节点列表
///
/// 根据模式参数过滤返回的策略组：
/// - `global`: 只返回 GLOBAL 策略组
/// - `rule`: 返回除 GLOBAL 外的所有策略组
/// - `direct`: 返回空数组
/// - 不传或其他值: 返回所有策略组
#[tauri::command]
pub async fn get_proxies(mode: Option<String>) -> Result<Vec<ProxyGroup>, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    // 直连模式不需要返回策略组
    if mode.as_deref() == Some("direct") {
        return Ok(vec![]);
    }

    let response = state
        .mihomo_api
        .get_proxies()
        .await
        .map_err(|e| e.to_string())?;

    // 转换为前端需要的格式
    let mut groups: Vec<ProxyGroup> = Vec::new();

    for (name, info) in &response.proxies {
        // 只返回代理组（select, url-test, fallback, load-balance）
        let group_types = ["Selector", "URLTest", "Fallback", "LoadBalance"];
        if group_types.contains(&info.proxy_type.as_str()) {
            // 根据模式过滤
            let should_include = match mode.as_deref() {
                Some("global") => name == "GLOBAL",
                Some("rule") => name != "GLOBAL",
                _ => true, // 不传模式则返回全部
            };

            if should_include {
                groups.push(ProxyGroup {
                    name: name.clone(),
                    group_type: info.proxy_type.clone(),
                    now: info.now.clone(),
                    all: info.all.clone(),
                });
            }
        }
    }

    // 按名称排序，GLOBAL 放在最前面
    groups.sort_by(|a, b| {
        if a.name == "GLOBAL" {
            std::cmp::Ordering::Less
        } else if b.name == "GLOBAL" {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(groups)
}

/// 选择代理节点
#[tauri::command]
pub async fn select_proxy(group: String, name: String) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .select_proxy(&group, &name)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Selected proxy {} in group {}", name, group);
    Ok(())
}

/// 测试代理延迟
#[tauri::command]
pub async fn test_proxy_delay(name: String) -> Result<u32, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let response = state
        .mihomo_api
        .test_delay(&name, 5000, "http://www.gstatic.com/generate_204")
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.delay)
}

/// 获取流量数据
#[tauri::command]
pub async fn get_traffic() -> Result<TrafficData, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Ok(TrafficData::default());
    }

    let traffic = state
        .mihomo_api
        .get_traffic()
        .await
        .map_err(|e| e.to_string())?;

    Ok(traffic)
}

/// 获取连接列表
#[tauri::command]
pub async fn get_connections() -> Result<ConnectionsResponse, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Ok(ConnectionsResponse {
            connections: vec![],
            download_total: 0,
            upload_total: 0,
        });
    }

    let connections = state
        .mihomo_api
        .get_connections()
        .await
        .map_err(|e| e.to_string())?;

    // Debug log for connections
    if !connections.connections.is_empty() {
        if let Some(first) = connections.connections.first() {
            log::info!("First connection metadata: {:?}", first.metadata);
        }
    } else {
        log::info!("No connections found");
    }

    Ok(connections)
}

/// 关闭单个连接
#[tauri::command]
pub async fn close_connection(id: String) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .close_connection(&id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 关闭所有连接
#[tauri::command]
pub async fn close_all_connections() -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .close_all_connections()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 设置 TUN 模式（增强模式）
#[tauri::command]
pub async fn set_tun_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let mut needs_restart = false;
    if enabled {
        crate::commands::require_active_subscription_with_proxies()?;
    }

    // 如果要启用 TUN 模式，先检查权限
    if enabled {
        let has_permission = crate::system::TunPermission::check_permission()
            .map_err(|e| e.to_string())?;

        if !has_permission {
            log::info!("TUN permission not set, requesting setup...");
            crate::system::TunPermission::setup_permission()
                .map_err(|e| format!("设置 TUN 权限失败: {}", e))?;

            needs_restart = true;
        }
    }

    state
        .config_manager
        .update_tun_mode(enabled)
        .map_err(|e| e.to_string())?;

    if needs_restart {
        // 权限设置成功后，需要重启 mihomo 进程以应用 TUN 配置
        log::info!("Permission setup complete, restarting MiHomo...");
        state
            .mihomo_manager
            .restart()
            .await
            .map_err(|e| format!("重启代理失败: {}", e))?;
    } else {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 更新状态（注意：必须在调用 get_proxy_status 之前释放锁，否则会死锁）
    {
        let mut enhanced_mode = state.enhanced_mode.lock().await;
        *enhanced_mode = enabled;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    log::info!("TUN mode set to: {}", enabled);
    Ok(())
}

/// 检查 TUN 权限状态
#[tauri::command]
pub async fn check_tun_permission() -> Result<bool, String> {
    crate::system::TunPermission::check_permission().map_err(|e| e.to_string())
}

/// 手动设置 TUN 权限
#[tauri::command]
pub async fn setup_tun_permission() -> Result<(), String> {
    crate::system::TunPermission::setup_permission().map_err(|e| e.to_string())
}

/// 从 API 获取运行时规则
#[tauri::command]
pub async fn get_rules_from_api() -> Result<Vec<RuleItem>, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let response = state
        .mihomo_api
        .get_rules()
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.rules)
}

/// 获取核心版本信息
#[tauri::command]
pub async fn get_core_version() -> Result<VersionInfo, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let version = state
        .mihomo_api
        .get_version()
        .await
        .map_err(|e| e.to_string())?;

    Ok(version)
}

// ============= Provider 命令 =============

/// 代理 Provider 返回给前端的结构
#[derive(Debug, Clone, Serialize)]
pub struct ProxyProviderFrontend {
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    #[serde(rename = "vehicleType")]
    pub vehicle_type: String,
    pub proxies: Vec<ProxyProviderProxyFrontend>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "subscriptionInfo")]
    pub subscription_info: Option<SubscriptionInfoFrontend>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProxyProviderProxyFrontend {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub udp: bool,
    pub now: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionInfoFrontend {
    #[serde(rename = "Upload")]
    pub upload: Option<u64>,
    #[serde(rename = "Download")]
    pub download: Option<u64>,
    #[serde(rename = "Total")]
    pub total: Option<u64>,
    #[serde(rename = "Expire")]
    pub expire: Option<u64>,
}

/// 规则 Provider 返回给前端的结构
#[derive(Debug, Clone, Serialize)]
pub struct RuleProviderFrontend {
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub behavior: String,
    #[serde(rename = "ruleCount")]
    pub rule_count: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "vehicleType")]
    pub vehicle_type: String,
}

/// 获取代理 Provider 列表
#[tauri::command]
pub async fn get_proxy_providers() -> Result<Vec<ProxyProviderFrontend>, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let response = state
        .mihomo_api
        .get_proxy_providers()
        .await
        .map_err(|e| e.to_string())?;

    let mut providers: Vec<ProxyProviderFrontend> = response
        .providers
        .into_iter()
        .filter(|(_, info)| info.vehicle_type != "Compatible")
        .map(|(_, info)| ProxyProviderFrontend {
            name: info.name,
            provider_type: info.provider_type,
            vehicle_type: info.vehicle_type,
            proxies: info
                .proxies
                .into_iter()
                .map(|p| ProxyProviderProxyFrontend {
                    name: p.name,
                    proxy_type: p.proxy_type,
                    udp: p.udp,
                    now: p.now,
                })
                .collect(),
            updated_at: info.updated_at,
            subscription_info: info.subscription_info.map(|s| SubscriptionInfoFrontend {
                upload: s.upload,
                download: s.download,
                total: s.total,
                expire: s.expire,
            }),
        })
        .collect();

    providers.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(providers)
}

/// 更新代理 Provider
#[tauri::command]
pub async fn update_proxy_provider(name: String) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .update_proxy_provider(&name)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Updated proxy provider: {}", name);
    Ok(())
}

/// 代理 Provider 健康检查
#[tauri::command]
pub async fn health_check_proxy_provider(name: String) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .health_check_proxy_provider(&name)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Health checked proxy provider: {}", name);
    Ok(())
}

/// 获取规则 Provider 列表
#[tauri::command]
pub async fn get_rule_providers() -> Result<Vec<RuleProviderFrontend>, String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    let response = state
        .mihomo_api
        .get_rule_providers()
        .await
        .map_err(|e| e.to_string())?;

    let mut providers: Vec<RuleProviderFrontend> = response
        .providers
        .into_iter()
        .map(|(_, info)| RuleProviderFrontend {
            name: info.name,
            provider_type: info.provider_type,
            behavior: info.behavior,
            rule_count: info.rule_count,
            updated_at: info.updated_at,
            vehicle_type: info.vehicle_type,
        })
        .collect();

    providers.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(providers)
}

/// 更新规则 Provider
#[tauri::command]
pub async fn update_rule_provider(name: String) -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .update_rule_provider(&name)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Updated rule provider: {}", name);
    Ok(())
}

// ============= 设置命令 =============

/// 设置混合端口
#[tauri::command]
pub async fn set_mixed_port(app: AppHandle, port: Option<u16>) -> Result<(), String> {
    let state = get_app_state();

    state
        .config_manager
        .update_mixed_port(port)
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    // 同步状态到托盘菜单和前端
    if let Ok(status) = get_proxy_status().await {
        app.state::<TrayMenuState>().sync_from_status(&status);
        let _ = app.emit("proxy-status-changed", status);
    }

    Ok(())
}

/// 设置进程查找模式
#[tauri::command]
pub async fn set_find_process_mode(_app: AppHandle, mode: String) -> Result<(), String> {
    let state = get_app_state();

    // 验证模式
    let valid_modes = ["always", "strict", "off"];
    if !valid_modes.contains(&mode.as_str()) {
        return Err(format!("Invalid find-process-mode: {}", mode));
    }

    state
        .config_manager
        .update_find_process_mode(mode.clone())
        .map_err(|e| e.to_string())?;

    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    log::info!("Find process mode set to: {}", mode);
    Ok(())
}

/// 获取应用版本
#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

/// 清除 FakeIP 缓存
#[tauri::command]
pub async fn flush_fakeip_cache() -> Result<(), String> {
    let state = get_app_state();

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    state
        .mihomo_api
        .flush_fakeip()
        .await
        .map_err(|e| e.to_string())?;

    log::info!("FakeIP cache flushed");
    Ok(())
}
