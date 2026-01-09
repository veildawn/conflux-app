import { useState, useEffect, useCallback } from 'react';
import { Network, Globe, Zap, LayoutGrid, Layers, Shield } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { BentoCard, SettingItem, Divider, SectionHeader, CONTROL_BASE_CLASS } from '../components';
import { ipc } from '@/services/ipc';
import type { MihomoConfig } from '@/types/config';
import type { ProxyStatus } from '@/types/proxy';

// 默认排除的内网网段
const DEFAULT_INET4_ROUTE_EXCLUDE_ADDRESS = [
  '192.168.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '127.0.0.1/32',
];

/**
 * 比较两个字符串数组是否相等
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

interface NetworkSectionProps {
  config: MihomoConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<MihomoConfig | null>>;
  status: ProxyStatus;
  httpPort: string;
  socksPort: string;
  onHttpPortChange: (value: string) => void;
  onSocksPortChange: (value: string) => void;
  onPortBlur: () => void;
  onAllowLanToggle: (checked: boolean) => void;
  onIpv6Toggle: (checked: boolean) => void;
  onTcpConcurrentToggle: (checked: boolean) => void;
  toast: (options: { title: string; description?: string; variant?: 'destructive' }) => void;
}

export function NetworkSection({
  config,
  setConfig,
  status,
  httpPort,
  socksPort,
  onHttpPortChange,
  onSocksPortChange,
  onPortBlur,
  onAllowLanToggle,
  onIpv6Toggle,
  onTcpConcurrentToggle,
  toast,
}: NetworkSectionProps) {
  // 路由排除地址的本地输入状态
  // 使用函数初始化，避免在 useEffect 中调用 setState
  const [routeExcludeInput, setRouteExcludeInput] = useState(() => {
    const addresses =
      config?.tun?.['inet4-route-exclude-address'] ?? DEFAULT_INET4_ROUTE_EXCLUDE_ADDRESS;
    return addresses.join('\n');
  });

  // 当 config.tun 变化时，同步到本地状态（仅在外部配置变化时更新）
  const tunConfigKey = JSON.stringify(config?.tun?.['inet4-route-exclude-address']);
  useEffect(() => {
    const addresses =
      config?.tun?.['inet4-route-exclude-address'] ?? DEFAULT_INET4_ROUTE_EXCLUDE_ADDRESS;
    setRouteExcludeInput(addresses.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tunConfigKey]);

  const handleMixedPortChange = async (value: string) => {
    const port = Number.parseInt(value, 10);
    if (isNaN(port)) return;
    try {
      await ipc.setMixedPort(port);
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

  const handleTunEnableChange = async (checked: boolean) => {
    try {
      await ipc.setTunMode(checked);
      setConfig((prev) => {
        if (!prev) return prev;
        const currentTun = prev.tun || {
          enable: false,
          stack: 'system',
          'auto-route': true,
          'auto-detect-interface': true,
          'dns-hijack': ['any:53'],
        };
        return {
          ...prev,
          tun: { ...currentTun, enable: checked },
        };
      });
      toast({ title: checked ? 'TUN 模式已启用' : 'TUN 模式已禁用' });
    } catch (error) {
      toast({ title: '设置失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleTunStackChange = async (stack: string) => {
    try {
      await ipc.setTunStack(stack);
      setConfig((prev) => {
        if (!prev) return prev;
        const currentTun = prev.tun || {
          enable: false,
          stack: 'system',
          'auto-route': true,
          'auto-detect-interface': true,
          'dns-hijack': ['any:53'],
        };
        return {
          ...prev,
          tun: { ...currentTun, stack },
        };
      });
      toast({ title: 'TUN 协议栈已更新' });
    } catch (error) {
      toast({ title: '设置失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleStrictRouteChange = async (checked: boolean) => {
    try {
      await ipc.setStrictRoute(checked);
      setConfig((prev) => {
        if (!prev) return prev;
        const currentTun = prev.tun || {
          enable: false,
          stack: 'system',
          'auto-route': true,
          'auto-detect-interface': true,
          'dns-hijack': ['any:53'],
        };
        return {
          ...prev,
          tun: { ...currentTun, 'strict-route': checked },
        };
      });
      toast({ title: checked ? '严格路由已启用' : '严格路由已禁用' });
    } catch (error) {
      toast({ title: '设置失败', description: String(error), variant: 'destructive' });
    }
  };

  // 在失去焦点时保存路由排除地址
  const handleRouteExcludeBlur = useCallback(async () => {
    const newAddresses = routeExcludeInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const currentAddresses =
      config?.tun?.['inet4-route-exclude-address'] ?? DEFAULT_INET4_ROUTE_EXCLUDE_ADDRESS;

    // 只在值改变时才更新
    if (arraysEqual(newAddresses, currentAddresses)) {
      return;
    }

    try {
      await ipc.setTunRouteExclude(newAddresses);
      setConfig((prev) => {
        if (!prev) return prev;
        const currentTun = prev.tun || {
          enable: false,
          stack: 'system',
          'auto-route': true,
          'auto-detect-interface': true,
          'dns-hijack': ['any:53'],
        };
        return {
          ...prev,
          tun: { ...currentTun, 'inet4-route-exclude-address': newAddresses },
        };
      });
      toast({ title: '路由排除地址已更新' });
    } catch (error) {
      toast({ title: '设置失败', description: String(error), variant: 'destructive' });
    }
  }, [routeExcludeInput, config?.tun, setConfig, toast]);

  return (
    <div>
      <SectionHeader title="网络" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 端口配置 */}
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
                  onChange={(e) => onHttpPortChange(e.target.value)}
                  onBlur={onPortBlur}
                  placeholder="7890"
                  className={cn('w-16 text-center font-mono', CONTROL_BASE_CLASS)}
                  title="HTTP Port"
                />
                <span className="text-gray-300 text-xs">/</span>
                <Input
                  value={socksPort}
                  onChange={(e) => onSocksPortChange(e.target.value)}
                  onBlur={onPortBlur}
                  placeholder="7891"
                  className={cn('w-16 text-center font-mono', CONTROL_BASE_CLASS)}
                  title="SOCKS Port"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Mixed Port</span>
              <Input
                type="text"
                value={config?.['mixed-port'] ?? ''}
                onChange={(e) => handleMixedPortChange(e.target.value)}
                className={cn('w-20 text-center font-mono', CONTROL_BASE_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-gray-600 dark:text-gray-300">局域网共享</span>
              <Switch
                checked={!!status.allow_lan}
                onCheckedChange={onAllowLanToggle}
                className="scale-90"
              />
            </div>
          </div>
        </BentoCard>

        {/* TUN 模式 */}
        <BentoCard
          title="TUN 模式"
          icon={Layers}
          iconColor="text-cyan-500"
          className="md:col-span-1"
        >
          <div className="p-5 pt-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">启用 TUN 模式</span>
              <Switch
                checked={!!config?.tun?.enable}
                onCheckedChange={handleTunEnableChange}
                className="scale-90"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">协议栈 (Stack)</span>
              <Select
                value={config?.tun?.stack || 'system'}
                onValueChange={handleTunStackChange}
                disabled={!config?.tun?.enable}
              >
                <SelectTrigger className={cn('w-28', CONTROL_BASE_CLASS)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="gvisor">gVisor</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">严格路由</span>
              <Switch
                checked={!!config?.tun?.['strict-route']}
                onCheckedChange={handleStrictRouteChange}
                disabled={!config?.tun?.enable}
                className="scale-90"
              />
            </div>
          </div>
        </BentoCard>

        {/* 路由排除地址 */}
        <BentoCard
          title="路由排除地址"
          icon={Shield}
          iconColor="text-orange-500"
          className="md:col-span-1"
        >
          <div className="p-5 pt-2 flex flex-col gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              排除内网网段，即使在全局模式下这些 IP 也不经过代理（每行一个 CIDR）
            </p>
            <Textarea
              value={routeExcludeInput}
              onChange={(e) => setRouteExcludeInput(e.target.value)}
              onBlur={handleRouteExcludeBlur}
              placeholder="192.168.0.0/16&#10;10.0.0.0/8&#10;172.16.0.0/12&#10;127.0.0.1/32"
              className={cn('min-h-[100px] font-mono text-xs', CONTROL_BASE_CLASS)}
              disabled={!config?.tun?.enable}
            />
          </div>
        </BentoCard>

        {/* 高级选项 */}
        <BentoCard className="md:col-span-1">
          <SettingItem
            icon={Globe}
            iconBgColor="bg-indigo-50 dark:bg-indigo-500/10"
            iconColor="text-indigo-500"
            title="IPv6"
            description="启用 IPv6 协议栈"
            action={
              <Switch checked={!!status.ipv6} onCheckedChange={onIpv6Toggle} className="scale-90" />
            }
          />
          <Divider />
          <SettingItem
            icon={Zap}
            iconBgColor="bg-amber-50 dark:bg-amber-500/10"
            iconColor="text-amber-500"
            title="TCP 并发"
            description="并发连接以优化速度"
            action={
              <Switch
                checked={!!status.tcp_concurrent}
                onCheckedChange={onTcpConcurrentToggle}
                className="scale-90"
              />
            }
          />
          <Divider />
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
                <SelectTrigger className={cn('w-24', CONTROL_BASE_CLASS)}>
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
  );
}
