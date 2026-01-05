import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Settings as SettingsIcon, Network, Globe, ExternalLink, Server } from 'lucide-react';
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
import type { MihomoConfig } from '@/types/config';

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[26px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-white/70 dark:border-white/10 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center px-5 pt-4 pb-3 z-10 border-b border-white/60 dark:border-white/10">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="w-7 h-7 rounded-full bg-white/70 dark:bg-white/10 flex items-center justify-center shadow-inner">
                <Icon className={cn('w-4 h-4', iconColor)} />
              </span>
            )}
            {title && (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 tracking-tight">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

function SettingItem({
  icon: Icon,
  iconColor = 'text-gray-500',
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  iconColor?: string;
  title: string;
  description?: string;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-2xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-white/80 dark:hover:bg-white/10 transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center bg-white/70 dark:bg-white/10',
              iconColor
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</div>
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

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
  const controlBase =
    'bg-white/80 dark:bg-zinc-900/50 border-white/70 dark:border-white/10 focus-visible:ring-sky-400/60';
  const controlSlim = 'h-9 text-sm';
  const dnsEnabled = Boolean(config?.dns?.enable);

  // 从 proxyStore 获取网络配置状态
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

  // 局域网共享端口状态
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
    if (!Number.isInteger(http) || http < 1 || http > 65535) {
      return 'HTTP 端口需在 1-65535';
    }
    if (!Number.isInteger(socks) || socks < 1 || socks > 65535) {
      return 'SOCKS5 端口需在 1-65535';
    }
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
    if (!portsDirty || savingPorts) {
      return;
    }
    void handleSavePorts();
  };

  const handleAllowLanToggle = (checked: boolean) => {
    setAllowLan(checked).catch(console.error);
  };

  const handleIpv6Toggle = (checked: boolean) => {
    setIpv6(checked).catch(console.error);
  };

  const handleTcpConcurrentToggle = (checked: boolean) => {
    setTcpConcurrent(checked).catch(console.error);
  };

  const loadConfig = useCallback(async () => {
    try {
      const mihomoConfig = await ipc.getConfig();
      setConfig(mihomoConfig);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load config:', error);
      toast({
        title: '加载配置失败',
        description: String(error),
        variant: 'destructive',
      });
      setLoading(false);
    }
  }, [toast]);

  const loadVersions = useCallback(async () => {
    try {
      const appVer = await ipc.getAppVersion();
      setAppVersion(appVer);

      try {
        const coreVer = await ipc.getCoreVersion();
        setCoreVersion(coreVer.version || '未运行');
      } catch {
        setCoreVersion('未运行');
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  }, []);

  // 加载配置
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
      .map((part) => Number.parseInt(part, 10) || 0);
    const currentParts = normalizeVersion(current)
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
    const maxLen = Math.max(nextParts.length, currentParts.length);
    for (let i = 0; i < maxLen; i += 1) {
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
          headers: {
            Accept: 'application/vnd.github+json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const tag = String(data.tag_name || data.name || '').trim();
      const latest = normalizeVersion(tag);
      const releaseUrl = String(data.html_url || 'https://github.com/Ashbaer/conflux-app/releases');
      setLatestVersion(latest || tag);
      setUpdateUrl(releaseUrl);

      if (!latest) {
        setUpdateStatus('error');
        toast({ title: '无法识别最新版本', variant: 'destructive' });
        return;
      }

      if (!appVersion) {
        setUpdateStatus('latest');
        toast({ title: '已获取最新版本', description: `最新版本 ${latest}` });
        return;
      }

      const hasUpdate = compareVersions(latest, appVersion) > 0;
      setUpdateStatus(hasUpdate ? 'available' : 'latest');
      toast({
        title: hasUpdate ? '发现新版本' : '已是最新版本',
        description: hasUpdate
          ? `最新版本 ${latest}`
          : `当前版本 ${normalizeVersion(appVersion) || appVersion}`,
      });
    } catch (error) {
      console.error('Failed to check updates:', error);
      setUpdateStatus('error');
      toast({
        title: '检查更新失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleConfigChange = async (updates: Partial<typeof config>) => {
    if (!config) return;

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    try {
      await ipc.saveConfig(newConfig);
      toast({ title: '配置已保存' });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
      // 回滚
      loadConfig();
    }
  };

  const handleMixedPortChange = async (value: string) => {
    const port = value === '' ? null : parseInt(value, 10);
    try {
      await ipc.setMixedPort(port as number | null);
      setConfig({ ...config, 'mixed-port': port });
      toast({ title: '混合端口已更新' });
    } catch (error) {
      toast({ title: '更新失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleFindProcessModeChange = async (mode: string) => {
    try {
      await ipc.setFindProcessMode(mode);
      setConfig({ ...config, 'find-process-mode': mode });
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

  // 中国大陆最佳 DNS 默认配置
  const getDefaultDnsConfig = () => ({
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
    // 默认 DNS：用于解析 DNS 服务器域名，必须是纯 IP
    'default-nameserver': [
      '223.5.5.5', // 阿里 DNS
      '119.29.29.29', // 腾讯 DNSPod
    ],
    // 主 DNS：国内 DNS，用于解析国内域名
    nameserver: [
      'https://223.5.5.5/dns-query', // 阿里 DoH
      'https://doh.pub/dns-query', // 腾讯 DoH
    ],
    // 备用 DNS：国外 DNS，用于解析被污染的域名
    fallback: [
      'https://1.1.1.1/dns-query', // Cloudflare DoH
      'https://8.8.8.8/dns-query', // Google DoH
      'tls://8.8.4.4:853', // Google DoT
    ],
    // Fallback 过滤器：智能分流
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      geosite: ['gfw'],
      ipcidr: [
        '240.0.0.0/4', // 保留地址
        '0.0.0.0/32', // 无效地址
      ],
    },
    'prefer-h3': true,
    'use-hosts': true,
    'use-system-hosts': true,
    'respect-rules': false,
    'cache-algorithm': 'arc',
  });

  const handleDnsConfigChange = async (updates: Record<string, unknown>) => {
    if (!config) return;

    // 如果是启用 DNS，且之前没有配置或配置为空，则填充默认配置
    if (updates.enable === true) {
      const currentDns = config.dns || {};
      const hasValidConfig =
        currentDns.nameserver?.length > 0 || currentDns['default-nameserver']?.length > 0;

      if (!hasValidConfig) {
        // 使用默认配置
        const defaultConfig = getDefaultDnsConfig();
        await handleConfigChange({ dns: defaultConfig });
        return;
      }
    }

    const nextDns = { ...(config.dns || {}), ...updates };
    await handleConfigChange({ dns: nextDns });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 pb-6 px-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              设置
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理端口、进程与 DNS 等核心配置
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* 左侧栏：通用与网络 */}
          <div className="space-y-4">
            {/* 通用设置 */}
            <BentoCard title="通用" icon={SettingsIcon} iconColor="text-gray-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  icon={Globe}
                  iconColor="text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                  title="语言"
                  description="暂时仅支持中文"
                  action={
                    <Select value="zh-CN" disabled>
                      <SelectTrigger className={cn('w-32', controlSlim, controlBase)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />

                <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                <SettingItem
                  title="应用版本"
                  action={
                    <span className="text-sm font-mono font-medium text-gray-500">
                      {appVersion || '...'}
                    </span>
                  }
                />
                <SettingItem
                  title="核心版本"
                  description="MiHomo Core"
                  action={
                    <span className="text-sm font-mono font-medium text-gray-500">
                      {coreVersion || '...'}
                    </span>
                  }
                />

                <SettingItem
                  title="更新检查"
                  description={
                    updateStatus === 'checking'
                      ? '正在检查更新...'
                      : updateStatus === 'available'
                        ? `发现新版本 ${latestVersion}`
                        : updateStatus === 'latest'
                          ? `已是最新版本${latestVersion ? ` (${latestVersion})` : ''}`
                          : updateStatus === 'error'
                            ? '检查失败'
                            : '检查 GitHub Release'
                  }
                  action={
                    <div className="flex items-center gap-2">
                      {updateStatus === 'available' && updateUrl ? (
                        <a
                          href={updateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                          title="前往下载"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={checkForUpdates}
                        disabled={updateStatus === 'checking'}
                        className="rounded-full bg-white/70 dark:bg-white/10 border-white/70 dark:border-white/10 h-7 text-xs px-3"
                      >
                        {updateStatus === 'checking' ? '...' : '检查'}
                      </Button>
                    </div>
                  }
                />

                <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                <SettingItem
                  title="项目主页"
                  description="Ashbaer/conflux-app"
                  action={
                    <a
                      href="https://github.com/Ashbaer/conflux-app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  }
                />
              </div>
            </BentoCard>

            {/* 网络设置 */}
            <BentoCard title="网络连接" icon={Network} iconColor="text-blue-500">
              <div className="flex flex-col gap-2 p-3">
                {/* 端口配置区域 */}
                <div className="rounded-xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      端口配置
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">混合端口</span>
                      <Input
                        type="number"
                        value={config?.['mixed-port'] || ''}
                        onChange={(e) => handleMixedPortChange(e.target.value)}
                        placeholder="未设置"
                        className={cn('w-24 text-right h-8 text-sm', controlBase)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">HTTP 端口</span>
                      <Input
                        value={httpPort}
                        onChange={(e) => {
                          setHttpPort(e.target.value);
                          setPortsDirty(true);
                        }}
                        onBlur={handlePortBlur}
                        className={cn('w-24 text-right h-8 text-sm', controlBase)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">SOCKS5 端口</span>
                      <Input
                        value={socksPort}
                        onChange={(e) => {
                          setSocksPort(e.target.value);
                          setPortsDirty(true);
                        }}
                        onBlur={handlePortBlur}
                        className={cn('w-24 text-right h-8 text-sm', controlBase)}
                      />
                    </div>
                  </div>
                  {portError && (
                    <div className="text-[10px] text-rose-500 text-right">{portError}</div>
                  )}
                </div>

                <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                <SettingItem
                  title="允许局域网连接"
                  description="Allow LAN"
                  action={
                    <Switch
                      checked={!!status.allow_lan}
                      onCheckedChange={handleAllowLanToggle}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  }
                />

                <SettingItem
                  title="IPv6 支持"
                  description="启用 IPv6 协议栈"
                  action={
                    <Switch
                      checked={!!status.ipv6}
                      onCheckedChange={handleIpv6Toggle}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  }
                />

                <SettingItem
                  title="TCP 并发"
                  description="提升连接建立速度"
                  action={
                    <Switch
                      checked={!!status.tcp_concurrent}
                      onCheckedChange={handleTcpConcurrentToggle}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  }
                />

                <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                <SettingItem
                  title="进程查找模式"
                  description="用于分流规则判定"
                  action={
                    <Select
                      value={config?.['find-process-mode'] || 'always'}
                      onValueChange={handleFindProcessModeChange}
                    >
                      <SelectTrigger className={cn('w-24', controlSlim, controlBase)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">始终</SelectItem>
                        <SelectItem value="strict">严格</SelectItem>
                        <SelectItem value="off">关闭</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              </div>
            </BentoCard>
          </div>

          {/* 右侧栏：DNS */}
          <div className="space-y-4">
            <BentoCard title="DNS 设置" icon={Server} iconColor="text-orange-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  title="启用 DNS"
                  description="启用内置 DNS 服务"
                  action={
                    <Switch
                      checked={config?.dns?.enable || false}
                      onCheckedChange={(checked) => handleDnsConfigChange({ enable: checked })}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  }
                />

                {dnsEnabled && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-2">
                    <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                    {/* 增强模式 */}
                    <SettingItem
                      title="运行模式"
                      description="enhanced-mode"
                      action={
                        <Select
                          value={config?.dns?.['enhanced-mode'] || 'normal'}
                          onValueChange={(value) =>
                            handleDnsConfigChange({ 'enhanced-mode': value })
                          }
                        >
                          <SelectTrigger className={cn('w-32', controlSlim, controlBase)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">normal</SelectItem>
                            <SelectItem value="redir-host">redir-host</SelectItem>
                            <SelectItem value="fake-ip">fake-ip</SelectItem>
                          </SelectContent>
                        </Select>
                      }
                    />

                    {/* Fake IP 模式专属配置 */}
                    {isFakeIpMode && (
                      <div className="rounded-xl bg-orange-50/50 dark:bg-orange-500/5 border border-orange-100 dark:border-orange-500/10 p-3 space-y-3 mx-1">
                        <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">
                          Fake-IP 配置
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-300">IP 范围</span>
                          <Input
                            value={config?.dns?.['fake-ip-range'] || '198.18.0.1/16'}
                            onChange={(e) =>
                              handleDnsConfigChange({ 'fake-ip-range': e.target.value })
                            }
                            placeholder="198.18.0.1/16"
                            className={cn('w-36 h-7 text-xs', controlBase)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-300">过滤模式</span>
                          <Select
                            value={config?.dns?.['fake-ip-filter-mode'] || 'blacklist'}
                            onValueChange={(value) =>
                              handleDnsConfigChange({ 'fake-ip-filter-mode': value })
                            }
                          >
                            <SelectTrigger className={cn('w-24 h-7 text-xs', controlBase)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="blacklist">黑名单</SelectItem>
                              <SelectItem value="whitelist">白名单</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-600 dark:text-gray-300">过滤列表</span>
                          <Input
                            value={dnsFakeIpFilterInput}
                            onChange={(e) => setDnsFakeIpFilterInput(e.target.value)}
                            onBlur={() =>
                              handleDnsConfigChange({
                                'fake-ip-filter': parseDnsList(dnsFakeIpFilterInput),
                              })
                            }
                            placeholder="*.lan, localhost"
                            className={cn('w-full h-8 text-xs', controlBase)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                    {/* DNS 服务器配置 */}
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1 px-4">
                        <div className="text-xs font-medium text-gray-900 dark:text-gray-200">
                          默认 DNS (DoH bootstrap)
                        </div>
                        <Input
                          value={dnsDefaultNameserverInput}
                          onChange={(e) => setDnsDefaultNameserverInput(e.target.value)}
                          onBlur={() =>
                            handleDnsConfigChange({
                              'default-nameserver': parseDnsList(dnsDefaultNameserverInput),
                            })
                          }
                          placeholder="223.5.5.5, 114.114.114.114"
                          className={cn('w-full h-8 text-xs font-mono', controlBase)}
                        />
                      </div>

                      <div className="space-y-1 px-4">
                        <div className="text-xs font-medium text-gray-900 dark:text-gray-200">
                          主 DNS (Nameserver)
                        </div>
                        <Input
                          value={dnsNameserverInput}
                          onChange={(e) => setDnsNameserverInput(e.target.value)}
                          onBlur={() =>
                            handleDnsConfigChange({ nameserver: parseDnsList(dnsNameserverInput) })
                          }
                          placeholder="https://223.5.5.5/dns-query"
                          className={cn('w-full h-8 text-xs font-mono', controlBase)}
                        />
                      </div>

                      <div className="space-y-1 px-4">
                        <div className="text-xs font-medium text-gray-900 dark:text-gray-200">
                          备用 DNS (Fallback)
                        </div>
                        <Input
                          value={dnsFallbackInput}
                          onChange={(e) => setDnsFallbackInput(e.target.value)}
                          onBlur={() =>
                            handleDnsConfigChange({ fallback: parseDnsList(dnsFallbackInput) })
                          }
                          placeholder="https://8.8.8.8/dns-query"
                          className={cn('w-full h-8 text-xs font-mono', controlBase)}
                        />
                      </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-white/5 mx-4 my-1" />

                    {/* 高级选项 */}
                    <SettingItem
                      title="缓存算法"
                      description="Cache Algorithm"
                      action={
                        <Select
                          value={config?.dns?.['cache-algorithm'] || 'lru'}
                          onValueChange={(value) =>
                            handleDnsConfigChange({ 'cache-algorithm': value })
                          }
                        >
                          <SelectTrigger className={cn('w-24', controlSlim, controlBase)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lru">LRU</SelectItem>
                            <SelectItem value="arc">ARC</SelectItem>
                          </SelectContent>
                        </Select>
                      }
                    />
                    <SettingItem
                      title="优先 HTTP/3"
                      description="Prefer H3"
                      action={
                        <Switch
                          checked={config?.dns?.['prefer-h3'] || false}
                          onCheckedChange={(checked) =>
                            handleDnsConfigChange({ 'prefer-h3': checked })
                          }
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                    <SettingItem
                      title="使用 hosts"
                      description="Use Hosts"
                      action={
                        <Switch
                          checked={config?.dns?.['use-hosts'] !== false}
                          onCheckedChange={(checked) =>
                            handleDnsConfigChange({ 'use-hosts': checked })
                          }
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                    <SettingItem
                      title="遵循路由规则"
                      description="Respect Rules"
                      action={
                        <Switch
                          checked={config?.dns?.['respect-rules'] || false}
                          onCheckedChange={(checked) =>
                            handleDnsConfigChange({ 'respect-rules': checked })
                          }
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                  </div>
                )}
              </div>
            </BentoCard>
          </div>
        </div>
      </div>
    </div>
  );
}
