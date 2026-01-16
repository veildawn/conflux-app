import { Globe, Info, Power, ExternalLink, RefreshCw, Zap, Cpu } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { BentoCard, SettingItem, Divider, SectionHeader, CONTROL_BASE_CLASS } from '../components';

interface GeneralSectionProps {
  appVersion: string;
  coreVersion: string;
  autostart: boolean;
  onAutostartChange: (checked: boolean) => void;
  useJsdelivr: boolean;
  onUseJsdelivrChange: (checked: boolean) => void;
  updateStatus: 'idle' | 'checking' | 'available' | 'latest' | 'error';
  latestVersion: string;
  updateUrl: string;
  onCheckUpdate: () => void;
  // 核心升级相关
  coreUpdateStatus: 'idle' | 'upgrading' | 'success' | 'error';
  newCoreVersion: string;
  onUpgradeCore: () => void;
}

export function GeneralSection({
  appVersion,
  coreVersion,
  autostart,
  onAutostartChange,
  useJsdelivr,
  onUseJsdelivrChange,
  updateStatus,
  latestVersion,
  updateUrl,
  onCheckUpdate,
  coreUpdateStatus,
  newCoreVersion,
  onUpgradeCore,
}: GeneralSectionProps) {
  return (
    <div>
      <SectionHeader title="通用" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BentoCard className="md:col-span-2">
          <SettingItem
            icon={Globe}
            iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
            iconColor="text-emerald-500"
            title="界面语言"
            description="当前仅支持简体中文"
            action={
              <Select value="zh-CN" disabled>
                <SelectTrigger className={cn('w-28', CONTROL_BASE_CLASS)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <Divider />
          <SettingItem
            icon={Info}
            iconBgColor="bg-blue-50 dark:bg-blue-500/10"
            iconColor="text-blue-500"
            title="应用版本"
            description={`${appVersion || '...'}${latestVersion ? ` (最新: ${latestVersion})` : ''}`}
            action={
              <div className="flex items-center gap-2">
                {updateStatus === 'available' && updateUrl && (
                  <a
                    href={updateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-xs hover:underline mr-2"
                  >
                    下载更新
                  </a>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCheckUpdate}
                  disabled={updateStatus === 'checking'}
                  className="h-7 text-xs rounded-full px-3"
                >
                  {updateStatus === 'checking' ? (
                    <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                  ) : null}
                  {updateStatus === 'checking' ? '检查中' : '检查更新'}
                </Button>
              </div>
            }
          />
          <Divider />
          <SettingItem
            icon={Cpu}
            iconBgColor="bg-purple-50 dark:bg-purple-500/10"
            iconColor="text-purple-500"
            title="核心版本"
            description={`Mihomo ${coreVersion || '...'}${newCoreVersion && newCoreVersion !== coreVersion ? ` → ${newCoreVersion}` : ''}`}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={onUpgradeCore}
                disabled={coreUpdateStatus === 'upgrading' || coreVersion === '未运行'}
                className="h-7 text-xs rounded-full px-3"
              >
                {coreUpdateStatus === 'upgrading' ? (
                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                ) : null}
                {coreUpdateStatus === 'upgrading' ? '升级中' : '检查更新'}
              </Button>
            }
          />
          <Divider />
          <SettingItem
            icon={Power}
            iconBgColor="bg-green-50 dark:bg-green-500/10"
            iconColor="text-green-500"
            title="开机自启动"
            description="登录系统后自动启动应用"
            action={
              <Switch
                checked={autostart}
                onCheckedChange={onAutostartChange}
                className="scale-90"
              />
            }
          />
          <Divider />
          <SettingItem
            icon={Zap}
            iconBgColor="bg-amber-50 dark:bg-amber-500/10"
            iconColor="text-amber-500"
            title="JsDelivr 加速"
            description="使用 JsDelivr CDN 加速获取 GitHub 资源"
            action={
              <Switch
                checked={useJsdelivr}
                onCheckedChange={onUseJsdelivrChange}
                className="scale-90"
              />
            }
          />
          <Divider />
          <SettingItem
            icon={ExternalLink}
            iconBgColor="bg-gray-100 dark:bg-zinc-800"
            iconColor="text-gray-500"
            title="项目主页"
            description="访问 GitHub 获取最新源码"
            action={
              <Button variant="ghost" size="sm" asChild className="h-7 rounded-full text-xs">
                <a
                  href="https://github.com/veildawn/conflux-app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                  <ExternalLink className="w-3 h-3 ml-1.5" />
                </a>
              </Button>
            }
          />
        </BentoCard>
      </div>
    </div>
  );
}
