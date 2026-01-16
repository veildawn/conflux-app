import {
  useSettingsData,
  usePortSettings,
  useUpdateChecker,
  useCoreUpdateChecker,
} from './settings/hooks';
import {
  GeneralSection,
  NetworkSection,
  DnsSection,
  WindowsServiceSection,
  DangerSection,
} from './settings/sections';

export default function Settings() {
  const {
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
    handleDnsConfigChange,
    handleAutostartToggle,
    handleUseJsdelivrToggle,
    refreshCoreVersion,
    toast,
  } = useSettingsData();

  const { httpPort, socksPort, handleHttpPortChange, handleSocksPortChange, handlePortBlur } =
    usePortSettings({ status, setPorts });

  const { updateStatus, latestVersion, updateUrl, checkForUpdates } = useUpdateChecker(appVersion);
  const { coreUpdateStatus, newCoreVersion, upgradeCore } = useCoreUpdateChecker(
    coreVersion,
    refreshCoreVersion
  );

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
          useJsdelivr={useJsdelivr}
          onUseJsdelivrChange={handleUseJsdelivrToggle}
          updateStatus={updateStatus}
          latestVersion={latestVersion}
          updateUrl={updateUrl}
          onCheckUpdate={checkForUpdates}
          coreUpdateStatus={coreUpdateStatus}
          newCoreVersion={newCoreVersion}
          onUpgradeCore={upgradeCore}
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
          onAllowLanToggle={(checked) =>
            setAllowLan(checked)
              .then(() => toast({ title: checked ? '局域网共享已启用' : '局域网共享已禁用' }))
              .catch((e) =>
                toast({ title: '设置失败', description: String(e), variant: 'destructive' })
              )
          }
          onIpv6Toggle={(checked) =>
            setIpv6(checked)
              .then(() => toast({ title: checked ? 'IPv6 已启用' : 'IPv6 已禁用' }))
              .catch((e) =>
                toast({ title: '设置失败', description: String(e), variant: 'destructive' })
              )
          }
          onTcpConcurrentToggle={(checked) =>
            setTcpConcurrent(checked)
              .then(() => toast({ title: checked ? 'TCP 并发已启用' : 'TCP 并发已禁用' }))
              .catch((e) =>
                toast({ title: '设置失败', description: String(e), variant: 'destructive' })
              )
          }
          toast={toast}
        />

        <DnsSection
          config={config}
          status={status}
          onDnsConfigChange={handleDnsConfigChange}
          toast={toast}
        />

        <WindowsServiceSection toast={toast} />

        <DangerSection toast={toast} />
      </div>
    </div>
  );
}
