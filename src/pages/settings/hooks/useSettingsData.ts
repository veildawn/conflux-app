import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';
import { useProxyStore } from '@/stores/proxyStore';
import logger from '@/utils/logger';
import type { DnsConfig, MihomoConfig } from '@/types/config';

/**
 * 默认 DNS 配置
 */
export const DEFAULT_DNS_CONFIG: DnsConfig = {
  enable: false,
  listen: '0.0.0.0:1053',
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.10.0.1/16',
  'fake-ip-filter-mode': 'blacklist',
  'fake-ip-filter': [
    '*.lan',
    '*.local',
    '*.localhost',
    '+.stun.*.*',
    '+.stun.*.*.*',
    'localhost.ptlogin2.qq.com',
    'dns.msftncsi.com',
    'www.msftncsi.com',
    'www.msftconnecttest.com',
  ],
  'default-nameserver': ['223.5.5.5', '119.29.29.29'],
  'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29'],
  nameserver: ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
  fallback: ['https://8.8.8.8'],
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
    geosite: ['gfw'],
    ipcidr: ['240.0.0.0/4', '0.0.0.0/32'],
  },
  'prefer-h3': false,
  'use-hosts': true,
  'use-system-hosts': true,
  'respect-rules': true,
  'cache-algorithm': 'arc',
};

/**
 * 将配置与默认值合并，确保所有字段都有值
 * 用户配置优先，缺失的字段使用默认值
 */
function mergeWithDefaults(config: MihomoConfig): MihomoConfig {
  // 后端已经负责填充默认值，前端不再进行深度合并，只处理可选字段的空值保护
  return {
    ...config,
    dns: config.dns || DEFAULT_DNS_CONFIG,
  };
}

/**
 * @deprecated 使用 DEFAULT_DNS_CONFIG 代替
 */
export const getDefaultDnsConfig = (): DnsConfig => ({ ...DEFAULT_DNS_CONFIG, enable: true });

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
      // 与默认值合并，确保所有字段都有值
      setConfig(mergeWithDefaults(mihomoConfig));
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

  return {
    config,
    setConfig,
    appVersion,
    coreVersion,
    loading,
    autostart,
    status,
    setAllowLan,
    setPorts,
    setIpv6,
    setTcpConcurrent,
    handleConfigChange,
    handleDnsConfigChange,
    handleAutostartToggle,
    toast,
  };
}
