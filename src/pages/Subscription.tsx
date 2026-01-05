import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Globe,
  FileText,
  RefreshCw,
  Trash2,
  Download,
  Clock,
  Loader2,
  Pencil,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProfileMetadata, ProfileType } from '@/types/config';
import { cn } from '@/utils/cn';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useProxyStore } from '@/stores/proxyStore';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

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
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden transition-all',
        onClick &&
          'cursor-pointer hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800',
        className
      )}
      onClick={onClick}
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

// 获取 Profile 类型的显示文本和图标
function getProfileTypeInfo(type: ProfileType) {
  switch (type) {
    case 'remote':
      return { label: '远程订阅', icon: Globe, color: 'text-blue-500' };
    case 'local':
      return { label: '本地配置', icon: FileText, color: 'text-orange-500' };
    case 'blank':
      return { label: '空白配置', icon: File, color: 'text-green-500' };
  }
}

// 格式化日期
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function SubscriptionPage() {
  const { toast } = useToast();
  const { fetchGroups, status } = useProxyStore();

  // Profile 列表
  const [profiles, setProfiles] = useState<ProfileMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  // 对话框状态
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileType>('remote');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<ProfileMetadata | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [saving, setSaving] = useState(false);

  // Sub-Store 相关状态
  const [urlSource, setUrlSource] = useState<'manual' | 'substore'>('manual');
  const [substoreSubs, setSubstoreSubs] = useState<
    { name: string; displayName?: string; icon?: string; url?: string }[]
  >([]);
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [substoreStatus, setSubstoreStatus] = useState<{
    running: boolean;
    api_url: string;
  } | null>(null);

  // 加载 Profile 列表
  const loadProfiles = useCallback(async () => {
    try {
      const list = await ipc.listProfiles();
      setProfiles(list);
    } catch (error) {
      console.error('Failed to load profiles:', error);
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const normalizeExportPath = (path: string) => {
    if (/\.[^/\\]+$/.test(path)) {
      return path;
    }
    return `${path}.yaml`;
  };

  const buildExportFileName = (profile: ProfileMetadata) => {
    const baseName = profile.name.trim() || 'profile';
    const safeName = baseName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'profile';
    return `${safeName}.yaml`;
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        title: '选择配置文件',
        multiple: false,
        filters: [
          {
            name: '配置文件',
            extensions: ['yaml', 'yml', 'json', 'conf'],
          },
        ],
      });

      if (selected) {
        setFilePath(selected as string);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleExport = async (profile: ProfileMetadata) => {
    try {
      const selected = await save({
        title: '导出配置',
        defaultPath: buildExportFileName(profile),
        filters: [
          {
            name: 'YAML',
            extensions: ['yaml', 'yml'],
          },
        ],
      });

      if (!selected) return;
      const targetPath = normalizeExportPath(selected);
      await ipc.exportProfileConfig(profile.id, targetPath);
      const fileName = targetPath.split(/[\\/]/).pop() || targetPath;

      toast({
        title: '导出成功',
        description: `已保存为 ${fileName}`,
      });
    } catch (error) {
      console.error('Failed to export profile:', error);
      toast({
        title: '导出失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      if (editingProfile) {
        // 编辑模式：只支持重命名
        const newName = name || editingProfile.name;
        await ipc.renameProfile(editingProfile.id, newName);

        toast({
          title: '配置已更新',
          description: `配置 "${newName}" 已保存`,
        });
      } else {
        // 新增模式
        let profile: ProfileMetadata;
        const profileName =
          name ||
          (activeTab === 'remote'
            ? '新远程订阅'
            : activeTab === 'local'
              ? '新本地配置'
              : '新空白配置');

        if (activeTab === 'remote') {
          profile = await ipc.createRemoteProfile(profileName, url);
        } else if (activeTab === 'local') {
          profile = await ipc.createLocalProfile(profileName, filePath);
        } else {
          profile = await ipc.createBlankProfile(profileName);
        }

        const defaultRulesHint = profile.defaultRulesApplied
          ? '。检测到配置没有任何规则，已自动创建默认规则'
          : '';
        toast({
          title: '配置已创建',
          description: `配置 "${profile.name}" 已添加，包含 ${profile.proxyCount} 个节点${defaultRulesHint}`,
        });
      }

      await loadProfiles();
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    if (profile.active) return;

    setApplyingId(id);

    try {
      await ipc.activateProfile(id);
      await loadProfiles();

      if (status.running) {
        await fetchGroups();
      }

      toast({
        title: '配置已激活',
        description: `已加载 ${profile.proxyCount} 个节点`,
      });
    } catch (error) {
      console.error('Failed to activate profile:', error);
      toast({
        title: '激活失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  // 加载 Sub-Store 状态和订阅列表
  const loadSubStoreSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const status = await ipc.getSubStoreStatus();
      setSubstoreStatus(status);

      if (!status.running) {
        toast({
          title: 'Sub-Store 未运行',
          description: '请先访问 Sub-Store 页面启动服务',
          variant: 'destructive',
        });
        return;
      }

      const subs = await ipc.getSubStoreSubs();
      setSubstoreSubs(subs);
    } catch (error) {
      console.error('Failed to load Sub-Store subs:', error);
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingSubs(false);
    }
  }, [toast]);

  // 当选择 Sub-Store 模式时自动加载订阅列表
  useEffect(() => {
    if (urlSource === 'substore' && activeTab === 'remote' && !editingProfile) {
      loadSubStoreSubs();
    }
  }, [urlSource, activeTab, editingProfile, loadSubStoreSubs]);

  // 当选择订阅时自动生成 URL
  useEffect(() => {
    if (urlSource === 'substore' && selectedSub && substoreStatus) {
      const generatedUrl = `${substoreStatus.api_url}/download/${encodeURIComponent(selectedSub)}?target=ClashMeta`;
      setUrl(generatedUrl);
    }
  }, [selectedSub, urlSource, substoreStatus]);

  const resetForm = () => {
    setName('');
    setUrl('');
    setFilePath('');
    setActiveTab('remote');
    setEditingProfile(null);
    setUrlSource('manual');
    setSelectedSub('');
    setSubstoreSubs([]);
  };

  const handleEdit = (profile: ProfileMetadata) => {
    setEditingProfile(profile);
    setName(profile.name);
    setActiveTab(profile.profileType);
    if (profile.profileType === 'remote') {
      setUrl(profile.url || '');
      setFilePath('');
    } else if (profile.profileType === 'local') {
      setFilePath('');
      setUrl('');
    }
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await ipc.deleteProfile(id);
      await loadProfiles();
      toast({
        title: '配置已删除',
      });
    } catch (error) {
      console.error('Failed to delete profile:', error);
      toast({
        title: '删除失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = async (profile: ProfileMetadata) => {
    if (profile.profileType !== 'remote') {
      toast({
        title: '无法刷新',
        description: '只有远程订阅可以刷新',
        variant: 'destructive',
      });
      return;
    }

    setApplyingId(profile.id);

    try {
      const updated = await ipc.refreshProfile(profile.id);
      await loadProfiles();

      if (status.running && profile.active) {
        await fetchGroups();
      }

      const defaultRulesHint = updated.defaultRulesApplied
        ? '。检测到配置没有任何规则，已自动创建默认规则'
        : '';
      toast({
        title: '订阅已更新',
        description: `已加载 ${updated.proxyCount} 个节点${defaultRulesHint}`,
      });
    } catch (error) {
      console.error('Failed to refresh profile:', error);
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  // 判断保存按钮是否可用
  const canSave = () => {
    if (editingProfile) return !!name;
    if (activeTab === 'remote') return !!url;
    if (activeTab === 'local') return !!filePath;
    return true; // blank
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            配置管理
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理代理配置。支持远程订阅、本地文件导入和手动创建
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={resetForm}
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              添加配置
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-[24px]">
            <DialogHeader>
              <DialogTitle>{editingProfile ? '编辑配置' : '添加新配置'}</DialogTitle>
              <DialogDescription>
                {editingProfile
                  ? '修改配置的名称。'
                  : '选择配置来源：远程订阅、本地文件或空白配置。'}
              </DialogDescription>
            </DialogHeader>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as ProfileType)}
              className="w-full mt-2"
            >
              {!editingProfile && (
                <TabsList className="grid w-full grid-cols-3 mb-4 bg-gray-100 dark:bg-zinc-800 rounded-full p-1 h-10">
                  <TabsTrigger
                    value="remote"
                    className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm text-xs"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    远程订阅
                  </TabsTrigger>
                  <TabsTrigger
                    value="local"
                    className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    本地文件
                  </TabsTrigger>
                  <TabsTrigger
                    value="blank"
                    className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm text-xs"
                  >
                    <File className="w-3.5 h-3.5" />
                    空白配置
                  </TabsTrigger>
                </TabsList>
              )}

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">名称 {!editingProfile && '(可选)'}</Label>
                  <Input
                    id="name"
                    placeholder="例如：公司策略"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                {!editingProfile && (
                  <>
                    <TabsContent value="remote" className="space-y-4 mt-0">
                      <div className="space-y-3">
                        <Label>订阅来源</Label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="urlSource"
                              value="manual"
                              checked={urlSource === 'manual'}
                              onChange={(e) =>
                                setUrlSource(e.target.value as 'manual' | 'substore')
                              }
                              className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              直接输入 URL
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="urlSource"
                              value="substore"
                              checked={urlSource === 'substore'}
                              onChange={(e) =>
                                setUrlSource(e.target.value as 'manual' | 'substore')
                              }
                              className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              从 Sub-Store 选择
                            </span>
                          </label>
                        </div>
                      </div>

                      {urlSource === 'manual' ? (
                        <div className="space-y-2">
                          <Label htmlFor="url">订阅链接</Label>
                          <Input
                            id="url"
                            placeholder="https://example.com/subscribe/..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="rounded-xl font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500">支持 MiHomo/Clash 格式的订阅链接</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {loadingSubs ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                          ) : substoreSubs.length === 0 ? (
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                未找到 Sub-Store 订阅。请先在 Sub-Store 页面添加订阅。
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <Label>选择订阅</Label>
                                <div className="grid gap-2 max-h-[300px] overflow-y-auto p-1">
                                  {substoreSubs.map((sub) => (
                                    <label
                                      key={sub.name}
                                      className={cn(
                                        'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                                        selectedSub === sub.name
                                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                          : 'border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
                                      )}
                                    >
                                      <input
                                        type="radio"
                                        name="sub"
                                        value={sub.name}
                                        checked={selectedSub === sub.name}
                                        onChange={(e) => setSelectedSub(e.target.value)}
                                        className="w-4 h-4 text-blue-600"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                          {sub.displayName || sub.name}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                                          {sub.name}
                                        </div>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              {selectedSub && url && (
                                <div className="space-y-2">
                                  <Label>生成的订阅链接</Label>
                                  <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700">
                                    <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                                      {url}
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-500">目标格式: ClashMeta</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="local" className="space-y-4 mt-0">
                      <div className="space-y-2">
                        <Label htmlFor="filepath">文件路径</Label>
                        <div className="flex gap-2">
                          <Input
                            id="filepath"
                            placeholder="/path/to/config.yaml"
                            value={filePath}
                            onChange={(e) => setFilePath(e.target.value)}
                            className="rounded-xl font-mono text-sm"
                          />
                          <Button
                            variant="outline"
                            className="shrink-0 rounded-xl"
                            onClick={handleBrowse}
                          >
                            浏览...
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                          导入后配置内容将独立保存，不会同步源文件的修改
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="blank" className="space-y-4 mt-0">
                      <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-xl">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          创建一个空白配置，您可以之后在策略页面手动添加策略，或在规则页面添加规则。
                        </p>
                      </div>
                    </TabsContent>
                  </>
                )}
              </div>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave() || saving}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingProfile ? '保存更改' : '创建配置'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <Globe className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">暂无配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            点击右上角添加您的第一个配置
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const isApplying = applyingId === profile.id;
            const typeInfo = getProfileTypeInfo(profile.profileType);

            return (
              <BentoCard
                key={profile.id}
                className={cn(
                  'group relative',
                  profile.active
                    ? 'border-blue-500 dark:border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
                    : 'border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900',
                  isApplying && 'opacity-70 pointer-events-none'
                )}
                onClick={() => handleActivate(profile.id)}
                title={typeInfo.label}
                icon={typeInfo.icon}
                iconColor={typeInfo.color}
                action={
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {profile.profileType === 'remote' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                        title="更新订阅"
                        onClick={() => handleRefresh(profile)}
                        disabled={isApplying}
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', isApplying && 'animate-spin')} />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg"
                      title="导出配置"
                      onClick={() => handleExport(profile)}
                      disabled={isApplying}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                      title="编辑"
                      onClick={() => handleEdit(profile)}
                      disabled={isApplying}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      title="删除"
                      onClick={() => handleDelete(profile.id)}
                      disabled={isApplying}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                }
              >
                {isApplying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-900/50 z-20 backdrop-blur-sm rounded-[20px]">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-xs font-medium text-blue-500">正在应用...</span>
                    </div>
                  </div>
                )}

                {profile.active && !isApplying && (
                  <div className="absolute top-4 right-4 z-0">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  </div>
                )}

                <div className="flex flex-col h-full justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-1 mb-1">
                      {profile.name}
                    </h3>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all line-clamp-2 leading-relaxed opacity-70">
                      {profile.profileType === 'remote' && profile.url}
                      {profile.profileType === 'local' && '本地文件导入'}
                      {profile.profileType === 'blank' && '手动创建的空白配置'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(profile.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-md',
                          profile.active
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400'
                        )}
                      >
                        {profile.proxyCount} 节点
                      </span>
                      <span className="text-xs text-gray-400">{profile.ruleCount} 规则</span>
                    </div>
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
