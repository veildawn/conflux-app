import { useEffect, useState, useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  Loader2,
  Globe,
  FileText,
  File,
  CheckCircle2,
  Save,
  ChevronRight,
  ChevronLeft,
  X,
  Search,
  Filter,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import ipc from '@/services/ipc';
import type { ProfileMetadata, ProfileType } from '@/types/config';

// 拖拽忽略选择器，与其它窗口保持一致
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

export default function ProfileEditWindow() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const [loading, setLoading] = useState(!!editId);
  const { toast } = useToast();

  // 窗口状态
  const [activeTab, setActiveTab] = useState<ProfileType>('remote');
  const [submitting, setSubmitting] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<ProfileMetadata | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');

  // Sub-Store 相关状态
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

  // 初始化加载
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

  // 加载 Sub-Store 数据
  const loadSubStoreSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const status = await ipc.getSubStoreStatus();
      setSubstoreStatus(status);

      if (!status.running) {
        return;
      }

      const subs = await ipc.getSubStoreSubs();
      setSubstoreSubs(subs);
    } catch (error) {
      console.error('Failed to load Sub-Store subs:', error);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  // 自动加载 Sub-Store
  useEffect(() => {
    if (urlSource === 'substore' && activeTab === 'remote' && !editId) {
      loadSubStoreSubs();
    }
  }, [urlSource, activeTab, editId, loadSubStoreSubs]);

  // 生成 Sub-Store URL
  useEffect(() => {
    if (urlSource === 'substore' && selectedSub && substoreStatus) {
      const generatedUrl = `${substoreStatus.api_url}/download/${encodeURIComponent(selectedSub)}?target=ClashMeta`;
      setUrl(generatedUrl);
    }
  }, [selectedSub, urlSource, substoreStatus]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        title: '选择配置文件',
        multiple: false,
        filters: [
          {
            name: '配置文件',
            extensions: ['yaml', 'yml', 'json', 'conf'],
          },
        ],
      });

      if (selected) {
        setFilePath(selected as string);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editId && originalProfile) {
        // 编辑模式：目前只支持重命名
        const newName = name || originalProfile.name;
        if (newName !== originalProfile.name) {
          await ipc.renameProfile(editId, newName);
          toast({ title: '保存成功', description: '配置已更新' });
        }
      } else {
        // 新增模式
        let profile: ProfileMetadata;
        const profileName =
          name ||
          (activeTab === 'remote'
            ? '新远程订阅'
            : activeTab === 'local'
              ? '新本地配置'
              : '新空白配置');

        if (activeTab === 'remote') {
          profile = await ipc.createRemoteProfile(profileName, url);
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
    if (!target || target.closest(dragIgnoreSelector)) return;
    void getCurrentWindow().startDragging().catch(console.warn);
  };

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  const canSave = () => {
    if (editId) return !!name;
    if (activeTab === 'remote') return !!url;
    if (activeTab === 'local') return !!filePath;
    return true;
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
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/8 bg-[radial-gradient(circle_at_10%_20%,rgba(200,255,200,0.4)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(180,220,255,0.6)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f8f8fb_0%,#eef0f7_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      {/* Background Blobs */}
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div className="absolute left-0 top-32 h-64 w-64 rounded-full bg-emerald-100/30 blur-3xl" />
        <div className="absolute right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-blue-100/30 blur-3xl" />
      </div>

      <div className="relative h-full w-full flex flex-col p-8">
        {/* Header */}
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {editId ? '编辑配置' : '添加配置'}
          </h1>
          <p className="text-sm text-neutral-500">
            {editId ? '修改配置基本信息' : '选择配置来源：远程订阅、本地文件或空白配置'}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-1 -mx-1">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ProfileType)}
            className="w-full"
          >
            {!editId && (
              <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/40 border border-white/60 rounded-2xl p-1 h-12 shadow-sm">
                <TabsTrigger
                  value="remote"
                  className="rounded-2xl gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all data-[state=active]:border data-[state=active]:border-transparent bg-transparent border-transparent hover:bg-white/20"
                >
                  <Globe className="w-4 h-4" />
                  远程订阅
                </TabsTrigger>
                <TabsTrigger
                  value="local"
                  className="rounded-2xl gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 transition-all data-[state=active]:border data-[state=active]:border-transparent bg-transparent border-transparent hover:bg-white/20"
                >
                  <FileText className="w-4 h-4" />
                  本地文件
                </TabsTrigger>
                <TabsTrigger
                  value="blank"
                  className="rounded-2xl gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-600 transition-all data-[state=active]:border data-[state=active]:border-transparent bg-transparent border-transparent hover:bg-white/20"
                >
                  <File className="w-4 h-4" />
                  空白配置
                </TabsTrigger>
              </TabsList>
            )}

            <div className="space-y-6 bg-white/40 border border-white/60 rounded-2xl p-6 backdrop-blur-sm shadow-sm">
              <div className="space-y-3">
                <Label
                  htmlFor="name"
                  className="text-xs font-bold uppercase tracking-widest text-neutral-500"
                >
                  名称 {!editId && '(可选)'}
                </Label>
                <Input
                  id="name"
                  placeholder="例如：公司策略"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-xl bg-white/60 border-white/80 shadow-inner focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              {!editId && (
                <>
                  <TabsContent value="remote" className="space-y-6 mt-0">
                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                        订阅来源
                      </Label>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                              urlSource === 'manual'
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-gray-400 bg-transparent group-hover:border-blue-400'
                            )}
                          >
                            {urlSource === 'manual' && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </div>
                          <input
                            type="radio"
                            name="urlSource"
                            value="manual"
                            checked={urlSource === 'manual'}
                            onChange={(e) => setUrlSource(e.target.value as 'manual' | 'substore')}
                            className="hidden"
                          />
                          <span className="text-sm font-medium text-neutral-700">直接输入 URL</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                              urlSource === 'substore'
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-gray-400 bg-transparent group-hover:border-blue-400'
                            )}
                          >
                            {urlSource === 'substore' && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </div>
                          <input
                            type="radio"
                            name="urlSource"
                            value="substore"
                            checked={urlSource === 'substore'}
                            onChange={(e) => setUrlSource(e.target.value as 'manual' | 'substore')}
                            className="hidden"
                          />
                          <span className="text-sm font-medium text-neutral-700">
                            从 Sub-Store 选择
                          </span>
                        </label>
                      </div>
                    </div>

                    {urlSource === 'manual' ? (
                      <div className="space-y-3">
                        <Label
                          htmlFor="url"
                          className="text-xs font-bold uppercase tracking-widest text-neutral-500"
                        >
                          订阅链接
                        </Label>
                        <Input
                          id="url"
                          placeholder="https://example.com/subscribe/..."
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          className="h-11 rounded-xl bg-white/60 border-white/80 shadow-inner font-mono text-sm"
                        />
                        <p className="text-xs text-neutral-500">支持 MiHomo/Clash 格式的订阅链接</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {loadingSubs ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                          </div>
                        ) : substoreSubs.length === 0 ? (
                          <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl">
                            <p className="text-sm text-amber-800">
                              未找到 Sub-Store 订阅。请先在 Sub-Store 页面添加订阅。
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Label className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                              选择订阅
                            </Label>
                            <div className="grid gap-2 max-h-[200px] overflow-y-auto p-1 custom-scrollbar">
                              {substoreSubs.map((sub) => (
                                <label
                                  key={sub.name}
                                  className={cn(
                                    'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer',
                                    selectedSub === sub.name
                                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                      : 'border-transparent bg-white/40 hover:bg-white/60'
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name="sub"
                                    value={sub.name}
                                    checked={selectedSub === sub.name}
                                    onChange={(e) => setSelectedSub(e.target.value)}
                                    className="hidden"
                                  />
                                  <div
                                    className={cn(
                                      'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                                      selectedSub === sub.name
                                        ? 'border-blue-500 bg-blue-500'
                                        : 'border-gray-300'
                                    )}
                                  >
                                    {selectedSub === sub.name && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-neutral-900 truncate">
                                      {sub.displayName || sub.name}
                                    </div>
                                    <div className="text-xs text-neutral-500 font-mono truncate">
                                      {sub.name}
                                    </div>
                                  </div>
                                </label>
                              ))}
                            </div>
                            {selectedSub && url && (
                              <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                  生成的订阅链接
                                </Label>
                                <div className="p-3 bg-neutral-100/50 rounded-xl border border-neutral-200/50">
                                  <p className="text-xs font-mono text-neutral-600 break-all">
                                    {url}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="local" className="space-y-6 mt-0">
                    <div className="space-y-3">
                      <Label
                        htmlFor="filepath"
                        className="text-xs font-bold uppercase tracking-widest text-neutral-500"
                      >
                        文件路径
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="filepath"
                          placeholder="/path/to/config.yaml"
                          value={filePath}
                          onChange={(e) => setFilePath(e.target.value)}
                          className="h-11 rounded-xl bg-white/60 border-white/80 shadow-inner font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          className="shrink-0 h-11 px-4 rounded-xl border-white/60 bg-white/40 hover:bg-white/60"
                          onClick={handleBrowse}
                        >
                          浏览...
                        </Button>
                      </div>
                      <p className="text-xs text-neutral-500">
                        导入后配置内容将独立保存，不会同步源文件的修改
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="blank" className="space-y-6 mt-0">
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100/60 rounded-xl flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-emerald-800 leading-relaxed">
                        创建一个空白配置，您可以之后在策略页面手动添加策略，或在规则页面添加规则。适合需要从零开始构建个性化配置的高级用户。
                      </p>
                    </div>
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-6 flex items-center justify-end gap-3 border-t border-black/5">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="h-10 px-6 rounded-full hover:bg-black/5"
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSave() || submitting}
            className="h-10 px-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {editId ? '保存修改' : '确认添加'}
          </Button>
        </div>
      </div>
    </div>
  );
}
