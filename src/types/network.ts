export interface PublicIpInfo {
  ip: string;
  /** 国家或地区编码（如 CN, US, TW, HK 等） */
  regionCode: string;
  source: string;
}

export interface LocalIpInfo {
  preferredIpv4: string | null;
  ipv4: string[];
  ipv6: string[];
}

export interface NetworkExtensionStatus {
  supported: boolean;
  installed: boolean;
  enabled: boolean;
  message: string;
}
