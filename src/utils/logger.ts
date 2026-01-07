/**
 * 统一日志工具
 * 在生产环境中自动禁用 debug 和 log 输出
 */

const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  /**
   * 调试信息 - 仅开发环境输出
   */
  debug: (...args: LogArgs): void => {
    if (isDev) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * 普通日志 - 仅开发环境输出
   */
  log: (...args: LogArgs): void => {
    if (isDev) {
      console.log('[LOG]', ...args);
    }
  },

  /**
   * 信息日志 - 仅开发环境输出
   */
  info: (...args: LogArgs): void => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * 警告日志 - 开发环境输出
   */
  warn: (...args: LogArgs): void => {
    if (isDev) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * 错误日志 - 始终输出（生产环境也需要）
   */
  error: (...args: LogArgs): void => {
    console.error('[ERROR]', ...args);
  },
};

export default logger;
