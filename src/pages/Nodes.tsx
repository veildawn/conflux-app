import { useEffect, useState } from 'react';
import { Server, Zap, Check, RefreshCw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProxyStore } from '@/stores/proxyStore';
import { useToast } from '@/hooks/useToast';
import { formatDelay, getDelayColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';

export default function Nodes() {
  const { status, groups, fetchGroups, selectProxy, testDelay, loading } = useProxyStore(
    useShallow((state) => ({
      status: state.status,
      groups: state.groups,
      fetchGroups: state.fetchGroups,
      selectProxy: state.selectProxy,
      testDelay: state.testDelay,
      loading: state.loading,
    }))
  );
  const { toast } = useToast();
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});

  useEffect(() => {
    if (status.running) {
      fetchGroups();
    }
  }, [status.running, fetchGroups]);

  const handleSelectProxy = async (group: string, name: string) => {
    try {
      await selectProxy(group, name);
      toast({
        title: '节点已切换',
        description: `已选择: ${name}`,
      });
    } catch (error) {
      toast({
        title: '切换失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleTestDelay = async (name: string) => {
    setTestingNodes((prev) => new Set(prev).add(name));
    try {
      const delay = await testDelay(name);
      setDelays((prev) => ({ ...prev, [name]: delay }));
    } catch (error) {
      setDelays((prev) => ({ ...prev, [name]: -1 }));
    } finally {
      setTestingNodes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });
    }
  };

  const handleTestAllDelays = async (groupNodes: string[]) => {
    for (const node of groupNodes) {
      if (!['DIRECT', 'REJECT'].includes(node)) {
        handleTestDelay(node);
      }
    }
  };

  if (!status.running) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Server className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg">请先启动代理服务</p>
        <p className="text-sm">启动后可查看和管理节点</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Server className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg">暂无代理组</p>
        <p className="text-sm">请检查配置文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.name}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              {group.name}
              <Badge variant="secondary" className="ml-2">
                {group.type}
              </Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestAllDelays(group.all)}
              disabled={loading}
            >
              <Zap className="w-4 h-4 mr-1" />
              测速全部
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.all.map((nodeName) => {
                const isSelected = group.now === nodeName;
                const isTesting = testingNodes.has(nodeName);
                const delay = delays[nodeName];
                const isSpecial = ['DIRECT', 'REJECT'].includes(nodeName);

                return (
                  <button
                    key={nodeName}
                    onClick={() => handleSelectProxy(group.name, nodeName)}
                    className={cn(
                      'relative p-3 rounded-lg border text-left transition-all',
                      'hover:border-primary/50 hover:bg-accent/50',
                      isSelected && 'border-primary bg-primary/5'
                    )}
                  >
                    {/* 选中标识 */}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 text-primary" />
                      </div>
                    )}

                    {/* 节点名称 */}
                    <div className="font-medium truncate pr-6">{nodeName}</div>

                    {/* 延迟信息 */}
                    <div className="flex items-center justify-between mt-2">
                      {isSpecial ? (
                        <span className="text-xs text-muted-foreground">
                          内置节点
                        </span>
                      ) : isTesting ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          测试中...
                        </span>
                      ) : delay !== undefined ? (
                        <span
                          className={cn('text-xs font-medium', getDelayColorClass(delay))}
                        >
                          {formatDelay(delay)}
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestDelay(nodeName);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          点击测速
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}




