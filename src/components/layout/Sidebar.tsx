import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import appIconUrl from '../../../src-tauri/icons/icon.png';
import {
  ConnectionIcon,
  OverviewIcon,
  ProfileIcon,
  ConvertIcon,
  NodesIcon,
  ServersIcon,
  RulesIcon,
  ResourceIcon,
  GeoDataIcon,
  LogsIcon,
  SettingsIcon,
} from '@/components/icons/NavIcons';

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
      { path: '/', icon: ConnectionIcon, label: '连接' },
      { path: '/overview', icon: OverviewIcon, label: '概览' },
    ]
  },
  {
    title: '配置',
    items: [
      { path: '/subscription', icon: ProfileIcon, label: '配置' },
      { path: '/sub-store', icon: ConvertIcon, label: '转换' },
    ]
  },
  {
    title: '代理',
    items: [
      { path: '/proxy', icon: NodesIcon, label: '策略' },
      { path: '/proxy-servers', icon: ServersIcon, label: '服务器' },
      { path: '/rules', icon: RulesIcon, label: '规则' },
      { path: '/providers', icon: ResourceIcon, label: '资源' },
      { path: '/rule-database', icon: GeoDataIcon, label: '数据库' },
    ]
  },
  {
    title: '系统',
    items: [
      { path: '/logs', icon: LogsIcon, label: '日志' },
      { path: '/settings', icon: SettingsIcon, label: '设置' },
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
                  : location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`);

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
        <div className="flex items-center opacity-60 hover:opacity-100 transition-opacity group cursor-default">
           <img
             src={appIconUrl}
             alt="Conflux"
             className="w-10 h-10"
             draggable={false}
           />
           <div>
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200">Conflux</div>
              <div className="text-[10px] font-medium text-gray-400">v0.1.0</div>
           </div>
        </div>
      </div>
    </aside>
  );
}
