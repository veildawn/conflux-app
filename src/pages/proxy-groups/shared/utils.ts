export type GroupFormData = {
  name: string;
  type: string;
  proxies: string[];
  providers: string[];
  url: string;
  interval: string;
  lazy: boolean;
  timeout: string;
  maxFailedTimes: string;
  disableUdp: boolean;
  includeAll: boolean;
  includeAllProxies: boolean;
  includeAllProviders: boolean;
  filter: string;
  excludeFilter: string;
  excludeType: string;
  expectedStatus: string;
  hidden: boolean;
  strategy: string;
  tolerance: string;
};

export type GroupTypeOption = {
  value: string;
  label: string;
  description: string;
  deprecated?: boolean;
};

export const DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204';

export const GROUP_TYPE_OPTIONS: GroupTypeOption[] = [
  {
    value: 'select',
    label: '手动选择策略组',
    description: '手动指定当前使用的节点/策略。',
  },
  {
    value: 'url-test',
    label: '自动测试策略组',
    description: '通过测试 URL 延迟自动选择延迟最低的节点。',
  },
  {
    value: 'fallback',
    label: 'Fallback 策略组',
    description: '按优先级依次选择可用节点，不可用时自动回退。',
  },
  {
    value: 'load-balance',
    label: '负载均衡策略组',
    description: '按策略分配请求到多个节点，支持一致性哈希等。',
  },
  {
    value: 'relay',
    label: 'Relay 策略组',
    description: '已弃用，建议使用 dialer-proxy。',
    deprecated: true,
  },
];

export const STEP_METADATA = {
  type: {
    title: '策略组身份',
    description: '设置策略组的基本身份标识',
    nextLabel: '节点来源',
    index: 1,
  },
  source: {
    title: '节点来源',
    description: '选择如何获取代理节点',
    nextLabel: '选择节点',
    index: 2,
  },
  proxies: {
    title: '选择节点',
    description: '手动挑选要包含的节点和代理源',
    nextLabel: '行为配置',
    index: 3,
  },
  behavior: {
    title: '行为控制',
    description: '配置测速间隔周期与负载参数',
    nextLabel: '高级设置',
    index: 4,
  },
  advanced: {
    title: '高级选项',
    description: '特定的规则排除与显示设置',
    nextLabel: '保存策略',
    index: 5,
  },
} as const;

export type StepKey = keyof typeof STEP_METADATA;

/** 节点来源模式 */
export type SourceMode = 'manual' | 'all-proxies' | 'all-providers' | 'all';

export const SOURCE_MODE_OPTIONS: {
  value: SourceMode;
  title: string;
  description: string;
  icon: 'manual' | 'proxies' | 'providers' | 'all';
}[] = [
  {
    value: 'manual',
    title: '手动选择',
    description: '自己挑选要包含的节点和代理源',
    icon: 'manual',
  },
  {
    value: 'all-proxies',
    title: '包含所有手动代理',
    description: '自动导入所有已定义的代理节点',
    icon: 'proxies',
  },
  {
    value: 'all-providers',
    title: '包含所有代理源',
    description: '自动导入所有代理源（proxy-providers）中的节点',
    icon: 'providers',
  },
  {
    value: 'all',
    title: '包含全部',
    description: '自动包含所有手动代理和所有代理源',
    icon: 'all',
  },
];

export const LOAD_BALANCE_STRATEGIES = [
  {
    value: 'round-robin',
    label: 'round-robin',
    description: '轮询分配请求到不同节点。',
  },
  {
    value: 'consistent-hashing',
    label: 'consistent-hashing',
    description: '相同目标地址分配到同一节点。',
  },
  {
    value: 'sticky-sessions',
    label: 'sticky-sessions',
    description: '相同来源和目标分配到同一节点，缓存 10 分钟。',
  },
];

export const ADAPTER_TYPES = [
  'Direct',
  'Reject',
  'RejectDrop',
  'Compatible',
  'Pass',
  'Dns',
  'Relay',
  'Selector',
  'Fallback',
  'URLTest',
  'LoadBalance',
  'Shadowsocks',
  'ShadowsocksR',
  'Snell',
  'Socks5',
  'Http',
  'Vmess',
  'Vless',
  'Trojan',
  'Hysteria',
  'Hysteria2',
  'WireGuard',
  'Tuic',
  'Ssh',
];

export const ADAPTER_TYPE_SET = new Set(ADAPTER_TYPES.map((type) => type.toUpperCase()));

export const dedupeList = (items: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
};

export const normalizeList = (items: string[]) =>
  dedupeList(items.map((item) => item.trim()).filter(Boolean));

export const toggleListItem = (items: string[], value: string) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

export const isValidUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const splitRegexList = (value: string) =>
  value
    .split('`')
    .map((item) => item.trim())
    .filter(Boolean);

export const isValidRegexList = (value: string) => {
  if (!value.trim()) return true;
  try {
    for (const pattern of splitRegexList(value)) {
      new RegExp(pattern);
    }
    return true;
  } catch {
    return false;
  }
};

export const isValidExpectedStatus = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed === '*') return true;
  const parts = trimmed.split('/');
  for (const part of parts) {
    const rangeParts = part.split('-');
    if (rangeParts.length === 1) {
      if (!/^\d{3}$/.test(rangeParts[0])) return false;
      const code = Number(rangeParts[0]);
      if (code < 100 || code > 599) return false;
      continue;
    }
    if (rangeParts.length !== 2) return false;
    const [start, end] = rangeParts;
    if (!/^\d{3}$/.test(start) || !/^\d{3}$/.test(end)) return false;
    const startCode = Number(start);
    const endCode = Number(end);
    if (startCode < 100 || endCode > 599 || startCode > endCode) return false;
  }
  return true;
};

export const isValidExcludeType = (value: string) => {
  if (!value.trim()) return true;
  const tokens = value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => ADAPTER_TYPE_SET.has(token.replace(/\s+/g, '').toUpperCase()));
};

export const createDefaultFormData = (): GroupFormData => ({
  name: '',
  type: 'select',
  proxies: [],
  providers: [],
  url: '',
  interval: '',
  lazy: true,
  timeout: '',
  maxFailedTimes: '',
  disableUdp: false,
  includeAll: false,
  includeAllProxies: false,
  includeAllProviders: false,
  filter: '',
  excludeFilter: '',
  excludeType: '',
  expectedStatus: '',
  hidden: false,
  strategy: '',
  tolerance: '',
});
