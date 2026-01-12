use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::config::{ProxyConfig, ProxyGroupConfig, ProxyProvider, RuleProvider};

/// Profile 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProfileType {
    /// 远程订阅
    Remote,
    /// 本地文件导入（复制内容到应用内部）
    Local,
    /// 空白配置（新建）
    Blank,
}

impl Default for ProfileType {
    fn default() -> Self {
        Self::Blank
    }
}

/// Profile 元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMetadata {
    /// 唯一标识符
    pub id: String,
    /// 显示名称
    pub name: String,
    /// Profile 类型
    pub profile_type: ProfileType,
    /// 远程订阅 URL（仅 Remote 类型）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// 创建时间 (ISO 8601)
    pub created_at: String,
    /// 最后更新时间 (ISO 8601)
    pub updated_at: String,
    /// 代理节点数量
    pub proxy_count: u32,
    /// 代理组数量
    pub group_count: u32,
    /// 规则数量
    pub rule_count: u32,
    /// 代理提供者数量
    #[serde(default)]
    pub provider_count: u32,
    /// 每个代理提供者的节点数量映射（提供者名称 -> 节点数量）
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub provider_proxy_counts: HashMap<String, u32>,
    /// 是否自动生成默认规则（远程订阅且无规则时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_rules_applied: Option<bool>,
    /// 是否当前激活
    pub active: bool,
    /// 自动更新（仅 Remote 类型）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_update: Option<bool>,
    /// 更新间隔（小时，仅 Remote 类型）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_interval: Option<u32>,
}

impl ProfileMetadata {
    /// 创建新的远程订阅元数据
    pub fn new_remote(id: String, name: String, url: String) -> Self {
        let now = chrono::Local::now().to_rfc3339();
        Self {
            id,
            name,
            profile_type: ProfileType::Remote,
            url: Some(url),
            created_at: now.clone(),
            updated_at: now,
            proxy_count: 0,
            group_count: 0,
            rule_count: 0,
            provider_count: 0,
            provider_proxy_counts: HashMap::new(),
            default_rules_applied: None,
            active: false,
            auto_update: Some(true),
            update_interval: Some(24),
        }
    }

    /// 创建新的本地文件元数据
    pub fn new_local(id: String, name: String) -> Self {
        let now = chrono::Local::now().to_rfc3339();
        Self {
            id,
            name,
            profile_type: ProfileType::Local,
            url: None,
            created_at: now.clone(),
            updated_at: now,
            proxy_count: 0,
            group_count: 0,
            rule_count: 0,
            provider_count: 0,
            provider_proxy_counts: HashMap::new(),
            default_rules_applied: None,
            active: false,
            auto_update: None,
            update_interval: None,
        }
    }

    /// 创建新的空白配置元数据
    pub fn new_blank(id: String, name: String) -> Self {
        let now = chrono::Local::now().to_rfc3339();
        Self {
            id,
            name,
            profile_type: ProfileType::Blank,
            url: None,
            created_at: now.clone(),
            updated_at: now,
            proxy_count: 0,
            group_count: 0,
            rule_count: 0,
            provider_count: 0,
            provider_proxy_counts: HashMap::new(),
            default_rules_applied: None,
            active: false,
            auto_update: None,
            update_interval: None,
        }
    }

    /// 更新统计信息
    pub fn update_stats(
        &mut self,
        proxy_count: u32,
        group_count: u32,
        rule_count: u32,
        provider_count: u32,
    ) {
        self.proxy_count = proxy_count;
        self.group_count = group_count;
        self.rule_count = rule_count;
        self.provider_count = provider_count;
        self.updated_at = chrono::Local::now().to_rfc3339();
    }

    /// 更新提供者节点数量统计
    pub fn update_provider_proxy_counts(&mut self, counts: HashMap<String, u32>) {
        self.provider_proxy_counts = counts;
        self.updated_at = chrono::Local::now().to_rfc3339();
    }

    /// 获取提供者节点总数
    pub fn provider_proxy_total(&self) -> u32 {
        self.provider_proxy_counts.values().sum()
    }
}

/// Profile 配置内容（与 MiHomo 兼容的格式）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub struct ProfileConfig {
    /// 代理节点列表
    #[serde(default, alias = "Proxy")]
    pub proxies: Vec<ProxyConfig>,

    /// 代理组列表
    #[serde(default, alias = "Proxy Group")]
    pub proxy_groups: Vec<ProxyGroupConfig>,

    /// 代理提供者
    #[serde(
        default,
        alias = "proxy-provider",
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub proxy_providers: HashMap<String, ProxyProvider>,

    /// 规则提供者
    #[serde(
        default,
        alias = "rule-provider",
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub rule_providers: HashMap<String, RuleProvider>,

    /// 规则列表
    #[serde(default, alias = "Rule")]
    pub rules: Vec<String>,
}

impl ProfileConfig {
    /// 创建带有基本代理组的空配置
    pub fn with_default_group() -> Self {
        Self {
            proxies: vec![],
            proxy_groups: vec![ProxyGroupConfig {
                name: "PROXY".to_string(),
                group_type: "select".to_string(),
                proxies: vec!["DIRECT".to_string()],
                ..Default::default()
            }],
            proxy_providers: HashMap::new(),
            rule_providers: HashMap::new(),
            rules: vec!["MATCH,PROXY".to_string()],
        }
    }

    /// 获取代理节点数量
    pub fn proxy_count(&self) -> u32 {
        self.proxies.len() as u32
    }

    /// 获取代理组数量
    pub fn group_count(&self) -> u32 {
        self.proxy_groups.len() as u32
    }

    /// 获取规则数量
    pub fn rule_count(&self) -> u32 {
        self.rules.len() as u32
    }

    /// 获取代理提供者数量
    pub fn provider_count(&self) -> u32 {
        self.proxy_providers.len() as u32
    }

    /// 检查代理名称是否存在
    pub fn has_proxy(&self, name: &str) -> bool {
        self.proxies.iter().any(|p| p.name == name)
    }
}
