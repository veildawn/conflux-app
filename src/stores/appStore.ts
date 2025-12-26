import { create } from 'zustand';
import { ipc } from '@/services/ipc';
import type { AppSettings, Subscription, ExternalResource } from '@/types/config';
import { DEFAULT_APP_SETTINGS, DEFAULT_EXTERNAL_RESOURCES } from '@/types/config';

interface AppState {
  // 状态
  settings: AppSettings;
  initialized: boolean;
  
  // 计算属性
  getSelectedSubscription: () => Subscription | undefined;
  hasSubscription: () => boolean;
  
  // 动作
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  
  // 订阅管理
  addSubscription: (subscription: Subscription) => Promise<void>;
  updateSubscription: (id: string, subscription: Partial<Subscription>) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;

  // 外部资源管理
  updateExternalResource: (id: string, resource: Partial<ExternalResource>) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  initialized: false,

  // 获取当前选中的订阅
  getSelectedSubscription: () => {
    const { settings } = get();
    return settings.subscriptions?.find(sub => sub.selected);
  },

  // 是否有订阅
  hasSubscription: () => {
    const { settings } = get();
    return (settings.subscriptions?.length ?? 0) > 0;
  },

  fetchSettings: async () => {
    try {
      const settings = await ipc.getAppSettings();
      // 确保 subscriptions 存在，如果是旧的配置文件可能没有这个字段
      if (!settings.subscriptions) {
        settings.subscriptions = [];
      }
      
      // 初始化外部资源
      if (!settings.externalResources || settings.externalResources.length === 0) {
        settings.externalResources = DEFAULT_EXTERNAL_RESOURCES;
      } else {
        // 确保所有默认资源都在，如果有新的默认资源加入，这里可以合并
        // 目前简化处理，假设 id 不变
        const currentIds = new Set(settings.externalResources.map(r => r.id));
        const missingResources = DEFAULT_EXTERNAL_RESOURCES.filter(r => !currentIds.has(r.id));
        if (missingResources.length > 0) {
          settings.externalResources = [...settings.externalResources, ...missingResources];
        }
      }

      set({ settings, initialized: true });
      
      // 应用主题
      get().setTheme(settings.theme);
    } catch (error) {
      console.error('Failed to fetch app settings:', error);
      set({ initialized: true });
    }
  },

  updateSettings: async (newSettings: Partial<AppSettings>) => {
    const currentSettings = get().settings;
    const mergedSettings = { ...currentSettings, ...newSettings };
    
    try {
      await ipc.saveAppSettings(mergedSettings);
      set({ settings: mergedSettings });
      
      // 如果主题改变，应用新主题
      if (newSettings.theme) {
        get().setTheme(newSettings.theme);
      }
    } catch (error) {
      console.error('Failed to save app settings:', error);
      throw error;
    }
  },

  setTheme: (theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  },

  addSubscription: async (subscription: Subscription) => {
    const { settings, updateSettings } = get();
    const newSubscriptions = [...settings.subscriptions, subscription];
    await updateSettings({ subscriptions: newSubscriptions });
  },

  updateSubscription: async (id: string, updates: Partial<Subscription>) => {
    const { settings, updateSettings } = get();
    const newSubscriptions = settings.subscriptions.map(sub => 
      sub.id === id ? { ...sub, ...updates } : sub
    );
    await updateSettings({ subscriptions: newSubscriptions });
  },

  removeSubscription: async (id: string) => {
    const { settings, updateSettings } = get();
    const newSubscriptions = settings.subscriptions.filter(sub => sub.id !== id);
    await updateSettings({ subscriptions: newSubscriptions });
  },

  updateExternalResource: async (id: string, updates: Partial<ExternalResource>) => {
    const { settings, updateSettings } = get();
    const newResources = settings.externalResources.map(res => 
      res.id === id ? { ...res, ...updates } : res
    );
    await updateSettings({ externalResources: newResources });
  },
}));
