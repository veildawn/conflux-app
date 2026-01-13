use crate::config::ConfigManager;

/// 生成终端代理命令（用于 export / PowerShell env）
pub fn build_terminal_proxy_command() -> Result<String, String> {
    let config_manager = ConfigManager::new().map_err(|e| e.to_string())?;
    let config = config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    Ok(build_terminal_proxy_command_with_ports(
        config.port.unwrap_or(7890),
        config.socks_port.unwrap_or(7891),
    ))
}

/// 生成终端代理命令（已知端口）
pub fn build_terminal_proxy_command_with_ports(http_port: u16, socks_port: u16) -> String {
    let http = format!("http://127.0.0.1:{http_port}");
    let socks = format!("socks5://127.0.0.1:{socks_port}");

    #[cfg(target_os = "windows")]
    {
        // PowerShell 格式
        format!(
            "$env:http_proxy=\"{http}\"; $env:https_proxy=\"{http}\"; $env:all_proxy=\"{socks}\""
        )
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix/Linux/macOS 格式
        format!("export http_proxy={http} https_proxy={http} all_proxy={socks}")
    }
}
