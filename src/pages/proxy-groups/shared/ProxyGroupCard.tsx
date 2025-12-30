import { Edit3, Layers, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProxyGroupConfig } from '@/types/config';
import { GROUP_TYPE_OPTIONS } from './utils';

export function ProxyGroupCard({
  group,
  onEdit,
  onDelete,
  isRemote,
}: {
  group: ProxyGroupConfig;
  onEdit: () => void;
  onDelete: () => void;
  isRemote: boolean;
}) {
  const typeOption = GROUP_TYPE_OPTIONS.find((opt) => opt.value === group.type);
  const isLoadBalance = group.type === 'load-balance';
  const isUrlTest = group.type === 'url-test';

  return (
    <div className="group relative overflow-hidden rounded-[20px] bg-white p-5 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{group.name}</h3>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {typeOption?.label || group.type}
            </p>
          </div>
        </div>
        {!isRemote && (
          <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">节点数量</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {group.proxies?.length || 0}{' '}
            <span className="text-[10px] font-normal text-gray-400">个</span>
          </span>
        </div>
        {group.url && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">测速链接</span>
            <span
              className="truncate text-xs font-medium text-gray-600 dark:text-gray-400"
              title={group.url}
            >
              {group.url}
            </span>
          </div>
        )}
        {isLoadBalance && group.strategy && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">负载策略</span>
            <Badge variant="secondary" className="w-fit rounded-md px-1.5 py-0 text-[10px]">
              {group.strategy}
            </Badge>
          </div>
        )}
        {(isUrlTest || group.interval) && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">更新间隔</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {group.interval || 300}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
