import { Search, Layers, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { CheckableItem } from '../shared/components';
import {
  type GroupFormData,
  isValidRegexList,
  toggleListItem,
  normalizeList,
} from '../shared/utils';

interface ProxiesStepProps {
  formData: GroupFormData;
  setFormData: React.Dispatch<React.SetStateAction<GroupFormData>>;
  proxyQuery: string;
  setProxyQuery: (query: string) => void;
  filteredProxyOptions: string[];
  providerOptions: string[];
  hasProviderOptions: boolean;
}

export default function ProxiesStep({
  formData,
  setFormData,
  proxyQuery,
  setProxyQuery,
  filteredProxyOptions,
  providerOptions,
  hasProviderOptions,
}: ProxiesStepProps) {
  const filterValid = isValidRegexList(formData.filter);
  const proxies = normalizeList(formData.proxies);
  const providers = normalizeList(formData.providers);

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* 过滤器 - 置顶 */}
      <div className="space-y-3 shrink-0">
        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-indigo-500" />
          节点过滤
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] overflow-hidden px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
            包含过滤正则
            {!filterValid && formData.filter && (
              <Badge variant="destructive" className="h-4 px-1 text-[8px]">
                正则错误
              </Badge>
            )}
          </div>
          <div className="relative">
            <Input
              value={formData.filter}
              onChange={(e) => setFormData((prev) => ({ ...prev, filter: e.target.value }))}
              placeholder="例如: US|HK|SG"
              className={cn(
                'h-9 rounded-xl bg-white/70 border border-white/70 text-xs font-mono',
                !filterValid && formData.filter && 'border-red-400/60 text-red-500'
              )}
            />
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-5">
        {/* 可用子策略 / 节点 */}
        <div className="flex flex-col min-h-0 flex-1 gap-3">
          <div className="flex items-center justify-between shrink-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              可用子策略 / 节点
            </div>
            <div className="text-[11px] font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
              已选: {proxies.length}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="p-3 border-b border-white/60 bg-white/60 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={proxyQuery}
                  onChange={(e) => setProxyQuery(e.target.value)}
                  placeholder="搜索节点、区域..."
                  className="h-9 pl-10 pr-10 rounded-xl bg-white/70 border border-white/70 text-sm font-medium"
                />
                {proxyQuery && (
                  <button
                    onClick={() => setProxyQuery('')}
                    className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-neutral-100/80 text-neutral-500 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {filteredProxyOptions.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-400">无匹配结果</div>
              ) : (
                filteredProxyOptions.map((p) => (
                  <CheckableItem
                    key={p}
                    label={p}
                    checked={proxies.includes(p)}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        proxies: toggleListItem(prev.proxies, p),
                      }))
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* 外部策略集 */}
        {hasProviderOptions && (
          <div className="flex flex-col min-h-0 lg:w-[280px] shrink-0 gap-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2 shrink-0">
              <div className="h-2 w-2 rounded-full bg-orange-400" />
              外部策略集
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-2 space-y-1.5 custom-scrollbar">
              {providerOptions.map((p) => (
                <CheckableItem
                  key={p}
                  label={p}
                  checked={providers.includes(p)}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      providers: toggleListItem(prev.providers, p),
                    }))
                  }
                  variant="provider"
                  subtitle={providers.includes(p) ? '已包含' : '未包含'}
                  icon={<Save className="h-3.5 w-3.5" />}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
