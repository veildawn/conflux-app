import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Database, 
  RefreshCw, 
  ArrowUpCircle,
  Download,
  FileBox,
  Map,
  Globe,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/utils/cn';
import { toast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

function BentoCard({ 
  className, 
  children, 
  title, 
  icon: Icon,
  iconColor = "text-gray-500",
  action 
}: { 
  className?: string; 
  children: React.ReactNode; 
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "bg-white dark:bg-zinc-900 rounded-[20px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
            {title && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------

interface FileStatus {
  exists: boolean;
  size: number | null;
  modified: string | null;
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function RuleDatabase() {
  const { 
    settings, 
    updateRuleDatabase, 
    ruleDatabaseUpdateStatus, 
    setRuleDatabaseUpdateStatus 
  } = useAppStore();
  const databases = useMemo(() => settings.ruleDatabases || [], [settings.ruleDatabases]);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  const checkFileStatus = useCallback(async () => {
    if (databases.length === 0) return;
    
    try {
      const fileNames = databases.map(db => db.fileName);
      const results = await ipc.checkResourceFiles(fileNames);
      
      const statusMap: Record<string, FileStatus> = {};
      results.forEach(result => {
        statusMap[result.fileName] = {
          exists: result.exists,
          size: result.size,
          modified: result.modified,
        };
      });
      setFileStatus(statusMap);
    } catch (error) {
      console.error('Failed to check file status:', error);
    }
  }, [databases]);

  // 手动触发检查所有资源的更新状态
  const handleCheckAllUpdates = useCallback(async () => {
    if (databases.length === 0) return;
    
    setCheckingAll(true);
    
    // 设置所有数据库为检查中状态
    databases.forEach(db => {
      setRuleDatabaseUpdateStatus(db.id, { hasUpdate: false, checking: true });
    });
    
    try {
      const requests = databases.map(db => ({
        url: db.url,
        currentEtag: db.etag,
        currentModified: db.remoteModified,
        updateSourceType: db.updateSourceType,
        githubRepo: db.githubRepo,
        assetName: db.assetName,
      }));
      
      const results = await ipc.checkResourceUpdates(requests);
      
      results.forEach((result, index) => {
        const db = databases[index];
        setRuleDatabaseUpdateStatus(db.id, {
          hasUpdate: result.hasUpdate,
          checking: false,
          error: result.error,
        });
      });
      
      const updateCount = results.filter(r => r.hasUpdate && !r.error).length;
      if (updateCount > 0) {
        toast({
          title: "发现更新",
          description: `${updateCount} 个数据库有新版本可用`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Failed to check updates:', error);
      databases.forEach(db => {
        setRuleDatabaseUpdateStatus(db.id, { hasUpdate: false, checking: false, error: '检查失败' });
      });
    } finally {
      setCheckingAll(false);
    }
  }, [databases, setRuleDatabaseUpdateStatus]);

  useEffect(() => {
    checkFileStatus();
  }, [checkFileStatus]);

  const formatFileSize = (bytes: number | null): string => {
    if (bytes === null) return '未知';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpdate = async (id: string, url: string, fileName: string, force = false) => {
    setUpdating(prev => ({ ...prev, [id]: true }));
    
    const database = databases.find(db => db.id === id);
    const currentEtag = database?.etag;
    const currentModified = database?.remoteModified;
    
    try {
      const result = await ipc.downloadResource(
        url, 
        fileName, 
        force ? undefined : currentEtag, 
        force ? undefined : currentModified,
        force,
        database?.updateSourceType,
        database?.githubRepo,
        database?.assetName
      );
      
      if (result.downloaded) {
        await updateRuleDatabase(id, {
          updatedAt: new Date().toLocaleString(),
          etag: result.etag,
          remoteModified: result.remoteModified,
        });
        
        setRuleDatabaseUpdateStatus(id, { hasUpdate: false, checking: false });
        
        await checkFileStatus();
        
        toast({
          title: "更新成功",
          description: `${fileName} 已下载至应用数据目录`,
          variant: "default",
        });
      } else {
        await updateRuleDatabase(id, {
          etag: result.etag,
          remoteModified: result.remoteModified,
        });
        
        setRuleDatabaseUpdateStatus(id, { hasUpdate: false, checking: false });
        
        toast({
          title: "已是最新",
          description: `${fileName} 无需更新`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Update failed:', error);
      toast({
        title: "更新失败",
        description: `无法下载 ${fileName}: ${error}`,
        variant: "destructive",
      });
    } finally {
      setUpdating(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleForceUpdate = async (id: string, url: string, fileName: string) => {
    await handleUpdate(id, url, fileName, true);
  };

  const handleUpdateAll = async () => {
    for (const database of databases) {
      await handleUpdate(database.id, database.url, database.fileName, false);
    }
  };

  const handleAutoUpdateToggle = async (id: string, checked: boolean) => {
    await updateRuleDatabase(id, { autoUpdate: checked });
    toast({
      title: checked ? "自动更新已开启" : "自动更新已关闭",
      description: checked ? "该数据库将自动保持最新" : "该数据库将不再自动更新",
    });
  };

  const updateCount = Object.values(ruleDatabaseUpdateStatus).filter(s => s.hasUpdate && !s.checking).length;

  const getIconForType = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.includes('geoip')) return Map;
    if (lower.includes('geosite')) return Globe;
    return FileBox;
  };

  const getIconColorClass = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.includes('geoip')) return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    if (lower.includes('geosite')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
  };

  return (
    <div className="space-y-6 pb-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            规则数据库
            {updateCount > 0 && (
              <span className="flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理 GeoIP、GeoSite 等地理位置和域名分类数据库
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCheckAllUpdates}
            disabled={checkingAll}
            className="rounded-full gap-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <RefreshCw className={cn("w-4 h-4", checkingAll && "animate-spin")} />
            检查更新
          </Button>
          <Button 
            size="sm" 
            onClick={handleUpdateAll}
            disabled={Object.values(updating).some(v => v)}
            className="rounded-full gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Download className="w-4 h-4" />
            全部更新
          </Button>
        </div>
      </div>

      <BentoCard className="p-0 overflow-hidden" title="">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_90px_90px_130px_100px] gap-4 px-6 py-3 border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">
          <div>数据库</div>
          <div>状态</div>
          <div className="hidden sm:block">大小</div>
          <div className="hidden md:block">更新时间</div>
          <div className="text-right">操作</div>
        </div>

        {databases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Database className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium text-gray-600 dark:text-gray-300">暂无规则数据库</p>
            <p className="text-sm mt-1">请检查配置文件或尝试重启应用</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
            {databases.map((database) => {
              const status = fileStatus[database.fileName];
              const fileExists = status?.exists ?? false;
              const dbUpdateStatus = ruleDatabaseUpdateStatus[database.id];
              const hasUpdate = dbUpdateStatus?.hasUpdate && !dbUpdateStatus?.checking;
              const isChecking = dbUpdateStatus?.checking;
              const isUpdating = updating[database.id];
              const Icon = getIconForType(database.fileName);
              
              return (
                <div 
                  key={database.id}
                  className="grid grid-cols-[1fr_90px_90px_130px_100px] gap-4 px-6 py-4 items-center hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  {/* Name & Icon */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      getIconColorClass(database.fileName)
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-gray-900 dark:text-white truncate" title={database.name}>
                        {database.name}
                      </span>
                      <span className="text-xs text-gray-500 truncate font-mono opacity-70" title={database.fileName}>
                        {database.fileName}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    {isChecking ? (
                      <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50 px-1.5 h-6">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </Badge>
                    ) : hasUpdate ? (
                      <Badge className="bg-blue-500 hover:bg-blue-600 border-transparent text-white animate-pulse px-1.5 h-6">
                        <ArrowUpCircle className="w-3 h-3 mr-1" />
                        更新
                      </Badge>
                    ) : !fileExists ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 px-1.5 h-6">
                        未安装
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 px-1.5 h-6">
                        已安装
                      </Badge>
                    )}
                  </div>

                  {/* Size */}
                  <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-mono text-xs">{fileExists && status ? formatFileSize(status.size) : '-'}</span>
                  </div>

                  {/* Updated At */}
                  <div className="hidden md:flex flex-col">
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      {database.updatedAt ? new Date(database.updatedAt).toLocaleDateString() : '-'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {database.updatedAt ? new Date(database.updatedAt).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  {/* Actions (Auto Update + Button) */}
                  <div className="flex items-center justify-end gap-3">
                    <div title="自动更新">
                        <Switch 
                          checked={database.autoUpdate}
                          onCheckedChange={(checked) => handleAutoUpdateToggle(database.id, checked)}
                          className="scale-75 data-[state=checked]:bg-blue-500"
                        />
                    </div>
                    <Button 
                      variant={hasUpdate ? "default" : "secondary"}
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all shrink-0",
                        hasUpdate 
                          ? "bg-blue-500 hover:bg-blue-600 text-white shadow-sm" 
                          : "bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 text-gray-600 dark:text-gray-300"
                      )}
                      onClick={() => handleUpdate(database.id, database.url, database.fileName, false)}
                      onDoubleClick={() => handleForceUpdate(database.id, database.url, database.fileName)}
                      disabled={isUpdating}
                      title={fileExists ? "检查更新（双击强制下载）" : "下载"}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BentoCard>
    </div>
  );
}
