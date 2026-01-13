import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Link,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
// Removed ProxyServerDialog in favor of window
import { listen } from '@tauri-apps/api/event';
import { getProxyTypeColor, getProxyTypeBgColor } from './utils';
import type { ProfileConfig } from '@/types/config';
import {
  validateDeleteProxy,
  formatDependencies,
  type DeleteValidationResult,
} from '@/utils/deleteValidation';

import { TextWithFlag } from '@/components/ui/RegionFlag';

// AddServerMenu component
const AddServerMenu = ({
  hasActiveProfile,
  onParseLink,
  onManualAdd,
  wrapperClassName,
}: {
  hasActiveProfile: boolean;
  onParseLink: () => void;
  onManualAdd: () => void;
  wrapperClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={cn('relative', wrapperClassName)} ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!hasActiveProfile}
        className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
      >
        <Plus className="w-4 h-4" />
        添加服务器
        <ChevronDown
          className={cn(
            'w-3 h-3 ml-1 transition-transform duration-200',
            isOpen ? 'rotate-180' : ''
          )}
        />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg shadow-gray-200/50 dark:shadow-black/50 overflow-hidden z-50 py-1">
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors"
            onClick={() => {
              setIsOpen(false);
              onParseLink();
            }}
          >
            <Link className="w-4 h-4 text-gray-500" />
            解析链接
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors"
            onClick={() => {
              setIsOpen(false);
              onManualAdd();
            }}
          >
            <Pencil className="w-4 h-4 text-gray-500" />
            手动添加
          </button>
        </div>
      )}
    </div>
  );
};

export default function ProxyServers() {
  const status = useProxyStore((state) => state.status);
  const { toast } = useToast();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);

  const [proxyServers, setProxyServers] = useState<ProxyConfig[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  // Removed dialogOpen and editingProxy
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyConfig | null>(null);
  const [deleteValidation, setDeleteValidation] = useState<DeleteValidationResult | null>(null);

  const loadProxyServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (!profileId) {
        setProxyServers([]);
        setProfileConfig(null);
        return;
      }

      const [, config] = await ipc.getProfile(profileId);
      setProfileConfig(config);
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

  const toWindowLabelSafe = (value: string) => {
    const encoded = encodeURIComponent(value);
    const sanitized = encoded.replace(/%/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  };

  const buildServerWindowLabel = (name?: string) => {
    const prefix = name ? 'edit-server' : 'add-server';
    if (!name) return `${prefix}-${Date.now()}`;
    const safe = toWindowLabelSafe(name);
    return safe ? `${prefix}-${safe}` : `${prefix}-${Date.now()}`;
  };

  const openServerWindow = async (name?: string) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = buildServerWindowLabel(name);
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const newWindow = new WebviewWindow(label, {
        url: `/#/proxy-server-edit${name ? `?name=${encodeURIComponent(name)}` : ''}`,
        title: name ? `编辑服务器 - ${name}` : '手动配置服务器',
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
          reject(new Error(String(event.payload) || '窗口创建失败'));
        });
      });
    } catch (e) {
      console.error('Failed to open window', e);
      toast({ title: '无法打开窗口', description: String(e), variant: 'destructive' });
    }
  };

  useEffect(() => {
    const unlisten = listen('proxy-servers-changed', () => {
      loadProxyServers();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [loadProxyServers]);

  // 请求删除服务器（先校验依赖）
  const handleRequestDelete = (server: ProxyConfig) => {
    if (!profileConfig) {
      setDeleteConfirm(server);
      setDeleteValidation(null);
      return;
    }

    // 校验删除依赖
    const validation = validateDeleteProxy(server.name, profileConfig);
    setDeleteValidation(validation);
    setDeleteConfirm(server);
  };

  const handleDeleteProxy = async (name: string) => {
    if (!activeProfileId) return;

    // 再次校验（防止并发修改）
    if (profileConfig) {
      const validation = validateDeleteProxy(name, profileConfig);
      if (!validation.canDelete) {
        toast({
          title: '无法删除',
          description: validation.errorMessage,
          variant: 'destructive',
        });
        setDeleteConfirm(null);
        setDeleteValidation(null);
        return;
      }
    }

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

  const handleParseLink = () => {
    setLinkDialogOpen(true);
  };

  const handleManualAdd = async () => {
    await openServerWindow();
  };

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
          <AddServerMenu
            hasActiveProfile={hasActiveProfile}
            onParseLink={handleParseLink}
            onManualAdd={handleManualAdd}
          />
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
                        openServerWindow(server.name);
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
                        handleRequestDelete(server);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="z-10">
                    <div className="font-medium text-xs text-gray-700 dark:text-gray-300 line-clamp-1 mb-0.5">
                      <TextWithFlag text={server.name} />
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

      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => {
          setDeleteConfirm(null);
          setDeleteValidation(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleteValidation?.canDelete === false ? '无法删除' : '确认删除'}
            </DialogTitle>
          </DialogHeader>
          {deleteValidation?.canDelete === false ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                服务器 "{deleteConfirm?.name}" 正在被以下对象引用：
              </p>
              <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1 max-h-40 overflow-y-auto">
                {formatDependencies(deleteValidation.dependencies).map((dep, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{dep}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">请先移除这些引用后再删除服务器。</p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              确定要删除服务器 "{deleteConfirm?.name}" 吗？此操作不可撤销。
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirm(null);
                setDeleteValidation(null);
              }}
            >
              {deleteValidation?.canDelete === false ? '知道了' : '取消'}
            </Button>
            {deleteValidation?.canDelete !== false && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteConfirm?.name) {
                    handleDeleteProxy(deleteConfirm.name);
                  }
                  setDeleteConfirm(null);
                  setDeleteValidation(null);
                }}
              >
                删除
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
