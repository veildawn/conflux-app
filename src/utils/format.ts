/**
 * 格式化字节数为人类可读的格式
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * 格式化速度（字节/秒）为人类可读的格式
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * 格式化延迟时间
 */
export function formatDelay(delay: number | null | undefined): string {
  if (delay === null || delay === undefined || delay < 0) {
    return 'N/A';
  }
  return `${delay} ms`;
}

/**
 * 获取延迟对应的颜色类名
 */
export function getDelayColorClass(delay: number | null | undefined): string {
  if (delay === null || delay === undefined || delay < 0) {
    return 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400';
  }
  if (delay < 200) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  if (delay < 500) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }
  return 'bg-red-500/10 text-red-600 dark:text-red-400';
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化持续时间（毫秒）
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
