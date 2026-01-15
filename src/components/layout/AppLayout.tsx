import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Outlet } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useShallow } from 'zustand/react/shallow';
import Sidebar from './Sidebar';
import Header from './Header';
import { useProxyStore } from '@/stores/proxyStore';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/useToast';
import { DRAG_IGNORE_SELECTOR } from '@/utils/dragUtils';
import logger from '@/utils/logger';
import type { ProxyStatus } from '@/types/proxy';

export default function AppLayout() {
  const { applyStatus, fetchStatus, fetchTraffic, fetchConnections, tickNow, start, status } =
    useProxyStore(
      useShallow((state) => ({
        applyStatus: state.applyStatus,
        fetchStatus: state.fetchStatus,
        fetchTraffic: state.fetchTraffic,
        fetchConnections: state.fetchConnections,
        tickNow: state.tickNow,
        start: state.start,
        status: state.status,
      }))
    );
  const { fetchSettings, checkRuleDatabaseUpdates } = useAppStore();
  const { toast } = useToast();
  const initStarted = useRef(false);

  useEffect(() => {
    // 监听 Profile 重载完成事件（处理全局通知）
    const unlisten = listen<{
      profile_id: string;
      success: boolean;
      error?: string;
      restarted?: boolean;
      restart_reason?: string;
    }>('profile-reload-complete', (event) => {
      logger.log('AppLayout: Received profile-reload-complete event:', event.payload);
      const { success, error, restarted, restart_reason } = event.payload;

      if (success) {
        // 显示成功提示，如果重启了核心则显示原因
        if (restarted && restart_reason) {
          toast({
            title: '配置已应用（已重启核心）',
            description: restart_reason,
          });
        } else {
          toast({ title: '配置已应用' });
        }
      } else {
        // 重载失败，显示错误
        toast({
          title: '配置重载失败',
          description: error || '未知错误',
          variant: 'destructive',
        });
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [toast]);

  useEffect(() => {
    // 防止重复初始化
    if (initStarted.current) {
      logger.log('AppLayout: Init already started, skipping...');
      return;
    }
    initStarted.current = true;

    const init = async () => {
      logger.log('AppLayout: Starting initialization...');
      try {
        await fetchSettings();
        logger.log('AppLayout: Settings fetched');
        await fetchStatus();
        logger.log('AppLayout: Status fetched');

        // 如果 mihomo 未运行，自动启动
        const currentStatus = useProxyStore.getState().status;
        logger.log('AppLayout: Current status:', currentStatus);
        if (!currentStatus.running) {
          logger.log('AppLayout: Starting MiHomo...');
          await start();
          logger.log('MiHomo started automatically');
        } else {
          logger.log('AppLayout: MiHomo already running');
        }

        // 应用启动时检查规则数据库更新（只检查一次）
        checkRuleDatabaseUpdates();
        logger.log('AppLayout: Rule database update check initiated');
      } catch (error) {
        logger.error('AppLayout: Init failed:', error);
        // 显示启动失败的错误信息
        const errorMsg = String(error);
        if (!errorMsg.includes('NEED_ADMIN')) {
          // NEED_ADMIN 错误由 Header 组件的对话框处理，这里不重复显示
          toast({
            title: '启动失败',
            description: errorMsg,
            variant: 'destructive',
          });
        }
      }
    };

    // 监听后端准备就绪事件
    let backendReadyUnlisten: (() => void) | null = null;
    let initFailedUnlisten: (() => void) | null = null;

    const setupListeners = async () => {
      // 先尝试直接初始化（可能后端已经准备好了）
      try {
        await fetchStatus();
        logger.log('AppLayout: Backend already ready, starting init...');
        init();
        return;
      } catch {
        // 后端未就绪，等待事件
        logger.log('AppLayout: Waiting for backend-ready event...');
      }

      backendReadyUnlisten = await listen('backend-ready', () => {
        logger.log('AppLayout: Received backend-ready event');
        init();
      });

      initFailedUnlisten = await listen<string>('backend-init-failed', (event) => {
        logger.error('AppLayout: Backend init failed:', event.payload);
      });
    };

    setupListeners();

    return () => {
      if (backendReadyUnlisten) backendReadyUnlisten();
      if (initFailedUnlisten) initFailedUnlisten();
    };
  }, [fetchSettings, fetchStatus, start, checkRuleDatabaseUpdates, toast]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        unlisten = await listen<ProxyStatus>('proxy-status-changed', (event) => {
          logger.log('AppLayout: Received proxy-status-changed event:', event.payload);
          applyStatus(event.payload);
        });
        logger.log('AppLayout: proxy-status-changed listener registered');
      } catch (error) {
        logger.error('Failed to listen proxy status events:', error);
      }
    };

    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyStatus]);

  useEffect(() => {
    // 判断是否是可编辑元素
    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]') !== null
      );
    };

    const blockContextMenu = (event: MouseEvent) => {
      // 允许在可编辑元素上显示右键菜单
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };
    const blockCopy = (event: ClipboardEvent) => {
      // 允许在可编辑元素上复制/剪切
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('copy', blockCopy);
    document.addEventListener('cut', blockCopy);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('cut', blockCopy);
    };
  }, []);

  // 定时刷新流量数据和连接数据
  useEffect(() => {
    let trafficInterval: NodeJS.Timeout | null = null;
    let connectionsInterval: NodeJS.Timeout | null = null;
    let nowInterval: NodeJS.Timeout | null = null;

    if (status.running) {
      // 全局时钟：用于连接/请求时长展示（避免页面内创建 interval 造成 HMR 叠加）
      tickNow();
      nowInterval = setInterval(() => {
        tickNow();
      }, 1000);

      // 流量数据每 1.5 秒刷新（降低频率以提升性能）
      fetchTraffic();
      trafficInterval = setInterval(() => {
        fetchTraffic();
      }, 1500);

      // 连接数据每 3 秒刷新
      fetchConnections();
      connectionsInterval = setInterval(() => {
        fetchConnections();
      }, 3000);
    }

    return () => {
      if (trafficInterval) {
        clearInterval(trafficInterval);
      }
      if (connectionsInterval) {
        clearInterval(connectionsInterval);
      }
      if (nowInterval) {
        clearInterval(nowInterval);
      }
    };
  }, [status.running, fetchTraffic, fetchConnections, tickNow]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(DRAG_IGNORE_SELECTOR)) {
      return;
    }
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        logger.warn('Failed to start dragging:', error);
      });
  };

  return (
    <div
      className="flex flex-col h-screen app-bg-gradient overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 shadow-2xl"
      onMouseDown={handleMouseDown}
    >
      <div className="app-bg-gradient-extra" />
      {/* 顶部栏 - 全宽 */}
      <Header />

      {/* 下方区域：侧边栏 + 内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-3 min-[960px]:p-4 scroll-smooth bg-transparent">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
