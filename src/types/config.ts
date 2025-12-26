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
 * 应用设置
 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoStart: boolean;
  systemProxy: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
}

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
};




