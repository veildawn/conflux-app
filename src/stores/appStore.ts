import { create } from 'zustand';
import { ipc } from '@/services/ipc';
import type { AppSettings, Subscription, RuleDatabaseItem } from '@/types/config';
import { DEFAULT_APP_SETTINGS, DEFAULT_RULE_DATABASES } from '@/types/config';

interface RuleDatabaseUpdateStatus {
  hasUpdate: boolean;
  checking: boolean;
  error?: string;
}

interface AppState {
  // 状态
  settings: AppSettings;
  initialized: boolean;
  
  // 规则数据库更新状态（应用启动时检查一次）
  ruleDatabaseUpdateStatus: Record<string, RuleDatabaseUpdateStatus>;
  ruleDatabaseUpdateChecked: boolean;
  
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

  // 规则数据库管理
  updateRuleDatabase: (id: string, updates: Partial<RuleDatabaseItem>) => Promise<void>;
  checkRuleDatabaseUpdates: () => Promise<void>;
  setRuleDatabaseUpdateStatus: (id: string, status: RuleDatabaseUpdateStatus) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  initialized: false,
  ruleDatabaseUpdateStatus: {},
  ruleDatabaseUpdateChecked: false,

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
      
      // 初始化规则数据库
      if (!settings.ruleDatabases || settings.ruleDatabases.length === 0) {
        settings.ruleDatabases = DEFAULT_RULE_DATABASES;
      } else {
        // 确保所有默认数据库都在，如果有新的默认数据库加入，这里可以合并
        const currentIds = new Set(settings.ruleDatabases.map(r => r.id));
        const missingDatabases = DEFAULT_RULE_DATABASES.filter(r => !currentIds.has(r.id));
        if (missingDatabases.length > 0) {
          settings.ruleDatabases = [...settings.ruleDatabases, ...missingDatabases];
        }
      }

      set({ settings, initialized: true });
      
      // 应用主题 - 始终使用 system
      get().setTheme('system');
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

  updateRuleDatabase: async (id: string, updates: Partial<RuleDatabaseItem>) => {
    const { settings, updateSettings } = get();
    const newDatabases = settings.ruleDatabases.map(db => 
      db.id === id ? { ...db, ...updates } : db
    );
    await updateSettings({ ruleDatabases: newDatabases });
  },

  // 检查规则数据库更新（应用启动时调用一次）
  checkRuleDatabaseUpdates: async () => {
    const { settings, ruleDatabaseUpdateChecked } = get();
    const databases = settings.ruleDatabases || [];
    
    // 如果已经检查过或没有数据库，跳过
    if (ruleDatabaseUpdateChecked || databases.length === 0) {
      return;
    }
    
    // 设置所有数据库为检查中状态
    const initialStatus: Record<string, RuleDatabaseUpdateStatus> = {};
    databases.forEach(db => {
      initialStatus[db.id] = { hasUpdate: false, checking: true };
    });
    set({ ruleDatabaseUpdateStatus: initialStatus });
    
    try {
      const requests = databases.map(db => ({
        url: db.url,
        currentEtag: db.etag,
        currentModified: db.remoteModified,
        updateSourceType: db.updateSourceType,
        githubRepo: db.githubRepo,
        assetName: db.assetName,
      }));
      
      const results = await ipc.checkResourceUpdates(requests);
      
      const newStatus: Record<string, RuleDatabaseUpdateStatus> = {};
      results.forEach((result, index) => {
        const db = databases[index];
        newStatus[db.id] = {
          hasUpdate: result.hasUpdate,
          checking: false,
          error: result.error,
        };
      });
      
      set({ 
        ruleDatabaseUpdateStatus: newStatus,
        ruleDatabaseUpdateChecked: true,
      });
      
      const updateCount = results.filter(r => r.hasUpdate && !r.error).length;
      if (updateCount > 0) {
        console.log(`[RuleDatabase] ${updateCount} 个数据库有新版本可用`);
      }
    } catch (error) {
      console.error('Failed to check rule database updates:', error);
      const errorStatus: Record<string, RuleDatabaseUpdateStatus> = {};
      databases.forEach(db => {
        errorStatus[db.id] = { hasUpdate: false, checking: false, error: '检查失败' };
      });
      set({ 
        ruleDatabaseUpdateStatus: errorStatus,
        ruleDatabaseUpdateChecked: true,
      });
    }
  },

  // 更新单个规则数据库的更新状态
  setRuleDatabaseUpdateStatus: (id: string, status: RuleDatabaseUpdateStatus) => {
    set(state => ({
      ruleDatabaseUpdateStatus: {
        ...state.ruleDatabaseUpdateStatus,
        [id]: status,
      }
    }));
  },
}));
