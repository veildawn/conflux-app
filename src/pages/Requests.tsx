import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Search, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useToast } from '@/hooks/useToast';
import { useProxyStore } from '@/stores/proxyStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BentoCard } from '@/components/ui/bento-card';
import { ConnectionRow, KeywordFilter, SortSelect } from '@/components/connection';
import { getConnectionKeyInfo, sortConnections } from '@/utils/connection';
import type { ConnectionSortKey, SortOrder } from '@/utils/connection';

export default function Requests() {
  const { toast } = useToast();
  const { status, requestHistory, connections, clearRequestHistory, closeConnection, now } =
    useProxyStore(
      useShallow((s) => ({
        status: s.status,
        requestHistory: s.requestHistory,
        connections: s.connections,
        clearRequestHistory: s.clearRequestHistory,
        closeConnection: s.closeConnection,
        now: s.now,
      }))
    );

  const [query, setQuery] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [autoScrollToTop, setAutoScrollToTop] = useState(true);
  const [sortKey, setSortKey] = useState<ConnectionSortKey>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 创建活跃连接 ID 集合，用于判断历史记录中的连接是否仍然活跃
  const activeConnectionIds = useMemo(() => {
    return new Set(connections.map((c) => c.id));
  }, [connections]);

  // 过滤和排序
  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ks = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

    // 匹配关键词
    const matchKeyword = (c: (typeof requestHistory)[0], k: string) => {
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
    let filtered = requestHistory;
    if (q || ks.length > 0) {
      filtered = requestHistory.filter((c) => {
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
  }, [requestHistory, query, keywords, sortKey, sortOrder]);

  useEffect(() => {
    if (!autoScrollToTop) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [autoScrollToTop, requestHistory.length]);

  const addKeyword = (k: string) => {
    const v = k.trim();
    if (!v) return;
    setKeywords((prev) => (prev.includes(v) ? prev : [...prev, v]));
  };

  const removeKeyword = (k: string) => {
    setKeywords((prev) => prev.filter((x) => x !== k));
  };

  const handleClear = () => {
    clearRequestHistory();
    toast({ title: '已清空请求记录' });
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

  // 统计活跃和已关闭的连接数
  const activeCount = useMemo(() => {
    return filteredAndSorted.filter((c) => activeConnectionIds.has(c.id)).length;
  }, [filteredAndSorted, activeConnectionIds]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">请求</h1>
          <Badge variant={status.running ? 'success' : 'secondary'} className="h-6">
            {status.running ? '运行中' : '未运行'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={requestHistory.length === 0}
            className="h-9 shadow-sm"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            清空记录
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoScrollToTop((v) => !v)}
            className="h-9 shadow-sm"
          >
            <ArrowDownToLine
              className={cn(
                'w-4 h-4 mr-2 transition-transform',
                autoScrollToTop ? 'rotate-180' : ''
              )}
            />
            {autoScrollToTop ? '自动置顶' : '手动浏览'}
          </Button>
        </div>
      </div>

      <BentoCard
        className="flex-1 min-h-0"
        title="请求记录"
        action={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 Host / 进程 / 链路"
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
              <span className="text-gray-400 font-normal">/ {requestHistory.length}</span>
              {activeCount > 0 && (
                <span className="text-green-600 dark:text-green-400 ml-1.5">
                  ({activeCount} 活跃)
                </span>
              )}
            </span>
          </div>
        }
      >
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium">
              {requestHistory.length === 0 ? '暂无请求记录' : '没有匹配的记录'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <KeywordFilter
              keywords={keywords}
              onRemove={removeKeyword}
              onClearAll={() => setKeywords([])}
            />
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto custom-scrollbar"
              onWheel={() => {
                if (autoScrollToTop) setAutoScrollToTop(false);
              }}
            >
              {filteredAndSorted.map((c) => {
                const isActive = activeConnectionIds.has(c.id);
                return (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    now={now}
                    enableKeywordFilter
                    onAddKeyword={addKeyword}
                    onClose={isActive ? handleClose : undefined}
                    isActive={isActive}
                  />
                );
              })}
            </div>
          </div>
        )}
      </BentoCard>
    </div>
  );
}
