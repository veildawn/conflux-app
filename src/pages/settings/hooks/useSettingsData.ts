import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';
import { useProxyStore } from '@/stores/proxyStore';
import logger from '@/utils/logger';
import type { DnsConfig, MihomoConfig } from '@/types/config';

/**
 * 解析 DNS 列表字符串
 */
export const parseDnsList = (value: string) =>
  value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * 设置数据管理 Hook
 */
export function useSettingsData() {
  const { toast } = useToast();
  const [config, setConfig] = useState<MihomoConfig | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [coreVersion, setCoreVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [useJsdelivr, setUseJsdelivr] = useState(false);

  const { status, fetchStatus, setAllowLan, setPorts, setIpv6, setTcpConcurrent } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      fetchStatus: state.fetchStatus,
      setAllowLan: state.setAllowLan,
      setPorts: state.setPorts,
      setIpv6: state.setIpv6,
      setTcpConcurrent: state.setTcpConcurrent,
    }))
  );

  const loadConfig = useCallback(async () => {
    try {
      const mihomoConfig = await ipc.getConfig();
      // 后端已负责填充默认值，直接使用
      setConfig(mihomoConfig);
      setLoading(false);
    } catch (error) {
      logger.error('Failed to load config:', error);
      toast({ title: '加载配置失败', description: String(error), variant: 'destructive' });
      setLoading(false);
    }
  }, [toast]);

  const loadVersions = useCallback(async () => {
    try {
      setAppVersion(await ipc.getAppVersion());
      try {
        setCoreVersion((await ipc.getCoreVersion()).version || '未运行');
      } catch {
        setCoreVersion('未运行');
      }
      try {
        setAutostart(await ipc.getAutostartEnabled());
      } catch {
        // Autostart not supported on this platform
      }
      // 加载应用设置获取 useJsdelivr
      try {
        const appSettings = await ipc.getAppSettings();
        setUseJsdelivr(appSettings.useJsdelivr ?? false);
      } catch {
        // 加载设置失败，使用默认值
      }
    } catch (error) {
      logger.error('Failed to load versions:', error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadConfig();
      await loadVersions();
      await fetchStatus();
    })();
  }, [fetchStatus, loadConfig, loadVersions]);

  const handleConfigChange = useCallback(
    async (updates: Partial<MihomoConfig>) => {
      if (!config) return;
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      try {
        await ipc.saveConfig(newConfig);
        toast({ title: '配置已保存' });
      } catch (error) {
        toast({ title: '保存失败', description: String(error), variant: 'destructive' });
        loadConfig();
      }
    },
    [config, toast, loadConfig]
  );

  const handleDnsConfigChange = useCallback(
    async (updates: Partial<DnsConfig>) => {
      if (!config) return;
      // config.dns 已经与默认值合并，直接更新即可
      const nextDns = { ...config.dns, ...updates };
      await handleConfigChange({ dns: nextDns });
    },
    [config, handleConfigChange]
  );

  const handleAutostartToggle = useCallback(
    async (checked: boolean) => {
      try {
        await ipc.setAutostartEnabled(checked);
        setAutostart(checked);
        toast({ title: checked ? '已启用开机自启动' : '已关闭开机自启动' });
      } catch (error) {
        toast({ title: '设置失败', description: String(error), variant: 'destructive' });
      }
    },
    [toast]
  );

  const handleUseJsdelivrToggle = useCallback(
    async (checked: boolean) => {
      try {
        const appSettings = await ipc.getAppSettings();
        await ipc.saveAppSettings({ ...appSettings, useJsdelivr: checked });
        setUseJsdelivr(checked);
        toast({ title: checked ? '已启用 JsDelivr 加速' : '已关闭 JsDelivr 加速' });
      } catch (error) {
        toast({ title: '设置失败', description: String(error), variant: 'destructive' });
      }
    },
    [toast]
  );

  return {
    config,
    setConfig,
    appVersion,
    coreVersion,
    loading,
    autostart,
    useJsdelivr,
    status,
    setAllowLan,
    setPorts,
    setIpv6,
    setTcpConcurrent,
    handleConfigChange,
    handleDnsConfigChange,
    handleAutostartToggle,
    handleUseJsdelivrToggle,
    toast,
  };
}
