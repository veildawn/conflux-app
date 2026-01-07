import { Network, Globe, Zap, LayoutGrid } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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
                type="number"
                value={config?.['mixed-port'] || ''}
                onChange={(e) => handleMixedPortChange(e.target.value)}
                placeholder="Mixed"
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
