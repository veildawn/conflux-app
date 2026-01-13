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
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProxyStore } from '@/stores/proxyStore';
import { useToast } from '@/hooks/useToast';
import { formatDelay } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import type { ProxyMode, ProxyServerInfo, ProxyGroup } from '@/types/proxy';
import { TextWithFlag } from '@/components/ui/RegionFlag';

const MANUAL_SELECT_TYPES = new Set(['selector']);
const CARD_BG_STORAGE_KEY = 'proxy-group-card-backgrounds';
const CARD_BACKGROUNDS = [
  'bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/30 dark:to-rose-950/20',
  'bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-sky-950/30 dark:to-emerald-950/20',
  'bg-gradient-to-br from-indigo-50 to-cyan-50 dark:from-indigo-950/30 dark:to-cyan-950/20',
  'bg-gradient-to-br from-lime-50 to-teal-50 dark:from-lime-950/25 dark:to-teal-950/20',
  'bg-gradient-to-br from-fuchsia-50 to-orange-50 dark:from-fuchsia-950/25 dark:to-orange-950/20',
  'bg-gradient-to-br from-slate-50 to-stone-50 dark:from-slate-900/40 dark:to-stone-900/30',
];

const isManualSelectableGroup = (group: ProxyGroup) =>
  MANUAL_SELECT_TYPES.has(group.type.trim().toLowerCase());

const getGroupTypeLabel = (group: ProxyGroup) => {
  const type = group.type.trim().toLowerCase();
  if (type === 'selector') return '手动选择策略组';
  if (type === 'urltest') return 'Smart 策略组';
  if (type === 'fallback') return 'Fallback 策略组';
  if (type === 'loadbalance') return 'Smart 策略组';
  return '策略组';
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Proxy() {
  const navigate = useNavigate();
  const { status, groups, fetchGroups, selectProxy, testDelay, switchMode, loading } =
    useProxyStore(
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
  const [testingPolicies, setTestingPolicies] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [activeGroup, setActiveGroup] = useState<ProxyGroup | null>(null);
  const [cardBackgrounds, setCardBackgrounds] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(CARD_BG_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  // 代理服务器列表
  const [proxyServers, setProxyServers] = useState<ProxyServerInfo[]>([]);

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
    try {
      const servers = await ipc.getConfigProxies();
      setProxyServers(servers);
    } catch (error) {
      console.error('Failed to load proxy servers:', error);
    }
  };

  // 获取策略组（带模式过滤）
  useEffect(() => {
    if (status.running) {
      fetchGroups(status.mode);
      loadProxyServers();
    }
  }, [status.running, status.mode, fetchGroups]);

  // 分类策略组
  const { mainGroup, strategyGroups } = useMemo(() => {
    if (!groups.length) return { mainGroup: null, strategyGroups: [] };

    let main = groups.find((g) => ['Proxy', '节点选择', 'PROXY'].includes(g.name));
    if (!main) {
      main = groups.find((g) => g.name === 'GLOBAL');
    }
    if (!main) {
      main = groups.find((g) => g.type === 'Selector');
    }

    const strategies = groups.filter((g) => g.name !== main?.name);

    return { mainGroup: main, strategyGroups: strategies };
  }, [groups]);

  const groupCards = useMemo(() => {
    const list: ProxyGroup[] = [];
    if (mainGroup) list.push(mainGroup);
    list.push(...strategyGroups);
    return list;
  }, [mainGroup, strategyGroups]);

  useEffect(() => {
    if (!groupCards.length) return;
    setCardBackgrounds((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of groupCards) {
        const existing = next[group.name];
        if (typeof existing !== 'number' || existing < 0 || existing >= CARD_BACKGROUNDS.length) {
          next[group.name] = Math.floor(Math.random() * CARD_BACKGROUNDS.length);
          changed = true;
        }
      }
      if (changed) {
        try {
          window.localStorage.setItem(CARD_BG_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage failures
        }
      }
      return changed ? next : prev;
    });
  }, [groupCards]);

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
    setTestingPolicies((prev) => new Set(prev).add(name));
    try {
      const delay = await testDelay(name);
      setDelays((prev) => ({ ...prev, [name]: delay }));
    } catch {
      setDelays((prev) => ({ ...prev, [name]: -1 }));
    } finally {
      setTestingPolicies((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });
    }
  };

  const handleTestAllDelays = async (groupPolicies: string[]) => {
    for (const policyName of groupPolicies) {
      if (!['DIRECT', 'REJECT'].includes(policyName)) {
        handleTestDelay(policyName);
      }
    }
  };

  const handlePolicySelect = async (group: ProxyGroup, policyName: string) => {
    if (!isManualSelectableGroup(group)) {
      toast({
        title: '自动策略组',
        description: '该策略组会自动选择节点，无法手动切换。',
      });
      return;
    }
    await handleSelectProxy(group.name, policyName);
    setActiveGroup(null);
  };

  const renderPolicyList = (group: ProxyGroup) => {
    const manualSelectable = isManualSelectableGroup(group);
    return (
      <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {group.all.map((policyName) => {
          const isSelected = group.now === policyName;
          const isTesting = testingPolicies.has(policyName);
          const delay = delays[policyName];

          return (
            <button
              key={policyName}
              onClick={() => handlePolicySelect(group, policyName)}
              aria-disabled={!manualSelectable}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 text-left border-b border-gray-100 dark:border-zinc-800',
                'last:border-b-0',
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50',
                !manualSelectable && 'cursor-not-allowed opacity-70'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-200'
                  )}
                >
                  <TextWithFlag text={policyName} />
                </span>
                {isSelected && <span className="text-[10px] text-blue-500">当前</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {isTesting ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                ) : delay !== undefined ? (
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      delay < 0
                        ? 'text-gray-400'
                        : delay < 200
                          ? 'text-emerald-500'
                          : delay < 500
                            ? 'text-amber-500'
                            : 'text-red-500'
                    )}
                  >
                    {formatDelay(delay)}
                  </span>
                ) : (
                  <span>未测速</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderGroupCard = (group: ProxyGroup) => {
    const currentName = group.now || '未选择';
    const backgroundIndex = cardBackgrounds[group.name];
    const backgroundClass =
      backgroundIndex !== undefined
        ? CARD_BACKGROUNDS[backgroundIndex] || CARD_BACKGROUNDS[0]
        : CARD_BACKGROUNDS[0];
    return (
      <button
        key={group.name}
        onClick={() => setActiveGroup(group)}
        className={cn(
          'rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4 text-left',
          'hover:border-gray-300 dark:hover:border-zinc-700',
          backgroundClass
        )}
      >
        <div className="text-xs text-gray-400">{getGroupTypeLabel(group)}</div>
        <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
          <TextWithFlag text={group.name} />
        </div>
        <div className="mt-6 text-sm text-gray-400">
          <TextWithFlag text={currentName} />
        </div>
      </button>
    );
  };

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
      // 直连模式：显示友好提示
      if (status.mode === 'direct') {
        return (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-[20px] bg-gray-50/50 dark:bg-zinc-900/50">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <p className="font-semibold text-gray-600 dark:text-gray-300">直连模式</p>
            <p className="text-sm mt-1">所有流量直接连接，不经过代理</p>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-[20px] bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
            <Server className="w-8 h-8 opacity-40" />
          </div>
          <p className="font-semibold text-gray-600 dark:text-gray-300">暂无代理</p>
          <p className="text-sm mt-1">当前订阅中没有可用的代理策略</p>
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
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 px-1 uppercase tracking-wider">
            策略组
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {groupCards.map((group) => renderGroupCard(group))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">策略</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            查看并切换代理策略，支持分组选择与延迟测速
          </p>
        </div>

        {/* 模式切换 */}
        {status.running && (
          <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-full border border-gray-200 dark:border-zinc-700 inline-flex">
            <Tabs value={status.mode} onValueChange={handleModeChange} className="w-full md:w-auto">
              <TabsList className="bg-transparent h-8 p-0 gap-1">
                <TabsTrigger
                  value="rule"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full text-xs h-full"
                >
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  规则
                </TabsTrigger>
                <TabsTrigger
                  value="global"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full text-xs h-full"
                >
                  <Globe className="w-3.5 h-3.5 mr-1.5" />
                  全局
                </TabsTrigger>
                <TabsTrigger
                  value="direct"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 rounded-full text-xs h-full"
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

      <Dialog open={!!activeGroup} onOpenChange={(open) => !open && setActiveGroup(null)}>
        <DialogContent className="max-w-3xl">
          {activeGroup && (
            <div className="space-y-4">
              <DialogHeader className="text-left">
                <DialogTitle>
                  <TextWithFlag text={activeGroup.name} />
                </DialogTitle>
                <DialogDescription>
                  {getGroupTypeLabel(activeGroup)}
                  {!isManualSelectableGroup(activeGroup) && ' · 自动选择，无法手动切换'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  当前选择: <TextWithFlag text={activeGroup.now || '未选择'} />
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestAllDelays(activeGroup.all)}
                  disabled={loading}
                  className="rounded-full"
                >
                  <Zap className="w-3.5 h-3.5 mr-1" />
                  测速全部
                </Button>
              </div>
              {renderPolicyList(activeGroup)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
