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
import type { ProxyStatus } from '@/types/proxy';

const dragIgnoreSelector = [
  '[data-no-drag]',
  '.no-drag',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="listbox"]',
  '[contenteditable="true"]',
  '.cursor-pointer',
].join(', ');

export default function AppLayout() {
  const { applyStatus, fetchStatus, fetchTraffic, fetchConnections, start, status } = useProxyStore(
    useShallow((state) => ({
      applyStatus: state.applyStatus,
      fetchStatus: state.fetchStatus,
      fetchTraffic: state.fetchTraffic,
      fetchConnections: state.fetchConnections,
      start: state.start,
      status: state.status,
    }))
  );
  const { fetchSettings, checkRuleDatabaseUpdates } = useAppStore();
  const initStarted = useRef(false);

  useEffect(() => {
    // 防止重复初始化
    if (initStarted.current) {
      console.log('AppLayout: Init already started, skipping...');
      return;
    }
    initStarted.current = true;

    const init = async () => {
      console.log('AppLayout: Starting initialization...');
      try {
        await fetchSettings();
        console.log('AppLayout: Settings fetched');
        await fetchStatus();
        console.log('AppLayout: Status fetched');

        // 如果 mihomo 未运行，自动启动
        const currentStatus = useProxyStore.getState().status;
        console.log('AppLayout: Current status:', currentStatus);
        if (!currentStatus.running) {
          console.log('AppLayout: Starting MiHomo...');
          await start();
          console.log('MiHomo started automatically');
        } else {
          console.log('AppLayout: MiHomo already running');
        }

        // 应用启动时检查规则数据库更新（只检查一次）
        checkRuleDatabaseUpdates();
        console.log('AppLayout: Rule database update check initiated');
      } catch (error) {
        console.error('AppLayout: Init failed:', error);
      }
    };

    init();
  }, [fetchSettings, fetchStatus, start, checkRuleDatabaseUpdates]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<ProxyStatus>('proxy-status-changed', (event) => {
      applyStatus(event.payload);
    })
      .then((handler) => {
        unlisten = handler;
      })
      .catch((error) => {
        console.error('Failed to listen proxy status events:', error);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyStatus]);

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const blockCopy = (event: ClipboardEvent) => {
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

    if (status.running) {
      // 流量数据每秒刷新
      fetchTraffic();
      trafficInterval = setInterval(() => {
        fetchTraffic();
      }, 1000);

      // 连接数据每2秒刷新
      fetchConnections();
      connectionsInterval = setInterval(() => {
        fetchConnections();
      }, 2000);
    }

    return () => {
      if (trafficInterval) {
        clearInterval(trafficInterval);
      }
      if (connectionsInterval) {
        clearInterval(connectionsInterval);
      }
    };
  }, [status.running, fetchTraffic, fetchConnections]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(dragIgnoreSelector)) {
      return;
    }
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.warn('Failed to start dragging:', error);
      });
  };

  return (
    <div
      className="flex flex-col h-screen app-bg-gradient overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 shadow-2xl"
      style={{ willChange: 'transform' }}
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
