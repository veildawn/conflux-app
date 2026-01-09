//! Windows Service Mode Support
//!
//! Manages the Conflux TUN Service for running mihomo with elevated privileges.

#![cfg(target_os = "windows")]

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;

/// Service IPC port
const SERVICE_PORT: u16 = 33211;

/// Service name
const SERVICE_NAME: &str = "ConfluxService";

/// Service status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub installed: bool,
    pub running: bool,
    pub mihomo_running: bool,
    pub mihomo_pid: Option<u32>,
}

/// Response from service
#[derive(Debug, Deserialize)]
struct ServiceResponse {
    success: bool,
    message: String,
    pid: Option<u32>,
}

/// Status response from service
#[derive(Debug, Deserialize)]
struct StatusResponse {
    running: bool,
    pid: Option<u32>,
    #[allow(dead_code)]
    version: String,
}

/// Windows Service Manager
pub struct WinServiceManager;

impl WinServiceManager {
    /// Check if the service is installed
    pub fn is_installed() -> Result<bool> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("sc")
            .args(["query", SERVICE_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to query service: {}", e))?;

        Ok(output.status.success())
    }

    /// Check if the service is running
    pub fn is_running() -> Result<bool> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("sc")
            .args(["query", SERVICE_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to query service: {}", e))?;

        if !output.status.success() {
            return Ok(false);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("RUNNING"))
    }

    /// Check if service IPC is responding
    #[allow(dead_code)]
    pub async fn is_service_healthy() -> bool {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .ok();

        if let Some(client) = client {
            if let Ok(resp) = client
                .get(format!("http://127.0.0.1:{}/health", SERVICE_PORT))
                .send()
                .await
            {
                return resp.status().is_success();
            }
        }

        false
    }

    /// Get full service status
    pub async fn get_status() -> Result<ServiceStatus> {
        let installed = Self::is_installed()?;
        let running = Self::is_running()?;

        let mut status = ServiceStatus {
            installed,
            running,
            mihomo_running: false,
            mihomo_pid: None,
        };

        // If service is running, query mihomo status
        if running {
            if let Ok(mihomo_status) = Self::query_mihomo_status().await {
                status.mihomo_running = mihomo_status.running;
                status.mihomo_pid = mihomo_status.pid;
            }
        }

        Ok(status)
    }

    /// Query mihomo status from service
    async fn query_mihomo_status() -> Result<StatusResponse> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;

        let resp = client
            .get(format!("http://127.0.0.1:{}/status", SERVICE_PORT))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to service: {}", e))?;

        resp.json::<StatusResponse>()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))
    }

    /// Install the service (requires admin)
    /// 安装后自动启动服务，只需一次 UAC 授权
    pub fn install() -> Result<()> {
        log::info!("Installing Conflux Service...");

        // Get service executable path
        let service_path = Self::get_service_path()?;

        if !service_path.exists() {
            return Err(anyhow!(
                "Service executable not found: {}",
                service_path.display()
            ));
        }

        // Run install with elevation
        Self::run_service_command_elevated(&["install"])?;

        // Wait and verify installation
        std::thread::sleep(Duration::from_secs(1));

        if !Self::is_installed()? {
            return Err(anyhow!("Service installation failed"));
        }

        log::info!("Service installed successfully, starting service...");

        // 安装成功后立即启动服务（在同一次提权会话中）
        // 使用提权方式启动，因为安装后用户可能还没有服务控制权限
        if let Err(e) = Self::run_sc_command_elevated("start") {
            log::warn!("Failed to auto-start service after install: {}", e);
            // 启动失败不算安装失败，服务会在下次系统重启时自动启动
        } else {
            // 等待服务完全启动
            std::thread::sleep(Duration::from_secs(2));
            if Self::is_running()? {
                log::info!("Service started successfully");
            }
        }

        Ok(())
    }

    /// Uninstall the service (requires admin)
    pub fn uninstall() -> Result<()> {
        log::info!("Uninstalling Conflux Service...");

        // Stop first
        let _ = Self::stop();
        std::thread::sleep(Duration::from_secs(1));

        // Run uninstall with elevation
        Self::run_service_command_elevated(&["uninstall"])?;

        // Wait and verify
        std::thread::sleep(Duration::from_secs(1));

        if !Self::is_installed().unwrap_or(true) {
            log::info!("Service uninstalled successfully");
            Ok(())
        } else {
            Err(anyhow!("Service uninstallation failed"))
        }
    }

    /// Start the service
    pub fn start() -> Result<()> {
        log::info!("Starting Conflux Service...");

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 先尝试普通权限启动
        let output = Command::new("sc")
            .args(["start", SERVICE_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to start service: {}", e))?;

        // 检查退出码：5 = Access Denied
        let exit_code = output.status.code().unwrap_or(-1);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let combined = format!("{} {}", stdout, stderr);

            log::debug!("sc start exit code: {}, output: {}", exit_code, combined);

            // Already running is OK (error 1056)
            if combined.contains("1056") {
                log::info!("Service already running");
                return Ok(());
            }
            // Access denied (exit code 5 or error message)
            if exit_code == 5
                || combined.contains("5")
                || combined.to_lowercase().contains("access")
                || combined.contains("拒绝")
            {
                log::info!(
                    "Access denied (code {}), trying with elevation...",
                    exit_code
                );
                return Self::run_sc_command_elevated("start");
            }
            return Err(anyhow!(
                "Failed to start service (code {}): {}",
                exit_code,
                combined
            ));
        }

        // Wait for service to start
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(500));
            if Self::is_running()? {
                log::info!("Service started");
                return Ok(());
            }
        }

        Err(anyhow!("Service start timeout"))
    }

    /// Stop the service
    pub fn stop() -> Result<()> {
        log::info!("Stopping Conflux Service...");

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 先尝试普通权限停止
        let output = Command::new("sc")
            .args(["stop", SERVICE_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to stop service: {}", e))?;

        // 检查退出码：5 = Access Denied
        let exit_code = output.status.code().unwrap_or(-1);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let combined = format!("{} {}", stdout, stderr);

            log::debug!("sc stop exit code: {}, output: {}", exit_code, combined);

            // Not running is OK (error 1062 or 1060)
            if combined.contains("1062") || combined.contains("1060") {
                log::info!("Service not running");
                return Ok(());
            }
            // Access denied (exit code 5 or error message)
            if exit_code == 5
                || combined.contains("5")
                || combined.to_lowercase().contains("access")
                || combined.contains("拒绝")
            {
                log::info!(
                    "Access denied (code {}), trying with elevation...",
                    exit_code
                );
                return Self::run_sc_command_elevated("stop");
            }
            return Err(anyhow!(
                "Failed to stop service (code {}): {}",
                exit_code,
                combined
            ));
        }

        // Wait for service to actually stop
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(300));
            if !Self::is_running()? {
                log::info!("Service stopped");
                return Ok(());
            }
        }

        // Even if still running after timeout, report success since stop was issued
        log::warn!("Service stop timeout, but command was successful");
        Ok(())
    }

    /// Restart the service
    pub fn restart() -> Result<()> {
        Self::stop()?;
        std::thread::sleep(Duration::from_secs(1));
        Self::start()
    }

    /// Start mihomo via service
    pub async fn start_mihomo(
        mihomo_path: &str,
        config_dir: &str,
        config_path: &str,
    ) -> Result<u32> {
        log::info!("Starting mihomo via service...");

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        #[derive(Serialize)]
        struct StartRequest {
            mihomo_path: String,
            config_dir: String,
            config_path: String,
        }

        let resp = client
            .post(format!("http://127.0.0.1:{}/start", SERVICE_PORT))
            .json(&StartRequest {
                mihomo_path: mihomo_path.to_string(),
                config_dir: config_dir.to_string(),
                config_path: config_path.to_string(),
            })
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to service: {}", e))?;

        let result: ServiceResponse = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

        if result.success {
            Ok(result.pid.unwrap_or(0))
        } else {
            Err(anyhow!("{}", result.message))
        }
    }

    /// Stop mihomo via service
    pub async fn stop_mihomo() -> Result<()> {
        log::info!("Stopping mihomo via service...");

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let resp = client
            .post(format!("http://127.0.0.1:{}/stop", SERVICE_PORT))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to service: {}", e))?;

        let result: ServiceResponse = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

        if result.success {
            Ok(())
        } else {
            Err(anyhow!("{}", result.message))
        }
    }

    /// Get the service executable path
    fn get_service_path() -> Result<std::path::PathBuf> {
        let exe_dir = std::env::current_exe()?
            .parent()
            .ok_or_else(|| anyhow!("Failed to get exe directory"))?
            .to_path_buf();

        // 1. Check in same directory as main exe (production or dev after copy)
        let service_path = exe_dir.join("conflux-service.exe");
        if service_path.exists() {
            log::debug!("Found service at: {}", service_path.display());
            return Ok(service_path);
        }

        // 2. Check in resources directory (Tauri bundled resources)
        let resource_path = exe_dir.join("resources").join("conflux-service.exe");
        if resource_path.exists() {
            log::debug!("Found service at: {}", resource_path.display());
            return Ok(resource_path);
        }

        // 3. Check in binaries directory (sidecar location, with target triple)
        let binaries_path = exe_dir.join("conflux-service-x86_64-pc-windows-msvc.exe");
        if binaries_path.exists() {
            log::debug!("Found service at: {}", binaries_path.display());
            return Ok(binaries_path);
        }

        // 4. Development: check in src-tauri/binaries
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_binaries = std::path::Path::new(&manifest_dir)
                .join("binaries")
                .join("conflux-service-x86_64-pc-windows-msvc.exe");
            if dev_binaries.exists() {
                log::debug!("Found service at: {}", dev_binaries.display());
                return Ok(dev_binaries);
            }
        }

        log::error!("Service executable not found in any location");
        Err(anyhow!(
            "Service executable not found. Please run: pnpm run fetch:mihomo"
        ))
    }

    /// Run service command with elevation
    fn run_service_command_elevated(args: &[&str]) -> Result<()> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let service_path = Self::get_service_path()?;
        let args_str = args.join(" ");

        let ps_command = format!(
            "Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -Wait -WindowStyle Hidden",
            service_path.display(),
            args_str
        );

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &ps_command,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to run elevated command: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Elevated command failed: {}", stderr))
        }
    }

    /// Run sc.exe command with elevation
    fn run_sc_command_elevated(action: &str) -> Result<()> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 使用 -PassThru 获取进程对象，等待完成并检查退出码
        let ps_command = format!(
            "$p = Start-Process -FilePath 'sc.exe' -ArgumentList '{} {}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode",
            action, SERVICE_NAME
        );

        log::info!(
            "Running elevated sc command: sc {} {}",
            action,
            SERVICE_NAME
        );

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &ps_command,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow!("Failed to run elevated sc command: {}", e))?;

        let exit_code = output.status.code().unwrap_or(-1);
        log::info!("Elevated sc command exit code: {}", exit_code);

        // 等待服务状态更新
        std::thread::sleep(Duration::from_secs(1));

        // 检查服务状态来确认操作成功
        match action {
            "start" => {
                if Self::is_running().unwrap_or(false) {
                    log::info!("Service started successfully via elevation");
                    return Ok(());
                }
            }
            "stop" => {
                if !Self::is_running().unwrap_or(true) {
                    log::info!("Service stopped successfully via elevation");
                    return Ok(());
                }
            }
            _ => {}
        }

        // 如果状态检查通过或命令成功执行
        if exit_code == 0 {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            Err(anyhow!(
                "Elevated sc command failed (code {}): {} {}",
                exit_code,
                stdout,
                stderr
            ))
        }
    }

    /// Check if current process has admin privileges
    pub fn has_admin_privileges() -> bool {
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::Security::{
            GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
        };
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token: HANDLE = std::mem::zeroed();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return false;
            }

            let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
            let mut size: u32 = std::mem::size_of::<TOKEN_ELEVATION>() as u32;

            let result = GetTokenInformation(
                token,
                TokenElevation,
                &mut elevation as *mut _ as *mut _,
                size,
                &mut size,
            );

            windows_sys::Win32::Foundation::CloseHandle(token);

            result != 0 && elevation.TokenIsElevated != 0
        }
    }
}
