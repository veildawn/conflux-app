export interface PublicIpInfo {
  ip: string;
  countryCode: string;
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
