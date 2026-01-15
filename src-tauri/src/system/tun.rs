#[cfg(not(target_os = "windows"))]
use anyhow::anyhow;
use anyhow::Result;
#[cfg(not(target_os = "windows"))]
use std::process::Command;

#[cfg(target_os = "linux")]
use crate::utils::get_mihomo_binary_path;
#[cfg(target_os = "macos")]
use crate::utils::{ensure_helper_in_data_dir, is_setuid_root};

/// TUN 权限管理器
pub struct TunPermission;

impl TunPermission {
    /// 检查是否具有 TUN 所需的权限
    ///
    /// macOS: 检查 helper 是否为 root 所有且设置了 setuid bit
    /// Windows: 始终返回 true（权限由 service 管理）
    /// Linux: 检查 mihomo 是否有 cap_net_admin capability
    #[cfg(target_os = "macos")]
    pub fn check_permission() -> Result<bool> {
        // 首先确保 helper 在数据目录
        let helper_path = match ensure_helper_in_data_dir() {
            Ok(path) => path,
            Err(e) => {
                log::warn!("Helper not found: {}", e);
                return Ok(false);
            }
        };

        if !helper_path.exists() {
            log::warn!("Helper binary not found at {:?}", helper_path);
            return Ok(false);
        }

        // 检查 helper 是否具有 setuid root 权限
        let has_permission = is_setuid_root(&helper_path)?;

        log::debug!(
            "TUN permission check: helper={:?}, has_permission={}",
            helper_path,
            has_permission
        );

        Ok(has_permission)
    }

    /// 设置 TUN 权限
    ///
    /// macOS: 使用 osascript 请求管理员权限来设置 helper 的 setuid
    #[cfg(target_os = "macos")]
    pub fn setup_permission() -> Result<()> {
        // 确保 helper 在数据目录
        let helper_path = ensure_helper_in_data_dir()?;

        let path_str = helper_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid path"))?;

        // 使用 osascript 请求管理员权限来设置 helper 的 setuid
        // 命令: chown root:wheel <path> && chmod u+s <path>
        let script = format!(
            r#"do shell script "chown root:wheel '{}' && chmod u+s '{}'" with administrator privileges with prompt "Conflux 需要管理员权限来启用增强模式""#,
            path_str, path_str
        );

        log::info!(
            "Requesting admin privileges to setup TUN permission for helper: {:?}",
            helper_path
        );

        let output = Command::new("osascript").arg("-e").arg(&script).output()?;

        if output.status.success() {
            log::info!("TUN permission setup successfully for helper");
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

    /// Windows 不需要特殊权限设置（权限由 service 管理）
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
