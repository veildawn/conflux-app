use crate::commands::get_app_state;
use crate::models::{ConnectionsResponse, ProxyGroup, ProxyStatus, RuleItem, TrafficData};

/// 启动代理
#[tauri::command]
pub async fn start_proxy() -> Result<(), String> {
    let state = get_app_state();
    
    state
        .mihomo_manager
        .start()
        .await
        .map_err(|e| e.to_string())?;
    
    log::info!("Proxy started successfully");
    Ok(())
}

/// 停止代理
#[tauri::command]
pub async fn stop_proxy() -> Result<(), String> {
    let state = get_app_state();
    
    // 如果系统代理已启用，先清除
    let mut system_proxy = state.system_proxy_enabled.lock().await;
    if *system_proxy {
        crate::system::SystemProxy::clear_proxy().map_err(|e| e.to_string())?;
        *system_proxy = false;
    }
    drop(system_proxy);
    
    state
        .mihomo_manager
        .stop()
        .await
        .map_err(|e| e.to_string())?;
    
    log::info!("Proxy stopped successfully");
    Ok(())
}

/// 重启代理
#[tauri::command]
pub async fn restart_proxy() -> Result<(), String> {
    let state = get_app_state();
    
    state
        .mihomo_manager
        .restart()
        .await
        .map_err(|e| e.to_string())?;
    
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
    
    Ok(ProxyStatus {
        running,
        mode: config.mode,
        port: config.port,
        socks_port: config.socks_port,
        mixed_port: config.mixed_port,
        system_proxy,
    })
}

/// 切换代理模式
#[tauri::command]
pub async fn switch_mode(mode: String) -> Result<(), String> {
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
    
    log::info!("Proxy mode switched to: {}", mode);
    Ok(())
}

/// 获取代理节点列表
#[tauri::command]
pub async fn get_proxies() -> Result<Vec<ProxyGroup>, String> {
    let state = get_app_state();
    
    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
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
            groups.push(ProxyGroup {
                name: name.clone(),
                group_type: info.proxy_type.clone(),
                now: info.now.clone(),
                all: info.all.clone(),
            });
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
pub async fn set_tun_mode(enabled: bool) -> Result<(), String> {
    let state = get_app_state();
    
    if !state.mihomo_manager.is_running().await {
        return Err("Proxy is not running".to_string());
    }
    
    state
        .mihomo_api
        .set_tun(enabled)
        .await
        .map_err(|e| e.to_string())?;
    
    log::info!("TUN mode set to: {}", enabled);
    Ok(())
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

