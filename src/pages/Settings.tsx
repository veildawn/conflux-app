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
  }, [config]);

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

  const handleDnsConfigChange = async (updates: Record<string, unknown>) => {
    if (!config) return;
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
                  title="DNS 启用"
                  description="启用内置 DNS 解析"
                  action={
                    <Switch
                      checked={config?.dns?.enable || false}
                      onCheckedChange={(checked) => handleDnsConfigChange({ enable: checked })}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  }
                />
                {dnsEnabled ? (
                  <>
                    <SettingItem
                      title="DNS 增强模式"
                      description="选择 DNS 解析模式"
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
                    <SettingItem
                      title="DNS 服务器"
                      description="多个地址请用逗号分隔"
                      action={
                        <Input
                          value={dnsNameserverInput}
                          onChange={(e) => setDnsNameserverInput(e.target.value)}
                          onBlur={() => handleDnsConfigChange({ nameserver: parseDnsList(dnsNameserverInput) })}
                          placeholder="1.1.1.1, 8.8.8.8"
                          className={cn("w-52", controlSlim, controlBase)}
                        />
                      }
                    />
                    <SettingItem
                      title="备用 DNS"
                      description="当主 DNS 不可用时使用"
                      action={
                        <Input
                          value={dnsFallbackInput}
                          onChange={(e) => setDnsFallbackInput(e.target.value)}
                          onBlur={() => handleDnsConfigChange({ fallback: parseDnsList(dnsFallbackInput) })}
                          placeholder="1.0.0.1, 8.8.4.4"
                          className={cn("w-52", controlSlim, controlBase)}
                        />
                      }
                    />
                  </>
                ) : null}
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
