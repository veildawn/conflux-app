import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Globe, 
  FileText, 
  RefreshCw, 
  Trash2, 
  Clock,
  CheckCircle2,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Subscription } from '@/types/config';
import { cn } from '@/utils/cn';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';
import { useProxyStore } from '@/stores/proxyStore';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';

export default function SubscriptionPage() {
  const { toast } = useToast();
  const { settings, addSubscription, removeSubscription, updateSubscription } = useAppStore();
  const { fetchGroups, status } = useProxyStore();
  const subscriptions = useMemo(() => settings.subscriptions || [], [settings.subscriptions]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('remote');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');

  // 自动选择第一个订阅
  useEffect(() => {
    // 只有一个且未被选中时
    if (subscriptions.length === 1 && !subscriptions[0].selected) {
       updateSubscription(subscriptions[0].id, { selected: true });
    }
    // 如果有多个且都没有被选中，默认选中第一个
    else if (subscriptions.length > 0 && !subscriptions.some(s => s.selected)) {
       updateSubscription(subscriptions[0].id, { selected: true });
    }
  }, [subscriptions.length, subscriptions, updateSubscription]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: '配置文件',
          extensions: ['yaml', 'yml', 'json', 'conf']
        }]
      });
      
      if (selected) {
        setFilePath(selected as string);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleSave = async () => {
    let count = 0;
    
    if (activeTab === 'local' && filePath) {
      try {
        count = await invoke('parse_config_file', { path: filePath });
      } catch (err) {
        console.error('Failed to parse config file:', err);
        // You might want to show an error toast here
      }
    }

    const newSub: Subscription = {
      id: crypto.randomUUID(),
      name: name || (activeTab === 'remote' ? '新远程订阅' : '新本地订阅'),
      type: activeTab as 'remote' | 'local',
      url: activeTab === 'remote' ? url : filePath,
      updatedAt: new Date().toLocaleString(),
      count: count,
      selected: subscriptions.length === 0 // 如果是第一个订阅，默认选中
    };

    await addSubscription(newSub);
    setIsDialogOpen(false);
    resetForm();
  };

  const handleSelect = async (id: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    
    // 如果已经选中，不需要重新应用
    if (sub.selected) return;
    
    setApplyingId(id);
    
    try {
      // 应用订阅配置
      const result = await ipc.applySubscription(sub.url, sub.type);
      
      // 取消其他选中的订阅
      const currentSelected = subscriptions.find(s => s.selected);
      if (currentSelected && currentSelected.id !== id) {
        await updateSubscription(currentSelected.id, { selected: false });
      }
      
      // 选中当前订阅并更新节点数量
      await updateSubscription(id, { 
        selected: true,
        count: result.proxies_count,
        updatedAt: new Date().toLocaleString(),
      });

      // 如果代理正在运行，刷新代理组列表
      if (status.running) {
        await fetchGroups();
      }
      
      toast({
        title: '订阅已应用',
        description: `已加载 ${result.proxies_count} 个节点、${result.proxy_groups_count} 个代理组、${result.rules_count} 条规则`,
      });
    } catch (error) {
      console.error('Failed to apply subscription:', error);
      toast({
        title: '应用订阅失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  const resetForm = () => {
    setName('');
    setUrl('');
    setFilePath('');
    setActiveTab('remote');
  };

  const handleDelete = (id: string) => {
    removeSubscription(id);
  };

  // 刷新/更新订阅
  const handleRefresh = async (sub: Subscription) => {
    setApplyingId(sub.id);
    
    try {
      const result = await ipc.applySubscription(sub.url, sub.type);
      
      // 更新节点数量和时间
      await updateSubscription(sub.id, { 
        count: result.proxies_count,
        updatedAt: new Date().toLocaleString(),
      });

      // 如果代理正在运行且这是当前选中的订阅，刷新代理组列表
      if (status.running && sub.selected) {
        await fetchGroups();
      }
      
      toast({
        title: '订阅已更新',
        description: `已加载 ${result.proxies_count} 个节点、${result.proxy_groups_count} 个代理组、${result.rules_count} 条规则`,
      });
    } catch (error) {
      console.error('Failed to refresh subscription:', error);
      toast({
        title: '更新订阅失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">订阅管理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理您的远程订阅链接和本地配置文件
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" />
              添加订阅
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>添加新订阅</DialogTitle>
              <DialogDescription>
                支持 HTTP/HTTPS 远程链接或本地文件路径。
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="remote" value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="remote" className="gap-2">
                  <Globe className="w-4 h-4" />
                  远程链接
                </TabsTrigger>
                <TabsTrigger value="local" className="gap-2">
                  <FileText className="w-4 h-4" />
                  本地文件
                </TabsTrigger>
              </TabsList>
              
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">名称 (可选)</Label>
                  <Input 
                    id="name" 
                    placeholder="例如：公司节点" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <TabsContent value="remote" className="space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="url">订阅链接</Label>
                    <Input 
                      id="url" 
                      placeholder="https://example.com/subscribe/..." 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="local" className="space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="filepath">文件路径</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="filepath" 
                        placeholder="/path/to/config.yaml" 
                        value={filePath}
                        onChange={(e) => setFilePath(e.target.value)}
                      />
                      <Button variant="outline" className="shrink-0" onClick={handleBrowse}>
                        浏览...
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={activeTab === 'remote' ? !url : !filePath}>
                保存订阅
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-[960px]:gap-4">
        {subscriptions.map((sub) => {
          const isApplying = applyingId === sub.id;
          return (
          <Card 
            key={sub.id} 
            className={cn(
              "group relative overflow-hidden transition-all hover:shadow-md cursor-pointer border rounded-[24px]",
              sub.selected 
                ? "border-blue-500 dark:border-blue-500 bg-blue-50/30 dark:bg-blue-900/20" 
                : "border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800",
              isApplying && "opacity-70 pointer-events-none"
            )}
            onClick={() => handleSelect(sub.id)}
          >
             {isApplying && (
               <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-800/50 z-20">
                 <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
               </div>
             )}
             {sub.selected && !isApplying && (
               <div className="absolute top-0 right-0 p-1 bg-blue-500 text-white rounded-bl-2xl z-10">
                 <Check className="w-4 h-4" />
               </div>
             )}
             <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                   <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        sub.type === 'remote' 
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                      )}>
                        {sub.type === 'remote' ? <Globe className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-base line-clamp-1">{sub.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs font-normal rounded-md px-1.5 py-0">
                            {sub.type === 'remote' ? '远程' : '本地'}
                          </Badge>
                          {sub.selected && (
                            <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 text-xs font-normal h-5 px-1.5 rounded-md">
                              使用中
                            </Badge>
                          )}
                        </div>
                      </div>
                   </div>
                   <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-gray-400 hover:text-blue-500 rounded-lg" 
                        title="更新订阅"
                        onClick={() => handleRefresh(sub)}
                        disabled={isApplying}
                      >
                        <RefreshCw className={cn("w-4 h-4", isApplying && "animate-spin")} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-500 rounded-lg" title="删除" onClick={() => handleDelete(sub.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                   </div>
                </div>

                <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-3 border border-gray-100 dark:border-zinc-700/50">
                  <p className="text-xs text-gray-500 font-mono break-all line-clamp-2">
                    {sub.url}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1">
                   <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{sub.updatedAt}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span>{sub.count || 0} 节点</span>
                   </div>
                </div>
             </div>
          </Card>
        );
        })}
        
        {subscriptions.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-[24px] bg-gray-50/50 dark:bg-zinc-800/50">
            <Globe className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-medium">暂无订阅</p>
            <p className="text-sm mt-1">点击右上角添加您的第一个订阅</p>
          </div>
        )}
      </div>
    </div>
  );
}
