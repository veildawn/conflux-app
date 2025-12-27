use anyhow::Result;
use std::path::PathBuf;

/// 获取应用数据目录
pub fn get_app_data_dir() -> Result<PathBuf> {
    let path = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find data directory"))?
        .join("Conflux");

    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// 获取应用配置目录
pub fn get_app_config_dir() -> Result<PathBuf> {
    let path = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find config directory"))?
        .join("Conflux");

    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// 获取 MiHomo 配置文件路径
pub fn get_mihomo_config_path() -> Result<PathBuf> {
    let data_dir = get_app_data_dir()?;
    Ok(data_dir.join("config.yaml"))
}

/// 获取应用设置文件路径
pub fn get_app_settings_path() -> Result<PathBuf> {
    let config_dir = get_app_config_dir()?;
    Ok(config_dir.join("settings.json"))
}

/// 获取日志目录
#[allow(dead_code)]
pub fn get_logs_dir() -> Result<PathBuf> {
    let data_dir = get_app_data_dir()?;
    let logs_dir = data_dir.join("logs");
    std::fs::create_dir_all(&logs_dir)?;
    Ok(logs_dir)
}

/// 获取 MiHomo 二进制文件路径
#[cfg(target_os = "windows")]
pub fn get_mihomo_binary_name() -> &'static str {
    "mihomo-windows-amd64.exe"
}

#[cfg(target_os = "macos")]
pub fn get_mihomo_binary_name() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "mihomo-darwin-arm64"
    } else {
        "mihomo-darwin-amd64"
    }
}

#[cfg(target_os = "linux")]
pub fn get_mihomo_binary_name() -> &'static str {
    "mihomo-linux-amd64"
}

/// 生成随机 API Secret
pub fn generate_api_secret() -> String {
    uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string()
}
