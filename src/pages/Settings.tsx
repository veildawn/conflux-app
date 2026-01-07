import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Network,
  Globe,
  ExternalLink,
  Server,
  RefreshCw,
  Info,
  Zap,
  LayoutGrid,
  Power,
  Trash2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useProxyStore } from '@/stores/proxyStore';
import type { DnsConfig, MihomoConfig } from '@/types/config';

// -----------------------------------------------------------------------------
// UI Components (Bento Style)
// -----------------------------------------------------------------------------

function BentoCard({
  className,
  children,
  title,
  description,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md rounded-[20px] shadow-sm border border-gray-100/50 dark:border-zinc-800/50 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || description || Icon) && (
        <div className="flex justify-between items-start px-5 pt-5 pb-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {Icon && <Icon className={cn('w-4 h-4', iconColor)} />}
              {title && (
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
              )}
            </div>
            {description && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {description}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 w-full">{children}</div>
    </div>
  );
}

function SettingItem({
  icon: Icon,
  iconBgColor = 'bg-gray-100 dark:bg-zinc-800',
  iconColor = 'text-gray-500',
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  iconBgColor?: string;
  iconColor?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 px-5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              iconBgColor,
              iconColor
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
            {title}
          </span>
          {description && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[200px] md:max-w-[300px]">
              {description}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4 flex items-center gap-2">{action}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 px-1 mb-3 mt-8 first:mt-0 uppercase tracking-wider">
      {title}
    </h2>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Settings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<MihomoConfig | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [coreVersion, setCoreVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'latest' | 'error'
  >('idle');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');
  const [dnsNameserverInput, setDnsNameserverInput] = useState('');
  const [dnsFallbackInput, setDnsFallbackInput] = useState('');
  const [dnsDefaultNameserverInput, setDnsDefaultNameserverInput] = useState('');
  const [dnsFakeIpFilterInput, setDnsFakeIpFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [flushingFakeip, setFlushingFakeip] = useState(false);

  const controlBase =
    'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-blue-500/50 h-7 text-xs shadow-none';
  const dnsEnabled = Boolean(config?.dns?.enable);

  const { status, fetchStatus, setAllowLan, setPorts, setIpv6, setTcpConcurrent } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      fetchStatus: state.fetchStatus,
      setAllowLan: state.setAllowLan,
      setPorts: state.setPorts,
      setIpv6: state.setIpv6,
      setTcpConcurrent: state.setTcpConcurrent,
    }))
  );

  const [httpPort, setHttpPort] = useState(String(status.port));
  const [socksPort, setSocksPort] = useState(String(status.socks_port));
  const [portsDirty, setPortsDirty] = useState(false);
  const [savingPorts, setSavingPorts] = useState(false);

  useEffect(() => {
    if (!portsDirty) {
      setHttpPort(String(status.port));
      setSocksPort(String(status.socks_port));
    }
  }, [status.port, status.socks_port, portsDirty]);

  const portError = useMemo(() => {
    const http = Number(httpPort);
    const socks = Number(socksPort);
    if (!Number.isInteger(http) || http < 1 || http > 65535) return 'HTTP 端口需在 1-65535';
    if (!Number.isInteger(socks) || socks < 1 || socks > 65535) return 'SOCKS5 端口需在 1-65535';
    return null;
  }, [httpPort, socksPort]);

  const handleSavePorts = async () => {
    if (portError) {
      toast({ title: '端口无效', description: portError, variant: 'destructive' });
      return;
    }
    try {
      setSavingPorts(true);
      await setPorts(Number(httpPort), Number(socksPort));
      setPortsDirty(false);
      toast({ title: '端口已保存' });
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSavingPorts(false);
    }
  };

  const handlePortBlur = () => {
    if (!portsDirty || savingPorts) return;
    void handleSavePorts();
  };

  const handleAllowLanToggle = (checked: boolean) => setAllowLan(checked).catch(console.error);
  const handleIpv6Toggle = (checked: boolean) => setIpv6(checked).catch(console.error);
  const handleTcpConcurrentToggle = (checked: boolean) =>
    setTcpConcurrent(checked).catch(console.error);

  const handleAutostartToggle = async (checked: boolean) => {
    try {
      await ipc.setAutostartEnabled(checked);
      setAutostart(checked);
      toast({ title: checked ? '已启用开机自启动' : '已关闭开机自启动' });
    } catch (error) {
      toast({ title: '设置失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleFlushFakeip = async () => {
    setFlushingFakeip(true);
    try {
      await ipc.flushFakeipCache();
      toast({ title: 'FakeIP 缓存已清除' });
    } catch (error) {
      toast({ title: '清除失败', description: String(error), variant: 'destructive' });
    } finally {
      setFlushingFakeip(false);
    }
  };

  const loadConfig = useCallback(async () => {
    try {
      const mihomoConfig = await ipc.getConfig();
      setConfig(mihomoConfig);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load config:', error);
      toast({ title: '加载配置失败', description: String(error), variant: 'destructive' });
      setLoading(false);
    }
  }, [toast]);

  const loadVersions = useCallback(async () => {
    try {
      setAppVersion(await ipc.getAppVersion());
      try {
        setCoreVersion((await ipc.getCoreVersion()).version || '未运行');
      } catch {
        setCoreVersion('未运行');
      }
      try {
        setAutostart(await ipc.getAutostartEnabled());
      } catch {
        // Autostart not supported on this platform
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadVersions();
    fetchStatus();
  }, [fetchStatus, loadConfig, loadVersions]);

  useEffect(() => {
    if (!config) return;
    setDnsNameserverInput((config.dns?.nameserver || []).join(', '));
    setDnsFallbackInput((config.dns?.fallback || []).join(', '));
    setDnsDefaultNameserverInput((config.dns?.['default-nameserver'] || []).join(', '));
    setDnsFakeIpFilterInput((config.dns?.['fake-ip-filter'] || []).join(', '));
  }, [config]);

  const isFakeIpMode = config?.dns?.['enhanced-mode'] === 'fake-ip';

  const normalizeVersion = (value: string) => value.trim().replace(/^v/i, '');
  const compareVersions = (next: string, current: string) => {
    const nextParts = normalizeVersion(next)
      .split('.')
      .map((p) => parseInt(p, 10) || 0);
    const currentParts = normalizeVersion(current)
      .split('.')
      .map((p) => parseInt(p, 10) || 0);
    const maxLen = Math.max(nextParts.length, currentParts.length);
    for (let i = 0; i < maxLen; i++) {
      const diff = (nextParts[i] || 0) - (currentParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  const checkForUpdates = async () => {
    setUpdateStatus('checking');
    try {
      const response = await fetch(
        'https://api.github.com/repos/Ashbaer/conflux-app/releases/latest',
        {
          headers: { Accept: 'application/vnd.github+json' },
        }
      );

      // 404 表示没有发布任何 release，视为已是最新版本
      if (response.status === 404) {
        setUpdateStatus('latest');
        toast({
          title: '已是最新版本',
          description: '暂无可用的更新版本',
        });
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const tag = String(data.tag_name || data.name || '').trim();
      const latest = normalizeVersion(tag);
      const releaseUrl = String(data.html_url || 'https://github.com/Ashbaer/conflux-app/releases');
      setLatestVersion(latest || tag);
      setUpdateUrl(releaseUrl);

      if (!latest) {
        setUpdateStatus('latest');
        toast({
          title: '已是最新版本',
          description: '暂无可用的更新版本',
        });
        return;
      }
      if (!appVersion) {
        setUpdateStatus('latest');
        return;
      }
      const hasUpdate = compareVersions(latest, appVersion) > 0;
      setUpdateStatus(hasUpdate ? 'available' : 'latest');
      toast({
        title: hasUpdate ? '发现新版本' : '已是最新版本',
        description: hasUpdate ? `最新版本 ${latest}` : `当前版本 ${normalizeVersion(appVersion)}`,
      });
    } catch (error) {
      console.error('Failed to check updates:', error);
      setUpdateStatus('error');
      toast({ title: '检查更新失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleConfigChange = async (updates: Partial<MihomoConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await ipc.saveConfig(newConfig);
      toast({ title: '配置已保存' });
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
      loadConfig();
    }
  };

  const handleMixedPortChange = async (value: string) => {
    const port = value === '' ? undefined : Number.parseInt(value, 10);
    try {
      await ipc.setMixedPort(port ?? null);
      setConfig((prev) => (prev ? { ...prev, 'mixed-port': port } : prev));
      toast({ title: '混合端口已更新' });
    } catch (error) {
      toast({ title: '更新失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleFindProcessModeChange = async (mode: string) => {
    try {
      await ipc.setFindProcessMode(mode);
      setConfig((prev) => (prev ? { ...prev, 'find-process-mode': mode } : prev));
      toast({ title: '进程查找模式已更新' });
    } catch (error) {
      toast({ title: '更新失败', description: String(error), variant: 'destructive' });
    }
  };

  const parseDnsList = (value: string) =>
    value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const getDefaultDnsConfig = (): DnsConfig => ({
    enable: true,
    listen: '0.0.0.0:1053',
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter-mode': 'blacklist',
    'fake-ip-filter': [
      '*.lan',
      '*.local',
      '*.localhost',
      '+.stun.*.*',
      '+.stun.*.*.*',
      'localhost.ptlogin2.qq.com',
      'dns.msftncsi.com',
      'www.msftncsi.com',
      'www.msftconnecttest.com',
    ],
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    nameserver: ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
    fallback: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query', 'tls://8.8.4.4:853'],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      geosite: ['gfw'],
      ipcidr: ['240.0.0.0/4', '0.0.0.0/32'],
    },
    'prefer-h3': true,
    'use-hosts': true,
    'use-system-hosts': true,
    'respect-rules': false,
    'cache-algorithm': 'arc',
  });

  const handleDnsConfigChange = async (updates: Partial<DnsConfig>) => {
    if (!config) return;
    if (updates.enable === true) {
      const currentDns = config.dns || {};
      const hasValidConfig =
        (currentDns.nameserver ?? []).length > 0 ||
        (currentDns['default-nameserver'] ?? []).length > 0;
      if (!hasValidConfig) {
        await handleConfigChange({ dns: getDefaultDnsConfig() });
        return;
      }
    }
    const nextDns = { ...(config.dns || {}), ...updates };
    await handleConfigChange({ dns: nextDns });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50 dark:bg-black/20 scroll-smooth">
      <div className="max-w-4xl mx-auto p-6 space-y-6 pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">设置</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理核心服务、网络连接与系统参数
          </p>
        </div>

        {/* 1. 通用设置 */}
        <div>
          <SectionHeader title="通用" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BentoCard className="md:col-span-2">
              <SettingItem
                icon={Globe}
                iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
                iconColor="text-emerald-500"
                title="界面语言"
                description="当前仅支持简体中文"
                action={
                  <Select value="zh-CN" disabled>
                    <SelectTrigger className={cn('w-28', controlBase)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />
              <SettingItem
                icon={Info}
                iconBgColor="bg-blue-50 dark:bg-blue-500/10"
                iconColor="text-blue-500"
                title="当前版本"
                description={`App: ${appVersion || '...'}${latestVersion ? ` (最新: ${latestVersion})` : ''} | Core: ${coreVersion || '...'}`}
                action={
                  <div className="flex items-center gap-2">
                    {updateStatus === 'available' && updateUrl && (
                      <a
                        href={updateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 text-xs hover:underline mr-2"
                      >
                        下载更新
                      </a>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkForUpdates}
                      disabled={updateStatus === 'checking'}
                      className="h-7 text-xs rounded-full px-3"
                    >
                      {updateStatus === 'checking' ? (
                        <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      {updateStatus === 'checking' ? '检查中' : '检查更新'}
                    </Button>
                  </div>
                }
              />
              <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />
              <SettingItem
                icon={Power}
                iconBgColor="bg-green-50 dark:bg-green-500/10"
                iconColor="text-green-500"
                title="开机自启动"
                description="登录系统后自动启动应用"
                action={
                  <Switch
                    checked={autostart}
                    onCheckedChange={handleAutostartToggle}
                    className="scale-90"
                  />
                }
              />
              <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />
              <SettingItem
                icon={ExternalLink}
                iconBgColor="bg-gray-100 dark:bg-zinc-800"
                iconColor="text-gray-500"
                title="项目主页"
                description="访问 GitHub 获取最新源码"
                action={
                  <Button variant="ghost" size="sm" asChild className="h-7 rounded-full text-xs">
                    <a
                      href="https://github.com/Ashbaer/conflux-app"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GitHub
                      <ExternalLink className="w-3 h-3 ml-1.5" />
                    </a>
                  </Button>
                }
              />
            </BentoCard>
          </div>
        </div>

        {/* 2. 网络设置 */}
        <div>
          <SectionHeader title="网络" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 端口配置 - 单独卡片 */}
            <BentoCard
              title="端口配置"
              icon={Network}
              iconColor="text-violet-500"
              className="md:col-span-1"
            >
              <div className="p-5 pt-2 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">HTTP / SOCKS</span>
                  <div className="flex items-center gap-2">
                    <Input
                      value={httpPort}
                      onChange={(e) => {
                        setHttpPort(e.target.value);
                        setPortsDirty(true);
                      }}
                      onBlur={handlePortBlur}
                      placeholder="7890"
                      className={cn('w-16 text-center font-mono', controlBase)}
                      title="HTTP Port"
                    />
                    <span className="text-gray-300 text-xs">/</span>
                    <Input
                      value={socksPort}
                      onChange={(e) => {
                        setSocksPort(e.target.value);
                        setPortsDirty(true);
                      }}
                      onBlur={handlePortBlur}
                      placeholder="7891"
                      className={cn('w-16 text-center font-mono', controlBase)}
                      title="SOCKS Port"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Mixed Port</span>
                  <Input
                    type="number"
                    value={config?.['mixed-port'] || ''}
                    onChange={(e) => handleMixedPortChange(e.target.value)}
                    placeholder="Mixed"
                    className={cn('w-20 text-center font-mono', controlBase)}
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-gray-600 dark:text-gray-300">局域网共享</span>
                  <Switch
                    checked={!!status.allow_lan}
                    onCheckedChange={handleAllowLanToggle}
                    className="scale-90"
                  />
                </div>
              </div>
            </BentoCard>

            {/* 高级选项 - 单独卡片 */}
            <BentoCard className="md:col-span-1">
              <SettingItem
                icon={Globe}
                iconBgColor="bg-indigo-50 dark:bg-indigo-500/10"
                iconColor="text-indigo-500"
                title="IPv6"
                description="启用 IPv6 协议栈"
                action={
                  <Switch
                    checked={!!status.ipv6}
                    onCheckedChange={handleIpv6Toggle}
                    className="scale-90"
                  />
                }
              />
              <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />
              <SettingItem
                icon={Zap}
                iconBgColor="bg-amber-50 dark:bg-amber-500/10"
                iconColor="text-amber-500"
                title="TCP 并发"
                description="并发连接以优化速度"
                action={
                  <Switch
                    checked={!!status.tcp_concurrent}
                    onCheckedChange={handleTcpConcurrentToggle}
                    className="scale-90"
                  />
                }
              />
              <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />
              <SettingItem
                icon={LayoutGrid}
                iconBgColor="bg-purple-50 dark:bg-purple-500/10"
                iconColor="text-purple-500"
                title="进程模式"
                description="流量匹配进程"
                action={
                  <Select
                    value={config?.['find-process-mode'] || 'always'}
                    onValueChange={handleFindProcessModeChange}
                  >
                    <SelectTrigger className={cn('w-24', controlBase)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Always</SelectItem>
                      <SelectItem value="strict">Strict</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </BentoCard>
          </div>
        </div>

        {/* 3. DNS 设置 */}
        <div>
          <SectionHeader title="DNS" />
          <div className="space-y-4">
            <BentoCard>
              <SettingItem
                icon={Server}
                iconBgColor="bg-orange-50 dark:bg-orange-500/10"
                iconColor="text-orange-500"
                title="DNS 劫持"
                description="启用内置 DNS 服务以处理 DNS 请求"
                action={
                  <Switch
                    checked={config?.dns?.enable || false}
                    onCheckedChange={(checked) => handleDnsConfigChange({ enable: checked })}
                    className="scale-90"
                  />
                }
              />
            </BentoCard>

            {dnsEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <BentoCard title="基础配置" icon={LayoutGrid} iconColor="text-orange-500">
                  <div className="p-4 pt-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        运行模式
                      </label>
                      <Select
                        value={config?.dns?.['enhanced-mode'] || 'normal'}
                        onValueChange={(value) =>
                          handleDnsConfigChange({
                            'enhanced-mode': value as DnsConfig['enhanced-mode'],
                          })
                        }
                      >
                        <SelectTrigger className={cn('w-32', controlBase)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="redir-host">Redir-Host</SelectItem>
                          <SelectItem value="fake-ip">Fake-IP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isFakeIpMode && (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Fake-IP 范围
                          </label>
                          <Input
                            value={config?.dns?.['fake-ip-range'] || '198.18.0.1/16'}
                            onChange={(e) =>
                              handleDnsConfigChange({ 'fake-ip-range': e.target.value })
                            }
                            placeholder="198.18.0.1/16"
                            className={cn('w-32 font-mono text-right', controlBase)}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Fake-IP 过滤
                            </label>
                            <Select
                              value={config?.dns?.['fake-ip-filter-mode'] || 'blacklist'}
                              onValueChange={(value) =>
                                handleDnsConfigChange({
                                  'fake-ip-filter-mode': value as DnsConfig['fake-ip-filter-mode'],
                                })
                              }
                            >
                              <SelectTrigger className={cn('w-24', controlBase)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="blacklist">黑名单</SelectItem>
                                <SelectItem value="whitelist">白名单</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            value={dnsFakeIpFilterInput}
                            onChange={(e) => setDnsFakeIpFilterInput(e.target.value)}
                            onBlur={() =>
                              handleDnsConfigChange({
                                'fake-ip-filter': parseDnsList(dnsFakeIpFilterInput),
                              })
                            }
                            placeholder="域名列表，逗号分隔"
                            className={cn('w-full font-mono text-xs', controlBase)}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            清除缓存
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleFlushFakeip}
                            disabled={flushingFakeip || !status.running}
                            className="h-7 text-xs"
                          >
                            {flushingFakeip ? (
                              <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Trash2 className="w-3 h-3 mr-1" />
                            )}
                            {flushingFakeip ? '清除中...' : '清除 FakeIP'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </BentoCard>

                <BentoCard title="名称服务器" icon={Server} iconColor="text-blue-500">
                  <div className="p-4 pt-0 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase">
                        Bootstrap DNS
                      </label>
                      <Input
                        value={dnsDefaultNameserverInput}
                        onChange={(e) => setDnsDefaultNameserverInput(e.target.value)}
                        onBlur={() =>
                          handleDnsConfigChange({
                            'default-nameserver': parseDnsList(dnsDefaultNameserverInput),
                          })
                        }
                        placeholder="223.5.5.5"
                        className={cn('font-mono', controlBase)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase">
                        Nameserver
                      </label>
                      <Input
                        value={dnsNameserverInput}
                        onChange={(e) => setDnsNameserverInput(e.target.value)}
                        onBlur={() =>
                          handleDnsConfigChange({ nameserver: parseDnsList(dnsNameserverInput) })
                        }
                        placeholder="https://doh.pub/dns-query"
                        className={cn('font-mono', controlBase)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase">
                        Fallback
                      </label>
                      <Input
                        value={dnsFallbackInput}
                        onChange={(e) => setDnsFallbackInput(e.target.value)}
                        onBlur={() =>
                          handleDnsConfigChange({ fallback: parseDnsList(dnsFallbackInput) })
                        }
                        placeholder="https://1.1.1.1/dns-query"
                        className={cn('font-mono', controlBase)}
                      />
                    </div>
                  </div>
                </BentoCard>

                <BentoCard className="md:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-zinc-800">
                    <div className="p-4 flex flex-col gap-3 items-start">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        缓存算法
                      </span>
                      <Select
                        value={config?.dns?.['cache-algorithm'] || 'lru'}
                        onValueChange={(value) =>
                          handleDnsConfigChange({
                            'cache-algorithm': value as DnsConfig['cache-algorithm'],
                          })
                        }
                      >
                        <SelectTrigger className={cn('w-full', controlBase)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lru">LRU</SelectItem>
                          <SelectItem value="arc">ARC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        优先 HTTP/3
                      </span>
                      <Switch
                        checked={config?.dns?.['prefer-h3'] || false}
                        onCheckedChange={(checked) =>
                          handleDnsConfigChange({ 'prefer-h3': checked })
                        }
                        className="scale-90"
                      />
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        使用 Hosts
                      </span>
                      <Switch
                        checked={config?.dns?.['use-hosts'] !== false}
                        onCheckedChange={(checked) =>
                          handleDnsConfigChange({ 'use-hosts': checked })
                        }
                        className="scale-90"
                      />
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        遵循路由规则
                      </span>
                      <Switch
                        checked={config?.dns?.['respect-rules'] || false}
                        onCheckedChange={(checked) =>
                          handleDnsConfigChange({ 'respect-rules': checked })
                        }
                        className="scale-90"
                      />
                    </div>
                  </div>
                </BentoCard>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
