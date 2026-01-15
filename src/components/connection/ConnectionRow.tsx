import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getConnectionKeyInfo } from '@/utils/connection';
import { formatBytes, formatDuration } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProcessIcon } from './ProcessIcon';
import type { Connection } from '@/types/proxy';
import { TextWithFlag } from '@/components/ui/RegionFlag';

interface ConnectionRowProps {
  connection: Connection;
  now: number;
  /** 是否启用关键词点击过滤 */
  enableKeywordFilter?: boolean;
  /** 添加关键词过滤回调 */
  onAddKeyword?: (keyword: string) => void;
  /** 关闭连接回调 */
  onClose?: (id: string) => void;
  /** 是否禁用关闭按钮 */
  closeDisabled?: boolean;
  /** 连接是否仍然活跃（用于区分历史记录中的已关闭连接） */
  isActive?: boolean;
  /** 右侧自定义操作区（如复制 URL / curl） */
  actions?: ReactNode;
}

export function ConnectionRow({
  connection: c,
  now,
  enableKeywordFilter = false,
  onAddKeyword,
  onClose,
  closeDisabled = false,
  isActive = true,
  actions,
}: ConnectionRowProps) {
  const { host, process } = getConnectionKeyInfo(c);
  const durationMs = now ? Math.max(0, now - new Date(c.start).getTime()) : 0;
  const upload = formatBytes(c.upload);
  const download = formatBytes(c.download);

  const handleKeywordClick = (keyword: string) => {
    if (enableKeywordFilter && onAddKeyword) {
      onAddKeyword(keyword);
    }
  };

  // 可点击元素的样式
  const clickableClass = enableKeywordFilter
    ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
    : '';

  return (
    <div
      className={cn(
        'group px-6 py-3 border-b border-gray-50 dark:border-zinc-800/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors',
        !isActive && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-4">
        <ProcessIcon
          processName={c.metadata.process}
          processPath={c.metadata.processPath}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* 第一行：Host + 标签 */}
          <div className="flex items-center gap-2 min-w-0">
            {enableKeywordFilter ? (
              <button
                type="button"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate hover:text-blue-600 dark:hover:text-blue-400 text-left transition-colors"
                onClick={() => handleKeywordClick(host)}
                title="点击筛选此 Host"
              >
                {host}
              </button>
            ) : (
              <div
                className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
                title={host}
              >
                {host}
              </div>
            )}
            <div className="flex gap-1.5 shrink-0">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 bg-transparent border-gray-200 dark:border-zinc-700 text-gray-500"
              >
                {c.metadata.network}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 bg-transparent border-gray-200 dark:border-zinc-700 text-gray-500"
              >
                {c.metadata.type}
              </Badge>
              {!isActive && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 bg-gray-100 dark:bg-zinc-800 text-gray-500"
                >
                  已关闭
                </Badge>
              )}
            </div>
          </div>

          {/* 第二行：进程、规则、链路 */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5 min-w-0 max-w-[200px]">
              <span className="shrink-0 text-gray-400">进程</span>
              {enableKeywordFilter ? (
                <button
                  type="button"
                  className={cn('truncate text-gray-700 dark:text-gray-300', clickableClass)}
                  onClick={() => handleKeywordClick(process)}
                  title="点击筛选此进程"
                >
                  {process}
                </button>
              ) : (
                <span className="truncate text-gray-700 dark:text-gray-300" title={process}>
                  {process}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 max-w-[200px]">
              <span className="shrink-0 text-gray-400">规则</span>
              <span className="truncate">{c.rule}</span>
              {c.rulePayload && <span className="text-gray-400 truncate">({c.rulePayload})</span>}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-gray-400">链路</span>
              <div className="flex items-center gap-1 overflow-hidden">
                {c.chains.length > 0 ? (
                  enableKeywordFilter ? (
                    // 反转 chains 顺序：API 返回的是 [最终节点, ..., 策略组]，显示为 策略组 → ... → 最终节点
                    c.chains
                      .slice()
                      .reverse()
                      .map((ch, i) => {
                        const translated = ch === 'DIRECT' ? '直连' : ch === 'REJECT' ? '拒绝' : ch;
                        return (
                          <div key={i} className="flex items-center">
                            {i > 0 && <span className="text-gray-300 mx-1">→</span>}
                            <button
                              type="button"
                              className={cn('truncate max-w-[150px]', clickableClass)}
                              onClick={() => handleKeywordClick(ch)}
                              title="点击筛选此节点"
                            >
                              <TextWithFlag text={translated} />
                            </button>
                          </div>
                        );
                      })
                  ) : (
                    <span
                      className="truncate max-w-[300px]"
                      title={c.chains
                        .slice()
                        .reverse()
                        .map((x) => (x === 'DIRECT' ? '直连' : x === 'REJECT' ? '拒绝' : x))
                        .join(' → ')}
                    >
                      <TextWithFlag
                        text={c.chains
                          .slice()
                          .reverse()
                          .map((x) => (x === 'DIRECT' ? '直连' : x === 'REJECT' ? '拒绝' : x))
                          .join(' → ')}
                      />
                    </span>
                  )
                ) : (
                  <span className="text-gray-400">直连</span>
                )}
              </div>
            </div>
          </div>

          {/* 第三行：IP 地址、时长、流量 */}
          <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium pt-0.5">
            <div className="flex items-center gap-1.5">
              <span>
                {c.metadata.sourceIP}:{c.metadata.sourcePort}
              </span>
              <span className="text-gray-300">→</span>
              <span>
                {c.metadata.destinationIP}:{c.metadata.destinationPort}
              </span>
            </div>
            <div className="w-px h-2.5 bg-gray-200 dark:bg-zinc-700" />
            <div className="flex items-center gap-3 tabular-nums">
              <span>{formatDuration(durationMs)}</span>
              <span className="text-green-600 dark:text-green-400">↑ {upload}</span>
              <span className="text-blue-600 dark:text-blue-400">↓ {download}</span>
            </div>
          </div>
        </div>

        {/* 右侧操作区（hover 时显示） */}
        {(actions || (onClose && isActive)) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {actions}
            {onClose && isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => onClose(c.id)}
                disabled={closeDisabled}
                title="关闭连接"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
