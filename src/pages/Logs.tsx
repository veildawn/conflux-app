import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ScrollText,
  Trash2,
  Download,
  Pause,
  Play,
  Filter,
  Search,
  X,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug
} from 'lucide-react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { useProxyStore } from '@/stores/proxyStore';
import { ipc } from '@/services/ipc';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface LogEntry {
  type: 'debug' | 'info' | 'warning' | 'error';
  payload: string;
  timestamp: string;
}

type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'silent';

const LOG_LEVELS: { value: LogLevel; label: string; color: string }[] = [
  { value: 'debug', label: '全部', color: 'text-gray-500' },
  { value: 'info', label: '信息', color: 'text-blue-500' },
  { value: 'warning', label: '警告', color: 'text-amber-500' },
  { value: 'error', label: '错误', color: 'text-red-500' },
];

const MAX_LOGS = 1000;

function formatTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = "text-gray-500",
  action
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
            {title && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

function getLogIcon(type: string) {
  switch (type) {
    case 'error':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
      return Info;
    case 'debug':
    default:
      return Bug;
  }
}

function getLogColor(type: string) {
  switch (type) {
    case 'error':
      return 'text-red-500 bg-red-500/10';
    case 'warning':
      return 'text-amber-500 bg-amber-500/10';
    case 'info':
      return 'text-blue-500 bg-blue-500/10';
    case 'debug':
    default:
      return 'text-gray-500 bg-gray-500/10';
  }
}

function getLogBadgeStyle(type: string) {
  switch (type) {
    case 'error':
      return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200/50 dark:border-red-500/20';
    case 'warning':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20';
    case 'info':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20';
    case 'debug':
    default:
      return 'bg-gray-50 text-gray-700 dark:bg-zinc-800 dark:text-gray-400 border-gray-200/50 dark:border-zinc-700';
  }
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Logs() {
  const { status } = useProxyStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('debug'); // 前端过滤级别
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(isPaused);
  const unlistenEntryRef = useRef<UnlistenFn | null>(null);
  const unlistenConnectedRef = useRef<UnlistenFn | null>(null);

  // 同步 isPaused 到 ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 启动日志流 - 始终使用 debug 级别获取所有日志，前端进行过滤
  const startLogStream = useCallback(async () => {
    if (!status.running) return;

    try {
      await ipc.startLogStream('debug'); // 始终获取所有级别的日志
      console.log('Log stream started');
    } catch (error) {
      console.error('Failed to start log stream:', error);
    }
  }, [status.running]);

  // 监听 Tauri 事件
  useEffect(() => {
    // 监听日志条目
    listen<{ log_type: string; payload: string }>('log-entry', (event) => {
      if (isPausedRef.current) return;

      const entry: LogEntry = {
        type: (event.payload.log_type || 'info') as LogEntry['type'],
        payload: event.payload.payload,
        timestamp: formatTimestamp(),
      };

      setLogs(prev => {
        const newLogs = [...prev, entry];
        if (newLogs.length > MAX_LOGS) {
          return newLogs.slice(-MAX_LOGS);
        }
        return newLogs;
      });
    }).then(unlisten => {
      unlistenEntryRef.current = unlisten;
    });

    // 监听连接状态
    listen<boolean>('log-connected', (event) => {
      setIsConnected(event.payload);
      console.log('Log connection status:', event.payload);
    }).then(unlisten => {
      unlistenConnectedRef.current = unlisten;
    });

    return () => {
      // 清理监听器
      if (unlistenEntryRef.current) {
        unlistenEntryRef.current();
      }
      if (unlistenConnectedRef.current) {
        unlistenConnectedRef.current();
      }
      // 停止日志流
      ipc.stopLogStream().catch(console.error);
    };
  }, []);

  // 当代理状态改变时启动/停止日志流
  useEffect(() => {
    if (status.running && !isPaused) {
      startLogStream();
    } else {
      ipc.stopLogStream().catch(console.error);
      setIsConnected(false);
    }

    return () => {
      ipc.stopLogStream().catch(console.error);
    };
  }, [status.running, isPaused, startLogStream]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 处理滚动事件，检测是否手动滚动
  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  // 过滤日志 - 根据级别和搜索关键词
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 级别过滤：debug 显示所有，其他只显示对应级别
      if (filterLevel !== 'debug' && log.type !== filterLevel) {
        return false;
      }

      // 搜索过滤
      if (searchQuery) {
        return log.payload.toLowerCase().includes(searchQuery.toLowerCase());
      }

      return true;
    });
  }, [logs, filterLevel, searchQuery]);

  // 清空日志
  const handleClear = () => {
    setLogs([]);
  };

  // 暂停/恢复
  const handleTogglePause = () => {
    setIsPaused(!isPaused);
  };

  // 导出日志
  const handleExport = () => {
    const content = logs.map(log =>
      `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.payload}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conflux-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 滚动到底部
  const scrollToBottom = () => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  // 统计各级别日志数量（统计所有日志，不只是过滤后的）
  const logStats = useMemo(() => {
    const stats = { debug: 0, info: 0, warning: 0, error: 0 };
    logs.forEach(log => {
      if (log.type in stats) {
        stats[log.type as keyof typeof stats]++;
      }
    });
    return stats;
  }, [logs]);

  // 统计过滤后的日志数量（用于显示）
  const filteredStats = useMemo(() => {
    const stats = { debug: 0, info: 0, warning: 0, error: 0 };
    filteredLogs.forEach(log => {
      if (log.type in stats) {
        stats[log.type as keyof typeof stats]++;
      }
    });
    return stats;
  }, [filteredLogs]);

  return (
    <div className="space-y-4 pb-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">日志</h1>

          <div className="flex items-center gap-2">
            {/* 日志统计 - 紧凑版 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-zinc-800/50 rounded-full">
              {LOG_LEVELS.map(level => {
                const total = logStats[level.value as keyof typeof logStats];
                const filtered = filteredStats[level.value as keyof typeof filteredStats];
                const showFiltered = total !== filtered;

                return (
                  <div key={level.value} className="flex items-center gap-0.5">
                    <span className={cn("text-xs font-semibold", level.color)}>
                      {showFiltered ? `${filtered}/${total}` : total}
                    </span>
                    <span className="text-[9px] text-gray-400 uppercase">{level.label}</span>
                  </div>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePause}
              className={cn(
                "rounded-full gap-1.5 h-8 px-3 border transition-all text-xs",
                isPaused
                  ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
                  : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
              )}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isPaused ? '继续' : '暂停'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="rounded-full gap-1.5 h-8 px-3 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="rounded-full gap-1.5 h-8 px-3 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="搜索日志..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-lg shadow-xs focus:shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as LogLevel)}>
            <SelectTrigger className="w-[130px] h-8 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-lg shadow-xs">
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                <SelectValue placeholder="最低级别" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <span className={level.color}>{level.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs Container */}
      <BentoCard
        className="flex-1 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 flex flex-col"
        title=""
      >
        {/* Status Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected && !isPaused ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )} />
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {!status.running
                ? '代理未运行'
                : isPaused
                  ? '已暂停'
                  : isConnected
                    ? '实时日志'
                    : '连接中...'}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              ({filteredLogs.length})
            </span>
          </div>

          {!autoScroll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={scrollToBottom}
              className="h-5 px-2 text-[11px] gap-1 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <ChevronDown className="w-3 h-3" />
              到底部
            </Button>
          )}
        </div>

        {/* Logs List */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 text-[13px]"
        >
          {!status.running ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-400">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                <ScrollText className="w-6 h-6 opacity-40" />
              </div>
              <p className="font-semibold text-sm text-gray-900 dark:text-white font-sans">代理未运行</p>
              <p className="text-xs mt-1 text-center max-w-xs text-gray-500 font-sans">
                启动代理后将显示实时日志
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-400">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                <ScrollText className="w-6 h-6 opacity-40" />
              </div>
              <p className="font-semibold text-sm text-gray-900 dark:text-white font-sans">
                {searchQuery ? '未找到匹配日志' : '暂无日志'}
              </p>
              <p className="text-xs mt-1 text-center max-w-xs text-gray-500 font-sans">
                {searchQuery
                  ? '请尝试更换搜索关键词'
                  : '等待日志输出...'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-zinc-800/30">
              {filteredLogs.map((log, index) => {
                const Icon = getLogIcon(log.type);
                return (
                  <div
                    key={index}
                    className="group flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5",
                      getLogColor(log.type)
                    )}>
                      <Icon className="w-2.5 h-2.5" />
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 tabular-nums">
                      {log.timestamp}
                    </span>

                    {/* Level Badge */}
                    <span className={cn(
                      "text-[9px] font-medium px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-wide",
                      getLogBadgeStyle(log.type)
                    )}>
                      {log.type}
                    </span>

                    {/* Message */}
                    <span className="text-xs text-gray-700 dark:text-gray-300 break-all leading-[1.6]">
                      {log.payload}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BentoCard>
    </div>
  );
}
