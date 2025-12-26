import { create } from 'zustand';
import { ipc } from '@/services/ipc';
import type { AppSettings } from '@/types/config';
import { DEFAULT_APP_SETTINGS } from '@/types/config';

interface AppState {
  // 状态
  settings: AppSettings;
  initialized: boolean;
  
  // 动作
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  initialized: false,

  fetchSettings: async () => {
    try {
      const settings = await ipc.getAppSettings();
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
}));




