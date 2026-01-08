/**
 * GeoX URL 配置
 */
export interface GeoxUrl {
  geoip?: string;
  geosite?: string;
  mmdb?: string;
  asn?: string;
}

/**
 * DNS Fallback 过滤器配置
 */
export interface DnsFallbackFilter {
  geoip?: boolean;
  'geoip-code'?: string;
  geosite?: string[];
  ipcidr?: string[];
  domain?: string[];
}

/**
 * DNS 配置
 */
export interface DnsConfig {
  /** 是否启用 DNS */
  enable?: boolean;
  /** DNS 监听地址 */
  listen?: string;
  /** DNS 处理模式: normal, fake-ip, redir-host */
  'enhanced-mode'?: 'normal' | 'fake-ip' | 'redir-host';
  /** Fake IP 范围 */
  'fake-ip-range'?: string;
  /** Fake IP 过滤模式: blacklist, whitelist */
  'fake-ip-filter-mode'?: 'blacklist' | 'whitelist';
  /** Fake IP 过滤列表 */
  'fake-ip-filter'?: string[];
  /** 默认 DNS 服务器（用于解析 DNS 服务器域名） */
  'default-nameserver'?: string[];
  /** 代理服务器 DNS（用于解析代理节点域名，避免 TUN 模式循环依赖） */
  'proxy-server-nameserver'?: string[];
  /** 主 DNS 服务器 */
  nameserver?: string[];
  /** 备用 DNS 服务器 */
  fallback?: string[];
  /** Fallback 过滤器 */
  'fallback-filter'?: DnsFallbackFilter;
  /** 是否优先使用 HTTP/3 */
  'prefer-h3'?: boolean;
  /** 是否使用 hosts 文件 */
  'use-hosts'?: boolean;
  /** 是否使用系统 hosts */
  'use-system-hosts'?: boolean;
  /** DNS 连接是否遵循路由规则 */
  'respect-rules'?: boolean;
  /** 缓存算法: lru, arc */
  'cache-algorithm'?: 'lru' | 'arc';
}

/**
 * TUN 配置
 */
export interface TunConfig {
  enable: boolean;
  stack?: string;
  'auto-route'?: boolean;
  'auto-detect-interface'?: boolean;
  'strict-route'?: boolean;
  'dns-hijack'?: string[];
  /**
   * IPv4 路由排除地址列表
   * 显式排除内网网段，即使在全局模式下这些 IP 也不经过代理
   */
  'inet4-route-exclude-address'?: string[];
}

/**
 * MiHomo 配置
 */
export interface MihomoConfig {
  port: number;
  'socks-port': number;
  'mixed-port'?: number;
  'allow-lan': boolean;
  ipv6?: boolean;
  'tcp-concurrent'?: boolean;
  mode: string;
  'log-level': string;
  'external-controller': string;
  secret: string;
  'find-process-mode'?: string;
  // GeoData 相关配置
  'geodata-mode'?: boolean;
  'geodata-loader'?: string;
  'geo-auto-update'?: boolean;
  'geo-update-interval'?: number;
  'geox-url'?: GeoxUrl;
  tun?: TunConfig;
  dns?: DnsConfig;
  proxies: ProxyConfig[];
  'proxy-groups': ProxyGroupConfig[];
  rules: string[];
}

/**
 * 代理节点配置
 */
export interface ProxyConfig {
  name: string;
  type: string;
  server: string;
  port: number;
  cipher?: string;
  password?: string;
  uuid?: string;
  alterId?: number;
  network?: string;
  tls?: boolean;
  'skip-cert-verify'?: boolean;
  sni?: string;
  udp?: boolean;
  [key: string]: unknown;
}

/**
 * 代理组配置
 */
export interface ProxyGroupConfig {
  name: string;
  type: string;
  proxies?: string[];
  use?: string[];
  url?: string;
  interval?: number;
  lazy?: boolean;
  timeout?: number;
  'max-failed-times'?: number;
  'disable-udp'?: boolean;
  'include-all'?: boolean;
  'include-all-proxies'?: boolean;
  'include-all-providers'?: boolean;
  filter?: string;
  'exclude-filter'?: string;
  'exclude-type'?: string;
  'expected-status'?: string;
  hidden?: boolean;
  icon?: string;
  strategy?: string;
  tolerance?: number;
}

/**
 * 规则类型
 */
export type RuleType =
  | 'DOMAIN'
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'GEOIP'
  | 'GEOSITE'
  | 'IP-CIDR'
  | 'IP-CIDR6'
  | 'SRC-IP-CIDR'
  | 'SRC-PORT'
  | 'DST-PORT'
  | 'PROCESS-NAME'
  | 'PROCESS-PATH'
  | 'RULE-SET'
  | 'MATCH';

/**
 * 规则类型配置
 */
export const RULE_TYPES: {
  value: RuleType;
  label: string;
  description: string;
  hasPayload: boolean;
}[] = [
  { value: 'DOMAIN', label: '域名', description: '完整域名匹配', hasPayload: true },
  { value: 'DOMAIN-SUFFIX', label: '域名后缀', description: '匹配域名后缀', hasPayload: true },
  {
    value: 'DOMAIN-KEYWORD',
    label: '域名关键词',
    description: '匹配域名中的关键词',
    hasPayload: true,
  },
  { value: 'GEOIP', label: 'GeoIP', description: '根据 IP 地理位置匹配', hasPayload: true },
  { value: 'GEOSITE', label: 'GeoSite', description: '根据域名分类匹配', hasPayload: true },
  { value: 'IP-CIDR', label: 'IP-CIDR', description: '匹配 IPv4 CIDR', hasPayload: true },
  { value: 'IP-CIDR6', label: 'IP-CIDR6', description: '匹配 IPv6 CIDR', hasPayload: true },
  { value: 'SRC-IP-CIDR', label: '源 IP', description: '匹配源 IP 地址', hasPayload: true },
  { value: 'SRC-PORT', label: '源端口', description: '匹配源端口', hasPayload: true },
  { value: 'DST-PORT', label: '目标端口', description: '匹配目标端口', hasPayload: true },
  { value: 'PROCESS-NAME', label: '进程名', description: '匹配进程名称', hasPayload: true },
  { value: 'PROCESS-PATH', label: '进程路径', description: '匹配进程完整路径', hasPayload: true },
  { value: 'RULE-SET', label: '规则集', description: '使用外部规则集', hasPayload: true },
  { value: 'MATCH', label: '兜底规则', description: '匹配所有未命中规则的流量', hasPayload: false },
];

/**
 * 策略类型
 */
export type PolicyType = 'DIRECT' | 'REJECT' | 'PROXY' | string;

/**
 * 解析规则字符串
 */
export function parseRule(
  ruleStr: string
): { type: RuleType; payload: string; policy: string } | null {
  const parts = ruleStr.split(',');
  if (parts.length < 2) return null;

  const type = parts[0] as RuleType;

  // MATCH 规则只有策略，没有 payload
  if (type === 'MATCH') {
    return { type, payload: '', policy: parts[1] };
  }

  if (parts.length < 3) return null;
  return { type, payload: parts[1], policy: parts[2] };
}

/**
 * 构建规则字符串
 */
export function buildRule(type: RuleType, payload: string, policy: string): string {
  if (type === 'MATCH') {
    return `${type},${policy}`;
  }
  return `${type},${payload},${policy}`;
}

// ==================== Profile 系统 ====================

/**
 * Profile 类型
 */
export type ProfileType = 'remote' | 'local' | 'blank';

/**
 * Profile 元数据
 */
export interface ProfileMetadata {
  id: string;
  name: string;
  profileType: ProfileType;
  /** 远程订阅 URL（仅 remote 类型） */
  url?: string;
  createdAt: string;
  updatedAt: string;
  proxyCount: number;
  groupCount: number;
  ruleCount: number;
  /** 是否自动生成默认规则（远程订阅且无规则时） */
  defaultRulesApplied?: boolean;
  active: boolean;
  /** 自动更新（仅 remote 类型） */
  autoUpdate?: boolean;
  /** 更新间隔（小时，仅 remote 类型） */
  updateInterval?: number;
}

/**
 * 健康检查配置
 */
export interface HealthCheck {
  enable: boolean;
  url?: string;
  interval?: number;
}

/**
 * Proxy Provider 配置
 */
export interface ProxyProvider {
  type: string;
  url?: string;
  path?: string;
  interval?: number;
  'health-check'?: HealthCheck;
}

/**
 * Rule Provider 配置
 */
export interface RuleProvider {
  type: string;
  behavior: string;
  format?: string;
  url?: string;
  path?: string;
  interval?: number;
}

/**
 * Profile 配置内容
 */
export interface ProfileConfig {
  proxies: ProxyConfig[];
  'proxy-groups': ProxyGroupConfig[];
  'proxy-providers': Record<string, ProxyProvider>;
  'rule-providers': Record<string, RuleProvider>;
  rules: string[];
}

/**
 * 完整的 Profile（元数据 + 配置）
 */
export interface Profile {
  metadata: ProfileMetadata;
  config: ProfileConfig;
}

/**
 * 应用设置
 */
export interface AppSettings {
  language: string;
  autoStart: boolean;
  systemProxy: boolean;
  closeToTray: boolean;
  ruleDatabases: RuleDatabaseItem[];
}

/**
 * 规则数据库配置
 */
export interface RuleDatabaseItem {
  id: string;
  name: string;
  url: string;
  fileName: string;
  updatedAt?: string;
  autoUpdate: boolean;
  /** 更新源类型 */
  updateSourceType?: 'default' | 'github-release';
  /** GitHub 仓库信息 (owner/repo) */
  githubRepo?: string;
  /** GitHub Release Asset 名称匹配模式 (可选) */
  assetName?: string;
  /** 远程文件的 ETag，用于版本检查 */
  etag?: string;
  /** 远程文件的 Last-Modified，用于版本检查 */
  remoteModified?: string;
}

/**
 * 下载资源结果
 */
export interface DownloadResourceResult {
  /** 是否已下载（false 表示无需更新） */
  downloaded: boolean;
  /** 新的 ETag */
  etag?: string;
  /** 新的 Last-Modified */
  remoteModified?: string;
}

/**
 * 资源更新检查请求
 */
export interface ResourceUpdateCheckRequest {
  url: string;
  currentEtag?: string;
  currentModified?: string;
  updateSourceType?: 'default' | 'github-release';
  githubRepo?: string;
  assetName?: string;
}

/**
 * 资源更新检查结果
 */
export interface ResourceUpdateCheckResult {
  url: string;
  hasUpdate: boolean;
  etag?: string;
  remoteModified?: string;
  error?: string;
}

export const DEFAULT_RULE_DATABASES: RuleDatabaseItem[] = [
  {
    id: 'geoip-lite',
    name: 'GeoIP Lite',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat',
    fileName: 'geoip-lite.dat',
    autoUpdate: true,
    updateSourceType: 'github-release',
    githubRepo: 'MetaCubeX/meta-rules-dat',
    assetName: 'geoip-lite.dat',
  },
  {
    id: 'geosite',
    name: 'GeoSite',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    fileName: 'geosite.dat',
    autoUpdate: true,
    updateSourceType: 'github-release',
    githubRepo: 'MetaCubeX/meta-rules-dat',
    assetName: 'geosite.dat',
  },
  {
    id: 'geoip-metadb',
    name: 'GeoIP MetaDB',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
    fileName: 'geoip.metadb',
    autoUpdate: true,
    updateSourceType: 'github-release',
    githubRepo: 'MetaCubeX/meta-rules-dat',
    assetName: 'geoip.metadb',
  },
  {
    id: 'geolite2-asn',
    name: 'GeoLite2 ASN',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb',
    fileName: 'GeoLite2-ASN.mmdb',
    autoUpdate: true,
    updateSourceType: 'github-release',
    githubRepo: 'MetaCubeX/meta-rules-dat',
    assetName: 'GeoLite2-ASN.mmdb',
  },
];

/**
 * 默认应用设置
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'zh-CN',
  autoStart: false,
  systemProxy: false,
  closeToTray: true,
  ruleDatabases: DEFAULT_RULE_DATABASES,
};

/**
 * 应用版本信息
 */
export interface AppVersionInfo {
  version: string;
  coreVersion: string;
}
