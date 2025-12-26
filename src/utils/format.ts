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
    return 'delay-timeout';
  }
  if (delay < 100) {
    return 'delay-fast';
  }
  if (delay < 300) {
    return 'delay-medium';
  }
  if (delay < 500) {
    return 'delay-slow';
  }
  return 'delay-timeout';
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




