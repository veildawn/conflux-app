import { cn } from '@/utils/cn';

interface IconProps {
  className?: string;
  strokeWidth?: number;
}

// 连接 - 实时数据流动
export function ConnectionIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 左侧策略 */}
      <circle cx="5" cy="12" r="2" />
      {/* 右侧策略 */}
      <circle cx="19" cy="12" r="2" />
      {/* 连接线带数据流动感 */}
      <path d="M7 12h3" />
      <path d="M14 12h3" />
      {/* 中间的数据包 */}
      <rect x="10" y="10" width="4" height="4" rx="1" />
    </svg>
  );
}

// 概览 - 仪表盘网格
export function OverviewIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 四宫格布局 */}
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

// 配置 - 配置文件/文档堆叠
export function ProfileIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 底层文档 */}
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      {/* 顶层文档 */}
      <rect x="8" y="2" width="12" height="16" rx="2" />
      {/* 文档内容线条 */}
      <line x1="11" y1="6" x2="17" y2="6" />
      <line x1="11" y1="10" x2="17" y2="10" />
      <line x1="11" y1="14" x2="14" y2="14" />
    </svg>
  );
}

// 转换 - 箭头转换
export function ConvertIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 上方箭头 向右 */}
      <path d="M4 8h12" />
      <path d="M12 4l4 4-4 4" />
      {/* 下方箭头 向左 */}
      <path d="M20 16H8" />
      <path d="M12 12l-4 4 4 4" />
    </svg>
  );
}

// 策略 - 服务器/策略网络
export function NodesIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 中心策略 */}
      <circle cx="12" cy="12" r="3" />
      {/* 周围策略 */}
      <circle cx="12" cy="4" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      {/* 连接线 */}
      <line x1="12" y1="6" x2="12" y2="9" />
      <line x1="18" y1="12" x2="15" y2="12" />
      <line x1="12" y1="18" x2="12" y2="15" />
      <line x1="6" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// 策略组 - 组合模块
export function GroupsIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 容器外框 */}
      <rect x="3" y="4" width="18" height="16" rx="3" />
      {/* 内部垂直分割线，表示不同的策略选择 */}
      <path d="M9 4v16" />
      <path d="M15 4v16" />
      {/* 核心选中点，表示当前选中的策略 */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

// 服务器 - 机架/列表
export function ServersIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      <rect x="3" y="4" width="18" height="4" rx="1.5" />
      <rect x="3" y="10" width="18" height="4" rx="1.5" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
      <circle cx="7" cy="6" r="1" />
      <circle cx="7" cy="12" r="1" />
      <circle cx="7" cy="18" r="1" />
    </svg>
  );
}

// 规则 - 路由/分流
export function RulesIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 入口 */}
      <circle cx="4" cy="12" r="2" />
      {/* 分叉点 */}
      <circle cx="12" cy="12" r="2" />
      {/* 出口策略 */}
      <circle cx="20" cy="6" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="20" cy="18" r="2" />
      {/* 连接线 */}
      <line x1="6" y1="12" x2="10" y2="12" />
      <path d="M14 12l4-6" />
      <line x1="14" y1="12" x2="18" y2="12" />
      <path d="M14 12l4 6" />
    </svg>
  );
}

// 资源 - Provider 资源包
export function ResourceIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 立方体/包裹 */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

// 数据库 - 地理数据库
export function GeoDataIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 地球轮廓 */}
      <circle cx="12" cy="12" r="9" />
      {/* 经线 */}
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      {/* 纬线 */}
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M4.5 7h15" />
      <path d="M4.5 17h15" />
    </svg>
  );
}

// 日志 - 终端/日志列表
export function LogsIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 终端窗口 */}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      {/* 终端提示符和文本 */}
      <path d="M7 9l3 3-3 3" />
      <line x1="13" y1="15" x2="17" y2="15" />
    </svg>
  );
}

// 设置 - 齿轮
export function SettingsIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-5 h-5', className)}
    >
      {/* 中心圆 */}
      <circle cx="12" cy="12" r="3" />
      {/* 齿轮外圈 */}
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  );
}
