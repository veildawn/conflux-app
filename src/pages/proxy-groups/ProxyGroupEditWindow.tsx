import { useEffect, useState, useMemo, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  Layers,
  Search,
  CheckCircle2,
  Zap,
  Activity,
  ShieldAlert,
  Settings2,
  Eye,
  EyeOff,
  CloudOff,
  MousePointerClick,
  Server,
  Cloud,
  Globe2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import type { ProxyGroupConfig } from '@/types/config';
import ipc from '@/services/ipc';

import {
  createDefaultFormData,
  DEFAULT_TEST_URL,
  GROUP_TYPE_OPTIONS,
  type GroupFormData,
  isValidExcludeType,
  isValidExpectedStatus,
  isValidRegexList,
  isValidUrl,
  LOAD_BALANCE_STRATEGIES,
  dedupeList,
  normalizeList,
  toggleListItem,
  STEP_METADATA,
  type StepKey,
  type SourceMode,
  SOURCE_MODE_OPTIONS,
} from './shared/utils';

// Simplified helper for common icons
const CheckIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const GROUP_TYPE_ICON_MAP: Record<string, typeof Layers> = {
  select: Layers,
  'url-test': Activity,
  fallback: ShieldAlert,
  'load-balance': Zap,
  relay: CloudOff,
};

const dragIgnoreSelector = [
  '[data-no-drag]',
  '.no-drag',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="listbox"]',
  '[contenteditable="true"]',
  '.cursor-pointer',
].join(', ');

export default function ProxyGroupEditWindow() {
  const [searchParams] = useSearchParams();
  const editName = searchParams.get('name'); // If present, we are editing
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Data needed for form
  const [proxyOptions, setProxyOptions] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const [step, setStep] = useState<StepKey>('type');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [formData, setFormData] = useState<GroupFormData>(createDefaultFormData());
  const [submitting, setSubmitting] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('manual');

  // Filter queries
  const [proxyQuery, setProxyQuery] = useState('');

  // Initial Data Fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const config = await ipc.getProfileConfig();
        const proxyNames = (config.proxies || []).map((proxy) => proxy.name);
        const groupNames = ((config['proxy-groups'] as ProxyGroupConfig[]) || []).map(
          (g) => g.name
        );
        const providers = config['proxy-providers'] || {};

        setProxyOptions(dedupeList(['DIRECT', 'REJECT', ...groupNames, ...proxyNames]));
        setProviderOptions(Object.keys(providers));

        setExistingNames(groupNames);

        if (editName) {
          const group = ((config['proxy-groups'] as ProxyGroupConfig[]) || []).find(
            (g) => g.name === editName
          );
          if (group) {
            // 根据现有配置推断 sourceMode
            let inferredSourceMode: SourceMode = 'manual';
            if (group['include-all']) {
              inferredSourceMode = 'all';
            } else if (group['include-all-proxies'] && group['include-all-providers']) {
              inferredSourceMode = 'all';
            } else if (group['include-all-proxies']) {
              inferredSourceMode = 'all-proxies';
            } else if (group['include-all-providers']) {
              inferredSourceMode = 'all-providers';
            }
            setSourceMode(inferredSourceMode);

            setFormData({
              ...createDefaultFormData(),
              name: group.name || '',
              type: group.type || 'select',
              proxies: group.proxies ? [...group.proxies] : [],
              providers: group.use ? [...group.use] : [],
              url: group.url || '',
              interval: group.interval !== undefined ? String(group.interval) : '',
              lazy: group.lazy ?? true,
              timeout: group.timeout !== undefined ? String(group.timeout) : '',
              maxFailedTimes:
                group['max-failed-times'] !== undefined ? String(group['max-failed-times']) : '',
              disableUdp: !!group['disable-udp'],
              includeAll: !!group['include-all'],
              includeAllProxies: !!group['include-all-proxies'],
              includeAllProviders: !!group['include-all-providers'],
              filter: group.filter || '',
              excludeFilter: group['exclude-filter'] || '',
              excludeType: group['exclude-type'] || '',
              expectedStatus: group['expected-status'] || '',
              hidden: !!group.hidden,
              strategy: group.strategy || '',
              tolerance: group.tolerance !== undefined ? String(group.tolerance) : '',
            });
            setStep('source'); // Start from source if editing
          } else {
            toast({ title: '错误', description: '未找到该策略组', variant: 'destructive' });
          }
        }
      } catch (err) {
        console.error(err);
        toast({ title: '初始化失败', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [editName, toast]);

  // Default values adjustment based on type
  useEffect(() => {
    if (loading) return;
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
  }, [formData.type, loading]);

  // Validation and Derived State
  const nameValue = formData.name.trim();
  const typeValue = formData.type.trim();
  const needsBehavior = ['url-test', 'fallback', 'load-balance'].includes(typeValue);
  // 是否需要显示手动选择节点的步骤
  const needsManualSelection = sourceMode === 'manual';

  const proxies = useMemo(() => normalizeList(formData.proxies), [formData.proxies]);
  const providers = useMemo(() => normalizeList(formData.providers), [formData.providers]);

  useEffect(() => {
    if (!needsBehavior && step === 'behavior') {
      setStep('advanced');
    }
    // 如果不需要手动选择但当前在 proxies 步骤，跳到下一步
    if (!needsManualSelection && step === 'proxies') {
      setStep(needsBehavior ? 'behavior' : 'advanced');
    }
  }, [needsBehavior, needsManualSelection, step]);

  const selectableTypeOptions = useMemo(
    () =>
      editName && formData.type === 'relay'
        ? GROUP_TYPE_OPTIONS
        : GROUP_TYPE_OPTIONS.filter((option) => option.value !== 'relay'),
    [editName, formData.type]
  );

  const availableProxyOptions = useMemo(() => {
    const blockedNames = new Set([editName, nameValue].filter(Boolean));
    return proxyOptions.filter((item) => typeof item === 'string' && !blockedNames.has(item));
  }, [proxyOptions, editName, nameValue]);

  const filteredProxyOptions = availableProxyOptions.filter(
    (item) =>
      item && typeof item === 'string' && item.toLowerCase().includes(proxyQuery.toLowerCase())
  );
  const hasProviderOptions = providerOptions.length > 0;
  // Disabled as provider selection is not fully implemented in UI yet, but keeping logic ready
  // const filteredProviderOptions = providerOptions.filter((item) =>
  //   item.toLowerCase().includes(providerQuery.toLowerCase())
  // );

  const urlValue = formData.url.trim();
  const intervalValue = formData.interval.trim() === '' ? null : Number(formData.interval);
  const timeoutValue = formData.timeout.trim() === '' ? null : Number(formData.timeout);
  const maxFailedTimesValue =
    formData.maxFailedTimes.trim() === '' ? null : Number(formData.maxFailedTimes);
  const toleranceValue = formData.tolerance.trim() === '' ? null : Number(formData.tolerance);
  const expectedStatusValue = formData.expectedStatus.trim();
  const strategyValue = formData.strategy.trim();

  // Validations
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
  const excludeTypeValid = isValidExcludeType(formData.excludeType);
  const expectedStatusValid = isValidExpectedStatus(expectedStatusValue);
  const strategyValid =
    !strategyValue || LOAD_BALANCE_STRATEGIES.some((strategy) => strategy.value === strategyValue);

  const providersEnabled = sourceMode === 'manual';
  const hasProviders = providersEnabled && providers.length > 0;
  // 如果是自动模式，始终有来源；手动模式需要选择节点或代理源
  const hasSources = sourceMode !== 'manual' || proxies.length > 0 || hasProviders;
  const nameTaken =
    !!nameValue && existingNames.includes(nameValue) && (!editName || editName !== nameValue);

  const visibleSteps = useMemo<StepKey[]>(() => {
    const steps: StepKey[] = ['type', 'source'];
    if (needsManualSelection) steps.push('proxies');
    if (needsBehavior) steps.push('behavior');
    steps.push('advanced');
    return steps;
  }, [needsBehavior, needsManualSelection]);

  const stepIndex = Math.max(0, visibleSteps.indexOf(step));
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === visibleSteps.length - 1;

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

    if (needsBehavior) {
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

      if (typeValue === 'url-test' && formData.tolerance.trim() && !toleranceValid) {
        next.tolerance = '请输入有效的非负整数';
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

    return next;
  }, [
    nameValue,
    nameTaken,
    typeValue,
    proxies,
    hasSources,
    needsBehavior,
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

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const group: ProxyGroupConfig = {
        name: nameValue,
        type: typeValue,
      };

      // Only add proxies if not empty (mihomo rejects empty proxies array)
      if (proxies.length > 0) {
        group.proxies = proxies;
      }

      // ... Map all fields from formData to group object
      const providerList = providersEnabled ? providers : [];
      if (providerList.length) group.use = providerList;
      if (needsBehavior) {
        if (urlValue) group.url = urlValue;
        if (intervalValue !== null && !Number.isNaN(intervalValue)) group.interval = intervalValue;
        if (formData.lazy !== undefined) group.lazy = formData.lazy;
        if (timeoutValue !== null && !Number.isNaN(timeoutValue)) group.timeout = timeoutValue;
        if (maxFailedTimesValue !== null && !Number.isNaN(maxFailedTimesValue))
          group['max-failed-times'] = maxFailedTimesValue;
        if (expectedStatusValue) group['expected-status'] = expectedStatusValue;
        if (typeValue === 'load-balance' && strategyValue) group.strategy = strategyValue;
        if (typeValue === 'url-test' && toleranceValue !== null && !Number.isNaN(toleranceValue)) {
          group.tolerance = toleranceValue;
        }
      }
      if (formData.disableUdp) group['disable-udp'] = true;

      // 根据 sourceMode 设置自动包含标志
      if (sourceMode === 'all') {
        group['include-all'] = true;
      } else if (sourceMode === 'all-proxies') {
        group['include-all-proxies'] = true;
      } else if (sourceMode === 'all-providers') {
        group['include-all-providers'] = true;
      }
      // manual 模式不设置任何自动包含标志
      if (formData.filter.trim()) group.filter = formData.filter.trim();
      if (formData.excludeFilter.trim()) group['exclude-filter'] = formData.excludeFilter.trim();
      if (formData.excludeType.trim()) group['exclude-type'] = formData.excludeType.trim();
      if (formData.hidden) group.hidden = true;

      // Save via IPC
      await ipc.updateProxyGroup(group, editName || undefined);

      // Notify main window to refresh
      await emit('proxy-groups-changed');

      // Close window on success
      await getCurrentWindow().close();
    } catch (error) {
      console.error(error);
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    nameValue,
    typeValue,
    proxies,
    providersEnabled,
    providers,
    needsBehavior,
    urlValue,
    intervalValue,
    formData,
    timeoutValue,
    maxFailedTimesValue,
    expectedStatusValue,
    strategyValue,
    toleranceValue,
    editName,
    toast,
  ]);

  const currentMeta = STEP_METADATA[step] || STEP_METADATA.type;

  const handleNext = useCallback(() => {
    if (step === 'type') {
      if (!nameValue || !!errors.name) {
        toast({
          title: '参数错误',
          description: errors.name || '请选择策略组类型',
          variant: 'destructive',
        });
        return;
      }
    }
    const nextStep = visibleSteps[stepIndex + 1];
    if (nextStep) {
      setDirection('forward');
      setStep(nextStep);
    }
  }, [step, nameValue, errors.name, toast, visibleSteps, stepIndex]);

  const handleBack = useCallback(() => {
    const prevStep = visibleSteps[stepIndex - 1];
    if (prevStep) {
      setDirection('backward');
      setStep(prevStep);
    }
  }, [visibleSteps, stepIndex]);

  const handleGoToStep = useCallback(
    (target: StepKey) => {
      if (!visibleSteps.includes(target)) return;
      const targetIndex = visibleSteps.indexOf(target);
      setDirection(targetIndex >= stepIndex ? 'forward' : 'backward');
      setStep(target);
    },
    [visibleSteps, stepIndex]
  );

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        if (step === 'advanced') handleSubmit();
        else handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, canSubmit, handleNext, handleSubmit]);

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(dragIgnoreSelector)) {
      return;
    }
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.warn('Failed to start dragging:', error);
      });
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/8 bg-[radial-gradient(circle_at_10%_20%,rgba(255,200,200,0.6)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(180,220,255,0.8)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f0f0f5_0%,#e0e0eb_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden border-none">
        <div className="absolute left-0 top-32 h-64 w-64 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />
      </div>

      <div className="relative h-full w-full grid grid-cols-[240px_1fr] border-none">
        <div className="flex flex-col bg-white/35 px-6 pt-3 pb-6 border-r border-black/5 backdrop-blur-[50px] rounded-l-xl border-l-0 border-t-0 border-b-0">
          <div className="flex flex-col gap-2">
            {visibleSteps.map((key, index) => {
              const meta = STEP_METADATA[key];
              const isActive = step === key;
              const isCompleted = stepIndex > index;
              return (
                <div
                  key={key}
                  onClick={() => handleGoToStep(key)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all cursor-pointer',
                    isActive
                      ? 'bg-white/70 text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:bg-white/40'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white border-transparent'
                        : isCompleted
                          ? 'bg-white/70 text-neutral-600 border-transparent'
                          : 'border-black/10 text-neutral-400'
                    )}
                  >
                    {index + 1}
                  </div>
                  <span>{meta.title}</span>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-500 shadow-[0_0_8px_rgba(0,122,255,0.7)]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex flex-col overflow-hidden bg-white/25 backdrop-blur-[50px] rounded-r-xl">
          <div className="flex-none px-8 pt-10 pb-6">
            <h1 className="text-2xl font-semibold text-neutral-900">{currentMeta.title}</h1>
            <p className="mt-1 text-sm text-neutral-500">{currentMeta.description}</p>
          </div>

          <div className="flex-1 min-h-0 relative">
            <div
              className={cn(
                'absolute inset-0 px-8 pb-24',
                step === 'proxies'
                  ? 'overflow-hidden flex flex-col'
                  : 'overflow-y-auto custom-scrollbar'
              )}
            >
              <div
                className={cn(
                  'h-full transition-all duration-500 ease-out',
                  direction === 'forward'
                    ? 'animate-in fade-in slide-in-from-right-8'
                    : 'animate-in fade-in slide-in-from-left-8',
                  step === 'proxies' && 'flex flex-col'
                )}
              >
                {step === 'type' && (
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                        策略组名称
                      </label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className={cn(
                          'h-12 rounded-2xl bg-white/40 border border-white/60 px-4 text-base font-semibold text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all focus-visible:ring-4 focus-visible:ring-blue-500/20',
                          errors.name
                            ? 'border-red-400/60 focus-visible:ring-red-500/20'
                            : 'focus-visible:border-blue-500'
                        )}
                        placeholder="输入名称..."
                        autoFocus
                      />
                      {errors.name && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-red-500">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errors.name}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                        分发模式
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectableTypeOptions.map((option) => {
                          const selected = typeValue === option.value;
                          const Icon = GROUP_TYPE_ICON_MAP[option.value] || Layers;
                          return (
                            <div
                              key={option.value}
                              onClick={() =>
                                setFormData((prev) => ({ ...prev, type: option.value }))
                              }
                              className={cn(
                                'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
                                selected
                                  ? 'bg-white/80 border-blue-500 shadow-[0_0_20px_rgba(0,122,255,0.2)]'
                                  : 'bg-white/45 border-transparent hover:bg-white/70 hover:border-white/70'
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={cn(
                                    'h-12 w-12 rounded-full flex items-center justify-center shadow-[0_4px_8px_rgba(0,0,0,0.06)]',
                                    selected ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'
                                  )}
                                >
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-semibold text-neutral-900">
                                      {option.label}
                                    </h3>
                                    {option.deprecated && (
                                      <Badge
                                        variant="destructive"
                                        className="h-4 text-[9px] px-1 uppercase font-bold"
                                      >
                                        已弃用
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                                    {option.description}
                                  </p>
                                </div>
                                {selected && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_12px_rgba(0,122,255,0.4)]">
                                    <CheckIcon />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {step === 'source' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {SOURCE_MODE_OPTIONS.map((option) => {
                        const selected = sourceMode === option.value;
                        const IconComponent = {
                          manual: MousePointerClick,
                          proxies: Server,
                          providers: Cloud,
                          all: Globe2,
                        }[option.icon];
                        return (
                          <div
                            key={option.value}
                            onClick={() => setSourceMode(option.value)}
                            className={cn(
                              'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
                              selected
                                ? 'bg-white/80 border-blue-500 shadow-[0_0_20px_rgba(0,122,255,0.2)]'
                                : 'bg-white/45 border-transparent hover:bg-white/70 hover:border-white/70'
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={cn(
                                  'h-12 w-12 rounded-full flex items-center justify-center shadow-[0_4px_8px_rgba(0,0,0,0.06)]',
                                  selected ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'
                                )}
                              >
                                <IconComponent className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-neutral-900">
                                  {option.title}
                                </h3>
                                <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                                  {option.description}
                                </p>
                              </div>
                              {selected && (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_12px_rgba(0,122,255,0.4)]">
                                  <CheckIcon />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 过滤器配置 - 对自动模式有用 */}
                    {sourceMode !== 'manual' && (
                      <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                          <Search className="h-3.5 w-3.5" />
                          节点过滤正则
                          {!filterValid && formData.filter && (
                            <Badge variant="destructive" className="h-4 px-1 text-[8px]">
                              正则错误
                            </Badge>
                          )}
                        </div>
                        <Input
                          value={formData.filter}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, filter: e.target.value }))
                          }
                          placeholder="例如: US|HK|SG（留空包含全部）"
                          className={cn(
                            'h-10 rounded-xl bg-white/70 border border-white/70 text-sm font-mono',
                            !filterValid && formData.filter && 'border-red-400/60 text-red-500'
                          )}
                        />
                        <p className="text-xs text-neutral-400">
                          使用正则表达式过滤节点名称，只有匹配的节点才会被包含
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {step === 'proxies' && (
                  <div className="flex flex-col h-full space-y-5">
                    {/* 过滤器 - 置顶 */}
                    <div className="space-y-3 shrink-0">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-indigo-500" />
                        节点过滤
                      </div>

                      <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] overflow-hidden px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                          包含过滤正则
                          {!filterValid && formData.filter && (
                            <Badge variant="destructive" className="h-4 px-1 text-[8px]">
                              正则错误
                            </Badge>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            value={formData.filter}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, filter: e.target.value }))
                            }
                            placeholder="例如: US|HK|SG"
                            className={cn(
                              'h-9 rounded-xl bg-white/70 border border-white/70 text-xs font-mono',
                              !filterValid && formData.filter && 'border-red-400/60 text-red-500'
                            )}
                          />
                          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-5">
                      {/* 可用子策略 / 节点 */}
                      <div className="flex flex-col min-h-0 flex-1 gap-3">
                        <div className="flex items-center justify-between shrink-0">
                          <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-blue-500" />
                            可用子策略 / 节点
                          </div>
                          <div className="text-[11px] font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            已选: {proxies.length}
                          </div>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] overflow-hidden">
                          <div className="p-3 border-b border-white/60 bg-white/60 shrink-0">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                              <Input
                                value={proxyQuery}
                                onChange={(e) => setProxyQuery(e.target.value)}
                                placeholder="搜索节点、区域..."
                                className="h-9 pl-10 pr-10 rounded-xl bg-white/70 border border-white/70 text-sm font-medium"
                              />
                              {proxyQuery && (
                                <button
                                  onClick={() => setProxyQuery('')}
                                  className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-neutral-100/80 text-neutral-500 text-xs"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                            {filteredProxyOptions.length === 0 ? (
                              <div className="py-10 text-center text-xs text-neutral-400">
                                无匹配结果
                              </div>
                            ) : (
                              filteredProxyOptions.map((p) => {
                                const isSelected = proxies.includes(p);
                                return (
                                  <div
                                    key={p}
                                    onClick={() =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        proxies: toggleListItem(prev.proxies, p),
                                      }))
                                    }
                                    className={cn(
                                      'flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all cursor-pointer',
                                      isSelected
                                        ? 'bg-white/90 border-blue-500 shadow-[0_4px_12px_rgba(0,0,0,0.06)]'
                                        : 'bg-white/40 border-transparent hover:bg-white/70'
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        'h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600'
                                          : 'border-neutral-300'
                                      )}
                                    >
                                      {isSelected && (
                                        <span className="text-white text-xs font-bold">✓</span>
                                      )}
                                    </div>
                                    <span className="text-sm font-medium text-neutral-800 truncate">
                                      {p}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 外部策略集 */}
                      {hasProviderOptions && (
                        <div className="flex flex-col min-h-0 lg:w-[280px] shrink-0 gap-3">
                          <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2 shrink-0">
                            <div className="h-2 w-2 rounded-full bg-orange-400" />
                            外部策略集
                          </div>

                          <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-2 space-y-1.5 custom-scrollbar">
                            {providerOptions.map((p) => {
                              const isSelected = providers.includes(p);
                              return (
                                <div
                                  key={p}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      providers: toggleListItem(prev.providers, p),
                                    }))
                                  }
                                  className={cn(
                                    'flex items-center gap-3 rounded-xl px-3 py-2 border transition-all cursor-pointer',
                                    isSelected
                                      ? 'bg-orange-500/10 border-orange-400 shadow-[0_4px_10px_rgba(251,146,60,0.15)]'
                                      : 'bg-white/40 border-transparent hover:bg-white/70'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'h-7 w-7 rounded-xl flex items-center justify-center shrink-0',
                                      isSelected
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-orange-500/10 text-orange-500'
                                    )}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-neutral-800 truncate">
                                      {p}
                                    </div>
                                    <div className="text-[10px] text-neutral-400">
                                      {isSelected ? '已包含' : '未包含'}
                                    </div>
                                  </div>
                                  {isSelected && <CheckIcon />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {step === 'behavior' && needsBehavior && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_24px_rgba(0,0,0,0.06)] space-y-5">
                      <div className="space-y-3">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                          Health Check URL
                        </label>
                        <Input
                          value={formData.url}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, url: e.target.value }))
                          }
                          className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
                          placeholder="http://www.gstatic.com/generate_204"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            测试间隔 (s)
                          </label>
                          <Input
                            value={formData.interval}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, interval: e.target.value }))
                            }
                            className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
                            placeholder="300"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            最大失败次数
                          </label>
                          <Input
                            value={formData.maxFailedTimes}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, maxFailedTimes: e.target.value }))
                            }
                            className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
                            placeholder="5"
                          />
                        </div>
                      </div>

                      {typeValue === 'url-test' && (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            容差 (ms)
                          </label>
                          <Input
                            value={formData.tolerance}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, tolerance: e.target.value }))
                            }
                            className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-semibold"
                            placeholder="50"
                          />
                        </div>
                      )}

                      <div
                        className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 border border-white/70 cursor-pointer hover:bg-white/80 transition-colors"
                        onClick={() => setFormData((prev) => ({ ...prev, lazy: !prev.lazy }))}
                      >
                        <div>
                          <div className="text-sm font-semibold text-neutral-800">懒加载模式</div>
                          <div className="text-xs text-neutral-400">
                            仅在被使用时进行测速，节省流量。
                          </div>
                        </div>
                        <Switch
                          className="scale-90 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-neutral-200"
                          checked={formData.lazy}
                          onCheckedChange={(c) => setFormData((prev) => ({ ...prev, lazy: c }))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {typeValue === 'load-balance' && (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                          分流算法
                        </div>
                        <div className="grid gap-3">
                          {LOAD_BALANCE_STRATEGIES.map((strategy) => {
                            const selected = formData.strategy === strategy.value;
                            return (
                              <div
                                key={strategy.value}
                                onClick={() =>
                                  setFormData((prev) => ({ ...prev, strategy: strategy.value }))
                                }
                                className={cn(
                                  'flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all cursor-pointer',
                                  selected
                                    ? 'bg-white/90 border-blue-500 shadow-[0_4px_12px_rgba(0,122,255,0.12)]'
                                    : 'bg-white/45 border-transparent hover:bg-white/70'
                                )}
                              >
                                <div
                                  className={cn(
                                    'h-9 w-9 rounded-xl flex items-center justify-center',
                                    selected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-blue-500/10 text-blue-600'
                                  )}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-neutral-800">
                                    {strategy.label}
                                  </div>
                                  <div className="text-xs text-neutral-400">
                                    {strategy.description}
                                  </div>
                                </div>
                                {selected && (
                                  <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                                    <CheckIcon />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step === 'advanced' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                          排除过滤
                        </div>
                        <div className="rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_24px_rgba(0,0,0,0.06)] space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                              正则排除
                            </label>
                            <Input
                              value={formData.excludeFilter}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, excludeFilter: e.target.value }))
                              }
                              className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
                              placeholder="例如: 流量|过期|Back"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                              类型过滤
                            </label>
                            <Input
                              value={formData.excludeType}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, excludeType: e.target.value }))
                              }
                              className="h-10 rounded-xl bg-white/80 border border-white/70 text-sm font-mono"
                              placeholder="例如: Shadowsocks"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                          显示控制
                        </div>
                        <div className="rounded-3xl border border-white/60 bg-white/55 shadow-[0_12px_24px_rgba(0,0,0,0.06)] overflow-hidden">
                          <div
                            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, hidden: !prev.hidden }))
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'h-9 w-9 rounded-2xl flex items-center justify-center',
                                  !formData.hidden
                                    ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(0,122,255,0.2)]'
                                    : 'bg-white/70 text-neutral-400'
                                )}
                              >
                                {!formData.hidden ? (
                                  <Eye className="h-4 w-4" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-neutral-800">
                                  在首页显示
                                </div>
                                <div className="text-xs text-neutral-400">
                                  将此策略组展示在主面板中。
                                </div>
                              </div>
                            </div>
                            <Switch
                              className="scale-90 data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-neutral-200"
                              checked={!formData.hidden}
                              onCheckedChange={(c) =>
                                setFormData((prev) => ({ ...prev, hidden: !c }))
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="border-t border-white/60" />

                          <div
                            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, disableUdp: !prev.disableUdp }))
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'h-9 w-9 rounded-2xl flex items-center justify-center',
                                  formData.disableUdp
                                    ? 'bg-orange-500 text-white shadow-[0_4px_12px_rgba(251,146,60,0.2)]'
                                    : 'bg-white/70 text-neutral-400'
                                )}
                              >
                                <CloudOff className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-neutral-800">
                                  禁用 UDP
                                </div>
                                <div className="text-xs text-neutral-400">
                                  强制通过 TCP 转发流量。
                                </div>
                              </div>
                            </div>
                            <Switch
                              className="scale-90 data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-neutral-200"
                              checked={formData.disableUdp}
                              onCheckedChange={(c) =>
                                setFormData((prev) => ({ ...prev, disableUdp: c }))
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleClose}
              className="h-10 px-5 rounded-full bg-white/40 text-neutral-700 border border-white/60 hover:bg-white/70"
            >
              取消
            </Button>

            <div className="flex items-center gap-3">
              {!isFirstStep && (
                <Button
                  variant="secondary"
                  onClick={handleBack}
                  className="h-10 px-6 rounded-full bg-white/40 text-neutral-800 border border-white/60 hover:bg-white/70"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一步
                </Button>
              )}
              <Button
                onClick={isLastStep ? handleSubmit : handleNext}
                className={cn(
                  'h-10 px-7 rounded-full font-semibold shadow-[0_6px_16px_rgba(0,122,255,0.25)]',
                  'bg-blue-600 hover:bg-blue-500 text-white'
                )}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    保存中...
                  </>
                ) : isLastStep ? (
                  <>
                    完成设置
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    下一步
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
