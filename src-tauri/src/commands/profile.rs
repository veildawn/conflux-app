use std::path::Path;
use tauri::State;

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
pub async fn create_remote_profile(name: String, url: String) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let result = workspace
        .create_from_remote(&name, &url)
        .await
        .map_err(|e| e.to_string())?;
    on_profile_changed(None, false).await?;
    Ok(result)
}

/// 创建本地文件 Profile
#[tauri::command]
pub async fn create_local_profile(
    name: String,
    file_path: String,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let result = workspace
        .create_from_local(&name, &file_path)
        .map_err(|e| e.to_string())?;
    on_profile_changed(None, false).await?;
    Ok(result)
}

/// 创建空白 Profile
#[tauri::command]
pub async fn create_blank_profile(name: String) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let result = workspace.create_blank(&name).map_err(|e| e.to_string())?;
    on_profile_changed(None, false).await?;
    Ok(result)
}

/// 删除 Profile
#[tauri::command]
pub async fn delete_profile(id: String) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    workspace.delete_profile(&id).map_err(|e| e.to_string())?;
    on_profile_changed(None, false).await?;
    Ok(())
}

/// 重命名 Profile
#[tauri::command]
pub async fn rename_profile(id: String, new_name: String) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let result = workspace
        .rename_profile(&id, &new_name)
        .map_err(|e| e.to_string())?;
    on_profile_changed(None, false).await?;
    Ok(result)
}

/// 激活 Profile
///
/// 从 settings.json 读取用户设置（ports/DNS/TUN 等），
/// 合并 profile 内容（proxies/rules 等），生成完整的运行时配置。
#[tauri::command]
pub async fn activate_profile(id: String, state: State<'_, AppState>) -> Result<(), String> {
    use crate::commands::reload::{
        build_base_config_from_settings, reload_config, ConfigBackup, ReloadOptions,
    };

    let workspace = Workspace::new().map_err(|e| e.to_string())?;

    // 创建配置备份
    let backup = ConfigBackup::create(&state).map_err(|e| e.to_string())?;

    // 从 settings.json 构建基础配置（包含用户设置：ports/DNS/TUN 等）
    let app_settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;
    let base_config = build_base_config_from_settings(&app_settings.mihomo);

    // 生成运行时配置（合并 profile 内容：proxies/rules 等）
    // 传入 use_jsdelivr 设置，避免重复读取配置文件
    let runtime_config = workspace
        .activate_profile(&id, &base_config, Some(app_settings.use_jsdelivr))
        .map_err(|e| e.to_string())?;

    // 保存运行时配置
    state
        .config_manager
        .save_mihomo_config(&runtime_config)
        .map_err(|e| e.to_string())?;

    // 如果 MiHomo 正在运行，重新加载配置
    let options = ReloadOptions::safe();
    if let Err(e) = reload_config(None, &options).await {
        // 重载失败，回滚配置
        log::error!("Profile activation failed, rolling back: {}", e);
        if let Err(rollback_err) = backup.rollback() {
            log::error!("Failed to rollback config: {}", rollback_err);
        } else {
            let _ = reload_config(None, &ReloadOptions::quick()).await;
        }
        return Err(format!("激活配置失败: {}", e));
    }

    backup.cleanup();
    Ok(())
}

/// 刷新远程 Profile
#[tauri::command]
pub async fn refresh_profile(
    id: String,
    state: State<'_, AppState>,
) -> Result<ProfileMetadata, String> {
    use crate::commands::reload::{
        build_base_config_from_settings, reload_config, ConfigBackup, ReloadOptions,
    };

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
        // 创建配置备份
        let backup = ConfigBackup::create(&state).map_err(|e| e.to_string())?;

        // 从 settings.json 构建基础配置
        let app_settings = state
            .config_manager
            .load_app_settings()
            .map_err(|e| e.to_string())?;
        let base_config = build_base_config_from_settings(&app_settings.mihomo);

        let runtime_config = workspace
            .activate_profile(&id, &base_config, Some(app_settings.use_jsdelivr))
            .map_err(|e| e.to_string())?;

        state
            .config_manager
            .save_mihomo_config(&runtime_config)
            .map_err(|e| e.to_string())?;

        // 使用统一的重载机制
        let options = ReloadOptions::safe();
        if let Err(e) = reload_config(None, &options).await {
            // 重载失败，回滚配置（但保留已刷新的远程配置）
            log::warn!("Config reload failed after profile refresh: {}", e);
            if let Err(rollback_err) = backup.rollback() {
                log::error!("Failed to rollback config: {}", rollback_err);
            } else {
                let _ = reload_config(None, &ReloadOptions::quick()).await;
            }
            // 不返回错误，因为远程配置已成功刷新，只是重载失败
            log::warn!("Profile refreshed but config reload failed, may need to restart proxy");
        } else {
            backup.cleanup();
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

/// 从路径中提取文件名，生成规则源相对路径 ./ruleset/{filename}
/// 如果提取不到文件名，生成 uuid.yaml 或 uuid.txt
fn to_ruleset_path(path: &str, format: &str) -> String {
    let filename = extract_filename(path, format);
    format!("./ruleset/{}", filename)
}

/// 从路径中提取文件名，生成代理源相对路径 ./proxyset/{filename}
/// 如果提取不到文件名，生成 uuid.yaml
fn to_proxyset_path(path: &str) -> String {
    let filename = extract_filename(path, "yaml");
    format!("./proxyset/{}", filename)
}

/// 从路径中提取文件名，提取不到则生成 UUID 文件名
fn extract_filename(path: &str, format: &str) -> String {
    // 尝试从路径中提取文件名
    let path_obj = std::path::Path::new(path);
    if let Some(name) = path_obj.file_name() {
        let name_str = name.to_string_lossy();
        if !name_str.is_empty() && name_str.contains('.') {
            // 去掉原有后缀，使用我们的后缀
            let base = name_str
                .rsplit_once('.')
                .map(|(b, _)| b)
                .unwrap_or(&name_str);
            let ext = if format == "text" { "txt" } else { "yaml" };
            return format!("{}.{}", base, ext);
        }
    }
    // 提取不到有效文件名，生成 UUID
    let ext = if format == "text" { "txt" } else { "yaml" };
    format!("{}.{}", uuid::Uuid::new_v4(), ext)
}

/// 导出 Profile 配置到指定路径（导出运行时完整配置）
#[tauri::command]
pub async fn export_profile_config(
    id: String,
    target_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::commands::reload::build_base_config_from_settings;

    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, _) = workspace.get_profile(&id).map_err(|e| e.to_string())?;

    // 获取运行时完整配置
    let mut runtime_config = if metadata.active {
        // 如果是当前激活的 Profile，直接读取运行时配置
        state
            .config_manager
            .load_mihomo_config()
            .map_err(|e| e.to_string())?
    } else {
        // 如果不是激活的 Profile，临时生成运行时配置
        // 从 settings.json 构建基础配置
        let app_settings = state
            .config_manager
            .load_app_settings()
            .map_err(|e| e.to_string())?;
        let base_config = build_base_config_from_settings(&app_settings.mihomo);
        workspace
            .generate_runtime_config(&id, &base_config, Some(app_settings.use_jsdelivr))
            .map_err(|e| e.to_string())?
    };

    // 导出前将绝对路径转换为相对路径
    let data_dir = crate::utils::get_app_data_dir().map_err(|e| e.to_string())?;
    let data_dir_str = data_dir.to_string_lossy();

    // 转换 rule_providers 的路径
    for (_name, provider) in runtime_config.rule_providers.iter_mut() {
        if let Some(path) = &provider.path {
            if path.starts_with(data_dir_str.as_ref()) {
                // 将绝对路径转换为相对路径 (./ruleset/xxx.yaml)
                let relative = path
                    .strip_prefix(data_dir_str.as_ref())
                    .unwrap_or(path)
                    .trim_start_matches(['/', '\\']);
                provider.path = Some(format!("./{}", relative));
            }
        }
    }

    // 转换 proxy_providers 的路径
    for (_name, provider) in runtime_config.proxy_providers.iter_mut() {
        if let Some(path) = &provider.path {
            if path.starts_with(data_dir_str.as_ref()) {
                let relative = path
                    .strip_prefix(data_dir_str.as_ref())
                    .unwrap_or(path)
                    .trim_start_matches(['/', '\\']);
                provider.path = Some(format!("./{}", relative));
            }
        }
    }

    let yaml = serde_yaml::to_string(&runtime_config).map_err(|e| e.to_string())?;
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

    // 标记为本地管理的节点
    let mut proxy = proxy;
    proxy.extra.insert(
        "x-conflux-managed".to_string(),
        serde_yaml::Value::String("local".to_string()),
    );

    config.proxies.push(proxy);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
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
    let (_metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    config.proxies.retain(|p| p.name != proxy_name);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    let is_active = workspace
        .get_active_profile_id()
        .map(|id| id.as_deref() == Some(profile_id.as_str()))
        .unwrap_or(false);
    on_profile_changed(Some(&state), is_active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
    Ok(())
}

/// 添加 rule-provider 到 Profile（如果已存在则更新）
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

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        let format = provider.format.as_deref().unwrap_or("yaml");
        provider.path = Some(to_ruleset_path(path, format));
    }

    // 支持 upsert：如果已存在则更新，否则添加
    config.rule_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
    Ok(new_metadata)
}

// ==================== Proxy Provider CRUD ====================

/// 添加 proxy-provider 到 Profile（如果已存在则更新）
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

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        provider.path = Some(to_proxyset_path(path));
    }

    // 支持 upsert：如果已存在则更新，否则添加
    config.proxy_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
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

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        provider.path = Some(to_proxyset_path(path));
    }

    config.proxy_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
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

    on_profile_changed(Some(&state), metadata.active).await?;
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

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        let format = provider.format.as_deref().unwrap_or("yaml");
        provider.path = Some(to_ruleset_path(path, format));
    }

    config.rule_providers.insert(name, provider);
    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
    Ok(())
}

/// 重命名 rule-provider（同时更新所有规则中的引用）
#[tauri::command]
pub async fn rename_rule_provider_in_profile(
    profile_id: String,
    old_name: String,
    new_name: String,
    provider: RuleProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 如果名称没变，直接更新 provider
    if old_name == new_name {
        return update_rule_provider_in_profile(profile_id, new_name, provider, state).await;
    }

    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    // 检查旧名称是否存在
    if !config.rule_providers.contains_key(&old_name) {
        return Err(format!("Rule provider not found: {}", old_name));
    }

    // 检查新名称是否已存在
    if config.rule_providers.contains_key(&new_name) {
        return Err(format!("Rule provider already exists: {}", new_name));
    }

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        let format = provider.format.as_deref().unwrap_or("yaml");
        provider.path = Some(to_ruleset_path(path, format));
    }

    // 1. 删除旧的 provider，添加新的
    config.rule_providers.remove(&old_name);
    config.rule_providers.insert(new_name.clone(), provider);

    // 2. 更新所有规则中的引用
    // 规则格式: RULE-SET,provider-name,policy 或 RULE-SET,provider-name,policy,no-resolve
    for rule in &mut config.rules {
        if rule.starts_with("RULE-SET,") {
            let parts: Vec<&str> = rule.splitn(3, ',').collect();
            if parts.len() >= 2 && parts[1] == old_name {
                // 替换 provider 名称
                let rest = if parts.len() > 2 {
                    format!(",{}", parts[2])
                } else {
                    String::new()
                };
                *rule = format!("RULE-SET,{}{}", new_name, rest);
            }
        }
    }

    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
    log::info!(
        "Renamed rule provider '{}' to '{}' in profile '{}'",
        old_name,
        new_name,
        profile_id
    );
    Ok(())
}

/// 重命名 proxy-provider（同时更新所有代理组中的引用）
#[tauri::command]
pub async fn rename_proxy_provider_in_profile(
    profile_id: String,
    old_name: String,
    new_name: String,
    provider: ProxyProvider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 如果名称没变，直接更新 provider
    if old_name == new_name {
        return update_proxy_provider_in_profile(profile_id, new_name, provider, state).await;
    }

    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    // 检查旧名称是否存在
    if !config.proxy_providers.contains_key(&old_name) {
        return Err(format!("Proxy provider not found: {}", old_name));
    }

    // 检查新名称是否已存在
    if config.proxy_providers.contains_key(&new_name) {
        return Err(format!("Proxy provider already exists: {}", new_name));
    }

    // 转换路径为相对路径后存储
    let mut provider = provider;
    if let Some(path) = &provider.path {
        provider.path = Some(to_proxyset_path(path));
    }

    // 1. 删除旧的 provider，添加新的
    config.proxy_providers.remove(&old_name);
    config.proxy_providers.insert(new_name.clone(), provider);

    // 2. 更新所有代理组中的 use 引用
    for group in &mut config.proxy_groups {
        for provider_name in group.use_providers.iter_mut() {
            if provider_name == &old_name {
                *provider_name = new_name.clone();
            }
        }
    }

    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
    log::info!(
        "Renamed proxy provider '{}' to '{}' in profile '{}'",
        old_name,
        new_name,
        profile_id
    );
    Ok(())
}

// ==================== Proxy Group CRUD ====================

/// 重命名策略组（同时更新所有引用：其他策略组的 proxies 和规则中的 policy）
#[tauri::command]
pub async fn rename_proxy_group_in_profile(
    profile_id: String,
    old_name: String,
    new_name: String,
    group: crate::models::ProxyGroupConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let (metadata, mut config) = workspace
        .get_profile(&profile_id)
        .map_err(|e| e.to_string())?;

    // 检查旧名称是否存在
    let group_index = config
        .proxy_groups
        .iter()
        .position(|g| g.name == old_name)
        .ok_or_else(|| format!("Proxy group not found: {}", old_name))?;

    // 如果名称改变，检查新名称是否已存在
    if old_name != new_name {
        let name_taken = config.proxy_groups.iter().any(|g| g.name == new_name);
        if name_taken {
            return Err(format!("Proxy group name already exists: {}", new_name));
        }
    }

    // 1. 更新策略组本身
    config.proxy_groups[group_index] = group;

    // 2. 如果名称改变，更新所有引用
    if old_name != new_name {
        // 2a. 更新其他策略组中的 proxies 引用
        for g in &mut config.proxy_groups {
            for proxy in g.proxies.iter_mut() {
                if proxy == &old_name {
                    *proxy = new_name.clone();
                }
            }
        }

        // 2b. 更新规则中的策略引用
        // 规则格式: TYPE,payload,policy 或 MATCH,policy
        for rule in &mut config.rules {
            let parts: Vec<&str> = rule.split(',').collect();
            if parts.is_empty() {
                continue;
            }

            let rule_type = parts[0];

            // MATCH 规则: MATCH,policy
            if rule_type == "MATCH" && parts.len() >= 2 && parts[1] == old_name {
                *rule = format!("MATCH,{}", new_name);
                continue;
            }

            // 其他规则: TYPE,payload,policy[,extra...]
            if parts.len() >= 3 && parts[2] == old_name {
                let mut new_parts: Vec<&str> = parts.clone();
                // 我们需要替换第三部分
                let new_name_ref: &str = &new_name;
                new_parts[2] = new_name_ref;
                *rule = new_parts.join(",");
            }
        }
    }

    workspace
        .update_config(&profile_id, &config)
        .map_err(|e| e.to_string())?;

    on_profile_changed(Some(&state), metadata.active).await?;
    log::info!(
        "Renamed proxy group '{}' to '{}' in profile '{}'",
        old_name,
        new_name,
        profile_id
    );
    Ok(())
}

// ==================== 辅助函数 ====================

/// Profile 变更后的统一处理
///
/// - 如果是活跃 Profile，重载配置
async fn on_profile_changed(
    state: Option<&State<'_, AppState>>,
    is_active: bool,
) -> Result<(), String> {
    // 如果是活跃 Profile 且提供了 state，重载配置
    if is_active {
        if let Some(state) = state {
            reload_active_profile_internal(state).await?;
        }
    }

    Ok(())
}

/// 重载活跃 Profile 的内部实现
async fn reload_active_profile_internal(state: &State<'_, AppState>) -> Result<(), String> {
    use crate::commands::reload::{
        build_base_config_from_settings, reload_config, ConfigBackup, ReloadOptions,
    };

    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let active_id = match workspace
        .get_active_profile_id()
        .map_err(|e| e.to_string())?
    {
        Some(id) => id,
        None => return Ok(()),
    };

    // 创建配置备份
    let backup = ConfigBackup::create(state).map_err(|e| e.to_string())?;

    // 从 settings.json 构建基础配置
    let app_settings = state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())?;
    let base_config = build_base_config_from_settings(&app_settings.mihomo);

    let runtime_config = workspace
        .activate_profile(&active_id, &base_config, Some(app_settings.use_jsdelivr))
        .map_err(|e| e.to_string())?;
    state
        .config_manager
        .save_mihomo_config(&runtime_config)
        .map_err(|e| e.to_string())?;

    // 使用统一的重载机制
    let options = ReloadOptions::safe();
    if let Err(e) = reload_config(None, &options).await {
        // 重载失败，尝试回滚
        log::error!("Profile reload failed, rolling back: {}", e);
        if let Err(rollback_err) = backup.rollback() {
            log::error!("Failed to rollback config: {}", rollback_err);
        } else {
            // 尝试用回滚后的配置重新加载
            let _ = reload_config(None, &ReloadOptions::quick()).await;
        }
        return Err(format!("配置重载失败: {}", e));
    }

    backup.cleanup();
    Ok(())
}

/// 更新 Profile 的提供者节点数量统计
///
/// 参数 counts 是一个 HashMap，key 是提供者名称，value 是节点数量
#[tauri::command]
pub async fn update_profile_provider_stats(
    id: String,
    counts: std::collections::HashMap<String, u32>,
) -> Result<ProfileMetadata, String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;

    // 获取当前元数据
    let mut metadata = workspace.get_metadata(&id).map_err(|e| e.to_string())?;

    // 更新提供者节点数量
    metadata.update_provider_proxy_counts(counts);

    // 保存元数据
    workspace
        .update_metadata(&id, &metadata)
        .map_err(|e| e.to_string())?;

    log::info!(
        "Updated provider proxy counts for profile '{}': {:?}",
        metadata.name,
        metadata.provider_proxy_counts
    );

    // 通知前端配置已变更
    on_profile_changed(None, false).await?;

    Ok(metadata)
}
