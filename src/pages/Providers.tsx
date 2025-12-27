import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  RefreshCw,
  Activity,
  Shield,
  Clock,
  Server,
  Loader2,
  ChevronRight,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { useProxyStore } from '@/stores/proxyStore';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProxyProvider {
  name: string;
  type: string;
  vehicleType: string;
  proxies: { name: string; type: string; udp?: boolean; now?: string }[];
  updatedAt?: string;
  subscriptionInfo?: {
    Upload?: number;
    Download?: number;
    Total?: number;
    Expire?: number;
  };
}

interface RuleProvider {
  name: string;
  type: string;
  behavior: string;
  ruleCount: number;
  updatedAt?: string;
  vehicleType: string;
}

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '未知';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function getVehicleTypeStyle(type: string) {
  switch (type.toLowerCase()) {
    case 'http':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20';
    case 'file':
      return 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-200/50 dark:border-green-500/20';
    default:
      return 'bg-gray-50 text-gray-700 dark:bg-zinc-800 dark:text-gray-400 border-gray-200/50 dark:border-zinc-700';
  }
}

function getBehaviorStyle(behavior: string) {
  switch (behavior.toLowerCase()) {
    case 'domain':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400';
    case 'ipcidr':
      return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400';
    case 'classical':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
    default:
      return 'bg-gray-50 text-gray-700 dark:bg-zinc-800 dark:text-gray-400';
  }
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Providers() {
  const { toast } = useToast();
  const { status } = useProxyStore();
  const [activeTab, setActiveTab] = useState<'proxy' | 'rule'>('proxy');

  // Proxy Providers
  const [proxyProviders, setProxyProviders] = useState<ProxyProvider[]>([]);
  const [loadingProxy, setLoadingProxy] = useState(true);
  const [updatingProxy, setUpdatingProxy] = useState<string | null>(null);
  const [healthCheckingProxy, setHealthCheckingProxy] = useState<string | null>(null);

  // Rule Providers
  const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>([]);
  const [loadingRule, setLoadingRule] = useState(true);
  const [updatingRule, setUpdatingRule] = useState<string | null>(null);

  // 展开的 provider
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // 获取代理 Providers
  const fetchProxyProviders = useCallback(async () => {
    if (!status.running) {
      setProxyProviders([]);
      setLoadingProxy(false);
      return;
    }

    setLoadingProxy(true);
    try {
      const data = await ipc.getProxyProviders();
      setProxyProviders(data);
    } catch (error) {
      console.error('Failed to fetch proxy providers:', error);
      setProxyProviders([]);
    } finally {
      setLoadingProxy(false);
    }
  }, [status.running]);

  // 获取规则 Providers
  const fetchRuleProviders = useCallback(async () => {
    if (!status.running) {
      setRuleProviders([]);
      setLoadingRule(false);
      return;
    }

    setLoadingRule(true);
    try {
      const data = await ipc.getRuleProviders();
      setRuleProviders(data);
    } catch (error) {
      console.error('Failed to fetch rule providers:', error);
      setRuleProviders([]);
    } finally {
      setLoadingRule(false);
    }
  }, [status.running]);

  useEffect(() => {
    fetchProxyProviders();
    fetchRuleProviders();
  }, [fetchProxyProviders, fetchRuleProviders]);

  // 更新代理 Provider
  const handleUpdateProxyProvider = async (name: string) => {
    setUpdatingProxy(name);
    try {
      await ipc.updateProxyProvider(name);
      await fetchProxyProviders();
      toast({
        title: '更新成功',
        description: `代理源 "${name}" 已更新`,
      });
    } catch (error) {
      console.error('Failed to update proxy provider:', error);
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingProxy(null);
    }
  };

  // 健康检查
  const handleHealthCheck = async (name: string) => {
    setHealthCheckingProxy(name);
    try {
      await ipc.healthCheckProxyProvider(name);
      toast({
        title: '健康检查完成',
        description: `代理源 "${name}" 健康检查已完成`,
      });
    } catch (error) {
      console.error('Failed to health check proxy provider:', error);
      toast({
        title: '健康检查失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setHealthCheckingProxy(null);
    }
  };

  // 更新规则 Provider
  const handleUpdateRuleProvider = async (name: string) => {
    setUpdatingRule(name);
    try {
      await ipc.updateRuleProvider(name);
      await fetchRuleProviders();
      toast({
        title: '更新成功',
        description: `规则源 "${name}" 已更新`,
      });
    } catch (error) {
      console.error('Failed to update rule provider:', error);
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingRule(null);
    }
  };

  // 全部更新
  const handleUpdateAll = async () => {
    if (activeTab === 'proxy') {
      for (const provider of proxyProviders) {
        await handleUpdateProxyProvider(provider.name);
      }
    } else {
      for (const provider of ruleProviders) {
        await handleUpdateRuleProvider(provider.name);
      }
    }
  };

  const currentProviders = activeTab === 'proxy' ? proxyProviders : ruleProviders;
  const isLoading = activeTab === 'proxy' ? loadingProxy : loadingRule;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">订阅源</h1>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdateAll}
              disabled={!status.running || currentProviders.length === 0}
              className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            >
              <RefreshCw className="w-4 h-4" />
              全部更新
            </Button>

            <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-full border border-gray-200 dark:border-zinc-700 inline-flex h-9">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'proxy' | 'rule')}>
                <TabsList className="bg-transparent h-full p-0 gap-1">
                  <TabsTrigger value="proxy" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all">
                    <Server className="w-3.5 h-3.5" />
                    代理源
                  </TabsTrigger>
                  <TabsTrigger value="rule" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all">
                    <Shield className="w-3.5 h-3.5" />
                    规则源
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {!status.running ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <Box className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">代理未运行</p>
          <p className="text-sm mt-1">启动代理后查看订阅源信息</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : currentProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <Box className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">
            暂无{activeTab === 'proxy' ? '代理' : '规则'}源
          </p>
          <p className="text-sm mt-1">配置文件中未定义 {activeTab === 'proxy' ? 'proxy-providers' : 'rule-providers'}</p>
        </div>
      ) : activeTab === 'proxy' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proxyProviders.map((provider) => {
            const isUpdating = updatingProxy === provider.name;
            const isHealthChecking = healthCheckingProxy === provider.name;
            const isExpanded = expandedProvider === provider.name;

            return (
              <BentoCard
                key={provider.name}
                className={cn(
                  "group transition-all",
                  isUpdating && "opacity-70"
                )}
                title={provider.vehicleType}
                icon={Server}
                iconColor="text-blue-500"
                action={
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                      title="健康检查"
                      onClick={() => handleHealthCheck(provider.name)}
                      disabled={isUpdating || isHealthChecking}
                    >
                      {isHealthChecking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                      title="更新"
                      onClick={() => handleUpdateProxyProvider(provider.name)}
                      disabled={isUpdating || isHealthChecking}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  {/* Provider Name */}
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase",
                        getVehicleTypeStyle(provider.vehicleType)
                      )}>
                        {provider.vehicleType}
                      </span>
                      <span className="text-xs text-gray-400">
                        {provider.proxies?.length || 0} 个节点
                      </span>
                    </div>
                  </div>

                  {/* Subscription Info */}
                  {provider.subscriptionInfo && (
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>已用:</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {formatBytes((provider.subscriptionInfo.Upload || 0) + (provider.subscriptionInfo.Download || 0))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>总量:</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {formatBytes(provider.subscriptionInfo.Total || 0)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Update Time */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>更新于 {formatDate(provider.updatedAt)}</span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1 text-gray-400 hover:text-gray-600"
                      onClick={() => setExpandedProvider(isExpanded ? null : provider.name)}
                    >
                      查看节点
                      <ChevronRight className={cn(
                        "w-3 h-3 transition-transform",
                        isExpanded && "rotate-90"
                      )} />
                    </Button>
                  </div>

                  {/* Expanded Proxies */}
                  {isExpanded && provider.proxies && (
                    <div className="pt-3 border-t border-gray-100 dark:border-zinc-800/50 space-y-2 max-h-[200px] overflow-y-auto">
                      {provider.proxies.map((proxy, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-800/50 rounded-lg text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-gray-700 dark:text-gray-300 truncate">
                              {proxy.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500">
                              {proxy.type}
                            </span>
                            {proxy.udp && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                UDP
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </BentoCard>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {ruleProviders.map((provider) => {
            const isUpdating = updatingRule === provider.name;

            return (
              <BentoCard
                key={provider.name}
                className={cn(
                  "group transition-all",
                  isUpdating && "opacity-70"
                )}
                title={provider.behavior}
                icon={FileText}
                iconColor="text-purple-500"
                action={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    title="更新"
                    onClick={() => handleUpdateRuleProvider(provider.name)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                  </Button>
                }
              >
                <div className="space-y-4">
                  {/* Provider Name */}
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                        getBehaviorStyle(provider.behavior)
                      )}>
                        {provider.behavior}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase",
                        getVehicleTypeStyle(provider.vehicleType)
                      )}>
                        {provider.vehicleType}
                      </span>
                    </div>
                  </div>

                  {/* Rule Count */}
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-bold text-gray-900 dark:text-white">{provider.ruleCount}</span> 条规则
                    </span>
                  </div>

                  {/* Update Time */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-3 border-t border-gray-100 dark:border-zinc-800/50">
                    <Clock className="w-3.5 h-3.5" />
                    <span>更新于 {formatDate(provider.updatedAt)}</span>
                  </div>
                </div>
              </BentoCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
