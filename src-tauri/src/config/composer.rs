use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::time::Duration;

use crate::models::{
    HealthCheck, ProfileConfig, ProxyConfig, ProxyGroupConfig, ProxyProvider, RuleProvider,
};

/// 配置编排器
/// 负责解析、验证和提取配置内容
pub struct Composer;

impl Composer {
    /// 从 YAML 内容解析配置
    pub fn parse_yaml(content: &str) -> Result<ProfileConfig> {
        let raw: serde_yaml::Value =
            serde_yaml::from_str(content).map_err(|e| anyhow!("Failed to parse YAML: {}", e))?;
        Self::extract_config(&raw)
    }

    /// 从远程 URL 获取并解析配置
    pub async fn fetch_and_parse(url: &str) -> Result<ProfileConfig> {
        let (config, _) = Self::fetch_and_parse_with_flags(url).await?;
        Ok(config)
    }

    /// 从远程 URL 获取并解析配置，并返回是否自动生成默认规则
    pub async fn fetch_and_parse_with_flags(url: &str) -> Result<(ProfileConfig, bool)> {
        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(30));

        // 如果是本地地址，禁用代理，避免受系统代理影响导致连接失败
        if url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost") {
            log::debug!("Fetching local URL, disabling proxy: {}", url);
            builder = builder.no_proxy();
        }

        let client = builder.build()?;

        let response = client
            .get(url)
            .header("User-Agent", "Conflux/0.1.0")
            .send()
            .await
            .map_err(|e| anyhow!("Failed to fetch URL: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to fetch: HTTP {}", response.status()));
        }

        let content = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read response: {}", e))?;

        let mut config = Self::parse_yaml(&content)?;
        let mut default_rules_applied = false;
        if Self::should_apply_nodes_only_template(&config) {
            log::info!("Remote subscription only contains proxies, applying template config");
            config = Self::build_nodes_only_template(config.proxies);
            default_rules_applied = true;
        }
        Ok((config, default_rules_applied))
    }

    /// 从原始配置提取应用支持的内容
    fn extract_config(raw: &serde_yaml::Value) -> Result<ProfileConfig> {
        let mut config = ProfileConfig::default();

        if raw.is_sequence() {
            config.proxies = Self::parse_proxies(raw)?;
            return Ok(config);
        }

        // 提取 proxies
        if let Some(proxies) = raw.get("proxies") {
            config.proxies = Self::parse_proxies(proxies)?;
        }

        // 提取 proxy-groups
        if let Some(groups) = raw.get("proxy-groups") {
            config.proxy_groups = Self::parse_proxy_groups(groups)?;
        }

        // 提取 proxy-providers
        if let Some(providers) = raw.get("proxy-providers") {
            config.proxy_providers = Self::parse_proxy_providers(providers)?;
        }

        // 提取 rule-providers（处理 YAML 锚点）
        if let Some(providers) = raw.get("rule-providers") {
            config.rule_providers = Self::parse_rule_providers(providers)?;
        }

        // 提取 rules
        if let Some(rules) = raw.get("rules") {
            config.rules = Self::parse_rules(rules)?;
        }

        Ok(config)
    }

    fn should_apply_nodes_only_template(config: &ProfileConfig) -> bool {
        !config.proxies.is_empty()
            && config.proxy_groups.is_empty()
            && config.proxy_providers.is_empty()
            && config.rule_providers.is_empty()
            && config.rules.is_empty()
    }

    fn build_nodes_only_template(proxies: Vec<ProxyConfig>) -> ProfileConfig {
        let manual_group_name = "🚀 节点选择";
        let auto_group_name = "⚡ 自动选择";

        let proxy_groups = vec![
            ProxyGroupConfig {
                name: manual_group_name.to_string(),
                group_type: "select".to_string(),
                proxies: vec![auto_group_name.to_string(), "DIRECT".to_string()],
                include_all: Some(true),
                ..Default::default()
            },
            ProxyGroupConfig {
                name: auto_group_name.to_string(),
                group_type: "url-test".to_string(),
                proxies: vec![],
                include_all: Some(true),
                url: Some("http://www.gstatic.com/generate_204".to_string()),
                interval: Some(300),
                ..Default::default()
            },
        ];

        // 使用简单可靠的规则，避免依赖 GEOSITE 可能导致的问题
        // GEOIP 规则更稳定，且 geoip.metadb 通常都能正确加载
        let rules = vec![
            // 私有网络直连
            "GEOIP,private,DIRECT,no-resolve".to_string(),
            // 中国大陆 IP 直连
            "GEOIP,cn,DIRECT,no-resolve".to_string(),
            // 其他流量走代理
            format!("MATCH,{}", manual_group_name),
        ];

        ProfileConfig {
            proxies,
            proxy_groups,
            rules,
            ..Default::default()
        }
    }

    /// 解析代理节点列表
    fn parse_proxies(value: &serde_yaml::Value) -> Result<Vec<ProxyConfig>> {
        if let Some(arr) = value.as_sequence() {
            let mut proxies = Vec::new();
            for item in arr {
                match serde_yaml::from_value::<ProxyConfig>(item.clone()) {
                    Ok(proxy) => proxies.push(proxy),
                    Err(e) => {
                        // 记录警告但继续处理
                        let name = item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown");
                        log::warn!("Failed to parse proxy '{}': {}", name, e);
                    }
                }
            }
            Ok(proxies)
        } else {
            Ok(Vec::new())
        }
    }

    /// 解析代理组列表
    fn parse_proxy_groups(value: &serde_yaml::Value) -> Result<Vec<ProxyGroupConfig>> {
        if let Some(arr) = value.as_sequence() {
            let mut groups = Vec::new();
            for item in arr {
                match serde_yaml::from_value::<ProxyGroupConfig>(item.clone()) {
                    Ok(group) => groups.push(group),
                    Err(e) => {
                        let name = item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown");
                        log::warn!("Failed to parse proxy group '{}': {}", name, e);
                    }
                }
            }
            Ok(groups)
        } else {
            Ok(Vec::new())
        }
    }

    /// 解析 proxy-providers
    fn parse_proxy_providers(value: &serde_yaml::Value) -> Result<HashMap<String, ProxyProvider>> {
        let mut providers = HashMap::new();

        if let Some(mapping) = value.as_mapping() {
            for (key, val) in mapping {
                if let Some(name) = key.as_str() {
                    match Self::parse_single_proxy_provider(val) {
                        Ok(provider) => {
                            providers.insert(name.to_string(), provider);
                        }
                        Err(e) => {
                            log::warn!("Failed to parse proxy provider '{}': {}", name, e);
                        }
                    }
                }
            }
        }

        Ok(providers)
    }

    /// 解析单个 proxy-provider
    fn parse_single_proxy_provider(value: &serde_yaml::Value) -> Result<ProxyProvider> {
        let provider_type = value
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("http")
            .to_string();

        let url = value
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let interval = value
            .get("interval")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let health_check = value.get("health-check").and_then(|hc| {
            let enable = hc.get("enable").and_then(|v| v.as_bool()).unwrap_or(true);
            let url = hc
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let interval = hc
                .get("interval")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            Some(HealthCheck {
                enable,
                url,
                interval,
            })
        });

        Ok(ProxyProvider {
            provider_type,
            url,
            path,
            interval,
            health_check,
        })
    }

    /// 解析 rule-providers（处理复杂情况和 YAML 锚点）
    fn parse_rule_providers(value: &serde_yaml::Value) -> Result<HashMap<String, RuleProvider>> {
        let mut providers = HashMap::new();

        if let Some(mapping) = value.as_mapping() {
            for (key, val) in mapping {
                if let Some(name) = key.as_str() {
                    match Self::parse_single_provider(name, val) {
                        Ok(provider) => {
                            providers.insert(name.to_string(), provider);
                        }
                        Err(e) => {
                            log::warn!("Failed to parse rule provider '{}': {}", name, e);
                        }
                    }
                }
            }
        }

        Ok(providers)
    }

    /// 解析单个 rule-provider
    fn parse_single_provider(name: &str, value: &serde_yaml::Value) -> Result<RuleProvider> {
        let provider_type = value
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("http")
            .to_string();

        let behavior = value
            .get("behavior")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Self::guess_behavior(name));

        let format = value
            .get("format")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let url = value
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let interval = value
            .get("interval")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        Ok(RuleProvider {
            provider_type,
            behavior,
            format,
            url,
            path,
            interval,
        })
    }

    /// 根据名称猜测 behavior
    fn guess_behavior(name: &str) -> String {
        let lower = name.to_lowercase();

        // IP 相关的规则集
        if (lower.contains("ip") || lower.contains("asn") || lower.contains("cidr"))
            && !lower.contains("vip")
            && !lower.contains("script")
            && !lower.contains("tip")
        {
            return "ipcidr".to_string();
        }

        // 纯域名规则集（注意：很多名为 Domain 的规则集实际上是 classical 格式）
        // 只有明确是 domain-list 类型的才设为 domain
        if lower.ends_with("-domain") || lower.contains("domain-list") {
            return "domain".to_string();
        }

        // 默认使用 classical
        "classical".to_string()
    }

    /// 解析规则列表
    fn parse_rules(value: &serde_yaml::Value) -> Result<Vec<String>> {
        if let Some(arr) = value.as_sequence() {
            let rules: Vec<String> = arr
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect();
            Ok(rules)
        } else {
            Ok(Vec::new())
        }
    }

    /// 过滤掉引用无效 provider 的规则
    pub fn filter_invalid_rules(config: &mut ProfileConfig) {
        let valid_providers: std::collections::HashSet<&String> =
            config.rule_providers.keys().collect();

        config.rules.retain(|rule| {
            if rule.starts_with("RULE-SET,") {
                let parts: Vec<&str> = rule.split(',').collect();
                if parts.len() >= 2 {
                    let provider_name = parts[1];
                    return valid_providers.contains(&provider_name.to_string());
                }
            }
            true
        });
    }

    /// 修正 rule-providers 的路径
    pub fn fix_provider_paths(
        config: &mut ProfileConfig,
        ruleset_dir: &std::path::Path,
    ) -> Result<()> {
        for (name, provider) in config.rule_providers.iter_mut() {
            // 对于 http 类型，将路径指向本地 ruleset 目录
            if provider.provider_type == "http" {
                let file_name = provider
                    .path
                    .as_ref()
                    .and_then(|p| std::path::Path::new(p).file_name())
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("{}.yaml", name));

                let new_path = ruleset_dir.join(&file_name);
                provider.path = Some(new_path.to_string_lossy().to_string());
            }

            // 对于 file 类型，检查文件是否存在
            if provider.provider_type == "file" {
                if let Some(path) = &provider.path {
                    let path_obj = std::path::Path::new(path);
                    if !path_obj.exists() {
                        // 如果有 URL，转换为 http 类型
                        if provider.url.is_some() {
                            provider.provider_type = "http".to_string();
                            let file_name = path_obj
                                .file_name()
                                .and_then(|n| n.to_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| format!("{}.yaml", name));

                            let new_path = ruleset_dir.join(&file_name);
                            provider.path = Some(new_path.to_string_lossy().to_string());

                            log::info!("Converted rule provider '{}' from file to http type", name);
                        } else {
                            log::warn!(
                                "Rule provider '{}' has invalid path and no URL: {}",
                                name,
                                path
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_yaml() {
        let yaml = r#"
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: password123

proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - test-ss
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
"#;

        let config = Composer::parse_yaml(yaml).unwrap();
        assert_eq!(config.proxies.len(), 1);
        assert_eq!(config.proxy_groups.len(), 1);
        assert_eq!(config.rules.len(), 2);
    }

    #[test]
    fn test_guess_behavior() {
        assert_eq!(Composer::guess_behavior("ChinaIP"), "ipcidr");
        assert_eq!(Composer::guess_behavior("china-ip"), "ipcidr");
        assert_eq!(Composer::guess_behavior("CN-IP-CIDR"), "ipcidr");
        assert_eq!(Composer::guess_behavior("ChinaDomain"), "classical");
        assert_eq!(Composer::guess_behavior("custom-domain-list"), "domain");
        assert_eq!(Composer::guess_behavior("SomeRule"), "classical");
    }

    #[test]
    fn test_parse_proxy_sequence_yaml() {
        let yaml = r#"
- name: test-ss
  type: ss
  server: example.com
  port: 8388
  cipher: aes-256-gcm
  password: password123
"#;

        let config = Composer::parse_yaml(yaml).unwrap();
        assert_eq!(config.proxies.len(), 1);
        assert!(config.proxy_groups.is_empty());
        assert!(config.rules.is_empty());
    }

    #[test]
    fn test_build_nodes_only_template() {
        let proxies = vec![ProxyConfig {
            name: "node-1".to_string(),
            proxy_type: "ss".to_string(),
            server: "example.com".to_string(),
            port: 8388,
            cipher: Some("aes-128-gcm".to_string()),
            password: Some("password".to_string()),
            uuid: None,
            alter_id: None,
            network: None,
            tls: None,
            skip_cert_verify: None,
            sni: None,
            udp: false,
            extra: HashMap::new(),
        }];

        let config = Composer::build_nodes_only_template(proxies);
        assert_eq!(config.proxy_groups.len(), 2);
        assert_eq!(config.proxy_groups[0].name, "🚀 节点选择");
        assert_eq!(config.proxy_groups[0].include_all, Some(true));
        assert!(!config.proxy_groups[0]
            .proxies
            .contains(&"node-1".to_string()));
        assert_eq!(config.rules.last().unwrap(), "MATCH,🚀 节点选择");
    }
}
