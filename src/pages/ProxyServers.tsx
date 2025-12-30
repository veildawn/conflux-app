import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardList, Cog, Loader2, Pencil, Plus, RefreshCw, Trash2, Wifi, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ipc } from '@/services/ipc';
import { useToast } from '@/hooks/useToast';
import { useProxyStore } from '@/stores/proxyStore';
import { formatDelay, getDelayColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { ProxyConfig, ProfileMetadata } from '@/types/config';

function BentoCard({
  className,
  children,
  title,
  icon: Icon,
  iconColor = "text-gray-500",
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
        "bg-white dark:bg-zinc-900 rounded-[24px] shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col relative overflow-hidden",
        className
      )}
    >
      {(title || Icon) && (
        <div className="flex justify-between items-center px-6 pt-5 pb-3 z-10 border-b border-gray-50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
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

const getProxyTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  if (t.includes('trojan')) return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (t.includes('hysteria')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (t.includes('wireguard')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (t.includes('tuic')) return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
  return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
};

const getProxyTypeBgColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-500';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-500';
  if (t.includes('trojan')) return 'bg-red-500';
  if (t.includes('hysteria')) return 'bg-amber-500';
  if (t.includes('wireguard')) return 'bg-emerald-500';
  if (t.includes('tuic')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const decodeBase64 = (input: string) => {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = `${normalized}${padding}`;

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(base64);
  }

  throw new Error('Base64 decoder is unavailable');
};

const parseBooleanParam = (value: string | null) => {
  if (!value) return undefined;
  return value === '1' || value.toLowerCase() === 'true';
};

const parseName = (raw: string | undefined) => {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const parseSsLink = (link: string): ProxyConfig => {
  const raw = link.replace(/^ss:\/\//i, '');
  const [beforeHash, hashPart] = raw.split('#');
  const name = parseName(hashPart);
  const [basePart] = beforeHash.split('?');

  const atIndex = basePart.lastIndexOf('@');
  let cipher = '';
  let password = '';
  let server = '';
  let port = 0;

  if (atIndex >= 0) {
    const userInfo = basePart.slice(0, atIndex);
    const hostPort = basePart.slice(atIndex + 1);
    const decodedUser = userInfo.includes(':') ? userInfo : decodeBase64(userInfo);
    const [methodPart, passPart] = decodedUser.split(':');
    cipher = decodeURIComponent(methodPart || '');
    password = decodeURIComponent(passPart || '');
    const [host, portStr] = hostPort.split(':');
    server = host || '';
    port = Number(portStr);
  } else {
    const decoded = decodeBase64(basePart);
    const [userInfo, hostPort] = decoded.split('@');
    if (!hostPort) {
      throw new Error('Invalid ss link');
    }
    const [methodPart, passPart] = userInfo.split(':');
    cipher = decodeURIComponent(methodPart || '');
    password = decodeURIComponent(passPart || '');
    const [host, portStr] = hostPort.split(':');
    server = host || '';
    port = Number(portStr);
  }

  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid ss link');
  }

  return {
    name: name || server,
    type: 'ss',
    server,
    port,
    cipher: cipher || undefined,
    password: password || undefined,
  };
};

const parseVmessLink = (link: string): ProxyConfig => {
  const raw = link.replace(/^vmess:\/\//i, '');
  const decoded = decodeBase64(raw);
  const payload = JSON.parse(decoded) as Record<string, string>;
  const server = payload.add || '';
  const port = Number(payload.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid vmess link');
  }

  const tlsEnabled = payload.tls?.toLowerCase() === 'tls';
  const allowInsecure = payload.allowInsecure === '1' || payload.allowInsecure === 'true';
  const alterIdRaw = payload.aid;
  const alterIdValue =
    alterIdRaw !== undefined && alterIdRaw !== null && alterIdRaw !== ''
      ? Number(alterIdRaw)
      : undefined;
  const alterId = Number.isFinite(alterIdValue) ? alterIdValue : undefined;
  const cipher = (payload.scy || payload.cipher || 'auto').toString();

  return {
    name: payload.ps || server,
    type: 'vmess',
    server,
    port,
    cipher,
    uuid: payload.id || undefined,
    alterId,
    network: payload.net || undefined,
    tls: tlsEnabled || undefined,
    'skip-cert-verify': allowInsecure || undefined,
    sni: payload.sni || payload.host || undefined,
  };
};

const parseVlessLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid vless link');
  }

  const security = url.searchParams.get('security');
  const tlsEnabled = security && security !== 'none' ? true : undefined;
  const allowInsecure = parseBooleanParam(url.searchParams.get('allowInsecure')) ?? parseBooleanParam(url.searchParams.get('insecure'));

  return {
    name: parseName(url.hash.slice(1)) || server,
    type: 'vless',
    server,
    port,
    uuid: decodeURIComponent(url.username),
    network: url.searchParams.get('type') || url.searchParams.get('transport') || undefined,
    tls: tlsEnabled,
    'skip-cert-verify': allowInsecure || undefined,
    sni: url.searchParams.get('sni') || url.searchParams.get('peer') || url.searchParams.get('servername') || undefined,
    udp: parseBooleanParam(url.searchParams.get('udp')),
  };
};

const parseTrojanLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid trojan link');
  }

  const security = url.searchParams.get('security');
  const tlsEnabled = security && security !== 'none' ? true : undefined;
  const allowInsecure = parseBooleanParam(url.searchParams.get('allowInsecure')) ?? parseBooleanParam(url.searchParams.get('insecure'));

  return {
    name: parseName(url.hash.slice(1)) || server,
    type: 'trojan',
    server,
    port,
    password: decodeURIComponent(url.username),
    tls: tlsEnabled ?? true,
    'skip-cert-verify': allowInsecure || undefined,
    sni: url.searchParams.get('sni') || url.searchParams.get('peer') || undefined,
    udp: parseBooleanParam(url.searchParams.get('udp')),
  };
};

const parseHysteriaLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid hysteria link');
  }

  const allowInsecure = parseBooleanParam(url.searchParams.get('insecure'));
  const type = url.protocol.replace(':', '').toLowerCase();
  const password = url.password ? decodeURIComponent(url.password) : decodeURIComponent(url.username);

  return {
    name: parseName(url.hash.slice(1)) || server,
    type: type === 'hy2' ? 'hysteria2' : type,
    server,
    port,
    password: password || undefined,
    tls: true,
    'skip-cert-verify': allowInsecure || undefined,
    sni: url.searchParams.get('sni') || url.searchParams.get('peer') || undefined,
    udp: parseBooleanParam(url.searchParams.get('udp')),
  };
};

const parseTuicLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid tuic link');
  }

  return {
    name: parseName(url.hash.slice(1)) || server,
    type: 'tuic',
    server,
    port,
    uuid: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sni: url.searchParams.get('sni') || undefined,
    udp: parseBooleanParam(url.searchParams.get('udp')),
  };
};

const parseProxyLink = (raw: string): ProxyConfig => {
  const line = raw.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  if (!line) {
    throw new Error('Empty link');
  }

  const lower = line.toLowerCase();
  if (lower.startsWith('ss://')) return parseSsLink(line);
  if (lower.startsWith('vmess://')) return parseVmessLink(line);
  if (lower.startsWith('vless://')) return parseVlessLink(line);
  if (lower.startsWith('trojan://')) return parseTrojanLink(line);
  if (lower.startsWith('hysteria://') || lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) {
    return parseHysteriaLink(line);
  }
  if (lower.startsWith('tuic://')) return parseTuicLink(line);

  throw new Error('Unsupported link format');
};

// ============= 协议配置常量 =============

// 协议类型选项
const PROXY_TYPE_OPTIONS = [
  { value: 'ss', label: 'Shadowsocks', description: 'Shadowsocks 协议' },
  { value: 'vmess', label: 'VMess', description: 'V2Ray VMess 协议' },
  { value: 'vless', label: 'VLESS', description: 'V2Ray VLESS 协议' },
  { value: 'trojan', label: 'Trojan', description: 'Trojan 协议' },
  { value: 'hysteria', label: 'Hysteria', description: 'Hysteria 协议' },
  { value: 'hysteria2', label: 'Hysteria2', description: 'Hysteria2 协议' },
  { value: 'tuic', label: 'TUIC', description: 'TUIC 协议' },
];

// Cipher 加密方式选项（用于 Shadowsocks）
const CIPHER_OPTIONS = [
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
  { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' },
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305' },
];

// Cipher 加密方式选项（用于 VMess）
const VMESS_CIPHER_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'none', label: 'None' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' },
];

// Network 传输协议选项
const NETWORK_OPTIONS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'ws', label: 'WebSocket' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'h2', label: 'HTTP/2' },
  { value: 'http', label: 'HTTP' },
];

// 协议字段配置类型
interface ProtocolFieldConfig {
  required: string[];
  optional: string[];
  defaults?: Partial<ProxyFormData>;
}

// 协议字段配置映射
const PROTOCOL_FIELDS: Record<string, ProtocolFieldConfig> = {
  ss: {
    required: ['cipher', 'password'],
    optional: ['udp', 'tls', 'sni'],
    defaults: { tls: false, udp: false },
  },
  vmess: {
    required: ['uuid', 'cipher'],
    optional: ['alterId', 'network', 'tls', 'sni', 'udp', 'wsPath', 'wsHeaders', 'grpcServiceName', 'h2Host', 'h2Path', 'httpHost', 'httpPath', 'httpHeaders'],
    defaults: { alterId: '0', cipher: 'auto', tls: false, udp: false, network: 'tcp' },
  },
  vless: {
    required: ['uuid'],
    optional: ['network', 'tls', 'sni', 'skipCertVerify', 'udp', 'wsPath', 'grpcServiceName', 'h2Host'],
    defaults: { tls: false, udp: false, network: 'tcp' },
  },
  trojan: {
    required: ['password'],
    optional: ['tls', 'sni', 'skipCertVerify', 'udp', 'network', 'wsPath', 'grpcServiceName'],
    defaults: { tls: true, udp: false },
  },
  hysteria: {
    required: [],
    optional: ['password', 'tls', 'sni', 'skipCertVerify', 'udp', 'hysteriaUpMbps', 'hysteriaDownMbps', 'hysteriaObfs'],
    defaults: { tls: true, udp: true },
  },
  hysteria2: {
    required: [],
    optional: ['password', 'tls', 'sni', 'skipCertVerify', 'udp', 'hysteriaUpMbps', 'hysteriaDownMbps', 'hysteriaObfs'],
    defaults: { tls: true, udp: true },
  },
  tuic: {
    required: ['uuid', 'password'],
    optional: ['tls', 'sni', 'udp', 'tuicToken', 'tuicCongestionController', 'tuicUdpRelayMode'],
    defaults: { tls: true, udp: true },
  },
};

// ============= 类型定义 =============

interface ProxyFormData {
  name: string;
  type: string;
  server: string;
  port: string;
  udp: boolean;
  tls: boolean;
  skipCertVerify: boolean;
  cipher: string;
  password: string;
  uuid: string;
  alterId: string;
  network: string;
  sni: string;

  // WebSocket 配置
  wsPath?: string;
  wsHeaders?: string;  // JSON字符串

  // gRPC 配置
  grpcServiceName?: string;

  // HTTP/2 配置
  h2Host?: string;
  h2Path?: string;

  // HTTP 配置
  httpHost?: string;
  httpPath?: string;
  httpHeaders?: string; // JSON字符串

  // Hysteria 特定配置
  hysteriaUpMbps?: string;
  hysteriaDownMbps?: string;
  hysteriaObfs?: string;

  // TUIC 特定配置
  tuicToken?: string;
  tuicCongestionController?: string;
  tuicUdpRelayMode?: string;
}

// ============= 链接解析对话框组件 =============

function LinkParseDialog({
  open,
  onClose,
  onSuccess,
  statusRunning,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (proxy: ProxyConfig) => Promise<void>;
  statusRunning: boolean;
}) {
  const { toast } = useToast();
  const [linkInput, setLinkInput] = useState('');
  const [parsedProxy, setParsedProxy] = useState<ProxyConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleParse = () => {
    try {
      const parsed = parseProxyLink(linkInput.trim());
      setParsedProxy(parsed);
      toast({ title: '解析成功', variant: 'default' });
    } catch (error) {
      toast({
        title: '解析失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleAdd = async () => {
    if (!parsedProxy) return;

    setSubmitting(true);
    try {
      await onSuccess(parsedProxy);
      onClose();
      setLinkInput('');
      setParsedProxy(null);
    } catch (error) {
      toast({
        title: '添加失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setLinkInput('');
      setParsedProxy(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            通过链接快速添加
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">分享链接</label>
            <div className="flex gap-2">
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="粘贴 ss:// vmess:// vless:// trojan:// tuic:// hy2:// 链接"
                className="font-mono text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleParse()}
              />
              <Button
                onClick={handleParse}
                disabled={!linkInput.trim()}
                variant="outline"
              >
                解析
              </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              支持多种协议格式，解析后可预览配置
            </p>
          </div>

          {parsedProxy && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">解析结果</h4>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  getProxyTypeColor(parsedProxy.type)
                )}>
                  {parsedProxy.type.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">名称：</span>
                  <span className="font-medium ml-1">{parsedProxy.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">端口：</span>
                  <span className="font-medium ml-1">{parsedProxy.port}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">服务器：</span>
                  <span className="font-medium ml-1 font-mono">{parsedProxy.server}</span>
                </div>
              </div>
            </div>
          )}

          {!statusRunning && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                核心未启动，添加后无法自动测速
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!parsedProxy || submitting}
            className="gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            添加服务器
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= 手动配置对话框组件（分步表单）=============

function ProxyServerDialog({
  open,
  onClose,
  onSubmit,
  editData,
  statusRunning,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (proxy: ProxyConfig, originalProxy?: ProxyConfig) => Promise<void>;
  editData?: ProxyConfig | null;
  statusRunning: boolean;
}) {
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
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'validating' | 'saving' | 'testing' | 'success' | 'error'>('idle');
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
  const isValidPort = (port: string): boolean => {
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
  const validateField = (fieldName: string, value: any, protocol: string): string => {
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
        if (!isValidPort(value)) return '端口号必须在 1-65535 之间';
        break;
      case 'server':
        if (value && !isValidDomain(value)) return '无效的域名或IP地址';
        break;
      case 'uuid':
        if (value && !isValidUUID(value)) return 'UUID格式不正确（格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）';
        break;
      case 'sni':
        if (value && !isValidDomain(value)) return '无效的SNI域名';
        break;
      case 'wsHeaders':
        if (value && !isValidJSON(value)) return 'WebSocket Headers 必须是有效的JSON格式';
        break;
      case 'httpHeaders':
        if (value && !isValidJSON(value)) return 'HTTP Headers 必须是有效的JSON格式';
        break;
      case 'hysteriaUpMbps':
      case 'hysteriaDownMbps':
        if (value && (isNaN(Number(value)) || Number(value) <= 0)) return '必须是正数';
        break;
    }

    return '';
  };

  // 实时验证表单字段
  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData({ ...formData, [fieldName]: value });

    // 实时验证
    const error = validateField(fieldName, value, formData.type);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error
    }));
  };

  // 验证整个表单
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 基础字段验证
    ['name', 'type', 'server', 'port'].forEach(field => {
      const error = validateField(field, (formData as any)[field], formData.type);
      if (error) errors[field] = error;
    });

    // 协议特定字段验证
    const config = PROTOCOL_FIELDS[formData.type] || { required: [], optional: [] };
    config.required.forEach(field => {
      const error = validateField(field, (formData as any)[field], formData.type);
      if (error) errors[field] = error;
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 辅助函数
  const getFieldsForProtocol = (protocol: string): ProtocolFieldConfig => {
    return PROTOCOL_FIELDS[protocol] || { required: [], optional: [] };
  };

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

  useEffect(() => {
    if (editData) {
      const wsOpts = (editData as any)['ws-opts'];
      const grpcOpts = (editData as any)['grpc-opts'];
      const h2Opts = (editData as any)['h2-opts'];
      const httpOpts = (editData as any)['http-opts'];

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
        alterId: editData.alterId !== undefined && editData.alterId !== null ? String(editData.alterId) : '',
        network: editData.network || '',
        sni: editData.sni || '',
        // WebSocket
        wsPath: wsOpts?.path || '',
        wsHeaders: wsOpts?.headers ? JSON.stringify(wsOpts.headers) : '',
        // gRPC
        grpcServiceName: grpcOpts?.['grpc-service-name'] || '',
        // HTTP/2
        h2Host: h2Opts?.host?.[0] || '',
        h2Path: h2Opts?.path || '',
        // HTTP
        httpHost: httpOpts?.host?.[0] || '',
        httpPath: httpOpts?.path?.[0] || '',
        httpHeaders: httpOpts?.headers ? JSON.stringify(httpOpts.headers) : '',
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
      return !!formData.name.trim() &&
             !!formData.type.trim() &&
             !!formData.server.trim() &&
             isValidPort(formData.port);
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
        const wsOpts: any = {};
        if (formData.wsPath) wsOpts.path = formData.wsPath;
        if (formData.wsHeaders) wsOpts.headers = JSON.parse(formData.wsHeaders);
        if (Object.keys(wsOpts).length > 0) (proxy as any)['ws-opts'] = wsOpts;
      }

      // gRPC
      if (formData.network === 'grpc' && formData.grpcServiceName) {
        (proxy as any)['grpc-opts'] = { 'grpc-service-name': formData.grpcServiceName };
      }

      // HTTP/2
      if (formData.network === 'h2') {
        const h2Opts: any = {};
        if (formData.h2Host) h2Opts.host = [formData.h2Host];
        if (formData.h2Path) h2Opts.path = formData.h2Path;
        if (Object.keys(h2Opts).length > 0) (proxy as any)['h2-opts'] = h2Opts;
      }

      // HTTP
      if (formData.network === 'http') {
        const httpOpts: any = {};
        if (formData.httpHost) httpOpts.host = [formData.httpHost];
        if (formData.httpPath) httpOpts.path = [formData.httpPath];
        if (formData.httpHeaders) httpOpts.headers = JSON.parse(formData.httpHeaders);
        if (Object.keys(httpOpts).length > 0) (proxy as any)['http-opts'] = httpOpts;
      }

      // Hysteria
      if (type === 'hysteria' || type === 'hysteria2') {
        if (formData.hysteriaUpMbps) (proxy as any)['up'] = formData.hysteriaUpMbps;
        if (formData.hysteriaDownMbps) (proxy as any)['down'] = formData.hysteriaDownMbps;
        if (formData.hysteriaObfs) (proxy as any)['obfs'] = formData.hysteriaObfs;
      }

      if (type === 'vmess' && !proxy.cipher) {
        proxy.cipher = 'auto';
      }

      // TUIC
      if (type === 'tuic') {
        if (formData.tuicToken) (proxy as any)['token'] = formData.tuicToken;
        if (formData.tuicCongestionController) (proxy as any)['congestion-controller'] = formData.tuicCongestionController;
        if (formData.tuicUdpRelayMode) (proxy as any)['udp-relay-mode'] = formData.tuicUdpRelayMode;
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
                    "flex items-center gap-2 flex-1",
                    canNavigate && "cursor-pointer group"
                  )}
                  onClick={() => canNavigate && setCurrentStep(step.id)}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    currentStep === step.id
                      ? "bg-blue-500 text-white shadow-lg scale-110"
                      : currentStep > step.id
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 dark:bg-zinc-800 text-gray-500",
                    canNavigate && currentStep !== step.id && "group-hover:scale-105 group-hover:shadow-md"
                  )}>
                    {currentStep > step.id ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-xs font-medium transition-colors",
                      currentStep === step.id ? "text-blue-600 dark:text-blue-400" : "text-gray-500",
                      canNavigate && currentStep !== step.id && "group-hover:text-blue-500"
                    )}>
                      步骤 {step.id}
                    </span>
                    <span className={cn(
                      "text-sm transition-colors",
                      currentStep === step.id ? "text-gray-900 dark:text-white font-semibold" : "text-gray-600 dark:text-gray-400",
                      canNavigate && currentStep !== step.id && "group-hover:text-gray-900 dark:group-hover:text-white"
                    )}>
                      {step.name}
                    </span>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "h-0.5 flex-1 mx-2 transition-all",
                    currentStep > step.id ? "bg-green-500" : "bg-gray-200 dark:bg-zinc-800"
                  )} />
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
                  className={cn(fieldErrors.name && "border-red-300")}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-500">{fieldErrors.name}</p>
                )}
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
                  <SelectTrigger className={cn(fieldErrors.type && "border-red-300")}>
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
                {fieldErrors.type && (
                  <p className="text-xs text-red-500">{fieldErrors.type}</p>
                )}
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
                  className={cn(fieldErrors.port && "border-red-300")}
                />
                {fieldErrors.port && (
                  <p className="text-xs text-red-500">{fieldErrors.port}</p>
                )}
              </div>

              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">
                  服务器地址 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.server}
                  onChange={(e) => handleFieldChange('server', e.target.value)}
                  placeholder="example.com"
                  className={cn(fieldErrors.server && "border-red-300")}
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
                <span className="font-medium">步骤 2/3：</span> 配置 {PROXY_TYPE_OPTIONS.find(o => o.value === formData.type)?.label || '协议'} 参数
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
                      Cipher {isFieldRequired(formData.type, 'cipher') && <span className="text-red-500">*</span>}
                    </label>
                    <Select
                      value={formData.cipher}
                      onValueChange={(value) => handleFieldChange('cipher', value)}
                    >
                      <SelectTrigger className={cn(fieldErrors.cipher && "border-red-300")}>
                        <SelectValue placeholder="选择加密方式" />
                      </SelectTrigger>
                      <SelectContent>
                    {(formData.type === 'vmess' ? VMESS_CIPHER_OPTIONS : CIPHER_OPTIONS).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.cipher && (
                      <p className="text-xs text-red-500">{fieldErrors.cipher}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">Shadowsocks 加密方式</p>
                  </div>
                )}

                {/* Password 字段 */}
                {shouldShowField(formData.type, 'password') && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Password {isFieldRequired(formData.type, 'password') && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => handleFieldChange('password', e.target.value)}
                      placeholder="password"
                      className={cn(fieldErrors.password && "border-red-300")}
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
                      UUID {isFieldRequired(formData.type, 'uuid') && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      value={formData.uuid}
                      onChange={(e) => handleFieldChange('uuid', e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className={cn("font-mono text-xs", fieldErrors.uuid && "border-red-300")}
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
                    <p className="text-xs text-gray-400 dark:text-gray-500">VMess 额外 ID，通常为 0</p>
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
                      className={cn(fieldErrors.sni && "border-red-300")}
                    />
                    {fieldErrors.sni && (
                      <p className="text-xs text-red-500">{fieldErrors.sni}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">TLS Server Name Indication</p>
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
                    className={cn("font-mono text-xs", fieldErrors.wsHeaders && "border-red-300")}
                  />
                  {fieldErrors.wsHeaders && (
                    <p className="text-xs text-red-500">{fieldErrors.wsHeaders}</p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">JSON 格式的自定义 Headers</p>
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
                    className={cn("font-mono text-xs", fieldErrors.httpHeaders && "border-red-300")}
                  />
                  {fieldErrors.httpHeaders && (
                    <p className="text-xs text-red-500">{fieldErrors.httpHeaders}</p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">JSON 格式的自定义 Headers</p>
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
                    className={cn(fieldErrors.hysteriaUpMbps && "border-red-300")}
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
                    className={cn(fieldErrors.hysteriaDownMbps && "border-red-300")}
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
                  <p className="text-xs text-gray-400 dark:text-gray-500">混淆功能，增强抗审查能力</p>
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
                    onValueChange={(value) => handleFieldChange('tuicCongestionController', value)}
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
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">UDP</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">启用 UDP 转发</div>
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
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">TLS</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">传输层加密</div>
                    </div>
                  </div>
                )}

                {shouldShowField(formData.type, 'skipCertVerify') && (
                  <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <Switch
                      checked={formData.skipCertVerify}
                      onCheckedChange={(checked) => handleFieldChange('skipCertVerify', checked)}
                      className="data-[state=checked]:bg-amber-500"
                    />
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">跳过验证</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">跳过证书验证</div>
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
          <div className={cn(
            "mx-6 mb-4 px-4 py-3 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2",
            submitStatus === 'validating' && "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
            submitStatus === 'saving' && "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
            submitStatus === 'testing' && "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800",
            submitStatus === 'success' && "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800",
            submitStatus === 'error' && "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
          )}>
            {submitStatus === 'validating' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0 mt-0.5" />}
            {submitStatus === 'saving' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0 mt-0.5" />}
            {submitStatus === 'testing' && <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0 mt-0.5" />}
            {submitStatus === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
            {submitStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <p className={cn(
                "text-sm font-medium",
                submitStatus === 'validating' && "text-blue-700 dark:text-blue-300",
                submitStatus === 'saving' && "text-blue-700 dark:text-blue-300",
                submitStatus === 'testing' && "text-amber-700 dark:text-amber-300",
                submitStatus === 'success' && "text-green-700 dark:text-green-300",
                submitStatus === 'error' && "text-red-700 dark:text-red-300"
              )}>
                {submitMessage}
              </p>
            </div>
          </div>
        )}

        {/* 导航按钮 */}
        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
          </div>
          <div className="flex gap-2">
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={submitting}
              >
                上一步
              </Button>
            )}
            {currentStep < 3 ? (
              <Button
                onClick={handleNext}
                disabled={!canGoNext || submitting}
              >
                下一步
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {editData ? '保存中...' : '提交中...'}
                  </>
                ) : (
                  editData ? '保存修改' : '完成'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProxyServers() {
  const status = useProxyStore((state) => state.status);
  const { toast } = useToast();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileMetadata, setProfileMetadata] = useState<ProfileMetadata | null>(null);
  const [proxyServers, setProxyServers] = useState<ProxyConfig[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxyConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyConfig | null>(null);
  const [addMenuValue, setAddMenuValue] = useState('');

  // 判断是否为远程订阅
  const isRemoteProfile = useMemo(() => {
    return profileMetadata?.profileType === 'remote';
  }, [profileMetadata]);

  const loadProxyServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const profileId = await ipc.getActiveProfileId();
      setActiveProfileId(profileId);

      if (!profileId) {
        setProxyServers([]);
        setProfileMetadata(null);
        return;
      }

      const [metadata, config] = await ipc.getProfile(profileId);
      setProfileMetadata(metadata);
      const sorted = [...config.proxies].sort((a, b) => a.name.localeCompare(b.name));
      setProxyServers(sorted);
    } catch (error) {
      console.error('Failed to load proxy servers:', error);
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingServers(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProxyServers();
  }, [loadProxyServers]);

  useEffect(() => {
    setDelays((prev) => {
      const next: Record<string, number> = {};
      for (const server of proxyServers) {
        if (prev[server.name] !== undefined) {
          next[server.name] = prev[server.name];
        }
      }
      return next;
    });
  }, [proxyServers]);

  const runDelayTest = useCallback(async (name: string) => {
    setTestingNodes((prev) => new Set(prev).add(name));
    try {
      const delay = await ipc.testProxyDelay(name);
      setDelays((prev) => ({ ...prev, [name]: delay }));
      return delay;
    } catch (error) {
      setDelays((prev) => ({ ...prev, [name]: -1 }));
      throw error;
    } finally {
      setTestingNodes((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }, []);

  const handleTestDelay = async (name: string) => {
    if (!status.running) {
      toast({
        title: '核心未启动',
        description: '请先启动核心服务后再测速',
        variant: 'destructive',
      });
      return;
    }

    try {
      await runDelayTest(name);
    } catch {
      // Delay result already stored.
    }
  };

  const handleTestAllDelays = async () => {
    if (!status.running) {
      toast({
        title: '核心未启动',
        description: '请先启动核心服务后再测速',
        variant: 'destructive',
      });
      return;
    }
    for (const server of proxyServers) {
      handleTestDelay(server.name);
    }
  };

  const ensureActiveProfile = () => {
    if (!activeProfileId) {
      const error = new Error('没有活跃的配置');
      toast({
        title: '无法保存',
        description: '请先在"配置"页面创建或激活一个配置文件',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const ensureCoreRunning = () => {
    if (!status.running) {
      const error = new Error('Proxy is not running');
      toast({
        title: '无法保存',
        description: '核心未启动，无法进行保存前测速',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleAddProxy = async (proxy: ProxyConfig) => {
    ensureActiveProfile();

    try {
      await ipc.addProxy(activeProfileId as string, proxy);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已添加` });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateProxy = async (proxy: ProxyConfig, originalProxy: ProxyConfig) => {
    ensureActiveProfile();

    try {
      await ipc.updateProxy(activeProfileId as string, originalProxy.name, proxy);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已更新` });
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSaveProxy = async (proxy: ProxyConfig, originalProxy?: ProxyConfig) => {
    if (originalProxy) {
      return handleUpdateProxy(proxy, originalProxy);
    }
    return handleAddProxy(proxy);
  };

  const handleDeleteProxy = async (name: string) => {
    if (!activeProfileId) return;

    try {
      await ipc.deleteProxy(activeProfileId, name);
      await loadProxyServers();
      setDelays((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      toast({ title: '删除成功', description: `服务器 "${name}" 已删除` });
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
  };

  const hasActiveProfile = useMemo(() => activeProfileId !== null, [activeProfileId]);
  const handleAddMenuSelect = (value: 'parse' | 'manual') => {
    setAddMenuValue('');
    if (value === 'parse') {
      setLinkDialogOpen(true);
      return;
    }
    setEditingProxy(null);
    setDialogOpen(true);
  };

  const renderAddServerMenu = (wrapperClassName?: string) => (
    <div className={wrapperClassName}>
      <Select
        value={addMenuValue}
        onValueChange={(value) => handleAddMenuSelect(value as 'parse' | 'manual')}
        disabled={!hasActiveProfile}
      >
        <SelectTrigger
          className="w-auto rounded-full h-10 px-4 font-medium hover:bg-accent hover:text-accent-foreground"
          disabled={!hasActiveProfile}
        >
          <span className="inline-flex items-center gap-2">
            <SelectValue placeholder="添加服务器" />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="parse">解析链接</SelectItem>
          <SelectItem value="manual">手动配置</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 pb-6 min-h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">服务器</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理配置文件中的服务器列表，支持增删改查与延迟测速
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!status.running && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 px-3 py-1 rounded-full">
              核心未启动，测速不可用
            </span>
          )}
          {!isRemoteProfile && (
            renderAddServerMenu()
          )}
          <Button
            variant="outline"
            onClick={loadProxyServers}
            className="rounded-full gap-2"
            disabled={loadingServers}
          >
            <RefreshCw className={cn("w-4 h-4", loadingServers && "animate-spin")} />
            刷新
          </Button>
        </div>
      </div>

      {loadingServers ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !hasActiveProfile ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px]">
          <AlertCircle className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      ) : proxyServers.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[12px]">
          <Wifi className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">暂无代理服务器</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            {isRemoteProfile ? '远程订阅的配置为只读，无法添加服务器' : '点击上方按钮添加新的服务器'}
          </p>
          {!isRemoteProfile && (
            renderAddServerMenu("mt-6")
          )}
        </div>
      ) : (
        <BentoCard
          className="rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none"
          title="配置服务器"
          icon={Wifi}
          iconColor="text-emerald-500"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestAllDelays}
              disabled={!status.running || loadingServers || proxyServers.length === 0}
              className="h-7 px-2 text-xs text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <Zap className="w-3.5 h-3.5 mr-1" />
              测速全部
            </Button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-5">
            {proxyServers.map((server) => {
              const isTesting = testingNodes.has(server.name);
              const delay = delays[server.name];

              return (
                <div
                  key={server.name}
                  className="relative p-2.5 rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-600 transition-all flex flex-col justify-between h-[90px] group overflow-hidden"
                >
                  {!isRemoteProfile && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="编辑"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProxy(server);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(server);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}

                  <div className="z-10">
                    <div className="font-medium text-xs text-gray-700 dark:text-gray-300 line-clamp-1 mb-0.5">
                      {server.name}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate opacity-60">
                      {server.server}:{server.port}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "absolute -right-4 -bottom-4 w-12 h-12 rounded-full opacity-5 pointer-events-none transition-opacity group-hover:opacity-10",
                      getProxyTypeBgColor(server.type)
                    )}
                  />

                  <div className="flex items-end justify-between z-10">
                    <div className="flex flex-wrap gap-1">
                      <span className={cn("text-[9px] font-bold rounded-md px-1 py-0.5 uppercase tracking-wider", getProxyTypeColor(server.type))}>
                        {server.type}
                      </span>
                      {server.udp && (
                        <span className="text-[9px] font-bold rounded-md px-1 py-0.5 bg-blue-500/5 text-blue-600 dark:text-blue-400 border border-blue-500/10">
                          UDP
                        </span>
                      )}
                    </div>

                    <div>
                      {isTesting ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                      ) : delay !== undefined ? (
                        <div className="flex items-center gap-1">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              delay < 0 ? 'bg-red-400' : delay < 200 ? 'bg-emerald-400' : 'bg-amber-400'
                            )}
                          />
                          <span
                            className={cn('text-[10px] font-bold', getDelayColorClass(delay).replace('bg-', 'text-').replace('/10', ''))}
                          >
                            {formatDelay(delay)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-md cursor-pointer"
                          onClick={() => handleTestDelay(server.name)}
                        >
                          <Zap className="w-3 h-3 text-gray-400 hover:text-emerald-500" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </BentoCard>
      )}

      <LinkParseDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onSuccess={handleAddProxy}
        statusRunning={status.running}
      />

      <ProxyServerDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingProxy(null);
        }}
        onSubmit={handleSaveProxy}
        editData={editingProxy}
        statusRunning={status.running}
      />

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            确定要删除服务器 "{deleteConfirm?.name}" 吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.name) {
                  handleDeleteProxy(deleteConfirm.name);
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
