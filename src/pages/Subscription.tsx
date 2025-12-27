import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Globe, 
  FileText, 
  RefreshCw, 
  Trash2, 
  Clock,
  Loader2,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

function BentoCard({ 
  className, 
  children, 
  title, 
  icon: Icon,
  iconColor = "text-gray-500",
  action,
  onClick
}: { 
  className?: string; 
  children: React.ReactNode; 
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div 
      className={cn(
        "bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800",
        className
      )}
      onClick={onClick}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center mb-4 z-10">
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
// Main Component
// -----------------------------------------------------------------------------

export default function SubscriptionPage() {
  const { toast } = useToast();
  const { settings, addSubscription, removeSubscription, updateSubscription } = useAppStore();
  const { fetchGroups, status } = useProxyStore();
  const subscriptions = useMemo(() => settings.subscriptions || [], [settings.subscriptions]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('remote');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');

  // 自动选择第一个订阅
  useEffect(() => {
    if (subscriptions.length === 1 && !subscriptions[0].selected) {
       updateSubscription(subscriptions[0].id, { selected: true });
    }
    else if (subscriptions.length > 0 && !subscriptions.some(s => s.selected)) {
       updateSubscription(subscriptions[0].id, { selected: true });
    }
  }, [subscriptions.length, subscriptions, updateSubscription]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        title: '选择配置文件',
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
      }
    }

    if (editingSubscription) {
      // 编辑模式
      const updates: Partial<Subscription> = {
        name: name || (activeTab === 'remote' ? '新远程订阅' : '新本地订阅'),
        type: activeTab as 'remote' | 'local',
        url: activeTab === 'remote' ? url : filePath,
      };
      
      if (updates.url !== editingSubscription.url) {
        updates.count = activeTab === 'local' ? count : 0;
      }

      await updateSubscription(editingSubscription.id, updates);
      
      toast({
        title: '订阅已更新',
        description: `订阅 "${updates.name}" 已保存`,
      });
    } else {
      // 新增模式
      const newSub: Subscription = {
        id: crypto.randomUUID(),
        name: name || (activeTab === 'remote' ? '新远程订阅' : '新本地订阅'),
        type: activeTab as 'remote' | 'local',
        url: activeTab === 'remote' ? url : filePath,
        updatedAt: new Date().toLocaleString(),
        count: count,
        selected: subscriptions.length === 0
      };

      await addSubscription(newSub);
      
      toast({
        title: '订阅已添加',
        description: `订阅 "${newSub.name}" 已创建`,
      });
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleSelect = async (id: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    if (sub.selected) return;
    
    setApplyingId(id);
    
    try {
      const result = await ipc.applySubscription(sub.url, sub.type);
      
      const currentSelected = subscriptions.find(s => s.selected);
      if (currentSelected && currentSelected.id !== id) {
        await updateSubscription(currentSelected.id, { selected: false });
      }
      
      await updateSubscription(id, { 
        selected: true,
        count: result.proxies_count,
        updatedAt: new Date().toLocaleString(),
      });

      if (status.running) {
        await fetchGroups();
      }
      
      toast({
        title: '订阅已应用',
        description: `已加载 ${result.proxies_count} 个节点`,
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
    setEditingSubscription(null);
  };

  const handleEdit = (sub: Subscription) => {
    setEditingSubscription(sub);
    setName(sub.name);
    setActiveTab(sub.type);
    if (sub.type === 'remote') {
      setUrl(sub.url);
      setFilePath('');
    } else {
      setFilePath(sub.url);
      setUrl('');
    }
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    removeSubscription(id);
  };

  const handleRefresh = async (sub: Subscription) => {
    setApplyingId(sub.id);
    
    try {
      const result = await ipc.applySubscription(sub.url, sub.type);
      
      await updateSubscription(sub.id, { 
        count: result.proxies_count,
        updatedAt: new Date().toLocaleString(),
      });

      if (status.running && sub.selected) {
        await fetchGroups();
      }
      
      toast({
        title: '订阅已更新',
        description: `已加载 ${result.proxies_count} 个节点`,
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
    <div className="space-y-6 pb-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">订阅管理</h1>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="rounded-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              添加订阅
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-[24px]">
            <DialogHeader>
              <DialogTitle>{editingSubscription ? '编辑订阅' : '添加新订阅'}</DialogTitle>
              <DialogDescription>
                {editingSubscription 
                  ? '修改订阅的名称和链接地址。'
                  : '支持 HTTP/HTTPS 远程链接或本地文件路径。'}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="remote" value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-100 dark:bg-zinc-800 rounded-full p-1 h-10">
                <TabsTrigger value="remote" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm">
                  <Globe className="w-4 h-4" />
                  远程链接
                </TabsTrigger>
                <TabsTrigger value="local" className="rounded-full gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm">
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
                    className="rounded-xl"
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
                      className="rounded-xl font-mono text-sm"
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
                        className="rounded-xl font-mono text-sm"
                      />
                      <Button variant="outline" className="shrink-0 rounded-xl" onClick={handleBrowse}>
                        浏览...
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">取消</Button>
              <Button onClick={handleSave} disabled={activeTab === 'remote' ? !url : !filePath} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                {editingSubscription ? '保存更改' : '保存订阅'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subscriptions.map((sub) => {
          const isApplying = applyingId === sub.id;
          return (
          <BentoCard 
            key={sub.id} 
            className={cn(
              "group relative",
              sub.selected 
                ? "border-blue-500 dark:border-blue-500 bg-blue-50/20 dark:bg-blue-900/10" 
                : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900",
              isApplying && "opacity-70 pointer-events-none"
            )}
            onClick={() => handleSelect(sub.id)}
            title={sub.type === 'remote' ? '远程订阅' : '本地配置'}
            icon={sub.type === 'remote' ? Globe : FileText}
            iconColor={sub.type === 'remote' ? "text-blue-500" : "text-orange-500"}
            action={
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" 
                  title="更新订阅"
                  onClick={() => handleRefresh(sub)}
                  disabled={isApplying}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isApplying && "animate-spin")} />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg" 
                  title="编辑订阅"
                  onClick={() => handleEdit(sub)}
                  disabled={isApplying}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" 
                  title="删除" 
                  onClick={() => handleDelete(sub.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            }
          >
             {isApplying && (
               <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-900/50 z-20 backdrop-blur-sm rounded-[20px]">
                 <div className="flex flex-col items-center gap-2">
                   <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                   <span className="text-xs font-medium text-blue-500">正在应用...</span>
                 </div>
               </div>
             )}
             
             {sub.selected && !isApplying && (
               <div className="absolute top-4 right-4 z-0">
                 <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
               </div>
             )}

             <div className="flex flex-col h-full justify-between gap-4">
                <div>
                   <h3 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-1 mb-1">{sub.name}</h3>
                   <div className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all line-clamp-2 leading-relaxed opacity-70">
                     {sub.url}
                   </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800/50">
                   <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{sub.updatedAt}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-md",
                        sub.selected 
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" 
                          : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400"
                      )}>
                        {sub.count || 0} 节点
                      </span>
                   </div>
                </div>
             </div>
          </BentoCard>
          );
        })}
        
        {subscriptions.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
            <Globe className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium text-gray-600 dark:text-gray-300">暂无订阅</p>
            <p className="text-sm mt-1 mb-6">点击右上角添加您的第一个订阅</p>
          </div>
        )}
      </div>
    </div>
  );
}
