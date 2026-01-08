import { useEffect, useState, useCallback, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Loader2,
  Globe,
  FileText,
  File,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save,
  LayoutGrid,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import ipc from '@/services/ipc';
import type { ProfileMetadata, ProfileType } from '@/types/config';

// 拖拽忽略选择器
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

const STEP_METADATA = {
  type: { title: '选择类型', description: '选择配置文件的来源方式' },
  config: { title: '配置详情', description: '填写订阅链接或文件路径' },
};

export default function SubscriptionEditWindow() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const [loading, setLoading] = useState(!!editId);
  const { toast } = useToast();

  // Navigation State
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  // Form State
  const [activeTab, setActiveTab] = useState<ProfileType>('remote');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<ProfileMetadata | null>(null);

  // Sub-Store State
  const [urlSource, setUrlSource] = useState<'manual' | 'substore'>('manual');
  const [substoreSubs, setSubstoreSubs] = useState<
    { name: string; displayName?: string; icon?: string; url?: string }[]
  >([]);
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [substoreStatus, setSubstoreStatus] = useState<{
    running: boolean;
    api_url: string;
  } | null>(null);

  // Initialization
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!editId) {
        setLoading(false);
        return;
      }

      try {
        const profiles = await ipc.listProfiles();
        const profile = profiles.find((p) => p.id === editId);

        if (profile) {
          setOriginalProfile(profile);
          setName(profile.name);
          setActiveTab(profile.profileType);
          setStep('config'); // Skip type selection for editing

          if (profile.profileType === 'remote') {
            setUrl(profile.url || '');
          }
        } else {
          toast({ title: '错误', description: '未找到该配置', variant: 'destructive' });
        }
      } catch (err) {
        console.error(err);
        toast({ title: '加载失败', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [editId, toast]);

  // Load Sub-Store Data
  const loadSubStoreSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const status = await ipc.getSubStoreStatus();
      setSubstoreStatus(status);

      if (!status.running) return;

      const subs = await ipc.getSubStoreSubs();
      setSubstoreSubs(subs);
    } catch (error) {
      console.error('Failed to load Sub-Store subs:', error);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    if (urlSource === 'substore' && activeTab === 'remote' && !editId) {
      loadSubStoreSubs();
    }
  }, [urlSource, activeTab, editId, loadSubStoreSubs]);

  useEffect(() => {
    if (urlSource === 'substore' && selectedSub && substoreStatus) {
      const generatedUrl = `${substoreStatus.api_url}/api/download/${encodeURIComponent(selectedSub)}?target=ClashMeta`;
      setUrl(generatedUrl);
    }
  }, [selectedSub, urlSource, substoreStatus]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        title: '选择配置文件',
        multiple: false,
        filters: [{ name: '配置文件', extensions: ['yaml', 'yml', 'json', 'conf'] }],
      });
      if (selected) setFilePath(selected as string);
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      if (editId && originalProfile) {
        const newName = name || originalProfile.name;
        if (newName !== originalProfile.name) {
          await ipc.renameProfile(editId, newName);
          toast({ title: '保存成功', description: '配置已更新' });
        }
      } else {
        let profile: ProfileMetadata;
        const profileName =
          name ||
          (activeTab === 'remote'
            ? '新远程订阅'
            : activeTab === 'local'
              ? '新本地配置'
              : '新空白配置');

        if (activeTab === 'remote') {
          // Sub-Store 模式下直接生成 URL，避免状态更新延迟问题
          let finalUrl = url;
          if (urlSource === 'substore') {
            if (!selectedSub) {
              throw new Error('请选择一个 Sub-Store 订阅');
            }
            // 如果 URL 为空（可能是状态同步问题），尝试重新生成
            if (!finalUrl && substoreStatus?.api_url) {
              finalUrl = `${substoreStatus.api_url}/api/download/${encodeURIComponent(selectedSub)}?target=ClashMeta`;
            }
          }

          if (!finalUrl) {
            throw new Error('订阅链接不能为空');
          }

          profile = await ipc.createRemoteProfile(profileName, finalUrl);
        } else if (activeTab === 'local') {
          profile = await ipc.createLocalProfile(profileName, filePath);
        } else {
          profile = await ipc.createBlankProfile(profileName);
        }
        toast({ title: '创建成功', description: `配置 "${profile.name}" 已添加` });
      }

      await emit('profiles-changed');
      await getCurrentWindow().close();
    } catch (err) {
      console.error(err);
      toast({ title: '保存失败', description: String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // 检查是否点击了可交互元素或其子元素
    if (target.closest(dragIgnoreSelector)) return;
    // 额外检查：确保不是点击在 SVG 图标上（可能是按钮内的图标）
    if (target.tagName === 'svg' || target.tagName === 'path' || target.closest('svg')) return;
    void getCurrentWindow().startDragging().catch(console.warn);
  };

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  const canSave = useMemo(() => {
    if (editId) return !!name;
    // 远程订阅：只要有 URL 就可以保存（无论是手动输入还是 Sub-Store 生成）
    if (activeTab === 'remote') {
      if (urlSource === 'substore') return !!selectedSub;
      return !!url;
    }
    if (activeTab === 'local') return !!filePath;
    return true;
  }, [editId, name, activeTab, url, filePath, urlSource, selectedSub]);

  const nextStep = () => {
    setDirection('forward');
    setStep('config');
  };

  const prevStep = () => {
    setDirection('backward');
    setStep('type');
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white/20 backdrop-blur-xl">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/5 bg-[radial-gradient(circle_at_10%_20%,rgba(230,240,255,0.7)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(240,230,255,0.7)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f8fafc_0%,#f1f5f9_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      {/* Background Blobs */}
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[50%] w-[50%] rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="relative h-full w-full grid grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <div className="flex flex-col bg-white/40 px-6 pt-10 pb-6 border-r border-black/5 backdrop-blur-3xl">
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                'relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all cursor-pointer',
                step === 'type'
                  ? 'bg-white/80 text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:bg-white/40'
              )}
              onClick={() => !editId && setStep('type')}
            >
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                  step === 'type'
                    ? 'bg-blue-600 text-white border-transparent'
                    : step === 'config'
                      ? 'bg-emerald-500 text-white border-transparent'
                      : 'border-black/10 text-neutral-400'
                )}
              >
                {step === 'config' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <span className="text-[10px]">1</span>
                )}
              </div>
              <span>选择类型</span>
              {step === 'type' && (
                <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-500 shadow-sm" />
              )}
            </div>

            <div
              className={cn(
                'relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all',
                step === 'config' ? 'bg-white/80 text-neutral-900 shadow-sm' : 'text-neutral-500'
              )}
            >
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                  step === 'config'
                    ? 'bg-blue-600 text-white border-transparent'
                    : 'border-black/10 text-neutral-400'
                )}
              >
                <span className="text-[10px]">2</span>
              </div>
              <span>配置详情</span>
              {step === 'config' && (
                <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-500 shadow-sm" />
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex flex-col overflow-hidden bg-white/20 backdrop-blur-2xl">
          {/* Header */}
          <div className="px-10 pt-10 pb-6 shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-white">
                {step === 'type' ? (
                  <LayoutGrid className="h-5 w-5 text-blue-600" />
                ) : (
                  <FileText className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {STEP_METADATA[step].title}
                </h1>
                <p className="text-sm text-neutral-500">{STEP_METADATA[step].description}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-10 pb-32 custom-scrollbar">
            <div
              className={cn(
                'transition-all duration-500 ease-out',
                direction === 'forward'
                  ? 'animate-in fade-in slide-in-from-right-8'
                  : 'animate-in fade-in slide-in-from-left-8'
              )}
            >
              {step === 'type' && (
                <div className="grid grid-cols-1 gap-4">
                  <div
                    className={cn(
                      'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
                      activeTab === 'remote'
                        ? 'bg-white/80 border-blue-500 shadow-md'
                        : 'bg-white/40 border-transparent hover:bg-white/60'
                    )}
                    onClick={() => {
                      setActiveTab('remote');
                      nextStep();
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-colors',
                          activeTab === 'remote'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-blue-600'
                        )}
                      >
                        <Globe className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-neutral-900">远程订阅</h3>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          从 URL 或 Sub-Store 导入配置
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-neutral-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>

                  <div
                    className={cn(
                      'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
                      activeTab === 'local'
                        ? 'bg-white/80 border-orange-500 shadow-md'
                        : 'bg-white/40 border-transparent hover:bg-white/60'
                    )}
                    onClick={() => {
                      setActiveTab('local');
                      nextStep();
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-colors',
                          activeTab === 'local'
                            ? 'bg-orange-500 text-white'
                            : 'bg-white text-orange-500'
                        )}
                      >
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-neutral-900">本地文件</h3>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          从本地文件系统导入配置文件
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-neutral-300 group-hover:text-orange-500 transition-colors" />
                    </div>
                  </div>

                  <div
                    className={cn(
                      'group relative rounded-3xl border p-5 transition-all cursor-pointer overflow-hidden',
                      activeTab === 'blank'
                        ? 'bg-white/80 border-emerald-500 shadow-md'
                        : 'bg-white/40 border-transparent hover:bg-white/60'
                    )}
                    onClick={() => {
                      setActiveTab('blank');
                      nextStep();
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-colors',
                          activeTab === 'blank'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white text-emerald-500'
                        )}
                      >
                        <File className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-neutral-900">空白配置</h3>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          创建一个空的配置，稍后手动添加
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-neutral-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </div>
                </div>
              )}

              {step === 'config' && (
                <div className="space-y-6">
                  {/* Common Name Input */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="name"
                      className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1"
                    >
                      名称
                    </Label>
                    <Input
                      id="name"
                      placeholder="例如：My Profile"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                      autoFocus
                    />
                  </div>

                  {/* Remote Configuration */}
                  {activeTab === 'remote' && (
                    <div className="space-y-6">
                      <div className="bg-white/40 border border-white/60 rounded-2xl flex p-1.5 gap-1">
                        <button
                          onClick={() => setUrlSource('manual')}
                          className={cn(
                            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all',
                            urlSource === 'manual'
                              ? 'bg-white shadow-sm text-blue-600'
                              : 'text-neutral-500 hover:bg-white/50'
                          )}
                        >
                          手动输入链接
                        </button>
                        <button
                          onClick={() => setUrlSource('substore')}
                          className={cn(
                            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all',
                            urlSource === 'substore'
                              ? 'bg-white shadow-sm text-blue-600'
                              : 'text-neutral-500 hover:bg-white/50'
                          )}
                        >
                          Sub-Store 导入
                        </button>
                      </div>

                      {urlSource === 'manual' ? (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-4">
                          <Label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                            订阅链接
                          </Label>
                          <Input
                            placeholder="https://example.com/subscribe/..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner font-mono text-sm"
                          />
                        </div>
                      ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                          {loadingSubs ? (
                            <div className="flex flex-col items-center justify-center py-12 rounded-3xl border border-dashed border-neutral-200 bg-white/30">
                              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                              <span className="text-sm text-neutral-500">
                                正在加载 Sub-Store 数据...
                              </span>
                            </div>
                          ) : substoreSubs.length === 0 ? (
                            <div className="p-6 bg-amber-50/50 border border-amber-200/50 rounded-3xl flex gap-3 items-start">
                              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                              <div>
                                <h4 className="font-bold text-amber-900 text-sm">未发现订阅</h4>
                                <p className="text-xs text-amber-700 mt-1">
                                  请确保 Sub-Store 正在运行且已添加订阅。
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3 max-h-[240px] overflow-y-auto p-1 custom-scrollbar">
                                {substoreSubs.map((sub) => (
                                  <div
                                    key={sub.name}
                                    onClick={() => {
                                      setSelectedSub(sub.name);
                                      if (!name) {
                                        setName(sub.displayName || sub.name);
                                      }
                                    }}
                                    className={cn(
                                      'p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3',
                                      selectedSub === sub.name
                                        ? 'bg-blue-50 border-blue-200 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]'
                                        : 'bg-white/40 border-transparent hover:bg-white/60 hover:shadow-sm'
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                                        selectedSub === sub.name
                                          ? 'border-blue-600 bg-blue-600'
                                          : 'border-neutral-300'
                                      )}
                                    >
                                      {selectedSub === sub.name && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-sm truncate text-neutral-900">
                                        {sub.displayName || sub.name}
                                      </div>
                                      <div className="text-[10px] text-neutral-500 truncate">
                                        {sub.name}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local Configuration */}
                  {activeTab === 'local' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                        文件路径
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="/path/to/config.yaml"
                          value={filePath}
                          onChange={(e) => setFilePath(e.target.value)}
                          className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner font-mono text-sm"
                        />
                        <Button
                          onClick={handleBrowse}
                          variant="secondary"
                          className="h-12 px-6 rounded-2xl border border-white/60 bg-white/40 hover:bg-white/60"
                        >
                          浏览
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Blank Configuration */}
                  {activeTab === 'blank' && (
                    <div className="p-6 bg-emerald-50/50 border border-emerald-100/50 rounded-3xl flex gap-4 items-center">
                      <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-emerald-900 text-sm">已准备就绪</h4>
                        <p className="text-xs text-emerald-700 mt-1">
                          创建后您可以手动添加策略组和规则。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="absolute bottom-6 left-10 right-10 z-50" data-no-drag>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="h-12 px-6 rounded-full bg-white/40 text-neutral-700 border border-white/60 hover:bg-white/70"
              >
                取消
              </Button>

              <div className="flex gap-3">
                {step === 'config' && !editId && (
                  <Button
                    variant="ghost"
                    onClick={prevStep}
                    className="h-12 px-6 rounded-2xl bg-white/40 hover:bg-white/60 border border-transparent hover:border-white/60 gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一步
                  </Button>
                )}

                {step === 'type' ? null : ( // Step 1: No "Next" button needed, clicking card advances
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSave || submitting}
                    className={cn(
                      'h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 gap-2 font-semibold transition-all',
                      submitting && 'opacity-80'
                    )}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {editId ? '保存修改' : '确认添加'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
