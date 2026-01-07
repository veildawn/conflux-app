import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { useToast } from '@/hooks/useToast';
import ipc from '@/services/ipc';
import type { ProxyGroupConfig } from '@/types/config';
import logger from '@/utils/logger';
import {
  createDefaultFormData,
  DEFAULT_TEST_URL,
  GROUP_TYPE_OPTIONS,
  type GroupFormData,
  type GroupTypeOption,
  isValidExcludeType,
  isValidExpectedStatus,
  isValidRegexList,
  isValidUrl,
  LOAD_BALANCE_STRATEGIES,
  dedupeList,
  normalizeList,
  STEP_METADATA,
  type StepKey,
  type SourceMode,
} from '../shared/utils';

export function useProxyGroupForm() {
  const [searchParams] = useSearchParams();
  const editName = searchParams.get('name');
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
            setStep('source');
          } else {
            toast({ title: '错误', description: '未找到该策略组', variant: 'destructive' });
          }
        }
      } catch (err) {
        logger.error('Failed to fetch initial data:', err);
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
  const needsManualSelection = sourceMode === 'manual';

  const proxies = useMemo(() => normalizeList(formData.proxies), [formData.proxies]);
  const providers = useMemo(() => normalizeList(formData.providers), [formData.providers]);

  useEffect(() => {
    if (!needsBehavior && step === 'behavior') {
      setStep('advanced');
    }
    if (!needsManualSelection && step === 'proxies') {
      setStep(needsBehavior ? 'behavior' : 'advanced');
    }
  }, [needsBehavior, needsManualSelection, step]);

  const selectableTypeOptions = useMemo<GroupTypeOption[]>(
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

      if (proxies.length > 0) {
        group.proxies = proxies;
      }

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

      if (sourceMode === 'all') {
        group['include-all'] = true;
      } else if (sourceMode === 'all-proxies') {
        group['include-all-proxies'] = true;
      } else if (sourceMode === 'all-providers') {
        group['include-all-providers'] = true;
      }
      if (formData.filter.trim()) group.filter = formData.filter.trim();
      if (formData.excludeFilter.trim()) group['exclude-filter'] = formData.excludeFilter.trim();
      if (formData.excludeType.trim()) group['exclude-type'] = formData.excludeType.trim();
      if (formData.hidden) group.hidden = true;

      await ipc.updateProxyGroup(group, editName || undefined);
      await emit('proxy-groups-changed');
      await getCurrentWindow().close();
    } catch (error) {
      logger.error('Failed to save proxy group:', error);
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
    sourceMode,
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

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return {
    // State
    loading,
    step,
    direction,
    formData,
    setFormData,
    submitting,
    sourceMode,
    setSourceMode,
    proxyQuery,
    setProxyQuery,

    // Derived state
    editName,
    typeValue,
    needsBehavior,
    needsManualSelection,
    selectableTypeOptions,
    filteredProxyOptions,
    providerOptions,
    hasProviderOptions,
    visibleSteps,
    stepIndex,
    isFirstStep,
    isLastStep,
    errors,
    canSubmit,
    currentMeta,

    // Actions
    handleSubmit,
    handleNext,
    handleBack,
    handleGoToStep,
    handleClose,
  };
}
