import React from 'react';
import { Edit3, Trash2, Layers, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProxyGroupConfig } from '@/types/config';
import { cn } from '@/utils/cn';
import { GROUP_TYPE_OPTIONS } from './utils';

const getGroupIcon = (type: string) => {
  switch (type) {
    case 'url-test':
      return Zap;
    case 'fallback':
      return AlertTriangle;
    case 'load-balance':
      return ShieldCheck;
    default:
      return Layers;
  }
};

const getIconStyles = (type: string) => {
  switch (type) {
    case 'url-test':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    case 'fallback':
      return 'bg-red-500/10 text-red-600 dark:text-red-400';
    case 'load-balance':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    default:
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  }
};

interface ProxyGroupListItemProps {
  group: ProxyGroupConfig;
  onEdit: () => void;
  onDelete: () => void;
  isRemote: boolean;
  isLast?: boolean;
}

export function ProxyGroupListItem({
  group,
  onEdit,
  onDelete,
  isRemote,
  isLast,
}: ProxyGroupListItemProps) {
  const Icon = getGroupIcon(group.type);
  const iconStyles = getIconStyles(group.type);
  const typeOption = GROUP_TYPE_OPTIONS.find((opt) => opt.value === group.type);

  return (
    <div className="group relative flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 transition-colors">
      {/* Left side: Icon + Name */}
      <div className="flex items-center gap-3.5">
        <div className={cn(
          "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] shrink-0",
          iconStyles
        )}>
          {React.createElement(Icon, { className: "h-[18px] w-[18px]", strokeWidth: 2.5 })}
        </div>
        <span className="text-[15px] font-medium tracking-[-0.2px] text-[#1D1D1F] dark:text-gray-100">
          {group.name}
        </span>
      </div>

      {/* Right side: Type + Actions */}
      <div className="flex items-center gap-4">
        <span className="text-[13px] text-[#86868B] dark:text-gray-400">
          {typeOption?.label || group.type}
        </span>

        {!isRemote && (
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-[#B0B0B5] transition-all hover:bg-[#E5E5EA] hover:text-[#1D1D1F] dark:hover:bg-zinc-700/50 dark:hover:text-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="编辑"
            >
              <Edit3 className="h-[14px] w-[14px]" strokeWidth={2} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-[#B0B0B5] transition-all hover:bg-[rgba(255,59,48,0.1)] hover:text-[#FF3B30] dark:hover:bg-red-500/20 dark:hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="删除"
            >
              <Trash2 className="h-[14px] w-[14px]" strokeWidth={2} />
            </Button>
          </div>
        )}
      </div>

      {/* Divider - iOS style with left offset */}
      {!isLast && (
        <div
          className="absolute bottom-0 right-0 h-px left-[64px] bg-[#E5E5EA] dark:bg-zinc-800/60"
          style={{ transform: 'scaleY(0.5)', transformOrigin: 'bottom' }}
        />
      )}
    </div>
  );
}
