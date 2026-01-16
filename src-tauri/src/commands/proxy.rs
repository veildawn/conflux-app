use crate::commands::get_app_state_or_err;
use crate::models::{
    ConnectionsResponse, ProxyGroup, ProxyStatus, RuleItem, TrafficData, VersionInfo,
};
use crate::tray_menu::TrayMenuState;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// 检查 TUN 配置是否一致
#[tauri::command]
pub async fn check_tun_consistency() -> Result<serde_json::Value, String> {
    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }

    // 获取配置文件中的配置
    let file_config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 获取运行时配置
    let runtime_config = state
        .mihomo_api
        .get_configs()
        .await
        .map_err(|e| e.to_string())?;

    // 比较 TUN 配置
    let file_tun = file_config.tun.clone();
    let runtime_tun = runtime_config.get("tun").cloned();

    Ok(serde_json::json!({
        "file_tun": file_tun,
        "runtime_tun": runtime_tun
    }))
}

/// 启动代理
#[tauri::command]
pub async fn start_proxy(app: AppHandle) -> Result<ProxyStatus, String> {
    let state = get_app_state_or_err()?;

    state
        .mihomo_manager
        .start()
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Proxy started successfully");

    // 启动成功后，获取完整状态并返回
    let status = get_proxy_status().await?;

    // 同步状态到托盘菜单和前端
    app.state::<TrayMenuState>().sync_from_status(&status);
    let _ = app.emit("proxy-status-changed", &status);

    Ok(status)
}

/// 以普通模式启动代理（强制禁用 TUN 模式）
/// 用于用户取消管理员权限对话框时
#[tauri::command]
pub async fn start_proxy_normal_mode(app: AppHandle) -> Result<(), String> {
    use crate::commands::reload::sync_proxy_status;

    let state = get_app_state_or_err()?;

    log::info!("Starting proxy in normal mode (forced, TUN disabled)...");

    // 1. 禁用配置文件中的 TUN 模式
    if let Err(e) = state.config_manager.update_tun_mode(false) {
        log::error!("Failed to disable TUN in config: {}", e);
        return Err(format!("禁用增强模式配置失败: {}", e));
    }

    // 2. 更新 settings.json
    if let Ok(mut app_settings) = state.config_manager.load_app_settings() {
        app_settings.mihomo.tun.enable = false;
        if let Err(e) = state.config_manager.save_app_settings(&app_settings) {
            log::warn!("Failed to sync TUN setting to settings.json: {}", e);
        }
    }

    // 3. 清除系统代理状态（如果有）
    {
        let mut system_proxy = state.system_proxy_enabled.lock().await;
        if *system_proxy {
            let _ = crate::system::SystemProxy::clear_proxy();
            *system_proxy = false;
        }
    }

    // 4. 清除增强模式状态
    {
        let mut enhanced_mode = state.enhanced_mode.lock().await;
        *enhanced_mode = false;
    }

    // 5. 启动 mihomo（现在配置中 TUN 已禁用，会以普通模式启动）
    state
        .mihomo_manager
        .start()
        .await
        .map_err(|e| e.to_string())?;

    log::info!("Proxy started in normal mode successfully");

    // 6. 同步状态到托盘菜单和前端
    sync_proxy_status(&app).await;

    Ok(())
}

/// 停止代理
#[tauri::command]
pub async fn stop_proxy(app: AppHandle) -> Result<(), String> {
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

    let running = state.mihomo_manager.is_running().await;
    let system_proxy = *state.system_proxy_enabled.lock().await;

    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 从 settings.json 读取端口配置（config.yaml 中端口可能为 0）
    let settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    let mut enhanced_mode = *state.enhanced_mode.lock().await;
    if running {
        if let Some(tun) = config.tun.as_ref() {
            enhanced_mode = tun.enable;
            let mut enhanced_mode_state = state.enhanced_mode.lock().await;
            *enhanced_mode_state = enhanced_mode;
        }
    }

    // 检测运行模式
    let run_mode = detect_run_mode(running).await;

    Ok(ProxyStatus {
        running,
        mode: config.mode,
        port: settings.mihomo.port.unwrap_or(7890),
        socks_port: settings.mihomo.socks_port.unwrap_or(7891),
        mixed_port: settings.mihomo.mixed_port.unwrap_or(0),
        system_proxy,
        enhanced_mode,
        allow_lan: config.allow_lan,
        ipv6: config.ipv6,
        tcp_concurrent: config.tcp_concurrent,
        run_mode,
    })
}

/// 检测当前运行模式
///
/// 运行模式反映的是 mihomo 进程的权限状态，而不是 TUN 配置状态。
/// - Windows：检查服务是否运行、应用是否以管理员权限运行
/// - macOS：检查 helper PID 文件是否存在（表示通过 helper 以 root 启动）
pub async fn detect_run_mode(running: bool) -> crate::models::RunMode {
    use crate::models::RunMode;

    if !running {
        return RunMode::Normal;
    }

    // Windows: 检测服务模式或管理员模式
    #[cfg(target_os = "windows")]
    {
        use crate::system::WinServiceManager;

        // 检查是否通过服务运行
        if let Ok(status) = WinServiceManager::get_status().await {
            if status.running && status.mihomo_running {
                log::debug!(
                    "detect_run_mode: Service mode (mihomo_pid={:?})",
                    status.mihomo_pid
                );
                return RunMode::Service;
            }
        }

        // 检查是否以管理员权限运行
        if crate::system::is_running_as_admin() {
            log::debug!("detect_run_mode: AdminWin (running as admin)");
            return RunMode::AdminWin;
        }

        return RunMode::Normal;
    }

    #[cfg(target_os = "macos")]
    {
        use crate::utils::has_helper_pid_file;

        // 检查是否通过 helper 启动（HELPER_PID_FILE 存在）
        // 这表示 mihomo 以 root 权限运行，无论 TUN 是否启用
        if has_helper_pid_file() {
            log::debug!("detect_run_mode: HelperMac (helper PID file exists)");
            return RunMode::HelperMac;
        }
        RunMode::Normal
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        RunMode::Normal
    }
}

/// 设置 LAN 访问开关
#[tauri::command]
pub async fn set_allow_lan(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::default(), |settings| {
        settings.allow_lan = enabled;
        Ok(())
    })
    .await
}

/// 设置 HTTP/SOCKS 端口
#[tauri::command]
pub async fn set_ports(app: AppHandle, port: u16, socks_port: u16) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    // 端口变更使用安全模式，因为可能影响系统代理设置
    apply_mihomo_settings_change(Some(&app), &ReloadOptions::safe(), |settings| {
        settings.port = Some(port);
        settings.socks_port = Some(socks_port);
        Ok(())
    })
    .await
}

/// 设置 IPv6 开关
#[tauri::command]
pub async fn set_ipv6(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::default(), |settings| {
        settings.ipv6 = enabled;
        Ok(())
    })
    .await
}

/// 设置 TCP 并发开关
#[tauri::command]
pub async fn set_tcp_concurrent(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::default(), |settings| {
        settings.tcp_concurrent = enabled;
        Ok(())
    })
    .await
}

/// 设置域名嗅探开关
#[tauri::command]
pub async fn set_sniffing(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{apply_config_change, ReloadOptions};

    apply_config_change(Some(&app), &ReloadOptions::default(), |config| {
        if enabled {
            // 启用 sniffer，使用默认配置
            let mut sniffer = config.sniffer.clone().unwrap_or_default();
            sniffer.enable = true;
            config.sniffer = Some(sniffer);
        } else {
            // 禁用 sniffer
            if let Some(ref mut sniffer) = config.sniffer {
                sniffer.enable = false;
            }
        }
        Ok(())
    })
    .await
}

/// 切换代理模式
#[tauri::command]
pub async fn switch_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    // 验证模式
    let valid_modes = ["rule", "global", "direct"];
    if !valid_modes.contains(&mode.as_str()) {
        return Err(format!("Invalid mode: {}", mode));
    }

    // 检查当前模式，如果相同则跳过（避免托盘菜单 set_checked 触发重复调用）
    let current_config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    if current_config.mode == mode {
        return Ok(());
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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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

    // Debug log for first connection (only when connections exist, avoid spam)
    if log::log_enabled!(log::Level::Debug) && !connections.connections.is_empty() {
        if let Some(first) = connections.connections.first() {
            log::debug!("First connection metadata: {:?}", first.metadata);
        }
    }

    Ok(connections)
}

/// 关闭单个连接
#[tauri::command]
pub async fn close_connection(id: String) -> Result<(), String> {
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
///
/// 重构后的智能流程：
/// - 有权限模式（Service/AdminWin/HelperMac）：使用 API restart，无需重启进程
/// - 普通模式启用 TUN：进行权限前置检查 + 进程级重启
/// - 关闭 TUN：任意模式都使用 API restart
#[tauri::command]
pub async fn set_tun_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{should_process_restart_for_tun_change, sync_proxy_status};

    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Err("代理核心未运行".to_string());
    }

    // 记录当前状态
    let previous_enabled = *state.enhanced_mode.lock().await;

    // 如果状态没变，直接返回
    if previous_enabled == enabled {
        log::info!("TUN mode already set to {}, skipping", enabled);
        return Ok(());
    }

    log::info!(
        "set_tun_mode: enabled={}, previous_enabled={}",
        enabled,
        previous_enabled
    );

    // 获取当前运行模式
    let run_mode = detect_run_mode(true).await;
    log::info!("Current run mode: {:?}", run_mode);

    // 判断是否需要进程级重启
    let need_process_restart =
        should_process_restart_for_tun_change(previous_enabled, enabled, &run_mode);

    if need_process_restart {
        // ========== 进程级重启路径：普通模式启用 TUN ==========
        log::info!("Using process restart path for TUN mode change");

        // 前置检查：确保有激活的订阅
        crate::commands::require_active_subscription_with_proxies()?;

        // 平台特定的权限前置检查
        #[cfg(target_os = "windows")]
        {
            use crate::system::WinServiceManager;

            // Windows 普通模式：检查是否有获取权限的途径
            let service_running = WinServiceManager::is_running().unwrap_or(false);
            let is_admin = crate::system::is_running_as_admin();

            if !service_running && !is_admin {
                log::error!("TUN mode enabled but not running as admin and service not running");
                return Err("NEED_ADMIN:增强模式需要管理员权限。请选择以下方式之一：\n\
                    1. 在设置中安装并启动 Conflux 服务（推荐）\n\
                    2. 以管理员身份重新启动应用"
                    .to_string());
            }
        }

        #[cfg(target_os = "macos")]
        {
            // macOS 普通模式：检查并设置 helper 权限
            let has_permission =
                crate::system::TunPermission::check_permission().map_err(|e| e.to_string())?;
            if !has_permission {
                log::info!("TUN permission not set, requesting setup...");
                crate::system::TunPermission::setup_permission()
                    .map_err(|e| format!("增强模式需要额外系统权限/组件：{}", e))?;
            }
        }

        // 停止当前核心
        state
            .mihomo_manager
            .stop()
            .await
            .map_err(|e| e.to_string())?;

        // 更新配置文件
        if let Err(e) = state.config_manager.update_tun_mode(true) {
            log::error!("Failed to update TUN config: {}", e);
            // 尝试恢复核心（普通模式）
            let _ = state.mihomo_manager.start().await;
            return Err(format!("更新配置失败: {}", e));
        }

        // 以新权限启动核心
        match state.mihomo_manager.start().await {
            Ok(_) => {
                update_tun_state(&state, &app, true).await;
                sync_proxy_status(&app).await;
                log::info!("TUN mode enabled successfully via process restart");
                return Ok(());
            }
            Err(e) => {
                // 启动失败：回滚配置并尝试普通模式启动
                log::error!("Failed to start mihomo with TUN mode: {}", e);
                let _ = state.config_manager.update_tun_mode(false);
                let _ = state.mihomo_manager.start().await;
                sync_proxy_status(&app).await;
                return Err(format!("启动增强模式失败: {}", e));
            }
        }
    }

    // ========== API restart 路径：有权限模式，或关闭 TUN ==========
    log::info!("Using API restart path for TUN mode change");

    // 更新配置文件
    if let Err(e) = state.config_manager.update_tun_mode(enabled) {
        log::error!("Failed to update TUN config: {}", e);
        return Err(format!("更新配置失败: {}", e));
    }

    // 调用 API restart
    match state.mihomo_api.restart().await {
        Ok(_) => {
            log::info!("MiHomo API restart requested");

            // 等待内核重启完成
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;

            update_tun_state(&state, &app, enabled).await;
            sync_proxy_status(&app).await;
            log::info!(
                "TUN mode {} successfully via API restart",
                if enabled { "enabled" } else { "disabled" }
            );
            Ok(())
        }
        Err(e) => {
            log::error!("MiHomo API restart failed: {}", e);
            // 回滚配置
            let _ = state.config_manager.update_tun_mode(previous_enabled);
            Err(format!("内核重启失败: {}", e))
        }
    }
}

/// 更新 TUN 状态到内存和 settings.json
async fn update_tun_state(state: &crate::commands::AppState, _app: &AppHandle, enabled: bool) {
    // 更新内存状态
    {
        let mut enhanced_mode = state.enhanced_mode.lock().await;
        *enhanced_mode = enabled;
    }

    // 同步到 settings.json
    if let Ok(mut app_settings) = state.config_manager.load_app_settings() {
        app_settings.mihomo.tun.enable = enabled;
        if enabled && app_settings.mihomo.tun.stack.is_none() {
            app_settings.mihomo.tun.stack = Some("system".to_string());
        }
        if let Err(e) = state.config_manager.save_app_settings(&app_settings) {
            log::warn!("Failed to sync TUN setting to settings.json: {}", e);
        }
    }
}

/// 检查 TUN 权限状态
#[tauri::command]
pub async fn check_tun_permission() -> Result<bool, String> {
    crate::system::TunPermission::check_permission().map_err(|e| e.to_string())
}

/// 设置 TUN Stack
#[tauri::command]
pub async fn set_tun_stack(app: AppHandle, stack: String) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    let valid_stacks = ["gvisor", "system", "mixed"];
    if !valid_stacks.contains(&stack.as_str()) {
        return Err(format!("无效的 stack 类型: {}", stack));
    }

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::safe(), |settings| {
        settings.tun.stack = Some(stack.clone());
        Ok(())
    })
    .await?;

    log::info!("TUN stack set to: {}", stack);
    Ok(())
}

/// 设置 TUN 严格路由开关
#[tauri::command]
pub async fn set_strict_route(app: AppHandle, enabled: bool) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::safe(), |settings| {
        settings.tun.strict_route = Some(enabled);
        Ok(())
    })
    .await
}

/// 设置 TUN 路由排除地址（用于排除内网网段）
#[tauri::command]
pub async fn set_tun_route_exclude(app: AppHandle, addresses: Vec<String>) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::safe(), |settings| {
        settings.tun.inet4_route_exclude_address = addresses.clone();
        Ok(())
    })
    .await?;

    log::info!("TUN route exclude addresses set to: {:?}", addresses);
    Ok(())
}

/// 手动设置 TUN 权限
#[tauri::command]
pub async fn setup_tun_permission() -> Result<(), String> {
    crate::system::TunPermission::setup_permission().map_err(|e| e.to_string())
}

/// 从 API 获取运行时规则
#[tauri::command]
pub async fn get_rules_from_api() -> Result<Vec<RuleItem>, String> {
    let state = get_app_state_or_err()?;

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
///
/// 直接调用 API 获取版本，不依赖 is_running() 检查
/// 只要 9191 端口能响应版本信息，就说明核心在运行
#[tauri::command]
pub async fn get_core_version() -> Result<VersionInfo, String> {
    let state = get_app_state_or_err()?;

    state
        .mihomo_api
        .get_version()
        .await
        .map_err(|e| e.to_string())
}

/// 升级核心（调用 mihomo /upgrade API）
///
/// 触发 mihomo 核心自我更新，更新完成后返回新的版本信息
#[tauri::command]
pub async fn upgrade_core() -> Result<VersionInfo, String> {
    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Err("代理服务未运行".to_string());
    }

    // 获取当前版本
    let current_version = state
        .mihomo_api
        .get_version()
        .await
        .map_err(|e| format!("获取版本失败: {}", e))?;

    log::info!(
        "Checking for core upgrade, current version: {}",
        current_version.version
    );

    // 调用升级 API，返回 true 表示有更新，false 表示已是最新版本
    let has_update = state
        .mihomo_api
        .upgrade()
        .await
        .map_err(|e| format!("升级失败: {}", e))?;

    if !has_update {
        // 已是最新版本，直接返回当前版本
        log::info!(
            "Core is already at latest version: {}",
            current_version.version
        );
        return Ok(current_version);
    }

    log::info!("Core upgrade completed, waiting for restart...");

    // 等待核心重启完成，带重试逻辑
    let mut version: Option<VersionInfo> = None;
    for i in 0..15 {
        // 最多等待 15 秒
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        match state.mihomo_api.get_version().await {
            Ok(v) => {
                version = Some(v);
                log::info!("Core is ready after {} seconds", i + 1);
                break;
            }
            Err(e) => {
                log::debug!("Waiting for core to restart... attempt {}: {}", i + 1, e);
            }
        }
    }

    match version {
        Some(v) => {
            log::info!("Core upgraded to version: {}", v.version);
            // 升级后刷新 PID 文件，确保退出时能正确清理新进程
            state.mihomo_manager.refresh_pid_after_upgrade().await;
            Ok(v)
        }
        None => Err("升级后核心未能及时响应，请稍后手动检查版本".to_string()),
    }
}

/// 获取当前运行模式
///
/// 返回核心的运行模式（普通/服务/管理员/助手）
/// 该命令与运行状态检测解耦，可独立调用
#[tauri::command]
pub async fn get_run_mode() -> Result<crate::models::RunMode, String> {
    let _state = get_app_state_or_err()?;

    // 检测运行模式（假设核心正在运行，由前端通过 version API 判断）
    let run_mode = detect_run_mode(true).await;

    Ok(run_mode)
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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    let state = get_app_state_or_err()?;

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
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    let state = get_app_state_or_err()?;

    // 加载当前设置以检查端口冲突
    let app_settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;

    let port_value = port.unwrap_or(0); // 0 表示禁用混合端口

    // 验证端口不与 HTTP/SOCKS 端口冲突
    if port_value != 0 {
        let http_port = app_settings.mihomo.port.unwrap_or(7890);
        let socks_port = app_settings.mihomo.socks_port.unwrap_or(7891);

        if port_value == http_port {
            return Err(format!(
                "混合端口 {} 与 HTTP 端口冲突，请使用不同的端口",
                port_value
            ));
        }
        if port_value == socks_port {
            return Err(format!(
                "混合端口 {} 与 SOCKS 端口冲突，请使用不同的端口",
                port_value
            ));
        }
    }

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::default(), |settings| {
        settings.mixed_port = if port_value == 0 {
            None
        } else {
            Some(port_value)
        };
        Ok(())
    })
    .await
}

/// 设置进程查找模式
#[tauri::command]
pub async fn set_find_process_mode(app: AppHandle, mode: String) -> Result<(), String> {
    use crate::commands::reload::{apply_mihomo_settings_change, ReloadOptions};

    // 验证模式
    let valid_modes = ["always", "strict", "off"];
    if !valid_modes.contains(&mode.as_str()) {
        return Err(format!("无效的进程查找模式: {}", mode));
    }

    apply_mihomo_settings_change(Some(&app), &ReloadOptions::default(), |settings| {
        settings.find_process_mode = mode.clone();
        Ok(())
    })
    .await?;

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
    let state = get_app_state_or_err()?;

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

/// URL 延迟测试结果
#[derive(Debug, Clone, Serialize)]
pub struct UrlDelayResult {
    pub url: String,
    pub delay: Option<u32>,
    pub error: Option<String>,
}

/// 测试指定 URL 的延迟
/// 通过本地代理发送 HTTP 请求，测量响应时间
#[tauri::command]
pub async fn test_url_delay(
    url: String,
    timeout_ms: Option<u32>,
) -> Result<UrlDelayResult, String> {
    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Ok(UrlDelayResult {
            url,
            delay: None,
            error: Some("代理未运行".to_string()),
        });
    }

    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let proxy_port = config.mixed_port.unwrap_or(7892);
    let proxy_url = format!("http://127.0.0.1:{}", proxy_port);
    let timeout = timeout_ms.unwrap_or(5000);

    let client = reqwest::Client::builder()
        .proxy(reqwest::Proxy::all(&proxy_url).map_err(|e| e.to_string())?)
        .timeout(std::time::Duration::from_millis(timeout as u64))
        .build()
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let result = client.head(&url).send().await;
    let elapsed = start.elapsed().as_millis() as u32;

    match result {
        Ok(response) => {
            if response.status().is_success() || response.status().is_redirection() {
                Ok(UrlDelayResult {
                    url,
                    delay: Some(elapsed),
                    error: None,
                })
            } else {
                Ok(UrlDelayResult {
                    url,
                    delay: Some(elapsed),
                    error: Some(format!("HTTP {}", response.status().as_u16())),
                })
            }
        }
        Err(e) => {
            let error_msg = if e.is_timeout() {
                "超时".to_string()
            } else if e.is_connect() {
                "连接失败".to_string()
            } else {
                e.to_string()
            };
            Ok(UrlDelayResult {
                url,
                delay: None,
                error: Some(error_msg),
            })
        }
    }
}

/// 批量测试多个 URL 的延迟
#[tauri::command]
pub async fn test_urls_delay(
    urls: Vec<String>,
    timeout_ms: Option<u32>,
) -> Result<Vec<UrlDelayResult>, String> {
    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Ok(urls
            .into_iter()
            .map(|url| UrlDelayResult {
                url,
                delay: None,
                error: Some("代理未运行".to_string()),
            })
            .collect());
    }

    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let proxy_port = config.mixed_port.unwrap_or(7892);
    let proxy_url = format!("http://127.0.0.1:{}", proxy_port);
    let timeout = timeout_ms.unwrap_or(5000);

    let client = reqwest::Client::builder()
        .proxy(reqwest::Proxy::all(&proxy_url).map_err(|e| e.to_string())?)
        .timeout(std::time::Duration::from_millis(timeout as u64))
        .build()
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();

    // 并发测试所有 URL
    let futures: Vec<_> = urls
        .iter()
        .map(|url| {
            let client = client.clone();
            let url = url.clone();
            async move {
                let start = std::time::Instant::now();
                let result = client.head(&url).send().await;
                let elapsed = start.elapsed().as_millis() as u32;

                match result {
                    Ok(response) => {
                        if response.status().is_success() || response.status().is_redirection() {
                            UrlDelayResult {
                                url,
                                delay: Some(elapsed),
                                error: None,
                            }
                        } else {
                            UrlDelayResult {
                                url,
                                delay: Some(elapsed),
                                error: Some(format!("HTTP {}", response.status().as_u16())),
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg = if e.is_timeout() {
                            "超时".to_string()
                        } else if e.is_connect() {
                            "连接失败".to_string()
                        } else {
                            e.to_string()
                        };
                        UrlDelayResult {
                            url,
                            delay: None,
                            error: Some(error_msg),
                        }
                    }
                }
            }
        })
        .collect();

    let all_results = futures_util::future::join_all(futures).await;
    results.extend(all_results);

    Ok(results)
}
