import { useCallback, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/hooks/useToast';
import { useProxyStore } from '@/stores/proxyStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BentoCard } from '@/components/ui/bento-card';
import { ConnectionRow, ConnectionStats, KeywordFilter, SortSelect } from '@/components/connection';
import { getConnectionKeyInfo, sortConnections } from '@/utils/connection';
import type { ConnectionSortKey, SortOrder } from '@/utils/connection';

export default function Connections() {
  const { toast } = useToast();
  const {
    status,
    connections,
    connectionStats,
    fetchConnections,
    closeConnection,
    closeAllConnections,
    now,
  } = useProxyStore(
    useShallow((s) => ({
      status: s.status,
      connections: s.connections,
      connectionStats: s.connectionStats,
      fetchConnections: s.fetchConnections,
      closeConnection: s.closeConnection,
      closeAllConnections: s.closeAllConnections,
      now: s.now,
    }))
  );

  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<ConnectionSortKey>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const refresh = useCallback(async () => {
    if (!status.running) return;
    setLoading(true);
    try {
      await fetchConnections();
    } finally {
      setLoading(false);
    }
  }, [fetchConnections, status.running]);

  // 过滤和排序
  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ks = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

    // 匹配关键词
    const matchKeyword = (c: (typeof connections)[0], k: string) => {
      const { host, process } = getConnectionKeyInfo(c);
      const hay = [
        host,
        process,
        c.rule,
        c.rulePayload,
        c.metadata.sourceIP,
        c.metadata.destinationIP,
        c.metadata.host,
        ...(c.chains || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(k);
    };

    // 过滤
    let filtered = connections;
    if (q || ks.length > 0) {
      filtered = connections.filter((c) => {
        const { host, process } = getConnectionKeyInfo(c);
        const qOk =
          !q ||
          host.toLowerCase().includes(q) ||
          process.toLowerCase().includes(q) ||
          c.rule.toLowerCase().includes(q) ||
          c.rulePayload.toLowerCase().includes(q) ||
          c.metadata.sourceIP.toLowerCase().includes(q) ||
          c.metadata.destinationIP.toLowerCase().includes(q);
        const ksOk = ks.length === 0 || ks.every((k) => matchKeyword(c, k));
        return qOk && ksOk;
      });
    }

    // 排序
    return sortConnections(filtered, sortKey, sortOrder);
  }, [connections, query, keywords, sortKey, sortOrder]);

  const addKeyword = (k: string) => {
    const v = k.trim();
    if (!v) return;
    setKeywords((prev) => (prev.includes(v) ? prev : [...prev, v]));
  };

  const removeKeyword = (k: string) => {
    setKeywords((prev) => prev.filter((x) => x !== k));
  };

  const handleClose = async (id: string) => {
    try {
      await closeConnection(id);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '关闭连接失败',
        description: String(e),
      });
    }
  };

  const handleCloseAll = async () => {
    try {
      await closeAllConnections();
      toast({ title: '已关闭全部连接' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '关闭全部连接失败',
        description: String(e),
      });
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">连接</h1>
          <Badge variant={status.running ? 'success' : 'secondary'} className="h-6">
            {status.running ? '运行中' : '未运行'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading || !status.running}
            className="rounded-full h-9 w-9"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCloseAll}
            disabled={loading || !status.running || connections.length === 0}
            className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            关闭全部
          </Button>
        </div>
      </div>

      <BentoCard
        className="flex-1 min-h-0"
        title="活跃连接"
        action={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 Host / 进程 / IP"
                className="h-8 pl-9 w-[200px] bg-gray-50/50 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-700 text-xs focus-visible:ring-1"
              />
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-zinc-700" />
            <SortSelect
              sortKey={sortKey}
              order={sortOrder}
              onSortKeyChange={setSortKey}
              onOrderChange={setSortOrder}
            />
            <div className="h-4 w-px bg-gray-200 dark:bg-zinc-700" />
            <span className="text-xs text-gray-500 font-medium tabular-nums">
              {filteredAndSorted.length}{' '}
              <span className="text-gray-400 font-normal">/ {connections.length}</span>
            </span>
          </div>
        }
      >
        {!status.running ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              <X className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium">核心未运行</p>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium">
              {connections.length === 0 ? '暂无活跃连接' : '没有匹配的连接'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <ConnectionStats stats={connectionStats} />
            <KeywordFilter
              keywords={keywords}
              onRemove={removeKeyword}
              onClearAll={() => setKeywords([])}
            />
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredAndSorted.map((c) => (
                <ConnectionRow
                  key={c.id}
                  connection={c}
                  now={now}
                  enableKeywordFilter
                  onAddKeyword={addKeyword}
                  onClose={handleClose}
                  closeDisabled={loading}
                  isActive
                />
              ))}
            </div>
          </div>
        )}
      </BentoCard>
    </div>
  );
}
