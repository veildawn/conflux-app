use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 代理状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub mode: String,
    pub port: u16,
    pub socks_port: u16,
    pub mixed_port: Option<u16>,
    pub system_proxy: bool,
    pub enhanced_mode: bool,
    pub allow_lan: bool,
    pub ipv6: bool,
    pub tcp_concurrent: bool,
}

impl Default for ProxyStatus {
    fn default() -> Self {
        Self {
            running: false,
            mode: "rule".to_string(),
            port: 7890,
            socks_port: 7891,
            mixed_port: None,
            system_proxy: false,
            enhanced_mode: false,
            allow_lan: false,
            ipv6: false,
            tcp_concurrent: false,
        }
    }
}

/// 代理节点信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    #[serde(default)]
    pub udp: bool,
    #[serde(default)]
    pub history: Vec<DelayHistory>,
    #[serde(default)]
    pub all: Vec<String>,
    #[serde(default)]
    pub now: Option<String>,
}

/// 延迟历史记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelayHistory {
    pub time: String,
    pub delay: u32,
}

/// 代理列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxiesResponse {
    pub proxies: HashMap<String, ProxyInfo>,
}

/// 延迟测试响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelayResponse {
    pub delay: u32,
}

/// 连接信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub metadata: ConnectionMetadata,
    pub upload: u64,
    pub download: u64,
    pub start: String,
    pub chains: Vec<String>,
    pub rule: String,
    #[serde(rename = "rulePayload")]
    pub rule_payload: String,
}

/// 连接元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionMetadata {
    pub network: String,
    #[serde(rename = "type")]
    pub conn_type: String,
    #[serde(rename = "sourceIP")]
    pub source_ip: String,
    #[serde(rename = "destinationIP")]
    pub destination_ip: String,
    #[serde(rename = "sourcePort")]
    pub source_port: String,
    #[serde(rename = "destinationPort")]
    pub destination_port: String,
    pub host: String,
    #[serde(rename = "dnsMode")]
    pub dns_mode: String,
    pub process: Option<String>,
    #[serde(rename = "processPath")]
    pub process_path: Option<String>,
}

/// 连接列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionsResponse {
    #[serde(default)]
    pub connections: Vec<Connection>,
    #[serde(rename = "downloadTotal")]
    pub download_total: u64,
    #[serde(rename = "uploadTotal")]
    pub upload_total: u64,
}

/// 流量数据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrafficData {
    pub up: u64,
    pub down: u64,
}

/// 版本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
    #[serde(default)]
    pub meta: bool,
}

/// 前端代理节点显示
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyNode {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub delay: Option<u32>,
    pub udp: bool,
    pub selected: bool,
}

/// 代理组
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyGroup {
    pub name: String,
    #[serde(rename = "type")]
    pub group_type: String,
    pub now: Option<String>,
    pub all: Vec<String>,
}

/// 规则项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleItem {
    #[serde(rename = "type")]
    pub rule_type: String,
    pub payload: String,
    pub proxy: String,
}

/// 规则列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulesResponse {
    pub rules: Vec<RuleItem>,
}

/// 代理 Provider 中的节点信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderProxy {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    #[serde(default)]
    pub udp: bool,
    pub now: Option<String>,
}

/// 订阅信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    #[serde(rename = "Upload")]
    pub upload: Option<u64>,
    #[serde(rename = "Download")]
    pub download: Option<u64>,
    #[serde(rename = "Total")]
    pub total: Option<u64>,
    #[serde(rename = "Expire")]
    pub expire: Option<u64>,
}

/// 代理 Provider 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProviderInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    #[serde(rename = "vehicleType")]
    pub vehicle_type: String,
    #[serde(default)]
    pub proxies: Vec<ProviderProxy>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "subscriptionInfo")]
    pub subscription_info: Option<SubscriptionInfo>,
}

/// 代理 Provider 列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProvidersResponse {
    pub providers: std::collections::HashMap<String, ProxyProviderInfo>,
}

/// 规则 Provider 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleProviderInfo {
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

/// 规则 Provider 列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleProvidersResponse {
    pub providers: std::collections::HashMap<String, RuleProviderInfo>,
}
