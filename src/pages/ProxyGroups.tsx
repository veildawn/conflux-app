import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Edit3, Layers, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ipc } from '@/services/ipc';
import { cn } from '@/utils/cn';
import { buildRule, parseRule } from '@/types/config';
import type { ProfileConfig, ProfileMetadata, ProxyGroupConfig } from '@/types/config';

type GroupFormData = {
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
  icon: string;
  strategy: string;
  tolerance: string;
};

type GroupTypeOption = {
  value: string;
  label: string;
  description: string;
  deprecated?: boolean;
};

const DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204';

const GROUP_TYPE_OPTIONS: GroupTypeOption[] = [
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

const LOAD_BALANCE_STRATEGIES = [
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

const ADAPTER_TYPES = [
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

const ADAPTER_TYPE_SET = new Set(ADAPTER_TYPES.map((type) => type.toUpperCase()));

const dedupeList = (items: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
};

const normalizeList = (items: string[]) =>
  dedupeList(items.map((item) => item.trim()).filter(Boolean));

const toggleListItem = (items: string[], value: string) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const isValidUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const splitRegexList = (value: string) =>
  value
    .split('`')
    .map((item) => item.trim())
    .filter(Boolean);

const isValidRegexList = (value: string) => {
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

const isValidExpectedStatus = (value: string) => {
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

const isValidExcludeType = (value: string) => {
  if (!value.trim()) return true;
  const tokens = value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => ADAPTER_TYPE_SET.has(token.replace(/\s+/g, '').toUpperCase()));
};

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = 'text-gray-500',
  action,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  icon?: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden',
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn('w-4 h-4', iconColor)} />}
            {title && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 z-10 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

const createDefaultFormData = (): GroupFormData => ({
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
  icon: '',
  strategy: '',
  tolerance: '',
});

function ProxyGroupDialog({
  open,
  onClose,
  onSubmit,
  editData,
  existingNames,
  proxyOptions,
  providerOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (group: ProxyGroupConfig, originalName?: string) => Promise<void>;
  editData?: ProxyGroupConfig | null;
  existingNames: string[];
  proxyOptions: string[];
  providerOptions: string[];
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<GroupFormData>(() => createDefaultFormData());
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [proxyQuery, setProxyQuery] = useState('');
  const [providerQuery, setProviderQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editData) {
      setFormData({
        ...createDefaultFormData(),
        name: editData.name || '',
        type: editData.type || 'select',
        proxies: editData.proxies ? [...editData.proxies] : [],
        providers: editData.use ? [...editData.use] : [],
        url: editData.url || '',
        interval: editData.interval !== undefined ? String(editData.interval) : '',
        lazy: editData.lazy ?? true,
        timeout: editData.timeout !== undefined ? String(editData.timeout) : '',
        maxFailedTimes:
          editData['max-failed-times'] !== undefined ? String(editData['max-failed-times']) : '',
        disableUdp: !!editData['disable-udp'],
        includeAll: !!editData['include-all'],
        includeAllProxies: !!editData['include-all-proxies'],
        includeAllProviders: !!editData['include-all-providers'],
        filter: editData.filter || '',
        excludeFilter: editData['exclude-filter'] || '',
        excludeType: editData['exclude-type'] || '',
        expectedStatus: editData['expected-status'] || '',
        hidden: !!editData.hidden,
        icon: editData.icon || '',
        strategy: editData.strategy || '',
        tolerance: editData.tolerance !== undefined ? String(editData.tolerance) : '',
      });
      setStep('details');
    } else {
      setFormData(createDefaultFormData());
      setStep('type');
    }
    setProxyQuery('');
    setProviderQuery('');
  }, [editData, open]);

  useEffect(() => {
    if (!open || editData) return;
    setFormData((prev) => {
      const next: Partial<GroupFormData> = {};
      if (['url-test', 'fallback', 'load-balance'].includes(prev.type)) {
        if (!prev.url) next.url = DEFAULT_TEST_URL;
        if (!prev.interval) next.interval = '300';
      }
      if (prev.type === 'load-balance' && !prev.strategy) {
        next.strategy = 'round-robin';
      }
      return Object.keys(next).length ? { ...prev, ...next } : prev;
    });
  }, [formData.type, open, editData]);

  const nameValue = formData.name.trim();
  const typeValue = formData.type.trim();
  const proxies = normalizeList(formData.proxies);
  const providers = normalizeList(formData.providers);
  const urlValue = formData.url.trim();
  const intervalValue = formData.interval.trim() === '' ? null : Number(formData.interval);
  const timeoutValue = formData.timeout.trim() === '' ? null : Number(formData.timeout);
  const maxFailedTimesValue =
    formData.maxFailedTimes.trim() === '' ? null : Number(formData.maxFailedTimes);
  const toleranceValue = formData.tolerance.trim() === '' ? null : Number(formData.tolerance);
  const expectedStatusValue = formData.expectedStatus.trim();
  const strategyValue = formData.strategy.trim();
  const intervalValid =
    intervalValue === null || (Number.isInteger(intervalValue) && intervalValue >= 0);
  const timeoutValid =
    timeoutValue === null || (Number.isInteger(timeoutValue) && timeoutValue > 0);
  const maxFailedTimesValid =
    maxFailedTimesValue === null ||
    (Number.isInteger(maxFailedTimesValue) && maxFailedTimesValue >= 0);
  const toleranceValid =
    toleranceValue === null || (Number.isInteger(toleranceValue) && toleranceValue >= 0);
  const urlValid = isValidUrl(urlValue);
  const filterValid = isValidRegexList(formData.filter);
  const excludeFilterValid = isValidRegexList(formData.excludeFilter);
  const expectedStatusValid = isValidExpectedStatus(expectedStatusValue);
  const excludeTypeValid = isValidExcludeType(formData.excludeType);
  const strategyValid =
    !strategyValue || LOAD_BALANCE_STRATEGIES.some((strategy) => strategy.value === strategyValue);

  const providersEnabled = !formData.includeAll && !formData.includeAllProviders;
  const hasProviders = providersEnabled && providers.length > 0;
  const hasAutoProviders = formData.includeAll || formData.includeAllProviders;
  const hasAutoProxies = formData.includeAll || formData.includeAllProxies;
  const hasSources = proxies.length > 0 || hasProviders || hasAutoProviders || hasAutoProxies;
  const nameTaken =
    !!nameValue && existingNames.includes(nameValue) && (!editData || editData.name !== nameValue);

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!nameValue) {
      next.name = '请输入名称';
    } else if (nameTaken) {
      next.name = '名称已存在，请更换';
    }
    if (!typeValue) {
      next.type = '请选择策略组类型';
    }
    if (proxies.includes(nameValue)) {
      next.proxies = '不能包含自身';
    }
    if (!hasSources) {
      next.sources = '至少选择一个节点/策略组或代理集合';
    }
    if (urlValue && !urlValid) {
      next.url = '请输入有效的 URL';
    }
    if (formData.interval.trim() && !intervalValid) {
      next.interval = '请输入有效的非负整数';
    }
    if (formData.interval.trim() && !urlValue) {
      next.url = '填写测速 URL 后才能设置间隔';
    }
    if (formData.timeout.trim() && !timeoutValid) {
      next.timeout = '请输入有效的正整数';
    }
    if (formData.maxFailedTimes.trim() && !maxFailedTimesValid) {
      next.maxFailedTimes = '请输入有效的非负整数';
    }
    if (formData.tolerance.trim() && !toleranceValid) {
      next.tolerance = '请输入有效的非负整数';
    }
    if (formData.filter.trim() && !filterValid) {
      next.filter = '正则表达式无效';
    }
    if (formData.excludeFilter.trim() && !excludeFilterValid) {
      next.excludeFilter = '正则表达式无效';
    }
    if (formData.excludeType.trim() && !excludeTypeValid) {
      next.excludeType = '节点类型不合法';
    }
    if (expectedStatusValue && !expectedStatusValid) {
      next.expectedStatus = '状态码格式不正确';
    }
    if (expectedStatusValue && !urlValue) {
      next.expectedStatus = '配置期望状态码前需要填写测速 URL';
    }
    if (typeValue === 'load-balance' && strategyValue && !strategyValid) {
      next.strategy = '请选择有效的负载策略';
    }
    return next;
  }, [
    nameValue,
    nameTaken,
    typeValue,
    proxies,
    hasSources,
    urlValue,
    urlValid,
    formData.interval,
    intervalValid,
    formData.timeout,
    timeoutValid,
    formData.maxFailedTimes,
    maxFailedTimesValid,
    formData.tolerance,
    toleranceValid,
    formData.filter,
    filterValid,
    formData.excludeFilter,
    excludeFilterValid,
    formData.excludeType,
    excludeTypeValid,
    expectedStatusValue,
    expectedStatusValid,
    strategyValue,
    strategyValid,
  ]);

  const canSubmit = Object.keys(errors).length === 0 && !submitting;

  const availableProxyOptions = useMemo(() => {
    const blockedNames = new Set([editData?.name, nameValue].filter(Boolean));
    return proxyOptions.filter((item) => !blockedNames.has(item));
  }, [proxyOptions, editData?.name, nameValue]);

  const filteredProxyOptions = availableProxyOptions.filter((item) =>
    item.toLowerCase().includes(proxyQuery.toLowerCase())
  );
  const filteredProviderOptions = providerOptions.filter((item) =>
    item.toLowerCase().includes(providerQuery.toLowerCase())
  );

  const selectedType = GROUP_TYPE_OPTIONS.find((option) => option.value === typeValue);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const group: ProxyGroupConfig = {
        name: nameValue,
        type: typeValue,
        proxies,
      };

      const providerList = providersEnabled ? providers : [];
      if (providerList.length) {
        group.use = providerList;
      }
      if (urlValue) {
        group.url = urlValue;
      }
      if (intervalValue !== null && !Number.isNaN(intervalValue)) {
        group.interval = intervalValue;
      }
      if (formData.lazy !== undefined) {
        group.lazy = formData.lazy;
      }
      if (timeoutValue !== null && !Number.isNaN(timeoutValue)) {
        group.timeout = timeoutValue;
      }
      if (maxFailedTimesValue !== null && !Number.isNaN(maxFailedTimesValue)) {
        group['max-failed-times'] = maxFailedTimesValue;
      }
      if (formData.disableUdp) {
        group['disable-udp'] = true;
      }
      if (formData.includeAll) {
        group['include-all'] = true;
      }
      if (formData.includeAllProxies) {
        group['include-all-proxies'] = true;
      }
      if (formData.includeAllProviders) {
        group['include-all-providers'] = true;
      }
      if (formData.filter.trim()) {
        group.filter = formData.filter.trim();
      }
      if (formData.excludeFilter.trim()) {
        group['exclude-filter'] = formData.excludeFilter.trim();
      }
      if (formData.excludeType.trim()) {
        group['exclude-type'] = formData.excludeType.trim();
      }
      if (expectedStatusValue) {
        group['expected-status'] = expectedStatusValue;
      }
      if (formData.hidden) {
        group.hidden = true;
      }
      if (formData.icon.trim()) {
        group.icon = formData.icon.trim();
      }
      if (typeValue === 'load-balance' && strategyValue) {
        group.strategy = strategyValue;
      }
      if (typeValue === 'url-test' && toleranceValue !== null && !Number.isNaN(toleranceValue)) {
        group.tolerance = toleranceValue;
      }

      await onSubmit(group, editData?.name);
      onClose();
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderTypeStep = () => (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{editData ? '编辑策略组' : '添加策略组'}</DialogTitle>
        <DialogDescription>选择策略组类型</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {GROUP_TYPE_OPTIONS.map((option) => {
          const selected = typeValue === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 transition-all cursor-pointer',
                selected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700',
                option.deprecated && 'opacity-70'
              )}
            >
              <input
                type="radio"
                name="proxyGroupType"
                value={option.value}
                checked={selected}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, type: event.target.value }))
                }
                className="mt-1 h-4 w-4 text-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </span>
                  {option.deprecated && (
                    <Badge variant="outline" className="text-[10px]">
                      已弃用
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={() => setStep('details')} disabled={!typeValue}>
          下一步
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  const renderDetailsStep = () => (
    <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editData ? '编辑策略组' : '添加策略组'}</DialogTitle>
        <DialogDescription>选择包含的策略并完善配置</DialogDescription>
      </DialogHeader>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 px-4 py-3">
          <div>
            <p className="text-xs text-gray-400">策略组类型</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedType?.label || typeValue || '未选择'}
            </p>
            {selectedType?.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedType.description}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setStep('type')} className="rounded-full">
            返回
          </Button>
        </div>

        {typeValue === 'relay' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Relay 已弃用，请优先使用 dialer-proxy。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如: 节点选择"
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">图标 (可选)</label>
            <Input
              value={formData.icon}
              onChange={(event) => setFormData((prev) => ({ ...prev, icon: event.target.value }))}
              placeholder="用于 API 前端展示的 icon 字符串"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">选择子策略</label>
              <span className="text-xs text-gray-400">已选 {proxies.length}</span>
            </div>
            <Input
              value={proxyQuery}
              onChange={(event) => setProxyQuery(event.target.value)}
              placeholder="搜索节点/策略组"
            />
            <div className="max-h-[320px] overflow-y-auto rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              {filteredProxyOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-400">暂无匹配的节点</div>
              ) : (
                filteredProxyOptions.map((item) => {
                  const checked = proxies.includes(item);
                  return (
                    <label
                      key={item}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-800 last:border-b-0 cursor-pointer transition-colors',
                        checked
                          ? 'bg-blue-50/70 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800/40'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600"
                        checked={checked}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            proxies: toggleListItem(prev.proxies, item),
                          }))
                        }
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{item}</span>
                    </label>
                  );
                })
              )}
            </div>
            {errors.proxies && <p className="text-xs text-red-500">{errors.proxies}</p>}
            {errors.sources && <p className="text-xs text-red-500">{errors.sources}</p>}
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <label className="text-sm font-medium">包含方式</label>
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 text-blue-600"
                  checked={formData.includeAll}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      includeAll: event.target.checked,
                      includeAllProxies: event.target.checked ? false : prev.includeAllProxies,
                      includeAllProviders: event.target.checked ? false : prev.includeAllProviders,
                    }))
                  }
                />
                <span>
                  同时包含所有节点与代理集合
                  <span className="block text-xs text-gray-400">
                    会引入全部出站代理与代理集合，策略组仍可手动添加其他策略组。
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 text-blue-600"
                  checked={formData.includeAllProxies}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      includeAllProxies: event.target.checked,
                      includeAll: event.target.checked ? false : prev.includeAll,
                    }))
                  }
                />
                <span>
                  同时包含所有节点
                  <span className="block text-xs text-gray-400">仅引入出站代理，不包含策略组。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 text-blue-600"
                  checked={formData.includeAllProviders}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      includeAllProviders: event.target.checked,
                      includeAll: event.target.checked ? false : prev.includeAll,
                    }))
                  }
                />
                <span>
                  同时包含所有代理集合
                  <span className="block text-xs text-gray-400">开启后将忽略手动选择的代理集合。</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">代理集合</label>
                <span className="text-xs text-gray-400">已选 {providers.length}</span>
              </div>
              <Input
                value={providerQuery}
                onChange={(event) => setProviderQuery(event.target.value)}
                placeholder="搜索代理集合"
              />
              <div
                className={cn(
                  'max-h-[200px] overflow-y-auto rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900',
                  !providersEnabled && 'opacity-60 pointer-events-none'
                )}
              >
                {filteredProviderOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">
                    {providerOptions.length === 0 ? '暂无代理集合' : '暂无匹配的代理集合'}
                  </div>
                ) : (
                  filteredProviderOptions.map((item) => {
                    const checked = providers.includes(item);
                    return (
                      <label
                        key={item}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-800 last:border-b-0 cursor-pointer transition-colors',
                          checked
                            ? 'bg-blue-50/70 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-zinc-800/40'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600"
                          checked={checked}
                          onChange={() =>
                            setFormData((prev) => ({
                              ...prev,
                              providers: toggleListItem(prev.providers, item),
                            }))
                          }
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200">{item}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {!providersEnabled && (
                <p className="text-xs text-gray-400">
                  已开启自动包含代理集合，此处选择将被忽略。
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">包含过滤 (可选)</label>
                <Input
                  value={formData.filter}
                  onChange={(event) => setFormData((prev) => ({ ...prev, filter: event.target.value }))}
                  placeholder="关键词或正则，使用 ` 分隔"
                />
                {errors.filter && <p className="text-xs text-red-500">{errors.filter}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">排除过滤 (可选)</label>
                <Input
                  value={formData.excludeFilter}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, excludeFilter: event.target.value }))
                  }
                  placeholder="关键词或正则，使用 ` 分隔"
                />
                {errors.excludeFilter && <p className="text-xs text-red-500">{errors.excludeFilter}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">排除类型 (可选)</label>
                <Input
                  value={formData.excludeType}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, excludeType: event.target.value }))
                  }
                  placeholder="如 Shadowsocks|Http"
                />
                {errors.excludeType && <p className="text-xs text-red-500">{errors.excludeType}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">健康检查</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">测速 URL (可选)</label>
              <Input
                value={formData.url}
                onChange={(event) => setFormData((prev) => ({ ...prev, url: event.target.value }))}
                placeholder={DEFAULT_TEST_URL}
              />
              {errors.url && <p className="text-xs text-red-500">{errors.url}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">测速间隔 (秒)</label>
              <Input
                value={formData.interval}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, interval: event.target.value }))
                }
                placeholder="例如: 300"
              />
              {errors.interval && <p className="text-xs text-red-500">{errors.interval}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">期望状态码 (可选)</label>
              <Input
                value={formData.expectedStatus}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, expectedStatus: event.target.value }))
                }
                placeholder="如 200/302/400-503"
              />
              {errors.expectedStatus && <p className="text-xs text-red-500">{errors.expectedStatus}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">超时 (毫秒)</label>
              <Input
                value={formData.timeout}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, timeout: event.target.value }))
                }
                placeholder="例如: 5000"
              />
              {errors.timeout && <p className="text-xs text-red-500">{errors.timeout}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">最大失败次数</label>
              <Input
                value={formData.maxFailedTimes}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, maxFailedTimes: event.target.value }))
                }
                placeholder="例如: 5"
              />
              {errors.maxFailedTimes && <p className="text-xs text-red-500">{errors.maxFailedTimes}</p>}
            </div>
            {typeValue === 'url-test' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">切换容差 (ms)</label>
                <Input
                  value={formData.tolerance}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, tolerance: event.target.value }))
                  }
                  placeholder="例如: 50"
                />
                {errors.tolerance && <p className="text-xs text-red-500">{errors.tolerance}</p>}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="h-4 w-4 text-blue-600"
              checked={formData.lazy}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, lazy: event.target.checked }))
              }
            />
            懒惰状态 (未选中当前策略组时不进行测试)
          </label>
        </div>

        {typeValue === 'load-balance' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">负载均衡策略</p>
            <div className="space-y-2">
              <Select
                value={formData.strategy}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, strategy: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择负载策略" />
                </SelectTrigger>
                <SelectContent>
                  {LOAD_BALANCE_STRATEGIES.map((strategy) => (
                    <SelectItem key={strategy.value} value={strategy.value}>
                      {strategy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.strategy && <p className="text-xs text-red-500">{errors.strategy}</p>}
              {strategyValue && (
                <p className="text-xs text-gray-400">
                  {LOAD_BALANCE_STRATEGIES.find((strategy) => strategy.value === strategyValue)
                    ?.description || ''}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">其他选项</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600"
                checked={formData.disableUdp}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, disableUdp: event.target.checked }))
                }
              />
              禁用 UDP
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600"
                checked={formData.hidden}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, hidden: event.target.checked }))
                }
              />
              隐藏策略组
            </label>
          </div>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button variant="outline" onClick={() => setStep('type')}>
          返回
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {step === 'type' ? renderTypeStep() : renderDetailsStep()}
    </Dialog>
  );
}

export default function ProxyGroups() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileMetadata, setProfileMetadata] = useState<ProfileMetadata | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProxyGroupConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyGroupConfig | null>(null);

  const loadActiveProfile = useCallback(async () => {
    setLoading(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (profileId) {
        const [metadata, config] = await ipc.getProfile(profileId);
        setProfileMetadata(metadata);
        setProfileConfig(config);
      } else {
        setProfileMetadata(null);
        setProfileConfig(null);
      }
    } catch (error) {
      console.error('Failed to load active profile:', error);
      setProfileMetadata(null);
      setProfileConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveProfile();
  }, [loadActiveProfile]);

  const isRemoteProfile = useMemo(() => {
    return profileMetadata?.profileType === 'remote';
  }, [profileMetadata]);

  const proxyGroups = useMemo(() => {
    const groups = profileConfig?.['proxy-groups'] || [];
    return [...groups].sort((a, b) => a.name.localeCompare(b.name));
  }, [profileConfig]);

  const proxyOptions = useMemo(() => {
    const proxies = profileConfig?.proxies?.map((proxy) => proxy.name) || [];
    const groups = proxyGroups.map((group) => group.name);
    return dedupeList(['DIRECT', 'REJECT', ...groups, ...proxies]);
  }, [profileConfig, proxyGroups]);

  const providerOptions = useMemo(() => {
    return Object.keys(profileConfig?.['proxy-providers'] || {});
  }, [profileConfig]);

  const ruleUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    const rules = profileConfig?.rules || [];
    for (const rule of rules) {
      const parsed = parseRule(rule);
      if (!parsed) continue;
      map.set(parsed.policy, (map.get(parsed.policy) || 0) + 1);
    }
    return map;
  }, [profileConfig]);

  const groupUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    const groupNames = new Set(proxyGroups.map((group) => group.name));
    for (const group of proxyGroups) {
      for (const name of group.proxies) {
        if (!groupNames.has(name)) continue;
        map.set(name, (map.get(name) || 0) + 1);
      }
    }
    return map;
  }, [proxyGroups]);

  const handleSaveGroup = async (group: ProxyGroupConfig, originalName?: string) => {
    if (!activeProfileId || !profileConfig) {
      toast({ title: '错误', description: '没有活跃的配置文件', variant: 'destructive' });
      return;
    }

    const existing = profileConfig['proxy-groups'] || [];
    const nameTaken =
      existing.some((item) => item.name === group.name) &&
      (!originalName || originalName !== group.name);
    if (nameTaken) {
      toast({ title: '保存失败', description: '策略组名称已存在', variant: 'destructive' });
      return;
    }

    let nextGroups = [...existing];
    let nextRules = [...profileConfig.rules];
    const renameFrom = originalName && originalName !== group.name ? originalName : null;

    if (originalName) {
      const index = nextGroups.findIndex((item) => item.name === originalName);
      if (index === -1) {
        toast({ title: '保存失败', description: '未找到要更新的策略组', variant: 'destructive' });
        return;
      }
      nextGroups[index] = group;
    } else {
      nextGroups.push(group);
    }

    if (renameFrom) {
      nextGroups = nextGroups.map((item) => ({
        ...item,
        proxies: item.proxies.map((proxy) => (proxy === renameFrom ? group.name : proxy)),
      }));
      nextRules = nextRules.map((rule) => {
        const parsed = parseRule(rule);
        if (!parsed || parsed.policy !== renameFrom) return rule;
        return buildRule(parsed.type, parsed.payload, group.name);
      });
    }

    const newConfig: ProfileConfig = {
      ...profileConfig,
      'proxy-groups': nextGroups,
      rules: nextRules,
    };

    await ipc.updateProfileConfig(activeProfileId, newConfig);
    setProfileConfig(newConfig);
    toast({
      title: '保存成功',
      description: originalName ? '策略组已更新' : '策略组已添加',
    });
  };

  const handleDeleteGroup = async (name: string) => {
    if (!activeProfileId || !profileConfig) return;

    const nextGroups = (profileConfig['proxy-groups'] || [])
      .filter((group) => group.name !== name)
      .map((group) => ({
        ...group,
        proxies: group.proxies.filter((proxy) => proxy !== name),
      }));

    const newConfig: ProfileConfig = {
      ...profileConfig,
      'proxy-groups': nextGroups,
    };

    try {
      await ipc.updateProfileConfig(activeProfileId, newConfig);
      setProfileConfig(newConfig);
      toast({ title: '删除成功', description: `策略组 "${name}" 已删除` });
    } catch (error) {
      console.error('Failed to delete proxy group:', error);
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
  };

  const existingNames = proxyGroups.map((group) => group.name);

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">策略组</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理 proxy-groups 配置，支持代理源引用与策略组嵌套
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isRemoteProfile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingGroup(null);
                  setDialogOpen(true);
                }}
                disabled={!activeProfileId}
                className="rounded-full gap-2 h-9 px-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
              >
                <Plus className="w-4 h-4" />
                添加策略组
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={loadActiveProfile}
              className="rounded-full h-9 w-9"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : !activeProfileId ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      ) : proxyGroups.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px] bg-gray-50/50 dark:bg-zinc-900/50">
          <Layers className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">暂无策略组</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            {isRemoteProfile ? '远程订阅的配置为只读，无法添加策略组' : '点击上方按钮添加新的策略组'}
          </p>
          {!isRemoteProfile && (
            <Button
              className="mt-4 rounded-full gap-2"
              onClick={() => {
                setEditingGroup(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              添加策略组
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proxyGroups.map((group) => {
            const ruleUsage = ruleUsageMap.get(group.name) || 0;
            const groupUsage = groupUsageMap.get(group.name) || 0;
            return (
              <BentoCard
                key={group.name}
                title={group.name}
                icon={Layers}
                iconColor="text-blue-500"
                action={
                  !isRemoteProfile ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                        title="编辑"
                        onClick={() => {
                          setEditingGroup(group);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        title="删除"
                        onClick={() => setDeleteConfirm(group)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                <div className="space-y-3 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {group.type}
                    </Badge>
                    {ruleUsage > 0 && (
                      <span className="text-[10px] text-gray-500">规则引用 {ruleUsage}</span>
                    )}
                    {groupUsage > 0 && (
                      <span className="text-[10px] text-gray-500">组内引用 {groupUsage}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p className="text-gray-600 dark:text-gray-400 line-clamp-2">
                      节点/组: {group.proxies.length ? group.proxies.join(', ') : '无'}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 line-clamp-2">
                      代理源: {group.use && group.use.length ? group.use.join(', ') : '无'}
                    </p>
                    {group.url && (
                      <p className="text-gray-500 line-clamp-1">测速 URL: {group.url}</p>
                    )}
                    {group.interval && (
                      <p className="text-gray-500">测速间隔: {group.interval} 秒</p>
                    )}
                  </div>
                </div>
              </BentoCard>
            );
          })}
        </div>
      )}

      <ProxyGroupDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingGroup(null);
        }}
        onSubmit={handleSaveGroup}
        editData={editingGroup}
        existingNames={existingNames}
        proxyOptions={proxyOptions}
        providerOptions={providerOptions}
      />

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            确定要删除策略组 "{deleteConfirm?.name}" 吗？此操作不可撤销。
            {(ruleUsageMap.get(deleteConfirm?.name || '') || 0) > 0 && (
              <span className="block mt-2 text-xs text-amber-500">
                该策略组仍被规则引用，请确认规则策略是否需要调整。
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.name) {
                  handleDeleteGroup(deleteConfirm.name);
                }
                setDeleteConfirm(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
