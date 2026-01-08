import { useEffect, useState, useCallback } from 'react';
import { Server, LayoutGrid, RefreshCw, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { BentoCard, SettingItem, SectionHeader, CONTROL_BASE_CLASS } from '../components';
import { parseDnsList } from '../hooks/useSettingsData';
import type { DnsConfig, MihomoConfig } from '@/types/config';
import type { ProxyStatus } from '@/types/proxy';

/**
 * 解析多行文本为数组（每行一个项目）
 */
function parseMultilineList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

interface DnsSectionProps {
  config: MihomoConfig | null;
  status: ProxyStatus;
  onDnsConfigChange: (updates: Partial<DnsConfig>) => Promise<void>;
  toast: (options: { title: string; description?: string; variant?: 'destructive' }) => void;
}

/**
 * 比较两个字符串数组是否相等
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

export function DnsSection({ config, status, onDnsConfigChange, toast }: DnsSectionProps) {
  // 输入框本地状态（用于编辑时的临时值）
  const [dnsNameserverInput, setDnsNameserverInput] = useState('');
  const [dnsFallbackInput, setDnsFallbackInput] = useState('');
  const [dnsDefaultNameserverInput, setDnsDefaultNameserverInput] = useState('');
  const [dnsProxyServerNameserverInput, setDnsProxyServerNameserverInput] = useState('');
  const [dnsFakeIpFilterInput, setDnsFakeIpFilterInput] = useState('');
  const [fakeIpRangeInput, setFakeIpRangeInput] = useState('');
  const [flushingFakeip, setFlushingFakeip] = useState(false);

  // config.dns 已经与默认值合并，所有字段都有值
  const dns = config?.dns;
  const dnsEnabled = Boolean(dns?.enable);
  const isFakeIpMode = dns?.['enhanced-mode'] === 'fake-ip';

  // 当 config 变化时，同步输入框的值
  useEffect(() => {
    if (!dns) return;
    setDnsNameserverInput((dns.nameserver || []).join(', '));
    setDnsFallbackInput((dns.fallback || []).join(', '));
    setDnsDefaultNameserverInput((dns['default-nameserver'] || []).join(', '));
    setDnsProxyServerNameserverInput((dns['proxy-server-nameserver'] || []).join(', '));
    // fake-ip-filter 使用换行分隔（每行一个）
    setDnsFakeIpFilterInput((dns['fake-ip-filter'] || []).join('\n'));
    setFakeIpRangeInput(dns['fake-ip-range'] || '');
  }, [dns]);

  // 保存输入框值：只在值改变时保存
  const handleNameserverBlur = useCallback(() => {
    const newValue = parseDnsList(dnsNameserverInput);
    if (!arraysEqual(newValue, dns?.nameserver || [])) {
      onDnsConfigChange({ nameserver: newValue });
    }
  }, [dnsNameserverInput, dns?.nameserver, onDnsConfigChange]);

  const handleFallbackBlur = useCallback(() => {
    const newValue = parseDnsList(dnsFallbackInput);
    if (!arraysEqual(newValue, dns?.fallback || [])) {
      onDnsConfigChange({ fallback: newValue });
    }
  }, [dnsFallbackInput, dns?.fallback, onDnsConfigChange]);

  const handleDefaultNameserverBlur = useCallback(() => {
    const newValue = parseDnsList(dnsDefaultNameserverInput);
    if (!arraysEqual(newValue, dns?.['default-nameserver'] || [])) {
      onDnsConfigChange({ 'default-nameserver': newValue });
    }
  }, [dnsDefaultNameserverInput, dns, onDnsConfigChange]);

  const handleProxyServerNameserverBlur = useCallback(() => {
    const newValue = parseDnsList(dnsProxyServerNameserverInput);

    // 如果 respect-rules 已开启，不允许清空 proxy-server-nameserver
    if (dns?.['respect-rules'] && newValue.length === 0) {
      // 恢复之前的值
      setDnsProxyServerNameserverInput((dns['proxy-server-nameserver'] || []).join(', '));
      toast({
        title: '无法清空',
        description: '开启"遵循路由规则"时，Proxy Server DNS 不能为空',
        variant: 'destructive',
      });
      return;
    }

    if (!arraysEqual(newValue, dns?.['proxy-server-nameserver'] || [])) {
      onDnsConfigChange({ 'proxy-server-nameserver': newValue });
    }
  }, [dnsProxyServerNameserverInput, dns, onDnsConfigChange, toast]);

  const handleFakeIpFilterBlur = useCallback(() => {
    const newValue = parseMultilineList(dnsFakeIpFilterInput);
    if (!arraysEqual(newValue, dns?.['fake-ip-filter'] || [])) {
      onDnsConfigChange({ 'fake-ip-filter': newValue });
    }
  }, [dnsFakeIpFilterInput, dns, onDnsConfigChange]);

  const handleFakeIpRangeBlur = useCallback(() => {
    if (fakeIpRangeInput !== dns?.['fake-ip-range']) {
      onDnsConfigChange({ 'fake-ip-range': fakeIpRangeInput });
    }
  }, [fakeIpRangeInput, dns, onDnsConfigChange]);

  // Switch 和 Select：值改变时直接保存
  const handleEnableChange = useCallback(
    (checked: boolean) => {
      if (checked !== dns?.enable) {
        onDnsConfigChange({ enable: checked });
      }
    },
    [dns?.enable, onDnsConfigChange]
  );

  const handleEnhancedModeChange = useCallback(
    (value: string) => {
      if (value !== dns?.['enhanced-mode']) {
        onDnsConfigChange({ 'enhanced-mode': value as DnsConfig['enhanced-mode'] });
      }
    },
    [dns, onDnsConfigChange]
  );

  const handleFakeIpFilterModeChange = useCallback(
    (value: string) => {
      if (value !== dns?.['fake-ip-filter-mode']) {
        onDnsConfigChange({ 'fake-ip-filter-mode': value as DnsConfig['fake-ip-filter-mode'] });
      }
    },
    [dns, onDnsConfigChange]
  );

  const handleCacheAlgorithmChange = useCallback(
    (value: string) => {
      if (value !== dns?.['cache-algorithm']) {
        onDnsConfigChange({ 'cache-algorithm': value as DnsConfig['cache-algorithm'] });
      }
    },
    [dns, onDnsConfigChange]
  );

  const handlePreferH3Change = useCallback(
    (checked: boolean) => {
      if (checked !== dns?.['prefer-h3']) {
        onDnsConfigChange({ 'prefer-h3': checked });
      }
    },
    [dns, onDnsConfigChange]
  );

  const handleUseHostsChange = useCallback(
    (checked: boolean) => {
      if (checked !== dns?.['use-hosts']) {
        onDnsConfigChange({ 'use-hosts': checked });
      }
    },
    [dns, onDnsConfigChange]
  );

  const handleRespectRulesChange = useCallback(
    (checked: boolean) => {
      if (checked !== dns?.['respect-rules']) {
        if (checked) {
          // 使用输入框当前值判断（避免竞态条件，输入框可能还未保存到 dns 状态）
          const currentProxyServerDns = parseDnsList(dnsProxyServerNameserverInput);

          if (currentProxyServerDns.length === 0) {
            // 使用默认的 Proxy Server DNS（与后端 DnsConfig::default() 保持一致）
            const defaultProxyDns = ['223.5.5.5', '119.29.29.29'];

            onDnsConfigChange({
              'respect-rules': checked,
              'proxy-server-nameserver': defaultProxyDns,
            });
            setDnsProxyServerNameserverInput(defaultProxyDns.join(', '));
            toast({
              title: '已自动设置 Proxy Server DNS',
              description: '开启"遵循路由规则"需要配置 Proxy Server DNS',
            });
            return;
          }

          // 同时保存两个字段以确保一致性
          onDnsConfigChange({
            'respect-rules': checked,
            'proxy-server-nameserver': currentProxyServerDns,
          });
          return;
        }
        onDnsConfigChange({ 'respect-rules': checked });
      }
    },
    [dns, dnsProxyServerNameserverInput, onDnsConfigChange, toast]
  );

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

  return (
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
                checked={dnsEnabled}
                onCheckedChange={handleEnableChange}
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
                    value={dns?.['enhanced-mode'] || 'normal'}
                    onValueChange={handleEnhancedModeChange}
                  >
                    <SelectTrigger className={cn('w-32', CONTROL_BASE_CLASS)}>
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
                        value={fakeIpRangeInput}
                        onChange={(e) => setFakeIpRangeInput(e.target.value)}
                        onBlur={handleFakeIpRangeBlur}
                        placeholder="198.18.0.1/16"
                        className={cn('w-32 font-mono text-right', CONTROL_BASE_CLASS)}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Fake-IP 过滤
                        </label>
                        <Select
                          value={dns?.['fake-ip-filter-mode'] || 'blacklist'}
                          onValueChange={handleFakeIpFilterModeChange}
                        >
                          <SelectTrigger className={cn('w-24', CONTROL_BASE_CLASS)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blacklist">黑名单</SelectItem>
                            <SelectItem value="whitelist">白名单</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={dnsFakeIpFilterInput}
                        onChange={(e) => setDnsFakeIpFilterInput(e.target.value)}
                        onBlur={handleFakeIpFilterBlur}
                        placeholder={'+.lan\n+.local\ngeosite:private\ngeosite:cn'}
                        className={cn('w-full font-mono text-xs min-h-[80px]', CONTROL_BASE_CLASS)}
                      />
                      <p className="text-xs text-gray-400">每行一个域名或 geosite 规则</p>
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
                    onBlur={handleDefaultNameserverBlur}
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Proxy Server DNS
                  </label>
                  <Input
                    value={dnsProxyServerNameserverInput}
                    onChange={(e) => setDnsProxyServerNameserverInput(e.target.value)}
                    onBlur={handleProxyServerNameserverBlur}
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
                  />
                  <p className="text-xs text-gray-400">用于解析代理节点域名，避免 TUN 循环依赖</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Nameserver
                  </label>
                  <Input
                    value={dnsNameserverInput}
                    onChange={(e) => setDnsNameserverInput(e.target.value)}
                    onBlur={handleNameserverBlur}
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Fallback</label>
                  <Input
                    value={dnsFallbackInput}
                    onChange={(e) => setDnsFallbackInput(e.target.value)}
                    onBlur={handleFallbackBlur}
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
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
                    value={dns?.['cache-algorithm'] || 'lru'}
                    onValueChange={handleCacheAlgorithmChange}
                  >
                    <SelectTrigger className={cn('w-full', CONTROL_BASE_CLASS)}>
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
                    checked={dns?.['prefer-h3'] || false}
                    onCheckedChange={handlePreferH3Change}
                    className="scale-90"
                  />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    使用 Hosts
                  </span>
                  <Switch
                    checked={dns?.['use-hosts'] !== false}
                    onCheckedChange={handleUseHostsChange}
                    className="scale-90"
                  />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    遵循路由规则
                  </span>
                  <Switch
                    checked={dns?.['respect-rules'] || false}
                    onCheckedChange={handleRespectRulesChange}
                    className="scale-90"
                  />
                </div>
              </div>
            </BentoCard>
          </div>
        )}
      </div>
    </div>
  );
}
