import { cn } from '@/utils/cn';

/**
 * Bento 风格卡片组件
 */
interface BentoCardProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}

export function BentoCard({
  className,
  children,
  title,
  description,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        'bg-white/95 dark:bg-zinc-900/95 rounded-[20px] shadow-sm border border-gray-100/50 dark:border-zinc-800/50 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || description || Icon) && (
        <div className="flex justify-between items-start px-5 pt-5 pb-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {Icon && <Icon className={cn('w-4 h-4', iconColor)} />}
              {title && (
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
              )}
            </div>
            {description && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {description}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 w-full">{children}</div>
    </div>
  );
}

/**
 * 设置项组件
 */
interface SettingItemProps {
  icon?: React.ElementType;
  iconBgColor?: string;
  iconColor?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SettingItem({
  icon: Icon,
  iconBgColor = 'bg-gray-100 dark:bg-zinc-800',
  iconColor = 'text-gray-500',
  title,
  description,
  action,
  className,
}: SettingItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 px-5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              iconBgColor,
              iconColor
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
            {title}
          </span>
          {description && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[200px] md:max-w-[300px]">
              {description}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4 flex items-center gap-2">{action}</div>
    </div>
  );
}

/**
 * 分隔线
 */
export function Divider() {
  return <div className="h-px bg-gray-100 dark:bg-zinc-800 mx-5" />;
}

/**
 * 区域标题
 */
export function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 px-1 mb-3 mt-8 first:mt-0 uppercase tracking-wider">
      {title}
    </h2>
  );
}

/**
 * 控件基础样式
 */
export const CONTROL_BASE_CLASS =
  'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-blue-500/50 h-7 text-xs shadow-none';
