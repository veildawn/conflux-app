import { useMemo } from 'react';
import { 
  RotateCw, 
  ArrowDown
} from 'lucide-react';
import { useProxyStore } from '@/stores/proxyStore';
import { formatSpeed, formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';
import { AreaChart, Area, ResponsiveContainer, Tooltip, BarChart, Bar } from 'recharts';

// 代理模式映射
const modeLabels: Record<string, string> = {
  rule: '规则判定',
  global: '全局代理',
  direct: '直连模式',
};

// 进程颜色映射
const processColors = [
  'bg-blue-100 text-blue-600',
  'bg-green-100 text-green-600',
  'bg-purple-100 text-purple-600',
  'bg-orange-100 text-orange-600',
  'bg-cyan-100 text-cyan-600',
  'bg-pink-100 text-pink-600',
  'bg-indigo-100 text-indigo-600',
  'bg-amber-100 text-amber-600',
];

export default function Home() {
  const {
    status,
    traffic,
    trafficHistory,
    connections,
    connectionStats,
  } = useProxyStore();

  // 计算进程列表（按流量排序）
  const processList = useMemo(() => {
    const processMap = new Map<string, { name: string; upload: number; download: number }>();
    
    for (const conn of connections) {
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
      .slice(0, 8);
  }, [connections]);

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

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      <div>
        <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 tracking-tight">活动</h1>
      </div>

      <div className="grid gap-2 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,260px)] min-[960px]:gap-4">
        <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 min-[960px]:gap-6">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">代理状态</div>
            <div className={cn(
              "text-base min-[960px]:text-xl font-semibold flex items-center gap-2",
              status.system_proxy ? "text-green-600" : "text-gray-400"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                status.system_proxy ? "bg-green-500 animate-pulse" : "bg-gray-300"
              )}></div>
              {status.system_proxy ? '已开启' : '未开启'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">端口</div>
            <div className="text-base min-[960px]:text-xl font-semibold text-gray-900 font-mono">{status.port}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">出站模式</div>
            <div className="text-base min-[960px]:text-xl font-semibold text-gray-900">{modeLabels[status.mode] || status.mode}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              SOCKS 端口 <ArrowDown className="w-3 h-3" />
            </div>
            <div className="text-sm min-[960px]:text-lg font-semibold text-gray-900 font-mono">{status.socks_port}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,260px)] min-[960px]:gap-4">
        <div className="flex flex-col gap-2 min-[960px]:gap-4 h-full">
          {/* 实时速度 */}
          <div className="bg-white dark:bg-zinc-800 rounded-[24px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                实时速度 <RotateCw className="w-3 h-3 cursor-pointer hover:animate-spin" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">上传</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"></div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">下载</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">上传</div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl min-[960px]:text-3xl font-bold text-purple-600 dark:text-purple-400">{formatSpeed(traffic.up).split(' ')[0]}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{formatSpeed(traffic.up).split(' ')[1]}</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">下载</div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl min-[960px]:text-3xl font-bold text-cyan-600 dark:text-cyan-400">{formatSpeed(traffic.down).split(' ')[0]}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{formatSpeed(traffic.down).split(' ')[1]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 活动连接 */}
          <div className="bg-white dark:bg-zinc-800 rounded-[24px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">活动连接</div>
                <div className="text-3xl min-[960px]:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">{connectionStats.totalConnections}</div>
              </div>
              <div className={cn(
                "w-2.5 h-2.5 rounded-full shadow-[0_0_6px_rgba(34,197,94,0.4)]",
                status.system_proxy ? "bg-green-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
              )}></div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-[960px]:gap-8 mt-3 min-[960px]:mt-6">
              <div>
                <div className="text-xl min-[960px]:text-2xl font-bold text-gray-900 dark:text-white">{connectionStats.totalProcesses}</div>
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wider">进程</div>
              </div>
              <div>
                <div className="text-xl min-[960px]:text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(connectionStats.downloadTotal + connectionStats.uploadTotal)}</div>
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wider">总流量</div>
              </div>
            </div>
          </div>

          {/* 总计 */}
          <div className="bg-white dark:bg-zinc-800 rounded-[24px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700 flex flex-col md:flex-row justify-between items-end md:items-center gap-2 min-[960px]:gap-4">
            <div>
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">会话总计</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl min-[960px]:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {formatBytes(connectionStats.downloadTotal + connectionStats.uploadTotal).split(' ')[0]}
                </span>
                <span className="text-lg font-medium text-gray-500 dark:text-gray-400">
                  {formatBytes(connectionStats.downloadTotal + connectionStats.uploadTotal).split(' ')[1]}
                </span>
              </div>
              <div className="flex gap-3 min-[960px]:gap-4 mt-2 min-[960px]:mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                <span>上传 <strong className="text-purple-600 dark:text-purple-400 ml-0.5">{formatBytes(connectionStats.uploadTotal)}</strong></span>
                <span>下载 <strong className="text-cyan-600 dark:text-cyan-400 ml-0.5">{formatBytes(connectionStats.downloadTotal)}</strong></span>
              </div>

              {/* Progress Bar */}
              <div className="w-56 h-1.5 bg-gray-200/50 dark:bg-gray-700/50 rounded-full mt-2 min-[960px]:mt-3 flex overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300 shadow-[0_0_8px_rgba(168,85,247,0.4)]" 
                  style={{ 
                    width: connectionStats.downloadTotal + connectionStats.uploadTotal > 0 
                      ? `${(connectionStats.uploadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%` 
                      : '0%' 
                  }}
                ></div>
                <div 
                  className="h-full bg-cyan-500 transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                  style={{ 
                    width: connectionStats.downloadTotal + connectionStats.uploadTotal > 0 
                      ? `${(connectionStats.downloadTotal / (connectionStats.downloadTotal + connectionStats.uploadTotal)) * 100}%` 
                      : '0%' 
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Traffic Chart & Process List */}
        <div className="space-y-2 min-[960px]:space-y-4">
          {/* Speed Cards Row */}
          <div className="grid grid-cols-2 gap-2 min-[960px]:gap-3">
            {/* Upload */}
            <div className="bg-white dark:bg-zinc-800 rounded-[20px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700">
              <div className="flex justify-between items-start mb-2 min-[960px]:mb-3">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">上传</div>
              </div>
              <div className="text-lg min-[960px]:text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2 min-[960px]:mb-3">
                {formatSpeed(traffic.up).split(' ')[0]}
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-0.5">{formatSpeed(traffic.up).split(' ')[1]}</span>
              </div>
              <div className="h-5 w-full opacity-70">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorUpSmall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="up" stroke="#a855f7" strokeWidth={1.5} fill="url(#colorUpSmall)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Download */}
            <div className="bg-white dark:bg-zinc-800 rounded-[20px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700">
              <div className="flex justify-between items-start mb-2 min-[960px]:mb-3">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">下载</div>
              </div>
              <div className="text-lg min-[960px]:text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2 min-[960px]:mb-3">
                {formatSpeed(traffic.down).split(' ')[0]}
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-0.5">{formatSpeed(traffic.down).split(' ')[1]}</span>
              </div>
              <div className="h-5 w-full opacity-70">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorDownSmall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="down" stroke="#06b6d4" strokeWidth={1.5} fill="url(#colorDownSmall)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-[24px] pt-4 pb-2 px-3 min-[960px]:p-5 shadow-sm border border-gray-100 dark:border-zinc-700 flex flex-col flex-1 min-h-0">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">流量历史</div>
            </div>

            <div className="h-24 min-[960px]:h-36 w-full mb-3 min-[960px]:mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap={6} barGap={2}>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.1)', padding: '8px' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 600 }}
                    formatter={(value, name) => [formatSpeed(value as number), name === 'down' ? '下载' : '上传']}
                  />
                  <Bar dataKey="down" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="up" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 pb-2 mb-2 min-[960px]:mb-3">
              <span className="uppercase tracking-wider">活跃进程</span>
              <span>{processList.length} 个进程</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-[960px]:space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-200/50 dark:scrollbar-thumb-gray-700/50">
              {processList.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-4">暂无活跃进程</div>
              ) : (
                processList.map((proc, i) => (
                  <div key={proc.name} className="flex justify-between items-center group cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/50 p-1 rounded-lg transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shadow-sm", processColors[i % processColors.length])}>
                        {proc.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-black dark:group-hover:text-white truncate max-w-[120px]">{proc.name}</span>
                    </div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{formatBytes(proc.upload + proc.download)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
