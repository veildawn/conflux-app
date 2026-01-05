use anyhow::Result;
use std::fs;
use std::path::PathBuf;

use crate::models::{AppSettings, MihomoConfig};
use crate::utils::{get_app_settings_path, get_mihomo_config_path};

/// 配置管理器
pub struct ConfigManager {
    mihomo_config_path: PathBuf,
    app_settings_path: PathBuf,
}

impl ConfigManager {
    /// 创建新的配置管理器
    pub fn new() -> Result<Self> {
        Ok(Self {
            mihomo_config_path: get_mihomo_config_path()?,
            app_settings_path: get_app_settings_path()?,
        })
    }

    /// 获取 MiHomo 配置文件路径
    pub fn mihomo_config_path(&self) -> &PathBuf {
        &self.mihomo_config_path
    }

    /// 加载 MiHomo 配置
    pub fn load_mihomo_config(&self) -> Result<MihomoConfig> {
        if !self.mihomo_config_path.exists() {
            log::info!("Config file not found, creating default config");
            let default_config = MihomoConfig::default();
            self.save_mihomo_config(&default_config)?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(&self.mihomo_config_path)?;
        let mut config: MihomoConfig = serde_yaml::from_str(&content)?;
        let mut changed = false;

        // 自动修正规则提供者行为
        if !config.rule_providers.is_empty() {
            for (name, provider) in config.rule_providers.iter_mut() {
                // 1. 修正 behavior
                let name_lower = name.to_lowercase();

                // 修正 A: 被错误设置为 domain 的混合规则集 (如 ChinaDomain)
                // 如果 behavior 是 domain，但名字里包含 "chinadomain"，它实际上是 mixed/classical 规则 (包含 IP-CIDR)
                if provider.behavior == "domain" && name_lower.contains("chinadomain") {
                    provider.behavior = "classical".to_string();
                    log::info!(
                        "Auto-corrected rule provider '{}' behavior back to classical",
                        name
                    );
                    changed = true;
                }

                // 修正 B: 应该是 ipcidr 但被默认为 classical 的规则集 (如 ChinaCompanyIp, CN-IP)
                // 只有当 behavior 仍然是默认的 classical 时才进行猜测
                if provider.behavior == "classical" {
                    // 只对名称包含 ip 且不包含 vip/script/tip 的修正为 ipcidr
                    if (name_lower.contains("ip") || name_lower.contains("asn"))
                        && !name_lower.contains("vip")
                        && !name_lower.contains("script")
                        && !name_lower.contains("tip")
                    {
                        provider.behavior = "ipcidr".to_string();
                        log::info!("Auto-corrected rule provider '{}' behavior to ipcidr", name);
                        changed = true;
                    }
                    // 注意：不要自动把 domain 设为 behavior: domain，因为很多名为 Domain 的规则集实际上是 classical 格式
                }

                // 2. 修正 file 类型但路径无效的情况
                if provider.provider_type == "file" {
                    if let Some(path) = &provider.path {
                        let path_obj = std::path::Path::new(path);
                        // 检查路径是否不存在
                        if !path_obj.exists() {
                            let is_linux_path =
                                path.starts_with("/root") || path.starts_with("/home");
                            if is_linux_path {
                                log::warn!("Rule provider '{}' has invalid path: {}", name, path);

                                // 情况 A: 有 URL -> 改为 http 类型
                                if let Some(url) = &provider.url {
                                    if !url.is_empty() {
                                        provider.provider_type = "http".to_string();
                                        // 修正为本地合法路径
                                        if let Ok(data_dir) = crate::utils::get_app_data_dir() {
                                            let file_name = path_obj
                                                .file_name()
                                                .and_then(|n| n.to_str())
                                                .unwrap_or_else(|| name.as_str());
                                            let new_path = data_dir.join("ruleset").join(file_name);
                                            // 确保目录存在
                                            std::fs::create_dir_all(new_path.parent().unwrap())
                                                .ok();
                                            provider.path =
                                                Some(new_path.to_string_lossy().to_string());
                                        }
                                        log::info!(
                                            "Converted rule provider '{}' to http type",
                                            name
                                        );
                                        changed = true;
                                        continue;
                                    }
                                }

                                // 情况 B: 无 URL -> 创建空文件，保持 file 类型
                                // 避免 mihomo 启动失败
                                if let Ok(data_dir) = crate::utils::get_app_data_dir() {
                                    let file_name = format!("{}.yaml", name);
                                    let new_path = data_dir.join("ruleset").join(file_name);
                                    // 确保目录存在
                                    std::fs::create_dir_all(new_path.parent().unwrap()).ok();

                                    // 写入空 payload
                                    if let Ok(_) = std::fs::write(
                                        &new_path,
                                        "payload:\n  - DOMAIN,example.com",
                                    ) {
                                        provider.path =
                                            Some(new_path.to_string_lossy().to_string());
                                        log::info!("Fixed invalid path for local rule provider '{}': created placeholder file", name);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 如果配置有修改，保存回磁盘
        if changed {
            log::info!("Config auto-corrected, saving changes to disk...");
            if let Err(e) = self.save_mihomo_config(&config) {
                log::error!("Failed to save corrected config: {}", e);
            }
        }

        Ok(config)
    }

    /// 保存 MiHomo 配置
    pub fn save_mihomo_config(&self, config: &MihomoConfig) -> Result<()> {
        // 确保目录存在
        if let Some(parent) = self.mihomo_config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let yaml = serde_yaml::to_string(config)?;
        fs::write(&self.mihomo_config_path, yaml)?;
        log::info!("Config saved to: {:?}", self.mihomo_config_path);
        Ok(())
    }

    /// 验证 MiHomo 配置
    pub fn validate_mihomo_config(&self, config: &MihomoConfig) -> Result<bool> {
        // 检查端口是否有效
        if config.port == 0 {
            return Err(anyhow::anyhow!("Invalid HTTP port"));
        }
        if config.socks_port == 0 {
            return Err(anyhow::anyhow!("Invalid SOCKS port"));
        }

        // 检查模式是否有效
        let valid_modes = ["rule", "global", "direct"];
        if !valid_modes.contains(&config.mode.as_str()) {
            return Err(anyhow::anyhow!(
                "Invalid mode: {}. Must be one of: rule, global, direct",
                config.mode
            ));
        }

        // 检查日志级别
        let valid_levels = ["debug", "info", "warning", "error", "silent"];
        if !valid_levels.contains(&config.log_level.as_str()) {
            return Err(anyhow::anyhow!("Invalid log level: {}", config.log_level));
        }

        Ok(true)
    }

    /// 加载应用设置
    pub fn load_app_settings(&self) -> Result<AppSettings> {
        if !self.app_settings_path.exists() {
            log::info!("App settings not found, using defaults");
            return Ok(AppSettings::default());
        }

        let content = fs::read_to_string(&self.app_settings_path)?;
        let settings: AppSettings = serde_json::from_str(&content)?;
        Ok(settings)
    }

    /// 保存应用设置
    pub fn save_app_settings(&self, settings: &AppSettings) -> Result<()> {
        // 确保目录存在
        if let Some(parent) = self.app_settings_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let json = serde_json::to_string_pretty(settings)?;
        fs::write(&self.app_settings_path, json)?;
        log::info!("App settings saved to: {:?}", self.app_settings_path);
        Ok(())
    }

    /// 更新代理模式
    pub fn update_mode(&self, mode: &str) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.mode = mode.to_string();
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新 LAN 访问开关
    pub fn update_allow_lan(&self, enabled: bool) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.allow_lan = enabled;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新 HTTP/SOCKS 端口
    pub fn update_ports(&self, port: u16, socks_port: u16) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.port = port;
        config.socks_port = socks_port;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新 IPv6 开关
    pub fn update_ipv6(&self, enabled: bool) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.ipv6 = enabled;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新 TCP 并发开关
    pub fn update_tcp_concurrent(&self, enabled: bool) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.tcp_concurrent = enabled;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新 TUN 开关
    pub fn update_tun_mode(&self, enabled: bool) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        let mut tun = config.tun.unwrap_or_default();

        tun.enable = enabled;
        if enabled {
            if tun.stack.is_none() {
                tun.stack = Some("system".to_string());
            }
            if tun.auto_route.is_none() {
                tun.auto_route = Some(true);
            }
            if tun.auto_detect_interface.is_none() {
                tun.auto_detect_interface = Some(true);
            }
            // 严格路由：强制所有流量（包括局域网 DNS）走 TUN，无需修改系统 DNS
            if tun.strict_route.is_none() {
                tun.strict_route = Some(true);
            }
            // TUN 模式下必须设置 dns-hijack，否则 DNS 请求无法被正确处理
            if tun.dns_hijack.is_empty() {
                tun.dns_hijack = vec![
                    "any:53".to_string(),
                    "tcp://any:53".to_string(),
                ];
            }
        }

        config.tun = Some(tun);
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新混合端口
    pub fn update_mixed_port(&self, port: Option<u16>) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.mixed_port = port;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新进程查找模式
    pub fn update_find_process_mode(&self, mode: String) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.find_process_mode = mode;
        self.save_mihomo_config(&config)?;
        Ok(())
    }

}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new().expect("Failed to create ConfigManager")
    }
}
