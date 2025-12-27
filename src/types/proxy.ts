/**
 * 代理状态
 */
export interface ProxyStatus {
  running: boolean;
  mode: 'rule' | 'global' | 'direct';
  port: number;
  socks_port: number;
  mixed_port?: number;
  system_proxy: boolean;
  enhanced_mode?: boolean;
  allow_lan?: boolean;
  ipv6?: boolean;
  tcp_concurrent?: boolean;
}

/**
 * 代理服务器信息
 */
export interface ProxyServerInfo {
  name: string;
  type: string;
  server: string;
  port: number;
  udp?: boolean;
}

/**
 * 代理组
 */
export interface ProxyGroup {
  name: string;
  type: string;
  now?: string;
  all: string[];
}

/**
 * 代理节点
 */
export interface ProxyNode {
  name: string;
  type: string;
  delay?: number;
  udp: boolean;
  selected: boolean;
}

/**
 * 流量数据
 */
export interface TrafficData {
  up: number;
  down: number;
}

/**
 * 连接信息
 */
export interface Connection {
  id: string;
  metadata: ConnectionMetadata;
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
}

/**
 * 连接元数据
 */
export interface ConnectionMetadata {
  network: string;
  type: string;
  sourceIP: string;
  destinationIP: string;
  sourcePort: string;
  destinationPort: string;
  host: string;
  dnsMode: string;
  process?: string;
  processPath?: string;
}

/**
 * 连接列表响应
 */
export interface ConnectionsResponse {
  connections: Connection[];
  downloadTotal: number;
  uploadTotal: number;
}

/**
 * 代理模式类型
 */
export type ProxyMode = 'rule' | 'global' | 'direct';

/**
 * 代理模式配置
 */
export const PROXY_MODES: { value: ProxyMode; label: string; description: string }[] = [
  { value: 'rule', label: '规则模式', description: '根据规则自动分流' },
  { value: 'global', label: '全局模式', description: '所有流量走代理' },
  { value: 'direct', label: '直连模式', description: '所有流量直连' },
];

/**
 * 规则项（来自 mihomo API）
 */
export interface RuleItem {
  type: string;
  payload: string;
  proxy: string;
}

/**
 * 规则列表响应
 */
export interface RulesResponse {
  rules: RuleItem[];
}

/**
 * 核心版本信息
 */
export interface VersionInfo {
  version: string;
  meta: boolean;
}
