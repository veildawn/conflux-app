use serde::{Deserialize, Serialize};

/// MiHomo 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MihomoConfig {
    #[serde(default = "default_port")]
    pub port: u16,

    #[serde(rename = "socks-port", default = "default_socks_port")]
    pub socks_port: u16,

    #[serde(rename = "mixed-port")]
    pub mixed_port: Option<u16>,

    #[serde(rename = "allow-lan", default)]
    pub allow_lan: bool,

    #[serde(default = "default_mode")]
    pub mode: String,

    #[serde(rename = "log-level", default = "default_log_level")]
    pub log_level: String,

    #[serde(
        rename = "external-controller",
        default = "default_external_controller"
    )]
    pub external_controller: String,

    #[serde(default)]
    pub secret: String,

    // 启用进程查找
    #[serde(rename = "find-process-mode", default = "default_find_process_mode")]
    pub find_process_mode: String,

    // GeoData 相关配置
    #[serde(rename = "geodata-mode", default)]
    pub geodata_mode: bool,

    #[serde(rename = "geodata-loader", skip_serializing_if = "Option::is_none")]
    pub geodata_loader: Option<String>,

    #[serde(rename = "geo-auto-update", default)]
    pub geo_auto_update: bool,

    #[serde(
        rename = "geo-update-interval",
        skip_serializing_if = "Option::is_none"
    )]
    pub geo_update_interval: Option<u32>,

    #[serde(rename = "geox-url", skip_serializing_if = "Option::is_none")]
    pub geox_url: Option<GeoxUrl>,

    #[serde(default)]
    pub proxies: Vec<ProxyConfig>,

    #[serde(rename = "proxy-groups", default)]
    pub proxy_groups: Vec<ProxyGroupConfig>,

    #[serde(
        rename = "rule-providers",
        default,
        skip_serializing_if = "std::collections::HashMap::is_empty"
    )]
    pub rule_providers: std::collections::HashMap<String, RuleProvider>,

    #[serde(default)]
    pub rules: Vec<String>,

    #[serde(default)]
    pub ipv6: bool,

    #[serde(rename = "tcp-concurrent", default)]
    pub tcp_concurrent: bool,
}

/// GeoX URL 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoxUrl {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geoip: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub geosite: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub mmdb: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub asn: Option<String>,
}

fn default_port() -> u16 {
    7890
}
fn default_socks_port() -> u16 {
    7891
}
fn default_mode() -> String {
    "rule".to_string()
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_external_controller() -> String {
    "127.0.0.1:9090".to_string()
}
fn default_find_process_mode() -> String {
    "always".to_string()
}

impl Default for MihomoConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            socks_port: default_socks_port(),
            mixed_port: None,
            allow_lan: false,
            mode: default_mode(),
            log_level: default_log_level(),
            external_controller: default_external_controller(),
            secret: String::new(),
            find_process_mode: default_find_process_mode(),
            geodata_mode: true,
            geodata_loader: Some("memconservative".to_string()),
            geo_auto_update: false,
            geo_update_interval: Some(24),
            geox_url: None,
            proxies: vec![],
            proxy_groups: vec![ProxyGroupConfig {
                name: "PROXY".to_string(),
                group_type: "select".to_string(),
                proxies: vec!["DIRECT".to_string()],
                url: None,
                interval: None,
            }],
            rule_providers: std::collections::HashMap::new(),
            rules: vec!["GEOIP,CN,DIRECT".to_string(), "MATCH,PROXY".to_string()],
            ipv6: false,
            tcp_concurrent: false,
        }
    }
}

/// 代理节点配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub server: String,
    pub port: u16,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub cipher: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "alterId")]
    pub alter_id: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<bool>,

    #[serde(rename = "skip-cert-verify", skip_serializing_if = "Option::is_none")]
    pub skip_cert_verify: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub sni: Option<String>,

    #[serde(default)]
    pub udp: bool,
}

/// 代理组配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyGroupConfig {
    pub name: String,
    #[serde(rename = "type")]
    pub group_type: String,
    pub proxies: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u32>,
}

/// 规则提供者配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleProvider {
    #[serde(rename = "type")]
    pub provider_type: String,

    /// behavior 是必需字段，默认为 "classical"
    #[serde(default = "default_behavior")]
    pub behavior: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u32>,
}

fn default_behavior() -> String {
    "classical".to_string()
}

/// 订阅配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub sub_type: String, // "remote" | "local"
    pub url: String, // URL or File Path
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(default)]
    pub selected: bool,
}

/// 规则数据库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDatabaseItem {
    pub id: String,
    pub name: String,
    pub url: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub auto_update: bool,

    #[serde(rename = "updateSourceType", skip_serializing_if = "Option::is_none")]
    pub update_source_type: Option<String>,

    #[serde(rename = "githubRepo", skip_serializing_if = "Option::is_none")]
    pub github_repo: Option<String>,

    #[serde(rename = "assetName", skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,

    /// 远程文件的 ETag，用于版本检查
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    /// 远程文件的 Last-Modified，用于版本检查
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_modified: Option<String>,
}

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_language")]
    pub language: String,

    #[serde(rename = "autoStart", default)]
    pub auto_start: bool,

    #[serde(rename = "systemProxy", default)]
    pub system_proxy: bool,

    #[serde(rename = "closeToTray", default = "default_close_to_tray")]
    pub close_to_tray: bool,

    #[serde(default)]
    pub subscriptions: Vec<Subscription>,

    #[serde(rename = "ruleDatabases", default)]
    pub rule_databases: Vec<RuleDatabaseItem>,
}

fn default_language() -> String {
    "zh-CN".to_string()
}
fn default_close_to_tray() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
            auto_start: false,
            system_proxy: false,
            close_to_tray: default_close_to_tray(),
            subscriptions: vec![],
            rule_databases: vec![],
        }
    }
}
