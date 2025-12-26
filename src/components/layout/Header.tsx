import { Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProxyStore } from '@/stores/proxyStore';
import { cn } from '@/utils/cn';
import WindowControls from './WindowControls';

export default function Header() {
  const { status, loading, setSystemProxy, setEnhancedMode } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      loading: state.loading,
      setSystemProxy: state.setSystemProxy,
      setEnhancedMode: state.setEnhancedMode,
    }))
  );

  const handleSystemProxyToggle = async () => {
    try {
      await setSystemProxy(!status.system_proxy);
    } catch (error) {
      console.error('Failed to toggle system proxy:', error);
    }
  };

  const handleEnhancedModeToggle = async () => {
    try {
      await setEnhancedMode(!status.enhanced_mode);
    } catch (error) {
      console.error('Failed to toggle enhanced mode:', error);
    }
  };

  return (
    <div className="flex flex-col w-full shrink-0 z-50">
      <header data-tauri-drag-region className="h-11 min-[960px]:h-12 flex items-center justify-between px-3 min-[960px]:px-4 bg-transparent drag-region select-none transition-all duration-300">
        {/* 左侧：窗口控制 */}
        <div className="flex items-center gap-4">
           <WindowControls />
        </div>

        {/* 中间/右侧：状态控制 */}
        <div className="flex items-center gap-3 no-drag">
          {/* 系统代理 */}
          <button 
            onClick={handleSystemProxyToggle}
            disabled={loading || !status.running}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300",
              loading || !status.running
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:scale-105 active:scale-95",
              status.system_proxy 
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-600" 
                : "bg-white hover:bg-gray-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 ring-1 ring-gray-200 dark:ring-zinc-700"
            )}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <div className={cn(
                "w-2 h-2 rounded-full transition-colors shadow-[0_0_8px_rgba(0,0,0,0.2)]",
                status.system_proxy ? "bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" : "bg-gray-400 dark:bg-gray-500"
              )} />
            )}
            <span className="text-xs font-medium tracking-wide">系统代理</span>
          </button>

          {/* 增强模式 (TUN) */}
          <button 
            onClick={handleEnhancedModeToggle}
            disabled={loading || !status.running}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300",
              loading || !status.running
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:scale-105 active:scale-95",
              status.enhanced_mode 
                ? "bg-purple-500 hover:bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-600" 
                : "bg-white hover:bg-gray-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 ring-1 ring-gray-200 dark:ring-zinc-700"
            )}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <div className={cn(
                "w-2 h-2 rounded-full transition-colors shadow-[0_0_8px_rgba(0,0,0,0.2)]",
                status.enhanced_mode ? "bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" : "bg-gray-400 dark:bg-gray-500"
              )} />
            )}
            <span className="text-xs font-medium tracking-wide">增强模式</span>
          </button>
        </div>
      </header>
    </div>
  );
}
