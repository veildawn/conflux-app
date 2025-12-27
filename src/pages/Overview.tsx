import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { 
  MoreHorizontal, 
  Settings2, 
  Globe, 
  ShieldCheck, 
  Share2, 
  Laptop
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useProxyStore } from '@/stores/proxyStore';
import { cn } from '@/utils/cn';

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

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
      "bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-center mb-4 z-10">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
            {title && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10">{children}</div>
    </div>
  );
}

function ControlItem({
  label,
  description,
  checked,
  onCheckedChange,
  statusText,
  icon: Icon,
  className
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  statusText?: string;
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          {Icon && (
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
              checked 
                ? "bg-blue-500 text-white shadow-md shadow-blue-500/20" 
                : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
            )}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight mb-1">{label}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-[280px]">
              {description}
            </p>
          </div>
        </div>
        <Switch 
          checked={checked} 
          onCheckedChange={onCheckedChange}
          className="data-[state=checked]:bg-blue-500"
        />
      </div>
      
      {statusText && (
        <div className="flex items-center gap-2 ml-[52px]">
           <div className={cn(
             "w-1.5 h-1.5 rounded-full",
             checked ? "bg-emerald-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
           )} />
           <span className={cn(
             "text-[10px] font-medium uppercase tracking-wider",
             checked ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
           )}>
             {statusText}
           </span>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

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
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">概览</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Network Takeover */}
        <BentoCard 
          className="md:col-span-2" 
          title="网络接管" 
          icon={Globe} 
          iconColor="text-blue-500"
        >
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
             <ControlItem
               label="系统代理"
               description="将系统网络流量重定向至 Conflux，适用于大多数浏览器和应用程序。"
               checked={status.system_proxy}
               onCheckedChange={handleSystemProxyToggle}
               statusText={status.system_proxy ? "系统代理已启用" : "系统代理未启用"}
               icon={Settings2}
             />
             <ControlItem
               label="增强模式"
               description="接管不遵循系统代理设置的应用程序流量，提供更全面的网络覆盖。"
               checked={!!status.enhanced_mode}
               onCheckedChange={handleEnhancedModeToggle}
               statusText={status.enhanced_mode ? "增强模式已激活" : "增强模式未激活"}
               icon={ShieldCheck}
             />
           </div>
        </BentoCard>

        {/* LAN Access */}
        <BentoCard 
          title="局域网共享" 
          icon={Share2} 
          iconColor="text-orange-500"
          className="md:col-span-2"
        >
           <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <Laptop className="w-5 h-5" />
                </div>
                <div className="flex-1">
                   <div className="flex justify-between items-start">
                     <div>
                       <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight mb-1">HTTP & SOCKS5 代理</h3>
                       <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg">
                         允许局域网内的其他设备通过 Conflux 连接网络。请确保防火墙允许相关端口的入站连接。
                       </p>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                          {status.allow_lan ? '已开启' : '已关闭'}
                        </span>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-800">
                        <div className="text-[10px] uppercase text-gray-400 font-bold mb-1">HTTP 端口</div>
                        <div className="text-base font-mono font-medium text-gray-700 dark:text-gray-300">{status.port}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-800">
                        <div className="text-[10px] uppercase text-gray-400 font-bold mb-1">SOCKS5 端口</div>
                        <div className="text-base font-mono font-medium text-gray-700 dark:text-gray-300">{status.socks_port}</div>
                      </div>
                   </div>
                </div>
              </div>
           </div>
        </BentoCard>

      </div>
    </div>
  );
}
