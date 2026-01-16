import { useState, useEffect } from 'react';
import { Store, RefreshCw } from 'lucide-react';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

export default function SubStore() {
  const { toast } = useToast();
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let statusInterval: ReturnType<typeof setInterval> | null = null;
    let apiCheckInterval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      cancelled = true;
      if (statusInterval) clearInterval(statusInterval);
      if (apiCheckInterval) clearInterval(apiCheckInterval);
      if (timeout) clearTimeout(timeout);
    };

    // 检测 API 是否就绪
    const startApiReadyCheck = (url: string) => {
      const check = async () => {
        try {
          const res = await fetch(`${url}/api`, { signal: AbortSignal.timeout(2000) });
          if (!cancelled && res.ok) {
            setApiReady(true);
            if (apiCheckInterval) clearInterval(apiCheckInterval);
          }
        } catch {
          // API 未就绪
        }
      };
      check();
      apiCheckInterval = setInterval(check, 500);
    };

    const init = async () => {
      // 检查服务是否已运行
      const status = await ipc.getSubStoreStatus().catch(() => null);
      if (status?.running) {
        setApiUrl(status.api_url);
        startApiReadyCheck(status.api_url);
        return;
      }

      // 启动服务
      try {
        await ipc.startSubStore();
      } catch (error) {
        toast({ title: 'Sub-Store 启动失败', description: String(error), variant: 'destructive' });
        return;
      }

      // 轮询等待服务启动
      statusInterval = setInterval(async () => {
        const result = await ipc.getSubStoreStatus().catch(() => null);
        if (result?.running) {
          setApiUrl(result.api_url);
          startApiReadyCheck(result.api_url);
          if (statusInterval) clearInterval(statusInterval);
          if (timeout) clearTimeout(timeout);
        }
      }, 1000);

      // 30 秒超时
      timeout = setTimeout(() => {
        if (statusInterval) clearInterval(statusInterval);
        toast({
          title: 'Sub-Store 启动超时',
          description: '服务启动时间过长',
          variant: 'destructive',
        });
      }, 30000);
    };

    init();
    return cleanup;
  }, [toast]);

  // 统一的加载界面
  if (!apiUrl || !apiReady) {
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
        src={`${apiUrl}?api=${apiUrl}/api`}
        className="w-full h-full border-0"
        style={{ background: 'transparent', colorScheme: 'dark' }}
        title="Sub-Store"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
