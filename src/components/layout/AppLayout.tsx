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
  const { fetchSettings } = useAppStore();
  const initialized = useRef(false);

  useEffect(() => {
    // 初始化加载 - 仅执行一次
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      await fetchSettings();
      await fetchStatus();
      
      // 如果 mihomo 未运行，自动启动
      const currentStatus = useProxyStore.getState().status;
      if (!currentStatus.running) {
        try {
          await start();
          console.log('MiHomo started automatically');
        } catch (error) {
          console.error('Failed to auto-start MiHomo:', error);
        }
      }
    };

    init();
  }, [fetchSettings, fetchStatus, start]);

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
