import { useState, useEffect, useMemo, useCallback, createElement } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  GripVertical,
} from 'lucide-react';
import { getRuleIconComponent } from '@/components/icons/RuleIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { RULE_TYPES, parseRule, type ProfileConfig } from '@/types/config';

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

const formatErrorMessage = (event: unknown): string => {
  if (typeof event === 'string') return event;
  if (event && typeof event === 'object' && 'message' in event) {
    return String((event as { message: unknown }).message);
  }
  return '未知错误';
};

const buildRuleWindowLabel = (index?: number) => {
  return index !== undefined ? `rule-edit-${index}` : `rule-add-${Date.now()}`;
};

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn('w-4 h-4', iconColor)} />}
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

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Rules() {
  const { toast } = useToast();

  // Profile State
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (profileId) {
        const [, config] = await ipc.getProfile(profileId);
        setProfileConfig(config);
      } else {
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

  // Listen for rules-changed event
  useEffect(() => {
    const unlisten = listen('rules-changed', () => {
      loadProfileData();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadProfileData]);

  // Get rules from profile config
  const rules = useMemo(() => {
    return profileConfig?.rules || [];
  }, [profileConfig]);

  const filteredRules = useMemo(() => {
    const normalizedFilterType = filterType === 'all' ? 'all' : normalizeRuleType(filterType);
    return rules.filter((rule) => {
      const parsed = parseRule(rule);
      if (!parsed) return true;
      if (normalizedFilterType !== 'all' && normalizeRuleType(parsed.type) !== normalizedFilterType)
        return false;
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

  // Open rule window
  const openRuleWindow = async (index?: number) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = buildRuleWindowLabel(index);
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const newWindow = new WebviewWindow(label, {
        url: `/#/rule-edit${index !== undefined ? `?index=${index}` : ''}`,
        title: index !== undefined ? '编辑规则' : '添加规则',
        width: 680,
        height: 720,
        center: true,
        resizable: false,
        decorations: false,
        transparent: true,
        shadow: false,
      });

      await new Promise<void>((resolve, reject) => {
        newWindow.once('tauri://created', () => {
          resolve();
        });
        newWindow.once('tauri://error', (event) => {
          console.error('Failed to create window', event);
          reject(new Error(formatErrorMessage(event) || '窗口创建失败'));
        });
      });
    } catch (e) {
      console.error('Failed to open window', e);
      toast({ title: '打开窗口失败', description: String(e), variant: 'destructive' });
    }
  };

  const handleDeleteClick = (index: number) => {
    setDeletingIndex(index);
    setDeleteDialogOpen(true);
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !activeProfileId || !profileConfig) {
      return;
    }

    const oldIndex = rules.findIndex((rule) => rule === active.id);
    const newIndex = rules.findIndex((rule) => rule === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    setSaving(true);
    try {
      const newRules = arrayMove(rules, oldIndex, newIndex);

      const newConfig: ProfileConfig = {
        ...profileConfig,
        rules: newRules,
      };

      await ipc.updateProfileConfig(activeProfileId, newConfig);
      setProfileConfig(newConfig);
    } catch (error) {
      console.error('Failed to reorder rules:', error);
      toast({ title: '排序失败', description: String(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

  // No active profile
  if (!loading && !activeProfileId) {
    return (
      <div className="space-y-6 pb-6 h-full flex flex-col">
        <div className="flex flex-col gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              规则管理
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理流量路由规则,控制不同流量的转发策略
            </p>
          </div>
        </div>

        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px] bg-gray-50/50 dark:bg-zinc-900/50">
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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              规则管理
            </h1>
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
              variant="ghost"
              onClick={loadProfileData}
              disabled={loading}
              size="icon"
              className="rounded-full h-9 w-9"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => openRuleWindow()}
              disabled={!activeProfileId}
              className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            >
              <Plus className="w-4 h-4" />
              添加规则
            </Button>
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <BentoCard
        className="flex-1 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 flex flex-col rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none"
        title=""
      >
        {/* Table Header */}
        <div className="grid grid-cols-[32px_48px_110px_1fr_100px_70px] gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">
          <div className="text-center"></div>
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
            <EmptyState searchQuery={searchQuery} />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={filteredRules} strategy={verticalListSortingStrategy}>
                <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                  {filteredRules.map((rule, index) => {
                    const parsed = typeof rule === 'string' ? parseRule(rule) : null;
                    if (!parsed) return null;

                    // Find the actual index in the full rules array
                    const fullIndex = rules.indexOf(rule);

                    return (
                      <SortableRuleRow
                        key={rule}
                        id={rule}
                        index={index + 1}
                        type={parsed.type}
                        payload={parsed.payload}
                        policy={parsed.policy}
                        onEdit={() => openRuleWindow(fullIndex)}
                        onDelete={() => handleDeleteClick(fullIndex)}
                        disabled={saving}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </BentoCard>

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
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl"
            >
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

function SortableRuleRow({
  id,
  index,
  type,
  payload,
  policy,
  onEdit,
  onDelete,
  disabled,
}: {
  id: string;
  index: number;
  type: string;
  payload?: string;
  policy: string;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = getRuleIcon(type);
  const payloadBadge = getPayloadBadge(type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onEdit}
      className={cn(
        'group grid grid-cols-[32px_48px_110px_1fr_100px_70px] gap-3 px-4 h-[52px] items-center transition-colors border-l-2 border-transparent text-sm cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 hover:border-blue-500 bg-white dark:bg-zinc-900',
        isDragging && 'opacity-50 shadow-lg z-50 bg-blue-50 dark:bg-blue-900/20'
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400" />
      </div>

      {/* Index */}
      <div className="text-center text-xs font-mono text-gray-400 truncate">{index}</div>

      {/* Type */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
            getRuleColor(type)
          )}
        >
          {createElement(Icon, { className: 'w-3.5 h-3.5' })}
        </div>
        <span
          className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate"
          title={type}
        >
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
            <span
              className="text-sm font-mono text-gray-900 dark:text-gray-200 truncate block"
              title={payload}
            >
              {payload}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">(无参数)</span>
        )}
      </div>

      {/* Policy */}
      <div className="min-w-0">
        <span
          className={cn(
            'px-2 py-0.5 rounded text-[10px] font-bold border truncate block w-fit max-w-full',
            getPolicyStyle(policy)
          )}
        >
          {policy}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-center">
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
      </div>
    </div>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <Shield className="w-8 h-8 opacity-40" />
      </div>
      <p className="font-semibold text-gray-900 dark:text-white">
        {searchQuery ? '未找到匹配规则' : '暂无规则'}
      </p>
      <p className="text-sm mt-1 text-center max-w-xs text-gray-500">
        {searchQuery ? '请尝试更换搜索关键词或清除过滤条件' : '点击右上角的"添加规则"按钮开始配置'}
      </p>
    </div>
  );
}
