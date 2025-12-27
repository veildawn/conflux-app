import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import Sidebar from './Sidebar';
import Header from './Header';
import { useProxyStore } from '@/stores/proxyStore';
import { useAppStore } from '@/stores/appStore';

export default function AppLayout() {
  const { fetchStatus, fetchTraffic, fetchConnections, start, status } = useProxyStore(
    useShallow((state) => ({
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

  return (
    <div 
      className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-950 overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 shadow-2xl"
      style={{ willChange: 'transform' }}
    >
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
