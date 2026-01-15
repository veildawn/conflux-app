import { useMemo, useEffect, useState, useCallback, memo, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Activity,
  Cpu,
  RefreshCw,
  Network,
  Globe,
  Loader2,
  Wifi,
  Terminal,
} from 'lucide-react';
import { useProxyStore } from '@/stores/proxyStore';
import { formatSpeed, formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';
import logger from '@/utils/logger';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ipc } from '@/services/ipc';
import type { VersionInfo } from '@/types/proxy';
import type { LocalIpInfo, PublicIpInfo } from '@/types/network';
import { useToast } from '@/hooks/useToast';
import {
  GoogleIcon,
  YouTubeIcon,
  BaiduIcon,
  GitHubIcon,
  TwitterIcon,
  OpenAIIcon,
} from '@/components/icons/SiteIcons';
import { RegionFlag } from '@/components/ui/RegionFlag';

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

const BentoCard = memo(function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white/95 dark:bg-zinc-900/95 rounded-2xl px-4 py-3 shadow-xs border border-gray-100/50 dark:border-zinc-800/50 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-start mb-1.5 z-10">
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className={cn('w-3.5 h-3.5', iconColor)} />}
            {title && (
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10">{children}</div>
    </div>
  );
});

const StatValue = memo(function StatValue({
  value,
  unit,
  subtext,
}: {
  value: string | number;
  unit?: string;
  subtext?: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1">
        <span className="text-xl min-[960px]:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{unit}</span>
        )}
      </div>
      {subtext && (
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">
          {subtext}
        </span>
      )}
    </div>
  );
});

// -----------------------------------------------------------------------------
// Helper Data
// -----------------------------------------------------------------------------

const modeLabels: Record<string, string> = {
  rule: '规则判定',
  global: '全局代理',
  direct: '直连模式',
};

// 诊断测试站点
interface DiagnosticSite {
  name: string;
  url: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const DIAGNOSTIC_SITES: DiagnosticSite[] = [
  { name: 'Google', url: 'https://www.google.com', Icon: GoogleIcon },
  { name: 'YouTube', url: 'https://www.youtube.com', Icon: YouTubeIcon },
  { name: '百度', url: 'https://www.baidu.com', Icon: BaiduIcon },
  { name: 'GitHub', url: 'https://github.com', Icon: GitHubIcon },
  { name: 'Twitter', url: 'https://x.com', Icon: TwitterIcon },
  { name: 'OpenAI', url: 'https://chat.openai.com', Icon: OpenAIIcon },
];

interface SiteDelayResult {
  url: string;
  delay: number | null;
  error: string | null;
  loading: boolean;
}

// -----------------------------------------------------------------------------
// Diagnostic Card Component
// -----------------------------------------------------------------------------

// 前端直接测试单个 URL 延迟
async function testUrlDelay(url: string, timeout: number = 8000): Promise<SiteDelayResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const start = performance.now();
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors', // 允许跨域请求，不需要 CORS 头
      signal: controller.signal,
    });
    const elapsed = Math.round(performance.now() - start);
    clearTimeout(timeoutId);

    // no-cors 模式下能成功返回就说明连通
    return {
      url,
      delay: elapsed,
      error: null,
      loading: false,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMsg =
      error instanceof Error ? (error.name === 'AbortError' ? '超时' : '连接失败') : '未知错误';
    return {
      url,
      delay: null,
      error: errorMsg,
      loading: false,
    };
  }
}

// 初始化结果 Map
function createInitialResults(): Map<string, SiteDelayResult> {
  const initialResults = new Map<string, SiteDelayResult>();
  DIAGNOSTIC_SITES.forEach((site) => {
    initialResults.set(site.url, {
      url: site.url,
      delay: null,
      error: null,
      loading: false,
    });
  });
  return initialResults;
}

function DiagnosticCard({ className }: { className?: string }) {
  const [results, setResults] = useState<Map<string, SiteDelayResult>>(createInitialResults);
  const [isTestingAll, setIsTestingAll] = useState(false);

  const testAllSites = useCallback(async () => {
    if (isTestingAll) return;

    setIsTestingAll(true);

    // 设置所有站点为 loading 状态
    setResults((prev) => {
      const newResults = new Map(prev);
      DIAGNOSTIC_SITES.forEach((site) => {
        newResults.set(site.url, {
          url: site.url,
          delay: null,
          error: null,
          loading: true,
        });
      });
      return newResults;
    });

    // 并发测试所有站点
    const testPromises = DIAGNOSTIC_SITES.map((site) => testUrlDelay(site.url, 8000));
    const delayResults = await Promise.all(testPromises);

    setResults((prev) => {
      const newResults = new Map(prev);
      delayResults.forEach((result) => {
        newResults.set(result.url, result);
      });
      return newResults;
    });

    setIsTestingAll(false);
  }, [isTestingAll]);

  const getDelayColor = (delay: number | null, error: string | null) => {
    if (error || delay === null) return 'text-gray-400 dark:text-gray-500';
    if (delay < 200) return 'text-emerald-500';
    if (delay < 500) return 'text-amber-500';
    return 'text-red-500';
  };

  const getDelayBgColor = (delay: number | null, error: string | null) => {
    if (error || delay === null) return 'bg-gray-100 dark:bg-zinc-800';
    if (delay < 200) return 'bg-emerald-50 dark:bg-emerald-500/10';
    if (delay < 500) return 'bg-amber-50 dark:bg-amber-500/10';
    return 'bg-red-50 dark:bg-red-500/10';
  };

  return (
    <BentoCard
      title="网络诊断"
      icon={Globe}
      iconColor="text-indigo-500"
      className={cn(
        'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/20',
        className
      )}
      action={
        <button
          onClick={testAllSites}
          disabled={isTestingAll}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
            !isTestingAll
              ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-500/30'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
          )}
          title="测试所有站点"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isTestingAll && 'animate-spin')} />
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-1.5">
        {DIAGNOSTIC_SITES.map((site) => {
          const result = results.get(site.url);
          const isLoading = result?.loading ?? false;
          const delay = result?.delay ?? null;
          const error = result?.error ?? null;
          const SiteIcon = site.Icon;

          return (
            <div
              key={site.url}
              className={cn(
                'flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors',
                getDelayBgColor(delay, error)
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <SiteIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">
                  {site.name}
                </span>
              </div>
              <div className="shrink-0 ml-1.5">
                {isLoading ? (
                  <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                ) : delay !== null ? (
                  <span
                    className={cn(
                      'text-[11px] font-mono font-semibold',
                      getDelayColor(delay, error)
                    )}
                  >
                    {delay}ms
                  </span>
                ) : error ? (
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    {error === '超时' ? '超时' : '失败'}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    --
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}

// -----------------------------------------------------------------------------
// Public IP + LAN IP Cards (FlClash-like)
// -----------------------------------------------------------------------------

function PublicIpCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PublicIpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const reqSeqRef = useRef(0);

  const copy = useCallback(
    async (text: string) => {
      try {
        await ipc.copyToClipboard(text);
        toast({ title: '已复制', description: text });
      } catch (e) {
        toast({
          title: '复制失败',
          description: e instanceof Error ? e.message : '无法写入剪贴板',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const mySeq = ++reqSeqRef.current;

    const run = async () => {
      // 避免刷新时清空已有数据导致 UI 闪烁
      setLoading(true);
      setError((prev) => (data ? prev : null));
      try {
        const res = await Promise.race([
          ipc.getPublicIpInfo(),
          new Promise<PublicIpInfo | null>((_, reject) =>
            setTimeout(() => reject(new Error('超时')), 12_000)
          ),
        ]);
        if (mySeq !== reqSeqRef.current) return;
        if (res) {
          setData(res);
          setError(null);
        } else if (!data) {
          setError('获取失败');
        }
      } catch (e) {
        if (mySeq !== reqSeqRef.current) return;
        // 有旧数据时失败不覆盖，避免闪烁
        if (!data) setData(null);
        if (!data) setError(e instanceof Error ? e.message : '获取失败');
      } finally {
        if (mySeq === reqSeqRef.current) setLoading(false);
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BentoCard
      title="公网 IP"
      icon={Globe}
      iconColor="text-emerald-500"
      className={cn(
        'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20',
        className
      )}
      action={
        <button
          onClick={refresh}
          disabled={loading}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
            !loading
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
          )}
          title="刷新"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 h-full">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-emerald-100/70 dark:border-emerald-900/30 flex items-center justify-center shrink-0">
            {data ? (
              <RegionFlag code={data.regionCode} />
            ) : (
              <span className="text-2xl leading-none">🌐</span>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              disabled={!data?.ip}
              onClick={() => data?.ip && copy(data.ip)}
              className={cn(
                'text-left font-mono font-semibold truncate w-full',
                data?.ip?.includes(':') ? 'text-xs' : 'text-base',
                data?.ip
                  ? 'text-gray-900 dark:text-white hover:underline underline-offset-2 cursor-pointer'
                  : 'text-gray-900 dark:text-white cursor-default'
              )}
              title={data?.ip ? '点击复制' : undefined}
            >
              {data?.ip || (loading ? '获取中...' : '--')}
            </button>
            {!data && error && (
              <div className="text-[10px] font-medium text-red-500/80 dark:text-red-400/80 truncate mt-0.5">
                {error}
              </div>
            )}
          </div>
        </div>
        {data?.regionCode && (
          <div className="shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/20">
              {data.regionCode.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </BentoCard>
  );
}

function LanIpCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LocalIpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const reqSeqRef = useRef(0);

  const copy = useCallback(
    async (text: string) => {
      try {
        await ipc.copyToClipboard(text);
        toast({ title: '已复制', description: text });
      } catch (e) {
        toast({
          title: '复制失败',
          description: e instanceof Error ? e.message : '无法写入剪贴板',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const mySeq = ++reqSeqRef.current;

    const run = async () => {
      setLoading(true);
      setError((prev) => (data ? prev : null));
      try {
        const res = await Promise.race([
          ipc.getLocalIpInfo(),
          new Promise<LocalIpInfo>((_, reject) =>
            setTimeout(() => reject(new Error('超时')), 12_000)
          ),
        ]);
        if (mySeq !== reqSeqRef.current) return;
        setData(res);
        if (!res.preferredIpv4 && res.ipv4.length === 0 && res.ipv6.length === 0) {
          setError('未发现网卡地址');
        }
      } catch (e) {
        if (mySeq !== reqSeqRef.current) return;
        if (!data) setData(null);
        if (!data) setError(e instanceof Error ? e.message : '获取失败');
      } finally {
        if (mySeq === reqSeqRef.current) setLoading(false);
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const primary = data?.preferredIpv4 || data?.ipv4?.[0] || data?.ipv6?.[0] || null;

  return (
    <BentoCard
      title="局域网 IP"
      icon={Wifi}
      iconColor="text-sky-500"
      className={cn(
        'bg-sky-50/50 dark:bg-sky-900/10 border-sky-100 dark:border-sky-900/20',
        className
      )}
      action={
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              try {
                const cmd = await ipc.copyTerminalProxyCommand();
                toast({ title: '已复制终端代理命令', description: cmd });
              } catch (e) {
                toast({
                  title: '复制失败',
                  description: e instanceof Error ? e.message : '无法写入剪贴板',
                  variant: 'destructive',
                });
              }
            }}
            className={cn(
              'p-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
              'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-500/30'
            )}
            title="复制终端代理命令"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className={cn(
              'p-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
              !loading
                ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-500/30'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
            )}
            title="刷新"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <button
            type="button"
            disabled={!primary}
            onClick={() => primary && copy(primary)}
            className={cn(
              'text-left font-mono font-semibold truncate w-full',
              primary?.includes(':') ? 'text-xs' : 'text-base',
              primary
                ? 'text-gray-900 dark:text-white hover:underline underline-offset-2 cursor-pointer'
                : 'text-gray-900 dark:text-white cursor-default'
            )}
            title={primary ? '点击复制' : undefined}
          >
            {primary || (loading ? '获取中...' : '--')}
          </button>
        </div>
        {!primary && error ? (
          <div className="text-[10px] font-medium text-red-500/80 dark:text-red-400/80 mt-1 truncate">
            {error}
          </div>
        ) : data ? (
          <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1">
            {`${data.ipv4.length} 个 IPv4 / ${data.ipv6.length} 个 IPv6`}
          </div>
        ) : null}
      </div>
    </BentoCard>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Home() {
  const { status, traffic, trafficHistory, connectionStats, restart, loading } = useProxyStore();

  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  // 获取核心版本信息
  useEffect(() => {
    const fetchVersion = async () => {
      if (!status.running) {
        setVersionInfo(null);
        return;
      }
      setVersionLoading(true);
      try {
        const version = await ipc.getCoreVersion();
        setVersionInfo(version);
      } catch (error) {
        logger.debug('Failed to fetch version:', error);
        setVersionInfo(null);
      } finally {
        setVersionLoading(false);
      }
    };

    fetchVersion();
  }, [status.running]);

  // 计算进程列表
  /* const processList = useMemo(() => {
    const processMap = new Map<string, { name: string; upload: number; download: number }>();

    // 如果没有连接数据，返回空列表
    if (!connections || connections.length === 0) {
      return [];
    }

    for (const conn of connections) {
      // 优先使用 metadata 中的 process，如果没有则尝试从 chains 推断或标记为 Unknown
      const processName = conn.metadata.process || 'Unknown';
      const existing = processMap.get(processName);
      if (existing) {
        existing.upload += conn.upload;
        existing.download += conn.download;
      } else {
        processMap.set(processName, {
          name: processName,
          upload: conn.upload,
          download: conn.download,
        });
      }
    }

    return Array.from(processMap.values())
      .sort((a, b) => (b.upload + b.download) - (a.upload + a.download))
      .slice(0, 10);
  }, [connections]); */

  // 图表数据
  const chartData = useMemo(() => {
    if (trafficHistory.length === 0) {
      return Array.from({ length: 40 }, (_, i) => ({ name: i, up: 0, down: 0 }));
    }
    return trafficHistory.map((point, i) => ({
      name: i,
      up: point.up,
      down: point.down,
    }));
  }, [trafficHistory]);

  const [upVal, upUnit] = formatSpeed(traffic.up).split(' ');
  const [downVal, downUnit] = formatSpeed(traffic.down).split(' ');
  const [totalVal, totalUnit] = formatBytes(
    connectionStats.downloadTotal + connectionStats.uploadTotal
  ).split(' ');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">活动</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Row 1 */}

        {/* Status Card */}
        <BentoCard className="col-span-1 md:col-span-2 lg:col-span-2 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800">
          <div className="flex justify-between h-full">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-md flex items-center justify-center transition-colors',
                      status.running
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    核心状态
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {versionLoading ? '加载中...' : versionInfo?.version || '未知'}
                  </span>
                </div>
              </div>

              <div className="flex gap-5 mt-2">
                <div>
                  <div className="text-[9px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-0.5">
                    端口
                  </div>
                  <div className="text-base font-mono font-medium text-gray-700 dark:text-gray-300">
                    {status.port}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-0.5">
                    SOCKS5
                  </div>
                  <div className="text-base font-mono font-medium text-gray-700 dark:text-gray-300">
                    {status.socks_port}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-0.5">
                    模式
                  </div>
                  <div className="text-base font-medium text-gray-700 dark:text-gray-300">
                    {modeLabels[status.mode] || status.mode}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                {/* 运行模式标签 */}
                {status.running && status.run_mode && status.run_mode !== 'normal' && (
                  <div
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium',
                      status.run_mode === 'service'
                        ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400'
                        : 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {status.run_mode === 'service' && '服务模式'}
                    {status.run_mode === 'admin_win' && '管理员模式'}
                    {status.run_mode === 'helper_mac' && '助手模式'}
                  </div>
                )}
                {/* 运行状态标签 */}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors duration-200',
                    status.running
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400'
                  )}
                >
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      status.running ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                    )}
                  />
                  <span className="text-[11px] font-medium">
                    {status.running ? '核心运行中' : '核心已停止'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => restart()}
                disabled={!status.running || loading}
                className={cn(
                  'p-2.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 border',
                  status.running && !loading
                    ? 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 shadow-sm'
                    : 'bg-gray-50 dark:bg-zinc-800/50 text-gray-400 border-transparent cursor-not-allowed'
                )}
                title="重启核心"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </button>
            </div>
          </div>
        </BentoCard>

        {/* Active Connections */}
        <BentoCard title="连接" icon={Network} iconColor="text-orange-500">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {connectionStats.totalConnections}
              </span>
            </div>
          </div>
        </BentoCard>

        {/* Total Traffic */}
        <BentoCard title="总流量" icon={Activity} iconColor="text-blue-500">
          <div className="flex flex-col h-full justify-between">
            <StatValue value={totalVal} unit={totalUnit} />

            <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mt-2 flex overflow-hidden">
              <div
                className="h-full bg-purple-500"
                style={{
                  width:
                    connectionStats.downloadTotal + connectionStats.uploadTotal > 0
                      ? `${(connectionStats.uploadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%`
                      : '0%',
                }}
              />
              <div
                className="h-full bg-cyan-500"
                style={{
                  width:
                    connectionStats.downloadTotal + connectionStats.uploadTotal > 0
                      ? `${(connectionStats.downloadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%`
                      : '0%',
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-medium text-gray-400 mt-1.5">
              <span className="text-purple-500">
                {formatBytes(connectionStats.uploadTotal)} 上传
              </span>
              <span className="text-cyan-500">
                {formatBytes(connectionStats.downloadTotal)} 下载
              </span>
            </div>
          </div>
        </BentoCard>

        {/* Row 2 */}

        {/* Upload Speed */}
        <BentoCard
          title="上传"
          icon={ArrowUp}
          iconColor="text-purple-500"
          className="col-span-1 md:col-span-2 bg-purple-50/50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/20"
        >
          <div className="flex flex-col h-full justify-between">
            <StatValue value={upVal} unit={upUnit} />
            <div className="h-10 w-full mt-1 -mb-1 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="up"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill="url(#gradUp)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </BentoCard>

        {/* Download Speed */}
        <BentoCard
          title="下载"
          icon={ArrowDown}
          iconColor="text-cyan-500"
          className="col-span-1 md:col-span-2 bg-cyan-50/50 dark:bg-cyan-900/10 border-cyan-100 dark:border-cyan-900/20"
        >
          <div className="flex flex-col h-full justify-between">
            <StatValue value={downVal} unit={downUnit} />
            <div className="h-10 w-full mt-1 -mb-1 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="down"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#gradDown)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </BentoCard>

        {/* Row 3 */}

        {/* Public IP */}
        <PublicIpCard className="col-span-1 md:col-span-2" />

        {/* LAN IP */}
        <LanIpCard className="col-span-1 md:col-span-2" />

        {/* Row 4 */}

        {/* Diagnostic Card */}
        <DiagnosticCard className="col-span-1 md:col-span-2 lg:col-span-4" />
      </div>
    </div>
  );
}
