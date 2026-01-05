import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './appStore';
import { ipc } from '@/services/ipc';

// Mock IPC
vi.mock('@/services/ipc', () => ({
  ipc: {
    getAppSettings: vi.fn(),
    saveAppSettings: vi.fn(),
    checkResourceUpdates: vi.fn(),
  },
}));

describe('appStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useAppStore.setState({
      settings: {
        language: 'zh-CN',
        autoStart: false,
        systemProxy: false,
        closeToTray: false,
        ruleDatabases: [],
      },
      initialized: false,
      ruleDatabaseUpdateStatus: {},
      ruleDatabaseUpdateChecked: false,
    });
    vi.clearAllMocks();
  });

  describe('fetchSettings', () => {
    it('应该成功获取设置', async () => {
      const mockSettings = {
        language: 'zh-CN',
        autoStart: true,
        systemProxy: true,
        closeToTray: true,
        ruleDatabases: [],
      };

      vi.mocked(ipc.getAppSettings).mockResolvedValue(mockSettings);

      await useAppStore.getState().fetchSettings();

      expect(ipc.getAppSettings).toHaveBeenCalled();
      expect(useAppStore.getState().initialized).toBe(true);
      expect(useAppStore.getState().settings.autoStart).toBe(true);
    });

    it('应该处理获取失败的情况', async () => {
      vi.mocked(ipc.getAppSettings).mockRejectedValue(new Error('Failed'));

      await useAppStore.getState().fetchSettings();

      expect(useAppStore.getState().initialized).toBe(true);
    });
  });

  describe('updateSettings', () => {
    it('应该成功更新设置', async () => {
      vi.mocked(ipc.saveAppSettings).mockResolvedValue(undefined);

      const initialSettings = useAppStore.getState().settings;
      await useAppStore.getState().updateSettings({ systemProxy: true });

      expect(ipc.saveAppSettings).toHaveBeenCalledWith({
        ...initialSettings,
        systemProxy: true,
      });
      expect(useAppStore.getState().settings.systemProxy).toBe(true);
    });

    it('应该处理更新失败的情况', async () => {
      vi.mocked(ipc.saveAppSettings).mockRejectedValue(new Error('Failed'));

      await expect(useAppStore.getState().updateSettings({ systemProxy: true })).rejects.toThrow(
        'Failed'
      );
    });
  });

  describe('setTheme', () => {
    it('应该正确设置主题', () => {
      const store = useAppStore.getState();

      // 测试 system 主题
      store.setTheme('system');
      // 由于我们在测试环境中，无法完全测试 DOM 操作
      // 但我们可以验证函数执行没有错误
      expect(() => store.setTheme('system')).not.toThrow();

      // 测试 dark 主题
      expect(() => store.setTheme('dark')).not.toThrow();

      // 测试 light 主题
      expect(() => store.setTheme('light')).not.toThrow();
    });
  });
});
