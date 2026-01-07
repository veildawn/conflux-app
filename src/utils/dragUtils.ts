/**
 * 拖拽相关工具函数
 * 用于 Tauri 窗口拖拽功能
 */

/**
 * 需要忽略拖拽的元素选择器
 * 这些元素在拖拽区域内但不应该触发窗口拖拽
 */
export const DRAG_IGNORE_SELECTOR = [
  '[data-no-drag]',
  '.no-drag',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="listbox"]',
  '[contenteditable="true"]',
  '.cursor-pointer',
].join(', ');

/**
 * 检查事件目标是否应该忽略拖拽
 */
export function shouldIgnoreDrag(target: HTMLElement | null): boolean {
  if (!target) return true;
  return !!target.closest(DRAG_IGNORE_SELECTOR);
}
