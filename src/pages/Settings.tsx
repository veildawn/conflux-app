import { Settings as SettingsIcon, Moon, Sun, Monitor, Globe, Laptop, Shield, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';

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
      "bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
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
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

function SettingItem({ 
  icon: Icon,
  iconColor = "text-gray-500", 
  title, 
  description, 
  action,
  className
}: { 
  icon?: React.ElementType;
  iconColor?: string;
  title: string; 
  description?: string; 
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors", className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800", iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</div>
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </div>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings } = useAppStore();
  const { toast } = useToast();

  const handleThemeChange = async (theme: string) => {
    try {
      await updateSettings({ theme: theme as 'light' | 'dark' | 'system' });
      toast({ title: '主题已更新' });
    } catch (error) {
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleSettingChange = async (key: keyof typeof settings, value: boolean) => {
    try {
      await updateSettings({ [key]: value });
      toast({ title: '设置已保存' });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 pb-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">设置</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl items-start">
        {/* Left Column: General Settings (Merged) */}
        <div className="space-y-4">
          <BentoCard title="通用设置" icon={SettingsIcon} iconColor="text-gray-500">
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              <SettingItem
                icon={Laptop}
                iconColor="text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                title="开机自启动"
                description="系统启动时自动运行"
                action={
                  <Switch
                    checked={settings.autoStart}
                    onCheckedChange={(checked) => handleSettingChange('autoStart', checked)}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                }
              />
              <SettingItem
                icon={Monitor}
                iconColor="text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                title="启动时最小化"
                description="启动后最小化到系统托盘"
                action={
                  <Switch
                    checked={settings.startMinimized}
                    onCheckedChange={(checked) => handleSettingChange('startMinimized', checked)}
                    className="data-[state=checked]:bg-indigo-500"
                  />
                }
              />
              <SettingItem
                icon={SettingsIcon}
                iconColor="text-gray-500 bg-gray-50 dark:bg-gray-500/10"
                title="关闭时最小化"
                description="点击关闭时最小化而不是退出"
                action={
                  <Switch
                    checked={settings.closeToTray}
                    onCheckedChange={(checked) => handleSettingChange('closeToTray', checked)}
                    className="data-[state=checked]:bg-gray-500"
                  />
                }
              />
            </div>
          </BentoCard>
        </div>

        {/* Right Column: Appearance & About */}
        <div className="space-y-4">
          <BentoCard title="外观" icon={Moon} iconColor="text-purple-500">
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              <SettingItem
                icon={Sun}
                iconColor="text-orange-500 bg-orange-50 dark:bg-orange-500/10"
                title="主题模式"
                description="选择应用的颜色主题"
                action={
                  <Select value={settings.theme} onValueChange={handleThemeChange}>
                    <SelectTrigger className="w-[140px] h-9 rounded-xl border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          <span>亮色</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          <span>暗色</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4" />
                          <span>跟随系统</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </div>
          </BentoCard>

          <BentoCard title="关于" icon={Info} iconColor="text-gray-400">
             <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              <SettingItem
                title="当前版本"
                action={<span className="text-sm font-mono font-medium text-gray-500">0.1.0</span>}
              />
             </div>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
