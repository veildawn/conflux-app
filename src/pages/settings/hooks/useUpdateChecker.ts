import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import logger from '@/utils/logger';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'error';

export function useUpdateChecker(appVersion: string) {
  const { toast } = useToast();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');

  const normalizeVersion = (value: string) => value.trim().replace(/^v/i, '');

  const compareVersions = (next: string, current: string) => {
    const nextParts = normalizeVersion(next)
      .split('.')
      .map((p) => parseInt(p, 10) || 0);
    const currentParts = normalizeVersion(current)
      .split('.')
      .map((p) => parseInt(p, 10) || 0);
    const maxLen = Math.max(nextParts.length, currentParts.length);
    for (let i = 0; i < maxLen; i++) {
      const diff = (nextParts[i] || 0) - (currentParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  const checkForUpdates = async () => {
    setUpdateStatus('checking');
    try {
      const response = await fetch(
        'https://api.github.com/repos/veildawn/conflux-app/releases/latest',
        {
          headers: { Accept: 'application/vnd.github+json' },
        }
      );

      // 404 表示没有发布任何 release，视为已是最新版本
      if (response.status === 404) {
        setUpdateStatus('latest');
        toast({
          title: '已是最新版本',
          description: '暂无可用的更新版本',
        });
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const tag = String(data.tag_name || data.name || '').trim();
      const latest = normalizeVersion(tag);
      const releaseUrl = String(
        data.html_url || 'https://github.com/veildawn/conflux-app/releases'
      );
      setLatestVersion(latest || tag);
      setUpdateUrl(releaseUrl);

      if (!latest) {
        setUpdateStatus('latest');
        toast({
          title: '已是最新版本',
          description: '暂无可用的更新版本',
        });
        return;
      }
      if (!appVersion) {
        setUpdateStatus('latest');
        return;
      }
      const hasUpdate = compareVersions(latest, appVersion) > 0;
      setUpdateStatus(hasUpdate ? 'available' : 'latest');
      toast({
        title: hasUpdate ? '发现新版本' : '已是最新版本',
        description: hasUpdate ? `最新版本 ${latest}` : `当前版本 ${normalizeVersion(appVersion)}`,
      });
    } catch (error) {
      logger.error('Failed to check updates:', error);
      setUpdateStatus('error');
      toast({ title: '检查更新失败', description: String(error), variant: 'destructive' });
    }
  };

  return {
    updateStatus,
    latestVersion,
    updateUrl,
    checkForUpdates,
  };
}
