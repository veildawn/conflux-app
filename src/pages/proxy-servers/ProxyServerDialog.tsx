import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Cog,
  Loader2,
  Pencil,
  Wrench,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import type { ProxyConfig } from '@/types/config';
import type { ProxyFormData, ProtocolFieldConfig } from './types';
import {
  PROXY_TYPE_OPTIONS,
  CIPHER_OPTIONS,
  VMESS_CIPHER_OPTIONS,
  NETWORK_OPTIONS,
  PROTOCOL_FIELDS,
} from './constants';

interface ProxyServerDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (proxy: ProxyConfig, originalProxy?: ProxyConfig) => Promise<void>;
  editData?: ProxyConfig | null;
  statusRunning: boolean;
}

type ProxyFormField = keyof ProxyFormData;

export function ProxyServerDialog({
  open,
  onClose,
  onSubmit,
  editData,
  statusRunning,
}: ProxyServerDialogProps) {
  const [currentStep, setCurrentStep] = useState(1);
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
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'validating' | 'saving' | 'testing' | 'success' | 'error'
  >('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ============= 验证辅助函数 =============

  // UUID格式验证
  const isValidUUID = (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  // 域名格式验证
  const isValidDomain = (domain: string): boolean => {
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain) || /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
  };

  // 端口验证
  const isValidPort = (port: string | number): boolean => {
    const portNum = Number(port);
    return Number.isInteger(portNum) && portNum > 0 && portNum <= 65535;
  };

  // JSON格式验证
  const isValidJSON = (str: string): boolean => {
    if (!str.trim()) return true; // 空值允许
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  // 验证单个字段
  const validateField = (
    fieldName: ProxyFormField,
    value: ProxyFormData[ProxyFormField],
    protocol: string
  ): string => {
    const config = PROTOCOL_FIELDS[protocol] || { required: [], optional: [] };

    // 必填字段检查
    if (config.required.includes(fieldName)) {
      if (!value || (typeof value === 'string' && !value.trim())) {
        return '此字段为必填项';
      }
    }

    // 格式验证
    switch (fieldName) {
      case 'port':
        if (!isValidPort(typeof value === 'string' || typeof value === 'number' ? value : '')) {
          return '端口号必须在 1-65535 之间';
        }
        break;
      case 'server':
        if (typeof value === 'string' && value && !isValidDomain(value)) {
          return '无效的域名或IP地址';
        }
        break;
      case 'uuid':
        if (typeof value === 'string' && value && !isValidUUID(value)) {
          return 'UUID格式不正确（格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）';
        }
        break;
      case 'sni':
        if (typeof value === 'string' && value && !isValidDomain(value)) {
          return '无效的SNI域名';
        }
        break;
      case 'wsHeaders':
        if (typeof value === 'string' && value && !isValidJSON(value)) {
          return 'WebSocket Headers 必须是有效的JSON格式';
        }
        break;
      case 'httpHeaders':
        if (typeof value === 'string' && value && !isValidJSON(value)) {
          return 'HTTP Headers 必须是有效的JSON格式';
        }
        break;
      case 'hysteriaUpMbps':
      case 'hysteriaDownMbps':
        if (typeof value === 'string' && value && (isNaN(Number(value)) || Number(value) <= 0)) {
          return '必须是正数';
        }
        break;
    }

    return '';
  };

  // 实时验证表单字段
  const handleFieldChange = <T extends ProxyFormField>(fieldName: T, value: ProxyFormData[T]) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));

    // 实时验证
    const error = validateField(fieldName, value, formData.type);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error,
    }));
  };

  // 验证整个表单
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 基础字段验证
    const baseFields: ProxyFormField[] = ['name', 'type', 'server', 'port'];
    baseFields.forEach((field) => {
      const error = validateField(field, formData[field], formData.type);
      if (error) errors[field] = error;
    });

    // 协议特定字段验证
    const config = PROTOCOL_FIELDS[formData.type] || { required: [], optional: [] };
    config.required.forEach((field) => {
      const fieldKey = field as ProxyFormField;
      const error = validateField(fieldKey, formData[fieldKey], formData.type);
      if (error) errors[field] = error;
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 辅助函数
  const getFieldsForProtocol = (protocol: string): ProtocolFieldConfig =>
    PROTOCOL_FIELDS[protocol] || { required: [], optional: [] };

  const shouldShowField = (protocol: string, fieldName: string): boolean => {
    if (!protocol) return false;
    const config = getFieldsForProtocol(protocol);
    return config.required.includes(fieldName) || config.optional.includes(fieldName);
  };

  const isFieldRequired = (protocol: string, fieldName: string): boolean => {
    if (!protocol) return false;
    const config = getFieldsForProtocol(protocol);
    return config.required.includes(fieldName);
  };

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

  useEffect(() => {
    if (editData) {
      const wsOpts = getProxyOption(editData, 'ws-opts');
      const grpcOpts = getProxyOption(editData, 'grpc-opts');
      const h2Opts = getProxyOption(editData, 'h2-opts');
      const httpOpts = getProxyOption(editData, 'http-opts');
      const wsHeadersValue = wsOpts?.headers;
      const httpHeadersValue = httpOpts?.headers;

      setFormData({
        name: editData.name || '',
        type: editData.type || '',
        server: editData.server || '',
        port: editData.port ? String(editData.port) : '',
        udp: Boolean(editData.udp),
        tls: Boolean(editData.tls),
        skipCertVerify: Boolean(editData['skip-cert-verify']),
        cipher: editData.cipher || (editData.type === 'vmess' ? 'auto' : ''),
        password: editData.password || '',
        uuid: editData.uuid || '',
        alterId:
          editData.alterId !== undefined && editData.alterId !== null
            ? String(editData.alterId)
            : '',
        network: editData.network || '',
        sni: editData.sni || '',
        // WebSocket
        wsPath: getOptionString(wsOpts?.path),
        wsHeaders:
          wsHeadersValue && typeof wsHeadersValue === 'object'
            ? JSON.stringify(wsHeadersValue)
            : '',
        // gRPC
        grpcServiceName: getOptionString(grpcOpts?.['grpc-service-name']),
        // HTTP/2
        h2Host: getFirstString(h2Opts?.host),
        h2Path: getOptionString(h2Opts?.path),
        // HTTP
        httpHost: getFirstString(httpOpts?.host),
        httpPath: getFirstString(httpOpts?.path),
        httpHeaders:
          httpHeadersValue && typeof httpHeadersValue === 'object'
            ? JSON.stringify(httpHeadersValue)
            : '',
      });
      setCurrentStep(1);
    } else {
      setFormData({
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
      });
      setCurrentStep(1);
    }
    setFieldErrors({});
    setSubmitStatus('idle');
    setSubmitMessage('');
  }, [editData, open]);

  // 步骤导航
  const canGoNext = useMemo(() => {
    if (currentStep === 1) {
      // 第一步：基础信息
      return (
        !!formData.name.trim() &&
        !!formData.type.trim() &&
        !!formData.server.trim() &&
        isValidPort(formData.port)
      );
    }
    return true;
  }, [currentStep, formData]);

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    // 1. 验证表单
    setSubmitStatus('validating');
    setSubmitMessage('正在验证表单...');

    if (!validateForm()) {
      setSubmitStatus('error');
      setSubmitMessage('表单验证失败，请检查标红的字段');
      setTimeout(() => {
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 3000);
      return;
    }

    setSubmitting(true);
    try {
      const name = formData.name.trim();
      const type = formData.type.trim();
      const server = formData.server.trim();

      // 构建基础 ProxyConfig
      const proxy: ProxyConfig = {
        name,
        type,
        server,
        port: Number(formData.port),
        udp: formData.udp,
      };

      // 添加协议特定字段
      if (formData.cipher) proxy.cipher = formData.cipher.trim();
      if (formData.password) proxy.password = formData.password.trim();
      if (formData.uuid) proxy.uuid = formData.uuid.trim();
      if (formData.alterId.trim() !== '') {
        const alterIdNumber = Number(formData.alterId);
        if (Number.isFinite(alterIdNumber)) {
          proxy.alterId = alterIdNumber;
        }
      }
      if (formData.network) proxy.network = formData.network.trim();
      if (formData.tls) proxy.tls = true;
      if (formData.skipCertVerify) proxy['skip-cert-verify'] = true;
      if (formData.sni) proxy.sni = formData.sni.trim();

      // 添加传输层配置
      // WebSocket
      if (formData.network === 'ws') {
        const wsOpts: Record<string, unknown> = {};
        if (formData.wsPath) wsOpts.path = formData.wsPath;
        if (formData.wsHeaders) {
          wsOpts.headers = JSON.parse(formData.wsHeaders) as Record<string, unknown>;
        }
        if (Object.keys(wsOpts).length > 0) proxy['ws-opts'] = wsOpts;
      }

      // gRPC
      if (formData.network === 'grpc' && formData.grpcServiceName) {
        proxy['grpc-opts'] = { 'grpc-service-name': formData.grpcServiceName };
      }

      // HTTP/2
      if (formData.network === 'h2') {
        const h2Opts: Record<string, unknown> = {};
        if (formData.h2Host) h2Opts.host = [formData.h2Host];
        if (formData.h2Path) h2Opts.path = formData.h2Path;
        if (Object.keys(h2Opts).length > 0) proxy['h2-opts'] = h2Opts;
      }

      // HTTP
      if (formData.network === 'http') {
        const httpOpts: Record<string, unknown> = {};
        if (formData.httpHost) httpOpts.host = [formData.httpHost];
        if (formData.httpPath) httpOpts.path = [formData.httpPath];
        if (formData.httpHeaders) {
          httpOpts.headers = JSON.parse(formData.httpHeaders) as Record<string, unknown>;
        }
        if (Object.keys(httpOpts).length > 0) proxy['http-opts'] = httpOpts;
      }

      // Hysteria
      if (type === 'hysteria' || type === 'hysteria2') {
        if (formData.hysteriaUpMbps) proxy['up'] = formData.hysteriaUpMbps;
        if (formData.hysteriaDownMbps) proxy['down'] = formData.hysteriaDownMbps;
        if (formData.hysteriaObfs) proxy['obfs'] = formData.hysteriaObfs;
      }

      if (type === 'vmess' && !proxy.cipher) {
        proxy.cipher = 'auto';
      }

      // TUIC
      if (type === 'tuic') {
        if (formData.tuicToken) proxy['token'] = formData.tuicToken;
        if (formData.tuicCongestionController) {
          proxy['congestion-controller'] = formData.tuicCongestionController;
        }
        if (formData.tuicUdpRelayMode) {
          proxy['udp-relay-mode'] = formData.tuicUdpRelayMode;
        }
      }

      setSubmitStatus('saving');
      setSubmitMessage('正在保存配置...');

      await onSubmit(proxy, editData || undefined);

      setSubmitStatus('success');
      setSubmitMessage(editData ? '服务器已更新！' : '服务器已添加！');

      // 延迟关闭对话框，让用户看到成功提示
      setTimeout(() => {
        onClose();
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 1500);
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage(`操作失败: ${String(error)}`);
      setTimeout(() => {
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { id: 1, name: '基础信息', icon: ClipboardList },
    { id: 2, name: '协议配置', icon: Cog },
    { id: 3, name: '高级设置', icon: Wrench },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-gray-500" />
            {editData ? '编辑服务器' : '手动配置服务器'}
          </DialogTitle>
        </DialogHeader>

        {/* 步骤进度条 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border border-gray-200 dark:border-zinc-800">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const canNavigate = editData || currentStep >= step.id; // 编辑模式或已完成的步骤可点击
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    'flex items-center gap-2 flex-1',
                    canNavigate && 'cursor-pointer group'
                  )}
                  onClick={() => canNavigate && setCurrentStep(step.id)}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                      currentStep === step.id
                        ? 'bg-blue-500 text-white shadow-lg scale-110'
                        : currentStep > step.id
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 dark:bg-zinc-800 text-gray-500',
                      canNavigate &&
                        currentStep !== step.id &&
                        'group-hover:scale-105 group-hover:shadow-md'
                    )}
                  >
                    {currentStep > step.id ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        'text-xs font-medium transition-colors',
                        currentStep === step.id
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500',
                        canNavigate && currentStep !== step.id && 'group-hover:text-blue-500'
                      )}
                    >
                      步骤 {step.id}
                    </span>
                    <span
                      className={cn(
                        'text-sm transition-colors',
                        currentStep === step.id
                          ? 'text-gray-900 dark:text-white font-semibold'
                          : 'text-gray-600 dark:text-gray-400',
                        canNavigate &&
                          currentStep !== step.id &&
                          'group-hover:text-gray-900 dark:group-hover:text-white'
                      )}
                    >
                      {step.name}
                    </span>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 mx-2 transition-all',
                      currentStep > step.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-zinc-800'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 表单内容区域 - 可滚动 */}
        <div className="flex-1 overflow-y-auto px-1">
          <div className="space-y-4 py-4">
            {/* 第1步：基础信息 */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <ClipboardList className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <span className="font-medium">步骤 1/3：</span> 填写服务器的基本信息
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-2">
                    <label className="text-sm font-medium">
                      名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      placeholder="my-server"
                      className={cn(fieldErrors.name && 'border-red-300')}
                    />
                    {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      协议类型 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => {
                        const defaults = PROTOCOL_FIELDS[value]?.defaults || {};
                        setFormData({ ...formData, type: value, ...defaults });
                        setFieldErrors({});
                      }}
                    >
                      <SelectTrigger className={cn(fieldErrors.type && 'border-red-300')}>
                        <SelectValue placeholder="请选择协议类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROXY_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.type && <p className="text-xs text-red-500">{fieldErrors.type}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      端口 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      value={formData.port}
                      onChange={(e) => handleFieldChange('port', e.target.value)}
                      placeholder="443"
                      min={1}
                      max={65535}
                      className={cn(fieldErrors.port && 'border-red-300')}
                    />
                    {fieldErrors.port && <p className="text-xs text-red-500">{fieldErrors.port}</p>}
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-sm font-medium">
                      服务器地址 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.server}
                      onChange={(e) => handleFieldChange('server', e.target.value)}
                      placeholder="example.com"
                      className={cn(fieldErrors.server && 'border-red-300')}
                    />
                    {fieldErrors.server && (
                      <p className="text-xs text-red-500">{fieldErrors.server}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 第2步：协议配置 */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <Cog className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <span className="font-medium">步骤 2/3：</span> 配置{' '}
                    {PROXY_TYPE_OPTIONS.find((o) => o.value === formData.type)?.label || '协议'}{' '}
                    参数
                  </p>
                </div>

                {formData.type && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        协议配置
                      </h4>
                    </div>

                    {/* Cipher 字段 - 仅 Shadowsocks */}
                    {shouldShowField(formData.type, 'cipher') && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Cipher{' '}
                          {isFieldRequired(formData.type, 'cipher') && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        <Select
                          value={formData.cipher}
                          onValueChange={(value) => handleFieldChange('cipher', value)}
                        >
                          <SelectTrigger className={cn(fieldErrors.cipher && 'border-red-300')}>
                            <SelectValue placeholder="选择加密方式" />
                          </SelectTrigger>
                          <SelectContent>
                            {(formData.type === 'vmess'
                              ? VMESS_CIPHER_OPTIONS
                              : CIPHER_OPTIONS
                            ).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldErrors.cipher && (
                          <p className="text-xs text-red-500">{fieldErrors.cipher}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Shadowsocks 加密方式
                        </p>
                      </div>
                    )}

                    {/* Password 字段 */}
                    {shouldShowField(formData.type, 'password') && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Password{' '}
                          {isFieldRequired(formData.type, 'password') && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        <Input
                          type="password"
                          value={formData.password}
                          onChange={(e) => handleFieldChange('password', e.target.value)}
                          placeholder="password"
                          className={cn(fieldErrors.password && 'border-red-300')}
                        />
                        {fieldErrors.password && (
                          <p className="text-xs text-red-500">{fieldErrors.password}</p>
                        )}
                      </div>
                    )}

                    {/* UUID 字段 */}
                    {shouldShowField(formData.type, 'uuid') && (
                      <div className="col-span-2 space-y-2">
                        <label className="text-sm font-medium">
                          UUID{' '}
                          {isFieldRequired(formData.type, 'uuid') && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        <Input
                          value={formData.uuid}
                          onChange={(e) => handleFieldChange('uuid', e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className={cn('font-mono text-xs', fieldErrors.uuid && 'border-red-300')}
                        />
                        {fieldErrors.uuid && (
                          <p className="text-xs text-red-500">{fieldErrors.uuid}</p>
                        )}
                      </div>
                    )}

                    {/* Alter ID 字段 - 仅 VMess */}
                    {shouldShowField(formData.type, 'alterId') && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Alter ID</label>
                        <Input
                          value={formData.alterId}
                          onChange={(e) => handleFieldChange('alterId', e.target.value)}
                          placeholder="0"
                          type="number"
                          min={0}
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          VMess 额外 ID，通常为 0
                        </p>
                      </div>
                    )}

                    {/* Network 字段 */}
                    {shouldShowField(formData.type, 'network') && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Network</label>
                        <Select
                          value={formData.network}
                          onValueChange={(value) => handleFieldChange('network', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择传输协议" />
                          </SelectTrigger>
                          <SelectContent>
                            {NETWORK_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-400 dark:text-gray-500">传输层协议</p>
                      </div>
                    )}

                    {/* SNI 字段 */}
                    {shouldShowField(formData.type, 'sni') && (
                      <div className="col-span-2 space-y-2">
                        <label className="text-sm font-medium">SNI</label>
                        <Input
                          value={formData.sni}
                          onChange={(e) => handleFieldChange('sni', e.target.value)}
                          placeholder="sni.example.com"
                          className={cn(fieldErrors.sni && 'border-red-300')}
                        />
                        {fieldErrors.sni && (
                          <p className="text-xs text-red-500">{fieldErrors.sni}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          TLS Server Name Indication
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* WebSocket 配置 - 当 network = 'ws' 时显示 */}
                {formData.type && formData.network === 'ws' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        WebSocket 配置
                      </h4>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">WS Path</label>
                      <Input
                        value={formData.wsPath || ''}
                        onChange={(e) => handleFieldChange('wsPath', e.target.value)}
                        placeholder="/path"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500">WebSocket 路径</p>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">WS Headers</label>
                      <Input
                        value={formData.wsHeaders || ''}
                        onChange={(e) => handleFieldChange('wsHeaders', e.target.value)}
                        placeholder='{"Host": "example.com"}'
                        className={cn(
                          'font-mono text-xs',
                          fieldErrors.wsHeaders && 'border-red-300'
                        )}
                      />
                      {fieldErrors.wsHeaders && (
                        <p className="text-xs text-red-500">{fieldErrors.wsHeaders}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        JSON 格式的自定义 Headers
                      </p>
                    </div>
                  </div>
                )}

                {/* gRPC 配置 - 当 network = 'grpc' 时显示 */}
                {formData.type && formData.network === 'grpc' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        gRPC 配置
                      </h4>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">gRPC Service Name</label>
                      <Input
                        value={formData.grpcServiceName || ''}
                        onChange={(e) => handleFieldChange('grpcServiceName', e.target.value)}
                        placeholder="GunService"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500">gRPC 服务名称</p>
                    </div>
                  </div>
                )}

                {/* HTTP/2 配置 - 当 network = 'h2' 时显示 */}
                {formData.type && formData.network === 'h2' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        HTTP/2 配置
                      </h4>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">H2 Host</label>
                      <Input
                        value={formData.h2Host || ''}
                        onChange={(e) => handleFieldChange('h2Host', e.target.value)}
                        placeholder="example.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">H2 Path</label>
                      <Input
                        value={formData.h2Path || ''}
                        onChange={(e) => handleFieldChange('h2Path', e.target.value)}
                        placeholder="/path"
                      />
                    </div>
                  </div>
                )}

                {/* HTTP 配置 - 当 network = 'http' 时显示 */}
                {formData.type && formData.network === 'http' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        HTTP 配置
                      </h4>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">HTTP Host</label>
                      <Input
                        value={formData.httpHost || ''}
                        onChange={(e) => handleFieldChange('httpHost', e.target.value)}
                        placeholder="example.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">HTTP Path</label>
                      <Input
                        value={formData.httpPath || ''}
                        onChange={(e) => handleFieldChange('httpPath', e.target.value)}
                        placeholder="/path"
                      />
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">HTTP Headers</label>
                      <Input
                        value={formData.httpHeaders || ''}
                        onChange={(e) => handleFieldChange('httpHeaders', e.target.value)}
                        placeholder='{"Host": "example.com"}'
                        className={cn(
                          'font-mono text-xs',
                          fieldErrors.httpHeaders && 'border-red-300'
                        )}
                      />
                      {fieldErrors.httpHeaders && (
                        <p className="text-xs text-red-500">{fieldErrors.httpHeaders}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        JSON 格式的自定义 Headers
                      </p>
                    </div>
                  </div>
                )}

                {/* Hysteria 特定配置 */}
                {(formData.type === 'hysteria' || formData.type === 'hysteria2') && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Hysteria 配置
                      </h4>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">上行速率 (Mbps)</label>
                      <Input
                        type="number"
                        value={formData.hysteriaUpMbps || ''}
                        onChange={(e) => handleFieldChange('hysteriaUpMbps', e.target.value)}
                        placeholder="100"
                        className={cn(fieldErrors.hysteriaUpMbps && 'border-red-300')}
                      />
                      {fieldErrors.hysteriaUpMbps && (
                        <p className="text-xs text-red-500">{fieldErrors.hysteriaUpMbps}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">下行速率 (Mbps)</label>
                      <Input
                        type="number"
                        value={formData.hysteriaDownMbps || ''}
                        onChange={(e) => handleFieldChange('hysteriaDownMbps', e.target.value)}
                        placeholder="100"
                        className={cn(fieldErrors.hysteriaDownMbps && 'border-red-300')}
                      />
                      {fieldErrors.hysteriaDownMbps && (
                        <p className="text-xs text-red-500">{fieldErrors.hysteriaDownMbps}</p>
                      )}
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">Obfuscation</label>
                      <Input
                        value={formData.hysteriaObfs || ''}
                        onChange={(e) => handleFieldChange('hysteriaObfs', e.target.value)}
                        placeholder="混淆密码（可选）"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        混淆功能，增强抗审查能力
                      </p>
                    </div>
                  </div>
                )}

                {/* TUIC 特定配置 */}
                {formData.type === 'tuic' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div className="col-span-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        TUIC 配置
                      </h4>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">Token</label>
                      <Input
                        value={formData.tuicToken || ''}
                        onChange={(e) => handleFieldChange('tuicToken', e.target.value)}
                        placeholder="认证令牌（可选）"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">拥塞控制</label>
                      <Select
                        value={formData.tuicCongestionController || 'bbr'}
                        onValueChange={(value) =>
                          handleFieldChange('tuicCongestionController', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bbr">BBR</SelectItem>
                          <SelectItem value="cubic">CUBIC</SelectItem>
                          <SelectItem value="newreno">New Reno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">UDP 中继模式</label>
                      <Select
                        value={formData.tuicUdpRelayMode || 'native'}
                        onValueChange={(value) => handleFieldChange('tuicUdpRelayMode', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="native">Native</SelectItem>
                          <SelectItem value="quic">QUIC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 第3步：高级设置 */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <Wrench className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <span className="font-medium">步骤 3/3：</span> 可选的高级配置和开关选项
                  </p>
                </div>

                {/* 开关选项 */}
                {formData.type && (
                  <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border border-gray-200 dark:border-zinc-800">
                    {shouldShowField(formData.type, 'udp') && (
                      <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                        <Switch
                          checked={formData.udp}
                          onCheckedChange={(checked) => handleFieldChange('udp', checked)}
                          className="data-[state=checked]:bg-blue-500"
                        />
                        <div className="text-center">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            UDP
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            启用 UDP 转发
                          </div>
                        </div>
                      </div>
                    )}

                    {shouldShowField(formData.type, 'tls') && (
                      <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                        <Switch
                          checked={formData.tls}
                          onCheckedChange={(checked) => handleFieldChange('tls', checked)}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                        <div className="text-center">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            TLS
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            传输层加密
                          </div>
                        </div>
                      </div>
                    )}

                    {shouldShowField(formData.type, 'skipCertVerify') && (
                      <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                        <Switch
                          checked={formData.skipCertVerify}
                          onCheckedChange={(checked) =>
                            handleFieldChange('skipCertVerify', checked)
                          }
                          className="data-[state=checked]:bg-amber-500"
                        />
                        <div className="text-center">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            跳过验证
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            跳过证书验证
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 提示信息 */}
                <div className="flex items-start gap-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-green-600 dark:text-green-400">
                    <span className="font-medium">配置已完成！</span>点击"完成"按钮保存服务器配置
                  </p>
                </div>

                {statusRunning && (
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    保存时会自动进行一次测速，失败会回滚修改。
                  </div>
                )}
                {!statusRunning && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    核心未启动，无法进行保存前测速，请先启动核心服务。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 提交状态提示 */}
        {submitStatus !== 'idle' && (
          <div
            className={cn(
              'mx-6 mb-4 px-4 py-3 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2',
              submitStatus === 'validating' &&
                'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
              submitStatus === 'saving' &&
                'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
              submitStatus === 'testing' &&
                'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
              submitStatus === 'success' &&
                'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
              submitStatus === 'error' &&
                'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
            )}
          >
            {submitStatus === 'validating' && (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0 mt-0.5" />
            )}
            {submitStatus === 'saving' && (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0 mt-0.5" />
            )}
            {submitStatus === 'testing' && (
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0 mt-0.5" />
            )}
            {submitStatus === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            )}
            {submitStatus === 'error' && (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  submitStatus === 'validating' && 'text-blue-700 dark:text-blue-300',
                  submitStatus === 'saving' && 'text-blue-700 dark:text-blue-300',
                  submitStatus === 'testing' && 'text-amber-700 dark:text-amber-300',
                  submitStatus === 'success' && 'text-green-700 dark:text-green-300',
                  submitStatus === 'error' && 'text-red-700 dark:text-red-300'
                )}
              >
                {submitMessage}
              </p>
            </div>
          </div>
        )}

        {/* 导航按钮 */}
        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
          </div>
          <div className="flex gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting}>
                上一步
              </Button>
            )}
            {currentStep < 3 ? (
              <Button onClick={handleNext} disabled={!canGoNext || submitting}>
                下一步
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {editData ? '保存中...' : '提交中...'}
                  </>
                ) : editData ? (
                  '保存修改'
                ) : (
                  '完成'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
