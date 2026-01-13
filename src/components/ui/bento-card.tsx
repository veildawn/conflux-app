import { cn } from '@/utils/cn';

interface BentoCardProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function BentoCard({ className, children, title, action }: BentoCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-[20px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {title}
          </span>
          {action}
        </div>
      )}
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}
