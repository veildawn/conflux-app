import { cn } from '@/utils/cn';

interface BentoCardProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}

export function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn('w-4 h-4', iconColor)} />}
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
