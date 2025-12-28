import { invoke } from '@tauri-apps/api/core';
import type { ProxyStatus, ProxyGroup, TrafficData, ConnectionsResponse, RuleItem, VersionInfo, ProxyServerInfo } from '@/types/proxy';
import type { MihomoConfig, AppSettings, DownloadResourceResult, ResourceUpdateCheckRequest, ResourceUpdateCheckResult } from '@/types/config';

/**
 * IPC 服务 - 与 Tauri 后端通信
 */
export const ipc = {
  // ============= 代理命令 =============

  /**
   * 启动代理
   */
  async startProxy(): Promise<void> {
    return invoke('start_proxy');
  },

  /**
   * 停止代理
   */
  async stopProxy(): Promise<void> {
    return invoke('stop_proxy');
  },

  /**
   * 重启代理
   */
  async restartProxy(): Promise<void> {
    return invoke('restart_proxy');
  },

  /**
   * 获取代理状态
   */
  async getProxyStatus(): Promise<ProxyStatus> {
    return invoke('get_proxy_status');
  },

  /**
   * 切换代理模式
   */
  async switchMode(mode: string): Promise<void> {
    return invoke('switch_mode', { mode });
  },

  /**
   * 获取代理组列表
   */
  async getProxies(): Promise<ProxyGroup[]> {
    return invoke('get_proxies');
  },

  /**
   * 选择代理节点
   */
  async selectProxy(group: string, name: string): Promise<void> {
    return invoke('select_proxy', { group, name });
  },

  /**
   * 测试代理延迟
   */
  async testProxyDelay(name: string): Promise<number> {
    return invoke('test_proxy_delay', { name });
  },

  /**
   * 获取流量数据
   */
  async getTraffic(): Promise<TrafficData> {
    return invoke('get_traffic');
  },

  /**
   * 获取连接列表
   */
  async getConnections(): Promise<ConnectionsResponse> {
    return invoke('get_connections');
  },

  /**
   * 关闭单个连接
   */
  async closeConnection(id: string): Promise<void> {
    return invoke('close_connection', { id });
  },

  /**
   * 关闭所有连接
   */
  async closeAllConnections(): Promise<void> {
    return invoke('close_all_connections');
  },

  /**
   * 设置 TUN 模式（增强模式）
   * 在 macOS 上，如果没有权限会自动请求设置
   */
  async setTunMode(enabled: boolean): Promise<void> {
    return invoke('set_tun_mode', { enabled });
  },

  /**
   * 设置 LAN 访问开关
   */
  async setAllowLan(enabled: boolean): Promise<void> {
    return invoke('set_allow_lan', { enabled });
  },

  /**
   * 设置 HTTP/SOCKS 端口
   */
  async setPorts(port: number, socksPort: number): Promise<void> {
    return invoke('set_ports', { port, socks_port: socksPort });
  },

  /**
   * 设置 IPv6 开关
   */
  async setIpv6(enabled: boolean): Promise<void> {
    return invoke('set_ipv6', { enabled });
  },

  /**
   * 设置 TCP 并发开关
   */
  async setTcpConcurrent(enabled: boolean): Promise<void> {
    return invoke('set_tcp_concurrent', { enabled });
  },

  /**
   * 检查 TUN 权限状态
   */
  async checkTunPermission(): Promise<boolean> {
    return invoke('check_tun_permission');
  },

  /**
   * 手动设置 TUN 权限
   */
  async setupTunPermission(): Promise<void> {
    return invoke('setup_tun_permission');
  },

  // ============= 配置命令 =============

  /**
   * 获取 MiHomo 配置
   */
  async getConfig(): Promise<MihomoConfig> {
    return invoke('get_config');
  },

  /**
   * 保存 MiHomo 配置
   */
  async saveConfig(config: MihomoConfig): Promise<void> {
    return invoke('save_config', { config });
  },

  /**
   * 获取应用设置
   */
  async getAppSettings(): Promise<AppSettings> {
    return invoke('get_app_settings');
  },

  /**
   * 保存应用设置
   */
  async saveAppSettings(settings: AppSettings): Promise<void> {
    return invoke('save_app_settings', { settings });
  },

  /**
   * 应用订阅配置
   */
  async applySubscription(path: string, subType: string): Promise<{
    proxies_count: number;
    proxy_groups_count: number;
    rules_count: number;
  }> {
    return invoke('apply_subscription', { path, sub_type: subType });
  },

  /**
   * 获取配置文件中的规则
   */
  async getRules(): Promise<string[]> {
    return invoke('get_rules');
  },

  /**
   * 保存规则到配置文件
   */
  async saveRules(rules: string[]): Promise<void> {
    return invoke('save_rules', { rules });
  },

  /**
   * 从 mihomo API 获取运行时规则
   */
  async getRulesFromApi(): Promise<RuleItem[]> {
    // 后端使用 serde(rename = "type")，所以返回的字段就是 type
    return invoke<RuleItem[]>('get_rules_from_api');
  },

  /**
   * 下载外部资源文件（GeoIP、GeoSite 等）
   * 支持版本检查，如果传入 currentEtag 或 currentModified，会先检查是否有更新
   * @param url 下载地址
   * @param fileName 文件名
   * @param currentEtag 当前的 ETag（可选，用于版本检查）
   * @param currentModified 当前的 Last-Modified（可选，用于版本检查）
   * @param force 是否强制下载（忽略版本检查）
   * @returns 下载结果，包含是否实际下载了文件以及新的版本信息
   */
  async downloadResource(
    url: string, 
    fileName: string,
    currentEtag?: string,
    currentModified?: string,
    force?: boolean,
    updateSourceType?: string,
    githubRepo?: string,
    assetName?: string
  ): Promise<DownloadResourceResult> {
    return invoke('download_resource', { 
      url, 
      fileName, 
      currentEtag, 
      currentModified,
      force,
      updateSourceType,
      githubRepo,
      assetName
    });
  },

  /**
   * 检查外部资源文件状态
   */
  async checkResourceFiles(fileNames: string[]): Promise<{
    fileName: string;
    exists: boolean;
    size: number | null;
    modified: string | null;
  }[]> {
    return invoke('check_resource_files', { fileNames });
  },

  /**
   * 批量检查资源是否有更新（只检查，不下载）
   */
  async checkResourceUpdates(resources: ResourceUpdateCheckRequest[]): Promise<ResourceUpdateCheckResult[]> {
    return invoke('check_resource_updates', { resources });
  },

  /**
   * 重新加载 GEO 数据库
   */
  async reloadGeoDatabase(): Promise<void> {
    return invoke('reload_geo_database');
  },

  /**
   * 获取核心版本信息
   */
  async getCoreVersion(): Promise<VersionInfo> {
    return invoke('get_core_version');
  },

  /**
   * 获取配置文件中的代理服务器列表
   */
  async getConfigProxies(): Promise<ProxyServerInfo[]> {
    return invoke('get_config_proxies');
  },

  // ============= 系统命令 =============

  /**
   * 设置系统代理
   */
  async setSystemProxy(): Promise<void> {
    return invoke('set_system_proxy');
  },

  /**
   * 清除系统代理
   */
  async clearSystemProxy(): Promise<void> {
    return invoke('clear_system_proxy');
  },

  /**
   * 获取系统代理状态
   */
  async getSystemProxyStatus(): Promise<boolean> {
    return invoke('get_system_proxy_status');
  },

  // ============= Provider 命令 =============

  /**
   * 获取代理 Provider 列表
   */
  async getProxyProviders(): Promise<{
    name: string;
    type: string;
    vehicleType: string;
    proxies: { name: string; type: string; udp?: boolean; now?: string }[];
    updatedAt?: string;
    subscriptionInfo?: {
      Upload?: number;
      Download?: number;
      Total?: number;
      Expire?: number;
    };
  }[]> {
    return invoke('get_proxy_providers');
  },

  /**
   * 更新代理 Provider
   */
  async updateProxyProvider(name: string): Promise<void> {
    return invoke('update_proxy_provider', { name });
  },

  /**
   * 代理 Provider 健康检查
   */
  async healthCheckProxyProvider(name: string): Promise<void> {
    return invoke('health_check_proxy_provider', { name });
  },

  /**
   * 获取规则 Provider 列表
   */
  async getRuleProviders(): Promise<{
    name: string;
    type: string;
    behavior: string;
    ruleCount: number;
    updatedAt?: string;
    vehicleType: string;
  }[]> {
    return invoke('get_rule_providers');
  },

  /**
   * 更新规则 Provider
   */
  async updateRuleProvider(name: string): Promise<void> {
    return invoke('update_rule_provider', { name });
  },

  // ============= 日志命令 =============

  /**
   * 开始日志流
   */
  async startLogStream(level: string): Promise<void> {
    return invoke('start_log_stream', { level });
  },

  /**
   * 停止日志流
   */
  async stopLogStream(): Promise<void> {
    return invoke('stop_log_stream');
  },

  /**
   * 设置日志级别
   */
  async setLogLevel(level: string): Promise<void> {
    return invoke('set_log_level', { level });
  },

  // ============= 设置命令 =============

  /**
   * 设置混合端口
   */
  async setMixedPort(port: number | null): Promise<void> {
    return invoke('set_mixed_port', { port });
  },

  /**
   * 设置进程查找模式
   */
  async setFindProcessMode(mode: string): Promise<void> {
    return invoke('set_find_process_mode', { mode });
  },

  /**
   * 获取应用版本
   */
  async getAppVersion(): Promise<string> {
    return invoke('get_app_version');
  },

  // ============= Sub-Store 命令 =============

  /**
   * 启动 Sub-Store
   */
  async startSubStore(): Promise<void> {
    return invoke('start_substore');
  },

  /**
   * 停止 Sub-Store
   */
  async stopSubStore(): Promise<void> {
    return invoke('stop_substore');
  },

  /**
   * 获取 Sub-Store 状态
   */
  async getSubStoreStatus(): Promise<{ running: boolean; api_url: string; api_port: number }> {
    return invoke('get_substore_status');
  },
};

export default ipc;


