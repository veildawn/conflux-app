import type { Connection } from '@/types/proxy';

/**
 * 从连接信息中提取显示用的关键信息
 */
export function getConnectionKeyInfo(c: Connection) {
  const host = c.metadata.host || `${c.metadata.destinationIP}:${c.metadata.destinationPort}`;
  const process = c.metadata.process || 'Unknown';
  return { host, process };
}

/**
 * 排序类型
 */
export type ConnectionSortKey = 'time' | 'upload' | 'download' | 'total';
export type SortOrder = 'asc' | 'desc';

/**
 * 排序连接列表
 */
export function sortConnections(
  connections: Connection[],
  sortKey: ConnectionSortKey,
  order: SortOrder
): Connection[] {
  const sorted = [...connections];

  sorted.sort((a, b) => {
    let diff = 0;

    switch (sortKey) {
      case 'time': {
        const aStart = new Date(a.start).getTime();
        const bStart = new Date(b.start).getTime();
        diff = bStart - aStart; // 默认最新在前
        break;
      }
      case 'upload':
        diff = b.upload - a.upload;
        break;
      case 'download':
        diff = b.download - a.download;
        break;
      case 'total':
        diff = b.upload + b.download - (a.upload + a.download);
        break;
    }

    return order === 'desc' ? diff : -diff;
  });

  return sorted;
}
