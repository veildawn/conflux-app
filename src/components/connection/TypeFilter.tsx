import { Filter } from 'lucide-react';

export type ConnectionTypeFilter = 'all' | 'proxied' | 'direct' | 'reject';

interface TypeFilterProps {
  value: ConnectionTypeFilter;
  onChange: (value: ConnectionTypeFilter) => void;
}

const filterOptions: { value: ConnectionTypeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'proxied', label: '代理' },
  { value: 'direct', label: '直连' },
  { value: 'reject', label: '拒绝' },
];

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Filter className="w-3.5 h-3.5 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ConnectionTypeFilter)}
        className="h-7 text-xs bg-gray-50/50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-md px-2 pr-6 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239CA3AF'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 4px center',
          backgroundSize: '16px',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {filterOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
