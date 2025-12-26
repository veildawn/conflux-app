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
        let config: MihomoConfig = serde_yaml::from_str(&content)?;
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
            return Err(anyhow::anyhow!(
                "Invalid log level: {}",
                config.log_level
            ));
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

    /// 更新 MiHomo 配置中的 API secret
    #[allow(dead_code)]
    pub fn update_secret(&self, secret: &str) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.secret = secret.to_string();
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 更新代理模式
    pub fn update_mode(&self, mode: &str) -> Result<()> {
        let mut config = self.load_mihomo_config()?;
        config.mode = mode.to_string();
        self.save_mihomo_config(&config)?;
        Ok(())
    }

    /// 获取当前代理模式
    #[allow(dead_code)]
    pub fn get_mode(&self) -> Result<String> {
        let config = self.load_mihomo_config()?;
        Ok(config.mode)
    }

    /// 获取 HTTP 代理端口
    #[allow(dead_code)]
    pub fn get_http_port(&self) -> Result<u16> {
        let config = self.load_mihomo_config()?;
        Ok(config.port)
    }

    /// 获取 SOCKS 代理端口
    #[allow(dead_code)]
    pub fn get_socks_port(&self) -> Result<u16> {
        let config = self.load_mihomo_config()?;
        Ok(config.socks_port)
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new().expect("Failed to create ConfigManager")
    }
}

