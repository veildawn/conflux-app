import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Pencil, RefreshCw, Trash2, Wifi, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { useProxyStore } from '@/stores/proxyStore';
import { formatDelay, getDelayColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { ProxyConfig } from '@/types/config';
import { BentoCard } from './components/BentoCard';
import { LinkParseDialog } from './LinkParseDialog';
import { ProxyServerDialog } from './ProxyServerDialog';
import { getProxyTypeColor, getProxyTypeBgColor } from './utils';

export default function ProxyServers() {
  const status = useProxyStore((state) => state.status);
  const { toast } = useToast();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [proxyServers, setProxyServers] = useState<ProxyConfig[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxyConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyConfig | null>(null);
  const [addMenuValue, setAddMenuValue] = useState('');

  const loadProxyServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (!profileId) {
        setProxyServers([]);
        return;
      }

      const [, config] = await ipc.getProfile(profileId);
      const sorted = [...config.proxies].sort((a, b) => a.name.localeCompare(b.name));
      setProxyServers(sorted);
    } catch (error) {
      console.error('Failed to load proxy servers:', error);
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingServers(false);
    }
  }, [toast, setActiveProfileId]);

  useEffect(() => {
    loadProxyServers();
  }, [loadProxyServers]);

  useEffect(() => {
    setDelays((prev) => {
      const next: Record<string, number> = {};
      for (const server of proxyServers) {
        if (prev[server.name] !== undefined) {
          next[server.name] = prev[server.name];
        }
      }
      return next;
    });
  }, [proxyServers]);

  const runDelayTest = useCallback(async (name: string) => {
    setTestingNodes((prev) => new Set(prev).add(name));
    try {
      const delay = await ipc.testProxyDelay(name);
      setDelays((prev) => ({ ...prev, [name]: delay }));
      return delay;
    } catch (error) {
      setDelays((prev) => ({ ...prev, [name]: -1 }));
      throw error;
    } finally {
      setTestingNodes((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }, []);

  const handleTestDelay = async (name: string) => {
    if (!status.running) {
      toast({
        title: '核心未启动',
        description: '请先启动核心服务后再测速',
        variant: 'destructive',
      });
      return;
    }

    try {
      await runDelayTest(name);
    } catch {
      // Delay result already stored.
    }
  };

  const handleTestAllDelays = async () => {
    if (!status.running) {
      toast({
        title: '核心未启动',
        description: '请先启动核心服务后再测速',
        variant: 'destructive',
      });
      return;
    }
    for (const server of proxyServers) {
      handleTestDelay(server.name);
    }
  };

  const ensureActiveProfile = () => {
    if (!activeProfileId) {
      const error = new Error('没有活跃的配置');
      toast({
        title: '无法保存',
        description: '请先在"配置"页面创建或激活一个配置文件',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleAddProxy = async (proxy: ProxyConfig) => {
    ensureActiveProfile();

    try {
      await ipc.addProxy(activeProfileId as string, proxy);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已添加` });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateProxy = async (proxy: ProxyConfig, originalProxy: ProxyConfig) => {
    ensureActiveProfile();

    try {
      await ipc.updateProxy(activeProfileId as string, originalProxy.name, proxy);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已更新` });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSaveProxy = async (proxy: ProxyConfig, originalProxy?: ProxyConfig) => {
    if (originalProxy) {
      return handleUpdateProxy(proxy, originalProxy);
    }
    return handleAddProxy(proxy);
  };

  const handleDeleteProxy = async (name: string) => {
    if (!activeProfileId) return;

    try {
      await ipc.deleteProxy(activeProfileId, name);
      await loadProxyServers();
      setDelays((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      toast({ title: '删除成功', description: `服务器 "${name}" 已删除` });
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
  };

  const hasActiveProfile = useMemo(() => activeProfileId !== null, [activeProfileId]);
  const handleAddMenuSelect = (value: 'parse' | 'manual') => {
    setAddMenuValue('');
    if (value === 'parse') {
      setLinkDialogOpen(true);
      return;
    }
    setEditingProxy(null);
    setDialogOpen(true);
  };

  const renderAddServerMenu = (wrapperClassName?: string) => (
    <div className={wrapperClassName}>
      <Select
        value={addMenuValue}
        onValueChange={(value) => handleAddMenuSelect(value as 'parse' | 'manual')}
        disabled={!hasActiveProfile}
      >
        <SelectTrigger
          className="w-auto rounded-full h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 font-medium hover:bg-accent hover:text-accent-foreground"
          disabled={!hasActiveProfile}
        >
          <span className="inline-flex items-center gap-2">
            <SelectValue placeholder="添加服务器" />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="parse">解析链接</SelectItem>
          <SelectItem value="manual">手动配置</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            服务器
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理配置文件中的服务器列表，支持增删改查与延迟测速
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!status.running && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 px-3 py-1 rounded-full">
              核心未启动，测速不可用
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={loadProxyServers}
            className="rounded-full h-9 w-9"
            disabled={loadingServers}
          >
            <RefreshCw className={cn('w-4 h-4', loadingServers && 'animate-spin')} />
          </Button>
          {renderAddServerMenu()}
        </div>
      </div>

      {loadingServers ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !hasActiveProfile ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px]">
          <AlertCircle className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      ) : proxyServers.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px]">
          <Wifi className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">暂无代理服务器</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            点击上方按钮添加新的服务器
          </p>
          {renderAddServerMenu('mt-6')}
        </div>
      ) : (
        <BentoCard
          className="rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none"
          title="配置服务器"
          icon={Wifi}
          iconColor="text-emerald-500"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestAllDelays}
              disabled={!status.running || loadingServers || proxyServers.length === 0}
              className="h-7 px-2 text-xs text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <Zap className="w-3.5 h-3.5 mr-1" />
              测速全部
            </Button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-5">
            {proxyServers.map((server) => {
              const isTesting = testingNodes.has(server.name);
              const delay = delays[server.name];

              return (
                <div
                  key={server.name}
                  className="relative p-2.5 rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-600 transition-all flex flex-col justify-between h-[90px] group overflow-hidden"
                >
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="编辑"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProxy(server);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(server);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="z-10">
                    <div className="font-medium text-xs text-gray-700 dark:text-gray-300 line-clamp-1 mb-0.5">
                      {server.name}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate opacity-60">
                      {server.server}:{server.port}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'absolute -right-4 -bottom-4 w-12 h-12 rounded-full opacity-5 pointer-events-none transition-opacity group-hover:opacity-10',
                      getProxyTypeBgColor(server.type)
                    )}
                  />

                  <div className="flex items-end justify-between z-10">
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={cn(
                          'text-[9px] font-bold rounded-md px-1 py-0.5 uppercase tracking-wider',
                          getProxyTypeColor(server.type)
                        )}
                      >
                        {server.type}
                      </span>
                      {server.udp && (
                        <span className="text-[9px] font-bold rounded-md px-1 py-0.5 bg-blue-500/5 text-blue-600 dark:text-blue-400 border border-blue-500/10">
                          UDP
                        </span>
                      )}
                    </div>

                    <div>
                      {isTesting ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                      ) : delay !== undefined ? (
                        <div className="flex items-center gap-1">
                          <div
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              delay < 0
                                ? 'bg-red-400'
                                : delay < 200
                                  ? 'bg-emerald-400'
                                  : 'bg-amber-400'
                            )}
                          />
                          <span
                            className={cn(
                              'text-[10px] font-bold',
                              getDelayColorClass(delay).replace('bg-', 'text-').replace('/10', '')
                            )}
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
        </BentoCard>
      )}

      <LinkParseDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onSuccess={handleAddProxy}
        statusRunning={status.running}
      />

      <ProxyServerDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingProxy(null);
        }}
        onSubmit={handleSaveProxy}
        editData={editingProxy}
        statusRunning={status.running}
      />

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            确定要删除服务器 "{deleteConfirm?.name}" 吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.name) {
                  handleDeleteProxy(deleteConfirm.name);
                }
                setDeleteConfirm(null);
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
