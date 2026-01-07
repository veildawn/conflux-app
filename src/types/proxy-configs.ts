/**
 * 增强的代理配置类型定义
 * 使用 discriminated unions 提供更好的类型安全
 */

// 基础代理配置
interface BaseProxyConfig {
  name: string;
  server: string;
  port: number;
  udp?: boolean;
  tls?: boolean;
  'skip-cert-verify'?: boolean;
  sni?: string;
  'client-fingerprint'?: string;
  'interface-name'?: string;
  'routing-mark'?: number;
}

// Shadowsocks 配置
export interface ShadowsocksProxyConfig extends BaseProxyConfig {
  type: 'ss';
  cipher: string;
  password: string;
  plugin?: string;
  'plugin-opts'?: Record<string, unknown>;
}

// ShadowsocksR 配置
export interface ShadowsocksRProxyConfig extends BaseProxyConfig {
  type: 'ssr';
  cipher: string;
  password: string;
  obfs: string;
  protocol: string;
  'obfs-param'?: string;
  'protocol-param'?: string;
}

// VMess 配置
export interface VMessProxyConfig extends BaseProxyConfig {
  type: 'vmess';
  uuid: string;
  alterId: number;
  cipher?: string;
  network?: 'tcp' | 'ws' | 'http' | 'h2' | 'grpc' | 'quic';
  'ws-opts'?: {
    path?: string;
    headers?: Record<string, string>;
  };
  'http-opts'?: {
    method?: string;
    path?: string[];
    headers?: Record<string, string[]>;
  };
  'h2-opts'?: {
    host?: string[];
    path?: string;
  };
  'grpc-opts'?: {
    'grpc-service-name'?: string;
  };
}

// VLESS 配置
export interface VLESSProxyConfig extends BaseProxyConfig {
  type: 'vless';
  uuid: string;
  flow?: string;
  network?: 'tcp' | 'ws' | 'http' | 'h2' | 'grpc' | 'quic';
  'ws-opts'?: {
    path?: string;
    headers?: Record<string, string>;
  };
  'grpc-opts'?: {
    'grpc-service-name'?: string;
  };
  'reality-opts'?: {
    'public-key': string;
    'short-id'?: string;
  };
}

// Trojan 配置
export interface TrojanProxyConfig extends BaseProxyConfig {
  type: 'trojan';
  password: string;
  network?: 'tcp' | 'ws' | 'grpc';
  'ws-opts'?: {
    path?: string;
    headers?: Record<string, string>;
  };
  'grpc-opts'?: {
    'grpc-service-name'?: string;
  };
}

// Hysteria 配置
export interface HysteriaProxyConfig extends BaseProxyConfig {
  type: 'hysteria';
  'auth-str'?: string;
  alpn?: string[];
  protocol?: string;
  up?: string;
  down?: string;
  'recv-window'?: number;
  'recv-window-conn'?: number;
  'disable-mtu-discovery'?: boolean;
}

// Hysteria2 配置
export interface Hysteria2ProxyConfig extends BaseProxyConfig {
  type: 'hysteria2';
  password: string;
  alpn?: string[];
  up?: string;
  down?: string;
  obfs?: string;
  'obfs-password'?: string;
}

// WireGuard 配置
export interface WireGuardProxyConfig extends BaseProxyConfig {
  type: 'wireguard';
  'private-key': string;
  'public-key': string;
  ip?: string;
  ipv6?: string;
  'preshared-key'?: string;
  reserved?: number[];
  mtu?: number;
  'remote-dns-resolve'?: boolean;
  dns?: string[];
}

// TUIC 配置
export interface TUICProxyConfig extends BaseProxyConfig {
  type: 'tuic';
  uuid: string;
  password: string;
  'congestion-controller'?: string;
  'udp-relay-mode'?: string;
  'reduce-rtt'?: boolean;
  alpn?: string[];
}

// HTTP 代理配置
export interface HTTPProxyConfig extends BaseProxyConfig {
  type: 'http';
  username?: string;
  password?: string;
}

// SOCKS5 代理配置
export interface SOCKS5ProxyConfig extends BaseProxyConfig {
  type: 'socks5';
  username?: string;
  password?: string;
}

// SSH 代理配置
export interface SSHProxyConfig extends BaseProxyConfig {
  type: 'ssh';
  username: string;
  password?: string;
  'private-key'?: string;
  'private-key-passphrase'?: string;
  'host-key'?: string[];
  'host-key-algorithms'?: string[];
}

// Snell 配置
export interface SnellProxyConfig extends BaseProxyConfig {
  type: 'snell';
  psk: string;
  version?: number;
  'obfs-opts'?: {
    mode?: string;
    host?: string;
  };
}

// 所有代理类型的联合类型
export type TypedProxyConfig =
  | ShadowsocksProxyConfig
  | ShadowsocksRProxyConfig
  | VMessProxyConfig
  | VLESSProxyConfig
  | TrojanProxyConfig
  | HysteriaProxyConfig
  | Hysteria2ProxyConfig
  | WireGuardProxyConfig
  | TUICProxyConfig
  | HTTPProxyConfig
  | SOCKS5ProxyConfig
  | SSHProxyConfig
  | SnellProxyConfig;

// 代理类型字面量
export type ProxyType = TypedProxyConfig['type'];

// 所有支持的代理类型列表
export const PROXY_TYPES: ProxyType[] = [
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'hysteria',
  'hysteria2',
  'wireguard',
  'tuic',
  'http',
  'socks5',
  'ssh',
  'snell',
];

// 代理类型显示名称映射
export const PROXY_TYPE_LABELS: Record<ProxyType, string> = {
  ss: 'Shadowsocks',
  ssr: 'ShadowsocksR',
  vmess: 'VMess',
  vless: 'VLESS',
  trojan: 'Trojan',
  hysteria: 'Hysteria',
  hysteria2: 'Hysteria2',
  wireguard: 'WireGuard',
  tuic: 'TUIC',
  http: 'HTTP',
  socks5: 'SOCKS5',
  ssh: 'SSH',
  snell: 'Snell',
};

// 类型守卫函数
export function isShadowsocksProxy(config: TypedProxyConfig): config is ShadowsocksProxyConfig {
  return config.type === 'ss';
}

export function isVMessProxy(config: TypedProxyConfig): config is VMessProxyConfig {
  return config.type === 'vmess';
}

export function isVLESSProxy(config: TypedProxyConfig): config is VLESSProxyConfig {
  return config.type === 'vless';
}

export function isTrojanProxy(config: TypedProxyConfig): config is TrojanProxyConfig {
  return config.type === 'trojan';
}

export function isHysteria2Proxy(config: TypedProxyConfig): config is Hysteria2ProxyConfig {
  return config.type === 'hysteria2';
}
