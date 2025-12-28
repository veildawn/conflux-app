use tauri::State;
use std::path::Path;

use crate::commands::AppState;
use crate::config::Workspace;
use crate::models::{ProfileConfig, ProfileMetadata, ProxyConfig, ProxyProvider, RuleProvider};

// ==================== Profile 管理 ====================

/// 获取所有 Profile 列表
#[tauri::command]
pub async fn list_profiles() -> Result<Vec<ProfileMetadata>, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.list_profiles().map_err(|e| e.to_string())
}

/// 获取单个 Profile 详情
#[tauri::command]
pub async fn get_profile(id: String) -> Result<(ProfileMetadata, ProfileConfig), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.get_profile(&id).map_err(|e| e.to_string())
}

/// 获取当前活跃的 Profile ID
#[tauri::command]
pub async fn get_active_profile_id() -> Result<Option<String>, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.get_active_profile_id().map_err(|e| e.to_string())
}

/// 创建远程订阅 Profile
#[tauri::command]
pub async fn create_remote_profile(
    name: String,
    url: String,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace
        .create_from_remote(&name, &url)
        .await
        .map_err(|e| e.to_string())
}

/// 创建本地文件 Profile
#[tauri::command]
pub async fn create_local_profile(
    name: String,
    file_path: String,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace
        .create_from_local(&name, &file_path)
        .map_err(|e| e.to_string())
}

/// 创建空白 Profile
#[tauri::command]
pub async fn create_blank_profile(name: String) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.create_blank(&name).map_err(|e| e.to_string())
}

/// 删除 Profile
#[tauri::command]
pub async fn delete_profile(id: String) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.delete_profile(&id).map_err(|e| e.to_string())
}

/// 重命名 Profile
#[tauri::command]
pub async fn rename_profile(id: String, new_name: String) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace
        .rename_profile(&id, &new_name)
        .map_err(|e| e.to_string())
}

/// 激活 Profile
#[tauri::command]
pub async fn activate_profile(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;

    // 加载基础配置
    let base_config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    // 生成运行时配置
    let runtime_config = workspace
        .activate_profile(&id, &base_config)
        .map_err(|e| e.to_string())?;

    // 保存运行时配置
    state
        .config_manager
        .save_mihomo_config(&runtime_config)
        .map_err(|e| e.to_string())?;

    // 如果 MiHomo 正在运行，重新加载配置
    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }

    Ok(())
}

/// 刷新远程 Profile
#[tauri::command]
pub async fn refresh_profile(
    id: String,
    state: State<'_, AppState>,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;

    // 检查是否是当前活跃的 Profile
    let is_active = workspace
        .get_metadata(&id)
        .map(|m| m.active)
        .unwrap_or(false);

    // 刷新远程配置
    let metadata = workspace
        .refresh_remote(&id)
        .await
        .map_err(|e| e.to_string())?;

    // 如果是活跃 Profile，重新激活以应用更新
    if is_active {
        let base_config = state
            .config_manager
            .load_mihomo_config()
            .map_err(|e| e.to_string())?;

        let runtime_config = workspace
            .activate_profile(&id, &base_config)
            .map_err(|e| e.to_string())?;

        state
            .config_manager
            .save_mihomo_config(&runtime_config)
            .map_err(|e| e.to_string())?;

        if state.mihomo_manager.is_running().await {
            let config_path = state.config_manager.mihomo_config_path();
            state
                .mihomo_api
                .reload_configs(config_path.to_str().unwrap_or(""), true)
                .await
                .map_err(|e| format!("Failed to reload config: {}", e))?;
        }
    }

    Ok(metadata)
}

/// 解析配置文件（预览，不保存）
#[tauri::command]
pub async fn parse_config_file(path: String) -> Result<ProfileConfig, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace
        .parse_config_file(&path)
        .map_err(|e| e.to_string())
}

/// 预览远程配置（不保存）
#[tauri::command]
pub async fn preview_remote_config(url: String) -> Result<ProfileConfig, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace
        .preview_remote(&url)
        .await
        .map_err(|e| e.to_string())
}

/// 导出 Profile 配置到指定路径
#[tauri::command]
pub async fn export_profile_config(id: String, target_path: String) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (_metadata, config) = workspace.get_profile(&id).map_err(|e| e.to_string())?;
    let yaml = serde_yaml::to_string(&config).map_err(|e| e.to_string())?;
    let target = Path::new(&target_path);

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    std::fs::write(target, yaml).map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== 代理 CRUD ====================

/// 添加代理节点到 Profile
#[tauri::command]
pub async fn add_proxy(
    profile_id: String,
    proxy: ProxyConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    // 检查名称唯一性
    if config.has_proxy(&proxy.name) {
        return Err(format!("Proxy name already exists: {}", proxy.name));
    }

    config.proxies.push(proxy);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    // 如果是活跃 Profile，重新加载
    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 更新代理节点
#[tauri::command]
pub async fn update_proxy(
    profile_id: String,
    proxy_name: String,
    proxy: ProxyConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    let index = config
        .proxies
        .iter()
        .position(|p| p.name == proxy_name)
        .ok_or_else(|| format!("Proxy not found: {}", proxy_name))?;

    // 如果名称改变，检查新名称是否唯一
    if proxy.name != proxy_name && config.has_proxy(&proxy.name) {
        return Err(format!("Proxy name already exists: {}", proxy.name));
    }

    config.proxies[index] = proxy;
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 删除代理节点
#[tauri::command]
pub async fn delete_proxy(
    profile_id: String,
    proxy_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    config.proxies.retain(|p| p.name != proxy_name);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

// ==================== 规则即时添加 ====================

/// 添加规则到 Profile
#[tauri::command]
pub async fn add_rule_to_profile(
    profile_id: String,
    rule: String,
    position: Option<usize>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    // 如果没有指定位置，在 MATCH 规则之前插入
    let insert_pos = position.unwrap_or_else(|| {
        config
            .rules
            .iter()
            .position(|r| r.starts_with("MATCH,"))
            .unwrap_or(config.rules.len())
    });

    config.rules.insert(insert_pos, rule);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 删除 Profile 中的规则
#[tauri::command]
pub async fn delete_rule_from_profile(
    profile_id: String,
    index: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    if index >= config.rules.len() {
        return Err(format!("Rule index out of bounds: {}", index));
    }

    config.rules.remove(index);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 添加 rule-provider 到 Profile
#[tauri::command]
pub async fn add_rule_provider_to_profile(
    profile_id: String,
    name: String,
    provider: RuleProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    if config.rule_providers.contains_key(&name) {
        return Err(format!("Rule provider already exists: {}", name));
    }

    config.rule_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 删除 Profile 中的 rule-provider
#[tauri::command]
pub async fn delete_rule_provider_from_profile(
    profile_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    config.rule_providers.remove(&name);

    // 移除引用该 provider 的规则
    config.rules.retain(|rule| {
        if rule.starts_with("RULE-SET,") {
            let parts: Vec<&str> = rule.split(',').collect();
            if parts.len() >= 2 && parts[1] == name {
                return false;
            }
        }
        true
    });

    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 更新 Profile 配置
#[tauri::command]
pub async fn update_profile_config(
    profile_id: String,
    config: ProfileConfig,
    state: State<'_, AppState>,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let metadata = workspace
        .get_metadata(&profile_id)
        .map_err(|e| e.to_string())?;

    let new_metadata = workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(new_metadata)
}

// ==================== Proxy Provider CRUD ====================

/// 添加 proxy-provider 到 Profile
#[tauri::command]
pub async fn add_proxy_provider_to_profile(
    profile_id: String,
    name: String,
    provider: ProxyProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    if config.proxy_providers.contains_key(&name) {
        return Err(format!("Proxy provider already exists: {}", name));
    }

    config.proxy_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 更新 proxy-provider
#[tauri::command]
pub async fn update_proxy_provider_in_profile(
    profile_id: String,
    name: String,
    provider: ProxyProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    if !config.proxy_providers.contains_key(&name) {
        return Err(format!("Proxy provider not found: {}", name));
    }

    config.proxy_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 删除 Profile 中的 proxy-provider
#[tauri::command]
pub async fn delete_proxy_provider_from_profile(
    profile_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    config.proxy_providers.remove(&name);

    // 从代理组中移除对该 provider 的引用（use 字段）
    for group in &mut config.proxy_groups {
        group.proxies.retain(|p| p != &name);
    }

    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

/// 更新 rule-provider
#[tauri::command]
pub async fn update_rule_provider_in_profile(
    profile_id: String,
    name: String,
    provider: RuleProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    if !config.rule_providers.contains_key(&name) {
        return Err(format!("Rule provider not found: {}", name));
    }

    config.rule_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    if metadata.active {
        reload_active_profile(&state).await?;
    }

    Ok(())
}

// ==================== 辅助函数 ====================

/// 重载活跃 Profile 的辅助函数
async fn reload_active_profile(state: &State<'_, AppState>) -> Result<(), String> {
    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
            .map_err(|e| format!("Failed to reload config: {}", e))?;
    }
    Ok(())
}
