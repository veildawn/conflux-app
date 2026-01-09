import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function WindowControls() {
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // 初始化时检查窗口状态
  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const appWindow = getCurrentWindow();
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.error('Failed to check window state:', error);
      }
    };
    checkMaximized();
  }, []);

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        await appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
      }
    } catch (error) {
      console.error('Failed to toggle maximize:', error);
    }
  };

  return (
    <div
      className="flex items-center gap-2 no-drag pointer-events-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 关闭按钮 - 红色 */}
      <button
        onClick={handleClose}
        className="group w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#E14640] active:bg-[#C93A33] transition-all duration-150 flex items-center justify-center shadow-sm hover:shadow-md cursor-pointer"
        aria-label="关闭窗口"
        title="关闭"
        type="button"
      >
        {isHovered && (
          <svg
            className="absolute w-2 h-2 text-[#4D0000] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* 最小化按钮 - 黄色 */}
      <button
        onClick={handleMinimize}
        className="group w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#E5A825] active:bg-[#CC941F] transition-all duration-150 flex items-center justify-center shadow-sm hover:shadow-md cursor-pointer"
        aria-label="最小化窗口"
        title="最小化"
        type="button"
      >
        {isHovered && (
          <svg
            className="absolute w-2 h-2 text-[#995700] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 6h8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* 最大化/还原按钮 - 绿色 */}
      <button
        onClick={handleMaximize}
        className="group w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#22A737] active:bg-[#1D8D2E] transition-all duration-150 flex items-center justify-center shadow-sm hover:shadow-md cursor-pointer"
        aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
        title={isMaximized ? '还原' : '最大化'}
        type="button"
      >
        {isHovered && (
          <svg
            className="absolute w-2 h-2 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            {isMaximized ? (
              // 还原图标：两个重叠的小方框
              <>
                <rect
                  x="2.5"
                  y="4"
                  width="5"
                  height="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M4.5 4V2.5h5v5H8" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              // 最大化图标：对角线箭头（向外扩展）
              <>
                <path d="M2.5 6l3.5-3.5M9.5 6L6 9.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 2.5h3v3M9.5 9.5h-3v-3" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
          </svg>
        )}
      </button>
    </div>
  );
}
