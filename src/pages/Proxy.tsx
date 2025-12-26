import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Zap, Check, RefreshCw, Globe, Shield, Activity, BookOpen, Plus, ExternalLink, Wifi } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProxyStore } from '@/stores/proxyStore';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/useToast';
import { formatDelay, getDelayColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import type { ProxyMode, ProxyServerInfo } from '@/types/proxy';

// 代理类型对应的颜色
const getProxyTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
  if (t.includes('trojan')) return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
  if (t.includes('hysteria')) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
  if (t.includes('wireguard')) return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
  if (t.includes('tuic')) return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
};

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
  const { hasSubscription } = useAppStore(
    useShallow((state) => ({
      hasSubscription: state.hasSubscription,
    }))
  );
  const { toast } = useToast();
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  
  // 代理服务器列表
  const [proxyServers, setProxyServers] = useState<ProxyServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  const hasAnySub = hasSubscription();

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

    // 尝试找到主要代理组 (通常名为 "Proxy" 或 "GLOBAL")
    // 优先找 "Proxy" 或 "节点选择" 等常见名称，如果没有则找 "GLOBAL"
    let main = groups.find(g => ['Proxy', '节点选择', 'PROXY'].includes(g.name));
    if (!main) {
      main = groups.find(g => g.name === 'GLOBAL');
    }
    // 如果还是没找到，就取第一个 Select 类型的组
    if (!main) {
      main = groups.find(g => g.type === 'Selector');
    }

    // 剩下的组
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
    } catch (error) {
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

  // 测试所有代理服务器延迟
  const handleTestAllServerDelays = async () => {
    for (const server of proxyServers) {
      handleTestDelay(server.name);
    }
  };

  const renderGroupCard = (group: any, isMain = false) => (
    <Card 
      key={group.name} 
      className={cn(
        "bg-white dark:bg-zinc-800 rounded-[24px] shadow-sm border transition-all hover:shadow-md",
        isMain ? "border-blue-100 dark:border-blue-900/30" : "border-gray-100 dark:border-zinc-700"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pt-6 px-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
            isMain 
              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" 
              : "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
          )}>
            <Server className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {group.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs font-normal rounded-md px-1.5 py-0 bg-gray-100 dark:bg-zinc-700/50 text-gray-500 dark:text-gray-400">
                {group.type}
              </Badge>
              <span className="text-xs text-muted-foreground">{group.all.length} 个节点</span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleTestAllDelays(group.all)}
          disabled={loading}
          className="text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg gap-1.5 h-9"
        >
          <Zap className="w-4 h-4" />
          <span className="text-xs font-medium">测速全部</span>
        </Button>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
                  'relative p-3 rounded-xl border text-left transition-all duration-200 group',
                  isSelected 
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 shadow-sm ring-1 ring-blue-500/10' 
                    : 'border-gray-100 dark:border-zinc-700 bg-gray-50/30 dark:bg-zinc-900/30 hover:bg-white dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-600 hover:shadow-sm'
                )}
              >
                {/* 选中标识 */}
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                )}

                {/* 节点名称 */}
                <div className={cn(
                  "font-medium truncate pr-6 text-sm",
                  isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                )}>
                  {nodeName}
                </div>

                {/* 延迟信息 */}
                <div className="flex items-center justify-between mt-2.5">
                  {isSpecial ? (
                    <span className="text-xs text-gray-400 font-medium">
                      内置
                    </span>
                  ) : isTesting ? (
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      测试中
                    </span>
                  ) : delay !== undefined ? (
                    <span
                      className={cn('text-xs font-medium px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 shadow-sm border border-gray-100 dark:border-zinc-700', getDelayColorClass(delay))}
                    >
                      {formatDelay(delay)}
                    </span>
                  ) : (
                    <span
                      className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestDelay(nodeName);
                      }}
                    >
                      点击测速
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  // 渲染代理服务器列表卡片
  const renderProxyServersCard = () => (
    <Card className="bg-white dark:bg-zinc-800 rounded-[24px] shadow-sm border border-emerald-100 dark:border-emerald-900/30 transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pt-6 px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
              全部代理
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{proxyServers.length} 个服务器</span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTestAllServerDelays}
          disabled={loading || loadingServers}
          className="text-gray-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg gap-1.5 h-9"
        >
          <Zap className="w-4 h-4" />
          <span className="text-xs font-medium">测速全部</span>
        </Button>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        {loadingServers ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : proxyServers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">暂无代理服务器</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {proxyServers.map((server) => {
              const isTesting = testingNodes.has(server.name);
              const delay = delays[server.name];

              return (
                <div
                  key={server.name}
                  className="relative p-3 rounded-xl border border-gray-100 dark:border-zinc-700 bg-gray-50/30 dark:bg-zinc-900/30 text-left"
                >
                  {/* 节点名称 */}
                  <div className="font-medium truncate text-sm text-gray-700 dark:text-gray-300">
                    {server.name}
                  </div>

                  {/* 服务器信息 */}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={cn("text-[10px] font-medium rounded px-1.5 py-0", getProxyTypeColor(server.type))}>
                      {server.type.toUpperCase()}
                    </Badge>
                    {server.tls && (
                      <Badge variant="secondary" className="text-[10px] font-normal rounded px-1 py-0 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                        TLS
                      </Badge>
                    )}
                    {server.udp && (
                      <Badge variant="secondary" className="text-[10px] font-normal rounded px-1 py-0 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        UDP
                      </Badge>
                    )}
                  </div>

                  {/* 服务器地址 */}
                  <div className="text-[11px] text-gray-400 mt-1.5 font-mono truncate">
                    {server.server}:{server.port}
                  </div>

                  {/* 延迟信息 */}
                  <div className="flex items-center mt-2">
                    {isTesting ? (
                      <span className="text-xs text-gray-400 flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        测试中
                      </span>
                    ) : delay !== undefined ? (
                      <span
                        className={cn('text-xs font-medium px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 shadow-sm border border-gray-100 dark:border-zinc-700', getDelayColorClass(delay))}
                      >
                        {formatDelay(delay)}
                      </span>
                    ) : (
                      <span
                        className="text-xs text-gray-400 hover:text-emerald-500 transition-colors cursor-pointer"
                        onClick={() => handleTestDelay(server.name)}
                      >
                        点击测速
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderContent = () => {
    if (!status.running) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-[24px] bg-gray-50/50 dark:bg-zinc-800/50">
          <Server className="w-12 h-12 mb-4 opacity-50" />
          <p className="font-medium">服务未启动</p>
          <p className="text-sm mt-1">请先启动代理服务</p>
        </div>
      );
    }

    // 没有订阅时，显示添加订阅引导
    if (!hasAnySub) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-[24px] bg-gray-50/50 dark:bg-zinc-800/50">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p className="font-medium text-gray-600 dark:text-gray-300">还没有添加订阅</p>
          <p className="text-sm mt-1 text-center max-w-sm">
            订阅是获取代理节点的来源，请先添加订阅以使用代理功能
          </p>
          <Button 
            onClick={() => navigate('/subscription')} 
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            添加订阅
          </Button>
        </div>
      );
    }

    if (groups.length === 0 && proxyServers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-[24px] bg-gray-50/50 dark:bg-zinc-800/50">
          <Server className="w-12 h-12 mb-4 opacity-50" />
          <p className="font-medium">暂无代理</p>
          <p className="text-sm mt-1">当前订阅中没有可用的代理</p>
          <Button 
            variant="outline" 
            onClick={() => navigate('/subscription')} 
            className="mt-4 gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            管理订阅
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* 代理服务器列表 */}
        {proxyServers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 px-1">代理</h2>
            {renderProxyServersCard()}
          </div>
        )}

        {/* 策略组 (主策略组) */}
        {mainGroup && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 px-1">策略组</h2>
            {renderGroupCard(mainGroup, true)}
          </div>
        )}

        {/* 其他策略组 */}
        {strategyGroups.length > 0 && (
          <div className="space-y-4">
            {strategyGroups.map(group => renderGroupCard(group))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">代理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理代理服务器及策略组
          </p>
        </div>

        {/* 模式切换 */}
        {status.running && (
           <div className="bg-gray-100/50 dark:bg-zinc-800/50 p-1 rounded-xl border border-gray-200/50 dark:border-zinc-700/50">
            <Tabs value={status.mode} onValueChange={handleModeChange} className="w-full md:w-auto">
              <TabsList className="bg-transparent h-9 gap-1">
                <TabsTrigger 
                  value="global" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-lg transition-all"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  全局
                </TabsTrigger>
                <TabsTrigger 
                  value="rule" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-lg transition-all"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  规则
                </TabsTrigger>
                <TabsTrigger 
                  value="direct" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-lg transition-all"
                >
                  <Activity className="w-4 h-4 mr-2" />
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
