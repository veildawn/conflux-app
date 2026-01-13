import { X } from 'lucide-react';

interface KeywordFilterProps {
  keywords: string[];
  onRemove: (keyword: string) => void;
  onClearAll: () => void;
}

export function KeywordFilter({ keywords, onRemove, onClearAll }: KeywordFilterProps) {
  if (keywords.length === 0) return null;

  return (
    <div className="px-6 py-2.5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/30 flex flex-wrap gap-2 items-center min-h-[44px]">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mr-1">
        过滤:
      </span>
      {keywords.map((k) => (
        <button
          key={k}
          type="button"
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 dark:hover:bg-blue-500/20 transition-colors"
          onClick={() => onRemove(k)}
          title="点击移除关键词"
        >
          <span className="max-w-[180px] truncate font-medium">{k}</span>
          <X className="w-3 h-3 opacity-60 hover:opacity-100" />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-auto hover:underline"
      >
        清除全部
      </button>
    </div>
  );
}
