import { formatBytes } from '@/utils/format';
import type { ConnectionStats as Stats } from '@/stores/proxyStore';

interface ConnectionStatsProps {
  stats: Stats;
}

export function ConnectionStats({ stats }: ConnectionStatsProps) {
  return (
    <div className="px-6 py-2.5 bg-gray-50/50 dark:bg-zinc-800/30 border-b border-gray-100 dark:border-zinc-800 flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
        上传:{' '}
        <span className="text-gray-700 dark:text-gray-300 tabular-nums">
          {formatBytes(stats.uploadTotal)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
        下载:{' '}
        <span className="text-gray-700 dark:text-gray-300 tabular-nums">
          {formatBytes(stats.downloadTotal)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-gray-400">总量:</span>
        <span className="text-gray-700 dark:text-gray-300 tabular-nums font-semibold">
          {formatBytes(stats.uploadTotal + stats.downloadTotal)}
        </span>
      </div>
    </div>
  );
}
