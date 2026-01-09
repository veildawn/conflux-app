import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  User,
  Lock,
  Loader2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WebDavConfig, SyncState, ConflictInfo, ConflictItem } from '@/types/config';

// 卡片组件
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'bg-white/95 dark:bg-zinc-900/95 rounded-[20px] shadow-sm border border-gray-100/50 dark:border-zinc-800/50 overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

// 设置项组件
function SettingItem({
  icon: Icon,
  iconBgColor = 'bg-gray-100 dark:bg-zinc-800',
  iconColor = 'text-gray-500',
  title,
  description,
  action,
}: {
  icon?: React.ElementType;
  iconBgColor?: string;
  iconColor?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              iconBgColor,
              iconColor
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
            {title}
          </span>
          {description && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[200px] md:max-w-[300px]">
              {description}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4 flex items-center gap-2">{action}</div>
    </div>
  );
}

// 分隔线
function Divider() {
  return <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />;
}

// 输入框样式
const INPUT_CLASS =
  'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-blue-500/50 h-8 text-sm shadow-none';

// 冲突项组件
function ConflictItemRow({
  item,
  onResolve,
}: {
  item: ConflictItem;
  onResolve: (path: string, choice: 'local' | 'remote') => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
            {item.path}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {item.conflictType}: 本地{item.localStatus}，远端{item.remoteStatus}
          </p>
        </div>
      </div>
      <div className="flex gap-1 shrink-0 ml-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onResolve(item.path, 'local')}
        >
          保留本地
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onResolve(item.path, 'remote')}
        >
          使用远端
        </Button>
      </div>
    </div>
  );
}

export default function Sync() {
  const { toast } = useToast();

  // WebDAV 配置
  const [config, setConfig] = useState<WebDavConfig>({
    enabled: false,
    url: '',
    username: '',
    password: '',
    autoUpload: false,
    lastSyncTime: undefined,
  });

  // UI 状态
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 冲突对话框
  const [conflictDialog, setConflictDialog] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  // 用于跟踪当前正在解决冲突的文件（可用于显示加载状态）

  const [, setResolvingFile] = useState<string | null>(null);

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const [webdavConfig, state] = await Promise.all([ipc.getWebDavConfig(), ipc.getSyncStatus()]);
      setConfig(webdavConfig);
      setSyncState(state);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 保存配置
  const saveConfig = async (newConfig: WebDavConfig) => {
    try {
      await ipc.saveWebDavConfig(newConfig);
      setConfig(newConfig);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: String(error),
      });
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!config.url || !config.username || !config.password) {
      toast({
        variant: 'destructive',
        title: '请填写完整',
        description: '请填写服务器地址、用户名和密码',
      });
      return;
    }

    setTesting(true);
    try {
      await ipc.testWebDavConnection(config);
      toast({
        title: '连接成功',
        description: 'WebDAV 服务器连接正常',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '连接失败',
        description: String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  // 增量同步
  const handleSync = async () => {
    if (!config.enabled) {
      toast({
        variant: 'destructive',
        title: '未启用',
        description: '请先启用 WebDAV 同步',
      });
      return;
    }

    setSyncing(true);
    try {
      const result = await ipc.webDavSync();
      if (result.hasConflict && result.conflictInfo) {
        setConflictInfo(result.conflictInfo);
        setConflictDialog(true);
      } else if (result.success) {
        toast({
          title: '同步完成',
          description: result.message,
        });
        // 刷新状态
        const state = await ipc.getSyncStatus();
        setSyncState(state);
      } else {
        toast({
          variant: 'destructive',
          title: '同步失败',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '同步失败',
        description: String(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  // 强制上传（全量）
  const handleForceUpload = async () => {
    if (!config.enabled) {
      toast({
        variant: 'destructive',
        title: '未启用',
        description: '请先启用 WebDAV 同步',
      });
      return;
    }

    setSyncing(true);
    try {
      const result = await ipc.webDavUpload();
      if (result.success) {
        toast({
          title: '上传成功',
          description: result.message,
        });
        const state = await ipc.getSyncStatus();
        setSyncState(state);
      } else {
        toast({
          variant: 'destructive',
          title: '上传失败',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '上传失败',
        description: String(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  // 强制下载（全量）
  const handleForceDownload = async () => {
    if (!config.enabled) {
      toast({
        variant: 'destructive',
        title: '未启用',
        description: '请先启用 WebDAV 同步',
      });
      return;
    }

    setSyncing(true);
    try {
      const result = await ipc.webDavDownload(true);
      if (result.success) {
        toast({
          title: '下载成功',
          description: '配置已下载，请前往「配置管理」激活配置以应用更改',
        });
        const state = await ipc.getSyncStatus();
        setSyncState(state);
      } else {
        toast({
          variant: 'destructive',
          title: '下载失败',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '下载失败',
        description: String(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  // 重置同步状态
  const handleResetSyncState = async () => {
    try {
      await ipc.clearSyncStatus();
      setSyncState(null);
      toast({
        title: '已重置',
        description: '同步状态已清除，可以重新开始同步',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '重置失败',
        description: String(error),
      });
    }
  };

  // 解决单个文件冲突
  const handleResolveFileConflict = async (path: string, choice: 'local' | 'remote') => {
    setResolvingFile(path);
    try {
      await ipc.resolveFileConflict(path, choice);
      // 从冲突列表中移除
      if (conflictInfo) {
        const newConflictItems = (conflictInfo.conflictItems || []).filter((c) => c.path !== path);
        const newConflictFiles = conflictInfo.conflictingFiles.filter((f) => f !== path);
        if (newConflictItems.length === 0) {
          // 所有冲突已解决，关闭对话框并执行同步
          setConflictDialog(false);
          setConflictInfo(null);
          // 重新同步
          handleSync();
        } else {
          setConflictInfo({
            ...conflictInfo,
            conflictItems: newConflictItems,
            conflictingFiles: newConflictFiles,
          });
        }
      }
      toast({
        title: '已解决',
        description: `${path}: ${choice === 'local' ? '保留本地版本' : '使用远端版本'}`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '解决冲突失败',
        description: String(error),
      });
    } finally {
      setResolvingFile(null);
    }
  };

  // 解决所有冲突
  const handleResolveAllConflicts = async (choice: 'local' | 'remote') => {
    setConflictDialog(false);
    setSyncing(true);
    try {
      const result = await ipc.resolveWebDavConflict(choice);
      if (result.success) {
        toast({
          title: choice === 'local' ? '已保留本地配置' : '已使用远端配置',
          description: result.message,
        });
        const state = await ipc.getSyncStatus();
        setSyncState(state);
      } else {
        toast({
          variant: 'destructive',
          title: '操作失败',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '操作失败',
        description: String(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  // 格式化时间
  const formatTime = (isoString?: string) => {
    if (!isoString) return '从未同步';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

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
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">同步</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            通过云端同步配置到多个设备
          </p>
        </div>

        {/* WebDAV 配置卡片 */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 px-1 mb-3 uppercase tracking-wider">
            WebDAV
          </h2>
          <Card>
            {/* 启用开关 */}
            <SettingItem
              icon={Cloud}
              iconBgColor="bg-blue-50 dark:bg-blue-500/10"
              iconColor="text-blue-500"
              title="启用 WebDAV 同步"
              description="将配置文件同步到 WebDAV 服务器"
              action={
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => {
                    const newConfig = { ...config, enabled: checked };
                    saveConfig(newConfig);
                  }}
                  className="scale-90"
                />
              }
            />
            <Divider />

            {/* 服务器地址 */}
            <SettingItem
              icon={Server}
              iconBgColor="bg-gray-100 dark:bg-zinc-800"
              iconColor="text-gray-500"
              title="服务器地址"
              description="WebDAV 服务器 URL"
              action={
                <Input
                  type="url"
                  placeholder="https://dav.example.com/path"
                  value={config.url}
                  onChange={(e) => {
                    const newConfig = { ...config, url: e.target.value };
                    setConfig(newConfig);
                  }}
                  onBlur={(e) => {
                    const newConfig = { ...config, url: e.target.value };
                    saveConfig(newConfig);
                  }}
                  className={cn(INPUT_CLASS, 'w-64')}
                />
              }
            />
            <Divider />

            {/* 用户名 */}
            <SettingItem
              icon={User}
              iconBgColor="bg-gray-100 dark:bg-zinc-800"
              iconColor="text-gray-500"
              title="用户名"
              action={
                <Input
                  type="text"
                  placeholder="username"
                  value={config.username}
                  onChange={(e) => {
                    const newConfig = { ...config, username: e.target.value };
                    setConfig(newConfig);
                  }}
                  onBlur={(e) => {
                    const newConfig = { ...config, username: e.target.value };
                    saveConfig(newConfig);
                  }}
                  className={cn(INPUT_CLASS, 'w-48')}
                />
              }
            />
            <Divider />

            {/* 密码 */}
            <SettingItem
              icon={Lock}
              iconBgColor="bg-gray-100 dark:bg-zinc-800"
              iconColor="text-gray-500"
              title="密码"
              action={
                <div className="flex items-center gap-2">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={config.password}
                    onChange={(e) => {
                      const newConfig = { ...config, password: e.target.value };
                      setConfig(newConfig);
                    }}
                    onBlur={(e) => {
                      const newConfig = { ...config, password: e.target.value };
                      saveConfig(newConfig);
                    }}
                    className={cn(INPUT_CLASS, 'w-48')}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              }
            />
            <Divider />

            {/* 测试连接 */}
            <div className="px-5 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !config.url || !config.username || !config.password}
                className="h-8 text-xs"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1.5" />
                    测试连接
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* 同步设置卡片 */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 px-1 mb-3 uppercase tracking-wider">
            同步设置
          </h2>
          <Card>
            <SettingItem
              icon={CloudUpload}
              iconBgColor="bg-green-50 dark:bg-green-500/10"
              iconColor="text-green-500"
              title="自动上传"
              description="配置变更后自动上传到云端"
              action={
                <Switch
                  checked={config.autoUpload}
                  onCheckedChange={(checked) => {
                    const newConfig = { ...config, autoUpload: checked };
                    saveConfig(newConfig);
                  }}
                  disabled={!config.enabled}
                  className="scale-90"
                />
              }
            />
          </Card>
        </div>

        {/* 同步状态与操作卡片 */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 px-1 mb-3 uppercase tracking-wider">
            同步操作
          </h2>
          <Card>
            {/* 同步状态 */}
            <SettingItem
              icon={syncState?.lastSyncTime ? Check : AlertCircle}
              iconBgColor={
                syncState?.lastSyncTime
                  ? 'bg-green-50 dark:bg-green-500/10'
                  : 'bg-gray-100 dark:bg-zinc-800'
              }
              iconColor={syncState?.lastSyncTime ? 'text-green-500' : 'text-gray-400'}
              title="上次同步"
              description={formatTime(syncState?.lastSyncTime)}
            />
            <Divider />

            {/* 主要同步按钮 */}
            <div className="px-5 py-4">
              <Button
                onClick={handleSync}
                disabled={syncing || !config.enabled}
                className="h-9 px-4"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    立即同步
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                智能检测变化，只同步有改动的文件
              </p>
            </div>
            <Divider />

            {/* 高级操作 */}
            <div className="px-5 py-3">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showAdvanced ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                高级操作
              </button>
              {showAdvanced && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleForceUpload}
                    disabled={syncing || !config.enabled}
                    className="h-7 text-xs"
                  >
                    <CloudUpload className="w-3 h-3 mr-1" />
                    强制上传
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleForceDownload}
                    disabled={syncing || !config.enabled}
                    className="h-7 text-xs"
                  >
                    <CloudDownload className="w-3 h-3 mr-1" />
                    强制下载
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetSyncState}
                    disabled={syncing}
                    className="h-7 text-xs text-orange-500 hover:text-orange-600"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    重置状态
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 提示信息 */}
        <div className="text-xs text-gray-400 dark:text-gray-500 px-1 space-y-1">
          <p>• 同步内容包括：配置文件、策略组、规则、应用设置</p>
          <p>• 建议使用支持 WebDAV 的网盘服务（如坚果云、Nextcloud 等）</p>
          <p>• 智能同步只传输有变化的文件，效率更高</p>
        </div>
      </div>

      {/* 冲突解决对话框 */}
      <Dialog open={conflictDialog} onOpenChange={setConflictDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>检测到配置冲突</DialogTitle>
            <DialogDescription>
              以下文件在本地和远端都有修改，请选择保留哪个版本：
            </DialogDescription>
          </DialogHeader>

          {/* 冲突文件列表 */}
          {conflictInfo && (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {(conflictInfo.conflictItems || []).map((item) => (
                <ConflictItemRow
                  key={item.path}
                  item={item}
                  onResolve={handleResolveFileConflict}
                />
              ))}
              {/* 兼容旧格式 */}
              {(!conflictInfo.conflictItems || conflictInfo.conflictItems.length === 0) &&
                conflictInfo.conflictingFiles.map((path) => (
                  <ConflictItemRow
                    key={path}
                    item={{
                      path,
                      conflictType: '冲突',
                      localStatus: '已修改',
                      remoteStatus: '已修改',
                    }}
                    onResolve={handleResolveFileConflict}
                  />
                ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setConflictDialog(false)}>
              取消
            </Button>
            <Button variant="outline" onClick={() => handleResolveAllConflicts('local')}>
              <CloudUpload className="w-4 h-4 mr-2" />
              全部保留本地
            </Button>
            <Button onClick={() => handleResolveAllConflicts('remote')}>
              <CloudDownload className="w-4 h-4 mr-2" />
              全部使用远端
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
