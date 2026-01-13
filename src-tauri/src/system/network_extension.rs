use anyhow::Result;
use serde::Serialize;

/// macOS Network Extension 状态（占位实现）
///
/// 目标：替代旧的 setuid(root) TUN 方案，通过 Packet Tunnel Provider 等正规方式实现增强模式。
/// 当前仓库尚未集成 NE Target，因此这里只提供“状态/引导”的稳定接口，供前端展示与交互。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkExtensionStatus {
    /// 当前平台是否支持 NE（仅 macOS 返回 true）
    pub supported: bool,
    /// NE 组件是否已安装（占位：当前永远 false）
    pub installed: bool,
    /// NE 是否已启用/授权（占位：当前永远 false）
    pub enabled: bool,
    /// 给用户看的提示信息
    pub message: String,
}

pub struct NetworkExtensionManager;

impl NetworkExtensionManager {
    pub fn status() -> Result<NetworkExtensionStatus> {
        #[cfg(target_os = "macos")]
        {
            return Ok(NetworkExtensionStatus {
                supported: true,
                installed: false,
                enabled: false,
                message: "当前构建尚未集成 Network Extension（需要新增 Packet Tunnel Provider 目标并完成签名/授权）。"
                    .to_string(),
            });
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(NetworkExtensionStatus {
                supported: false,
                installed: false,
                enabled: false,
                message: "Network Extension 仅在 macOS 上可用".to_string(),
            })
        }
    }

    /// 打开系统设置中“网络扩展”相关面板（尽力而为）
    pub fn open_settings() -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            // 不同 macOS 版本的 URL/面板可能不同，这里先尝试一个常见入口。
            let _ = Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_NetworkExtensions")
                .output();
            return Ok(());
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(())
        }
    }
}
