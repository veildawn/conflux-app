import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  LayoutDashboard,
  Globe,
  Shield,
  BookOpen,
  Database,
  Settings,
  ScrollText,
  Box,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { path: '/', icon: Activity, label: '活动' },
      { path: '/overview', icon: LayoutDashboard, label: '概览' },
    ]
  },
  {
    title: '代理',
    items: [
      { path: '/subscription', icon: BookOpen, label: '订阅' },
      { path: '/proxy', icon: Globe, label: '代理' },
      { path: '/rules', icon: Shield, label: '规则' },
      { path: '/providers', icon: Box, label: '数据源' },
      { path: '/rule-database', icon: Database, label: '规则数据库' },
    ]
  },
  {
    title: '更多',
    items: [
      { path: '/logs', icon: ScrollText, label: '日志' },
      { path: '/settings', icon: Settings, label: '设置' },
    ]
  }
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-48 min-[960px]:w-56 bg-transparent flex flex-col select-none pt-2">
      
      {/* 导航菜单 */}
      <nav className="flex-1 px-3 space-y-4 overflow-y-auto pb-6 scrollbar-none">
        {navGroups.map((group, index) => (
          <div key={index} className="space-y-1">
            {group.title && (
              <div className="px-3 mb-2 text-[11px] font-semibold text-gray-500/80 dark:text-gray-400/80 uppercase tracking-widest">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  draggable={false}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-[14px] transition-all duration-200 text-[13px] font-medium no-drag group',
                    isActive 
                      ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none' 
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/60 dark:hover:bg-zinc-800/50 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  <Icon 
                    className={cn(
                      "w-[18px] h-[18px] transition-colors", 
                      isActive 
                        ? "text-blue-500 dark:text-blue-400" 
                        : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
                    )} 
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span className={cn(isActive && "font-semibold")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 底部 Logo/信息 */}
      <div className="px-5 py-4 bg-transparent">
        <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity group cursor-default">
           <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-gray-200 dark:ring-zinc-700">
              <div className="w-4 h-4 rounded-full bg-linear-to-tr from-blue-400 to-cyan-300 shadow-sm group-hover:scale-110 transition-transform"></div>
           </div>
           <div>
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200">Conflux</div>
              <div className="text-[10px] font-medium text-gray-400">v0.1.0</div>
           </div>
        </div>
      </div>
    </aside>
  );
}
