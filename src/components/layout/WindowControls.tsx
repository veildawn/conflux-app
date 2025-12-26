import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function WindowControls() {
  const [isHovered, setIsHovered] = useState(false);
  const appWindow = getCurrentWindow();

  const handleClose = async () => {
    await appWindow.close();
  };

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  return (
    <div
      className="flex items-center gap-2 no-drag"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 关闭按钮 - 红色 */}
      <button
        onClick={handleClose}
        className="group w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57] transition-colors flex items-center justify-center"
        aria-label="关闭"
      >
        {isHovered && (
          <svg
            className="w-2 h-2 text-[#4D0000] opacity-0 group-hover:opacity-100 transition-opacity"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        )}
      </button>

      {/* 最小化按钮 - 黄色 */}
      <button
        onClick={handleMinimize}
        className="group w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E] transition-colors flex items-center justify-center"
        aria-label="最小化"
      >
        {isHovered && (
          <svg
            className="w-2 h-2 text-[#995700] opacity-0 group-hover:opacity-100 transition-opacity"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 6h8" />
          </svg>
        )}
      </button>

      {/* 最大化按钮 - 绿色 */}
      <button
        onClick={handleMaximize}
        className="group w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#28C840] transition-colors flex items-center justify-center"
        aria-label="最大化"
      >
        {isHovered && (
          <svg
            className="w-2 h-2 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 2l4 4-4 4M10 2l-4 4 4 4" />
          </svg>
        )}
      </button>
    </div>
  );
}
