use crate::commands::get_app_state;
use crate::models::{AppSettings, MihomoConfig};

/// 获取 MiHomo 配置
#[tauri::command]
pub async fn get_config() -> Result<MihomoConfig, String> {
    let state = get_app_state();
    
    state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())
}

/// 解析配置文件返回节点数量
#[tauri::command]
pub async fn parse_config_file(path: String) -> Result<usize, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    
    let value: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid YAML format: {}", e))?;
    
    if let Some(proxies) = value.get("proxies").and_then(|v| v.as_sequence()) {
        Ok(proxies.len())
    } else {
        Ok(0)
    }
}

/// 保存 MiHomo 配置
#[tauri::command]
pub async fn save_config(config: MihomoConfig) -> Result<(), String> {
    let state = get_app_state();
    
    // 验证配置
    state
        .config_manager
        .validate_mihomo_config(&config)
        .map_err(|e| e.to_string())?;
    
    // 保存配置
    state
        .config_manager
        .save_mihomo_config(&config)
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
    
    log::info!("Config saved and reloaded");
    Ok(())
}

/// 获取应用设置
#[tauri::command]
pub async fn get_app_settings() -> Result<AppSettings, String> {
    let state = get_app_state();
    
    state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())
}

/// 保存应用设置
#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    let state = get_app_state();
    
    state
        .config_manager
        .save_app_settings(&settings)
        .map_err(|e| e.to_string())?;
    
    log::info!("App settings saved");
    Ok(())
}

/// 下载资源文件
#[tauri::command]
pub async fn download_resource(url: String, file_name: String) -> Result<(), String> {
    log::info!("Downloading resource: {} -> {}", url, file_name);
    
    let target_dir = crate::utils::get_app_data_dir()
        .map_err(|e| e.to_string())?;
    let target_path = target_dir.join(&file_name);
    
    let client = reqwest::Client::new();
    let response = client.get(&url)
        .header("User-Agent", "Conflux/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to request URL: {}", e))?;
        
    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }
    
    let content = response.bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
        
    std::fs::write(&target_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
        
    log::info!("Resource downloaded successfully: {:?}", target_path);
    Ok(())
}

/// 获取规则列表
#[tauri::command]
pub async fn get_rules() -> Result<Vec<String>, String> {
    let state = get_app_state();
    
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    
    Ok(config.rules)
}

/// 保存规则列表
#[tauri::command]
pub async fn save_rules(rules: Vec<String>) -> Result<(), String> {
    let state = get_app_state();
    
    // 加载当前配置
    let mut config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    
    // 更新规则
    config.rules = rules;
    
    // 保存配置
    state
        .config_manager
        .save_mihomo_config(&config)
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
    
    log::info!("Rules saved and reloaded");
    Ok(())
}

/// 应用订阅配置的结果
#[derive(serde::Serialize)]
pub struct ApplySubscriptionResult {
    pub proxies_count: usize,
    pub proxy_groups_count: usize,
    pub rules_count: usize,
}

/// 代理服务器简要信息（用于前端展示）
#[derive(serde::Serialize)]
pub struct ProxyServerInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub server: String,
    pub port: u16,
    pub tls: bool,
    pub udp: bool,
}

/// 获取订阅配置中的代理服务器列表
#[tauri::command]
pub async fn get_subscription_proxies(path: String, sub_type: String) -> Result<Vec<ProxyServerInfo>, String> {
    log::info!("Getting proxies from subscription: {} (type: {})", path, sub_type);
    
    // 读取订阅文件内容
    let content = if sub_type == "remote" {
        let client = reqwest::Client::new();
        let response = client.get(&path)
            .header("User-Agent", "Conflux/0.1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch subscription: {}", e))?;
            
        if !response.status().is_success() {
            return Err(format!("Failed to fetch subscription: HTTP {}", response.status()));
        }
        
        response.text()
            .await
            .map_err(|e| format!("Failed to read subscription content: {}", e))?
    } else {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file: {}", e))?
    };
    
    // 解析订阅文件
    let sub_config: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid YAML format: {}", e))?;
    
    // 提取 proxies
    let proxies = if let Some(proxies_value) = sub_config.get("proxies") {
        let proxies: Vec<crate::models::ProxyConfig> = serde_yaml::from_value(proxies_value.clone())
            .map_err(|e| format!("Failed to parse proxies: {}", e))?;
        
        proxies.into_iter().map(|p| ProxyServerInfo {
            name: p.name,
            proxy_type: p.proxy_type,
            server: p.server,
            port: p.port,
            tls: p.tls.unwrap_or(false),
            udp: p.udp,
        }).collect()
    } else {
        vec![]
    };
    
    log::info!("Found {} proxies in subscription", proxies.len());
    Ok(proxies)
}

/// 获取当前运行配置中的代理服务器列表
#[tauri::command]
pub async fn get_config_proxies() -> Result<Vec<ProxyServerInfo>, String> {
    let state = get_app_state();
    
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    
    let proxies: Vec<ProxyServerInfo> = config.proxies.into_iter().map(|p| ProxyServerInfo {
        name: p.name,
        proxy_type: p.proxy_type,
        server: p.server,
        port: p.port,
        tls: p.tls.unwrap_or(false),
        udp: p.udp,
    }).collect();
    
    Ok(proxies)
}

/// 应用订阅配置
/// 从订阅文件中读取 proxies、proxy-groups、rules 并合并到当前配置
#[tauri::command]
pub async fn apply_subscription(path: String, sub_type: String) -> Result<ApplySubscriptionResult, String> {
    let state = get_app_state();
    
    log::info!("Applying subscription from: {} (type: {})", path, sub_type);
    
    // 读取订阅文件内容
    let content = if sub_type == "remote" {
        // 远程订阅需要下载
        let client = reqwest::Client::new();
        let response = client.get(&path)
            .header("User-Agent", "Conflux/0.1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch subscription: {}", e))?;
            
        if !response.status().is_success() {
            return Err(format!("Failed to fetch subscription: HTTP {}", response.status()));
        }
        
        response.text()
            .await
            .map_err(|e| format!("Failed to read subscription content: {}", e))?
    } else {
        // 本地文件直接读取
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file: {}", e))?
    };
    
    // 解析订阅文件
    let sub_config: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid YAML format: {}", e))?;
    
    // 加载当前配置
    let mut config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    
    // 提取并合并 proxies
    let proxies_count = if let Some(proxies) = sub_config.get("proxies") {
        let proxies: Vec<crate::models::ProxyConfig> = serde_yaml::from_value(proxies.clone())
            .map_err(|e| format!("Failed to parse proxies: {}", e))?;
        let count = proxies.len();
        config.proxies = proxies;
        count
    } else {
        0
    };
    
    // 提取并合并 proxy-groups
    let proxy_groups_count = if let Some(groups) = sub_config.get("proxy-groups") {
        let groups: Vec<crate::models::ProxyGroupConfig> = serde_yaml::from_value(groups.clone())
            .map_err(|e| format!("Failed to parse proxy-groups: {}", e))?;
        let count = groups.len();
        config.proxy_groups = groups;
        count
    } else {
        0
    };

    // 获取本地规则集存储目录
    let ruleset_dir = crate::utils::get_app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ruleset");
    std::fs::create_dir_all(&ruleset_dir).ok();
    let ruleset_dir_str = ruleset_dir.to_string_lossy().to_string();

    // 提取并合并 rule-providers（手动解析以处理 YAML 锚点）
    if let Some(providers_value) = sub_config.get("rule-providers") {
        let mut providers: std::collections::HashMap<String, crate::models::RuleProvider> = 
            std::collections::HashMap::new();
        let mut invalid_providers: Vec<String> = Vec::new();
        
        if let Some(providers_map) = providers_value.as_mapping() {
            for (key, value) in providers_map {
                let name = match key.as_str() {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                
                // 手动解析每个 provider
                let provider_type = value.get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("http")
                    .to_string();
                let behavior = value.get("behavior")
                    .and_then(|v| v.as_str())
                    .unwrap_or("classical")
                    .to_string();
                let format = value.get("format")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let url = value.get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let original_path = value.get("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let interval = value.get("interval")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
                
                // 处理路径
                let path = if provider_type == "file" {
                    // file 类型需要检查文件是否存在
                    if let Some(ref p) = original_path {
                        if !std::path::Path::new(p).exists() {
                            log::warn!("Rule provider '{}' file not found: {}", name, p);
                            invalid_providers.push(name.clone());
                            continue;
                        }
                        original_path.clone()
                    } else {
                        invalid_providers.push(name.clone());
                        continue;
                    }
                } else {
                    // http 类型，修复路径为本地路径
                    let file_name = original_path.as_ref()
                        .and_then(|p| std::path::Path::new(p).file_name())
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| format!("{}.yaml", name));
                    Some(format!("{}/{}", ruleset_dir_str, file_name))
                };
                
                providers.insert(name, crate::models::RuleProvider {
                    provider_type,
                    behavior,
                    format,
                    url,
                    path,
                    interval,
                });
            }
        }
        
        config.rule_providers = providers;
        log::info!("Loaded {} rule providers ({} invalid providers skipped)", 
            config.rule_providers.len(), invalid_providers.len());
    } else {
        // 如果没有 rule-providers，清空现有的
        config.rule_providers.clear();
    }
    
    // 提取并合并 rules
    let rules_count = if let Some(rules) = sub_config.get("rules") {
        let rules: Vec<String> = serde_yaml::from_value(rules.clone())
            .map_err(|e| format!("Failed to parse rules: {}", e))?;
        
        // 过滤规则：移除引用了无效 provider 的 RULE-SET 规则
        let valid_provider_names: std::collections::HashSet<&String> = 
            config.rule_providers.keys().collect();
        
        let filtered_rules: Vec<String> = rules.into_iter()
            .filter(|rule| {
                if rule.starts_with("RULE-SET,") {
                    // 解析 RULE-SET,<provider_name>,<policy> 格式
                    let parts: Vec<&str> = rule.split(',').collect();
                    if parts.len() >= 2 {
                        let provider_name = parts[1].to_string();
                        if !valid_provider_names.contains(&provider_name) {
                            log::warn!("Removing rule with invalid provider: {}", rule);
                            return false;
                        }
                    }
                }
                true
            })
            .collect();
        
        let count = filtered_rules.len();
        config.rules = filtered_rules;
        count
    } else {
        0
    };
    
    // 保存配置
    state
        .config_manager
        .save_mihomo_config(&config)
        .map_err(|e| e.to_string())?;
    
    // 如果 MiHomo 正在运行，尝试重新加载配置（失败时只记录警告）
    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        match state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
        {
            Ok(_) => log::info!("Config reloaded successfully"),
            Err(e) => log::warn!("Failed to reload config (mihomo may need restart): {}", e),
        }
    }
    
    log::info!(
        "Subscription applied: {} proxies, {} groups, {} rules",
        proxies_count, proxy_groups_count, rules_count
    );
    
    Ok(ApplySubscriptionResult {
        proxies_count,
        proxy_groups_count,
        rules_count,
    })
}
