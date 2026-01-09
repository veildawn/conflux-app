import { useState, useEffect } from 'react';
import { Store, RefreshCw } from 'lucide-react';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

export default function SubStore() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{
    running: boolean;
    api_url: string;
    api_port: number;
  } | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;
    let isRunning = false;

    // 首次检查状态
    const checkInitialStatus = async () => {
      const result = await ipc.getSubStoreStatus().catch(() => null);
      if (result?.running) {
        setStatus(result);
        isRunning = true;
        return true;
      }
      return false;
    };

    // 组件挂载时检查状态（后端已在应用启动时自动启动 Sub-Store）
    const initSubStore = async () => {
      // 首次检查
      if (await checkInitialStatus()) {
        return;
      }

      // 轮询检查服务状态（等待后端启动完成）
      interval = setInterval(async () => {
        const result = await ipc.getSubStoreStatus().catch(() => null);
        if (result?.running) {
          setStatus(result);
          isRunning = true;
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
        }
      }, 1000); // 更频繁检查，1秒一次

      // 最多等待 30 秒
      timeout = setTimeout(() => {
        if (interval) clearInterval(interval);
        if (!isRunning) {
          toast({
            title: 'Sub-Store 启动超时',
            description: '服务启动时间过长,请检查日志或尝试重启应用',
            variant: 'destructive',
          });
        }
      }, 30000);
    };

    initSubStore();

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [toast]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!status.running) {
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
    <div className="-m-3 min-[960px]:-m-4 h-[calc(100vh-44px)] min-[960px]:h-[calc(100vh-48px)] bg-transparent">
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-zinc-900/95 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
            <p className="text-sm text-gray-600 dark:text-gray-400">加载 Sub-Store 中...</p>
          </div>
        </div>
      )}

      {/* iframe Container - 全屏显示 */}
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
        onLoad={handleIframeLoad}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
