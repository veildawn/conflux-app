import { useEffect, useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  Activity,
  Settings2,
  ClipboardList,
  Cog,
  Wrench,
  Pencil,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import type { ProxyConfig } from '@/types/config';
import ipc from '@/services/ipc';

import type { ProxyFormData } from './types';
import {
  PROXY_TYPE_OPTIONS,
  CIPHER_OPTIONS,
  VMESS_CIPHER_OPTIONS,
  NETWORK_OPTIONS,
  PROTOCOL_FIELDS,
} from './constants';

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

const isValidPort = (port: string | number): boolean => {
  const portNum = Number(port);
  return Number.isInteger(portNum) && portNum > 0 && portNum <= 65535;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateField = (fieldName: string, value: any): string => {
  if (fieldName === 'name' && !value.trim()) return '请输入名称';
  if (fieldName === 'type' && !value) return '请选择协议类型';
  if (fieldName === 'server' && !value.trim()) return '请输入服务器地址';
  if (fieldName === 'port' && !isValidPort(value)) return '端口号无效';
  return '';
};

const STEP_METADATA = {
  1: { title: '基础信息', description: '填写服务器的基本信息', icon: ClipboardList },
  2: { title: '协议配置', description: '配置所选协议的详细参数', icon: Cog },
  3: { title: '高级设置', description: '配置传输层及其它高级选项', icon: Wrench },
};

export default function ProxyServerEditWindow() {
  const [searchParams] = useSearchParams();
  const editName = searchParams.get('name');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [formData, setFormData] = useState<ProxyFormData>({
    name: '',
    type: '',
    server: '',
    port: '',
    udp: false,
    tls: false,
    skipCertVerify: false,
    cipher: '',
    password: '',
    uuid: '',
    alterId: '',
    network: '',
    sni: '',
    wsPath: '',
    wsHeaders: '',
    grpcServiceName: '',
    h2Host: '',
    h2Path: '',
    httpHost: '',
    httpPath: '',
    httpHeaders: '',
    hysteriaUpMbps: '',
    hysteriaDownMbps: '',
    hysteriaObfs: '',
    tuicToken: '',
    tuicCongestionController: '',
    tuicUdpRelayMode: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Helper functions from ProxyServerDialog

  const getProxyOption = (proxy: ProxyConfig | null | undefined, key: string) => {
    const value = proxy?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  };

  const getOptionString = (value: unknown) => (typeof value === 'string' ? value : '');

  const getFirstString = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    return '';
  };

  // Initial Data Fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!editName) {
        setLoading(false);
        return;
      }

      try {
        const profileId = await ipc.getActiveProfileId();
        if (!profileId) {
          toast({ title: '错误', description: '未找到活跃配置', variant: 'destructive' });
          setLoading(false);
          return;
        }

        const [, config] = await ipc.getProfile(profileId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const server = config.proxies?.find((p) => p.name === editName) as any;

        if (server) {
          const wsOpts = getProxyOption(server, 'ws-opts');
          const grpcOpts = getProxyOption(server, 'grpc-opts');
          const h2Opts = getProxyOption(server, 'h2-opts');
          const httpOpts = getProxyOption(server, 'http-opts');
          const wsHeadersValue = wsOpts?.headers;
          const httpHeadersValue = httpOpts?.headers;

          setFormData({
            name: server.name || '',
            type: server.type || '',
            server: server.server || '',
            port: server.port ? String(server.port) : '',
            udp: Boolean(server.udp),
            tls: Boolean(server.tls),
            skipCertVerify: Boolean(server['skip-cert-verify']),
            cipher: server.cipher || (server.type === 'vmess' ? 'auto' : ''),
            password: server.password || '',
            uuid: server.uuid || '',
            alterId: server.alterId !== undefined ? String(server.alterId) : '',
            network: server.network || '',
            sni: server.sni || '',
            wsPath: getOptionString(wsOpts?.path),
            wsHeaders: wsHeadersValue ? JSON.stringify(wsHeadersValue) : '',
            grpcServiceName: getOptionString(grpcOpts?.['grpc-service-name']),
            h2Host: getFirstString(h2Opts?.host),
            h2Path: getOptionString(h2Opts?.path),
            httpHost: getFirstString(httpOpts?.host),
            httpPath: getFirstString(httpOpts?.path),
            httpHeaders: httpHeadersValue ? JSON.stringify(httpHeadersValue) : '',
            hysteriaUpMbps: server.up || '',
            hysteriaDownMbps: server.down || '',
            hysteriaObfs: server.obfs || '',
            tuicToken: server.token || '',
            tuicCongestionController: server['congestion-controller'] || '',
            tuicUdpRelayMode: server['udp-relay-mode'] || '',
          });
        } else {
          toast({ title: '错误', description: '未找到该服务器', variant: 'destructive' });
        }
      } catch (err) {
        console.error(err);
        toast({ title: '加载失败', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [editName, toast]);

  const currentMeta = STEP_METADATA[currentStep as keyof typeof STEP_METADATA];

  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      const errors: Record<string, string> = {};
      ['name', 'type', 'server', 'port'].forEach((field) => {
        const err = validateField(field, formData[field as keyof ProxyFormData]);
        if (err) errors[field] = err;
      });
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        toast({ title: '验证失败', description: '请检查基本信息', variant: 'destructive' });
        return;
      }
    }
    setFieldErrors({});
    if (currentStep < 3) {
      setDirection('forward');
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, formData, toast]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setDirection('backward');
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      if (!profileId) throw new Error('未找到活跃配置');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proxy: any = {
        name: formData.name.trim(),
        type: formData.type.trim(),
        server: formData.server.trim(),
        port: Number(formData.port),
        udp: formData.udp,
      };

      if (formData.cipher) proxy.cipher = formData.cipher;
      if (formData.password) proxy.password = formData.password;
      if (formData.uuid) proxy.uuid = formData.uuid;
      if (formData.alterId) proxy.alterId = Number(formData.alterId);
      if (formData.network) proxy.network = formData.network;
      if (formData.tls) proxy.tls = true;
      if (formData.skipCertVerify) proxy['skip-cert-verify'] = true;
      if (formData.sni) proxy.sni = formData.sni;

      // Transport opts
      if (formData.network === 'ws') {
        const wsOpts: Record<string, unknown> = {};
        if (formData.wsPath) wsOpts.path = formData.wsPath;
        if (formData.wsHeaders) wsOpts.headers = JSON.parse(formData.wsHeaders);
        if (Object.keys(wsOpts).length > 0) proxy['ws-opts'] = wsOpts;
      }
      if (formData.network === 'grpc' && formData.grpcServiceName) {
        proxy['grpc-opts'] = { 'grpc-service-name': formData.grpcServiceName };
      }
      if (formData.network === 'h2') {
        const h2Opts: Record<string, unknown> = {};
        if (formData.h2Host) h2Opts.host = [formData.h2Host];
        if (formData.h2Path) h2Opts.path = formData.h2Path;
        if (Object.keys(h2Opts).length > 0) proxy['h2-opts'] = h2Opts;
      }
      if (formData.network === 'http') {
        const httpOpts: Record<string, unknown> = {};
        if (formData.httpHost) httpOpts.host = [formData.httpHost];
        if (formData.httpPath) httpOpts.path = [formData.httpPath];
        if (formData.httpHeaders) httpOpts.headers = JSON.parse(formData.httpHeaders);
        if (Object.keys(httpOpts).length > 0) proxy['http-opts'] = httpOpts;
      }

      // Hysteria
      if (proxy.type === 'hysteria' || proxy.type === 'hysteria2') {
        if (formData.hysteriaUpMbps) proxy.up = formData.hysteriaUpMbps;
        if (formData.hysteriaDownMbps) proxy.down = formData.hysteriaDownMbps;
        if (formData.hysteriaObfs) proxy.obfs = formData.hysteriaObfs;
      }

      // TUIC
      if (proxy.type === 'tuic') {
        if (formData.tuicToken) proxy.token = formData.tuicToken;
        if (formData.tuicCongestionController)
          proxy['congestion-controller'] = formData.tuicCongestionController;
        if (formData.tuicUdpRelayMode) proxy['udp-relay-mode'] = formData.tuicUdpRelayMode;
      }

      if (editName) {
        await ipc.updateProxy(profileId, editName, proxy);
      } else {
        await ipc.addProxy(profileId, proxy);
      }

      await emit('proxy-servers-changed');
      await getCurrentWindow().close();
    } catch (err) {
      console.error(err);
      toast({ title: '保存失败', description: String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editName, toast]);

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

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  const shouldShowField = (protocol: string, fieldName: string): boolean => {
    if (!protocol) return false;
    const config = PROTOCOL_FIELDS[protocol] || { required: [], optional: [] };
    return config.required.includes(fieldName) || config.optional.includes(fieldName);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white/20 backdrop-blur-xl">
        <Activity className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/8 bg-[radial-gradient(circle_at_10%_20%,rgba(200,255,200,0.4)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(180,220,255,0.6)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f8f8fb_0%,#eef0f7_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div className="absolute left-0 top-32 h-64 w-64 rounded-full bg-emerald-100/30 blur-3xl" />
        <div className="absolute right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-blue-100/30 blur-3xl" />
      </div>

      <div className="relative h-full w-full grid grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <div className="flex flex-col bg-white/40 px-6 pt-10 pb-6 border-r border-black/5 backdrop-blur-3xl">
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((s) => {
              const meta = STEP_METADATA[s as keyof typeof STEP_METADATA];
              const isActive = currentStep === s;
              const isCompleted = currentStep > s;
              return (
                <div
                  key={s}
                  onClick={() => s <= Math.max(currentStep, editName ? 3 : 1) && setCurrentStep(s)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all cursor-pointer',
                    isActive
                      ? 'bg-white/80 text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:bg-white/40'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white border-transparent'
                        : isCompleted
                          ? 'bg-emerald-500 text-white border-transparent'
                          : 'border-black/10 text-neutral-400'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <span className="text-[10px]">{s}</span>
                    )}
                  </div>
                  <span>{meta.title}</span>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-500 shadow-[0_0_8px_rgba(0,122,255,0.7)]" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-auto pt-6 border-t border-black/5">
            <div className="flex items-center gap-3 px-4 py-3 bg-white/40 rounded-2xl border border-white/60">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Pencil className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  当前模式
                </div>
                <div className="text-xs font-bold text-neutral-700">
                  {editName ? '正在编辑' : '手动添加'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex flex-col overflow-hidden bg-white/20 backdrop-blur-2xl">
          {/* Header */}
          <div className="px-10 pt-10 pb-6 shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-white">
                <currentMeta.icon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {currentMeta.title}
                </h1>
                <p className="text-sm text-neutral-500">{currentMeta.description}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-10 pb-32">
            <div
              className={cn(
                'transition-all duration-500 ease-out',
                direction === 'forward'
                  ? 'animate-in fade-in slide-in-from-right-8'
                  : 'animate-in fade-in slide-in-from-left-8'
              )}
            >
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2 space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                        服务器名称
                      </label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="例如: US-Proxy-01"
                        className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                      />
                      {fieldErrors.name && (
                        <p className="text-[10px] text-red-500 font-semibold ml-1">
                          {fieldErrors.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                        协议类型
                      </label>
                      <Select
                        value={formData.type}
                        onValueChange={(v) => {
                          const defaults = PROTOCOL_FIELDS[v]?.defaults || {};
                          setFormData((prev) => ({ ...prev, type: v, ...defaults }));
                        }}
                      >
                        <SelectTrigger className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner">
                          <SelectValue placeholder="选择协议" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROXY_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                        端口
                      </label>
                      <Input
                        value={formData.port}
                        onChange={(e) => setFormData((prev) => ({ ...prev, port: e.target.value }))}
                        placeholder="443"
                        className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner"
                      />
                      {fieldErrors.port && (
                        <p className="text-[10px] text-red-500 font-semibold ml-1">
                          {fieldErrors.port}
                        </p>
                      )}
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">
                        服务器地址
                      </label>
                      <Input
                        value={formData.server}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, server: e.target.value }))
                        }
                        placeholder="example.com 或 IP 地址"
                        className="h-12 rounded-2xl bg-white/60 border-white/80 shadow-inner"
                      />
                      {fieldErrors.server && (
                        <p className="text-[10px] text-red-500 font-semibold ml-1">
                          {fieldErrors.server}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-white/60 bg-white/40 p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      {shouldShowField(formData.type, 'cipher') && (
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                            加密方式 (Cipher)
                          </label>
                          <Select
                            value={formData.cipher}
                            onValueChange={(v) => setFormData((prev) => ({ ...prev, cipher: v }))}
                          >
                            <SelectTrigger className="h-11 rounded-xl bg-white/80 border-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(formData.type === 'vmess'
                                ? VMESS_CIPHER_OPTIONS
                                : CIPHER_OPTIONS
                              ).map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {shouldShowField(formData.type, 'password') && (
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                            密码 (Password)
                          </label>
                          <Input
                            value={formData.password}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, password: e.target.value }))
                            }
                            type="password"
                            className="h-11 rounded-xl bg-white/80 border-white"
                          />
                        </div>
                      )}
                      {shouldShowField(formData.type, 'uuid') && (
                        <div className="col-span-2 space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                            UUID
                          </label>
                          <Input
                            value={formData.uuid}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, uuid: e.target.value }))
                            }
                            className="h-11 rounded-xl bg-white/80 border-white font-mono text-xs"
                          />
                        </div>
                      )}
                      {shouldShowField(formData.type, 'alterId') && (
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                            Alter ID
                          </label>
                          <Input
                            value={formData.alterId}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, alterId: e.target.value }))
                            }
                            className="h-11 rounded-xl bg-white/80 border-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-white/60 bg-white/40 p-6 space-y-4">
                        <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                          <Zap className="w-3 h-3 text-emerald-500" />
                          传输层配置 (Transport)
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-500">
                              网络协议
                            </label>
                            <Select
                              value={formData.network}
                              onValueChange={(v) =>
                                setFormData((prev) => ({ ...prev, network: v }))
                              }
                            >
                              <SelectTrigger className="h-10 rounded-xl bg-white border-white/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NETWORK_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center justify-between p-3 bg-white/50 rounded-2xl border border-white">
                            <span className="text-xs font-semibold">启用 TLS</span>
                            <Switch
                              checked={formData.tls}
                              onCheckedChange={(c) => setFormData((prev) => ({ ...prev, tls: c }))}
                            />
                          </div>

                          <div className="flex items-center justify-between p-3 bg-white/50 rounded-2xl border border-white">
                            <span className="text-xs font-semibold">启用 UDP</span>
                            <Switch
                              checked={formData.udp}
                              onCheckedChange={(c) => setFormData((prev) => ({ ...prev, udp: c }))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-3xl border border-white/60 bg-white/40 p-6 space-y-4">
                        <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                          <Settings2 className="w-3 h-3 text-blue-500" />
                          其它选项
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-500">SNI</label>
                            <Input
                              value={formData.sni}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, sni: e.target.value }))
                              }
                              className="h-10 rounded-xl bg-white border-white/50"
                            />
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white/50 rounded-2xl border border-white">
                            <span className="text-xs font-semibold">跳过证书验证</span>
                            <Switch
                              checked={formData.skipCertVerify}
                              onCheckedChange={(c) =>
                                setFormData((prev) => ({ ...prev, skipCertVerify: c }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="absolute bottom-6 left-8 right-8 z-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  className="h-10 px-5 rounded-full bg-white/40 text-neutral-700 border border-white/60 hover:bg-white/70"
                >
                  取消
                </Button>

                {currentStep > 1 && (
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    className="h-12 px-6 rounded-2xl gap-2 hover:bg-black/5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一步
                  </Button>
                )}
              </div>

              <div className="flex gap-3">
                {currentStep < 3 ? (
                  <Button
                    onClick={handleNext}
                    className="h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 gap-2"
                  >
                    下一步
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="h-12 px-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 gap-2"
                  >
                    {submitting ? (
                      <Activity className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {editName ? '保存修改' : '确认添加'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
