import { useEffect, useState, useMemo, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import {
  AlertCircle,
  CheckCircle2,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  Activity,
  Save,
  Pencil,
  Search,
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
import { ipc } from '@/services/ipc';
import {
  RULE_TYPES,
  parseRule,
  buildRule,
  type RuleType,
  type ProfileConfig,
} from '@/types/config';

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

const DEFAULT_POLICIES = ['DIRECT', 'REJECT'];

interface RuleSetOption {
  name: string;
}

// 完整 GeoIP 国家/地区代码 (ISO 3166-1 alpha-2 + 特殊代码)
const GEOIP_OPTIONS = [
  // 特殊代码
  { value: 'LAN', label: '局域网' },
  // 亚洲
  { value: 'CN', label: '中国' },
  { value: 'HK', label: '香港' },
  { value: 'MO', label: '澳门' },
  { value: 'TW', label: '台湾' },
  { value: 'JP', label: '日本' },
  { value: 'KR', label: '韩国' },
  { value: 'KP', label: '朝鲜' },
  { value: 'SG', label: '新加坡' },
  { value: 'MY', label: '马来西亚' },
  { value: 'TH', label: '泰国' },
  { value: 'VN', label: '越南' },
  { value: 'PH', label: '菲律宾' },
  { value: 'ID', label: '印度尼西亚' },
  { value: 'IN', label: '印度' },
  { value: 'PK', label: '巴基斯坦' },
  { value: 'BD', label: '孟加拉国' },
  { value: 'LK', label: '斯里兰卡' },
  { value: 'NP', label: '尼泊尔' },
  { value: 'MM', label: '缅甸' },
  { value: 'KH', label: '柬埔寨' },
  { value: 'LA', label: '老挝' },
  { value: 'BN', label: '文莱' },
  { value: 'TL', label: '东帝汶' },
  { value: 'MN', label: '蒙古' },
  { value: 'KZ', label: '哈萨克斯坦' },
  { value: 'UZ', label: '乌兹别克斯坦' },
  { value: 'TM', label: '土库曼斯坦' },
  { value: 'TJ', label: '塔吉克斯坦' },
  { value: 'KG', label: '吉尔吉斯斯坦' },
  { value: 'AF', label: '阿富汗' },
  { value: 'IR', label: '伊朗' },
  { value: 'IQ', label: '伊拉克' },
  { value: 'SA', label: '沙特阿拉伯' },
  { value: 'AE', label: '阿联酋' },
  { value: 'QA', label: '卡塔尔' },
  { value: 'KW', label: '科威特' },
  { value: 'BH', label: '巴林' },
  { value: 'OM', label: '阿曼' },
  { value: 'YE', label: '也门' },
  { value: 'JO', label: '约旦' },
  { value: 'LB', label: '黎巴嫩' },
  { value: 'SY', label: '叙利亚' },
  { value: 'IL', label: '以色列' },
  { value: 'PS', label: '巴勒斯坦' },
  { value: 'TR', label: '土耳其' },
  { value: 'CY', label: '塞浦路斯' },
  { value: 'GE', label: '格鲁吉亚' },
  { value: 'AM', label: '亚美尼亚' },
  { value: 'AZ', label: '阿塞拜疆' },
  // 欧洲
  { value: 'RU', label: '俄罗斯' },
  { value: 'UA', label: '乌克兰' },
  { value: 'BY', label: '白俄罗斯' },
  { value: 'PL', label: '波兰' },
  { value: 'DE', label: '德国' },
  { value: 'FR', label: '法国' },
  { value: 'GB', label: '英国' },
  { value: 'IT', label: '意大利' },
  { value: 'ES', label: '西班牙' },
  { value: 'PT', label: '葡萄牙' },
  { value: 'NL', label: '荷兰' },
  { value: 'BE', label: '比利时' },
  { value: 'LU', label: '卢森堡' },
  { value: 'CH', label: '瑞士' },
  { value: 'AT', label: '奥地利' },
  { value: 'IE', label: '爱尔兰' },
  { value: 'DK', label: '丹麦' },
  { value: 'SE', label: '瑞典' },
  { value: 'NO', label: '挪威' },
  { value: 'FI', label: '芬兰' },
  { value: 'IS', label: '冰岛' },
  { value: 'GR', label: '希腊' },
  { value: 'CZ', label: '捷克' },
  { value: 'SK', label: '斯洛伐克' },
  { value: 'HU', label: '匈牙利' },
  { value: 'RO', label: '罗马尼亚' },
  { value: 'BG', label: '保加利亚' },
  { value: 'RS', label: '塞尔维亚' },
  { value: 'HR', label: '克罗地亚' },
  { value: 'SI', label: '斯洛文尼亚' },
  { value: 'BA', label: '波黑' },
  { value: 'ME', label: '黑山' },
  { value: 'MK', label: '北马其顿' },
  { value: 'AL', label: '阿尔巴尼亚' },
  { value: 'XK', label: '科索沃' },
  { value: 'LT', label: '立陶宛' },
  { value: 'LV', label: '拉脱维亚' },
  { value: 'EE', label: '爱沙尼亚' },
  { value: 'MD', label: '摩尔多瓦' },
  { value: 'MT', label: '马耳他' },
  { value: 'MC', label: '摩纳哥' },
  { value: 'AD', label: '安道尔' },
  { value: 'SM', label: '圣马力诺' },
  { value: 'VA', label: '梵蒂冈' },
  { value: 'LI', label: '列支敦士登' },
  // 北美洲
  { value: 'US', label: '美国' },
  { value: 'CA', label: '加拿大' },
  { value: 'MX', label: '墨西哥' },
  { value: 'GT', label: '危地马拉' },
  { value: 'BZ', label: '伯利兹' },
  { value: 'HN', label: '洪都拉斯' },
  { value: 'SV', label: '萨尔瓦多' },
  { value: 'NI', label: '尼加拉瓜' },
  { value: 'CR', label: '哥斯达黎加' },
  { value: 'PA', label: '巴拿马' },
  { value: 'CU', label: '古巴' },
  { value: 'JM', label: '牙买加' },
  { value: 'HT', label: '海地' },
  { value: 'DO', label: '多米尼加' },
  { value: 'PR', label: '波多黎各' },
  { value: 'BS', label: '巴哈马' },
  { value: 'TT', label: '特立尼达和多巴哥' },
  { value: 'BB', label: '巴巴多斯' },
  // 南美洲
  { value: 'BR', label: '巴西' },
  { value: 'AR', label: '阿根廷' },
  { value: 'CL', label: '智利' },
  { value: 'CO', label: '哥伦比亚' },
  { value: 'PE', label: '秘鲁' },
  { value: 'VE', label: '委内瑞拉' },
  { value: 'EC', label: '厄瓜多尔' },
  { value: 'BO', label: '玻利维亚' },
  { value: 'PY', label: '巴拉圭' },
  { value: 'UY', label: '乌拉圭' },
  { value: 'GY', label: '圭亚那' },
  { value: 'SR', label: '苏里南' },
  // 大洋洲
  { value: 'AU', label: '澳大利亚' },
  { value: 'NZ', label: '新西兰' },
  { value: 'PG', label: '巴布亚新几内亚' },
  { value: 'FJ', label: '斐济' },
  { value: 'SB', label: '所罗门群岛' },
  { value: 'VU', label: '瓦努阿图' },
  { value: 'NC', label: '新喀里多尼亚' },
  { value: 'PF', label: '法属波利尼西亚' },
  { value: 'WS', label: '萨摩亚' },
  { value: 'TO', label: '汤加' },
  { value: 'GU', label: '关岛' },
  // 非洲
  { value: 'EG', label: '埃及' },
  { value: 'ZA', label: '南非' },
  { value: 'NG', label: '尼日利亚' },
  { value: 'KE', label: '肯尼亚' },
  { value: 'ET', label: '埃塞俄比亚' },
  { value: 'GH', label: '加纳' },
  { value: 'TZ', label: '坦桑尼亚' },
  { value: 'UG', label: '乌干达' },
  { value: 'MA', label: '摩洛哥' },
  { value: 'DZ', label: '阿尔及利亚' },
  { value: 'TN', label: '突尼斯' },
  { value: 'LY', label: '利比亚' },
  { value: 'SD', label: '苏丹' },
  { value: 'AO', label: '安哥拉' },
  { value: 'MZ', label: '莫桑比克' },
  { value: 'ZW', label: '津巴布韦' },
  { value: 'ZM', label: '赞比亚' },
  { value: 'BW', label: '博茨瓦纳' },
  { value: 'NA', label: '纳米比亚' },
  { value: 'SN', label: '塞内加尔' },
  { value: 'CI', label: '科特迪瓦' },
  { value: 'CM', label: '喀麦隆' },
  { value: 'CD', label: '刚果(金)' },
  { value: 'CG', label: '刚果(布)' },
  { value: 'RW', label: '卢旺达' },
  { value: 'MU', label: '毛里求斯' },
  { value: 'MG', label: '马达加斯加' },
  { value: 'SC', label: '塞舌尔' },
];

// 完整 GeoSite 分类 (基于 v2ray/domain-list-community 和 MetaCubeX/meta-rules-dat)
const GEOSITE_OPTIONS = [
  // 地理位置分类
  { value: 'cn', label: 'cn (中国网站)' },
  { value: 'geolocation-cn', label: 'geolocation-cn (中国域名)' },
  { value: 'geolocation-!cn', label: 'geolocation-!cn (非中国域名)' },
  { value: 'tld-cn', label: 'tld-cn (中国顶级域名)' },
  { value: 'tld-!cn', label: 'tld-!cn (非中国顶级域名)' },
  // 广告与隐私
  { value: 'category-ads', label: 'category-ads (广告域名)' },
  { value: 'category-ads-all', label: 'category-ads-all (全部广告)' },
  { value: 'category-porn', label: 'category-porn (成人内容)' },
  // 社交媒体
  { value: 'facebook', label: 'facebook (脸书)' },
  { value: 'instagram', label: 'instagram (照片墙)' },
  { value: 'twitter', label: 'twitter (推特/X)' },
  { value: 'tiktok', label: 'tiktok (海外抖音)' },
  { value: 'linkedin', label: 'linkedin (领英)' },
  { value: 'pinterest', label: 'pinterest (图片社交)' },
  { value: 'reddit', label: 'reddit (红迪论坛)' },
  { value: 'snapchat', label: 'snapchat (阅后即焚)' },
  { value: 'discord', label: 'discord (游戏语音)' },
  { value: 'tumblr', label: 'tumblr (汤不热)' },
  { value: 'quora', label: 'quora (问答社区)' },
  // 通讯软件
  { value: 'telegram', label: 'telegram (电报)' },
  { value: 'whatsapp', label: 'whatsapp (即时通讯)' },
  { value: 'signal', label: 'signal (加密通讯)' },
  { value: 'line', label: 'line (日韩通讯)' },
  { value: 'viber', label: 'viber (网络电话)' },
  { value: 'skype', label: 'skype (视频通话)' },
  { value: 'zoom', label: 'zoom (视频会议)' },
  { value: 'slack', label: 'slack (团队协作)' },
  // 搜索引擎
  { value: 'google', label: 'google (谷歌)' },
  { value: 'bing', label: 'bing (必应)' },
  { value: 'duckduckgo', label: 'duckduckgo (隐私搜索)' },
  { value: 'yahoo', label: 'yahoo (雅虎)' },
  { value: 'yandex', label: 'yandex (俄罗斯搜索)' },
  // 视频流媒体
  { value: 'youtube', label: 'youtube (油管)' },
  { value: 'netflix', label: 'netflix (奈飞)' },
  { value: 'hulu', label: 'hulu (葫芦)' },
  { value: 'disney', label: 'disney (迪士尼+)' },
  { value: 'hbo', label: 'hbo (HBO Max)' },
  { value: 'primevideo', label: 'primevideo (亚马逊视频)' },
  { value: 'twitch', label: 'twitch (游戏直播)' },
  { value: 'vimeo', label: 'vimeo (视频分享)' },
  { value: 'dailymotion', label: 'dailymotion (每日影片)' },
  { value: 'niconico', label: 'niconico (N站/日本弹幕)' },
  { value: 'abema', label: 'abema (日本网络电视)' },
  { value: 'dazn', label: 'dazn (体育直播)' },
  { value: 'crunchyroll', label: 'crunchyroll (动漫平台)' },
  // 音乐流媒体
  { value: 'spotify', label: 'spotify (声田音乐)' },
  { value: 'apple', label: 'apple (苹果服务)' },
  { value: 'soundcloud', label: 'soundcloud (声云音乐)' },
  { value: 'pandora', label: 'pandora (潘多拉电台)' },
  { value: 'tidal', label: 'tidal (高清音乐)' },
  { value: 'deezer', label: 'deezer (法国音乐)' },
  // AI 服务
  { value: 'openai', label: 'openai (ChatGPT)' },
  { value: 'anthropic', label: 'anthropic (Claude)' },
  { value: 'perplexity', label: 'perplexity (AI搜索)' },
  { value: 'bard', label: 'bard (Google AI)' },
  // 科技公司
  { value: 'microsoft', label: 'microsoft (微软)' },
  { value: 'azure', label: 'azure (微软云)' },
  { value: 'github', label: 'github (代码托管)' },
  { value: 'gitlab', label: 'gitlab (代码托管)' },
  { value: 'amazon', label: 'amazon (亚马逊)' },
  { value: 'aws', label: 'aws (亚马逊云)' },
  { value: 'cloudflare', label: 'cloudflare (CDN服务)' },
  { value: 'oracle', label: 'oracle (甲骨文)' },
  { value: 'ibm', label: 'ibm (国际商业机器)' },
  { value: 'nvidia', label: 'nvidia (英伟达)' },
  { value: 'intel', label: 'intel (英特尔)' },
  { value: 'amd', label: 'amd (超微半导体)' },
  { value: 'adobe', label: 'adobe (设计软件)' },
  { value: 'autodesk', label: 'autodesk (CAD软件)' },
  { value: 'atlassian', label: 'atlassian (Jira/Confluence)' },
  { value: 'jetbrains', label: 'jetbrains (开发工具)' },
  { value: 'docker', label: 'docker (容器技术)' },
  { value: 'mozilla', label: 'mozilla (火狐浏览器)' },
  { value: 'wikimedia', label: 'wikimedia (维基媒体)' },
  { value: 'wikipedia', label: 'wikipedia (维基百科)' },
  // 游戏
  { value: 'steam', label: 'steam (游戏平台)' },
  { value: 'epicgames', label: 'epicgames (Epic游戏)' },
  { value: 'ea', label: 'ea (艺电游戏)' },
  { value: 'ubisoft', label: 'ubisoft (育碧游戏)' },
  { value: 'blizzard', label: 'blizzard (暴雪游戏)' },
  { value: 'riotgames', label: 'riotgames (拳头游戏)' },
  { value: 'playstation', label: 'playstation (索尼PS)' },
  { value: 'xbox', label: 'xbox (微软Xbox)' },
  { value: 'nintendo', label: 'nintendo (任天堂)' },
  { value: 'rockstar', label: 'rockstar (R星游戏)' },
  { value: 'gog', label: 'gog (无DRM游戏)' },
  { value: 'garena', label: 'garena (竞舞游戏)' },
  // 购物
  { value: 'ebay', label: 'ebay (易贝拍卖)' },
  { value: 'aliexpress', label: 'aliexpress (速卖通)' },
  { value: 'shopify', label: 'shopify (电商建站)' },
  { value: 'etsy', label: 'etsy (手工艺品)' },
  { value: 'wish', label: 'wish (低价购物)' },
  // 金融
  { value: 'paypal', label: 'paypal (贝宝支付)' },
  { value: 'stripe', label: 'stripe (在线支付)' },
  { value: 'wise', label: 'wise (跨境汇款)' },
  { value: 'binance', label: 'binance (币安交易所)' },
  { value: 'coinbase', label: 'coinbase (加密货币)' },
  { value: 'kraken', label: 'kraken (加密交易所)' },
  // 新闻媒体
  { value: 'bbc', label: 'bbc (英国广播)' },
  { value: 'cnn', label: 'cnn (美国有线新闻)' },
  { value: 'nytimes', label: 'nytimes (纽约时报)' },
  { value: 'washingtonpost', label: 'washingtonpost (华盛顿邮报)' },
  { value: 'theguardian', label: 'theguardian (卫报)' },
  { value: 'reuters', label: 'reuters (路透社)' },
  { value: 'bloomberg', label: 'bloomberg (彭博社)' },
  { value: 'wsj', label: 'wsj (华尔街日报)' },
  { value: 'economist', label: 'economist (经济学人)' },
  { value: 'foxnews', label: 'foxnews (福克斯新闻)' },
  { value: 'nbcnews', label: 'nbcnews (NBC新闻)' },
  { value: 'abcnews', label: 'abcnews (ABC新闻)' },
  // 中国服务
  { value: 'baidu', label: 'baidu (百度)' },
  { value: 'alibaba', label: 'alibaba (阿里巴巴)' },
  { value: 'alipay', label: 'alipay (支付宝)' },
  { value: 'taobao', label: 'taobao (淘宝)' },
  { value: 'tmall', label: 'tmall (天猫)' },
  { value: 'jd', label: 'jd (京东)' },
  { value: 'tencent', label: 'tencent (腾讯)' },
  { value: 'wechat', label: 'wechat (微信)' },
  { value: 'weibo', label: 'weibo (微博)' },
  { value: 'bilibili', label: 'bilibili (B站)' },
  { value: 'douyin', label: 'douyin (抖音)' },
  { value: 'zhihu', label: 'zhihu (知乎)' },
  { value: 'douban', label: 'douban (豆瓣)' },
  { value: 'xiaohongshu', label: 'xiaohongshu (小红书)' },
  { value: 'kuaishou', label: 'kuaishou (快手)' },
  { value: 'meituan', label: 'meituan (美团)' },
  { value: 'didi', label: 'didi (滴滴)' },
  { value: 'bytedance', label: 'bytedance (字节跳动)' },
  { value: 'netease', label: 'netease (网易)' },
  { value: '163', label: '163 (网易邮箱)' },
  { value: 'huawei', label: 'huawei (华为)' },
  { value: 'xiaomi', label: 'xiaomi (小米)' },
  { value: 'oppo', label: 'oppo (欧珀手机)' },
  { value: 'vivo', label: 'vivo (维沃手机)' },
  { value: 'iqiyi', label: 'iqiyi (爱奇艺)' },
  { value: 'youku', label: 'youku (优酷视频)' },
  { value: 'sohu', label: 'sohu (搜狐)' },
  { value: 'sina', label: 'sina (新浪)' },
  { value: 'cctv', label: 'cctv (中央电视台)' },
  { value: 'caixin', label: 'caixin (财新传媒)' },
  // 日韩服务
  { value: 'naver', label: 'naver (韩国搜索)' },
  { value: 'daum', label: 'daum (韩国门户)' },
  { value: 'kakao', label: 'kakao (韩国通讯)' },
  { value: 'rakuten', label: 'rakuten (乐天)' },
  { value: 'dmm', label: 'dmm (日本数字内容)' },
  // VPN 与代理相关
  { value: 'private', label: 'private (私有网络)' },
  // 其他分类
  { value: 'category-dev', label: 'category-dev (开发者工具)' },
  { value: 'category-scholar', label: 'category-scholar (学术网站)' },
  { value: 'category-games', label: 'category-games (游戏网站)' },
  { value: 'category-media', label: 'category-media (流媒体网站)' },
  { value: 'category-companies', label: 'category-companies (企业官网)' },
  { value: 'category-gov', label: 'category-gov (政府网站)' },
  { value: 'category-entertainment', label: 'category-entertainment (娱乐网站)' },
  { value: 'category-communication', label: 'category-communication (通讯服务)' },
  { value: 'category-social-media', label: 'category-social-media (社交媒体)' },
  { value: 'category-shopping', label: 'category-shopping (购物网站)' },
  { value: 'category-news', label: 'category-news (新闻媒体)' },
  { value: 'category-finance', label: 'category-finance (金融服务)' },
];

// 根据规则类型获取标签名称
const getPayloadLabel = (type: RuleType): string => {
  switch (type) {
    case 'DOMAIN':
      return '域名';
    case 'DOMAIN-SUFFIX':
      return '域名后缀';
    case 'DOMAIN-KEYWORD':
      return '关键词';
    case 'GEOIP':
      return '国家/地区';
    case 'GEOSITE':
      return '站点分类';
    case 'IP-CIDR':
    case 'IP-CIDR6':
      return 'IP 地址段';
    case 'SRC-IP-CIDR':
      return '源 IP 地址段';
    case 'SRC-PORT':
      return '源端口';
    case 'DST-PORT':
      return '目标端口';
    case 'PROCESS-NAME':
      return '进程名称';
    case 'PROCESS-PATH':
      return '进程路径';
    case 'RULE-SET':
      return '规则集';
    default:
      return '匹配内容';
  }
};

const STEP_METADATA = {
  1: { title: '匹配规则', description: '选择规则类型和匹配内容', icon: Shield },
  2: { title: '路由策略', description: '选择目标策略和高级选项', icon: Layers },
};

export default function RuleEditWindow() {
  const [searchParams] = useSearchParams();
  const editIndex = searchParams.get('index');
  const isEditing = editIndex !== null;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  // Profile data
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileConfig, setProfileConfig] = useState<ProfileConfig | null>(null);

  // Form data
  const [ruleType, setRuleType] = useState<RuleType>('DOMAIN');
  const [rulePayload, setRulePayload] = useState('');
  const [rulePolicy, setRulePolicy] = useState('DIRECT');
  const [noResolve, setNoResolve] = useState(false);
  const [portProtocol, setPortProtocol] = useState<'all' | 'tcp' | 'udp'>('all');

  // Search
  const [policyQuery, setPolicyQuery] = useState('');
  const [payloadQuery, setPayloadQuery] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileId = await ipc.getActiveProfileId();
        setActiveProfileId(profileId);

        if (profileId) {
          const [, config] = await ipc.getProfile(profileId);
          setProfileConfig(config);

          // If editing, load existing rule
          if (editIndex !== null) {
            const index = parseInt(editIndex, 10);
            const rules = config.rules || [];
            if (index >= 0 && index < rules.length) {
              const ruleStr = rules[index];
              const parsed = parseRule(ruleStr);
              if (parsed) {
                setRuleType(parsed.type);
                setRulePayload(parsed.payload);
                setRulePolicy(parsed.policy);

                // Set port protocol if present
                if (parsed.network) {
                  setPortProtocol(parsed.network);
                }

                // Check for no-resolve
                if (ruleStr.includes(',no-resolve')) {
                  setNoResolve(true);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(err);
        toast({ title: '加载失败', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [editIndex, toast]);

  // Derived data
  const rules = useMemo(() => profileConfig?.rules || [], [profileConfig]);

  const proxyGroups = useMemo(() => {
    return profileConfig?.['proxy-groups']?.map((g) => g.name) || [];
  }, [profileConfig]);

  const proxyGroupOptions = useMemo(() => {
    return Array.from(new Set(proxyGroups.filter((g) => !DEFAULT_POLICIES.includes(g)))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [proxyGroups]);

  const proxyNodeOptions = useMemo(() => {
    const nodes = profileConfig?.proxies?.map((proxy) => proxy.name).filter(Boolean) || [];
    return Array.from(new Set(nodes))
      .filter((name) => !DEFAULT_POLICIES.includes(name) && !proxyGroups.includes(name))
      .sort((a, b) => a.localeCompare(b));
  }, [profileConfig, proxyGroups]);

  const ruleProviders = useMemo(() => profileConfig?.['rule-providers'] || {}, [profileConfig]);

  const ruleSetOptions = useMemo<RuleSetOption[]>(() => {
    const options = new Map<string, RuleSetOption>();
    Object.keys(ruleProviders).forEach((name) => {
      options.set(name, { name });
    });
    rules.forEach((rule) => {
      const parsed = parseRule(rule);
      if (parsed?.type === 'RULE-SET' && parsed.payload) {
        if (!options.has(parsed.payload)) {
          options.set(parsed.payload, { name: parsed.payload });
        }
      }
    });
    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [ruleProviders, rules]);

  // Filtered GeoIP options
  const filteredGeoipOptions = useMemo(() => {
    if (!payloadQuery) return GEOIP_OPTIONS;
    const query = payloadQuery.toLowerCase();
    return GEOIP_OPTIONS.filter(
      (opt) => opt.value.toLowerCase().includes(query) || opt.label.toLowerCase().includes(query)
    );
  }, [payloadQuery]);

  // Filtered GeoSite options
  const filteredGeositeOptions = useMemo(() => {
    if (!payloadQuery) return GEOSITE_OPTIONS;
    const query = payloadQuery.toLowerCase();
    return GEOSITE_OPTIONS.filter(
      (opt) => opt.value.toLowerCase().includes(query) || opt.label.toLowerCase().includes(query)
    );
  }, [payloadQuery]);

  // All policy options combined
  const allPolicyOptions = useMemo(() => {
    return [
      { type: 'builtin', label: '基础', items: DEFAULT_POLICIES },
      { type: 'groups', label: '策略组', items: proxyGroupOptions },
      { type: 'nodes', label: '节点', items: proxyNodeOptions },
    ].filter((section) => section.items.length > 0);
  }, [proxyGroupOptions, proxyNodeOptions]);

  const commonPolicies = ['DIRECT', 'REJECT'];

  const filteredPolicyOptions = useMemo(() => {
    // If searching, show all matching including DIRECT/REJECT in the list if they match
    // If not searching, exclude common policies from the list as they are shown separately
    const query = policyQuery.toLowerCase();

    return allPolicyOptions
      .map((section) => {
        let items = section.items;
        if (!policyQuery && section.type === 'builtin') {
          // If not searching, we show DIRECT/REJECT separately, so remove them from list
          items = items.filter((i) => !commonPolicies.includes(i));
        }

        if (policyQuery) {
          items = items.filter((item) => item.toLowerCase().includes(query));
        }

        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [allPolicyOptions, policyQuery]);

  const currentRuleTypeConfig = RULE_TYPES.find((t) => t.value === ruleType);

  // Validation
  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (currentRuleTypeConfig?.hasPayload && !rulePayload.trim()) {
      next.payload = '请输入匹配内容';
    }
    if (!rulePolicy) {
      next.policy = '请选择目标策略';
    }
    return next;
  }, [currentRuleTypeConfig, rulePayload, rulePolicy]);

  const canSubmit = Object.keys(errors).length === 0 && !submitting && !loading;

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      if (errors.payload) {
        markTouched('payload');
        toast({ title: '验证失败', description: errors.payload, variant: 'destructive' });
        return;
      }
      setDirection('forward');
      setCurrentStep(2);
    }
  }, [currentStep, errors, toast]);

  const handleBack = useCallback(() => {
    if (currentStep === 2) {
      setDirection('backward');
      setCurrentStep(1);
    }
  }, [currentStep]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    // Mark all as touched on submit attempt
    setTouched({ payload: true, policy: true });

    if (!canSubmit || !activeProfileId || !profileConfig) return;
    setSubmitting(true);

    try {
      let newRule = buildRule(ruleType, rulePayload.trim(), rulePolicy);

      // Add no-resolve for IP rules if enabled
      if (noResolve && ['IP-CIDR', 'IP-CIDR6', 'GEOIP'].includes(ruleType)) {
        newRule += ',no-resolve';
      }

      // Add network type for port rules (tcp/udp as last parameter)
      if (['SRC-PORT', 'DST-PORT'].includes(ruleType) && portProtocol !== 'all') {
        newRule += `,${portProtocol}`;
      }

      let newRules: string[];

      if (isEditing && editIndex !== null) {
        const index = parseInt(editIndex, 10);
        newRules = [...rules];
        newRules[index] = newRule;
      } else {
        // Add new rule before MATCH
        const matchIndex = rules.findIndex((r) => r.startsWith('MATCH,'));
        if (matchIndex !== -1) {
          newRules = [...rules];
          newRules.splice(matchIndex, 0, newRule);
        } else {
          newRules = [...rules, newRule];
        }
      }

      const newConfig: ProfileConfig = {
        ...profileConfig,
        rules: newRules,
      };

      await ipc.updateProfileConfig(activeProfileId, newConfig);
      await emit('rules-changed');
      await getCurrentWindow().close();
    } catch (error) {
      console.error(error);
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    activeProfileId,
    profileConfig,
    ruleType,
    rulePayload,
    rulePolicy,
    noResolve,
    portProtocol,
    isEditing,
    editIndex,
    rules,
    toast,
  ]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(dragIgnoreSelector)) return;
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.warn('Failed to start dragging:', error);
      });
  };

  const getPayloadPlaceholder = (type: RuleType): string => {
    switch (type) {
      case 'DOMAIN':
        return '输入完整域名，如 example.com';
      case 'DOMAIN-SUFFIX':
        return '输入域名后缀，如 google.com';
      case 'DOMAIN-KEYWORD':
        return '输入关键词，如 google';
      case 'GEOIP':
        return '选择国家/地区';
      case 'GEOSITE':
        return '选择站点分类';
      case 'IP-CIDR':
        return '输入 IPv4 地址段，如 192.168.1.0/24';
      case 'IP-CIDR6':
        return '输入 IPv6 地址段，如 2001:db8::/32';
      case 'SRC-IP-CIDR':
        return '输入源 IP 地址段，如 192.168.1.0/24';
      case 'SRC-PORT':
        return '输入端口号，如 8080 或 8080-8090';
      case 'DST-PORT':
        return '输入目标端口，如 443 或 80-443';
      case 'RULE-SET':
        return '选择规则集';
      case 'PROCESS-NAME':
        return '输入进程名，如 chrome 或 Chrome.exe';
      case 'PROCESS-PATH':
        return '输入进程完整路径';
      default:
        return '输入匹配内容';
    }
  };

  const showNoResolve = ['IP-CIDR', 'IP-CIDR6', 'GEOIP'].includes(ruleType);
  const showPortProtocol = ['SRC-PORT', 'DST-PORT'].includes(ruleType);

  const currentMeta = STEP_METADATA[currentStep as keyof typeof STEP_METADATA];

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white/90">
        <Activity className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/8 bg-[radial-gradient(circle_at_10%_20%,rgba(200,255,200,0.4)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(180,220,255,0.6)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f8f8fb_0%,#eef0f7_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      <div className="relative h-full w-full grid grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <div className="flex flex-col bg-white/90 px-6 pt-10 pb-6 border-r border-black/5">
          <div className="flex flex-col gap-2">
            {[1, 2].map((s) => {
              const meta = STEP_METADATA[s as keyof typeof STEP_METADATA];
              const isActive = currentStep === s;
              const isCompleted = currentStep > s;
              return (
                <div
                  key={s}
                  onClick={() => {
                    // Can go back, but only go forward if step 1 is valid
                    if (s < currentStep) setCurrentStep(s);
                    if (s > currentStep && currentStep === 1 && !errors.payload) setCurrentStep(s);
                  }}
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
                  {isEditing ? '编辑规则' : '添加规则'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex flex-col overflow-hidden bg-white/80">
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
                  {/* Rule Type */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 ml-1">
                      规则类型
                    </div>
                    <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-4">
                      <Select
                        value={ruleType}
                        onValueChange={(v) => {
                          setRuleType(v as RuleType);
                          setRulePayload('');
                          setPayloadQuery('');
                          setPortProtocol('all');
                        }}
                      >
                        <SelectTrigger className="h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-medium">
                          <span className="truncate">
                            {currentRuleTypeConfig ? (
                              <>
                                <span className="font-semibold">{currentRuleTypeConfig.label}</span>
                                <span className="text-neutral-400 ml-1">
                                  - {currentRuleTypeConfig.description}
                                </span>
                              </>
                            ) : (
                              '选择规则类型'
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent
                          className="max-h-[300px] min-w-[320px]"
                          position="popper"
                          sideOffset={4}
                        >
                          {RULE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value} className="py-2">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="font-medium">{type.label}</span>
                                <span className="text-xs text-neutral-400">
                                  - {type.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Payload */}
                  {currentRuleTypeConfig?.hasPayload && (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 ml-1">
                        {getPayloadLabel(ruleType)}
                      </div>
                      <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-4">
                        {/* GEOIP 下拉选择 */}
                        {ruleType === 'GEOIP' ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                              <Input
                                value={payloadQuery}
                                onChange={(e) => setPayloadQuery(e.target.value)}
                                placeholder="搜索国家/地区..."
                                className="h-10 pl-10 rounded-xl bg-white/70 border border-white/70 text-sm"
                              />
                            </div>
                            <Select
                              value={rulePayload}
                              onValueChange={(v) => {
                                setRulePayload(v);
                                markTouched('payload');
                                setPayloadQuery('');
                              }}
                            >
                              <SelectTrigger className="h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-medium">
                                <SelectValue placeholder="选择国家/地区" />
                              </SelectTrigger>
                              <SelectContent
                                className="max-h-[280px] min-w-[260px]"
                                position="popper"
                                sideOffset={4}
                              >
                                {filteredGeoipOptions.length === 0 ? (
                                  <div className="py-4 text-center text-sm text-neutral-400">
                                    未找到匹配项
                                  </div>
                                ) : (
                                  filteredGeoipOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                      textValue={`${option.label} (${option.value})`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{option.label}</span>
                                        <span className="text-xs text-neutral-400">
                                          ({option.value})
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : ruleType === 'GEOSITE' ? (
                          /* GEOSITE 下拉选择 */
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                              <Input
                                value={payloadQuery}
                                onChange={(e) => setPayloadQuery(e.target.value)}
                                placeholder="搜索站点分类..."
                                className="h-10 pl-10 rounded-xl bg-white/70 border border-white/70 text-sm"
                              />
                            </div>
                            <Select
                              value={rulePayload}
                              onValueChange={(v) => {
                                setRulePayload(v);
                                markTouched('payload');
                                setPayloadQuery('');
                              }}
                            >
                              <SelectTrigger className="h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-medium">
                                <SelectValue placeholder="选择站点分类" />
                              </SelectTrigger>
                              <SelectContent
                                className="max-h-[280px] min-w-[300px]"
                                position="popper"
                                sideOffset={4}
                              >
                                {filteredGeositeOptions.length === 0 ? (
                                  <div className="py-4 text-center text-sm text-neutral-400">
                                    未找到匹配项
                                  </div>
                                ) : (
                                  filteredGeositeOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                      textValue={option.label}
                                    >
                                      <span className="font-medium">{option.label}</span>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : ruleType === 'RULE-SET' && ruleSetOptions.length > 0 ? (
                          /* RULE-SET 下拉选择 */
                          <Select
                            value={rulePayload}
                            onValueChange={(v) => {
                              setRulePayload(v);
                              markTouched('payload');
                            }}
                          >
                            <SelectTrigger className="h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-medium">
                              <SelectValue placeholder="选择规则集" />
                            </SelectTrigger>
                            <SelectContent
                              className="max-h-[300px]"
                              position="popper"
                              sideOffset={4}
                            >
                              {ruleSetOptions.map((option) => (
                                <SelectItem key={option.name} value={option.name}>
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : showPortProtocol ? (
                          /* 端口类型使用输入框 + 协议选择器 */
                          <div className="flex gap-3">
                            <Input
                              value={rulePayload}
                              onChange={(e) => setRulePayload(e.target.value)}
                              onBlur={() => markTouched('payload')}
                              placeholder={getPayloadPlaceholder(ruleType)}
                              className={cn(
                                'h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-mono flex-1',
                                touched.payload &&
                                  errors.payload &&
                                  'border-red-400/60 focus-visible:ring-red-400/30'
                              )}
                            />
                            <Select
                              value={portProtocol}
                              onValueChange={(v) => setPortProtocol(v as 'all' | 'tcp' | 'udp')}
                            >
                              <SelectTrigger className="h-12 w-32 rounded-xl bg-white/70 border border-white/70 text-sm font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={4}>
                                <SelectItem value="all">全部协议</SelectItem>
                                <SelectItem value="tcp">TCP</SelectItem>
                                <SelectItem value="udp">UDP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          /* 其他类型使用输入框 */
                          <Input
                            value={rulePayload}
                            onChange={(e) => setRulePayload(e.target.value)}
                            onBlur={() => markTouched('payload')}
                            placeholder={getPayloadPlaceholder(ruleType)}
                            className={cn(
                              'h-12 rounded-xl bg-white/70 border border-white/70 text-sm font-mono',
                              touched.payload &&
                                errors.payload &&
                                'border-red-400/60 focus-visible:ring-red-400/30'
                            )}
                          />
                        )}
                        {touched.payload && errors.payload && (
                          <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-red-500 animate-in fade-in slide-in-from-top-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {errors.payload}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  {/* Policy */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between ml-1">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-blue-500" />
                        目标策略
                      </div>
                      {rulePolicy && (
                        <div className="text-[11px] font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          已选: {rulePolicy}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] overflow-hidden">
                      <div className="p-3 border-b border-white/60 bg-white/60">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                          <Input
                            value={policyQuery}
                            onChange={(e) => setPolicyQuery(e.target.value)}
                            placeholder="搜索策略..."
                            className="h-9 pl-10 pr-10 rounded-xl bg-white/70 border border-white/70 text-sm font-medium focus-visible:ring-blue-500/30"
                          />
                          {policyQuery && (
                            <button
                              onClick={() => setPolicyQuery('')}
                              className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-neutral-100/80 text-neutral-500 text-xs hover:bg-neutral-200"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-3 custom-scrollbar">
                        {/* Common Policies - Quick Select */}
                        {!policyQuery && (
                          <div className="grid grid-cols-2 gap-2 px-1 mb-2">
                            {commonPolicies.map((policy) => {
                              const isSelected = rulePolicy === policy;
                              return (
                                <div
                                  key={policy}
                                  onClick={() => setRulePolicy(policy)}
                                  className={cn(
                                    'flex items-center justify-center gap-2 rounded-xl h-10 border transition-all cursor-pointer font-medium text-sm',
                                    isSelected
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                                      : 'bg-white/60 border-white/60 text-neutral-600 hover:bg-white/80 hover:scale-[1.02]'
                                  )}
                                >
                                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {policy}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {filteredPolicyOptions.length === 0 ? (
                          <div className="py-8 text-center text-sm text-neutral-400">
                            未找到匹配的策略
                          </div>
                        ) : (
                          filteredPolicyOptions.map((section) => (
                            <div key={section.type}>
                              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 px-2 mb-1.5 sticky top-0 bg-white/95 z-10 py-1 rounded-md">
                                {section.label}
                              </div>
                              <div className="space-y-1">
                                {section.items.map((policy) => {
                                  const isSelected = rulePolicy === policy;
                                  return (
                                    <div
                                      key={policy}
                                      onClick={() => setRulePolicy(policy)}
                                      className={cn(
                                        'flex items-center gap-3 rounded-xl px-3 py-2 border transition-all cursor-pointer',
                                        isSelected
                                          ? 'bg-blue-50/80 border-blue-200/50 shadow-sm'
                                          : 'bg-transparent border-transparent hover:bg-white/50'
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          'h-4 w-4 rounded-full border flex items-center justify-center transition-all shrink-0',
                                          isSelected
                                            ? 'bg-blue-600 border-blue-600'
                                            : 'border-neutral-300 bg-white'
                                        )}
                                      >
                                        {isSelected && (
                                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                        )}
                                      </div>
                                      <span
                                        className={cn(
                                          'text-sm transition-colors',
                                          isSelected
                                            ? 'font-semibold text-blue-700'
                                            : 'font-medium text-neutral-700'
                                        )}
                                      >
                                        {policy}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* No-resolve option for IP rules */}
                  {showNoResolve && (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400 ml-1">
                        高级选项
                      </div>
                      <div className="rounded-2xl border border-white/60 bg-white/50 shadow-[0_8px_20px_rgba(0,0,0,0.06)] p-4">
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setNoResolve(!noResolve)}
                        >
                          <div>
                            <div className="text-sm font-semibold text-neutral-800">no-resolve</div>
                            <div className="text-xs text-neutral-400">
                              跳过域名解析，直接匹配 IP
                            </div>
                          </div>
                          <Switch
                            className="scale-90 data-[state=checked]:bg-blue-600"
                            checked={noResolve}
                            onCheckedChange={setNoResolve}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
                  onClick={handleClose}
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
                {currentStep < 2 ? (
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
                    {isEditing ? '保存修改' : '确认添加'}
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
