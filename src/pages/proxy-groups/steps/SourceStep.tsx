import { Search, MousePointerClick, Server, Cloud, Globe2 } from 'lucide-react';
import { SelectionCard, FilterPanel } from '../shared/components';
import {
  SOURCE_MODE_OPTIONS,
  type SourceMode,
  type GroupFormData,
  isValidRegexList,
} from '../shared/utils';

const ICON_MAP = {
  manual: MousePointerClick,
  proxies: Server,
  providers: Cloud,
  all: Globe2,
};

interface SourceStepProps {
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  formData: GroupFormData;
  setFormData: React.Dispatch<React.SetStateAction<GroupFormData>>;
}

export default function SourceStep({
  sourceMode,
  setSourceMode,
  formData,
  setFormData,
}: SourceStepProps) {
  const filterValid = isValidRegexList(formData.filter);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOURCE_MODE_OPTIONS.map((option) => {
          const selected = sourceMode === option.value;
          const IconComponent = ICON_MAP[option.icon];
          return (
            <SelectionCard
              key={option.value}
              selected={selected}
              onClick={() => setSourceMode(option.value)}
              icon={<IconComponent className="h-5 w-5" />}
              title={option.title}
              description={option.description}
            />
          );
        })}
      </div>

      {/* 过滤器配置 - 对自动模式有用 */}
      {sourceMode !== 'manual' && (
        <FilterPanel
          label="节点过滤正则"
          value={formData.filter}
          onChange={(value) => setFormData((prev) => ({ ...prev, filter: value }))}
          placeholder="例如: US|HK|SG（留空包含全部）"
          error={!filterValid && !!formData.filter}
          icon={<Search className="h-3.5 w-3.5" />}
        />
      )}
    </div>
  );
}
