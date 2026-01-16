import { useState, useEffect, useCallback } from 'react';
import { Store, RefreshCw } from 'lucide-react';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

export default function SubStore() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    running: boolean;
    api_url: string;
    api_port: number;
  } | null>(null);
  // 后端 API 是否真正可用（可以加载 iframe）
  const [apiReady, setApiReady] = useState(false);

  // 检测 API 是否就绪的回调函数
  const checkApiReadyCallback = useCallback(
    async (apiUrl: string, onReady: () => void, signal: { cancelled: boolean }) => {
      try {
        const response = await fetch(`${apiUrl}/api`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (!signal.cancelled && response.ok) {
          onReady();
          return true;
        }
      } catch {
        // API 未就绪，继续等待
      }
      return false;
    },
    []
  );

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;
    let apiCheckInterval: NodeJS.Timeout | null = null;
    const signal = { cancelled: false };

    // 开始轮询检测 API 是否就绪
    const startApiReadyCheck = (apiUrl: string) => {
      const checkReady = () => checkApiReadyCallback(apiUrl, () => setApiReady(true), signal);

      // 立即检查一次
      checkReady();
      // 然后每 500ms 检查
      apiCheckInterval = setInterval(async () => {
        const ready = await checkReady();
        if (ready && apiCheckInterval) {
          clearInterval(apiCheckInterval);
        }
      }, 500);
    };

    // 首次检查状态
    const checkInitialStatus = async () => {
      const result = await ipc.getSubStoreStatus().catch(() => null);
      if (result?.running) {
        setStatus(result);
        startApiReadyCheck(result.api_url);
        return true;
      }
      return false;
    };

    // 组件挂载时检查状态，如果服务未运行则主动启动
    const initSubStore = async () => {
      // 首次检查，如果已运行则直接返回
      if (await checkInitialStatus()) {
        return;
      }

      // 服务未运行，主动启动 Sub-Store
      try {
        await ipc.startSubStore();
      } catch (error) {
        console.error('Failed to start Sub-Store:', error);
        toast({
          title: 'Sub-Store 启动失败',
          description: String(error),
          variant: 'destructive',
        });
        return;
      }

      // 轮询检查服务状态（等待启动完成）
      interval = setInterval(async () => {
        const result = await ipc.getSubStoreStatus().catch(() => null);
        if (result?.running) {
          setStatus(result);
          startApiReadyCheck(result.api_url);
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
        }
      }, 1000);

      // 最多等待 30 秒
      timeout = setTimeout(() => {
        if (interval) clearInterval(interval);
        toast({
          title: 'Sub-Store 启动超时',
          description: '服务启动时间过长,请检查日志或尝试重启应用',
          variant: 'destructive',
        });
      }, 30000);
    };

    initSubStore();

    return () => {
      signal.cancelled = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      if (apiCheckInterval) clearInterval(apiCheckInterval);
    };
  }, [toast, checkApiReadyCallback]);

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  // 服务未运行或 API 未就绪时显示加载界面
  if (!status.running || !apiReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Store className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sub-Store</h2>
        <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
          Sub-Store 服务正在启动中,请稍候...
        </p>
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">启动中</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-transparent">
      <iframe
        src={`${status.api_url}?api=${status.api_url}/api`}
        className="w-full h-full border-0"
        style={{
          background: 'transparent',
          colorScheme: 'dark',
          padding: 0,
          margin: 0,
          display: 'block',
        }}
        title="Sub-Store"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
