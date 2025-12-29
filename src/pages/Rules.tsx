import { useState, useEffect, useMemo, useCallback, createElement } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  PenLine,
  X,
  Loader2,
  AlertCircle,
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
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { RULE_TYPES, parseRule, buildRule, type RuleType, type ProfileConfig, type RuleProvider, type ProfileMetadata } from '@/types/config';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RuleSetOption {
  name: string;
  ruleCount?: number;
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

const normalizeRuleType = (type: string) => type.toUpperCase().replace(/[-_]/g, '');

const getRuleColor = (type: string) => {
  const normalizedType = normalizeRuleType(type);

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

const getPayloadBadge = (type: string): string | undefined => {
  const normalizedType = normalizeRuleType(type);
  if (normalizedType === 'RULESET') return '规则集';
  if (normalizedType === 'GEOIP' || normalizedType === 'GEOSITE') return '分类';
  return undefined;
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

  // Profile State
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileMetadata, setProfileMetadata] = useState<ProfileMetadata | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 判断是否为远程订阅
  const isRemoteProfile = useMemo(() => {
    return profileMetadata?.profileType === 'remote';
  }, [profileMetadata]);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>('DOMAIN');
  const [rulePayload, setRulePayload] = useState('');
  const [rulePolicy, setRulePolicy] = useState('DIRECT');

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (profileId) {
        const [metadata, config] = await ipc.getProfile(profileId);
        setProfileMetadata(metadata);
        setProfileConfig(config);
      } else {
        setProfileMetadata(null);
        setProfileConfig(null);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      toast({ title: '加载失败', description: '无法加载配置', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Get rules from profile config
  const rules = useMemo(() => {
    return profileConfig?.rules || [];
  }, [profileConfig]);

  // Get rule-providers from profile config
  const ruleProviders = useMemo(() => {
    return profileConfig?.['rule-providers'] || {};
  }, [profileConfig]);

  // Get proxy groups for policy selection
  const proxyGroups = useMemo(() => {
    return profileConfig?.['proxy-groups']?.map(g => g.name) || [];
  }, [profileConfig]);

  const filteredRules = useMemo(() => {
    const normalizedFilterType = filterType === 'all' ? 'all' : normalizeRuleType(filterType);
    return rules.filter((rule) => {
      const parsed = parseRule(rule);
      if (!parsed) return true;
      if (normalizedFilterType !== 'all' && normalizeRuleType(parsed.type) !== normalizedFilterType) return false;
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

  const ruleProviderMap = useMemo(() => {
    return new Map(
      Object.entries(ruleProviders).map(([name, provider]) => [
        name,
        { name, ...provider }
      ])
    );
  }, [ruleProviders]);

  const ruleSetOptions = useMemo<RuleSetOption[]>(() => {
    const options = new Map<string, RuleSetOption>();

    // Add from rule-providers
    Object.keys(ruleProviders).forEach(name => {
      options.set(name, { name });
    });

    // Add from existing rules
    rules.forEach(rule => {
      const parsed = parseRule(rule);
      if (parsed?.type === 'RULE-SET' && parsed.payload) {
        if (!options.has(parsed.payload)) {
          options.set(parsed.payload, { name: parsed.payload });
        }
      }
    });

    // Add current input if editing
    if (ruleType === 'RULE-SET' && rulePayload && !options.has(rulePayload)) {
      options.set(rulePayload, { name: rulePayload });
    }

    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [ruleProviders, rules, rulePayload, ruleType]);

  const openAddDialog = () => {
    setEditingIndex(null);
    setRuleType('DOMAIN');
    setRulePayload('');
    setRulePolicy('DIRECT');
    setIsDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
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

  const handleSaveRule = async () => {
    if (!activeProfileId || !profileConfig) {
      toast({ title: '错误', description: '没有活跃的配置文件', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const newRule = buildRule(ruleType, rulePayload, rulePolicy);
      let newRules: string[];

      if (editingIndex !== null) {
        // Edit existing rule
        newRules = [...rules];
        newRules[editingIndex] = newRule;
      } else {
        // Add new rule before MATCH
        const matchIndex = rules.findIndex(r => r.startsWith('MATCH,'));
        if (matchIndex !== -1) {
          newRules = [...rules];
          newRules.splice(matchIndex, 0, newRule);
        } else {
          newRules = [...rules, newRule];
        }
      }

      // Update profile config
      const newConfig: ProfileConfig = {
        ...profileConfig,
        rules: newRules,
      };

      await ipc.updateProfileConfig(activeProfileId, newConfig);
      setProfileConfig(newConfig);
      setIsDialogOpen(false);
      toast({ title: '保存成功', description: editingIndex !== null ? '规则已更新' : '规则已添加' });
    } catch (error) {
      console.error('Failed to save rule:', error);
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (index: number) => {
    setDeletingIndex(index);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!activeProfileId || !profileConfig || deletingIndex === null) return;

    setSaving(true);
    try {
      const newRules = rules.filter((_, i) => i !== deletingIndex);
      const newConfig: ProfileConfig = {
        ...profileConfig,
        rules: newRules,
      };

      await ipc.updateProfileConfig(activeProfileId, newConfig);
      setProfileConfig(newConfig);
      setDeleteDialogOpen(false);
      setDeletingIndex(null);
      toast({ title: '删除成功', description: '规则已删除' });
    } catch (error) {
      console.error('Failed to delete rule:', error);
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const currentRuleTypeConfig = RULE_TYPES.find(t => t.value === ruleType);

  // No active profile
  if (!loading && !activeProfileId) {
    return (
      <div className="space-y-6 pb-6 h-full flex flex-col">
        <div className="flex flex-col gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">规则管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理流量路由规则,控制不同流量的转发策略
            </p>
          </div>
        </div>

        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">规则管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理流量路由规则,控制不同流量的转发策略
            </p>
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
              onClick={loadProfileData}
              disabled={loading}
              size="icon"
              className="h-10 w-10 shrink-0 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-xl shadow-xs hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>

            {!isRemoteProfile && (
              <Button
                onClick={openAddDialog}
                disabled={!activeProfileId}
                className="h-10 shrink-0 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-blue-600 dark:text-blue-400 rounded-xl shadow-xs gap-2 border font-medium px-4 text-sm"
              >
                <Plus className="w-4 h-4" />
                添加规则
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <BentoCard
        className="flex-1 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 flex flex-col"
        title=""
      >
        {/* Table Header */}
        <div className="grid grid-cols-[48px_110px_1fr_100px_50px] gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">
          <div className="text-center">#</div>
          <div>类型</div>
          <div>匹配内容/规则集</div>
          <div>策略</div>
          <div className="text-center">操作</div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
            </div>
          ) : filteredRules.length === 0 ? (
            <EmptyState searchQuery={searchQuery} isRemoteProfile={isRemoteProfile} />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              {filteredRules.map((rule, index) => {
                const parsed = typeof rule === 'string' ? parseRule(rule) : null;
                if (!parsed) return null;

                // Find the actual index in the full rules array
                const fullIndex = rules.indexOf(rule);

                return (
                  <RuleTableRow
                    key={`${rule}-${index}`}
                    index={index + 1}
                    type={parsed.type}
                    payload={parsed.payload}
                    policy={parsed.policy}
                    onEdit={() => openEditDialog(fullIndex)}
                    onDelete={() => handleDeleteClick(fullIndex)}
                    ruleProviderMap={ruleProviderMap}
                    isRemoteProfile={isRemoteProfile}
                  />
                );
              })}
            </div>
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
                <Label>{ruleType === 'RULE-SET' ? '规则集' : '匹配内容'}</Label>
                {ruleType === 'RULE-SET' ? (
                  ruleSetOptions.length > 0 ? (
                    <Select value={rulePayload} onValueChange={setRulePayload}>
                      <SelectTrigger className="rounded-xl h-11">
                        <SelectValue placeholder="选择规则集" />
                      </SelectTrigger>
                      <SelectContent>
                        {ruleSetOptions.map((option) => (
                          <SelectItem key={option.name} value={option.name}>
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="font-medium">{option.name}</span>
                              {option.ruleCount !== undefined && (
                                <span className="text-xs text-gray-500">{option.ruleCount} 条</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={getPayloadPlaceholder(ruleType)}
                      value={rulePayload}
                      onChange={(e) => setRulePayload(e.target.value)}
                      className="rounded-xl font-mono h-11"
                    />
                  )
                ) : (
                  <Input
                    placeholder={getPayloadPlaceholder(ruleType)}
                    value={rulePayload}
                    onChange={(e) => setRulePayload(e.target.value)}
                    className="rounded-xl font-mono h-11"
                  />
                )}
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
            <Button
              onClick={handleSaveRule}
              disabled={(currentRuleTypeConfig?.hasPayload && !rulePayload) || saving}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingIndex !== null ? '保存更改' : '添加规则'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-[24px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              {deletingIndex !== null && rules[deletingIndex] ? (
                <>确定要删除规则 "{rules[deletingIndex]}" 吗？此操作无法撤销。</>
              ) : (
                '确定要删除此规则吗？此操作无法撤销。'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl">
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={saving}
              className="rounded-xl"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
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
  onEdit,
  onDelete,
  ruleProviderMap,
  isRemoteProfile,
}: {
  index: number;
  type: string;
  payload?: string;
  policy: string;
  onEdit?: () => void;
  onDelete?: () => void;
  ruleProviderMap?: Map<string, RuleProvider & { name: string }>;
  isRemoteProfile?: boolean;
}) {
  const Icon = getRuleIcon(type);
  const isRuleSet = normalizeRuleType(type) === 'RULESET';
  const payloadBadge = getPayloadBadge(type);

  return (
    <div
      onClick={isRemoteProfile ? undefined : onEdit}
      className={cn(
        "group grid grid-cols-[48px_110px_1fr_100px_50px] gap-3 px-4 h-[52px] items-center transition-colors border-l-2 border-transparent text-sm",
        !isRemoteProfile && "cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 hover:border-blue-500"
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
            <div className="flex items-center gap-2 min-w-0">
              {payloadBadge && (
                <span className="text-[10px] font-semibold rounded bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400 px-1.5 py-0.5 shrink-0">
                  {payloadBadge}
                </span>
              )}
              <span className="text-sm font-mono text-gray-900 dark:text-gray-200 truncate block" title={payload}>
                {payload}
              </span>
            </div>
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
        {!isRemoteProfile && (
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

function EmptyState({ searchQuery, isRemoteProfile }: { searchQuery: string; isRemoteProfile?: boolean }) {
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
          : isRemoteProfile
          ? '远程订阅的配置为只读，无法添加规则'
          : '点击右上角的"添加规则"按钮开始配置'}
      </p>
    </div>
  );
}

function getPayloadPlaceholder(type: RuleType): string {
  switch (type) {
    case 'DOMAIN': return 'example.com';
    case 'DOMAIN-SUFFIX': return 'example.com';
    case 'DOMAIN-KEYWORD': return 'google';
    case 'GEOIP': return 'CN';
    case 'GEOSITE': return 'cn';
    case 'IP-CIDR': return '192.168.1.0/24';
    case 'RULE-SET': return 'rule-provider 名称';
    case 'PROCESS-NAME': return 'chrome.exe';
    default: return '';
  }
}

function getPayloadHint(type: RuleType): string {
  switch (type) {
    case 'DOMAIN-SUFFIX': return '匹配域名后缀，如 example.com 匹配 *.example.com';
    case 'DOMAIN-KEYWORD': return '匹配域名中包含的关键词';
    case 'GEOIP': return '国家/地区代码，如 CN';
    case 'GEOSITE': return '分类名称，如 cn 或 geolocation-!cn';
    case 'IP-CIDR': return 'CIDR 格式的 IP 段';
    case 'RULE-SET': return '填写 rule-providers 中的名称，引用规则集内容';
    default: return '';
  }
}
