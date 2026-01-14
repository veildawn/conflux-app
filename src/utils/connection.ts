import type { Connection } from '@/types/proxy';
import type { ConnectionTypeFilter } from '@/components/connection/TypeFilter';

/**
 * 判断连接的链路类型
 * - direct: chains 包含 DIRECT
 * - reject: chains 包含 REJECT 或 rule 包含 REJECT
 * - proxied: 其他情况（经过代理节点）
 */
export function getConnectionChainType(c: Connection): 'direct' | 'reject' | 'proxied' {
  const chainsUpper = c.chains.map((chain) => chain.toUpperCase());
  const ruleUpper = c.rule.toUpperCase();

  // 检查是否直连（chains 包含 DIRECT）
  if (chainsUpper.includes('DIRECT')) {
    return 'direct';
  }

  // 检查是否拒绝（chains 包含 REJECT 或 rule 包含 REJECT）
  if (chainsUpper.includes('REJECT') || ruleUpper.includes('REJECT')) {
    return 'reject';
  }

  // 其他情况为代理
  return 'proxied';
}

/**
 * 根据类型过滤连接列表
 */
export function filterConnectionsByType(
  connections: Connection[],
  filterType: ConnectionTypeFilter
): Connection[] {
  if (filterType === 'all') return connections;

  return connections.filter((c) => {
    const chainType = getConnectionChainType(c);
    return chainType === filterType;
  });
}

/**
 * 从连接信息中提取显示用的关键信息
 */
export function getConnectionKeyInfo(c: Connection) {
  const host = c.metadata.host || `${c.metadata.destinationIP}:${c.metadata.destinationPort}`;
  const process = c.metadata.process || 'Unknown';
  return { host, process };
}

function hasScheme(input: string) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input);
}

function looksLikeHostWithPath(input: string) {
  // e.g. example.com/path?x=1 (sniffing/metadata sometimes carries extra info)
  return input.includes('/') || input.includes('?');
}

function isProbablyHostWithPort(input: string) {
  // best-effort: hostname:port or ipv4:port (ignore ipv6 here)
  return /:\d+$/.test(input);
}

function inferScheme(c: Connection): 'http' | 'https' {
  const t = (c.metadata.type || '').toUpperCase();
  const port = Number(c.metadata.destinationPort);
  if (t.includes('HTTPS') || t.includes('TLS')) return 'https';
  if (t.includes('HTTP')) return port === 443 ? 'https' : 'http';
  if (port === 443) return 'https';
  return 'http';
}

function shellSingleQuote(s: string) {
  // POSIX-safe single-quote escaping:  abc'def -> 'abc'"'"'def'
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

/**
 * 从连接信息推导一个“尽量可用”的 URL。
 *
 * 注意：mihomo 的 connections 元数据通常没有 HTTP path/query，
 * 这里会尽力处理 metadata.host 里可能携带的路径（如 `example.com/search?q=1`）。
 */
export function buildUrlFromConnection(c: Connection) {
  const rawHost = (c.metadata.host || '').trim();
  const port = (c.metadata.destinationPort || '').trim();
  const scheme = inferScheme(c);

  // 已经是完整 URL
  if (rawHost && hasScheme(rawHost)) return rawHost;

  // 没有 host 时用目标 IP:port 兜底
  const baseHost = rawHost || `${c.metadata.destinationIP}:${port}`;

  // 如果 host 看起来已经自带端口或带路径，则不要盲目追加端口
  if (looksLikeHostWithPath(baseHost)) {
    return `${scheme}://${baseHost}`;
  }

  const defaultPort = scheme === 'https' ? '443' : '80';
  const hostWithPort =
    baseHost && !isProbablyHostWithPort(baseHost) && port && port !== defaultPort
      ? `${baseHost}:${port}`
      : baseHost;

  return `${scheme}://${hostWithPort}/`;
}

/**
 * 生成一个可复现请求的 curl（通过本地代理端口转发）。
 */
export function buildCurlFromConnection(c: Connection, options: { proxyPort?: number } = {}) {
  const url = buildUrlFromConnection(c);
  const proxyPort = options.proxyPort;
  if (!proxyPort) return `curl ${shellSingleQuote(url)}`;
  const proxy = `http://127.0.0.1:${proxyPort}`;
  return `curl --proxy ${shellSingleQuote(proxy)} ${shellSingleQuote(url)}`;
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
