import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Shield,
  Play,
  Square,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { BentoCard, SectionHeader } from '../components';
import { ipc } from '@/services/ipc';

interface ServiceStatus {
  installed: boolean;
  running: boolean;
  mihomo_running: boolean;
  mihomo_pid: number | null;
}

interface WindowsServiceSectionProps {
  toast: (options: { title: string; description?: string; variant?: 'destructive' }) => void;
}

export function WindowsServiceSection({ toast }: WindowsServiceSectionProps) {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    installed: false,
    running: false,
    mihomo_running: false,
    mihomo_pid: null,
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 检查平台是否为 Windows
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      const platform = navigator.platform.toLowerCase();
      setIsWindows(platform.includes('win'));
    };
    checkPlatform();
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!isWindows) return;

    setLoading(true);
    try {
      const status = await ipc.getServiceStatus();
      setServiceStatus(status);
    } catch (error) {
      console.error('Failed to get service status:', error);
    } finally {
      setLoading(false);
    }
  }, [isWindows]);

  // 轮询等待状态变化
  const waitForStatusChange = useCallback(
    async (expectedRunning: boolean, maxAttempts: number = 10): Promise<boolean> => {
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const status = await ipc.getServiceStatus();
          setServiceStatus(status);
          if (status.running === expectedRunning) {
            return true;
          }
        } catch (error) {
          console.error('Failed to get service status:', error);
        }
      }
      return false;
    },
    []
  );

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // 轮询等待安装状态变化
  const waitForInstallChange = useCallback(
    async (expectedInstalled: boolean, maxAttempts: number = 15): Promise<boolean> => {
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const status = await ipc.getServiceStatus();
          setServiceStatus(status);
          if (status.installed === expectedInstalled) {
            return true;
          }
        } catch (error) {
          console.error('Failed to get service status:', error);
        }
      }
      return false;
    },
    []
  );

  const handleInstall = async () => {
    setActionLoading('install');
    try {
      await ipc.installService();
      // 轮询等待服务真正安装并启动
      const success = await waitForInstallChange(true);
      if (success) {
        toast({ title: '服务安装成功', description: '现在可以使用服务模式运行 TUN' });
      } else {
        toast({ title: '服务安装中', description: '状态更新可能有延迟' });
        await refreshStatus();
      }
    } catch (error) {
      toast({ title: '安装失败', description: String(error), variant: 'destructive' });
      await refreshStatus();
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async () => {
    setActionLoading('uninstall');
    try {
      await ipc.uninstallService();
      // 轮询等待服务真正卸载
      const success = await waitForInstallChange(false);
      if (success) {
        toast({ title: '服务已卸载' });
      } else {
        toast({ title: '服务卸载中', description: '状态更新可能有延迟' });
        await refreshStatus();
      }
    } catch (error) {
      toast({ title: '卸载失败', description: String(error), variant: 'destructive' });
      await refreshStatus();
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async () => {
    setActionLoading('start');
    try {
      await ipc.startService();
      // 轮询等待服务真正启动
      const success = await waitForStatusChange(true);
      if (success) {
        toast({ title: '服务已启动' });
      } else {
        toast({ title: '服务启动中', description: '状态更新可能有延迟' });
        await refreshStatus();
      }
    } catch (error) {
      toast({ title: '启动失败', description: String(error), variant: 'destructive' });
      await refreshStatus();
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    setActionLoading('stop');
    try {
      await ipc.stopService();
      // 轮询等待服务真正停止
      const success = await waitForStatusChange(false);
      if (success) {
        toast({ title: '服务已停止' });
      } else {
        toast({ title: '服务停止中', description: '状态更新可能有延迟' });
        await refreshStatus();
      }
    } catch (error) {
      toast({ title: '停止失败', description: String(error), variant: 'destructive' });
      await refreshStatus();
    } finally {
      setActionLoading(null);
    }
  };

  // 非 Windows 平台不显示
  if (!isWindows) {
    return null;
  }

  const getStatusInfo = () => {
    if (!serviceStatus.installed) {
      return { color: 'bg-gray-400', text: '服务未安装', icon: AlertCircle };
    }
    if (!serviceStatus.running) {
      return { color: 'bg-yellow-500', text: '服务已停止', icon: AlertCircle };
    }
    if (serviceStatus.mihomo_running) {
      return {
        color: 'bg-green-500',
        text: `服务运行中 (PID: ${serviceStatus.mihomo_pid})`,
        icon: CheckCircle2,
      };
    }
    return { color: 'bg-blue-500', text: '服务运行中', icon: CheckCircle2 };
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div>
      <SectionHeader title="Windows 服务模式" />
      <BentoCard
        title="TUN 服务"
        description="安装后台服务以管理员权限运行代理核心，启用 TUN 模式时无需每次确认 UAC"
        icon={Server}
        iconColor="text-blue-500"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshStatus}
            disabled={loading}
            className="h-7 px-2"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        }
      >
        <div className="p-5 pt-2 space-y-4">
          {/* 状态显示 */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className={cn('w-2.5 h-2.5 rounded-full', statusInfo.color)} />
            <StatusIcon
              className={cn(
                'w-4 h-4',
                serviceStatus.installed && serviceStatus.running
                  ? 'text-green-500'
                  : 'text-gray-400'
              )}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {statusInfo.text}
            </span>
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2">
            {!serviceStatus.installed ? (
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={actionLoading !== null}
                className="h-8 gap-1.5"
              >
                {actionLoading === 'install' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                安装服务
              </Button>
            ) : (
              <>
                {serviceStatus.running ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStop}
                    disabled={actionLoading !== null}
                    className="h-8 gap-1.5"
                  >
                    {actionLoading === 'stop' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    停止服务
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={actionLoading !== null}
                    className="h-8 gap-1.5"
                  >
                    {actionLoading === 'start' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    启动服务
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUninstall}
                  disabled={actionLoading !== null}
                  className="h-8 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {actionLoading === 'uninstall' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  卸载
                </Button>
              </>
            )}
          </div>

          {/* 提示信息 */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {!serviceStatus.installed && (
              <p className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                安装服务需要管理员权限，会弹出 UAC 提示
              </p>
            )}
            {serviceStatus.installed && serviceStatus.running && (
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                开启 TUN 模式时将自动使用服务模式
              </p>
            )}
            {serviceStatus.installed && !serviceStatus.running && (
              <p className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                启动服务后，TUN 模式将不再需要 UAC 确认
              </p>
            )}
          </div>
        </div>
      </BentoCard>
    </div>
  );
}
