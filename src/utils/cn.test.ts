import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('应该合并多个类名', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('应该处理条件类名', () => {
    const flags = { enabled: false, active: true };
    expect(cn('class1', flags.enabled && 'class2', 'class3')).toBe('class1 class3');
    expect(cn('class1', flags.active && 'class2')).toBe('class1 class2');
  });

  it('应该处理 Tailwind 冲突', () => {
    // tailwind-merge 应该解决冲突的类名
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('应该处理对象形式的类名', () => {
    expect(cn({ class1: true, class2: false })).toBe('class1');
  });

  it('应该处理数组', () => {
    expect(cn(['class1', 'class2'])).toBe('class1 class2');
  });

  it('应该处理空值', () => {
    expect(cn()).toBe('');
    expect(cn(null, undefined, '')).toBe('');
  });
});
