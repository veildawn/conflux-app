import type { ProxyConfig } from '@/types/config';

// 颜色工具函数
export const getProxyTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks')
    return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
  if (t.includes('vmess') || t.includes('vless'))
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  if (t.includes('trojan')) return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (t.includes('hysteria')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (t.includes('wireguard')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (t.includes('tuic')) return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
  return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
};

export const getProxyTypeBgColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('ss') || t === 'shadowsocks') return 'bg-violet-500';
  if (t.includes('vmess') || t.includes('vless')) return 'bg-blue-500';
  if (t.includes('trojan')) return 'bg-red-500';
  if (t.includes('hysteria')) return 'bg-amber-500';
  if (t.includes('wireguard')) return 'bg-emerald-500';
  if (t.includes('tuic')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

// Base64 解码
export const decodeBase64 = (input: string) => {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = `${normalized}${padding}`;

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(base64);
  }

  throw new Error('Base64 decoder is unavailable');
};

// 布尔参数解析
export const parseBooleanParam = (value: string | null) => {
  if (!value) return undefined;
  return value === '1' || value.toLowerCase() === 'true';
};

// 名称解析
export const parseName = (raw: string | undefined) => {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

// Shadowsocks 链接解析
export const parseSsLink = (link: string): ProxyConfig => {
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

// VMess 链接解析
export const parseVmessLink = (link: string): ProxyConfig => {
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

// VLESS 链接解析
export const parseVlessLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid vless link');
  }

  const security = url.searchParams.get('security');
  const tlsEnabled = security && security !== 'none' ? true : undefined;
  const allowInsecure =
    parseBooleanParam(url.searchParams.get('allowInsecure')) ??
    parseBooleanParam(url.searchParams.get('insecure'));

  return {
    name: parseName(url.hash.slice(1)) || server,
    type: 'vless',
    server,
    port,
    uuid: decodeURIComponent(url.username),
    network: url.searchParams.get('type') || url.searchParams.get('transport') || undefined,
    tls: tlsEnabled,
    'skip-cert-verify': allowInsecure || undefined,
    sni:
      url.searchParams.get('sni') ||
      url.searchParams.get('peer') ||
      url.searchParams.get('servername') ||
      undefined,
    udp: parseBooleanParam(url.searchParams.get('udp')),
  };
};

// Trojan 链接解析
export const parseTrojanLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid trojan link');
  }

  const security = url.searchParams.get('security');
  const tlsEnabled = security && security !== 'none' ? true : undefined;
  const allowInsecure =
    parseBooleanParam(url.searchParams.get('allowInsecure')) ??
    parseBooleanParam(url.searchParams.get('insecure'));

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

// Hysteria 链接解析
export const parseHysteriaLink = (link: string): ProxyConfig => {
  const url = new URL(link);
  const server = url.hostname;
  const port = Number(url.port);
  if (!server || !Number.isFinite(port)) {
    throw new Error('Invalid hysteria link');
  }

  const allowInsecure = parseBooleanParam(url.searchParams.get('insecure'));
  const type = url.protocol.replace(':', '').toLowerCase();
  const password = url.password
    ? decodeURIComponent(url.password)
    : decodeURIComponent(url.username);

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

// TUIC 链接解析
export const parseTuicLink = (link: string): ProxyConfig => {
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

// 通用链接解析
export const parseProxyLink = (raw: string): ProxyConfig => {
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) {
    throw new Error('Empty link');
  }

  const lower = line.toLowerCase();
  if (lower.startsWith('ss://')) return parseSsLink(line);
  if (lower.startsWith('vmess://')) return parseVmessLink(line);
  if (lower.startsWith('vless://')) return parseVlessLink(line);
  if (lower.startsWith('trojan://')) return parseTrojanLink(line);
  if (
    lower.startsWith('hysteria://') ||
    lower.startsWith('hysteria2://') ||
    lower.startsWith('hy2://')
  ) {
    return parseHysteriaLink(line);
  }
  if (lower.startsWith('tuic://')) return parseTuicLink(line);

  throw new Error('Unsupported link format');
};
