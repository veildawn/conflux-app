import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Clock,
  Server,
  Loader2,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import type { ProfileConfig, ProxyProvider, RuleProvider } from '@/types/config';

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
        'bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center mb-4 z-10">
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
      <div className="flex-1 z-10">{children}</div>
    </div>
  );
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
// Add/Edit Dialog Components
// -----------------------------------------------------------------------------

interface ProxyProviderFormData {
  name: string;
  type: string;
  url: string;
  path: string;
  interval: number;
  healthCheckEnabled: boolean;
  healthCheckUrl: string;
  healthCheckInterval: number;
}

interface RuleProviderFormData {
  name: string;
  type: string;
  behavior: string;
  format: string;
  url: string;
  path: string;
  interval: number;
}

function ProxyProviderDialog({
  open,
  onClose,
  onSubmit,
  editData,
  editName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, provider: ProxyProvider) => Promise<void>;
  editData?: ProxyProvider;
  editName?: string;
}) {
  const [formData, setFormData] = useState<ProxyProviderFormData>({
    name: '',
    type: 'http',
    url: '',
    path: '',
    interval: 3600,
    healthCheckEnabled: true,
    healthCheckUrl: 'http://www.gstatic.com/generate_204',
    healthCheckInterval: 300,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData && editName) {
      setFormData({
        name: editName,
        type: editData.type || 'http',
        url: editData.url || '',
        path: editData.path || '',
        interval: editData.interval || 3600,
        healthCheckEnabled: editData['health-check']?.enable ?? true,
        healthCheckUrl: editData['health-check']?.url || 'http://www.gstatic.com/generate_204',
        healthCheckInterval: editData['health-check']?.interval || 300,
      });
    } else {
      setFormData({
        name: '',
        type: 'http',
        url: '',
        path: '',
        interval: 3600,
        healthCheckEnabled: true,
        healthCheckUrl: 'http://www.gstatic.com/generate_204',
        healthCheckInterval: 300,
      });
    }
  }, [editData, editName, open]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      const provider: ProxyProvider = {
        type: formData.type,
        url: formData.url || undefined,
        path: formData.path || undefined,
        interval: formData.interval,
        'health-check': {
          enable: formData.healthCheckEnabled,
          url: formData.healthCheckUrl || undefined,
          interval: formData.healthCheckInterval,
        },
      };
      await onSubmit(formData.name.trim(), provider);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editName ? '编辑代理源' : '添加代理源'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="my-proxy-provider"
              disabled={!!editName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">类型</label>
            <Select
              value={formData.type}
              onValueChange={(v) => setFormData({ ...formData, type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="file">File</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">URL</label>
            <Input
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/proxies.yaml"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">更新间隔 (秒)</label>
            <Input
              type="number"
              value={formData.interval}
              onChange={(e) =>
                setFormData({ ...formData, interval: parseInt(e.target.value) || 3600 })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="healthCheck"
              checked={formData.healthCheckEnabled}
              onChange={(e) => setFormData({ ...formData, healthCheckEnabled: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="healthCheck" className="text-sm font-medium">
              启用健康检查
            </label>
          </div>
          {formData.healthCheckEnabled && (
            <div className="space-y-2 pl-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">检查 URL</label>
                <Input
                  value={formData.healthCheckUrl}
                  onChange={(e) => setFormData({ ...formData, healthCheckUrl: e.target.value })}
                  placeholder="http://www.gstatic.com/generate_204"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">检查间隔 (秒)</label>
                <Input
                  type="number"
                  value={formData.healthCheckInterval}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      healthCheckInterval: parseInt(e.target.value) || 300,
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.name.trim() || submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editName ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleProviderDialog({
  open,
  onClose,
  onSubmit,
  editData,
  editName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, provider: RuleProvider) => Promise<void>;
  editData?: RuleProvider;
  editName?: string;
}) {
  const [formData, setFormData] = useState<RuleProviderFormData>({
    name: '',
    type: 'http',
    behavior: 'classical',
    format: 'yaml',
    url: '',
    path: '',
    interval: 86400,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        title: '选择规则文件',
        multiple: false,
        filters: [
          {
            name: '规则文件',
            extensions: ['yaml', 'yml', 'txt', 'list'],
          },
        ],
      });

      if (selected) {
        setFormData((prev) => ({ ...prev, path: selected as string }));
      }
    } catch (error) {
      console.error('Failed to open rule file dialog:', error);
    }
  };

  useEffect(() => {
    if (editData && editName) {
      setFormData({
        name: editName,
        type: editData.type || 'http',
        behavior: editData.behavior || 'classical',
        format: editData.format || 'yaml',
        url: editData.url || '',
        path: editData.path || '',
        interval: editData.interval || 86400,
      });
    } else {
      setFormData({
        name: '',
        type: 'http',
        behavior: 'classical',
        format: 'yaml',
        url: '',
        path: '',
        interval: 86400,
      });
    }
  }, [editData, editName, open]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    if (formData.type === 'http' && !formData.url.trim()) return;
    if (formData.type === 'file' && !formData.path.trim()) return;

    setSubmitting(true);
    try {
      const provider: RuleProvider = {
        type: formData.type,
        behavior: formData.behavior,
        format: formData.format || undefined,
        url: formData.type === 'http' ? formData.url || undefined : undefined,
        path: formData.type === 'file' ? formData.path || undefined : undefined,
        interval: formData.interval,
      };
      await onSubmit(formData.name.trim(), provider);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editName ? '编辑规则源' : '添加规则源'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="my-rule-provider"
              disabled={!!editName}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">类型</label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">行为</label>
              <Select
                value={formData.behavior}
                onValueChange={(v) => setFormData({ ...formData, behavior: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classical">Classical</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="ipcidr">IP-CIDR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">格式</label>
            <Select
              value={formData.format}
              onValueChange={(v) => setFormData({ ...formData, format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yaml">YAML</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formData.type === 'http' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/rules.yaml"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">文件路径</label>
              <div className="flex gap-2">
                <Input
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  placeholder="/path/to/rules.yaml"
                  className="font-mono text-sm"
                />
                <Button variant="outline" className="shrink-0" onClick={handleBrowse}>
                  浏览...
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">更新间隔 (秒)</label>
            <Input
              type="number"
              value={formData.interval}
              onChange={(e) =>
                setFormData({ ...formData, interval: parseInt(e.target.value) || 86400 })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !formData.name.trim() ||
              (formData.type === 'http' && !formData.url.trim()) ||
              (formData.type === 'file' && !formData.path.trim()) ||
              submitting
            }
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editName ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Providers() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'proxy' | 'rule'>('proxy');
  const [loading, setLoading] = useState(true);

  // 活跃 Profile 数据
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);

  // Dialog states
  const [proxyDialogOpen, setProxyDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editProxyProvider, setEditProxyProvider] = useState<{
    name: string;
    provider: ProxyProvider;
  } | null>(null);
  const [editRuleProvider, setEditRuleProvider] = useState<{
    name: string;
    provider: RuleProvider;
  } | null>(null);

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'proxy' | 'rule';
    name: string;
  } | null>(null);

  // 加载活跃 Profile 配置
  const loadActiveProfile = useCallback(async () => {
    setLoading(true);
    try {
      const activeId = await ipc.getActiveProfileId();
      setActiveProfileId(activeId);

      if (activeId) {
        const [, config] = await ipc.getProfile(activeId);
        setProfileConfig(config);
      } else {
        setProfileConfig(null);
      }
    } catch (error) {
      console.error('Failed to load active profile:', error);
      setProfileConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveProfile();
  }, [loadActiveProfile]);

  // Proxy Provider 数据
  const proxyProviders = profileConfig?.['proxy-providers'] || {};
  const proxyProviderList = Object.entries(proxyProviders);

  // Rule Provider 数据
  const ruleProviders = profileConfig?.['rule-providers'] || {};
  const ruleProviderList = Object.entries(ruleProviders);

  // CRUD 操作
  const handleAddProxyProvider = async (name: string, provider: ProxyProvider) => {
    if (!activeProfileId) return;
    try {
      await ipc.addProxyProviderToProfile(activeProfileId, name, provider);
      await loadActiveProfile();
      toast({ title: '添加成功', description: `代理源 "${name}" 已添加` });
    } catch (error) {
      toast({ title: '添加失败', description: String(error), variant: 'destructive' });
      throw error;
    }
  };

  const handleUpdateProxyProvider = async (name: string, provider: ProxyProvider) => {
    if (!activeProfileId) return;
    try {
      await ipc.updateProxyProviderInProfile(activeProfileId, name, provider);
      await loadActiveProfile();
      toast({ title: '更新成功', description: `代理源 "${name}" 已更新` });
    } catch (error) {
      toast({ title: '更新失败', description: String(error), variant: 'destructive' });
      throw error;
    }
  };

  const handleDeleteProxyProvider = async (name: string) => {
    if (!activeProfileId) return;
    try {
      await ipc.deleteProxyProviderFromProfile(activeProfileId, name);
      await loadActiveProfile();
      toast({ title: '删除成功', description: `代理源 "${name}" 已删除` });
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
    setDeleteConfirm(null);
  };

  const handleAddRuleProvider = async (name: string, provider: RuleProvider) => {
    if (!activeProfileId) return;
    try {
      await ipc.addRuleProviderToProfile(activeProfileId, name, provider);
      await loadActiveProfile();
      toast({ title: '添加成功', description: `规则源 "${name}" 已添加` });
    } catch (error) {
      toast({ title: '添加失败', description: String(error), variant: 'destructive' });
      throw error;
    }
  };

  const handleUpdateRuleProvider = async (name: string, provider: RuleProvider) => {
    if (!activeProfileId) return;
    try {
      await ipc.updateRuleProviderInProfile(activeProfileId, name, provider);
      await loadActiveProfile();
      toast({ title: '更新成功', description: `规则源 "${name}" 已更新` });
    } catch (error) {
      toast({ title: '更新失败', description: String(error), variant: 'destructive' });
      throw error;
    }
  };

  const handleDeleteRuleProvider = async (name: string) => {
    if (!activeProfileId) return;
    try {
      await ipc.deleteRuleProviderFromProfile(activeProfileId, name);
      await loadActiveProfile();
      toast({ title: '删除成功', description: `规则源 "${name}" 已删除` });
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
    setDeleteConfirm(null);
  };

  const currentList = activeTab === 'proxy' ? proxyProviderList : ruleProviderList;

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              资源
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理配置中的代理源和规则源
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={loadActiveProfile}
              className="rounded-full h-9 w-9"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                activeTab === 'proxy' ? setProxyDialogOpen(true) : setRuleDialogOpen(true)
              }
              disabled={!activeProfileId}
              className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            >
              <Plus className="w-4 h-4" />
              添加{activeTab === 'proxy' ? '代理源' : '规则源'}
            </Button>

            <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-full border border-gray-200 dark:border-zinc-700 inline-flex h-9">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'proxy' | 'rule')}>
                <TabsList className="bg-transparent h-full p-0 gap-1">
                  <TabsTrigger
                    value="proxy"
                    className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all"
                  >
                    <Server className="w-3.5 h-3.5" />
                    代理源
                  </TabsTrigger>
                  <TabsTrigger
                    value="rule"
                    className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm px-4 text-xs h-full font-medium transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    规则源
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : !activeProfileId ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px] bg-gray-50/50 dark:bg-zinc-900/50">
          <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      ) : currentList.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px] bg-gray-50/50 dark:bg-zinc-900/50">
          <Server className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">
            暂无{activeTab === 'proxy' ? '代理' : '规则'}源
          </p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">点击上方按钮添加新的资源</p>
        </div>
      ) : activeTab === 'proxy' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proxyProviderList.map(([name, provider]) => (
            <BentoCard
              key={name}
              title={provider.type}
              icon={Server}
              iconColor="text-blue-500"
              action={
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    title="编辑"
                    onClick={() => {
                      setEditProxyProvider({ name, provider });
                      setProxyDialogOpen(true);
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="删除"
                    onClick={() => setDeleteConfirm({ type: 'proxy', name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              }
            >
              <div className="space-y-3">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase',
                        getVehicleTypeStyle(provider.type)
                      )}
                    >
                      {provider.type}
                    </span>
                    {provider['health-check']?.enable && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                        健康检查
                      </span>
                    )}
                  </div>
                </div>

                {provider.url && (
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="break-all line-clamp-2">{provider.url}</span>
                  </div>
                )}
                {provider.type === 'file' && provider.path && (
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="break-all line-clamp-2">{provider.path}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-zinc-800/50">
                  <Clock className="w-3.5 h-3.5" />
                  <span>更新间隔: {provider.interval || 3600} 秒</span>
                </div>
              </div>
            </BentoCard>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {ruleProviderList.map(([name, provider]) => (
            <BentoCard
              key={name}
              title={provider.behavior}
              icon={FileText}
              iconColor="text-purple-500"
              action={
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    title="编辑"
                    onClick={() => {
                      setEditRuleProvider({ name, provider });
                      setRuleDialogOpen(true);
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="删除"
                    onClick={() => setDeleteConfirm({ type: 'rule', name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              }
            >
              <div className="space-y-3">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                        getBehaviorStyle(provider.behavior)
                      )}
                    >
                      {provider.behavior}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase',
                        getVehicleTypeStyle(provider.type)
                      )}
                    >
                      {provider.type}
                    </span>
                    {provider.format && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500">
                        {provider.format}
                      </span>
                    )}
                  </div>
                </div>

                {provider.url && (
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="break-all line-clamp-2">{provider.url}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-zinc-800/50">
                  <Clock className="w-3.5 h-3.5" />
                  <span>更新间隔: {provider.interval || 86400} 秒</span>
                </div>
              </div>
            </BentoCard>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ProxyProviderDialog
        open={proxyDialogOpen}
        onClose={() => {
          setProxyDialogOpen(false);
          setEditProxyProvider(null);
        }}
        onSubmit={editProxyProvider ? handleUpdateProxyProvider : handleAddProxyProvider}
        editData={editProxyProvider?.provider}
        editName={editProxyProvider?.name}
      />

      <RuleProviderDialog
        open={ruleDialogOpen}
        onClose={() => {
          setRuleDialogOpen(false);
          setEditRuleProvider(null);
        }}
        onSubmit={editRuleProvider ? handleUpdateRuleProvider : handleAddRuleProvider}
        editData={editRuleProvider?.provider}
        editName={editRuleProvider?.name}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            确定要删除{deleteConfirm?.type === 'proxy' ? '代理源' : '规则源'} "{deleteConfirm?.name}
            " 吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.type === 'proxy') {
                  handleDeleteProxyProvider(deleteConfirm.name);
                } else if (deleteConfirm?.type === 'rule') {
                  handleDeleteRuleProvider(deleteConfirm.name);
                }
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
