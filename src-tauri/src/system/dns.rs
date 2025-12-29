use anyhow::{anyhow, Result};
use std::path::Path;
use std::process::Command;

const HELPER_PATH: &str = "/Library/PrivilegedHelperTools/com.conflux.helper";

/// 系统 DNS 管理器
pub struct SystemDns;

impl SystemDns {
    /// 检查 Helper 是否已安装
    #[cfg(target_os = "macos")]
    pub fn is_helper_installed() -> bool {
        Path::new(HELPER_PATH).exists()
    }

    /// 安装 Helper（需要在设置 TUN 权限时一起安装）
    /// 返回安装 Helper 所需的 shell 命令
    #[cfg(target_os = "macos")]
    pub fn get_helper_install_commands(helper_script_path: &str) -> String {
        format!(
            r#"mkdir -p /Library/PrivilegedHelperTools && cp '{}' '{}' && chmod 755 '{}'"#,
            helper_script_path, HELPER_PATH, HELPER_PATH
        )
    }

    /// 通过 Helper 设置 DNS（无需密码）
    #[cfg(target_os = "macos")]
    fn set_dns_via_helper(servers: &[&str]) -> Result<()> {
        if !Self::is_helper_installed() {
            return Err(anyhow!("Helper not installed"));
        }

        let servers_str = if servers.is_empty() || servers[0] == "empty" {
            "empty".to_string()
        } else {
            servers.join(" ")
        };

        let output = Command::new(HELPER_PATH)
            .args(["set-dns", &servers_str])
            .output()?;

        let result = String::from_utf8_lossy(&output.stdout);
        if result.trim() == "OK" {
            log::info!("DNS set via helper: {}", servers_str);
            Ok(())
        } else {
            Err(anyhow!("Helper failed: {}", result))
        }
    }

    /// 通过 Helper 重置 DNS（无需密码）
    #[cfg(target_os = "macos")]
    fn reset_dns_via_helper() -> Result<()> {
        if !Self::is_helper_installed() {
            return Err(anyhow!("Helper not installed"));
        }

        let output = Command::new(HELPER_PATH)
            .arg("reset-dns")
            .output()?;

        let result = String::from_utf8_lossy(&output.stdout);
        if result.trim() == "OK" {
            log::info!("DNS reset via helper");
            Ok(())
        } else {
            Err(anyhow!("Helper failed: {}", result))
        }
    }

    /// 获取当前网络服务名称（macOS）
    #[cfg(target_os = "macos")]
    fn get_primary_network_service() -> Result<String> {
        let output = Command::new("route")
            .args(["-n", "get", "default"])
            .output()?;

        let output_str = String::from_utf8_lossy(&output.stdout);

        let interface = output_str
            .lines()
            .find(|line| line.contains("interface:"))
            .and_then(|line| line.split(':').nth(1))
            .map(|s| s.trim().to_string())
            .ok_or_else(|| anyhow!("Cannot find network interface"))?;

        let output = Command::new("networksetup")
            .args(["-listallhardwareports"])
            .output()?;

        let output_str = String::from_utf8_lossy(&output.stdout);
        let mut current_service = String::new();

        for line in output_str.lines() {
            if line.starts_with("Hardware Port:") {
                current_service = line
                    .strip_prefix("Hardware Port:")
                    .map(|s| s.trim().to_string())
                    .unwrap_or_default();
            } else if line.starts_with("Device:") {
                let device = line
                    .strip_prefix("Device:")
                    .map(|s| s.trim())
                    .unwrap_or("");
                if device == interface {
                    return Ok(current_service);
                }
            }
        }

        Err(anyhow!("Cannot find network service for interface: {}", interface))
    }

    /// 获取当前 DNS 设置（macOS）
    #[cfg(target_os = "macos")]
    pub fn get_current_dns() -> Result<Vec<String>> {
        let service = Self::get_primary_network_service()?;

        let output = Command::new("networksetup")
            .args(["-getdnsservers", &service])
            .output()?;

        let output_str = String::from_utf8_lossy(&output.stdout);

        if output_str.contains("There aren't any") {
            return Ok(vec![]);
        }

        let dns_servers: Vec<String> = output_str
            .lines()
            .filter(|line| !line.is_empty())
            .map(|s| s.trim().to_string())
            .collect();

        Ok(dns_servers)
    }

    /// 设置系统 DNS（macOS）
    /// 优先使用 Helper（无需密码），如果 Helper 未安装则使用 osascript（需要密码）
    #[cfg(target_os = "macos")]
    pub fn set_dns(servers: &[&str]) -> Result<()> {
        // 优先尝试 Helper
        if Self::is_helper_installed() {
            return Self::set_dns_via_helper(servers);
        }

        // 回退到 osascript（需要密码）
        let service = Self::get_primary_network_service()?;

        let servers_str = if servers.is_empty() {
            "empty".to_string()
        } else {
            servers.join(" ")
        };

        log::info!("Setting DNS for service '{}': {} (via osascript)", service, servers_str);

        let script = format!(
            r#"do shell script "networksetup -setdnsservers '{}' {}" with administrator privileges with prompt "Conflux 需要管理员权限来配置 DNS""#,
            service, servers_str
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()?;

        if output.status.success() {
            log::info!("DNS set successfully");
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("User canceled") || stderr.contains("-128") {
                Err(anyhow!("用户取消了授权"))
            } else {
                Err(anyhow!("设置 DNS 失败: {}", stderr))
            }
        }
    }

    /// 重置 DNS 为 DHCP 自动获取（macOS）
    #[cfg(target_os = "macos")]
    pub fn reset_dns() -> Result<()> {
        if Self::is_helper_installed() {
            return Self::reset_dns_via_helper();
        }
        Self::set_dns(&["empty"])
    }

    /// 设置 TUN 模式推荐的 DNS
    #[cfg(target_os = "macos")]
    pub fn set_tun_dns() -> Result<()> {
        Self::set_dns(&["198.18.0.2"])
    }

    // Windows 实现
    #[cfg(target_os = "windows")]
    pub fn is_helper_installed() -> bool {
        false
    }

    #[cfg(target_os = "windows")]
    pub fn get_helper_install_commands(_helper_script_path: &str) -> String {
        String::new()
    }

    #[cfg(target_os = "windows")]
    pub fn get_current_dns() -> Result<Vec<String>> {
        Ok(vec![])
    }

    #[cfg(target_os = "windows")]
    pub fn set_dns(_servers: &[&str]) -> Result<()> {
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn reset_dns() -> Result<()> {
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn set_tun_dns() -> Result<()> {
        Ok(())
    }

    // Linux 实现
    #[cfg(target_os = "linux")]
    pub fn is_helper_installed() -> bool {
        false
    }

    #[cfg(target_os = "linux")]
    pub fn get_helper_install_commands(_helper_script_path: &str) -> String {
        String::new()
    }

    #[cfg(target_os = "linux")]
    pub fn get_current_dns() -> Result<Vec<String>> {
        Ok(vec![])
    }

    #[cfg(target_os = "linux")]
    pub fn set_dns(_servers: &[&str]) -> Result<()> {
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub fn reset_dns() -> Result<()> {
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub fn set_tun_dns() -> Result<()> {
        Ok(())
    }
}
