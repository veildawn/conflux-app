import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Server, 
  Zap, 
  RefreshCw, 
  Globe, 
  Shield, 
  Activity, 
  AlertCircle, 
  ExternalLink, 
  Wifi
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProxyStore } from '@/stores/proxyStore';
import { useToast } from '@/hooks/useToast';
import { formatDelay, getDelayColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import type { ProxyMode, ProxyServerInfo, ProxyGroup } from '@/types/proxy';

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

// -----------------------------------------------------------------------------
// Helper Data
// -----------------------------------------------------------------------------

const getProxyTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  if (t.includes('trojan')) return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (t.includes('hysteria')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (t.includes('wireguard')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (t.includes('tuic')) return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
  return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
};

const getProxyTypeBgColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-500';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-500';
  if (t.includes('trojan')) return 'bg-red-500';
  if (t.includes('hysteria')) return 'bg-amber-500';
  if (t.includes('wireguard')) return 'bg-emerald-500';
  if (t.includes('tuic')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Proxy() {
  const navigate = useNavigate();
  const { status, groups, fetchGroups, selectProxy, testDelay, switchMode, loading } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      groups: state.groups,
      fetchGroups: state.fetchGroups,
      selectProxy: state.selectProxy,
      testDelay: state.testDelay,
      switchMode: state.switchMode,
      loading: state.loading,
    }))
  );
  const { toast } = useToast();
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});

  // 代理服务器列表
  const [proxyServers, setProxyServers] = useState<ProxyServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  // 是否有活跃的 Profile
  const [hasActiveProfile, setHasActiveProfile] = useState<boolean | null>(null);

  // 检查是否有活跃的 Profile
  useEffect(() => {
    const checkActiveProfile = async () => {
      try {
        const activeId = await ipc.getActiveProfileId();
        setHasActiveProfile(activeId !== null);
      } catch (error) {
        console.error('Failed to check active profile:', error);
        setHasActiveProfile(false);
      }
    };
    checkActiveProfile();
  }, []);

  // 加载代理服务器列表
  const loadProxyServers = async () => {
    setLoadingServers(true);
    try {
      const servers = await ipc.getConfigProxies();
      setProxyServers(servers);
    } catch (error) {
      console.error('Failed to load proxy servers:', error);
    } finally {
      setLoadingServers(false);
    }
  };

  useEffect(() => {
    if (status.running) {
      fetchGroups();
      loadProxyServers();
    }
  }, [status.running, fetchGroups]);

  // 分类策略组
  const { mainGroup, strategyGroups } = useMemo(() => {
    if (!groups.length) return { mainGroup: null, strategyGroups: [] };

    let main = groups.find(g => ['Proxy', '节点选择', 'PROXY'].includes(g.name));
    if (!main) {
      main = groups.find(g => g.name === 'GLOBAL');
    }
    if (!main) {
      main = groups.find(g => g.type === 'Selector');
    }

    const strategies = groups.filter(g => g.name !== main?.name && g.name !== 'GLOBAL');

    return { mainGroup: main, strategyGroups: strategies };
  }, [groups]);

  const handleModeChange = async (value: string) => {
    try {
      await switchMode(value as ProxyMode);
      toast({
        title: '模式已切换',
        description: `当前模式: ${
          value === 'global' ? '全局模式' : value === 'direct' ? '直连模式' : '规则模式'
        }`,
      });
    } catch (error) {
      toast({
        title: '切换失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleSelectProxy = async (group: string, name: string) => {
    try {
      await selectProxy(group, name);
    } catch (error) {
      toast({
        title: '切换失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleTestDelay = async (name: string) => {
    setTestingNodes((prev) => new Set(prev).add(name));
    try {
      const delay = await testDelay(name);
      setDelays((prev) => ({ ...prev, [name]: delay }));
    } catch {
      setDelays((prev) => ({ ...prev, [name]: -1 }));
    } finally {
      setTestingNodes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });
    }
  };

  const handleTestAllDelays = async (groupNodes: string[]) => {
    for (const node of groupNodes) {
      if (!['DIRECT', 'REJECT'].includes(node)) {
        handleTestDelay(node);
      }
    }
  };

  const handleTestAllServerDelays = async () => {
    for (const server of proxyServers) {
      handleTestDelay(server.name);
    }
  };

  const renderGroupCard = (group: ProxyGroup, isMain = false) => (
    <BentoCard 
      key={group.name} 
      title={group.name}
      icon={Server}
      iconColor={isMain ? "text-blue-500" : "text-orange-500"}
      className="p-4"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleTestAllDelays(group.all)}
          disabled={loading}
          className="h-7 px-2 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Zap className="w-3.5 h-3.5 mr-1" />
          测速全部
        </Button>
      }
    >
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {group.all.map((nodeName: string) => {
            const isSelected = group.now === nodeName;
            const isTesting = testingNodes.has(nodeName);
            const delay = delays[nodeName];
            const isSpecial = ['DIRECT', 'REJECT', 'COMPATIBLE'].includes(nodeName);
            
            return (
              <button
                key={nodeName}
                onClick={() => handleSelectProxy(group.name, nodeName)}
                className={cn(
                  'relative p-2.5 rounded-xl border text-left transition-all duration-200 group flex flex-col justify-between h-[72px] overflow-hidden',
                  isSelected 
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/20' 
                    : 'border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-600 hover:shadow-sm'
                )}
              >
                {/* 装饰性背景光晕 */}
                {isSelected && (
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-3xl -mr-2 -mt-2 pointer-events-none" />
                )}
                
                {/* 选中标识 - 简化版 */}
                {isSelected && (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm ring-2 ring-white dark:ring-zinc-900" />
                  </div>
                )}

                {/* 节点名称 */}
                <div className={cn(
                  "font-medium text-xs line-clamp-2 leading-tight pr-3 z-10",
                  isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                )}>
                  {nodeName}
                </div>

                {/* 底部信息栏 */}
                <div className="flex items-center justify-between mt-auto pt-1.5 z-10">
                   {/* 类型/特殊标签 */}
                  {isSpecial ? (
                     <div className="flex items-center gap-1">
                        <div className="w-1 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                        <span className="text-[10px] text-gray-500">内置</span>
                     </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                       {/* 延迟指示点 */}
                       <div className={cn(
                         "w-1.5 h-1.5 rounded-full",
                         delay !== undefined 
                           ? (delay < 0 ? 'bg-red-400' : delay < 200 ? 'bg-emerald-400' : 'bg-amber-400')
                           : 'bg-gray-200 dark:bg-zinc-700'
                       )} />
                       
                       {delay !== undefined ? (
                        <span className={cn(
                          "text-[10px] font-medium tabular-nums",
                          delay < 0 ? 'text-gray-400' : delay < 200 ? 'text-emerald-500' : delay < 500 ? 'text-amber-500' : 'text-red-500'
                        )}>
                          {formatDelay(delay)}
                        </span>
                       ) : isTesting ? (
                         <RefreshCw className="w-2.5 h-2.5 animate-spin text-gray-400" />
                       ) : (
                         <span className="text-[9px] text-gray-400 group-hover:text-blue-500 transition-colors">测速</span>
                       )}
                    </div>
                  )}

                  {/* 测速按钮 (仅在未测速且非特殊节点时显示) */}
                  {!isTesting && delay === undefined && !isSpecial && (
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2 right-2 p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestDelay(nodeName);
                      }}
                    >
                      <Zap className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
    </BentoCard>
  );

  // 渲染代理服务器列表卡片
  const renderProxyServersCard = () => (
    <BentoCard 
      title="全部代理" 
      icon={Wifi} 
      iconColor="text-emerald-500"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTestAllServerDelays}
          disabled={loading || loadingServers}
          className="h-7 px-2 text-xs text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
        >
          <Zap className="w-3.5 h-3.5 mr-1" />
          测速全部
        </Button>
      }
    >
        {loadingServers ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : proxyServers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">暂无代理服务器</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {proxyServers.map((server) => {
              const isTesting = testingNodes.has(server.name);
              const delay = delays[server.name];

              return (
                <div
                  key={server.name}
                  className="relative p-2.5 rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-600 transition-all flex flex-col justify-between h-[80px] group overflow-hidden"
                >
                  <div className="z-10">
                    {/* 节点名称 */}
                    <div className="font-medium text-xs text-gray-700 dark:text-gray-300 line-clamp-1 mb-0.5">
                      {server.name}
                    </div>

                     {/* 服务器地址 */}
                    <div className="text-[10px] text-gray-400 font-mono truncate opacity-60">
                      {server.server}:{server.port}
                    </div>
                  </div>

                  {/* 装饰性背景 */}
                  <div className={cn(
                    "absolute -right-4 -bottom-4 w-12 h-12 rounded-full opacity-5 pointer-events-none transition-opacity group-hover:opacity-10",
                    getProxyTypeBgColor(server.type)
                  )} />

                  <div className="flex items-end justify-between z-10">
                    {/* 服务器信息 */}
                    <div className="flex flex-wrap gap-1">
                      <span className={cn("text-[9px] font-bold rounded-md px-1 py-0.5 uppercase tracking-wider", getProxyTypeColor(server.type))}>
                        {server.type}
                      </span>
                      {server.udp && (
                         <span className="text-[9px] font-bold rounded-md px-1 py-0.5 bg-blue-500/5 text-blue-600 dark:text-blue-400 border border-blue-500/10">UDP</span>
                      )}
                    </div>

                    {/* 延迟信息 */}
                    <div>
                      {isTesting ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                      ) : delay !== undefined ? (
                        <div className="flex items-center gap-1">
                          <div className={cn(
                             "w-1.5 h-1.5 rounded-full",
                             delay < 0 ? 'bg-red-400' : delay < 200 ? 'bg-emerald-400' : 'bg-amber-400'
                           )} />
                          <span
                            className={cn('text-[10px] font-bold', getDelayColorClass(delay).replace('bg-', 'text-').replace('/10', ''))}
                          >
                            {formatDelay(delay)}
                          </span>
                        </div>
                      ) : (
                        <div 
                           className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-md cursor-pointer"
                           onClick={() => handleTestDelay(server.name)}
                        >
                          <Zap className="w-3 h-3 text-gray-400 hover:text-emerald-500" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </BentoCard>
  );

  const renderContent = () => {
    if (!status.running) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-[20px] bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
             <Server className="w-8 h-8 opacity-40" />
          </div>
          <p className="font-semibold text-gray-600 dark:text-gray-300">服务未启动</p>
          <p className="text-sm mt-1">请先启动核心服务</p>
        </div>
      );
    }

    if (hasActiveProfile === false) {
      return (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      );
    }

    if (groups.length === 0 && proxyServers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-[20px] bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
             <Server className="w-8 h-8 opacity-40" />
          </div>
          <p className="font-semibold text-gray-600 dark:text-gray-300">暂无代理</p>
          <p className="text-sm mt-1">当前订阅中没有可用的代理节点</p>
          <Button 
            variant="outline" 
            onClick={() => navigate('/subscription')} 
            className="mt-6 rounded-full gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            管理订阅
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* 策略组 (主策略组) */}
        {mainGroup && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 px-1 uppercase tracking-wider">策略组</h2>
            {renderGroupCard(mainGroup, true)}
          </div>
        )}

        {/* 其他策略组 */}
        {strategyGroups.length > 0 && (
          <div className="space-y-4">
             {/* 可以在这里添加一个小标题，如果需要区分的话 */}
            {strategyGroups.map(group => renderGroupCard(group))}
          </div>
        )}

         {/* 代理服务器列表 */}
        {proxyServers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 px-1 uppercase tracking-wider">所有节点</h2>
            {renderProxyServersCard()}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">节点</h1>
        </div>

        {/* 模式切换 */}
        {status.running && (
           <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-full border border-gray-200 dark:border-zinc-700 inline-flex">
            <Tabs value={status.mode} onValueChange={handleModeChange} className="w-full md:w-auto">
              <TabsList className="bg-transparent h-8 p-0 gap-1">
                <TabsTrigger 
                  value="rule" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full transition-all text-xs h-full"
                >
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  规则
                </TabsTrigger>
                <TabsTrigger 
                  value="global" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full transition-all text-xs h-full"
                >
                  <Globe className="w-3.5 h-3.5 mr-1.5" />
                  全局
                </TabsTrigger>
                <TabsTrigger 
                  value="direct" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full transition-all text-xs h-full"
                >
                  <Activity className="w-3.5 h-3.5 mr-1.5" />
                  直连
                </TabsTrigger>
              </TabsList>
            </Tabs>
           </div>
        )}
      </div>

      {renderContent()}
    </div>
  );
}
