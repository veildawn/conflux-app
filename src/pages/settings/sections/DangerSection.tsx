import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BentoCard, SettingItem, SectionHeader } from '../components';
import { ipc } from '@/services/ipc';

interface DangerSectionProps {
  toast: (options: { title: string; description?: string; variant?: 'destructive' }) => void;
}

export function DangerSection({ toast }: DangerSectionProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleFirstConfirm = () => {
    setShowConfirmDialog(false);
    setShowFinalConfirmDialog(true);
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await ipc.resetAllData();
      // 应用会自动重启，不需要在这里做什么
    } catch (error) {
      toast({
        title: '重置失败',
        description: String(error),
        variant: 'destructive',
      });
      setIsResetting(false);
      setShowFinalConfirmDialog(false);
    }
  };

  return (
    <div>
      <SectionHeader title="危险区域" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BentoCard className="md:col-span-2 border-red-200/50 dark:border-red-900/50">
          <SettingItem
            icon={Trash2}
            iconBgColor="bg-red-50 dark:bg-red-500/10"
            iconColor="text-red-500"
            title="重置所有数据"
            description="删除所有配置、订阅和用户数据，恢复初始状态"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDialog(true)}
                className="h-7 text-xs rounded-full px-3 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
              >
                重置
              </Button>
            }
          />
        </BentoCard>
      </div>

      {/* 第一次确认对话框 */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              确认重置
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400 pt-2">
              此操作将删除所有用户数据，包括：
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 py-2">
            <ul className="list-disc list-inside space-y-1">
              <li>所有订阅配置</li>
              <li>代理规则和策略组</li>
              <li>WebDAV 同步设置</li>
              <li>应用偏好设置</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleFirstConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 第二次确认对话框 */}
      <Dialog open={showFinalConfirmDialog} onOpenChange={setShowFinalConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              最终确认
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400 pt-2">
              <span className="font-semibold text-red-600 dark:text-red-400">此操作不可撤销！</span>
              <br />
              应用将在重置完成后自动重启。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowFinalConfirmDialog(false)}
              disabled={isResetting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={isResetting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isResetting ? '正在重置...' : '确认重置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
