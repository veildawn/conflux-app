#[cfg(not(target_os = "windows"))]
use anyhow::anyhow;
use anyhow::Result;
#[cfg(not(target_os = "windows"))]
use std::process::Command;

#[cfg(target_os = "macos")]
use crate::utils::ensure_mihomo_in_data_dir;
#[cfg(not(target_os = "windows"))]
use crate::utils::get_mihomo_binary_path;

/// TUN 权限管理器
pub struct TunPermission;

impl TunPermission {
    /// 检查 mihomo 是否具有 TUN 所需的权限
    /// 在 macOS 上，legacy 方案使用 root 所有权 + setuid bit
    #[cfg(target_os = "macos")]
    pub fn check_permission() -> Result<bool> {
        let mihomo_path = get_mihomo_binary_path()?;

        if !mihomo_path.exists() {
            return Err(anyhow!("MiHomo binary not found"));
        }

        let output = Command::new("ls")
            .args(["-l", mihomo_path.to_str().unwrap()])
            .output()?;

        let output_str = String::from_utf8_lossy(&output.stdout);
        log::debug!("MiHomo file info: {}", output_str);

        // 检查是否为 root 所有
        // 输出格式: -rwsr-xr-x  1 root  wheel  ...
        // 第3列是所有者，需要是 root
        let parts: Vec<&str> = output_str.split_whitespace().collect();
        if parts.len() < 3 {
            return Ok(false);
        }

        let permissions = parts[0];
        let owner = parts[2];

        // 检查所有者是否为 root
        let is_root_owned = owner == "root";

        // 检查是否设置了 setuid bit (权限字符串的第4个字符是 's' 或 'S')
        let has_setuid = permissions.len() >= 4
            && (permissions.chars().nth(3) == Some('s') || permissions.chars().nth(3) == Some('S'));

        log::info!(
            "TUN permission check: owner={}, has_setuid={}, permissions={}",
            owner,
            has_setuid,
            permissions
        );

        Ok(is_root_owned && has_setuid)
    }

    /// 设置 mihomo 的 TUN 权限
    /// 使用 osascript 请求管理员密码
    #[cfg(target_os = "macos")]
    pub fn setup_permission() -> Result<()> {
        let mut mihomo_path = get_mihomo_binary_path()?;

        if !mihomo_path.exists() {
            return Err(anyhow!("MiHomo binary not found"));
        }

        match ensure_mihomo_in_data_dir() {
            Ok(data_path) => {
                mihomo_path = data_path;
            }
            Err(err) => {
                return Err(anyhow!("Failed to prepare MiHomo in data dir: {}", err));
            }
        }

        let path_str = mihomo_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid path"))?;

        // 使用 osascript 请求管理员权限来设置 mihomo 的 suid
        // 命令: sudo chown root:wheel <path> && sudo chmod u+s <path>
        let script = format!(
            r#"do shell script "chown root:wheel '{}' && chmod u+s '{}'" with administrator privileges with prompt "Conflux Helper 需要管理员权限来配置 TUN""#,
            path_str, path_str
        );

        log::info!("Requesting admin privileges to setup TUN permission");

        let output = Command::new("osascript").arg("-e").arg(&script).output()?;

        if output.status.success() {
            log::info!("TUN permission setup successfully");
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::error!("Failed to setup TUN permission: {}", stderr);

            // 用户取消了授权
            if stderr.contains("User canceled") || stderr.contains("-128") {
                return Err(anyhow!("用户取消了授权"));
            }

            Err(anyhow!("设置权限失败: {}", stderr))
        }
    }

    /// Windows 不需要特殊权限设置
    #[cfg(target_os = "windows")]
    pub fn check_permission() -> Result<bool> {
        Ok(true)
    }

    #[cfg(target_os = "windows")]
    pub fn setup_permission() -> Result<()> {
        Ok(())
    }

    /// Linux 需要 cap_net_admin capability
    #[cfg(target_os = "linux")]
    pub fn check_permission() -> Result<bool> {
        let mihomo_path = get_mihomo_binary_path()?;

        if !mihomo_path.exists() {
            return Err(anyhow!("MiHomo binary not found"));
        }

        // 检查是否有 cap_net_admin capability
        let output = Command::new("getcap")
            .arg(mihomo_path.to_str().unwrap())
            .output()?;

        let output_str = String::from_utf8_lossy(&output.stdout);
        Ok(output_str.contains("cap_net_admin"))
    }

    #[cfg(target_os = "linux")]
    pub fn setup_permission() -> Result<()> {
        let mihomo_path = get_mihomo_binary_path()?;

        if !mihomo_path.exists() {
            return Err(anyhow!("MiHomo binary not found"));
        }

        // 使用 pkexec 来请求管理员权限
        let output = Command::new("pkexec")
            .args([
                "setcap",
                "cap_net_bind_service,cap_net_admin=+ep",
                mihomo_path.to_str().unwrap(),
            ])
            .output()?;

        if output.status.success() {
            log::info!("TUN permission setup successfully");
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::error!("Failed to setup TUN permission: {}", stderr);
            Err(anyhow!("设置权限失败: {}", stderr))
        }
    }
}
