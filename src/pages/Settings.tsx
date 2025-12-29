import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Info,
  Network,
  Globe,
  Zap,
  ExternalLink,
  Server
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = "text-gray-500",
  action
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[26px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-white/70 dark:border-white/10 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-center px-5 pt-4 pb-3 z-10 border-b border-white/60 dark:border-white/10">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="w-7 h-7 rounded-full bg-white/70 dark:bg-white/10 flex items-center justify-center shadow-inner">
                <Icon className={cn("w-4 h-4", iconColor)} />
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
  iconColor = "text-gray-500",
  title,
  description,
  action,
  className
}: {
  icon?: React.ElementType;
  iconColor?: string;
  title: string;
  description?: string;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 rounded-2xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-white/80 dark:hover:bg-white/10 transition-colors",
      className
    )}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-white/70 dark:bg-white/10", iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</div>
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [coreVersion, setCoreVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error'>('idle');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');
  const [dnsNameserverInput, setDnsNameserverInput] = useState('');
  const [dnsFallbackInput, setDnsFallbackInput] = useState('');
  const [dnsDefaultNameserverInput, setDnsDefaultNameserverInput] = useState('');
  const [dnsFakeIpFilterInput, setDnsFakeIpFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const controlBase = "bg-white/80 dark:bg-zinc-900/50 border-white/70 dark:border-white/10 focus-visible:ring-sky-400/60";
  const controlSlim = "h-9 text-sm";
  const dnsEnabled = Boolean(config?.dns?.enable);

  // 加载配置
  useEffect(() => {
    loadConfig();
    loadVersions();
  }, []);

  useEffect(() => {
    if (!config) return;
    setDnsNameserverInput((config.dns?.nameserver || []).join(', '));
    setDnsFallbackInput((config.dns?.fallback || []).join(', '));
    setDnsDefaultNameserverInput((config.dns?.['default-nameserver'] || []).join(', '));
    setDnsFakeIpFilterInput((config.dns?.['fake-ip-filter'] || []).join(', '));
  }, [config]);

  const isFakeIpMode = config?.dns?.['enhanced-mode'] === 'fake-ip';

  const loadConfig = async () => {
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
  };

  const loadVersions = async () => {
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
  };

  const normalizeVersion = (value: string) => value.trim().replace(/^v/i, '');

  const compareVersions = (next: string, current: string) => {
    const nextParts = normalizeVersion(next).split('.').map((part) => Number.parseInt(part, 10) || 0);
    const currentParts = normalizeVersion(current).split('.').map((part) => Number.parseInt(part, 10) || 0);
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
      const response = await fetch('https://api.github.com/repos/Ashbaer/conflux-app/releases/latest', {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });
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
        description: hasUpdate ? `最新版本 ${latest}` : `当前版本 ${normalizeVersion(appVersion) || appVersion}`,
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
      '223.5.5.5',      // 阿里 DNS
      '119.29.29.29',   // 腾讯 DNSPod
    ],
    // 主 DNS：国内 DNS，用于解析国内域名
    nameserver: [
      'https://223.5.5.5/dns-query',      // 阿里 DoH
      'https://doh.pub/dns-query',         // 腾讯 DoH
    ],
    // 备用 DNS：国外 DNS，用于解析被污染的域名
    fallback: [
      'https://1.1.1.1/dns-query',         // Cloudflare DoH
      'https://8.8.8.8/dns-query',         // Google DoH
      'tls://8.8.4.4:853',                 // Google DoT
    ],
    // Fallback 过滤器：智能分流
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      geosite: ['gfw'],
      ipcidr: [
        '240.0.0.0/4',    // 保留地址
        '0.0.0.0/32',     // 无效地址
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
      const hasValidConfig = currentDns.nameserver?.length > 0 || currentDns['default-nameserver']?.length > 0;

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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">设置</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理端口、进程与 DNS 等核心配置
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 items-start">
          {/* 系统与端口 */}
          <div className="space-y-4">
            <BentoCard title="系统与界面" icon={SettingsIcon} iconColor="text-gray-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  icon={Globe}
                  iconColor="text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                  title="语言"
                  description="暂时仅支持中文"
                  action={
                    <Select value="zh-CN" disabled>
                      <SelectTrigger className={cn("w-32", controlSlim, controlBase)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              </div>
            </BentoCard>

            <BentoCard title="混合端口" icon={Network} iconColor="text-blue-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  title="混合端口"
                  description="一个端口同时提供 HTTP 与 SOCKS5 代理，便于系统统一配置。"
                  action={
                    <Input
                      type="number"
                      value={config?.['mixed-port'] || ''}
                      onChange={(e) => handleMixedPortChange(e.target.value)}
                      placeholder="未设置"
                      className={cn("w-24 text-right", controlSlim, controlBase)}
                      min={1024}
                      max={65535}
                    />
                  }
                />
              </div>
            </BentoCard>
          </div>

          {/* 进程 / DNS / 关于 */}
          <div className="space-y-4">
            <BentoCard title="进程" icon={Zap} iconColor="text-orange-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  title="进程查找模式"
                  description="尝试识别连接对应的进程名称与路径（可能受系统权限限制）。"
                  action={
                    <Select
                      value={config?.['find-process-mode'] || 'always'}
                      onValueChange={handleFindProcessModeChange}
                    >
                      <SelectTrigger className={cn("w-32", controlSlim, controlBase)}>
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

            <BentoCard title="DNS" icon={Server} iconColor="text-orange-500">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  title="启用 DNS"
                  description="启用内置 DNS 解析服务"
                  action={
                    <Switch
                      checked={config?.dns?.enable || false}
                      onCheckedChange={(checked) => handleDnsConfigChange({ enable: checked })}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  }
                />
                {dnsEnabled && (
                  <>
                    {/* 增强模式 */}
                    <SettingItem
                      title="增强模式"
                      description="normal: 标准模式 | redir-host: 真实 IP | fake-ip: 虚拟 IP"
                      action={
                        <Select
                          value={config?.dns?.['enhanced-mode'] || 'normal'}
                          onValueChange={(value) => handleDnsConfigChange({ 'enhanced-mode': value })}
                        >
                          <SelectTrigger className={cn("w-36", controlSlim, controlBase)}>
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
                      <>
                        <SettingItem
                          title="Fake IP 范围"
                          description="虚拟 IP 分配范围"
                          action={
                            <Input
                              value={config?.dns?.['fake-ip-range'] || '198.18.0.1/16'}
                              onChange={(e) => handleDnsConfigChange({ 'fake-ip-range': e.target.value })}
                              placeholder="198.18.0.1/16"
                              className={cn("w-40", controlSlim, controlBase)}
                            />
                          }
                        />
                        <SettingItem
                          title="Fake IP 过滤模式"
                          description="blacklist: 列表内不使用 | whitelist: 仅列表内使用"
                          action={
                            <Select
                              value={config?.dns?.['fake-ip-filter-mode'] || 'blacklist'}
                              onValueChange={(value) => handleDnsConfigChange({ 'fake-ip-filter-mode': value })}
                            >
                              <SelectTrigger className={cn("w-32", controlSlim, controlBase)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="blacklist">黑名单</SelectItem>
                                <SelectItem value="whitelist">白名单</SelectItem>
                              </SelectContent>
                            </Select>
                          }
                        />
                        <SettingItem
                          title="Fake IP 过滤列表"
                          description="不使用 Fake IP 的域名，逗号分隔"
                          action={
                            <Input
                              value={dnsFakeIpFilterInput}
                              onChange={(e) => setDnsFakeIpFilterInput(e.target.value)}
                              onBlur={() => handleDnsConfigChange({ 'fake-ip-filter': parseDnsList(dnsFakeIpFilterInput) })}
                              placeholder="*.lan, localhost"
                              className={cn("w-52", controlSlim, controlBase)}
                            />
                          }
                        />
                      </>
                    )}

                    {/* DNS 服务器配置 */}
                    <SettingItem
                      title="默认 DNS"
                      description="用于解析 DNS 服务器域名，仅支持 IP"
                      action={
                        <Input
                          value={dnsDefaultNameserverInput}
                          onChange={(e) => setDnsDefaultNameserverInput(e.target.value)}
                          onBlur={() => handleDnsConfigChange({ 'default-nameserver': parseDnsList(dnsDefaultNameserverInput) })}
                          placeholder="114.114.114.114"
                          className={cn("w-52", controlSlim, controlBase)}
                        />
                      }
                    />
                    <SettingItem
                      title="主 DNS 服务器"
                      description="支持 UDP/TCP/DoH/DoT，逗号分隔"
                      action={
                        <Input
                          value={dnsNameserverInput}
                          onChange={(e) => setDnsNameserverInput(e.target.value)}
                          onBlur={() => handleDnsConfigChange({ nameserver: parseDnsList(dnsNameserverInput) })}
                          placeholder="https://1.1.1.1/dns-query"
                          className={cn("w-52", controlSlim, controlBase)}
                        />
                      }
                    />
                    <SettingItem
                      title="备用 DNS"
                      description="当主 DNS 被污染时使用，一般为海外 DNS"
                      action={
                        <Input
                          value={dnsFallbackInput}
                          onChange={(e) => setDnsFallbackInput(e.target.value)}
                          onBlur={() => handleDnsConfigChange({ fallback: parseDnsList(dnsFallbackInput) })}
                          placeholder="https://8.8.8.8/dns-query"
                          className={cn("w-52", controlSlim, controlBase)}
                        />
                      }
                    />

                    {/* 高级选项 */}
                    <SettingItem
                      title="缓存算法"
                      description="DNS 缓存使用的算法"
                      action={
                        <Select
                          value={config?.dns?.['cache-algorithm'] || 'lru'}
                          onValueChange={(value) => handleDnsConfigChange({ 'cache-algorithm': value })}
                        >
                          <SelectTrigger className={cn("w-24", controlSlim, controlBase)}>
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
                      description="DoH 优先使用 HTTP/3 协议"
                      action={
                        <Switch
                          checked={config?.dns?.['prefer-h3'] || false}
                          onCheckedChange={(checked) => handleDnsConfigChange({ 'prefer-h3': checked })}
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                    <SettingItem
                      title="使用 hosts"
                      description="响应配置的 hosts 映射"
                      action={
                        <Switch
                          checked={config?.dns?.['use-hosts'] !== false}
                          onCheckedChange={(checked) => handleDnsConfigChange({ 'use-hosts': checked })}
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                    <SettingItem
                      title="使用系统 hosts"
                      description="读取系统 hosts 文件"
                      action={
                        <Switch
                          checked={config?.dns?.['use-system-hosts'] !== false}
                          onCheckedChange={(checked) => handleDnsConfigChange({ 'use-system-hosts': checked })}
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                    <SettingItem
                      title="遵循路由规则"
                      description="DNS 连接遵循代理规则"
                      action={
                        <Switch
                          checked={config?.dns?.['respect-rules'] || false}
                          onCheckedChange={(checked) => handleDnsConfigChange({ 'respect-rules': checked })}
                          className="data-[state=checked]:bg-orange-500"
                        />
                      }
                    />
                  </>
                )}
              </div>
            </BentoCard>

            {/* 关于 */}
            <BentoCard title="关于" icon={Info} iconColor="text-gray-400">
              <div className="flex flex-col gap-2 p-3">
                <SettingItem
                  title="应用版本"
                  action={<span className="text-sm font-mono font-medium text-gray-500">{appVersion}</span>}
                />
                <SettingItem
                  title="核心版本"
                  description="MiHomo 核心"
                  action={<span className="text-sm font-mono font-medium text-gray-500">{coreVersion}</span>}
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
                            ? '检查失败，请稍后重试'
                            : '检查 GitHub Releases 获取最新版本'
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
                        className="rounded-full bg-white/70 dark:bg-white/10 border-white/70 dark:border-white/10"
                      >
                        {updateStatus === 'checking' ? '检查中...' : '检查更新'}
                      </Button>
                    </div>
                  }
                />
                <SettingItem
                  title="GitHub"
                  description="查看源代码"
                  action={
                    <a
                      href="https://github.com/Ashbaer/conflux-app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                    >
                      Ashbaer/conflux-app
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  }
                />
                <SettingItem
                  title="开源许可证"
                  description="MIT License"
                  action={<span className="text-sm font-medium text-gray-500">MIT</span>}
                />
              </div>
            </BentoCard>
          </div>
        </div>
      </div>
    </div>
  );
}
