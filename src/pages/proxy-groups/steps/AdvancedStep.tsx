import { Eye, EyeOff, CloudOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/cn';
import { type GroupFormData } from '../shared/utils';

interface AdvancedStepProps {
  formData: GroupFormData;
  setFormData: React.Dispatch<React.SetStateAction<GroupFormData>>;
}

export default function AdvancedStep({ formData, setFormData }: AdvancedStepProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            排除过滤
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_24px_rgba(0,0,0,0.06)] space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                正则排除
              </label>
              <Input
                value={formData.excludeFilter}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, excludeFilter: e.target.value }))
                }
                className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
                placeholder="例如: 流量|过期|Back"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                类型过滤
              </label>
              <Input
                value={formData.excludeType}
                onChange={(e) => setFormData((prev) => ({ ...prev, excludeType: e.target.value }))}
                className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
                placeholder="例如: Shadowsocks"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            显示控制
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/55 shadow-[0_12px_24px_rgba(0,0,0,0.06)] overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
              onClick={() => setFormData((prev) => ({ ...prev, hidden: !prev.hidden }))}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-9 w-9 rounded-2xl flex items-center justify-center',
                    !formData.hidden
                      ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(0,122,255,0.2)]'
                      : 'bg-white/70 text-neutral-400'
                  )}
                >
                  {!formData.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-800">在首页显示</div>
                  <div className="text-xs text-neutral-400">将此策略组展示在主面板中。</div>
                </div>
              </div>
              <Switch
                className="scale-90 data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-neutral-200"
                checked={!formData.hidden}
                onCheckedChange={(c) => setFormData((prev) => ({ ...prev, hidden: !c }))}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="border-t border-white/60" />

            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
              onClick={() => setFormData((prev) => ({ ...prev, disableUdp: !prev.disableUdp }))}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-9 w-9 rounded-2xl flex items-center justify-center',
                    formData.disableUdp
                      ? 'bg-orange-500 text-white shadow-[0_4px_12px_rgba(251,146,60,0.2)]'
                      : 'bg-white/70 text-neutral-400'
                  )}
                >
                  <CloudOff className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-800">禁用 UDP</div>
                  <div className="text-xs text-neutral-400">强制通过 TCP 转发流量。</div>
                </div>
              </div>
              <Switch
                className="scale-90 data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-neutral-200"
                checked={formData.disableUdp}
                onCheckedChange={(c) => setFormData((prev) => ({ ...prev, disableUdp: c }))}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
