import type { ProtocolFieldConfig } from './types';

// 协议类型选项
export const PROXY_TYPE_OPTIONS = [
  { value: 'ss', label: 'Shadowsocks', description: 'Shadowsocks 协议' },
  { value: 'vmess', label: 'VMess', description: 'V2Ray VMess 协议' },
  { value: 'vless', label: 'VLESS', description: 'V2Ray VLESS 协议' },
  { value: 'trojan', label: 'Trojan', description: 'Trojan 协议' },
  { value: 'hysteria', label: 'Hysteria', description: 'Hysteria 协议' },
  { value: 'hysteria2', label: 'Hysteria2', description: 'Hysteria2 协议' },
  { value: 'tuic', label: 'TUIC', description: 'TUIC 协议' },
];

// Cipher 加密方式选项（用于 Shadowsocks）
export const CIPHER_OPTIONS = [
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
  { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' },
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305' },
];

// Cipher 加密方式选项（用于 VMess）
export const VMESS_CIPHER_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'none', label: 'None' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' },
];

// Network 传输协议选项
export const NETWORK_OPTIONS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'ws', label: 'WebSocket' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'h2', label: 'HTTP/2' },
  { value: 'http', label: 'HTTP' },
];

// 协议字段配置映射
export const PROTOCOL_FIELDS: Record<string, ProtocolFieldConfig> = {
  ss: {
    required: ['cipher', 'password'],
    optional: ['udp', 'tls', 'sni'],
    defaults: { tls: false, udp: false },
  },
  vmess: {
    required: ['uuid', 'cipher'],
    optional: [
      'alterId',
      'network',
      'tls',
      'sni',
      'udp',
      'wsPath',
      'wsHeaders',
      'grpcServiceName',
      'h2Host',
      'h2Path',
      'httpHost',
      'httpPath',
      'httpHeaders',
    ],
    defaults: { alterId: '0', cipher: 'auto', tls: false, udp: false, network: 'tcp' },
  },
  vless: {
    required: ['uuid'],
    optional: [
      'network',
      'tls',
      'sni',
      'skipCertVerify',
      'udp',
      'wsPath',
      'grpcServiceName',
      'h2Host',
    ],
    defaults: { tls: false, udp: false, network: 'tcp' },
  },
  trojan: {
    required: ['password'],
    optional: ['tls', 'sni', 'skipCertVerify', 'udp', 'network', 'wsPath', 'grpcServiceName'],
    defaults: { tls: true, udp: false },
  },
  hysteria: {
    required: [],
    optional: [
      'password',
      'tls',
      'sni',
      'skipCertVerify',
      'udp',
      'hysteriaUpMbps',
      'hysteriaDownMbps',
      'hysteriaObfs',
    ],
    defaults: { tls: true, udp: true },
  },
  hysteria2: {
    required: [],
    optional: [
      'password',
      'tls',
      'sni',
      'skipCertVerify',
      'udp',
      'hysteriaUpMbps',
      'hysteriaDownMbps',
      'hysteriaObfs',
    ],
    defaults: { tls: true, udp: true },
  },
  tuic: {
    required: ['uuid', 'password'],
    optional: ['tls', 'sni', 'udp', 'tuicToken', 'tuicCongestionController', 'tuicUdpRelayMode'],
    defaults: { tls: true, udp: true },
  },
};
