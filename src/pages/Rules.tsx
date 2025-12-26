import { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  Plus, 
  Trash2, 
  GripVertical,
  Search,
  Filter,
  Save,
  RefreshCw,
  ArrowRight,
  Activity,
  FileCode,
} from 'lucide-react';
import { getRuleIconComponent } from '@/components/icons/RuleIcons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { RULE_TYPES, parseRule, buildRule, type RuleType } from '@/types/config';
import type { RuleItem } from '@/types/proxy';

// 使用自定义 SVG 图标
const getRuleIcon = getRuleIconComponent;

// 规则类型对应的颜色
// 支持配置规则格式（大写+连字符）和运行时规则格式（驼峰/混合）
const getRuleColor = (type: string) => {
  const normalizedType = type.toUpperCase().replace(/-/g, '');
  
  switch (normalizedType) {
    case 'DOMAIN':
    case 'DOMAINSUFFIX':
    case 'DOMAINKEYWORD':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
    case 'GEOIP':
    case 'GEOSITE':
      return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
    case 'IPCIDR':
    case 'IPCIDR6':
    case 'SRCIPCIDR':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
    case 'SRCPORT':
    case 'DSTPORT':
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
    case 'PROCESSNAME':
    case 'PROCESSPATH':
      return 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400';
    case 'RULESET':
      return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400';
    case 'MATCH':
      return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

// 策略颜色
const getPolicyColor = (policy: string) => {
  switch (policy.toUpperCase()) {
    case 'DIRECT':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'REJECT':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'PROXY':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default:
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
  }
};

// 默认策略选项
const DEFAULT_POLICIES = ['DIRECT', 'REJECT', 'PROXY'];

export default function Rules() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'running' | 'config'>('running');
  
  // 配置文件规则
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // 运行时规则（来自 mihomo API）
  const [runningRules, setRunningRules] = useState<RuleItem[]>([]);
  const [loadingRunning, setLoadingRunning] = useState(true);
  
  // 搜索和过滤
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  // 添加/编辑规则对话框
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>('DOMAIN');
  const [rulePayload, setRulePayload] = useState('');
  const [rulePolicy, setRulePolicy] = useState('DIRECT');
  
  // 代理组选项
  const [proxyGroups, setProxyGroups] = useState<string[]>([]);

  // 加载配置文件规则
  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await ipc.getRules();
      setRules(data);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load rules:', error);
      toast({
        title: '加载失败',
        description: '无法加载规则列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 从 mihomo API 加载运行时规则
  const loadRunningRules = async () => {
    setLoadingRunning(true);
    try {
      const data = await ipc.getRulesFromApi();
      setRunningRules(data);
    } catch (error) {
      console.error('Failed to load running rules:', error);
      // 代理未运行时不显示错误提示
      setRunningRules([]);
    } finally {
      setLoadingRunning(false);
    }
  };

  // 加载代理组
  const loadProxyGroups = async () => {
    try {
      const groups = await ipc.getProxies();
      setProxyGroups(groups.map(g => g.name));
    } catch (error) {
      // 代理未运行时忽略错误
      console.log('Proxy not running, using default policies');
    }
  };

  useEffect(() => {
    loadRules();
    loadRunningRules();
    loadProxyGroups();
  }, []);

  // 过滤后的配置规则
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const parsed = parseRule(rule);
      if (!parsed) return true;
      
      // 类型过滤
      if (filterType !== 'all' && parsed.type !== filterType) {
        return false;
      }
      
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          parsed.type.toLowerCase().includes(query) ||
          parsed.payload.toLowerCase().includes(query) ||
          parsed.policy.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [rules, searchQuery, filterType]);

  // 过滤后的运行时规则
  const filteredRunningRules = useMemo(() => {
    return runningRules.filter((rule) => {
      // 类型过滤
      if (filterType !== 'all' && rule.type !== filterType) {
        return false;
      }
      
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          rule.type.toLowerCase().includes(query) ||
          rule.payload.toLowerCase().includes(query) ||
          rule.proxy.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [runningRules, searchQuery, filterType]);

  // 保存规则
  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.saveRules(rules);
      setHasChanges(false);
      toast({
        title: '保存成功',
        description: '规则已保存并应用',
      });
    } catch (error) {
      console.error('Failed to save rules:', error);
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // 打开添加对话框
  const openAddDialog = () => {
    setEditingIndex(null);
    setRuleType('DOMAIN');
    setRulePayload('');
    setRulePolicy('DIRECT');
    setIsDialogOpen(true);
  };

  // 打开编辑对话框
  const openEditDialog = (index: number) => {
    const rule = rules[index];
    const parsed = parseRule(rule);
    if (parsed) {
      setEditingIndex(index);
      setRuleType(parsed.type);
      setRulePayload(parsed.payload);
      setRulePolicy(parsed.policy);
      setIsDialogOpen(true);
    }
  };

  // 保存规则（添加或编辑）
  const handleSaveRule = () => {
    const newRule = buildRule(ruleType, rulePayload, rulePolicy);
    
    if (editingIndex !== null) {
      // 编辑现有规则
      const newRules = [...rules];
      newRules[editingIndex] = newRule;
      setRules(newRules);
    } else {
      // 添加新规则（在 MATCH 规则之前插入）
      const matchIndex = rules.findIndex(r => r.startsWith('MATCH,'));
      if (matchIndex !== -1) {
        const newRules = [...rules];
        newRules.splice(matchIndex, 0, newRule);
        setRules(newRules);
      } else {
        setRules([...rules, newRule]);
      }
    }
    
    setHasChanges(true);
    setIsDialogOpen(false);
  };

  // 删除规则
  const handleDelete = (index: number) => {
    const actualIndex = rules.indexOf(filteredRules[index]);
    if (actualIndex !== -1) {
      const newRules = rules.filter((_, i) => i !== actualIndex);
      setRules(newRules);
      setHasChanges(true);
    }
  };

  // 获取规则类型配置
  const currentRuleTypeConfig = RULE_TYPES.find(t => t.value === ruleType);

  // 刷新当前标签页的数据
  const handleRefresh = () => {
    if (activeTab === 'running') {
      loadRunningRules();
    } else {
      loadRules();
    }
  };

  return (
    <div className="space-y-2 min-[960px]:space-y-4 pb-2 min-[960px]:pb-4">
      {/* 头部 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl min-[960px]:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">规则管理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            配置流量分流规则，决定每个连接的代理策略
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={activeTab === 'running' ? loadingRunning : loading}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", (activeTab === 'running' ? loadingRunning : loading) && "animate-spin")} />
            刷新
          </Button>
          {activeTab === 'config' && (
            <Button 
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存规则'}
            </Button>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'running' | 'config')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="running" className="gap-2">
            <Activity className="w-4 h-4" />
            运行时规则
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <FileCode className="w-4 h-4" />
            配置规则
          </TabsTrigger>
        </TabsList>

        {/* 搜索和过滤栏 */}
        <Card className="bg-white dark:bg-zinc-800 rounded-[20px] shadow-sm border border-gray-100 dark:border-zinc-700 p-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-3">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索规则..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700"
                />
              </div>
              
              {/* 类型过滤 */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px] bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700">
                  <Filter className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {RULE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* 添加按钮（仅配置规则页面显示） */}
            {activeTab === 'config' && (
              <Button onClick={openAddDialog} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4" />
                添加规则
              </Button>
            )}
          </div>
          
          {/* 统计信息 */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-700 text-sm text-gray-500">
            {activeTab === 'running' ? (
              <>
                <span>共 {runningRules.length} 条规则</span>
                {(searchQuery || filterType !== 'all') && (
                  <span>• 显示 {filteredRunningRules.length} 条</span>
                )}
              </>
            ) : (
              <>
                <span>共 {rules.length} 条规则</span>
                {(searchQuery || filterType !== 'all') && (
                  <span>• 显示 {filteredRules.length} 条</span>
                )}
                {hasChanges && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    有未保存的更改
                  </Badge>
                )}
              </>
            )}
          </div>
        </Card>

        {/* 运行时规则列表 */}
        <TabsContent value="running" className="mt-4">
          <Card className="bg-white dark:bg-zinc-800 rounded-[20px] shadow-sm border border-gray-100 dark:border-zinc-700 overflow-hidden">
            {loadingRunning ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : filteredRunningRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Activity className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">
                  {searchQuery || filterType !== 'all' ? '没有匹配的规则' : '暂无运行时规则'}
                </p>
                <p className="text-sm mt-1">
                  {searchQuery || filterType !== 'all' ? '尝试调整搜索条件' : '请确保代理已启动'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-700">
                {filteredRunningRules.map((rule, index) => {
                  const IconComponent = getRuleIcon(rule.type);
                  
                  return (
                    <div
                      key={`${rule.type}-${rule.payload}-${index}`}
                      className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors"
                    >
                      {/* 序号 */}
                      <div className="w-12 text-center text-sm text-gray-400 font-mono">
                        {index + 1}
                      </div>
                      
                      {/* 规则类型图标 */}
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        getRuleColor(rule.type)
                      )}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      
                      {/* 规则信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs font-medium rounded-md px-2">
                            {rule.type}
                          </Badge>
                          {rule.payload && (
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
                              {rule.payload}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* 箭头 */}
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                      
                      {/* 策略 */}
                      <Badge className={cn(
                        "text-xs font-medium rounded-md px-2.5 py-1 shrink-0",
                        getPolicyColor(rule.proxy)
                      )}>
                        {rule.proxy}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 配置规则列表 */}
        <TabsContent value="config" className="mt-4">
          <Card className="bg-white dark:bg-zinc-800 rounded-[20px] shadow-sm border border-gray-100 dark:border-zinc-700 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Shield className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">
                  {searchQuery || filterType !== 'all' ? '没有匹配的规则' : '暂无规则'}
                </p>
                <p className="text-sm mt-1">
                  {searchQuery || filterType !== 'all' ? '尝试调整搜索条件' : '点击上方添加按钮创建规则'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-700">
                {filteredRules.map((rule, index) => {
                  const parsed = parseRule(rule);
                  if (!parsed) return null;
                  
                  const IconComponent = getRuleIcon(parsed.type);
                  
                  return (
                    <div
                      key={`${rule}-${index}`}
                      className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer"
                      onClick={() => openEditDialog(rules.indexOf(rule))}
                    >
                      {/* 拖拽手柄 */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab text-gray-400">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      
                      {/* 序号 */}
                      <div className="w-8 text-center text-sm text-gray-400 font-mono">
                        {rules.indexOf(rule) + 1}
                      </div>
                      
                      {/* 规则类型图标 */}
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        getRuleColor(parsed.type)
                      )}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      
                      {/* 规则信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs font-medium rounded-md px-2">
                            {parsed.type}
                          </Badge>
                          {parsed.payload && (
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
                              {parsed.payload}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* 箭头 */}
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                      
                      {/* 策略 */}
                      <Badge className={cn(
                        "text-xs font-medium rounded-md px-2.5 py-1 shrink-0",
                        getPolicyColor(parsed.policy)
                      )}>
                        {parsed.policy}
                      </Badge>
                      
                      {/* 删除按钮 */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(index);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* 添加/编辑规则对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? '编辑规则' : '添加规则'}
            </DialogTitle>
            <DialogDescription>
              配置规则类型、匹配内容和目标策略
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 规则类型 */}
            <div className="space-y-2">
              <Label>规则类型</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                        <span className="text-xs text-gray-500">{type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* 匹配内容 */}
            {currentRuleTypeConfig?.hasPayload && (
              <div className="space-y-2">
                <Label>匹配内容</Label>
                <Input
                  placeholder={getPayloadPlaceholder(ruleType)}
                  value={rulePayload}
                  onChange={(e) => setRulePayload(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  {getPayloadHint(ruleType)}
                </p>
              </div>
            )}
            
            {/* 目标策略 */}
            <div className="space-y-2">
              <Label>目标策略</Label>
              <Select value={rulePolicy} onValueChange={setRulePolicy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      DIRECT (直连)
                    </div>
                  </SelectItem>
                  <SelectItem value="REJECT">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      REJECT (拒绝)
                    </div>
                  </SelectItem>
                  <SelectItem value="PROXY">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      PROXY (代理)
                    </div>
                  </SelectItem>
                  {proxyGroups.filter(g => !DEFAULT_POLICIES.includes(g)).map((group) => (
                    <SelectItem key={group} value={group}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                        {group}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* 规则预览 */}
            <div className="space-y-2">
              <Label>规则预览</Label>
              <div className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg font-mono text-sm">
                {buildRule(ruleType, rulePayload, rulePolicy)}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSaveRule}
              disabled={currentRuleTypeConfig?.hasPayload && !rulePayload}
            >
              {editingIndex !== null ? '保存更改' : '添加规则'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 获取匹配内容的占位符
function getPayloadPlaceholder(type: RuleType): string {
  switch (type) {
    case 'DOMAIN':
      return 'example.com';
    case 'DOMAIN-SUFFIX':
      return 'example.com';
    case 'DOMAIN-KEYWORD':
      return 'google';
    case 'GEOIP':
      return 'CN';
    case 'GEOSITE':
      return 'cn';
    case 'IP-CIDR':
      return '192.168.1.0/24';
    case 'IP-CIDR6':
      return '2001:db8::/32';
    case 'SRC-IP-CIDR':
      return '192.168.1.0/24';
    case 'SRC-PORT':
      return '8080';
    case 'DST-PORT':
      return '443';
    case 'PROCESS-NAME':
      return 'chrome';
    case 'PROCESS-PATH':
      return '/Applications/Chrome.app';
    case 'RULE-SET':
      return 'rule-set-name';
    default:
      return '';
  }
}

// 获取匹配内容的提示
function getPayloadHint(type: RuleType): string {
  switch (type) {
    case 'DOMAIN':
      return '精确匹配完整域名';
    case 'DOMAIN-SUFFIX':
      return '匹配域名后缀，如输入 example.com 将匹配 *.example.com';
    case 'DOMAIN-KEYWORD':
      return '匹配域名中包含的关键词';
    case 'GEOIP':
      return '使用国家/地区代码，如 CN（中国）、US（美国）';
    case 'GEOSITE':
      return '使用预定义的域名分类，如 cn、google、netflix';
    case 'IP-CIDR':
      return '使用 CIDR 格式的 IPv4 地址段';
    case 'IP-CIDR6':
      return '使用 CIDR 格式的 IPv6 地址段';
    case 'SRC-IP-CIDR':
      return '匹配源 IP 地址段';
    case 'SRC-PORT':
      return '匹配源端口号';
    case 'DST-PORT':
      return '匹配目标端口号';
    case 'PROCESS-NAME':
      return '匹配发起连接的进程名';
    case 'PROCESS-PATH':
      return '匹配发起连接的进程完整路径';
    case 'RULE-SET':
      return '使用外部规则集文件';
    default:
      return '';
  }
}
