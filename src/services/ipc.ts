import { invoke } from '@tauri-apps/api/core';
import type { ProxyStatus, ProxyGroup, TrafficData, ConnectionsResponse, RuleItem } from '@/types/proxy';
import type { MihomoConfig, AppSettings } from '@/types/config';

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
   */
  async setTunMode(enabled: boolean): Promise<void> {
    return invoke('set_tun_mode', { enabled });
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
};

export default ipc;




