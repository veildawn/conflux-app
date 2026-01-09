import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProxyStore } from './proxyStore';
import { ipc } from '@/services/ipc';

// Mock IPC
vi.mock('@/services/ipc', () => ({
  ipc: {
    getProxyStatus: vi.fn(),
    startProxy: vi.fn(),
    stopProxy: vi.fn(),
    restartProxy: vi.fn(),
    switchMode: vi.fn(),
    getProxies: vi.fn(),
    selectProxy: vi.fn(),
    testProxyDelay: vi.fn(),
    getTraffic: vi.fn(),
    getConnections: vi.fn(),
    closeConnection: vi.fn(),
    closeAllConnections: vi.fn(),
    setSystemProxy: vi.fn(),
    clearSystemProxy: vi.fn(),
    setTunMode: vi.fn(),
    setAllowLan: vi.fn(),
    setPorts: vi.fn(),
    setIpv6: vi.fn(),
    setTcpConcurrent: vi.fn(),
  },
}));

// Mock logger to prevent console output during tests
vi.mock('@/utils/logger', () => ({
  default: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

const initialStatus = {
  running: false,
  mode: 'rule' as const,
  port: 7890,
  socks_port: 7891,
  mixed_port: 7892,
  system_proxy: false,
  enhanced_mode: true,
  allow_lan: true,
  ipv6: false,
  tcp_concurrent: true,
};

describe('proxyStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useProxyStore.setState({
      status: initialStatus,
      groups: [],
      traffic: { up: 0, down: 0 },
      trafficHistory: [],
      connections: [],
      connectionStats: {
        totalConnections: 0,
        downloadTotal: 0,
        uploadTotal: 0,
      },
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('fetchStatus', () => {
    it('应该成功获取代理状态', async () => {
      const mockStatus = {
        running: true,
        mode: 'rule' as const,
        port: 7890,
        socks_port: 7891,
        mixed_port: 7892,
        system_proxy: true,
        enhanced_mode: true,
        allow_lan: true,
        ipv6: false,
        tcp_concurrent: true,
      };

      vi.mocked(ipc.getProxyStatus).mockResolvedValue(mockStatus);

      await useProxyStore.getState().fetchStatus();

      expect(ipc.getProxyStatus).toHaveBeenCalled();
      expect(useProxyStore.getState().status.running).toBe(true);
      expect(useProxyStore.getState().status.system_proxy).toBe(true);
      expect(useProxyStore.getState().error).toBeNull();
    });

    it('应该处理获取失败的情况', async () => {
      vi.mocked(ipc.getProxyStatus).mockRejectedValue(new Error('Connection failed'));

      await useProxyStore.getState().fetchStatus();

      expect(useProxyStore.getState().error).toBe('Error: Connection failed');
    });
  });

  describe('start', () => {
    it('应该成功启动代理', async () => {
      const mockStatus = { ...initialStatus, running: true };

      vi.mocked(ipc.startProxy).mockResolvedValue(undefined);
      vi.mocked(ipc.getProxyStatus).mockResolvedValue(mockStatus);

      await useProxyStore.getState().start();

      expect(ipc.startProxy).toHaveBeenCalled();
      expect(ipc.getProxyStatus).toHaveBeenCalled();
      expect(useProxyStore.getState().loading).toBe(false);
    });

    it('应该处理启动失败的情况', async () => {
      vi.mocked(ipc.startProxy).mockRejectedValue(new Error('Start failed'));

      await expect(useProxyStore.getState().start()).rejects.toThrow('Start failed');
      expect(useProxyStore.getState().error).toBe('Error: Start failed');
      expect(useProxyStore.getState().loading).toBe(false);
    });
  });

  describe('stop', () => {
    it('应该成功停止代理并重置状态', async () => {
      // 先设置一些状态
      useProxyStore.setState({
        groups: [{ name: 'test', type: 'select', all: [], now: '' }],
        traffic: { up: 100, down: 200 },
        trafficHistory: [{ time: Date.now(), up: 50, down: 100 }],
        connections: [],
        connectionStats: { totalConnections: 5, downloadTotal: 1000, uploadTotal: 500 },
      });

      vi.mocked(ipc.stopProxy).mockResolvedValue(undefined);
      vi.mocked(ipc.getProxyStatus).mockResolvedValue({
        ...initialStatus,
        running: false,
      } as const);

      await useProxyStore.getState().stop();

      expect(ipc.stopProxy).toHaveBeenCalled();
      const state = useProxyStore.getState();
      expect(state.groups).toEqual([]);
      expect(state.traffic).toEqual({ up: 0, down: 0 });
      expect(state.trafficHistory).toEqual([]);
      expect(state.connectionStats.totalConnections).toBe(0);
    });
  });

  describe('switchMode', () => {
    it('应该成功切换代理模式', async () => {
      vi.mocked(ipc.switchMode).mockResolvedValue(undefined);

      await useProxyStore.getState().switchMode('global');

      expect(ipc.switchMode).toHaveBeenCalledWith('global');
      expect(useProxyStore.getState().status.mode).toBe('global');
    });
  });

  describe('selectProxy', () => {
    it('应该成功选择代理节点', async () => {
      useProxyStore.setState({
        groups: [{ name: 'Proxy', type: 'select', all: ['Node1', 'Node2'], now: 'Node1' }],
      });

      vi.mocked(ipc.selectProxy).mockResolvedValue(undefined);

      await useProxyStore.getState().selectProxy('Proxy', 'Node2');

      expect(ipc.selectProxy).toHaveBeenCalledWith('Proxy', 'Node2');
      expect(useProxyStore.getState().groups[0].now).toBe('Node2');
    });
  });

  describe('testDelay', () => {
    it('应该返回测试延迟', async () => {
      vi.mocked(ipc.testProxyDelay).mockResolvedValue(150);

      const delay = await useProxyStore.getState().testDelay('Node1');

      expect(ipc.testProxyDelay).toHaveBeenCalledWith('Node1');
      expect(delay).toBe(150);
    });

    it('应该在测试失败时返回 -1', async () => {
      vi.mocked(ipc.testProxyDelay).mockRejectedValue(new Error('Timeout'));

      const delay = await useProxyStore.getState().testDelay('Node1');

      expect(delay).toBe(-1);
    });
  });

  describe('fetchTraffic', () => {
    it('应该获取流量数据并更新历史记录', async () => {
      vi.mocked(ipc.getTraffic).mockResolvedValue({ up: 1000, down: 2000 });

      await useProxyStore.getState().fetchTraffic();

      const state = useProxyStore.getState();
      expect(state.traffic).toEqual({ up: 1000, down: 2000 });
      expect(state.trafficHistory.length).toBe(1);
      expect(state.trafficHistory[0].up).toBe(1000);
      expect(state.trafficHistory[0].down).toBe(2000);
    });

    it('应该限制历史记录数量为 40', async () => {
      // 先填充 40 条记录
      const history = Array.from({ length: 40 }, (_, i) => ({
        time: Date.now() - (40 - i) * 1000,
        up: i * 10,
        down: i * 20,
      }));
      useProxyStore.setState({ trafficHistory: history });

      vi.mocked(ipc.getTraffic).mockResolvedValue({ up: 5000, down: 10000 });

      await useProxyStore.getState().fetchTraffic();

      const state = useProxyStore.getState();
      expect(state.trafficHistory.length).toBe(40);
      expect(state.trafficHistory[39].up).toBe(5000);
    });
  });

  describe('setSystemProxy', () => {
    it('应该成功设置系统代理', async () => {
      vi.mocked(ipc.setSystemProxy).mockResolvedValue(undefined);

      await useProxyStore.getState().setSystemProxy(true);

      expect(ipc.setSystemProxy).toHaveBeenCalled();
      expect(useProxyStore.getState().status.system_proxy).toBe(true);
    });

    it('应该成功清除系统代理', async () => {
      useProxyStore.setState({
        status: { ...initialStatus, system_proxy: true },
      });

      vi.mocked(ipc.clearSystemProxy).mockResolvedValue(undefined);

      await useProxyStore.getState().setSystemProxy(false);

      expect(ipc.clearSystemProxy).toHaveBeenCalled();
      expect(useProxyStore.getState().status.system_proxy).toBe(false);
    });
  });

  describe('setEnhancedMode', () => {
    it('应该成功设置增强模式', async () => {
      vi.mocked(ipc.setTunMode).mockResolvedValue(undefined);

      await useProxyStore.getState().setEnhancedMode(true);

      expect(ipc.setTunMode).toHaveBeenCalledWith(true);
      expect(useProxyStore.getState().status.enhanced_mode).toBe(true);
    });
  });

  describe('closeConnection', () => {
    it('应该关闭连接并更新状态', async () => {
      useProxyStore.setState({
        connections: [
          { id: '1', metadata: {}, upload: 100, download: 200 } as never,
          { id: '2', metadata: {}, upload: 150, download: 250 } as never,
        ],
        connectionStats: { totalConnections: 2, downloadTotal: 450, uploadTotal: 250 },
      });

      vi.mocked(ipc.closeConnection).mockResolvedValue(undefined);

      await useProxyStore.getState().closeConnection('1');

      expect(ipc.closeConnection).toHaveBeenCalledWith('1');
      expect(useProxyStore.getState().connections.length).toBe(1);
      expect(useProxyStore.getState().connectionStats.totalConnections).toBe(1);
    });
  });

  describe('closeAllConnections', () => {
    it('应该关闭所有连接', async () => {
      useProxyStore.setState({
        connections: [
          { id: '1', metadata: {}, upload: 100, download: 200 } as never,
          { id: '2', metadata: {}, upload: 150, download: 250 } as never,
        ],
        connectionStats: { totalConnections: 2, downloadTotal: 450, uploadTotal: 250 },
      });

      vi.mocked(ipc.closeAllConnections).mockResolvedValue(undefined);

      await useProxyStore.getState().closeAllConnections();

      expect(ipc.closeAllConnections).toHaveBeenCalled();
      expect(useProxyStore.getState().connections).toEqual([]);
      expect(useProxyStore.getState().connectionStats.totalConnections).toBe(0);
    });
  });

  describe('applyStatus', () => {
    it('应该合并状态更新', () => {
      useProxyStore.getState().applyStatus({
        ...initialStatus,
        running: true,
        mode: 'global',
      });

      const status = useProxyStore.getState().status;
      expect(status.running).toBe(true);
      expect(status.mode).toBe('global');
      expect(status.port).toBe(7890); // 未更改的值应保留
    });
  });
});
