import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, ShieldAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProxyStore } from '@/stores/proxyStore';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import WindowControls from './WindowControls';

const toastVariantStyles = {
  default: {
    pill: 'bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100',
    dot: 'bg-sky-500',
    badge: 'text-sky-600 dark:text-sky-200',
    panel: 'border-sky-200/60 dark:border-sky-900/40',
    item: 'hover:bg-sky-500/5 dark:hover:bg-sky-500/10',
  },
  success: {
    pill: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100',
    dot: 'bg-emerald-500',
    badge: 'text-emerald-600 dark:text-emerald-200',
    panel: 'border-emerald-200/60 dark:border-emerald-900/40',
    item: 'hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10',
  },
  destructive: {
    pill: 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100',
    dot: 'bg-rose-500',
    badge: 'text-rose-600 dark:text-rose-200',
    panel: 'border-rose-200/60 dark:border-rose-900/40',
    item: 'hover:bg-rose-500/5 dark:hover:bg-rose-500/10',
  },
  warning: {
    pill: 'bg-amber-500/10 text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100',
    dot: 'bg-amber-500',
    badge: 'text-amber-700 dark:text-amber-200',
    panel: 'border-amber-200/60 dark:border-amber-900/40',
    item: 'hover:bg-amber-500/5 dark:hover:bg-amber-500/10',
  },
};

const getToastText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
};

const getToastVariantStyle = (variant?: string) =>
  toastVariantStyles[variant as keyof typeof toastVariantStyles] ?? toastVariantStyles.default;

export default function Header() {
  const {
    status,
    loading,
    setSystemProxy,
    setEnhancedMode,
    needAdminRestart,
    setNeedAdminRestart,
    startNormalMode,
  } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      loading: state.loading,
      setSystemProxy: state.setSystemProxy,
      setEnhancedMode: state.setEnhancedMode,
      needAdminRestart: state.needAdminRestart,
      setNeedAdminRestart: state.setNeedAdminRestart,
      startNormalMode: state.startNormalMode,
    }))
  );
  const { toast, history, toasts, clearAll } = useToast();
  const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const [logOpen, setLogOpen] = useState(false);
  const [restartingAsAdmin, setRestartingAsAdmin] = useState(false);
  const [startingNormalMode, setStartingNormalMode] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [swapActive, setSwapActive] = useState(false);
  const [previousMessage, setPreviousMessage] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const lastToastIdRef = useRef<string | null>(null);
  const lastMessageRef = useRef<string>('暂无通知');
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );
  const latestToast = history[0];
  const latestMessage =
    getToastText(latestToast?.description) || getToastText(latestToast?.title) || '暂无通知';
  const latestVariantStyle = getToastVariantStyle(latestToast?.variant ?? undefined);
  const isNewToast = pulseId === latestToast?.id;
  const latestMessageKey = latestToast?.id ?? 'empty';

  useEffect(() => {
    const scheduleSwap = (message: string | null, active: boolean) =>
      window.setTimeout(() => {
        setPreviousMessage(message);
        setSwapActive(active);
      }, 0);

    if (!latestToast?.id) {
      lastMessageRef.current = latestMessage;
      const frame = scheduleSwap(null, false);
      return () => window.clearTimeout(frame);
    }
    const previous = lastMessageRef.current;
    lastMessageRef.current = latestMessage;
    const frame = scheduleSwap(previous, true);
    const timeout = window.setTimeout(() => {
      setSwapActive(false);
      setPreviousMessage(null);
    }, 360);
    return () => {
      window.clearTimeout(frame);
      window.clearTimeout(timeout);
    };
  }, [latestToast?.id, latestMessage]);

  useEffect(() => {
    const nextId = latestToast?.id ?? null;
    if (!nextId) {
      lastToastIdRef.current = null;
      return;
    }
    if (nextId !== lastToastIdRef.current) {
      lastToastIdRef.current = nextId;
      const frame = window.setTimeout(() => {
        setPulseId(nextId);
      }, 0);
      const timeout = window.setTimeout(() => {
        setPulseId((current) => (current === nextId ? null : current));
      }, 900);
      return () => {
        window.clearTimeout(frame);
        window.clearTimeout(timeout);
      };
    }
  }, [latestToast?.id]);

  useEffect(() => {
    if (!logOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!logRef.current?.contains(event.target as Node)) {
        setLogOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLogOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [logOpen]);

  const handleSystemProxyToggle = async () => {
    try {
      const next = !status.system_proxy;
      await setSystemProxy(next);
    } catch (error) {
      console.error('Failed to toggle system proxy:', error);
      toast({
        title: status.system_proxy ? '无法关闭系统代理' : '无法开启系统代理',
        description: formatError(error),
        variant: 'destructive',
      });
    }
  };

  const handleEnhancedModeToggle = async () => {
    try {
      const next = !status.enhanced_mode;
      await setEnhancedMode(next);
    } catch (error) {
      console.error('Failed to toggle enhanced mode:', error);
      const errorMsg = formatError(error);
      toast({
        title: status.enhanced_mode ? '无法关闭增强模式' : '无法开启增强模式',
        description: errorMsg.replace('NEED_ADMIN:', ''),
        variant: 'destructive',
      });
    }
  };

  const handleRestartAsAdmin = async () => {
    setRestartingAsAdmin(true);
    try {
      await ipc.restartAsAdmin();
    } catch (error) {
      console.error('Failed to restart as admin:', error);
      toast({
        title: '重启失败',
        description: formatError(error),
        variant: 'destructive',
      });
      setRestartingAsAdmin(false);
    }
  };

  const handleCloseAdminDialog = () => {
    setNeedAdminRestart(false);
    setRestartingAsAdmin(false);
    setStartingNormalMode(false);
  };

  const handleStartNormalMode = async () => {
    setStartingNormalMode(true);
    try {
      await startNormalMode();
      setNeedAdminRestart(false);
      toast({
        title: '已以普通模式启动',
        description: '增强模式已禁用，您可以稍后在设置中安装服务以启用增强模式',
      });
    } catch (error) {
      console.error('Failed to start in normal mode:', error);
      toast({
        title: '启动失败',
        description: formatError(error),
        variant: 'destructive',
      });
    } finally {
      setStartingNormalMode(false);
    }
  };

  return (
    <div className="flex flex-col w-full shrink-0 z-50">
      {/* 需要管理员权限对话框 */}
      <Dialog open={needAdminRestart} onOpenChange={handleCloseAdminDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              需要管理员权限
            </DialogTitle>
            <DialogDescription className="text-left pt-2">
              您的配置启用了增强模式（TUN），该功能需要管理员权限才能创建虚拟网卡。
              <br />
              <br />
              请选择：
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>
                  <strong>以普通模式启动</strong> - 禁用增强模式，立即启动代理
                </li>
                <li>
                  <strong>以管理员身份重启</strong> - 重启应用以获取权限
                </li>
                <li>或在设置中安装 Conflux 服务（推荐，一劳永逸）</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleStartNormalMode}
              disabled={restartingAsAdmin || startingNormalMode}
            >
              {startingNormalMode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在启动...
                </>
              ) : (
                '以普通模式启动'
              )}
            </Button>
            <Button
              onClick={handleRestartAsAdmin}
              disabled={restartingAsAdmin || startingNormalMode}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {restartingAsAdmin ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在重启...
                </>
              ) : (
                '以管理员身份重启'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header
        data-tauri-drag-region
        className="h-11 min-[960px]:h-12 flex items-center justify-between px-3 min-[960px]:px-4 bg-transparent drag-region select-none"
      >
        {/* 左侧：窗口控制 */}
        <div className="flex items-center gap-12">
          <WindowControls />
          <div className="relative no-drag" ref={logRef}>
            <button
              type="button"
              onClick={() => setLogOpen((open) => !open)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-left shadow-sm transition-shadow duration-200',
                'my-1.5',
                'w-[240px] min-[960px]:w-[320px]',
                latestVariantStyle.pill,
                logOpen && 'shadow-md',
                isNewToast && 'animate-in fade-in zoom-in-95 ring-2 ring-white/30'
              )}
              aria-expanded={logOpen}
              aria-label="查看通知日志"
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  latestVariantStyle.dot,
                  isNewToast ? 'animate-ping' : toasts.length > 0 && 'animate-pulse'
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="relative h-4 overflow-hidden">
                  {previousMessage && swapActive && (
                    <span className="absolute inset-0 truncate text-[11px] font-semibold text-gray-800/70 dark:text-zinc-100/70 text-swap-out">
                      {previousMessage}
                    </span>
                  )}
                  <span
                    key={latestMessageKey}
                    className={cn(
                      'absolute inset-0 truncate text-[11px] font-semibold text-gray-800 dark:text-zinc-100',
                      swapActive && 'text-swap-in'
                    )}
                  >
                    {latestMessage}
                  </span>
                </div>
              </div>
              <span className={cn('text-[10px] font-semibold', latestVariantStyle.badge)}>
                {history.length}
              </span>
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-300', logOpen && 'rotate-180')}
              />
            </button>

            <div
              className={cn(
                'absolute left-0 mt-2 w-[240px] min-[960px]:w-[320px] overflow-hidden rounded-2xl border bg-white shadow-xl dark:bg-zinc-900',
                latestVariantStyle.panel
              )}
              style={{
                display: logOpen ? 'block' : 'none',
                maxHeight: '360px',
              }}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-xs font-semibold text-gray-700 dark:border-zinc-800 dark:text-zinc-200">
                <span>通知日志</span>
                <div className="flex items-center gap-2 text-[10px] font-medium text-gray-500 dark:text-zinc-400">
                  <span>共 {history.length} 条</span>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearAll()}
                      className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      全部清理
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[280px] overflow-auto py-1">
                {history.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-500 dark:text-zinc-400">
                    还没有新的通知
                  </div>
                ) : (
                  history.map((item) => {
                    const itemMessage =
                      getToastText(item.description) || getToastText(item.title) || '未命名通知';
                    const itemVariantStyle = getToastVariantStyle(item.variant ?? undefined);
                    const itemCreatedAt = item.createdAt;
                    return (
                      <div
                        key={item.id}
                        className={cn('flex gap-3 px-4 py-2', itemVariantStyle.item)}
                      >
                        <span
                          className={cn('mt-1 h-2 w-2 rounded-full shrink-0', itemVariantStyle.dot)}
                        />
                        <div className="flex-1 flex justify-between items-center gap-2">
                          <span className="text-xs font-semibold text-gray-800 dark:text-zinc-100">
                            {itemMessage}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-400 dark:text-zinc-500">
                            {itemCreatedAt ? timeFormatter.format(itemCreatedAt) : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：状态控制 */}
        <div className="flex items-center gap-3 no-drag">
          {/* 系统代理 */}
          <button
            onClick={handleSystemProxyToggle}
            disabled={loading || !status.running}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors duration-200',
              loading || !status.running ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              status.system_proxy
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-600'
                : 'bg-white hover:bg-gray-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 ring-1 ring-gray-200 dark:ring-zinc-700'
            )}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <div
                className={cn(
                  'w-2 h-2 rounded-full transition-colors shadow-[0_0_8px_rgba(0,0,0,0.2)]',
                  status.system_proxy
                    ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]'
                    : 'bg-gray-400 dark:bg-gray-500'
                )}
              />
            )}
            <span className="text-xs font-medium tracking-wide">系统代理</span>
          </button>

          {/* 增强模式 (TUN) */}
          <button
            onClick={handleEnhancedModeToggle}
            disabled={loading || !status.running}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors duration-200',
              loading || !status.running ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              status.enhanced_mode
                ? 'bg-purple-500 hover:bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-600'
                : 'bg-white hover:bg-gray-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 ring-1 ring-gray-200 dark:ring-zinc-700'
            )}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <div
                className={cn(
                  'w-2 h-2 rounded-full transition-colors shadow-[0_0_8px_rgba(0,0,0,0.2)]',
                  status.enhanced_mode
                    ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]'
                    : 'bg-gray-400 dark:bg-gray-500'
                )}
              />
            )}
            <span className="text-xs font-medium tracking-wide">增强模式</span>
          </button>
        </div>
      </header>
    </div>
  );
}
