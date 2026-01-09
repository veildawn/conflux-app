import { create } from 'zustand';
import { ipc } from '@/services/ipc';
import logger from '@/utils/logger';
import type { ProxyStatus, ProxyGroup, TrafficData, ProxyMode, Connection } from '@/types/proxy';

// 流量历史数据点
export interface TrafficHistoryPoint {
  time: number;
  up: number;
  down: number;
}

// 连接统计数据
export interface ConnectionStats {
  totalConnections: number;
  downloadTotal: number;
  uploadTotal: number;
}

interface ProxyState {
  // 状态
  status: ProxyStatus;
  groups: ProxyGroup[];
  traffic: TrafficData;
  trafficHistory: TrafficHistoryPoint[];
  connections: Connection[];
  connectionStats: ConnectionStats;
  loading: boolean;
  error: string | null;

  // 动作
  applyStatus: (status: ProxyStatus) => void;
  fetchStatus: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  switchMode: (mode: ProxyMode) => Promise<void>;
  fetchGroups: (mode?: string) => Promise<void>;
  selectProxy: (group: string, name: string) => Promise<void>;
  testDelay: (name: string) => Promise<number>;
  fetchTraffic: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  closeConnection: (id: string) => Promise<void>;
  closeAllConnections: () => Promise<void>;
  setSystemProxy: (enabled: boolean) => Promise<void>;
  setEnhancedMode: (enabled: boolean) => Promise<void>;
  setAllowLan: (enabled: boolean) => Promise<void>;
  setPorts: (port: number, socksPort: number) => Promise<void>;
  setIpv6: (enabled: boolean) => Promise<void>;
  setTcpConcurrent: (enabled: boolean) => Promise<void>;
}

const initialStatus: ProxyStatus = {
  running: false,
  mode: 'rule',
  port: 7890,
  socks_port: 7891,
  mixed_port: 7892,
  system_proxy: false,
  enhanced_mode: true,
  allow_lan: true,
  ipv6: false,
  tcp_concurrent: true,
};

const initialConnectionStats: ConnectionStats = {
  totalConnections: 0,
  downloadTotal: 0,
  uploadTotal: 0,
};

// 流量历史最大保存点数
const MAX_TRAFFIC_HISTORY = 40;

export const useProxyStore = create<ProxyState>((set, get) => ({
  status: initialStatus,
  groups: [],
  traffic: { up: 0, down: 0 },
  trafficHistory: [],
  connections: [],
  connectionStats: initialConnectionStats,
  loading: false,
  error: null,

  applyStatus: (status) => {
    set((state) => ({
      status: { ...state.status, ...status },
      error: null,
    }));
  },

  fetchStatus: async () => {
    try {
      const status = await ipc.getProxyStatus();
      if (!status) {
        throw new Error('Empty proxy status');
      }
      set((state) => ({
        status: { ...state.status, ...status },
        error: null,
      }));
    } catch (error) {
      logger.error('Failed to fetch proxy status:', error);
      set({ error: String(error) });
    }
  },

  start: async () => {
    set({ loading: true, error: null });
    try {
      await ipc.startProxy();
      await get().fetchStatus();
    } catch (error) {
      logger.error('Failed to start proxy:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  stop: async () => {
    set({ loading: true, error: null });
    try {
      await ipc.stopProxy();
      await get().fetchStatus();
      set({
        groups: [],
        traffic: { up: 0, down: 0 },
        trafficHistory: [],
        connections: [],
        connectionStats: initialConnectionStats,
      });
    } catch (error) {
      logger.error('Failed to stop proxy:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  restart: async () => {
    set({ loading: true, error: null });
    try {
      await ipc.restartProxy();
      await get().fetchStatus();
    } catch (error) {
      logger.error('Failed to restart proxy:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  switchMode: async (mode: ProxyMode) => {
    set({ loading: true, error: null });
    try {
      await ipc.switchMode(mode);
      set((state) => ({
        status: { ...state.status, mode },
      }));
    } catch (error) {
      logger.error('Failed to switch mode:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  fetchGroups: async (mode?: string) => {
    try {
      const groups = await ipc.getProxies(mode);
      set({ groups, error: null });
    } catch (error) {
      logger.error('Failed to fetch proxy groups:', error);
      set({ error: String(error) });
    }
  },

  selectProxy: async (group: string, name: string) => {
    try {
      await ipc.selectProxy(group, name);
      // 更新本地状态
      set((state) => ({
        groups: state.groups.map((g) => (g.name === group ? { ...g, now: name } : g)),
      }));
    } catch (error) {
      logger.error('Failed to select proxy:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  testDelay: async (name: string) => {
    try {
      const delay = await ipc.testProxyDelay(name);
      return delay;
    } catch (error) {
      logger.error('Failed to test delay:', error);
      return -1;
    }
  },

  fetchTraffic: async () => {
    try {
      const traffic = await ipc.getTraffic();
      const now = Date.now();

      set((state) => {
        // 添加到历史记录
        const newHistory = [
          ...state.trafficHistory,
          { time: now, up: traffic.up, down: traffic.down },
        ];
        // 保留最近的记录点
        if (newHistory.length > MAX_TRAFFIC_HISTORY) {
          newHistory.shift();
        }
        return { traffic, trafficHistory: newHistory };
      });
    } catch (error) {
      // 静默失败，不显示错误
      logger.debug('Failed to fetch traffic:', error);
    }
  },

  fetchConnections: async () => {
    try {
      const response = await ipc.getConnections();

      set({
        connections: response.connections || [],
        connectionStats: {
          totalConnections: response.connections ? response.connections.length : 0,
          downloadTotal: response.downloadTotal,
          uploadTotal: response.uploadTotal,
        },
      });
    } catch (error) {
      logger.debug('Failed to fetch connections:', error);
    }
  },

  closeConnection: async (id: string) => {
    try {
      await ipc.closeConnection(id);
      // 从本地状态移除
      set((state) => ({
        connections: state.connections.filter((c) => c.id !== id),
        connectionStats: {
          ...state.connectionStats,
          totalConnections: state.connectionStats.totalConnections - 1,
        },
      }));
    } catch (error) {
      logger.error('Failed to close connection:', error);
      throw error;
    }
  },

  closeAllConnections: async () => {
    try {
      await ipc.closeAllConnections();
      set({
        connections: [],
        connectionStats: {
          ...get().connectionStats,
          totalConnections: 0,
        },
      });
    } catch (error) {
      logger.error('Failed to close all connections:', error);
      throw error;
    }
  },

  setSystemProxy: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      if (enabled) {
        await ipc.setSystemProxy();
      } else {
        await ipc.clearSystemProxy();
      }
      set((state) => ({
        status: { ...state.status, system_proxy: enabled },
      }));
    } catch (error) {
      logger.error('Failed to set system proxy:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setEnhancedMode: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      await ipc.setTunMode(enabled);
      set((state) => ({
        status: { ...state.status, enhanced_mode: enabled },
      }));
    } catch (error) {
      logger.error('Failed to set TUN mode:', error);
      set({ error: String(error) });
      // 失败时获取实际状态，确保 UI 显示正确
      try {
        const status = await ipc.getProxyStatus();
        if (status) {
          set((state) => ({
            status: { ...state.status, ...status },
          }));
        }
      } catch (fetchError) {
        logger.error('Failed to fetch status after TUN mode error:', fetchError);
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setAllowLan: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      await ipc.setAllowLan(enabled);
      set((state) => ({
        status: { ...state.status, allow_lan: enabled },
      }));
    } catch (error) {
      logger.error('Failed to set allow LAN:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setPorts: async (port: number, socksPort: number) => {
    set({ loading: true, error: null });
    try {
      await ipc.setPorts(port, socksPort);
      set((state) => ({
        status: { ...state.status, port, socks_port: socksPort },
      }));
    } catch (error) {
      logger.error('Failed to set ports:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setIpv6: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      await ipc.setIpv6(enabled);
      set((state) => ({
        status: { ...state.status, ipv6: enabled },
      }));
    } catch (error) {
      logger.error('Failed to set IPv6:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setTcpConcurrent: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      await ipc.setTcpConcurrent(enabled);
      set((state) => ({
        status: { ...state.status, tcp_concurrent: enabled },
      }));
    } catch (error) {
      logger.error('Failed to set TCP concurrent:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
