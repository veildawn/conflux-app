import { cn } from '@/utils/cn';

interface IconProps {
  className?: string;
}

// 域名图标 - DOMAIN
export const DomainIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

// 域名后缀图标 - DOMAIN-SUFFIX
export const DomainSuffixIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
    <path d="M16 8l2 2-2 2" strokeWidth="2.5" />
  </svg>
);

// 域名关键词图标 - DOMAIN-KEYWORD
export const DomainKeywordIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9 9h6M9 12h4M9 15h5" />
  </svg>
);

// 地理IP图标 - GEOIP
export const GeoIPIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

// 地理站点图标 - GEOSITE
export const GeoSiteIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <circle cx="12" cy="10" r="3" />
    <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11a1.01 1.01 0 0 0 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7z" />
    <path d="M12 7v6M9 10h6" strokeWidth="1.5" />
  </svg>
);

// IP-CIDR 图标
export const IPCIDRIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    <circle cx="6.5" cy="17.5" r="1" fill="currentColor" />
    <circle cx="17.5" cy="17.5" r="1" fill="currentColor" />
  </svg>
);

// IP-CIDR6 图标 (IPv6)
export const IPCIDR6Icon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4z" />
    <path d="M4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4z" />
    <path d="M7 16h10v4H7z" />
    <text x="12" y="19.5" fontSize="5" fill="currentColor" textAnchor="middle" fontWeight="bold">6</text>
  </svg>
);

// 源IP图标 - SRC-IP-CIDR
export const SrcIPIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <rect x="3" y="6" width="8" height="12" rx="2" />
    <path d="M7 10v4" />
    <path d="M5 12h4" />
    <path d="M14 12h7" />
    <path d="M17 9l3 3-3 3" />
  </svg>
);

// 源端口图标 - SRC-PORT
export const SrcPortIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <rect x="2" y="6" width="8" height="12" rx="2" />
    <path d="M6 10v4" />
    <path d="M13 12h9" />
    <path d="M18 9l3 3-3 3" />
    <circle cx="6" cy="9" r="1" fill="currentColor" />
  </svg>
);

// 目标端口图标 - DST-PORT
export const DstPortIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M2 12h9" />
    <path d="M7 9l-3 3 3 3" />
    <rect x="14" y="6" width="8" height="12" rx="2" />
    <path d="M18 10v4" />
    <circle cx="18" cy="9" r="1" fill="currentColor" />
  </svg>
);

// 进程名图标 - PROCESS-NAME
export const ProcessNameIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9h6v6H9z" />
    <path d="M9 4v5M15 4v5M9 15v5M15 15v5M4 9h5M4 15h5M15 9h5M15 15h5" />
  </svg>
);

// 进程路径图标 - PROCESS-PATH
export const ProcessPathIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M3 6h18M3 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6M3 6l3-4h12l3 4" />
    <path d="M8 10h8M8 14h5" />
  </svg>
);

// 规则集图标 - RULE-SET
export const RuleSetIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M4 4h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path d="M4 14h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z" />
    <circle cx="7" cy="7" r="1" fill="currentColor" />
    <circle cx="7" cy="17" r="1" fill="currentColor" />
    <path d="M11 7h6M11 17h6" />
  </svg>
);

// 匹配所有图标 - MATCH
export const MatchIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12l3 3 5-6" strokeWidth="2.5" />
  </svg>
);

// 默认/未知规则图标
export const DefaultRuleIcon = ({ className }: IconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={cn("w-4 h-4", className)}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// 根据规则类型获取对应图标组件
// 支持配置规则格式（大写+连字符）和运行时规则格式（驼峰/混合）
export const getRuleIconComponent = (type: string) => {
  // 统一转换为大写进行比较
  const normalizedType = type.toUpperCase().replace(/-/g, '');
  
  switch (normalizedType) {
    case 'DOMAIN':
      return DomainIcon;
    case 'DOMAINSUFFIX':
      return DomainSuffixIcon;
    case 'DOMAINKEYWORD':
      return DomainKeywordIcon;
    case 'GEOIP':
      return GeoIPIcon;
    case 'GEOSITE':
      return GeoSiteIcon;
    case 'IPCIDR':
      return IPCIDRIcon;
    case 'IPCIDR6':
      return IPCIDR6Icon;
    case 'SRCIPCIDR':
      return SrcIPIcon;
    case 'SRCPORT':
      return SrcPortIcon;
    case 'DSTPORT':
      return DstPortIcon;
    case 'PROCESSNAME':
      return ProcessNameIcon;
    case 'PROCESSPATH':
      return ProcessPathIcon;
    case 'RULESET':
      return RuleSetIcon;
    case 'MATCH':
      return MatchIcon;
    default:
      return DefaultRuleIcon;
  }
};

