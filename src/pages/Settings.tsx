import { Settings as SettingsIcon, Laptop, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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

        {/* Right Column: About */}
        <div className="space-y-4">
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
