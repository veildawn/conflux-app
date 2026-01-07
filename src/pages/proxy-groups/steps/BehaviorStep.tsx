import { Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/cn';
import { CheckIcon } from '../shared/components';
import { LOAD_BALANCE_STRATEGIES, type GroupFormData } from '../shared/utils';

interface BehaviorStepProps {
  formData: GroupFormData;
  setFormData: React.Dispatch<React.SetStateAction<GroupFormData>>;
  typeValue: string;
}

export default function BehaviorStep({ formData, setFormData, typeValue }: BehaviorStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_24px_rgba(0,0,0,0.06)] space-y-5">
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Health Check URL
          </label>
          <Input
            value={formData.url}
            onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
            className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
            placeholder="http://www.gstatic.com/generate_204"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              测试间隔 (s)
            </label>
            <Input
              value={formData.interval}
              onChange={(e) => setFormData((prev) => ({ ...prev, interval: e.target.value }))}
              className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
              placeholder="300"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              最大失败次数
            </label>
            <Input
              value={formData.maxFailedTimes}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxFailedTimes: e.target.value }))}
              className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
              placeholder="5"
            />
          </div>
        </div>

        {typeValue === 'url-test' && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              容差 (ms)
            </label>
            <Input
              value={formData.tolerance}
              onChange={(e) => setFormData((prev) => ({ ...prev, tolerance: e.target.value }))}
              className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
              placeholder="50"
            />
          </div>
        )}

        <div
          className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 border border-white/70 cursor-pointer hover:bg-white/80 transition-colors"
          onClick={() => setFormData((prev) => ({ ...prev, lazy: !prev.lazy }))}
        >
          <div>
            <div className="text-sm font-semibold text-neutral-800">懒加载模式</div>
            <div className="text-xs text-neutral-400">仅在被使用时进行测速，节省流量。</div>
          </div>
          <Switch
            className="scale-90 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-neutral-200"
            checked={formData.lazy}
            onCheckedChange={(c) => setFormData((prev) => ({ ...prev, lazy: c }))}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {typeValue === 'load-balance' && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            分流算法
          </div>
          <div className="grid gap-3">
            {LOAD_BALANCE_STRATEGIES.map((strategy) => {
              const selected = formData.strategy === strategy.value;
              return (
                <div
                  key={strategy.value}
                  onClick={() => setFormData((prev) => ({ ...prev, strategy: strategy.value }))}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all cursor-pointer',
                    selected
                      ? 'bg-white/90 border-blue-500 shadow-[0_4px_12px_rgba(0,122,255,0.12)]'
                      : 'bg-white/45 border-transparent hover:bg-white/70'
                  )}
                >
                  <div
                    className={cn(
                      'h-9 w-9 rounded-xl flex items-center justify-center',
                      selected ? 'bg-blue-600 text-white' : 'bg-blue-500/10 text-blue-600'
                    )}
                  >
                    <Settings2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-neutral-800">{strategy.label}</div>
                    <div className="text-xs text-neutral-400">{strategy.description}</div>
                  </div>
                  {selected && (
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                      <CheckIcon />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
