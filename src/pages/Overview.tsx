import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { 
  Settings2, 
  Globe, 
  ShieldCheck, 
  Share2, 
  Laptop
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useProxyStore } from '@/stores/proxyStore';
import { useToast } from '@/hooks/useToast';
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
    setEnhancedMode,
    setAllowLan,
    setPorts,
    setIpv6,
    setTcpConcurrent
  } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      fetchStatus: state.fetchStatus,
      setSystemProxy: state.setSystemProxy,
      setEnhancedMode: state.setEnhancedMode,
      setAllowLan: state.setAllowLan,
      setPorts: state.setPorts,
      setIpv6: state.setIpv6,
      setTcpConcurrent: state.setTcpConcurrent,
    }))
  );
  const { toast } = useToast();
  const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  // 仅在进入页面时刷新状态
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSystemProxyToggle = (checked: boolean) => {
    setSystemProxy(checked).catch((error) => {
      console.error('Failed to set system proxy:', error);
      toast({
        title: checked ? '无法开启系统代理' : '无法关闭系统代理',
        description: formatError(error),
        variant: 'destructive',
      });
    });
  };

  const handleEnhancedModeToggle = (checked: boolean) => {
    setEnhancedMode(checked).catch((error) => {
      console.error('Failed to set enhanced mode:', error);
      toast({
        title: checked ? '无法开启增强模式' : '无法关闭增强模式',
        description: formatError(error),
        variant: 'destructive',
      });
    });
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

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">概览</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        
        {/* Network Takeover */}
        <BentoCard 
          className="md:col-span-1 p-4" 
          title="网络接管" 
          icon={Globe} 
          iconColor="text-blue-500"
        >
           <div className="grid grid-cols-1 gap-4">
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

        <BentoCard
          className="md:col-span-1 p-4"
          title="网络配置"
          icon={Settings2}
          iconColor="text-emerald-500"
        >
           <div className="grid grid-cols-1 gap-4">
             <ControlItem
               label="IPv6"
               description="启用 IPv6 网络支持，适用于 IPv6 环境的代理连接。"
               checked={!!status.ipv6}
               onCheckedChange={handleIpv6Toggle}
               statusText={status.ipv6 ? "IPv6 已启用" : "IPv6 未启用"}
               icon={Globe}
             />
             <ControlItem
               label="TCP 并发"
               description="允许建立并发 TCP 连接以提升链路性能。"
               checked={!!status.tcp_concurrent}
               onCheckedChange={handleTcpConcurrentToggle}
               statusText={status.tcp_concurrent ? "TCP 并发已开启" : "TCP 并发未开启"}
               icon={ShieldCheck}
             />
           </div>
        </BentoCard>

        {/* LAN Access */}
        <BentoCard 
          title="局域网共享" 
          icon={Share2} 
          iconColor="text-orange-500"
          className="md:col-span-2 p-4"
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
                     <div className="flex items-center gap-3">
                        <Switch
                          checked={!!status.allow_lan}
                          onCheckedChange={handleAllowLanToggle}
                          className="data-[state=checked]:bg-orange-500"
                        />
                        {status.allow_lan && (
                          <span className="text-xs font-mono bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                            已开启
                          </span>
                        )}
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 items-end">
                      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-800 space-y-2">
                        <div className="text-[10px] uppercase text-gray-400 font-bold">HTTP 端口</div>
                        <Input
                          value={httpPort}
                          onChange={(event) => {
                            setHttpPort(event.target.value);
                            setPortsDirty(true);
                          }}
                          onBlur={handlePortBlur}
                          inputMode="numeric"
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-800 space-y-2">
                        <div className="text-[10px] uppercase text-gray-400 font-bold">SOCKS5 端口</div>
                        <Input
                          value={socksPort}
                          onChange={(event) => {
                            setSocksPort(event.target.value);
                            setPortsDirty(true);
                          }}
                          onBlur={handlePortBlur}
                          inputMode="numeric"
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                      <div className="flex md:justify-end">
                        {portError && (
                          <div className="text-[10px] font-semibold text-rose-500">
                            {portError}
                          </div>
                        )}
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
