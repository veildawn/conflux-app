import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';
import { cn } from '@/utils/cn';
import { parseRule } from '@/types/config';
import type { ProfileConfig, ProxyGroupConfig } from '@/types/config';

import { ProxyGroupListItem } from './proxy-groups/shared/ProxyGroupListItem';

// ... (ADAPTER_TYPES, ADAPTER_TYPE_SET can be local or exported if needed, they seem local validation helpers)

const toWindowLabelSafe = (value: string) => {
  const encoded = encodeURIComponent(value);
  const sanitized = encoded.replace(/%/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
};

const formatErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const buildGroupWindowLabel = (name?: string) => {
  const prefix = name ? 'edit-group' : 'add-group';
  if (!name) return `${prefix}-${Date.now()}`;
  const safe = toWindowLabelSafe(name);
  return safe ? `${prefix}-${safe}` : `${prefix}-${Date.now()}`;
};

export default function ProxyGroups() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyGroupConfig | null>(null);

  const loadActiveProfile = useCallback(async () => {
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
      console.error('Failed to load active profile:', error);
      setProfileConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveProfile();
  }, [loadActiveProfile]);

  useEffect(() => {
    const unlisten = listen('proxy-groups-changed', () => {
      loadActiveProfile();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [loadActiveProfile]);

  const proxyGroups = useMemo(() => {
    const groups = profileConfig?.['proxy-groups'] || [];
    return [...groups].sort((a, b) => a.name.localeCompare(b.name));
  }, [profileConfig]);

  const ruleUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    const rules = profileConfig?.rules || [];
    for (const rule of rules) {
      const parsed = parseRule(rule);
      if (!parsed) continue;
      map.set(parsed.policy, (map.get(parsed.policy) || 0) + 1);
    }
    return map;
  }, [profileConfig]);

  const openGroupWindow = async (name?: string) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = buildGroupWindowLabel(name);
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const newWindow = new WebviewWindow(label, {
        url: `/#/proxy-group-edit${name ? `?name=${encodeURIComponent(name)}` : ''}`,
        title: name ? `编辑策略组 - ${name}` : '添加策略组',
        width: 860,
        height: 700,
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
          reject(new Error(formatErrorMessage(event) || '窗口创建失败'));
        });
      });
    } catch (e) {
      console.error('Failed to open window', e);
      toast({ title: '无法打开窗口', description: formatErrorMessage(e), variant: 'destructive' });
    }
  };

  const handleDeleteGroup = async (name: string) => {
    if (!activeProfileId || !profileConfig) return;

    const nextGroups = (profileConfig['proxy-groups'] || [])
      .filter((group) => group.name !== name)
      .map((group) => ({
        ...group,
        proxies: (group.proxies || []).filter((proxy) => proxy !== name),
      }));

    const newConfig: ProfileConfig = {
      ...profileConfig,
      'proxy-groups': nextGroups,
    };

    try {
      await ipc.updateProfileConfig(activeProfileId, newConfig);
      setProfileConfig(newConfig);
      toast({ title: '删除成功', description: `策略组 "${name}" 已删除` });
    } catch (error) {
      console.error('Failed to delete proxy group:', error);
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            策略组
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理代理节点的分组与负载均衡策略
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadActiveProfile()}
            disabled={loading}
            className="rounded-full h-9 w-9"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openGroupWindow()}
            disabled={loading || !profileConfig}
            className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
          >
            <Plus className="h-4 w-4" />
            新建策略组
          </Button>
        </div>
      </div>

      {!activeProfileId ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">未选择配置文件</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在配置页面选择或启动一个配置
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center flex-1 w-full">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden bg-white dark:bg-zinc-900 rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-100 dark:border-zinc-800 flex flex-col">
          <div className="flex-1 overflow-y-auto min-h-0">
            {proxyGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 opacity-40" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">暂无策略组</p>
                <p className="text-sm mt-1 text-center max-w-xs text-gray-500">
                  点击右上角的"新建策略组"按钮开始配置
                </p>
              </div>
            ) : (
              <div>
                {proxyGroups.map((group, index: number) => (
                  <ProxyGroupListItem
                    key={group.name}
                    group={group}
                    isRemote={false}
                    onEdit={() => openGroupWindow(group.name)}
                    onDelete={() => setDeleteConfirm(group)}
                    isLast={index === proxyGroups.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm rounded-[24px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            确定要删除策略组 "{deleteConfirm?.name}" 吗？此操作不可撤销。
            {(ruleUsageMap.get(deleteConfirm?.name || '') || 0) > 0 && (
              <span className="block mt-2 text-xs text-amber-500">
                该策略组仍被规则引用，请确认规则策略是否需要调整。
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="rounded-xl">
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.name) {
                  handleDeleteGroup(deleteConfirm.name);
                }
                setDeleteConfirm(null);
              }}
              className="rounded-xl"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
