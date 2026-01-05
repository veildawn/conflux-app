export interface ProxyFormData {
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
  wsHeaders?: string; // JSON字符串

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

export interface ProtocolFieldConfig {
  required: string[];
  optional: string[];
  defaults?: Partial<ProxyFormData>;
}
