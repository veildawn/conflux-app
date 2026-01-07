/**
 * 删除依赖校验工具
 *
 * 用于检查删除操作是否会导致配置运行报错
 */

import type { ProfileConfig, ProxyGroupConfig } from '@/types/config';
import { parseRule } from '@/types/config';

/**
 * 依赖引用信息
 */
export interface DependencyRef {
  /** 引用类型 */
  type: 'proxy-group' | 'rule' | 'rule-set';
  /** 引用者名称 */
  name: string;
  /** 引用字段 */
  field?: string;
}

/**
 * 删除校验结果
 */
export interface DeleteValidationResult {
  /** 是否可以安全删除 */
  canDelete: boolean;
  /** 依赖此项的引用列表 */
  dependencies: DependencyRef[];
  /** 错误消息（用于显示给用户） */
  errorMessage?: string;
}

/**
 * 检查服务器（proxy）是否可以删除
 *
 * 服务器可能被策略组的 proxies 字段引用
 */
export function validateDeleteProxy(
  proxyName: string,
  config: ProfileConfig
): DeleteValidationResult {
  const dependencies: DependencyRef[] = [];
  const proxyGroups = config['proxy-groups'] || [];

  for (const group of proxyGroups) {
    // 检查 proxies 字段
    if (group.proxies?.includes(proxyName)) {
      dependencies.push({
        type: 'proxy-group',
        name: group.name,
        field: 'proxies',
      });
    }
  }

  return {
    canDelete: dependencies.length === 0,
    dependencies,
    errorMessage:
      dependencies.length > 0
        ? `服务器 "${proxyName}" 正在被 ${dependencies.length} 个策略组引用，无法删除`
        : undefined,
  };
}

/**
 * 检查代理源（proxy-provider）是否可以删除
 *
 * 代理源可能被策略组的 use 字段引用
 */
export function validateDeleteProxyProvider(
  providerName: string,
  config: ProfileConfig
): DeleteValidationResult {
  const dependencies: DependencyRef[] = [];
  const proxyGroups = config['proxy-groups'] || [];

  for (const group of proxyGroups) {
    // 检查 use 字段
    if (group.use?.includes(providerName)) {
      dependencies.push({
        type: 'proxy-group',
        name: group.name,
        field: 'use',
      });
    }
  }

  return {
    canDelete: dependencies.length === 0,
    dependencies,
    errorMessage:
      dependencies.length > 0
        ? `代理源 "${providerName}" 正在被 ${dependencies.length} 个策略组引用，无法删除`
        : undefined,
  };
}

/**
 * 检查规则源（rule-provider）是否可以删除
 *
 * 规则源可能被 RULE-SET 类型规则引用
 */
export function validateDeleteRuleProvider(
  providerName: string,
  config: ProfileConfig
): DeleteValidationResult {
  const dependencies: DependencyRef[] = [];
  const rules = config.rules || [];

  for (const rule of rules) {
    const parsed = parseRule(rule);
    if (!parsed) continue;

    // RULE-SET 规则的 payload 是 rule-provider 的名称
    if (parsed.type === 'RULE-SET' && parsed.payload === providerName) {
      dependencies.push({
        type: 'rule-set',
        name: rule,
        field: 'payload',
      });
    }
  }

  return {
    canDelete: dependencies.length === 0,
    dependencies,
    errorMessage:
      dependencies.length > 0
        ? `规则源 "${providerName}" 正在被 ${dependencies.length} 条 RULE-SET 规则引用，无法删除`
        : undefined,
  };
}

/**
 * 检查策略组是否可以删除
 *
 * 策略组可能被：
 * 1. 规则的 policy 字段引用
 * 2. 其他策略组的 proxies 字段引用
 */
export function validateDeleteProxyGroup(
  groupName: string,
  config: ProfileConfig
): DeleteValidationResult {
  const dependencies: DependencyRef[] = [];
  const rules = config.rules || [];
  const proxyGroups = config['proxy-groups'] || [];

  // 检查规则引用
  for (const rule of rules) {
    const parsed = parseRule(rule);
    if (!parsed) continue;

    if (parsed.policy === groupName) {
      dependencies.push({
        type: 'rule',
        name: rule,
        field: 'policy',
      });
    }
  }

  // 检查其他策略组的 proxies 引用
  for (const group of proxyGroups) {
    if (group.name === groupName) continue; // 跳过自己

    if (group.proxies?.includes(groupName)) {
      dependencies.push({
        type: 'proxy-group',
        name: group.name,
        field: 'proxies',
      });
    }
  }

  // 构建错误消息
  let errorMessage: string | undefined;
  if (dependencies.length > 0) {
    const ruleRefs = dependencies.filter((d) => d.type === 'rule');
    const groupRefs = dependencies.filter((d) => d.type === 'proxy-group');

    const parts: string[] = [];
    if (ruleRefs.length > 0) {
      parts.push(`${ruleRefs.length} 条规则`);
    }
    if (groupRefs.length > 0) {
      parts.push(`${groupRefs.length} 个策略组`);
    }

    errorMessage = `策略组 "${groupName}" 正在被 ${parts.join(' 和 ')} 引用，无法删除`;
  }

  return {
    canDelete: dependencies.length === 0,
    dependencies,
    errorMessage,
  };
}

/**
 * 格式化依赖信息为用户友好的显示文本
 */
export function formatDependencies(dependencies: DependencyRef[]): string[] {
  return dependencies.map((dep) => {
    switch (dep.type) {
      case 'proxy-group':
        return `策略组 "${dep.name}"`;
      case 'rule':
        return `规则 "${dep.name}"`;
      case 'rule-set':
        return `RULE-SET 规则 "${dep.name}"`;
      default:
        return dep.name;
    }
  });
}

/**
 * 获取依赖引用的简短摘要
 */
export function getDependencySummary(dependencies: DependencyRef[]): string {
  const grouped = {
    'proxy-group': 0,
    rule: 0,
    'rule-set': 0,
  };

  for (const dep of dependencies) {
    grouped[dep.type]++;
  }

  const parts: string[] = [];
  if (grouped['proxy-group'] > 0) {
    parts.push(`${grouped['proxy-group']} 个策略组`);
  }
  if (grouped['rule'] > 0) {
    parts.push(`${grouped['rule']} 条规则`);
  }
  if (grouped['rule-set'] > 0) {
    parts.push(`${grouped['rule-set']} 条 RULE-SET 规则`);
  }

  return parts.join('、');
}
