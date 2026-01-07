import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Layers, Activity, ShieldAlert, Zap, CloudOff } from 'lucide-react';

// 简化的勾选图标
export const CheckIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

// 策略组类型图标映射
export const GROUP_TYPE_ICON_MAP: Record<string, typeof Layers> = {
  select: Layers,
  'url-test': Activity,
  fallback: ShieldAlert,
  'load-balance': Zap,
  relay: CloudOff,
};

// 卡片选择组件
interface SelectionCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  iconClassName?: string;
}

export function SelectionCard({
  selected,
  onClick,
  icon,
  title,
  description,
  badge,
  iconClassName,
}: SelectionCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
        selected
          ? 'bg-white/80 border-blue-500 shadow-[0_0_20px_rgba(0,122,255,0.2)]'
          : 'bg-white/45 border-transparent hover:bg-white/70 hover:border-white/70'
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center shadow-[0_4px_8px_rgba(0,0,0,0.06)]',
            selected ? 'bg-blue-600 text-white' : 'bg-white text-blue-600',
            iconClassName
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
            {badge && (
              <Badge variant="destructive" className="h-4 text-[9px] px-1 uppercase font-bold">
                {badge}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500 leading-relaxed">{description}</p>
        </div>
        {selected && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_12px_rgba(0,122,255,0.4)]">
            <CheckIcon />
          </div>
        )}
      </div>
    </div>
  );
}

// 表单输入框包装
interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {label}
      </label>
      {children}
      {error && (
        <div className="flex items-center gap-2 text-xs font-semibold text-red-500">{error}</div>
      )}
    </div>
  );
}

// 设置行组件（开关类型）
interface SettingRowProps {
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ReactNode;
  iconClassName?: string;
  switchClassName?: string;
}

export function SettingRow({
  title,
  description,
  checked,
  onCheckedChange,
  icon,
  iconClassName,
  switchClassName,
}: SettingRowProps) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className={cn('h-9 w-9 rounded-2xl flex items-center justify-center', iconClassName)}
          >
            {icon}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-neutral-800">{title}</div>
          {description && <div className="text-xs text-neutral-400">{description}</div>}
        </div>
      </div>
      <Switch
        className={cn('scale-90', switchClassName)}
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// 数字输入框
interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
}

export function NumberInput({ value, onChange, placeholder, className, error }: NumberInputProps) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold',
        error && 'border-red-400/60',
        className
      )}
      placeholder={placeholder}
    />
  );
}

// 勾选列表项
interface CheckableItemProps {
  label: string;
  checked: boolean;
  onClick: () => void;
  variant?: 'default' | 'provider';
  subtitle?: string;
  icon?: React.ReactNode;
}

export function CheckableItem({
  label,
  checked,
  onClick,
  variant = 'default',
  subtitle,
  icon,
}: CheckableItemProps) {
  const isProvider = variant === 'provider';

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all cursor-pointer',
        isProvider
          ? checked
            ? 'bg-orange-500/10 border-orange-400 shadow-[0_4px_10px_rgba(251,146,60,0.15)]'
            : 'bg-white/40 border-transparent hover:bg-white/70'
          : checked
            ? 'bg-white/90 border-blue-500 shadow-[0_4px_12px_rgba(0,0,0,0.06)]'
            : 'bg-white/40 border-transparent hover:bg-white/70'
      )}
    >
      {isProvider ? (
        <>
          <div
            className={cn(
              'h-7 w-7 rounded-xl flex items-center justify-center shrink-0',
              checked ? 'bg-orange-500 text-white' : 'bg-orange-500/10 text-orange-500'
            )}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-neutral-800 truncate">{label}</div>
            {subtitle && <div className="text-[10px] text-neutral-400">{subtitle}</div>}
          </div>
          {checked && <CheckIcon />}
        </>
      ) : (
        <>
          <div
            className={cn(
              'h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
              checked ? 'bg-blue-600 border-blue-600' : 'border-neutral-300'
            )}
          >
            {checked && <span className="text-white text-xs font-bold">✓</span>}
          </div>
          <span className="text-sm font-medium text-neutral-800 truncate">{label}</span>
        </>
      )}
    </div>
  );
}

// 面板容器
interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

export function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_24px_rgba(0,0,0,0.06)]',
        className
      )}
    >
      {children}
    </div>
  );
}

// 过滤器面板
interface FilterPanelProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  icon?: React.ReactNode;
}

export function FilterPanel({
  label,
  value,
  onChange,
  placeholder,
  error,
  icon,
}: FilterPanelProps) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {icon}
        {label}
        {error && (
          <Badge variant="destructive" className="h-4 px-1 text-[8px]">
            正则错误
          </Badge>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-10 rounded-xl bg-white/70 border border-white/70 text-sm font-mono',
          error && 'border-red-400/60 text-red-500'
        )}
      />
      <p className="text-xs text-neutral-400">
        使用正则表达式过滤节点名称，只有匹配的节点才会被包含
      </p>
    </div>
  );
}
