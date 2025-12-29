import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Plus, RefreshCw, Trash2, Wifi, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  return {
    name: payload.ps || server,
    type: 'vmess',
    server,
    port,
    uuid: payload.id || undefined,
    alterId: payload.aid ? Number(payload.aid) : undefined,
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
}

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
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<'link' | 'manual'>('link');
  const [linkInput, setLinkInput] = useState('');
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
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData) {
      setFormData({
        name: editData.name || '',
        type: editData.type || '',
        server: editData.server || '',
        port: editData.port ? String(editData.port) : '',
        udp: editData.udp ?? false,
        tls: editData.tls ?? false,
        skipCertVerify: editData['skip-cert-verify'] ?? false,
        cipher: editData.cipher || '',
        password: editData.password || '',
        uuid: editData.uuid || '',
        alterId: editData.alterId ? String(editData.alterId) : '',
        network: editData.network || '',
        sni: editData.sni || '',
      });
      setActiveSection('manual');
      setLinkInput('');
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
      });
      setActiveSection('link');
      setLinkInput('');
    }
  }, [editData, open]);

  const portValue = Number(formData.port);
  const portValid = Number.isInteger(portValue) && portValue > 0 && portValue <= 65535;
  const canSubmit =
    !!formData.name.trim() &&
    !!formData.type.trim() &&
    !!formData.server.trim() &&
    portValid &&
    statusRunning &&
    !submitting;

  const handleParseLink = () => {
    try {
      const parsed = parseProxyLink(linkInput.trim());
      setFormData((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        type: parsed.type || prev.type,
        server: parsed.server || prev.server,
        port: Number.isFinite(parsed.port) ? String(parsed.port) : prev.port,
        udp: parsed.udp ?? prev.udp,
        tls: parsed.tls ?? prev.tls,
        skipCertVerify: parsed['skip-cert-verify'] ?? prev.skipCertVerify,
        cipher: parsed.cipher || prev.cipher,
        password: parsed.password || prev.password,
        uuid: parsed.uuid || prev.uuid,
        alterId: parsed.alterId !== undefined ? String(parsed.alterId) : prev.alterId,
        network: parsed.network || prev.network,
        sni: parsed.sni || prev.sni,
      }));
      setActiveSection('manual');
      toast({ title: '解析成功', description: '已填充到手动配置' });
    } catch (error) {
      toast({
        title: '解析失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const name = formData.name.trim();
      const type = formData.type.trim();
      const server = formData.server.trim();
      const cipher = formData.cipher.trim();
      const password = formData.password.trim();
      const uuid = formData.uuid.trim();
      const network = formData.network.trim();
      const sni = formData.sni.trim();
      const alterId = formData.alterId.trim();
      const alterIdValue = alterId ? Number(alterId) : NaN;
      const hasAlterId = Number.isFinite(alterIdValue);

      const proxy: ProxyConfig = {
        name,
        type,
        server,
        port: portValue,
        udp: formData.udp,
        ...(cipher ? { cipher } : {}),
        ...(password ? { password } : {}),
        ...(uuid ? { uuid } : {}),
        ...(hasAlterId ? { alterId: alterIdValue } : {}),
        ...(network ? { network } : {}),
        ...(formData.tls ? { tls: true } : {}),
        ...(formData.skipCertVerify ? { 'skip-cert-verify': true } : {}),
        ...(sni ? { sni } : {}),
      };

      await onSubmit(proxy, editData || undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editData ? '编辑服务器' : '添加服务器'}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as 'link' | 'manual')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-100 dark:bg-zinc-800 rounded-full p-1 h-9">
            <TabsTrigger value="link" className="rounded-full text-xs">
              链接解析
            </TabsTrigger>
            <TabsTrigger value="manual" className="rounded-full text-xs">
              手动配置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-3 mt-0">
            <div className="space-y-2">
              <label className="text-sm font-medium">订阅/分享链接</label>
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="ss:// / vmess:// / vless:// / trojan:// / tuic:// / hy2://"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleParseLink}
                  disabled={!linkInput.trim()}
                >
                  解析
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                解析后会自动切换到手动配置，方便继续补充信息。
              </p>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="my-server"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">类型</label>
                <Input
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="ss / vmess / trojan"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">端口</label>
                <Input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  placeholder="443"
                  min={1}
                  max={65535}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">服务器地址</label>
                <Input
                  value={formData.server}
                  onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                  placeholder="example.com"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.udp}
                  onCheckedChange={(checked) => setFormData({ ...formData, udp: checked })}
                  className="data-[state=checked]:bg-blue-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">UDP</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.tls}
                  onCheckedChange={(checked) => setFormData({ ...formData, tls: checked })}
                  className="data-[state=checked]:bg-emerald-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">TLS</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.skipCertVerify}
                  onCheckedChange={(checked) => setFormData({ ...formData, skipCertVerify: checked })}
                  className="data-[state=checked]:bg-amber-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">跳过证书验证</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cipher</label>
                <Input
                  value={formData.cipher}
                  onChange={(e) => setFormData({ ...formData, cipher: e.target.value })}
                  placeholder="aes-128-gcm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">UUID</label>
                <Input
                  value={formData.uuid}
                  onChange={(e) => setFormData({ ...formData, uuid: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Alter ID</label>
                <Input
                  value={formData.alterId}
                  onChange={(e) => setFormData({ ...formData, alterId: e.target.value })}
                  placeholder="0"
                  type="number"
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Network</label>
                <Input
                  value={formData.network}
                  onChange={(e) => setFormData({ ...formData, network: e.target.value })}
                  placeholder="ws / grpc"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">SNI</label>
                <Input
                  value={formData.sni}
                  onChange={(e) => setFormData({ ...formData, sni: e.target.value })}
                  placeholder="sni.example.com"
                />
              </div>
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
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editData ? '保存' : '添加'}
          </Button>
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
  const [editingProxy, setEditingProxy] = useState<ProxyConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyConfig | null>(null);

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
    ensureCoreRunning();

    let added = false;
    try {
      await ipc.addProxy(activeProfileId as string, proxy);
      added = true;
      await runDelayTest(proxy.name);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已添加` });
    } catch (error) {
      if (added) {
        try {
          await ipc.deleteProxy(activeProfileId as string, proxy.name);
          await loadProxyServers();
        } catch (rollbackError) {
          console.error('Failed to rollback proxy add:', rollbackError);
          toast({
            title: '回滚失败',
            description: String(rollbackError),
            variant: 'destructive',
          });
        }
      }
      toast({
        title: '保存失败',
        description: added ? '测速失败，已回滚修改' : String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateProxy = async (proxy: ProxyConfig, originalProxy: ProxyConfig) => {
    ensureActiveProfile();
    ensureCoreRunning();

    let updated = false;
    try {
      await ipc.updateProxy(activeProfileId as string, originalProxy.name, proxy);
      updated = true;
      await runDelayTest(proxy.name);
      await loadProxyServers();
      toast({ title: '保存成功', description: `服务器 "${proxy.name}" 已更新` });
    } catch (error) {
      if (updated) {
        try {
          await ipc.updateProxy(activeProfileId as string, proxy.name, originalProxy);
          await loadProxyServers();
        } catch (rollbackError) {
          console.error('Failed to rollback proxy update:', rollbackError);
          toast({
            title: '回滚失败',
            description: String(rollbackError),
            variant: 'destructive',
          });
        }
      }
      toast({
        title: '保存失败',
        description: updated ? '测速失败，已回滚修改' : String(error),
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
            <Button
              variant="outline"
              onClick={() => {
                setEditingProxy(null);
                setDialogOpen(true);
              }}
              className="rounded-full gap-2"
              disabled={!hasActiveProfile}
            >
              <Plus className="w-4 h-4" />
              添加
            </Button>
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
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px]">
          <AlertCircle className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">没有活跃的配置</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400 max-w-xs">
            请先在"配置"页面创建或激活一个配置文件
          </p>
        </div>
      ) : proxyServers.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center text-center py-12 px-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[24px]">
          <Wifi className="w-10 h-10 mb-4 opacity-30" />
          <p className="font-medium text-gray-600 dark:text-gray-300">暂无代理服务器</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            {isRemoteProfile ? '远程订阅的配置为只读，无法添加服务器' : '点击上方按钮添加新的服务器'}
          </p>
          {!isRemoteProfile && (
            <Button
              className="mt-6 rounded-full gap-2"
              onClick={() => {
                setEditingProxy(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              添加服务器
            </Button>
          )}
        </div>
      ) : (
        <BentoCard
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
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="编辑"
                        onClick={() => {
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
                        onClick={() => setDeleteConfirm(server)}
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
