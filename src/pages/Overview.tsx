import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MoreHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useProxyStore } from '@/stores/proxyStore';
import { cn } from '@/utils/cn';

interface StatusCardProps {
  title: string;
  description: string;
  isEnabled: boolean;
  onToggle: (checked: boolean) => void;
  statusText: string;
  statusColor: 'green' | 'red' | 'orange' | 'gray';
  showMore?: boolean;
  className?: string;
}

const StatusCard = ({
  title,
  description,
  isEnabled,
  onToggle,
  statusText,
  statusColor,
  showMore = false,
  className
}: StatusCardProps) => {
  const statusColorMap = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-400'
  };

  return (
    <div className={cn(
      "group relative bg-white dark:bg-zinc-800 rounded-[24px] p-5 md:p-6 border border-gray-100 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[160px]",
      className
    )}>
      {/* Background decoration */}
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[24px]" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight group-hover:text-primary transition-colors duration-300">{title}</h3>
          <Switch 
            checked={isEnabled} 
            onCheckedChange={onToggle} 
            className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700"
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2 mb-4 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-300">
          {description}
        </p>
      </div>
      
      <div className="relative z-10 flex justify-between items-center mt-auto pt-4">
        <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-zinc-700/50 rounded-full px-3 py-1.5 transition-colors group-hover:bg-gray-100 dark:group-hover:bg-zinc-700">
          <div className="relative flex items-center justify-center w-2.5 h-2.5">
            <div className={cn("absolute w-full h-full rounded-full animate-ping opacity-75", statusColorMap[statusColor].split(' ')[0])} />
            <div className={cn("relative w-2 h-2 rounded-full", statusColorMap[statusColor])} />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{statusText}</span>
        </div>
        {showMore && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default function Overview() {
  const {
    status,
    fetchStatus,
    setSystemProxy,
    setEnhancedMode
  } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      fetchStatus: state.fetchStatus,
      setSystemProxy: state.setSystemProxy,
      setEnhancedMode: state.setEnhancedMode,
    }))
  );

  // 定期刷新状态
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSystemProxyToggle = (checked: boolean) => {
    setSystemProxy(checked).catch(console.error);
  };

  const handleEnhancedModeToggle = (checked: boolean) => {
    setEnhancedMode(checked).catch(console.error);
  };

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      <div>
        <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 tracking-tight">概览</h1>
      </div>

      {/* 网络接管 */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1">网络接管</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatusCard
            title="系统代理"
            description="大多数应用的流量可以通过将 Conflux 设置为系统代理接管，具有最佳的兼容性和性能。"
            isEnabled={status.system_proxy}
            onToggle={handleSystemProxyToggle}
            statusText={status.system_proxy ? "系统代理已启用" : "系统代理未启用"}
            statusColor={status.system_proxy ? "green" : "gray"}
            showMore
          />
          <StatusCard
            title="增强模式"
            description="部分应用可能不遵循系统代理设置。使用增强模式可以让所有应用由 Conflux 处理。"
            isEnabled={!!status.enhanced_mode}
            onToggle={handleEnhancedModeToggle}
            statusText={status.enhanced_mode ? "增强模式已激活" : "增强模式未激活"}
            statusColor={status.enhanced_mode ? "green" : "gray"}
          />
        </div>
      </section>

      {/* 局域网设备接管 */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1">局域网设备接管</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatusCard
            title="HTTP & SOCKS5 代理"
            description="Conflux 可以被其他设备用作标准的 HTTP 和 SOCKS5 代理服务器。"
            isEnabled={true} // Always enabled in this view for now
            onToggle={() => {}} 
            statusText={`HTTP 代理监听在 127.0.0.1:${status.port}`}
            statusColor="green"
            showMore
          />
        </div>
      </section>
    </div>
  );
}
