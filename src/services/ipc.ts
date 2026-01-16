import { invoke } from '@tauri-apps/api/core';
import type { NetworkExtensionStatus } from '@/types/network';
import type {
  ProxyStatus,
  ProxyGroup,
  TrafficData,
  ConnectionsResponse,
  RuleItem,
  VersionInfo,
  ProxyServerInfo,
} from '@/types/proxy';
import type { LocalIpInfo, PublicIpInfo } from '@/types/network';
import type {
  MihomoConfig,
  AppSettings,
  DownloadResourceResult,
  ResourceUpdateCheckRequest,
  ResourceUpdateCheckResult,
  ProfileMetadata,
  ProfileConfig,
  ProxyConfig,
  ProxyProvider,
  RuleProvider,
  ProxyGroupConfig,
  WebDavConfig,
  SyncState,
  SyncResult,
  ConflictInfo,
} from '@/types/config';

/**
 * IPC 服务 - 与 Tauri 后端通信
 */
export const ipc = {
  // ============= 代理命令 =============

  /**
   * 启动代理
   * @returns 启动成功后的代理状态
   */
  async startProxy(): Promise<ProxyStatus> {
    return invoke('start_proxy');
  },

  /**
   * 以普通模式启动代理（强制禁用 TUN 模式）
   * 用于用户取消管理员权限对话框时
   */
  async startProxyNormalMode(): Promise<void> {
    return invoke('start_proxy_normal_mode');
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
   * 获取当前运行模式
   * 返回核心的运行模式（普通/服务/管理员/助手）
   */
  async getRunMode(): Promise<'normal' | 'service' | 'admin_win' | 'helper_mac'> {
    return invoke('get_run_mode');
  },

  /**
   * 获取代理组列表
   * @param mode 可选的模式过滤：'global' 只返回 GLOBAL，'rule' 返回除 GLOBAL 外的策略组，'direct' 返回空数组
   */
  async getProxies(mode?: string): Promise<ProxyGroup[]> {
    return invoke('get_proxies', { mode });
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
   * 设置 TUN Stack
   */
  async setTunStack(stack: string): Promise<void> {
    return invoke('set_tun_stack', { stack });
  },

  /**
   * 设置 TUN 严格路由开关
   */
  async setStrictRoute(enabled: boolean): Promise<void> {
    return invoke('set_strict_route', { enabled });
  },

  /**
   * 设置 TUN 路由排除地址
   * 用于排除内网网段，即使在全局模式下这些 IP 也不经过代理
   */
  async setTunRouteExclude(addresses: string[]): Promise<void> {
    return invoke('set_tun_route_exclude', { addresses });
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
    return invoke('set_ports', { port, socksPort });
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
   * 设置域名嗅探开关
   */
  async setSniffing(enabled: boolean): Promise<void> {
    return invoke('set_sniffing', { enabled });
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

  /**
   * 获取 macOS Network Extension 状态（占位：用于增强模式引导）
   */
  async getNetworkExtensionStatus(): Promise<NetworkExtensionStatus> {
    return invoke('get_network_extension_status');
  },

  /**
   * 打开系统设置中的 Network Extension 面板（尽力而为）
   */
  async openNetworkExtensionSettings(): Promise<void> {
    return invoke('open_network_extension_settings');
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
      assetName,
    });
  },

  /**
   * 检查外部资源文件状态
   */
  async checkResourceFiles(fileNames: string[]): Promise<
    {
      fileName: string;
      exists: boolean;
      size: number | null;
      modified: string | null;
    }[]
  > {
    return invoke('check_resource_files', { fileNames });
  },

  /**
   * 批量检查资源是否有更新（只检查，不下载）
   */
  async checkResourceUpdates(
    resources: ResourceUpdateCheckRequest[]
  ): Promise<ResourceUpdateCheckResult[]> {
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

  /**
   * 获取公网 IP 信息（IP + 国家代码）
   */
  async getPublicIpInfo(): Promise<PublicIpInfo | null> {
    return invoke('get_public_ip_info');
  },

  /**
   * 获取本机局域网 IP 信息（枚举网卡地址）
   */
  async getLocalIpInfo(): Promise<LocalIpInfo> {
    return invoke('get_local_ip_info');
  },

  /**
   * 获取终端代理命令（export / PowerShell env）
   */
  async getTerminalProxyCommand(): Promise<string> {
    return invoke('get_terminal_proxy_command');
  },
  /**
   * 复制文本到系统剪贴板（后端执行，避免 WebView 权限限制）
   */
  async copyToClipboard(text: string): Promise<void> {
    return invoke('copy_to_clipboard', { text });
  },

  /**
   * 复制终端代理命令到系统剪贴板（后端执行）
   * @returns 返回复制的命令文本
   */
  async copyTerminalProxyCommand(): Promise<string> {
    return invoke('copy_terminal_proxy_command');
  },

  /**
   * 获取进程对应的应用图标（PNG data URL）
   * - 优先使用 processPath（更准确）
   * - 兜底使用 processName（best-effort）
   */
  async getProcessIcon(params: {
    processName?: string;
    processPath?: string;
  }): Promise<string | null> {
    const { processName, processPath } = params;
    return invoke('get_process_icon', { processName, processPath });
  },

  // ============= Provider 命令 =============

  /**
   * 获取代理 Provider 列表
   */
  async getProxyProviders(): Promise<
    {
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
    }[]
  > {
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
  async getRuleProviders(): Promise<
    {
      name: string;
      type: string;
      behavior: string;
      ruleCount: number;
      updatedAt?: string;
      vehicleType: string;
    }[]
  > {
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

  /**
   * 清除 FakeIP 缓存
   */
  async flushFakeipCache(): Promise<void> {
    return invoke('flush_fakeip_cache');
  },

  /**
   * 获取开机自启动状态
   */
  async getAutostartEnabled(): Promise<boolean> {
    return invoke('get_autostart_enabled');
  },

  /**
   * 设置开机自启动
   */
  async setAutostartEnabled(enabled: boolean): Promise<void> {
    return invoke('set_autostart_enabled', { enabled });
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

  /**
   * 获取 Sub-Store 订阅列表
   */
  async getSubStoreSubs(): Promise<
    { name: string; displayName?: string; icon?: string; url?: string }[]
  > {
    return invoke('get_substore_subs');
  },

  /**
   * 获取 Sub-Store 组合配置列表
   */
  async getSubStoreCollections(): Promise<
    { name: string; displayName?: string; subscriptions?: string[] }[]
  > {
    return invoke('get_substore_collections');
  },

  // ============= Profile 命令 =============

  /**
   * 获取所有 Profile 列表
   */
  async listProfiles(): Promise<ProfileMetadata[]> {
    return invoke('list_profiles');
  },

  /**
   * 获取单个 Profile 详情
   */
  async getProfile(id: string): Promise<[ProfileMetadata, ProfileConfig]> {
    return invoke('get_profile', { id });
  },

  /**
   * 获取当前活跃的 Profile ID
   */
  async getActiveProfileId(): Promise<string | null> {
    return invoke('get_active_profile_id');
  },

  /**
   * 创建远程订阅 Profile
   */
  async createRemoteProfile(name: string, url: string): Promise<ProfileMetadata> {
    return invoke('create_remote_profile', { name, url });
  },

  /**
   * 创建本地文件 Profile
   */
  async createLocalProfile(name: string, filePath: string): Promise<ProfileMetadata> {
    return invoke('create_local_profile', { name, filePath });
  },

  /**
   * 创建空白 Profile
   */
  async createBlankProfile(name: string): Promise<ProfileMetadata> {
    return invoke('create_blank_profile', { name });
  },

  /**
   * 删除 Profile
   */
  async deleteProfile(id: string): Promise<void> {
    return invoke('delete_profile', { id });
  },

  /**
   * 重命名 Profile
   */
  async renameProfile(id: string, newName: string): Promise<ProfileMetadata> {
    return invoke('rename_profile', { id, newName });
  },

  /**
   * 激活 Profile
   */
  async activateProfile(id: string): Promise<void> {
    return invoke('activate_profile', { id });
  },

  /**
   * 刷新远程 Profile
   */
  async refreshProfile(id: string): Promise<ProfileMetadata> {
    return invoke('refresh_profile', { id });
  },

  /**
   * 解析配置文件（预览，不保存）
   */
  async parseConfigFile(path: string): Promise<ProfileConfig> {
    return invoke('parse_config_file', { path });
  },

  /**
   * 预览远程配置（不保存）
   */
  async previewRemoteConfig(url: string): Promise<ProfileConfig> {
    return invoke('preview_remote_config', { url });
  },

  /**
   * 导出 Profile 配置到指定路径
   */
  async exportProfileConfig(id: string, targetPath: string): Promise<void> {
    return invoke('export_profile_config', { id, targetPath });
  },

  /**
   * 更新 Profile 的提供者节点数量统计
   * @param id Profile ID
   * @param counts 每个提供者的节点数量映射（提供者名称 -> 节点数量）
   */
  async updateProfileProviderStats(
    id: string,
    counts: Record<string, number>
  ): Promise<ProfileMetadata> {
    return invoke('update_profile_provider_stats', { id, counts });
  },

  // ============= Profile 代理 CRUD =============

  /**
   * 添加代理节点到 Profile
   */
  async addProxy(profileId: string, proxy: ProxyConfig): Promise<void> {
    return invoke('add_proxy', { profileId, proxy });
  },

  /**
   * 更新代理节点
   */
  async updateProxy(profileId: string, proxyName: string, proxy: ProxyConfig): Promise<void> {
    return invoke('update_proxy', { profileId, proxyName, proxy });
  },

  /**
   * 删除代理节点
   */
  async deleteProxy(profileId: string, proxyName: string): Promise<void> {
    return invoke('delete_proxy', { profileId, proxyName });
  },

  // ============= Profile 规则命令 =============

  /**
   * 添加规则到 Profile
   */
  async addRuleToProfile(profileId: string, rule: string, position?: number): Promise<void> {
    return invoke('add_rule_to_profile', { profileId, rule, position });
  },

  /**
   * 删除 Profile 中的规则
   */
  async deleteRuleFromProfile(profileId: string, index: number): Promise<void> {
    return invoke('delete_rule_from_profile', { profileId, index });
  },

  /**
   * 添加 rule-provider 到 Profile
   */
  async addRuleProviderToProfile(
    profileId: string,
    name: string,
    provider: RuleProvider
  ): Promise<void> {
    return invoke('add_rule_provider_to_profile', { profileId, name, provider });
  },

  /**
   * 删除 Profile 中的 rule-provider
   */
  async deleteRuleProviderFromProfile(profileId: string, name: string): Promise<void> {
    return invoke('delete_rule_provider_from_profile', { profileId, name });
  },

  /**
   * 更新 Profile 中的 rule-provider
   */
  async updateRuleProviderInProfile(
    profileId: string,
    name: string,
    provider: RuleProvider
  ): Promise<void> {
    return invoke('update_rule_provider_in_profile', { profileId, name, provider });
  },

  /**
   * 重命名 Profile 中的 rule-provider（同时更新所有规则中的引用）
   */
  async renameRuleProviderInProfile(
    profileId: string,
    oldName: string,
    newName: string,
    provider: RuleProvider
  ): Promise<void> {
    return invoke('rename_rule_provider_in_profile', { profileId, oldName, newName, provider });
  },

  /**
   * 更新 Profile 配置
   */
  async updateProfileConfig(profileId: string, config: ProfileConfig): Promise<ProfileMetadata> {
    return invoke('update_profile_config', { profileId, config });
  },

  // ============= Proxy Provider CRUD =============

  /**
   * 添加 proxy-provider 到 Profile
   */
  async addProxyProviderToProfile(
    profileId: string,
    name: string,
    provider: ProxyProvider
  ): Promise<void> {
    return invoke('add_proxy_provider_to_profile', { profileId, name, provider });
  },

  /**
   * 更新 Profile 中的 proxy-provider
   */
  async updateProxyProviderInProfile(
    profileId: string,
    name: string,
    provider: ProxyProvider
  ): Promise<void> {
    return invoke('update_proxy_provider_in_profile', { profileId, name, provider });
  },

  /**
   * 重命名 Profile 中的 proxy-provider（同时更新所有代理组中的引用）
   */
  async renameProxyProviderInProfile(
    profileId: string,
    oldName: string,
    newName: string,
    provider: ProxyProvider
  ): Promise<void> {
    return invoke('rename_proxy_provider_in_profile', { profileId, oldName, newName, provider });
  },

  /**
   * 删除 Profile 中的 proxy-provider
   */
  async deleteProxyProviderFromProfile(profileId: string, name: string): Promise<void> {
    return invoke('delete_proxy_provider_from_profile', { profileId, name });
  },

  /**
   * 获取当前活跃 Profile 的完整配置
   */
  async getProfileConfig(): Promise<ProfileConfig> {
    const activeId = await invoke<string | null>('get_active_profile_id');
    if (!activeId) throw new Error('No active profile');
    const [, config] = await invoke<[ProfileMetadata, ProfileConfig]>('get_profile', {
      id: activeId,
    });
    return config;
  },

  /**
   * 重命名策略组（同时更新规则和其他策略组中的引用）
   */
  async renameProxyGroupInProfile(
    profileId: string,
    oldName: string,
    newName: string,
    group: ProxyGroupConfig
  ): Promise<void> {
    return invoke('rename_proxy_group_in_profile', { profileId, oldName, newName, group });
  },

  // ============= URL 延迟测试命令 =============

  /**
   * 测试单个 URL 的延迟
   * 通过本地代理发送 HTTP 请求，测量响应时间
   */
  async testUrlDelay(
    url: string,
    timeoutMs?: number
  ): Promise<{ url: string; delay: number | null; error: string | null }> {
    return invoke('test_url_delay', { url, timeoutMs });
  },

  /**
   * 批量测试多个 URL 的延迟
   */
  async testUrlsDelay(
    urls: string[],
    timeoutMs?: number
  ): Promise<{ url: string; delay: number | null; error: string | null }[]> {
    return invoke('test_urls_delay', { urls, timeoutMs });
  },

  /**
   * 更新当前活跃 Profile 中的策略组
   */
  async updateProxyGroup(group: ProxyGroupConfig, oldName?: string): Promise<void> {
    const activeId = await invoke<string | null>('get_active_profile_id');
    if (!activeId) throw new Error('No active profile');

    // 如果有 oldName 且名称变化，使用重命名 API（会自动更新规则和其他引用）
    if (oldName && oldName !== group.name) {
      return this.renameProxyGroupInProfile(activeId, oldName, group.name, group);
    }

    // Fetch current config
    const [, config] = await invoke<[ProfileMetadata, ProfileConfig]>('get_profile', {
      id: activeId,
    });

    const existing = config['proxy-groups'] || [];

    // Name check
    const nameTaken = existing.some((item) => item.name === group.name && item.name !== oldName);
    if (nameTaken) throw new Error('Group name already exists');

    const nextGroups = [...existing];

    if (oldName) {
      // 名称没变，只更新策略组内容
      const index = nextGroups.findIndex((item) => item.name === oldName);
      if (index === -1) throw new Error('Group not found to update');
      nextGroups[index] = group;
    } else {
      nextGroups.push(group);
    }

    const newConfig = { ...config, 'proxy-groups': nextGroups };
    await invoke('update_profile_config', { profileId: activeId, config: newConfig });
  },

  // ============= Windows 服务命令 (仅 Windows) =============

  /**
   * 获取 Windows 服务状态
   */
  async getServiceStatus(): Promise<{
    installed: boolean;
    running: boolean;
    mihomo_running: boolean;
    mihomo_pid: number | null;
  }> {
    return invoke('get_service_status');
  },

  /**
   * 安装 Windows 服务
   * 需要管理员权限
   */
  async installService(): Promise<void> {
    return invoke('install_service');
  },

  /**
   * 卸载 Windows 服务
   * 需要管理员权限
   */
  async uninstallService(): Promise<void> {
    return invoke('uninstall_service');
  },

  /**
   * 启动 Windows 服务
   */
  async startService(): Promise<void> {
    return invoke('start_service');
  },

  /**
   * 停止 Windows 服务
   */
  async stopService(): Promise<void> {
    return invoke('stop_service');
  },

  /**
   * 重启 Windows 服务
   */
  async restartService(): Promise<void> {
    return invoke('restart_service');
  },

  /**
   * 检查是否有管理员权限
   */
  async hasAdminPrivileges(): Promise<boolean> {
    return invoke('has_admin_privileges');
  },

  /**
   * 以管理员权限重启应用 (Windows)
   * 会触发 UAC 对话框，用户确认后应用将以管理员权限重新启动
   */
  async restartAsAdmin(): Promise<void> {
    return invoke('restart_as_admin');
  },

  /**
   * 重置所有用户数据
   * 删除所有配置和数据，然后重启应用
   */
  async resetAllData(): Promise<void> {
    return invoke('reset_all_data');
  },

  // ============= WebDAV 同步命令 =============

  /**
   * 测试 WebDAV 连接
   */
  async testWebDavConnection(config: WebDavConfig): Promise<boolean> {
    return invoke('test_webdav_connection', { config });
  },

  /**
   * 获取 WebDAV 配置
   */
  async getWebDavConfig(): Promise<WebDavConfig> {
    return invoke('get_webdav_config');
  },

  /**
   * 保存 WebDAV 配置
   */
  async saveWebDavConfig(config: WebDavConfig): Promise<void> {
    return invoke('save_webdav_config', { config });
  },

  /**
   * 上传配置到 WebDAV（强制全量上传）
   */
  async webDavUpload(): Promise<SyncResult> {
    return invoke('webdav_upload');
  },

  /**
   * 从 WebDAV 下载配置（强制全量下载）
   * @param force 是否强制下载（忽略冲突）
   */
  async webDavDownload(force: boolean = false): Promise<SyncResult> {
    return invoke('webdav_download', { force });
  },

  /**
   * 增量同步
   * 自动检测本地和远端的变化，执行双向增量同步。
   * 只同步有变化的文件，提高效率。
   */
  async webDavSync(): Promise<SyncResult> {
    return invoke('webdav_sync');
  },

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<SyncState> {
    return invoke('get_sync_status');
  },

  /**
   * 清除同步状态（重置为初始状态）
   */
  async clearSyncStatus(): Promise<void> {
    return invoke('clear_sync_status');
  },

  /**
   * 检查是否有冲突
   */
  async checkWebDavConflict(): Promise<ConflictInfo | null> {
    return invoke('check_webdav_conflict');
  },

  /**
   * 解决所有冲突
   * @param choice 'local' 保留本地，'remote' 使用远端
   */
  async resolveWebDavConflict(choice: 'local' | 'remote'): Promise<SyncResult> {
    return invoke('resolve_webdav_conflict', { choice });
  },

  /**
   * 解决单个文件的冲突
   * @param path 文件路径
   * @param choice 'local' 保留本地，'remote' 使用远端
   */
  async resolveFileConflict(path: string, choice: 'local' | 'remote'): Promise<void> {
    return invoke('resolve_file_conflict', { path, choice });
  },
};

export default ipc;
