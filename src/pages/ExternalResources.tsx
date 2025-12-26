import { useState } from 'react';
import { 
  Database, 
  RefreshCw, 
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/utils/cn';
import { toast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';

export default function ExternalResources() {
  const { settings, updateExternalResource } = useAppStore();
  const resources = settings.externalResources || [];
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  const handleUpdate = async (id: string, url: string, fileName: string) => {
    setUpdating(prev => ({ ...prev, [id]: true }));
    
    try {
      await ipc.downloadResource(url, fileName);
      
      // Update the timestamp
      await updateExternalResource(id, {
        updatedAt: new Date().toLocaleString()
      });
      
      toast({
        title: "更新成功",
        description: `${fileName} 已下载至应用数据目录`,
        variant: "default",
      });
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

  const handleAutoUpdateToggle = async (id: string, checked: boolean) => {
    await updateExternalResource(id, { autoUpdate: checked });
    toast({
      title: checked ? "自动更新已开启" : "自动更新已关闭",
      description: checked ? "该资源将自动保持最新" : "该资源将不再自动更新",
    });
  };

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">外部资源</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理 GeoIP、GeoSite 等核心规则数据库文件
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-[960px]:gap-4">
        {resources.map((resource) => (
          <Card 
            key={resource.id} 
            className="group relative overflow-hidden transition-all hover:shadow-md border rounded-[24px] border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800"
          >
             <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-sm">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base line-clamp-1">{resource.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs font-normal rounded-md px-1.5 py-0">
                            {resource.fileName}
                          </Badge>
                        </div>
                      </div>
                   </div>
                   <div className="flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={cn(
                          "h-8 w-8 text-gray-400 hover:text-blue-500 rounded-lg",
                          updating[resource.id] && "text-blue-500"
                        )}
                        title="更新"
                        onClick={() => handleUpdate(resource.id, resource.url, resource.fileName)}
                        disabled={updating[resource.id]}
                      >
                        <RefreshCw className={cn("w-4 h-4", updating[resource.id] && "animate-spin")} />
                      </Button>
                   </div>
                </div>

                <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-3 border border-gray-100 dark:border-zinc-700/50">
                  <p className="text-xs text-gray-500 font-mono break-all line-clamp-2">
                    {resource.url}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1">
                   <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{resource.updatedAt || '从未更新'}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">自动更新</span>
                      <Switch 
                        checked={resource.autoUpdate}
                        onCheckedChange={(checked) => handleAutoUpdateToggle(resource.id, checked)}
                      />
                   </div>
                </div>
             </div>
          </Card>
        ))}
        
        {resources.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-[24px] bg-gray-50/50 dark:bg-zinc-800/50">
            <Database className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-medium">暂无外部资源</p>
            <p className="text-sm mt-1">请检查配置文件或尝试重启应用</p>
          </div>
        )}
      </div>
    </div>
  );
}
