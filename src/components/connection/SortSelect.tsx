import { ArrowDownUp, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ConnectionSortKey, SortOrder } from '@/utils/connection';

interface SortSelectProps {
  sortKey: ConnectionSortKey;
  order: SortOrder;
  onSortKeyChange: (key: ConnectionSortKey) => void;
  onOrderChange: (order: SortOrder) => void;
}

const sortOptions: { value: ConnectionSortKey; label: string }[] = [
  { value: 'time', label: '时间' },
  { value: 'upload', label: '上传' },
  { value: 'download', label: '下载' },
  { value: 'total', label: '总流量' },
];

export function SortSelect({ sortKey, order, onSortKeyChange, onOrderChange }: SortSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <ArrowDownUp className="w-3.5 h-3.5 text-gray-400" />
      <select
        value={sortKey}
        onChange={(e) => onSortKeyChange(e.target.value as ConnectionSortKey)}
        className="h-7 text-xs bg-gray-50/50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-md px-2 pr-6 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239CA3AF'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 4px center',
          backgroundSize: '16px',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onOrderChange(order === 'desc' ? 'asc' : 'desc')}
        className={cn(
          'h-7 w-7 flex items-center justify-center rounded-md',
          'bg-gray-50/50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700',
          'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
          'transition-colors'
        )}
        title={order === 'desc' ? '降序（点击切换升序）' : '升序（点击切换降序）'}
      >
        {order === 'desc' ? (
          <ArrowDownWideNarrow className="w-3.5 h-3.5" />
        ) : (
          <ArrowUpNarrowWide className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
