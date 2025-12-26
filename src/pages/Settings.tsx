import { Settings as SettingsIcon, Moon, Sun, Monitor, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

export default function Settings() {
  const { settings, updateSettings } = useAppStore();
  const { toast } = useToast();

  const handleThemeChange = async (theme: string) => {
    try {
      await updateSettings({ theme: theme as 'light' | 'dark' | 'system' });
      toast({
        title: '主题已更新',
      });
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
      toast({
        title: '设置已保存',
      });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const cardClassName = "bg-white dark:bg-zinc-800 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-700";

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      <div>
        <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 tracking-tight">设置</h1>
      </div>

      <div className="space-y-4 max-w-3xl">
        {/* 外观设置 */}
        <Card className={cardClassName}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="w-5 h-5" />
              外观设置
            </CardTitle>
            <CardDescription>自定义应用的外观主题</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">主题模式</div>
                <div className="text-sm text-muted-foreground">
                  选择应用的颜色主题
                </div>
              </div>
              <Select value={settings.theme} onValueChange={handleThemeChange}>
                <SelectTrigger className="w-32">
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
            </div>
          </CardContent>
        </Card>

        {/* 通用设置 */}
        <Card className={cardClassName}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              通用设置
            </CardTitle>
            <CardDescription>配置应用的基本行为</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">开机自启动</div>
                <div className="text-sm text-muted-foreground">
                  系统启动时自动运行 Conflux
                </div>
              </div>
              <Switch
                checked={settings.autoStart}
                onCheckedChange={(checked) => handleSettingChange('autoStart', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">启动时最小化</div>
                <div className="text-sm text-muted-foreground">
                  应用启动后最小化到系统托盘
                </div>
              </div>
              <Switch
                checked={settings.startMinimized}
                onCheckedChange={(checked) => handleSettingChange('startMinimized', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">关闭时最小化到托盘</div>
                <div className="text-sm text-muted-foreground">
                  点击关闭按钮时最小化而不是退出
                </div>
              </div>
              <Switch
                checked={settings.closeToTray}
                onCheckedChange={(checked) => handleSettingChange('closeToTray', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 代理设置 */}
        <Card className={cardClassName}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              代理设置
            </CardTitle>
            <CardDescription>配置系统代理相关选项</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">自动设置系统代理</div>
                <div className="text-sm text-muted-foreground">
                  启动代理时自动配置系统代理
                </div>
              </div>
              <Switch
                checked={settings.systemProxy}
                onCheckedChange={(checked) => handleSettingChange('systemProxy', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 关于 */}
        <Card className={cardClassName}>
          <CardHeader>
            <CardTitle>关于</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">版本</span>
                <span>0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">框架</span>
                <span>Tauri 2 + React</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">代理核心</span>
                <span>MiHomo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
