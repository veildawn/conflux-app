import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatSpeed,
  formatDelay,
  getDelayColorClass,
  formatDuration,
} from './format';

describe('formatBytes', () => {
  it('应该正确格式化 0 字节', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('应该正确格式化字节', () => {
    expect(formatBytes(100)).toBe('100 B');
  });

  it('应该正确格式化 KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('应该正确格式化 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('应该正确格式化 GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('应该支持自定义小数位数', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 3)).toBe('1.5 KB');
  });
});

describe('formatSpeed', () => {
  it('应该正确格式化速度', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(1024)).toBe('1 KB/s');
    expect(formatSpeed(1024 * 1024)).toBe('1 MB/s');
  });
});

describe('formatDelay', () => {
  it('应该正确格式化有效延迟', () => {
    expect(formatDelay(100)).toBe('100 ms');
    expect(formatDelay(0)).toBe('0 ms');
  });

  it('应该处理无效延迟', () => {
    expect(formatDelay(null)).toBe('N/A');
    expect(formatDelay(undefined)).toBe('N/A');
    expect(formatDelay(-1)).toBe('N/A');
  });
});

describe('getDelayColorClass', () => {
  it('应该为良好延迟返回绿色', () => {
    const result = getDelayColorClass(100);
    expect(result).toContain('emerald');
  });

  it('应该为中等延迟返回黄色', () => {
    const result = getDelayColorClass(300);
    expect(result).toContain('amber');
  });

  it('应该为较差延迟返回红色', () => {
    const result = getDelayColorClass(600);
    expect(result).toContain('red');
  });

  it('应该为无效延迟返回灰色', () => {
    const result = getDelayColorClass(null);
    expect(result).toContain('gray');
  });
});

describe('formatDuration', () => {
  it('应该正确格式化毫秒', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('应该正确格式化秒', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(5500)).toBe('5.5s');
  });

  it('应该正确格式化分钟', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('应该正确格式化小时', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(3661000)).toBe('1h 1m');
  });
});
