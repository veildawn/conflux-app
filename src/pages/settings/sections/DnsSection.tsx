import { useEffect, useState } from 'react';
import { Server, LayoutGrid, RefreshCw, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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

interface DnsSectionProps {
  config: MihomoConfig | null;
  status: ProxyStatus;
  onDnsConfigChange: (updates: Partial<DnsConfig>) => Promise<void>;
  toast: (options: { title: string; description?: string; variant?: 'destructive' }) => void;
}

export function DnsSection({ config, status, onDnsConfigChange, toast }: DnsSectionProps) {
  const [dnsNameserverInput, setDnsNameserverInput] = useState('');
  const [dnsFallbackInput, setDnsFallbackInput] = useState('');
  const [dnsDefaultNameserverInput, setDnsDefaultNameserverInput] = useState('');
  const [dnsFakeIpFilterInput, setDnsFakeIpFilterInput] = useState('');
  const [flushingFakeip, setFlushingFakeip] = useState(false);

  const dnsEnabled = Boolean(config?.dns?.enable);
  const isFakeIpMode = config?.dns?.['enhanced-mode'] === 'fake-ip';

  useEffect(() => {
    if (!config) return;
    setDnsNameserverInput((config.dns?.nameserver || []).join(', '));
    setDnsFallbackInput((config.dns?.fallback || []).join(', '));
    setDnsDefaultNameserverInput((config.dns?.['default-nameserver'] || []).join(', '));
    setDnsFakeIpFilterInput((config.dns?.['fake-ip-filter'] || []).join(', '));
  }, [config]);

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
                checked={config?.dns?.enable || false}
                onCheckedChange={(checked) => onDnsConfigChange({ enable: checked })}
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
                      onDnsConfigChange({
                        'enhanced-mode': value as DnsConfig['enhanced-mode'],
                      })
                    }
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
                        value={config?.dns?.['fake-ip-range'] || '198.18.0.1/16'}
                        onChange={(e) => onDnsConfigChange({ 'fake-ip-range': e.target.value })}
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
                          value={config?.dns?.['fake-ip-filter-mode'] || 'blacklist'}
                          onValueChange={(value) =>
                            onDnsConfigChange({
                              'fake-ip-filter-mode': value as DnsConfig['fake-ip-filter-mode'],
                            })
                          }
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
                      <Input
                        value={dnsFakeIpFilterInput}
                        onChange={(e) => setDnsFakeIpFilterInput(e.target.value)}
                        onBlur={() =>
                          onDnsConfigChange({
                            'fake-ip-filter': parseDnsList(dnsFakeIpFilterInput),
                          })
                        }
                        placeholder="域名列表，逗号分隔"
                        className={cn('w-full font-mono text-xs', CONTROL_BASE_CLASS)}
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
                      onDnsConfigChange({
                        'default-nameserver': parseDnsList(dnsDefaultNameserverInput),
                      })
                    }
                    placeholder="223.5.5.5"
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
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
                      onDnsConfigChange({ nameserver: parseDnsList(dnsNameserverInput) })
                    }
                    placeholder="https://doh.pub/dns-query"
                    className={cn('font-mono', CONTROL_BASE_CLASS)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Fallback</label>
                  <Input
                    value={dnsFallbackInput}
                    onChange={(e) => setDnsFallbackInput(e.target.value)}
                    onBlur={() => onDnsConfigChange({ fallback: parseDnsList(dnsFallbackInput) })}
                    placeholder="https://1.1.1.1/dns-query"
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
                    value={config?.dns?.['cache-algorithm'] || 'lru'}
                    onValueChange={(value) =>
                      onDnsConfigChange({
                        'cache-algorithm': value as DnsConfig['cache-algorithm'],
                      })
                    }
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
                    checked={config?.dns?.['prefer-h3'] || false}
                    onCheckedChange={(checked) => onDnsConfigChange({ 'prefer-h3': checked })}
                    className="scale-90"
                  />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    使用 Hosts
                  </span>
                  <Switch
                    checked={config?.dns?.['use-hosts'] !== false}
                    onCheckedChange={(checked) => onDnsConfigChange({ 'use-hosts': checked })}
                    className="scale-90"
                  />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    遵循路由规则
                  </span>
                  <Switch
                    checked={config?.dns?.['respect-rules'] || false}
                    onCheckedChange={(checked) => onDnsConfigChange({ 'respect-rules': checked })}
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
