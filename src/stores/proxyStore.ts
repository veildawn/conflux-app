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
  /** 全局时钟（用于页面展示连接/请求时长），避免页面内创建 interval 造成 HMR 叠加 */
  now: number;
  /**
   * 请求历史（"曾经出现过的连接"快照）
   * - 由 fetchConnections() 基于连接 ID diff 生成
   * - 作为 Requests 页面数据源（类似 _tmp_flclash 的 FixedList(500)）
   */
  requestHistory: Connection[];
  /** 内部：用于去重的连接 ID 集合（仅保留 requestHistory 的那部分） */
  requestHistoryIdSet: Record<string, true>;
  loading: boolean;
  error: string | null;
  /** 是否需要管理员权限重启（用于显示确认对话框） */
  needAdminRestart: boolean;

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
  clearRequestHistory: () => void;
  tickNow: () => void;
  setSystemProxy: (enabled: boolean) => Promise<void>;
  setEnhancedMode: (enabled: boolean) => Promise<void>;
  setAllowLan: (enabled: boolean) => Promise<void>;
  setPorts: (port: number, socksPort: number) => Promise<void>;
  setIpv6: (enabled: boolean) => Promise<void>;
  setTcpConcurrent: (enabled: boolean) => Promise<void>;
  /** 设置是否需要管理员权限重启 */
  setNeedAdminRestart: (value: boolean) => void;
  /** 以普通模式启动代理（强制禁用 TUN 模式） */
  startNormalMode: () => Promise<void>;
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
// 请求历史最大保存条数（与 _tmp_flclash FixedList(500) 对齐）
const MAX_REQUEST_HISTORY = 500;

export const useProxyStore = create<ProxyState>((set, get) => ({
  status: initialStatus,
  groups: [],
  traffic: { up: 0, down: 0 },
  trafficHistory: [],
  connections: [],
  connectionStats: initialConnectionStats,
  now: 0,
  requestHistory: [],
  requestHistoryIdSet: {},
  loading: false,
  error: null,
  needAdminRestart: false,

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
      const errorMsg = String(error);
      logger.error('Failed to start proxy:', error);
      // 检测是否需要管理员权限
      if (errorMsg.includes('NEED_ADMIN:')) {
        set({ needAdminRestart: true, loading: false });
        return; // 不抛出错误，让对话框处理
      }
      set({ error: errorMsg });
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
        requestHistory: [],
        requestHistoryIdSet: {},
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
      const nextConnections = response.connections || [];

      set((state) => {
        // 生成“请求历史”（曾出现过的连接）：
        // - 对 nextConnections 中的新 ID 追加到 requestHistory
        // - 维持一个固定长度的 ring buffer（MAX_REQUEST_HISTORY）
        const idSet = { ...state.requestHistoryIdSet };
        let history = state.requestHistory;
        let historyChanged = false;

        for (const conn of nextConnections) {
          if (idSet[conn.id]) continue;
          idSet[conn.id] = true;
          history = historyChanged ? history : [...history];
          history.push(conn);
          historyChanged = true;
        }

        if (historyChanged && history.length > MAX_REQUEST_HISTORY) {
          const overflow = history.length - MAX_REQUEST_HISTORY;
          const removed = history.slice(0, overflow);
          history = history.slice(overflow);
          // 同步清理去重集合，避免无限增长
          for (const r of removed) {
            delete idSet[r.id];
          }
        }

        return {
          connections: nextConnections,
          connectionStats: {
            totalConnections: nextConnections.length,
            downloadTotal: response.downloadTotal,
            uploadTotal: response.uploadTotal,
          },
          requestHistory: history,
          requestHistoryIdSet: idSet,
        };
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

  clearRequestHistory: () => {
    set({ requestHistory: [], requestHistoryIdSet: {} });
  },

  tickNow: () => {
    // 只写入 store，页面 render 不直接调用 Date.now()
    set({ now: Date.now() });
  },

  setSystemProxy: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      // 互斥：开启系统代理会关闭增强模式（后端也会强制处理），这里先做本地即时更新避免 UI 抖动
      if (enabled) {
        set((state) => ({
          status: { ...state.status, enhanced_mode: false },
        }));
      }
      if (enabled) {
        await ipc.setSystemProxy();
      } else {
        await ipc.clearSystemProxy();
      }
      // 以真实状态为准（后端会 emit proxy-status-changed，这里也兜底拉取一次）
      await get().fetchStatus();
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
      // 互斥：开启增强模式会关闭系统代理（后端也会强制处理），这里先做本地即时更新避免 UI 抖动
      if (enabled) {
        set((state) => ({
          status: { ...state.status, system_proxy: false },
        }));
      }
      await ipc.setTunMode(enabled);
      // 以真实状态为准（后端会 emit proxy-status-changed，这里也兜底拉取一次）
      await get().fetchStatus();
    } catch (error) {
      const errorMsg = String(error);
      logger.error('Failed to set TUN mode:', error);
      // 检测是否需要管理员权限
      if (errorMsg.includes('NEED_ADMIN:')) {
        set({ needAdminRestart: true, loading: false });
        return; // 不抛出错误，让对话框处理
      }
      set({ error: errorMsg });
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

  setNeedAdminRestart: (value: boolean) => {
    set({ needAdminRestart: value });
  },

  /** 以普通模式启动代理（强制禁用 TUN 模式） */
  startNormalMode: async () => {
    set({ loading: true, error: null, needAdminRestart: false });
    try {
      await ipc.startProxyNormalMode();
      await get().fetchStatus();
      logger.info('Proxy started in normal mode');
    } catch (error) {
      logger.error('Failed to start proxy in normal mode:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
