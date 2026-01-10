use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MiHomo 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MihomoConfig {
    #[serde(default = "default_port")]
    pub port: Option<u16>,

    #[serde(rename = "socks-port", default = "default_socks_port")]
    pub socks_port: Option<u16>,

    #[serde(rename = "mixed-port", default = "default_mixed_port")]
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

    /// 域名嗅探配置（mihomo 使用 sniffer 配置块）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sniffer: Option<SnifferConfig>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tun: Option<TunConfig>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dns: Option<DnsConfig>,
}

/// Sniffer 配置（域名嗅探）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnifferConfig {
    /// 是否启用域名嗅探
    #[serde(default)]
    pub enable: bool,

    /// 覆盖目标地址（使用嗅探到的域名替代 IP）
    #[serde(rename = "override-destination", default = "default_true")]
    pub override_destination: bool,

    /// 强制嗅探纯 IP 连接
    #[serde(rename = "parse-pure-ip", default)]
    pub parse_pure_ip: bool,

    /// 要嗅探的协议和端口配置
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sniff: Option<SniffProtocols>,

    /// 强制嗅探的域名（支持通配符）
    #[serde(
        rename = "force-domain",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub force_domain: Vec<String>,

    /// 跳过嗅探的域名（支持通配符）
    #[serde(rename = "skip-domain", default, skip_serializing_if = "Vec::is_empty")]
    pub skip_domain: Vec<String>,
}

/// 嗅探协议配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SniffProtocols {
    #[serde(rename = "TLS", skip_serializing_if = "Option::is_none")]
    pub tls: Option<SniffProtocolConfig>,

    #[serde(rename = "HTTP", skip_serializing_if = "Option::is_none")]
    pub http: Option<SniffProtocolConfig>,
}

/// 单个协议的嗅探配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SniffProtocolConfig {
    /// 要嗅探的端口列表
    #[serde(default)]
    pub ports: Vec<String>,

    /// 是否覆盖目标地址
    #[serde(rename = "override-destination", default = "default_true")]
    pub override_destination: bool,
}

impl Default for SnifferConfig {
    fn default() -> Self {
        Self {
            enable: true,
            override_destination: true,
            parse_pure_ip: true,
            sniff: Some(SniffProtocols {
                tls: Some(SniffProtocolConfig {
                    ports: vec!["443".to_string(), "8443".to_string()],
                    override_destination: true,
                }),
                http: Some(SniffProtocolConfig {
                    ports: vec!["80".to_string(), "8080-8880".to_string()],
                    override_destination: true,
                }),
            }),
            force_domain: vec![],
            skip_domain: vec![],
        }
    }
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    /// 代理服务器 DNS（用于解析代理节点域名，避免 TUN 循环依赖）
    #[serde(
        rename = "proxy-server-nameserver",
        default = "default_proxy_server_nameserver"
    )]
    pub proxy_server_nameserver: Vec<String>,

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
    #[serde(rename = "respect-rules", default = "default_true")]
    pub respect_rules: bool,

    /// 缓存算法: lru, arc
    #[serde(rename = "cache-algorithm", skip_serializing_if = "Option::is_none")]
    pub cache_algorithm: Option<String>,

    /// 域名策略：根据域名分流到不同 DNS 服务器
    /// 例如: {"geosite:cn": ["223.5.5.5"], "geosite:gfw": ["https://dns.cloudflare.com/dns-query"]}
    #[serde(
        rename = "nameserver-policy",
        default,
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub nameserver_policy: HashMap<String, Vec<String>>,
}

impl Default for DnsConfig {
    fn default() -> Self {
        // 构建 nameserver-policy：根据域名类型分流到不同 DNS
        let mut nameserver_policy = HashMap::new();
        // 国内域名 → 国内 DNS（直连，避免污染）
        nameserver_policy.insert(
            "geosite:cn".to_string(),
            vec!["223.5.5.5".to_string(), "119.29.29.29".to_string()],
        );
        // GFW 域名 → 海外 DNS（走代理）
        nameserver_policy.insert(
            "geosite:gfw".to_string(),
            vec![
                "https://dns.cloudflare.com/dns-query".to_string(),
                "https://dns.google/dns-query".to_string(),
            ],
        );
        // 私有域名 → 国内 DNS
        nameserver_policy.insert(
            "geosite:private".to_string(),
            vec!["223.5.5.5".to_string(), "119.29.29.29".to_string()],
        );

        Self {
            enable: true,
            listen: Some("0.0.0.0:1053".to_string()),
            enhanced_mode: Some("fake-ip".to_string()),
            fake_ip_range: Some("198.10.0.1/1".to_string()),
            fake_ip_filter_mode: Some("blacklist".to_string()),
            fake_ip_filter: vec![
                "+.lan".to_string(),
                "+.local".to_string(),
                "geosite:private".to_string(),
                "geosite:cn".to_string(),
            ],
            // 默认 DNS：用于解析其他 DNS 服务器的域名（必须是纯 IP）
            default_nameserver: vec!["223.5.5.5".to_string(), "119.29.29.29".to_string()],
            // 代理服务器 DNS：用于解析代理节点域名（必须是纯 IP，避免循环依赖）
            proxy_server_nameserver: vec!["223.5.5.5".to_string(), "119.29.29.29".to_string()],
            // 主 DNS：作为兜底，未匹配 nameserver-policy 的域名使用
            nameserver: vec![
                "https://223.5.5.5/dns-query".to_string(),
                "https://doh.pub/dns-query".to_string(),
            ],
            // fallback 清空：使用 nameserver-policy 后不再需要 fallback 机制
            fallback: vec![],
            fallback_filter: None,
            prefer_h3: false,
            use_hosts: true,
            use_system_hosts: true,
            respect_rules: true,
            cache_algorithm: Some("arc".to_string()),
            nameserver_policy,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_proxy_server_nameserver() -> Vec<String> {
    vec!["223.5.5.5".to_string(), "119.29.29.29".to_string()]
}

/// TUN 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    /// IPv4 路由排除地址列表
    /// 显式排除内网网段，即使在全局模式下这些 IP 也不经过代理
    /// 默认值: ["192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12", "127.0.0.1/32"]
    #[serde(
        rename = "inet4-route-exclude-address",
        default = "default_inet4_route_exclude_address",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub inet4_route_exclude_address: Vec<String>,
}

impl Default for TunConfig {
    fn default() -> Self {
        Self {
            enable: true,
            stack: Some("system".to_string()),
            auto_route: Some(true),
            auto_detect_interface: Some(true),
            strict_route: Some(false),
            dns_hijack: vec!["any:53".to_string(), "tcp://any:53".to_string()],
            inet4_route_exclude_address: default_inet4_route_exclude_address(),
        }
    }
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

fn default_port() -> Option<u16> {
    Some(7890)
}
fn default_socks_port() -> Option<u16> {
    Some(7891)
}
fn default_mixed_port() -> Option<u16> {
    Some(7892)
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

/// 默认排除的内网网段
fn default_inet4_route_exclude_address() -> Vec<String> {
    vec![
        "192.168.0.0/16".to_string(),
        "10.0.0.0/8".to_string(),
        "172.16.0.0/12".to_string(),
        "127.0.0.1/32".to_string(),
    ]
}

impl Default for MihomoConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            socks_port: default_socks_port(),
            mixed_port: default_mixed_port(),
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
            sniffer: Some(SnifferConfig::default()),
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

/// WebDAV 同步配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    /// 是否启用
    #[serde(default)]
    pub enabled: bool,

    /// WebDAV 服务器地址
    #[serde(default)]
    pub url: String,

    /// 用户名
    #[serde(default)]
    pub username: String,

    /// 密码
    #[serde(default)]
    pub password: String,

    /// 配置变更后自动上传
    #[serde(default)]
    pub auto_upload: bool,

    /// 上次同步时间
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync_time: Option<String>,
}

/// MiHomo 用户设置（存储在 settings.json 中，用于生成运行时 config.yaml）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MihomoSettings {
    /// HTTP 代理端口
    #[serde(default = "default_port")]
    pub port: Option<u16>,

    /// SOCKS5 代理端口
    #[serde(default = "default_socks_port")]
    pub socks_port: Option<u16>,

    /// 混合代理端口
    #[serde(default = "default_mixed_port")]
    pub mixed_port: Option<u16>,

    /// 允许局域网连接
    #[serde(default)]
    pub allow_lan: bool,

    /// 启用 IPv6
    #[serde(default)]
    pub ipv6: bool,

    /// TCP 并发
    #[serde(default)]
    pub tcp_concurrent: bool,

    /// 进程查找模式
    #[serde(default = "default_find_process_mode")]
    pub find_process_mode: String,

    /// TUN 模式配置
    #[serde(default)]
    pub tun: TunConfig,

    /// DNS 配置
    #[serde(default)]
    pub dns: DnsConfig,
}

impl Default for MihomoSettings {
    fn default() -> Self {
        Self {
            port: default_port(),
            socks_port: default_socks_port(),
            mixed_port: default_mixed_port(),
            allow_lan: true,
            ipv6: false,
            tcp_concurrent: true,
            find_process_mode: default_find_process_mode(),
            tun: TunConfig::default(),
            dns: DnsConfig::default(),
        }
    }
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

    /// WebDAV 同步配置
    #[serde(default)]
    pub webdav: WebDavConfig,

    /// MiHomo 用户设置（端口、DNS、TUN 等）
    #[serde(default)]
    pub mihomo: MihomoSettings,
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
            webdav: WebDavConfig::default(),
            mihomo: MihomoSettings::default(),
        }
    }
}
