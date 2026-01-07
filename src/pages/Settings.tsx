import { useSettingsData, usePortSettings, useUpdateChecker } from './settings/hooks';
import { GeneralSection, NetworkSection, DnsSection } from './settings/sections';

export default function Settings() {
  const {
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
    handleDnsConfigChange,
    handleAutostartToggle,
    toast,
  } = useSettingsData();

  const { httpPort, socksPort, handleHttpPortChange, handleSocksPortChange, handlePortBlur } =
    usePortSettings({ status, setPorts });

  const { updateStatus, latestVersion, updateUrl, checkForUpdates } = useUpdateChecker(appVersion);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50 dark:bg-black/20 scroll-smooth">
      <div className="max-w-4xl mx-auto p-6 space-y-6 pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">设置</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理核心服务、网络连接与系统参数
          </p>
        </div>

        <GeneralSection
          appVersion={appVersion}
          coreVersion={coreVersion}
          autostart={autostart}
          onAutostartChange={handleAutostartToggle}
          updateStatus={updateStatus}
          latestVersion={latestVersion}
          updateUrl={updateUrl}
          onCheckUpdate={checkForUpdates}
        />

        <NetworkSection
          config={config}
          setConfig={setConfig}
          status={status}
          httpPort={httpPort}
          socksPort={socksPort}
          onHttpPortChange={handleHttpPortChange}
          onSocksPortChange={handleSocksPortChange}
          onPortBlur={handlePortBlur}
          onAllowLanToggle={(checked) => setAllowLan(checked).catch(() => {})}
          onIpv6Toggle={(checked) => setIpv6(checked).catch(() => {})}
          onTcpConcurrentToggle={(checked) => setTcpConcurrent(checked).catch(() => {})}
          toast={toast}
        />

        <DnsSection
          config={config}
          status={status}
          onDnsConfigChange={handleDnsConfigChange}
          toast={toast}
        />
      </div>
    </div>
  );
}
