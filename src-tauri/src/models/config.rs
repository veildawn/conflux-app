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
        rename = "proxy-providers",
        default,
        skip_serializing_if = "std::collections::HashMap::is_empty"
    )]
    pub proxy_providers: std::collections::HashMap<String, ProxyProvider>,

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

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tun: Option<TunConfig>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dns: Option<DnsConfig>,
}

/// DNS Fallback 过滤器配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DnsFallbackFilter {
    #[serde(default)]
    pub geoip: bool,

    #[serde(rename = "geoip-code", skip_serializing_if = "Option::is_none")]
    pub geoip_code: Option<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub geosite: Vec<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ipcidr: Vec<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub domain: Vec<String>,
}

/// DNS 配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DnsConfig {
    /// 是否启用 DNS
    #[serde(default)]
    pub enable: bool,

    /// DNS 监听地址
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listen: Option<String>,

    /// DNS 处理模式: normal, fake-ip, redir-host
    #[serde(rename = "enhanced-mode", skip_serializing_if = "Option::is_none")]
    pub enhanced_mode: Option<String>,

    /// Fake IP 范围
    #[serde(rename = "fake-ip-range", skip_serializing_if = "Option::is_none")]
    pub fake_ip_range: Option<String>,

    /// Fake IP 过滤模式: blacklist, whitelist
    #[serde(
        rename = "fake-ip-filter-mode",
        skip_serializing_if = "Option::is_none"
    )]
    pub fake_ip_filter_mode: Option<String>,

    /// Fake IP 过滤列表
    #[serde(
        rename = "fake-ip-filter",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub fake_ip_filter: Vec<String>,

    /// 默认 DNS 服务器（用于解析 DNS 服务器域名）
    #[serde(
        rename = "default-nameserver",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub default_nameserver: Vec<String>,

    /// 主 DNS 服务器
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nameserver: Vec<String>,

    /// 备用 DNS 服务器
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback: Vec<String>,

    /// Fallback 过滤器
    #[serde(rename = "fallback-filter", skip_serializing_if = "Option::is_none")]
    pub fallback_filter: Option<DnsFallbackFilter>,

    /// 是否优先使用 HTTP/3
    #[serde(rename = "prefer-h3", default)]
    pub prefer_h3: bool,

    /// 是否使用 hosts 文件
    #[serde(rename = "use-hosts", default = "default_true")]
    pub use_hosts: bool,

    /// 是否使用系统 hosts
    #[serde(rename = "use-system-hosts", default = "default_true")]
    pub use_system_hosts: bool,

    /// DNS 连接是否遵循路由规则
    #[serde(rename = "respect-rules", default)]
    pub respect_rules: bool,

    /// 缓存算法: lru, arc
    #[serde(rename = "cache-algorithm", skip_serializing_if = "Option::is_none")]
    pub cache_algorithm: Option<String>,
}

fn default_true() -> bool {
    true
}

/// TUN 配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TunConfig {
    #[serde(default)]
    pub enable: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,

    #[serde(rename = "auto-route", skip_serializing_if = "Option::is_none")]
    pub auto_route: Option<bool>,

    #[serde(
        rename = "auto-detect-interface",
        skip_serializing_if = "Option::is_none"
    )]
    pub auto_detect_interface: Option<bool>,

    /// 严格路由，强制所有流量（包括局域网）走 TUN
    /// 确保局域网 DNS 也能被正确劫持
    #[serde(rename = "strict-route", skip_serializing_if = "Option::is_none")]
    pub strict_route: Option<bool>,

    /// DNS 劫持地址列表，TUN 模式下必需
    /// 例如: ["any:53", "tcp://any:53"]
    #[serde(rename = "dns-hijack", default, skip_serializing_if = "Vec::is_empty")]
    pub dns_hijack: Vec<String>,
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
                ..Default::default()
            }],
            proxy_providers: std::collections::HashMap::new(),
            rule_providers: std::collections::HashMap::new(),
            rules: vec!["GEOIP,CN,DIRECT".to_string(), "MATCH,PROXY".to_string()],
            ipv6: false,
            tcp_concurrent: false,
            tun: None,
            dns: None,
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

    #[serde(
        flatten,
        default,
        skip_serializing_if = "std::collections::HashMap::is_empty"
    )]
    pub extra: std::collections::HashMap<String, serde_yaml::Value>,
}

/// 代理组配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyGroupConfig {
    pub name: String,
    #[serde(rename = "type")]
    pub group_type: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proxies: Vec<String>,
    #[serde(rename = "use", default, skip_serializing_if = "Vec::is_empty")]
    pub use_providers: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub lazy: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u32>,

    #[serde(rename = "max-failed-times", skip_serializing_if = "Option::is_none")]
    pub max_failed_times: Option<u32>,

    #[serde(rename = "disable-udp", skip_serializing_if = "Option::is_none")]
    pub disable_udp: Option<bool>,

    #[serde(rename = "include-all", skip_serializing_if = "Option::is_none")]
    pub include_all: Option<bool>,

    #[serde(
        rename = "include-all-proxies",
        skip_serializing_if = "Option::is_none"
    )]
    pub include_all_proxies: Option<bool>,

    #[serde(
        rename = "include-all-providers",
        skip_serializing_if = "Option::is_none"
    )]
    pub include_all_providers: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,

    #[serde(rename = "exclude-filter", skip_serializing_if = "Option::is_none")]
    pub exclude_filter: Option<String>,

    #[serde(rename = "exclude-type", skip_serializing_if = "Option::is_none")]
    pub exclude_type: Option<String>,

    #[serde(rename = "expected-status", skip_serializing_if = "Option::is_none")]
    pub expected_status: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tolerance: Option<u32>,
}

/// 代理提供者配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProvider {
    #[serde(rename = "type")]
    pub provider_type: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u32>,

    #[serde(rename = "health-check", skip_serializing_if = "Option::is_none")]
    pub health_check: Option<HealthCheck>,
}

/// 健康检查配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub enable: bool,

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
            rule_databases: vec![],
        }
    }
}
