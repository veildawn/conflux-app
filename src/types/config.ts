/**
 * MiHomo 配置
 */
export interface MihomoConfig {
  port: number;
  'socks-port': number;
  'mixed-port'?: number;
  'allow-lan': boolean;
  mode: string;
  'log-level': string;
  'external-controller': string;
  secret: string;
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
}

/**
 * 代理组配置
 */
export interface ProxyGroupConfig {
  name: string;
  type: string;
  proxies: string[];
  url?: string;
  interval?: number;
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
export const RULE_TYPES: { value: RuleType; label: string; description: string; hasPayload: boolean }[] = [
  { value: 'DOMAIN', label: '域名', description: '完整域名匹配', hasPayload: true },
  { value: 'DOMAIN-SUFFIX', label: '域名后缀', description: '匹配域名后缀', hasPayload: true },
  { value: 'DOMAIN-KEYWORD', label: '域名关键词', description: '匹配域名中的关键词', hasPayload: true },
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
export function parseRule(ruleStr: string): { type: RuleType; payload: string; policy: string } | null {
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

/**
 * 订阅配置
 */
export interface Subscription {
  id: string;
  name: string;
  type: 'remote' | 'local';
  url: string; // URL or File Path
  updatedAt: string;
  count?: number; // Number of proxies
  selected?: boolean;
}

/**
 * 应用设置
 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoStart: boolean;
  systemProxy: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  subscriptions: Subscription[];
  externalResources: ExternalResource[];
}

/**
 * 外部资源配置
 */
export interface ExternalResource {
  id: string;
  name: string;
  url: string;
  fileName: string;
  updatedAt?: string;
  autoUpdate: boolean;
}

export const DEFAULT_EXTERNAL_RESOURCES: ExternalResource[] = [
  {
    id: 'geoip-lite',
    name: 'GeoIP Lite',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat',
    fileName: 'geoip-lite.dat',
    autoUpdate: true,
  },
  {
    id: 'geosite',
    name: 'GeoSite',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    fileName: 'geosite.dat',
    autoUpdate: true,
  },
  {
    id: 'geoip-metadb',
    name: 'GeoIP MetaDB',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
    fileName: 'geoip.metadb',
    autoUpdate: true,
  },
  {
    id: 'geolite2-asn',
    name: 'GeoLite2 ASN',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb',
    fileName: 'GeoLite2-ASN.mmdb',
    autoUpdate: true,
  },
];

/**
 * 默认应用设置
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  autoStart: false,
  systemProxy: false,
  startMinimized: false,
  closeToTray: true,
  subscriptions: [],
  externalResources: DEFAULT_EXTERNAL_RESOURCES,
};
