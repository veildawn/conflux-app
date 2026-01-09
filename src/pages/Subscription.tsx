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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { listen } from '@tauri-apps/api/event';
import type { ProfileMetadata, ProfileType } from '@/types/config';
import { cn } from '@/utils/cn';
import { save } from '@tauri-apps/plugin-dialog';
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
        'bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        onClick &&
          'cursor-pointer transition-[box-shadow,border-color] duration-150 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800',
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
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProfileMetadata | null>(null);

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

  // 监听配置变更
  useEffect(() => {
    const unlisten = listen('profiles-changed', () => {
      loadProfiles();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [loadProfiles]);

  const toWindowLabelSafe = (value: string) => {
    const encoded = encodeURIComponent(value);
    const sanitized = encoded.replace(/%/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  };

  const buildWindowLabel = (id?: string) => {
    const prefix = id ? 'edit-profile' : 'add-profile';
    if (!id) return `${prefix}-${Date.now()}`;
    const safe = toWindowLabelSafe(id);
    return safe ? `${prefix}-${safe}` : `${prefix}-${Date.now()}`;
  };

  const openProfileWindow = async (id?: string) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = buildWindowLabel(id);
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const newWindow = new WebviewWindow(label, {
        url: `/#/subscription-edit${id ? `?id=${encodeURIComponent(id)}` : ''}`,
        title: id ? '编辑配置' : '添加配置',
        width: 800,
        height: 600,
        center: true,
        resizable: false,
        decorations: false,
        transparent: true,
        shadow: false,
      });

      // 等待窗口创建完成或出错
      await new Promise<void>((resolve, reject) => {
        newWindow.once('tauri://created', () => {
          resolve();
        });
        newWindow.once('tauri://error', (event) => {
          console.error('Failed to create window', event);
          reject(new Error(String(event.payload) || '窗口创建失败'));
        });
      });
    } catch (e) {
      console.error('Failed to open window', e);
      toast({ title: '无法打开窗口', description: String(e), variant: 'destructive' });
    }
  };

  const handleEdit = (profile: ProfileMetadata) => {
    openProfileWindow(profile.id);
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
    } finally {
      setDeleteConfirm(null);
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

  const handleActivate = async (id: string) => {
    setApplyingId(id);
    try {
      await ipc.activateProfile(id);
      await loadProfiles();
      if (status.running) {
        await fetchGroups();
      }
      toast({ title: '配置已激活' });
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

  const handleExport = async (profile: ProfileMetadata) => {
    try {
      const savePath = await save({
        title: '导出配置',
        defaultPath: `${profile.name}.yaml`,
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
      });
      if (!savePath) return;

      await ipc.exportProfileConfig(profile.id, savePath);
      toast({ title: '导出成功', description: `配置已导出到 ${savePath}` });
    } catch (error) {
      console.error('Failed to export profile:', error);
      toast({
        title: '导出失败',
        description: String(error),
        variant: 'destructive',
      });
    }
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
        <Button
          variant="outline"
          onClick={() => openProfileWindow()}
          className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
        >
          <Plus className="w-4 h-4" />
          添加配置
        </Button>
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm rounded-[24px]">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除配置 "{deleteConfirm?.name}" 吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-xl"
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
                className="rounded-xl"
              >
                删除
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
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-zinc-900/90 z-20 rounded-[20px]">
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
