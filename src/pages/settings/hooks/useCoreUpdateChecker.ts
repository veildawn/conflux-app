import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';
import logger from '@/utils/logger';

type CoreUpdateStatus = 'idle' | 'upgrading' | 'success' | 'error';

/**
 * mihomo 核心更新 Hook
 * 调用 mihomo /upgrade API 进行核心升级
 */
export function useCoreUpdateChecker(currentVersion: string) {
  const { toast } = useToast();
  const [coreUpdateStatus, setCoreUpdateStatus] = useState<CoreUpdateStatus>('idle');
  const [newCoreVersion, setNewCoreVersion] = useState<string>('');

  const upgradeCore = useCallback(async () => {
    if (!currentVersion || currentVersion === '未运行') {
      toast({
        title: '无法升级核心',
        description: '核心未运行，请先启动代理服务',
        variant: 'destructive',
      });
      return;
    }

    setCoreUpdateStatus('upgrading');
    toast({
      title: '正在检查更新',
      description: '请稍候...',
    });

    try {
      // 调用后端升级 API
      const newVersion = await ipc.upgradeCore();

      setNewCoreVersion(newVersion.version);
      setCoreUpdateStatus('success');

      // 比较版本号
      const oldVer = currentVersion.replace(/^v/i, '');
      const newVer = newVersion.version.replace(/^v/i, '');

      if (newVer !== oldVer) {
        toast({
          title: '核心升级成功',
          description: `已从 ${oldVer} 升级到 ${newVer}`,
        });
      } else {
        toast({
          title: '核心已是最新版本',
          description: `当前版本 ${newVer}`,
        });
      }
    } catch (error) {
      logger.error('Failed to upgrade core:', error);
      setCoreUpdateStatus('error');
      toast({
        title: '核心升级失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  }, [currentVersion, toast]);

  return {
    coreUpdateStatus,
    newCoreVersion,
    upgradeCore,
  };
}
