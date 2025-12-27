import { useState, useEffect, useMemo, useCallback, createElement } from 'react';
import { 
  Shield, 
  Plus, 
  Trash2, 
  Search,
  Filter,
  Save,
  RefreshCw,
  Activity,
  FileCode,
  PenLine,
  X
} from 'lucide-react';
import { getRuleIconComponent } from '@/components/icons/RuleIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { RULE_TYPES, parseRule, buildRule, type RuleType } from '@/types/config';
import type { RuleItem } from '@/types/proxy';

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
      "bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
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
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helper Data & Functions
// -----------------------------------------------------------------------------

const getRuleIcon = getRuleIconComponent;

const getRuleColor = (type: string) => {
  const normalizedType = type.toUpperCase().replace(/-/g, '');
  
  switch (normalizedType) {
    case 'DOMAIN':
    case 'DOMAINSUFFIX':
    case 'DOMAINKEYWORD':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'GEOIP':
    case 'GEOSITE':
      return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'IPCIDR':
    case 'IPCIDR6':
    case 'SRCIPCIDR':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
  }
};

const getPolicyStyle = (policy: string) => {
  switch (policy.toUpperCase()) {
    case 'DIRECT':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20';
    case 'REJECT':
      return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200/50 dark:border-red-500/20';
    case 'PROXY':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20';
    default:
      return 'bg-gray-50 text-gray-700 dark:bg-zinc-800 dark:text-gray-300 border-gray-200/50 dark:border-zinc-700';
  }
};

const DEFAULT_POLICIES = ['DIRECT', 'REJECT', 'PROXY'];

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Rules() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'running' | 'config'>('running');
  
  // Data State
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const [runningRules, setRunningRules] = useState<RuleItem[]>([]);
  const [loadingRunning, setLoadingRunning] = useState(true);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>('DOMAIN');
  const [rulePayload, setRulePayload] = useState('');
  const [rulePolicy, setRulePolicy] = useState('DIRECT');
  
  const [proxyGroups, setProxyGroups] = useState<string[]>([]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipc.getRules();
      setRules(data);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load rules:', error);
      toast({ title: '加载失败', description: '无法加载规则列表', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadRunningRules = useCallback(async () => {
    setLoadingRunning(true);
    try {
      const data = await ipc.getRulesFromApi();
      setRunningRules(data);
    } catch (error) {
      console.error('Failed to load running rules:', error);
      setRunningRules([]);
    } finally {
      setLoadingRunning(false);
    }
  }, []);

  const loadProxyGroups = useCallback(async () => {
    try {
      const groups = await ipc.getProxies();
      setProxyGroups(groups.map(g => g.name));
    } catch {
      console.log('Proxy not running, using default policies');
    }
  }, []);

  useEffect(() => {
    loadRules();
    loadRunningRules();
    loadProxyGroups();
  }, [loadRules, loadRunningRules, loadProxyGroups]);

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const parsed = parseRule(rule);
      if (!parsed) return true;
      if (filterType !== 'all' && parsed.type !== filterType) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          parsed.type.toLowerCase().includes(query) ||
          parsed.payload.toLowerCase().includes(query) ||
          parsed.policy.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [rules, searchQuery, filterType]);

  const filteredRunningRules = useMemo(() => {
    return runningRules.filter((rule) => {
      if (filterType !== 'all' && rule.type !== filterType) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          rule.type.toLowerCase().includes(query) ||
          rule.payload.toLowerCase().includes(query) ||
          rule.proxy.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [runningRules, searchQuery, filterType]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.saveRules(rules);
      setHasChanges(false);
      toast({ title: '保存成功', description: '规则已保存并应用' });
    } catch (error) {
      console.error('Failed to save rules:', error);
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openAddDialog = () => {
    setEditingIndex(null);
    setRuleType('DOMAIN');
    setRulePayload('');
    setRulePolicy('DIRECT');
    setIsDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
    // Note: index here is the index in the FULL rules array
    const rule = rules[index];
    const parsed = parseRule(rule);
    if (parsed) {
      setEditingIndex(index);
      setRuleType(parsed.type);
      setRulePayload(parsed.payload);
      setRulePolicy(parsed.policy);
      setIsDialogOpen(true);
    }
  };

  const handleSaveRule = () => {
    const newRule = buildRule(ruleType, rulePayload, rulePolicy);
    if (editingIndex !== null) {
      const newRules = [...rules];
      newRules[editingIndex] = newRule;
      setRules(newRules);
    } else {
      const matchIndex = rules.findIndex(r => r.startsWith('MATCH,'));
      if (matchIndex !== -1) {
        const newRules = [...rules];
        newRules.splice(matchIndex, 0, newRule);
        setRules(newRules);
      } else {
        setRules([...rules, newRule]);
      }
    }
    setHasChanges(true);
    setIsDialogOpen(false);
  };

  const handleDelete = (fullIndex: number) => {
    const newRules = rules.filter((_, i) => i !== fullIndex);
    setRules(newRules);
    setHasChanges(true);
  };

  const handleRefresh = () => {
    if (activeTab === 'running') {
      loadRunningRules();
    } else {
      loadRules();
    }
  };

  const currentRuleTypeConfig = RULE_TYPES.find(t => t.value === ruleType);

  return (
    <div className="space-y-6 pb-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">规则管理</h1>
          
          <div className="flex items-center gap-3">
             {activeTab === 'config' && (
                <div className="relative">
                  {hasChanges && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                  )}
                  <Button 
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    variant={hasChanges ? "default" : "secondary"}
                    className={cn(
                      "rounded-full gap-2 shadow-sm transition-all h-9 px-4 text-sm",
                      hasChanges ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-white dark:bg-zinc-800 text-gray-600 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50"
                    )}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? '保存中...' : '保存规则'}
                  </Button>
                </div>
              )}

             <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-full border border-gray-200 dark:border-zinc-700 inline-flex h-9">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'running' | 'config')}>
                  <TabsList className="bg-transparent h-full p-0 gap-1">
                    <TabsTrigger value="running" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all">
                      <Activity className="w-3.5 h-3.5" />
                      运行时
                    </TabsTrigger>
                    <TabsTrigger value="config" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all">
                      <FileCode className="w-3.5 h-3.5" />
                      配置
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="搜索规则..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-xl shadow-xs focus:shadow-sm"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-[160px] h-10 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-sm">
                <Filter className="w-4 h-4 text-gray-400" />
                <SelectValue placeholder="全部类型" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {RULE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={activeTab === 'running' ? loadingRunning : loading}
              size="icon"
              className="h-10 w-10 shrink-0 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-xl shadow-xs hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              <RefreshCw className={cn("w-4 h-4", (activeTab === 'running' ? loadingRunning : loading) && "animate-spin")} />
            </Button>
            
            {activeTab === 'config' && (
              <Button onClick={openAddDialog} className="h-10 shrink-0 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-blue-600 dark:text-blue-400 rounded-xl shadow-xs gap-2 border font-medium px-4 text-sm">
                <Plus className="w-4 h-4" />
                添加规则
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Rules Table/List */}
      <BentoCard 
        className="flex-1 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 flex flex-col" 
        title=""
      >
         {/* Table Header */}
         <div className="grid grid-cols-[48px_110px_1fr_100px_50px] gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">
           <div className="text-center">#</div>
           <div>类型</div>
           <div>匹配内容</div>
           <div>策略</div>
           <div className="text-center">操作</div>
         </div>

         {/* Scrollable Content */}
         <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'running' ? (
               loadingRunning ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
                  </div>
                ) : filteredRunningRules.length === 0 ? (
                  <EmptyState searchQuery={searchQuery} />
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                    {filteredRunningRules.map((rule, index) => (
                      <RuleTableRow 
                        key={`${rule.type}-${rule.payload}-${index}`}
                        index={index + 1}
                        type={rule.type}
                        payload={rule.payload}
                        policy={rule.proxy}
                        isConfig={false}
                      />
                    ))}
                  </div>
                )
            ) : (
               loading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
                  </div>
                ) : filteredRules.length === 0 ? (
                  <EmptyState searchQuery={searchQuery} isConfig />
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                    {filteredRules.map((rule, index) => {
                      const parsed = typeof rule === 'string' ? parseRule(rule) : null;
                      if (!parsed) return null;
                      
                      // Find the actual index in the full rules array for editing/deleting
                      const fullIndex = rules.indexOf(rule);
                      
                      return (
                        <RuleTableRow 
                          key={`${rule}-${index}`}
                          index={index + 1}
                          type={parsed.type}
                          payload={parsed.payload}
                          policy={parsed.policy}
                          isConfig={true}
                          onEdit={() => openEditDialog(fullIndex)}
                          onDelete={() => handleDelete(fullIndex)}
                        />
                      );
                    })}
                  </div>
                )
            )}
         </div>
      </BentoCard>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[24px]">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? '编辑规则' : '添加规则'}</DialogTitle>
            <DialogDescription>配置规则类型、匹配内容和目标策略</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>规则类型</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="font-medium">{type.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {currentRuleTypeConfig?.hasPayload && (
              <div className="space-y-2">
                <Label>匹配内容</Label>
                <Input
                  placeholder={getPayloadPlaceholder(ruleType)}
                  value={rulePayload}
                  onChange={(e) => setRulePayload(e.target.value)}
                  className="rounded-xl font-mono h-11"
                />
                <p className="text-xs text-gray-500">{getPayloadHint(ruleType)}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>目标策略</Label>
              <Select value={rulePolicy} onValueChange={setRulePolicy}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">DIRECT (直连)</SelectItem>
                  <SelectItem value="REJECT">REJECT (拒绝)</SelectItem>
                  <SelectItem value="PROXY">PROXY (代理)</SelectItem>
                  {proxyGroups.filter(g => !DEFAULT_POLICIES.includes(g)).map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">取消</Button>
            <Button onClick={handleSaveRule} disabled={currentRuleTypeConfig?.hasPayload && !rulePayload} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {editingIndex !== null ? '保存更改' : '添加规则'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function RuleTableRow({ 
  index, 
  type, 
  payload, 
  policy, 
  isConfig,
  onEdit,
  onDelete
}: {
  index: number;
  type: string;
  payload?: string;
  policy: string;
  isConfig: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const Icon = getRuleIcon(type);

  return (
    <div
      onClick={isConfig ? onEdit : undefined}
      className={cn(
        "group grid grid-cols-[48px_110px_1fr_100px_50px] gap-3 px-4 h-[52px] items-center transition-colors border-l-2 border-transparent text-sm",
        isConfig ? "cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 hover:border-blue-500" : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"
      )}
    >
      {/* Index */}
      <div className="text-center text-xs font-mono text-gray-400 truncate">
        {index}
      </div>

      {/* Type */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
          getRuleColor(type)
        )}>
          {createElement(Icon, { className: "w-3.5 h-3.5" })}
        </div>
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate" title={type}>
          {type}
        </span>
      </div>

      {/* Payload */}
      <div className="min-w-0 pr-2">
        {payload ? (
            <span className="text-sm font-mono text-gray-900 dark:text-gray-200 truncate block" title={payload}>
              {payload}
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">
              (无参数)
            </span>
        )}
      </div>

      {/* Policy */}
      <div className="min-w-0">
        <span className={cn(
          "px-2 py-0.5 rounded text-[10px] font-bold border truncate block w-fit max-w-full",
          getPolicyStyle(policy)
        )}>
          {policy}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-center">
        {isConfig && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
              >
                <PenLine className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ searchQuery, isConfig = false }: { searchQuery: string, isConfig?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <Shield className="w-8 h-8 opacity-40" />
      </div>
      <p className="font-semibold text-gray-900 dark:text-white">
        {searchQuery ? '未找到匹配规则' : '暂无规则'}
      </p>
      <p className="text-sm mt-1 text-center max-w-xs text-gray-500">
        {searchQuery 
          ? '请尝试更换搜索关键词或清除过滤条件' 
          : isConfig 
            ? '点击右上角的"添加规则"按钮开始配置'
            : '当前没有生效的运行时规则'}
      </p>
    </div>
  );
}

function getPayloadPlaceholder(type: RuleType): string {
  switch (type) {
    case 'DOMAIN': return 'example.com';
    case 'DOMAIN-SUFFIX': return 'example.com';
    case 'DOMAIN-KEYWORD': return 'google';
    case 'IP-CIDR': return '192.168.1.0/24';
    case 'PROCESS-NAME': return 'chrome.exe';
    default: return '';
  }
}

function getPayloadHint(type: RuleType): string {
  switch (type) {
    case 'DOMAIN-SUFFIX': return '匹配域名后缀，如 example.com 匹配 *.example.com';
    case 'DOMAIN-KEYWORD': return '匹配域名中包含的关键词';
    case 'IP-CIDR': return 'CIDR 格式的 IP 段';
    default: return '';
  }
}
