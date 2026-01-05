import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import type { ProxyConfig } from '@/types/config';
import { parseProxyLink, getProxyTypeColor } from './utils';

interface LinkParseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (proxy: ProxyConfig) => Promise<void>;
  statusRunning: boolean;
}

export function LinkParseDialog({ open, onClose, onSuccess, statusRunning }: LinkParseDialogProps) {
  const { toast } = useToast();
  const [linkInput, setLinkInput] = useState('');
  const [parsedProxy, setParsedProxy] = useState<ProxyConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleParse = () => {
    try {
      const parsed = parseProxyLink(linkInput.trim());
      setParsedProxy(parsed);
      toast({ title: '解析成功', variant: 'default' });
    } catch (error) {
      toast({
        title: '解析失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleAdd = async () => {
    if (!parsedProxy) return;

    setSubmitting(true);
    try {
      await onSuccess(parsedProxy);
      onClose();
      setLinkInput('');
      setParsedProxy(null);
    } catch (error) {
      toast({
        title: '添加失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setLinkInput('');
      setParsedProxy(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            通过链接快速添加
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">分享链接</label>
            <div className="flex gap-2">
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="粘贴 ss:// vmess:// vless:// trojan:// tuic:// hy2:// 链接"
                className="font-mono text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleParse()}
              />
              <Button onClick={handleParse} disabled={!linkInput.trim()} variant="outline">
                解析
              </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              支持多种协议格式，解析后可预览配置
            </p>
          </div>

          {parsedProxy && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">解析结果</h4>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    getProxyTypeColor(parsedProxy.type)
                  )}
                >
                  {parsedProxy.type.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">名称：</span>
                  <span className="font-medium ml-1">{parsedProxy.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">端口：</span>
                  <span className="font-medium ml-1">{parsedProxy.port}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">服务器：</span>
                  <span className="font-medium ml-1 font-mono">{parsedProxy.server}</span>
                </div>
              </div>
            </div>
          )}

          {!statusRunning && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                核心未启动，添加后无法自动测速
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={!parsedProxy || submitting} className="gap-2">
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            添加服务器
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
