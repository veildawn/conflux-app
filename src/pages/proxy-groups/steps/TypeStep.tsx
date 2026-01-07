import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';
import { SelectionCard, GROUP_TYPE_ICON_MAP } from '../shared/components';
import type { GroupFormData, GroupTypeOption } from '../shared/utils';

interface TypeStepProps {
  formData: GroupFormData;
  setFormData: React.Dispatch<React.SetStateAction<GroupFormData>>;
  selectableTypeOptions: GroupTypeOption[];
  errors: Record<string, string>;
}

export default function TypeStep({
  formData,
  setFormData,
  selectableTypeOptions,
  errors,
}: TypeStepProps) {
  const typeValue = formData.type.trim();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          策略组名称
        </label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          className={cn(
            'h-12 rounded-2xl bg-white/40 border border-white/60 px-4 text-base font-semibold text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all focus-visible:ring-4 focus-visible:ring-blue-500/20',
            errors.name
              ? 'border-red-400/60 focus-visible:ring-red-500/20'
              : 'focus-visible:border-blue-500'
          )}
          placeholder="输入名称..."
          autoFocus
        />
        {errors.name && (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {errors.name}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          分发模式
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectableTypeOptions.map((option) => {
            const selected = typeValue === option.value;
            const Icon = GROUP_TYPE_ICON_MAP[option.value] || GROUP_TYPE_ICON_MAP.select;
            return (
              <SelectionCard
                key={option.value}
                selected={selected}
                onClick={() => setFormData((prev) => ({ ...prev, type: option.value }))}
                icon={<Icon className="h-5 w-5" />}
                title={option.label}
                description={option.description}
                badge={option.deprecated ? '已弃用' : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
