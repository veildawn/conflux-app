import { useMemo, useEffect, useState } from 'react';
import { 
  ArrowDown, 
  ArrowUp,
  Activity,
  Cpu,
  Power,
  RefreshCw,
  Globe,
  Shield,
  Zap,
  Network
} from 'lucide-react';
import { useProxyStore } from '@/stores/proxyStore';
import { formatSpeed, formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';
import { AreaChart, Area, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis } from 'recharts';
import { ipc } from '@/services/ipc';
import type { VersionInfo } from '@/types/proxy';

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
      "bg-white dark:bg-zinc-900 rounded-[20px] p-5 shadow-xs border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
      className
    )}>
      {(title || Icon) && (
        <div className="flex justify-between items-start mb-3 z-10">
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
      <div className="flex-1 z-10">{children}</div>
    </div>
  );
}

function StatValue({ value, unit, subtext }: { value: string | number; unit?: string; subtext?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {value}
        </span>
        {unit && (
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {unit}
          </span>
        )}
      </div>
      {subtext && (
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-0.5">
          {subtext}
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helper Data
// -----------------------------------------------------------------------------

const processColors = [
  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'bg-green-500/10 text-green-600 dark:text-green-400',
  'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
];

const modeLabels: Record<string, string> = {
  rule: '规则判定',
  global: '全局代理',
  direct: '直连模式',
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function Home() {
  const {
    status,
    traffic,
    trafficHistory,
    connections,
    connectionStats,
    restart,
    loading,
  } = useProxyStore();
  
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  // 获取核心版本信息
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
      console.debug('Failed to fetch version:', error);
      setVersionInfo(null);
    } finally {
      setVersionLoading(false);
    }
  };

  useEffect(() => {
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
  const [totalVal, totalUnit] = formatBytes(connectionStats.downloadTotal + connectionStats.uploadTotal).split(' ');

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">活动</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Row 1 */}
        
        {/* Status Card */}
        <BentoCard className="col-span-1 md:col-span-2 lg:col-span-2 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800">
          <div className="flex justify-between h-full">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                   <div className={cn(
                     "w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                     status.running ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 text-gray-500"
                   )}>
                     <Cpu className="w-4 h-4" />
                   </div>
                   <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">核心状态</span>
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                   <span className="text-2xl font-bold text-gray-900 dark:text-white">
                     {versionLoading ? '加载中...' : versionInfo?.version || '未知'}
                   </span>
                </div>
              </div>
              
              <div className="flex gap-6 mt-4">
                <div>
                  <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1">端口</div>
                  <div className="text-lg font-mono font-medium text-gray-700 dark:text-gray-300">{status.port}</div>
                </div>
                <div>
                   <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1">SOCKS5</div>
                   <div className="text-lg font-mono font-medium text-gray-700 dark:text-gray-300">{status.socks_port}</div>
                </div>
                 <div>
                   <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1">模式</div>
                   <div className="text-lg font-medium text-gray-700 dark:text-gray-300">{modeLabels[status.mode] || status.mode}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between items-end">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300",
                status.running 
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400"
              )}>
                 <div className={cn(
                   "w-1.5 h-1.5 rounded-full", 
                   status.running ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                 )} />
                 <span className="text-xs font-medium">
                   {status.running ? '核心运行中' : '核心已停止'}
                 </span>
              </div>
              
              <button
                onClick={() => restart()}
                disabled={!status.running || loading}
                className={cn(
                  "p-3 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 border",
                  status.running && !loading
                    ? "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 shadow-sm"
                    : "bg-gray-50 dark:bg-zinc-800/50 text-gray-400 border-transparent cursor-not-allowed"
                )}
                title="重启核心"
              >
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </BentoCard>

        {/* Upload Speed */}
        <BentoCard title="上传" icon={ArrowUp} iconColor="text-purple-500" className="bg-purple-50/50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/20">
          <div className="flex flex-col h-full justify-between">
            <StatValue value={upVal} unit={upUnit} />
            <div className="h-12 w-full mt-2 -mb-2 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="up" stroke="#a855f7" strokeWidth={2} fill="url(#gradUp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </BentoCard>

        {/* Download Speed */}
        <BentoCard title="下载" icon={ArrowDown} iconColor="text-cyan-500" className="bg-cyan-50/50 dark:bg-cyan-900/10 border-cyan-100 dark:border-cyan-900/20">
          <div className="flex flex-col h-full justify-between">
             <StatValue value={downVal} unit={downUnit} />
             <div className="h-12 w-full mt-2 -mb-2 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                   <defs>
                    <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="down" stroke="#06b6d4" strokeWidth={2} fill="url(#gradDown)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </BentoCard>

        {/* Row 2 */}

        {/* Active Connections */}
        <BentoCard title="连接" icon={Network} iconColor="text-orange-500">
           <div className="flex flex-col h-full justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{connectionStats.totalConnections}</span>
              </div>
           </div>
        </BentoCard>

        {/* Total Traffic */}
        <BentoCard title="总流量" icon={Activity} iconColor="text-blue-500">
           <div className="flex flex-col h-full justify-between">
              <StatValue value={totalVal} unit={totalUnit} />
              
              <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mt-3 flex overflow-hidden">
                <div 
                  className="h-full bg-purple-500" 
                  style={{ width: connectionStats.downloadTotal + connectionStats.uploadTotal > 0 ? `${(connectionStats.uploadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%` : '0%' }}
                />
                <div 
                  className="h-full bg-cyan-500"
                  style={{ width: connectionStats.downloadTotal + connectionStats.uploadTotal > 0 ? `${(connectionStats.downloadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%` : '0%' }}
                />
              </div>
              
              <div className="flex justify-between text-[10px] font-medium text-gray-400 mt-2">
                <span className="text-purple-500">{formatBytes(connectionStats.uploadTotal)} 上传</span>
                <span className="text-cyan-500">{formatBytes(connectionStats.downloadTotal)} 下载</span>
              </div>
           </div>
        </BentoCard>

      </div>
    </div>
  );
}
