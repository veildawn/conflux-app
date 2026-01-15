use anyhow::Result;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::utils::{ensure_mihomo_in_data_dir, get_app_data_dir, get_mihomo_config_path};

/// 检查配置文件中 TUN 模式是否启用
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn is_tun_enabled() -> bool {
    let config_path = match get_mihomo_config_path() {
        Ok(p) => p,
        Err(_) => return false,
    };

    if !config_path.exists() {
        return false;
    }

    let content = match fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    // 简单解析 YAML 检查 tun.enable
    if let Ok(config) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
        if let Some(tun) = config.get("tun") {
            if let Some(enable) = tun.get("enable") {
                return enable.as_bool().unwrap_or(false);
            }
        }
    }

    false
}

/// 检查服务 IPC 是否就绪（使用 HTTP 健康检查，更可靠）
#[cfg(target_os = "windows")]
async fn is_service_ipc_ready_async() -> bool {
    use crate::system::WinServiceManager;

    // 直接检查服务 HTTP API 是否可响应
    // get_status() 成功 = HTTP 请求成功 = IPC 就绪
    // 不再依赖 status.running，因为如果 HTTP 请求成功，服务肯定在运行
    match WinServiceManager::get_status().await {
        Ok(_) => {
            log::debug!("Service IPC ready (HTTP request succeeded)");
            true
        }
        Err(e) => {
            log::debug!("Service IPC not ready (HTTP request failed: {})", e);
            false
        }
    }
}

/// 等待服务 IPC 就绪（使用指数退避策略）
///
/// 参数:
/// - `max_wait`: 最大等待时间
///
/// 返回:
/// - `true`: IPC 已就绪
/// - `false`: 超时，IPC 仍未就绪
#[cfg(target_os = "windows")]
async fn wait_for_service_ipc(max_wait: Duration) -> bool {
    let mut interval = Duration::from_millis(100);
    let max_interval = Duration::from_secs(1);
    let mut elapsed = Duration::ZERO;
    let mut attempt = 0;

    while elapsed < max_wait {
        attempt += 1;

        if is_service_ipc_ready_async().await {
            log::info!(
                "Service IPC ready after {} attempts ({:?})",
                attempt,
                elapsed
            );
            return true;
        }

        // 等待后再检查
        sleep(interval).await;
        elapsed += interval;

        // 指数退避：100ms -> 200ms -> 400ms -> 800ms -> 1s (max)
        interval = std::cmp::min(interval * 2, max_interval);
    }

    log::warn!(
        "Service IPC not ready after {} attempts ({:?})",
        attempt,
        elapsed
    );
    false
}

/// MiHomo 进程管理器
pub struct MihomoManager {
    process: Arc<Mutex<Option<Child>>>,
    config_path: PathBuf,
    api_url: String,
    api_secret: String,
}

impl MihomoManager {
    /// 创建新的 MiHomo 管理器
    pub fn new(secret: String) -> Result<Self> {
        let config_path = get_mihomo_config_path()?;

        Ok(Self {
            process: Arc::new(Mutex::new(None)),
            config_path,
            api_url: "http://127.0.0.1:9090".to_string(),
            api_secret: secret,
        })
    }

    /// 获取 PID 文件路径
    fn get_pid_file_path() -> Result<PathBuf> {
        let data_dir = get_app_data_dir()?;
        Ok(data_dir.join("mihomo.pid"))
    }

    /// 保存 PID 到文件
    fn save_pid(&self, pid: u32) -> Result<()> {
        let pid_file = Self::get_pid_file_path()?;
        let mut file = fs::File::create(&pid_file)?;
        file.write_all(pid.to_string().as_bytes())?;
        log::info!("Saved MiHomo PID {} to {:?}", pid, pid_file);
        Ok(())
    }

    /// 从文件读取 PID
    fn load_pid() -> Option<u32> {
        let pid_file = Self::get_pid_file_path().ok()?;
        if !pid_file.exists() {
            return None;
        }
        let mut file = fs::File::open(&pid_file).ok()?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).ok()?;
        contents.trim().parse().ok()
    }

    /// 删除 PID 文件
    fn remove_pid_file() {
        if let Ok(pid_file) = Self::get_pid_file_path() {
            let _ = fs::remove_file(&pid_file);
        }
    }

    /// 清理残留的 MiHomo 进程
    /// 在启动新进程前调用，确保没有僵尸进程
    pub fn cleanup_stale_processes() {
        log::debug!("Cleaning up stale MiHomo processes...");

        // 通过 PID 文件清理旧进程
        if let Some(old_pid) = Self::load_pid() {
            log::debug!("Found old PID file with PID: {}", old_pid);
            Self::kill_process_by_pid(old_pid);
            // 只有在确认进程已停止后才删除 PID 文件。
            // 否则会导致后续 start() 误判并启动第二个实例。
            if Self::is_pid_running(old_pid) {
                log::error!(
                    "Stale MiHomo process {} is still running after cleanup attempt; keeping PID file",
                    old_pid
                );
                return;
            }
            Self::remove_pid_file();
        }

        log::debug!("Cleanup completed");
    }

    /// 通过 PID 杀死进程
    fn kill_process_by_pid(pid: u32) {
        #[cfg(unix)]
        {
            unsafe {
                // 先发送 SIGTERM
                if libc::kill(pid as i32, libc::SIGTERM) == 0 {
                    log::info!("Sent SIGTERM to process {}", pid);
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    // 再发送 SIGKILL 确保终止
                    libc::kill(pid as i32, libc::SIGKILL);
                    log::info!("Sent SIGKILL to process {}", pid);
                }
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let output = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            match &output {
                Ok(out) if out.status.success() => {
                    log::info!("taskkill succeeded for PID {}", pid);
                }
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let combined = format!("{}{}", stdout, stderr);
                    log::warn!(
                        "taskkill failed for PID {} (exit={:?}), output={}",
                        pid,
                        out.status.code(),
                        combined.trim()
                    );
                }
                Err(e) => {
                    log::warn!("Failed to execute taskkill for PID {}: {}", pid, e);
                }
            };
        }
    }

    /// 通过 helper 以 root 权限杀死进程 (仅 macOS)
    #[cfg(target_os = "macos")]
    fn kill_process_via_helper(pid: u32) {
        use crate::utils::ensure_helper_in_data_dir;

        match ensure_helper_in_data_dir() {
            Ok(helper_path) => {
                let output = Command::new(&helper_path)
                    .args(["kill", &pid.to_string()])
                    .output();

                match output {
                    Ok(out) if out.status.success() => {
                        log::info!("Helper killed process {} successfully", pid);
                    }
                    Ok(out) => {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        log::warn!(
                            "Helper kill returned non-zero for PID {}: {}",
                            pid,
                            stderr.trim()
                        );
                    }
                    Err(e) => {
                        log::warn!("Failed to run helper kill for PID {}: {}", pid, e);
                    }
                }
            }
            Err(e) => {
                log::warn!(
                    "Helper not available, cannot kill PID {} via helper: {}",
                    pid,
                    e
                );
            }
        }
    }

    /// 判断 PID 是否存在（真正运行中，不包括僵尸进程）
    fn is_pid_running(pid: u32) -> bool {
        #[cfg(unix)]
        {
            // 先尝试 waitpid 回收可能的僵尸进程
            // WNOHANG: 非阻塞，如果子进程还没退出就立即返回 0
            let wait_result =
                unsafe { libc::waitpid(pid as i32, std::ptr::null_mut(), libc::WNOHANG) };

            if wait_result == pid as i32 {
                // waitpid 返回 pid，说明成功回收了僵尸进程，进程已停止
                log::debug!("Reaped zombie process {}", pid);
                return false;
            }
            // wait_result == 0: 子进程还在运行
            // wait_result == -1: 不是我们的子进程或已被回收

            // 使用 kill(pid, 0) 检查进程是否存在
            return unsafe { libc::kill(pid as i32, 0) == 0 };
        }
        #[cfg(windows)]
        {
            // 使用 Windows API 检查进程状态，避免控制台窗口闪烁
            const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
            const STILL_ACTIVE: u32 = 259;

            extern "system" {
                fn OpenProcess(
                    dwDesiredAccess: u32,
                    bInheritHandle: i32,
                    dwProcessId: u32,
                ) -> *mut std::ffi::c_void;
                fn GetExitCodeProcess(hProcess: *mut std::ffi::c_void, lpExitCode: *mut u32)
                    -> i32;
                fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            }

            unsafe {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if handle.is_null() {
                    return false;
                }
                let mut exit_code: u32 = 0;
                let result = GetExitCodeProcess(handle, &mut exit_code);
                CloseHandle(handle);
                result != 0 && exit_code == STILL_ACTIVE
            }
        }
    }

    /// 检查当前进程是否已经以管理员权限运行
    #[cfg(windows)]
    fn is_running_as_admin() -> bool {
        use std::ptr::null_mut;

        #[link(name = "advapi32")]
        extern "system" {
            fn OpenProcessToken(
                ProcessHandle: *mut std::ffi::c_void,
                DesiredAccess: u32,
                TokenHandle: *mut *mut std::ffi::c_void,
            ) -> i32;
            fn GetTokenInformation(
                TokenHandle: *mut std::ffi::c_void,
                TokenInformationClass: u32,
                TokenInformation: *mut std::ffi::c_void,
                TokenInformationLength: u32,
                ReturnLength: *mut u32,
            ) -> i32;
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        }

        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentProcess() -> *mut std::ffi::c_void;
        }

        const TOKEN_QUERY: u32 = 0x0008;
        const TOKEN_ELEVATION: u32 = 20;

        #[repr(C)]
        struct TokenElevation {
            token_is_elevated: u32,
        }

        unsafe {
            let process = GetCurrentProcess();
            let mut token: *mut std::ffi::c_void = null_mut();

            if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
                return false;
            }

            let mut elevation = TokenElevation {
                token_is_elevated: 0,
            };
            let mut size: u32 = 0;

            let result = GetTokenInformation(
                token,
                TOKEN_ELEVATION,
                &mut elevation as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<TokenElevation>() as u32,
                &mut size,
            );

            CloseHandle(token);

            result != 0 && elevation.token_is_elevated != 0
        }
    }

    /// 通过服务模式启动 mihomo（Windows TUN 模式）
    #[cfg(windows)]
    async fn start_via_service(
        &self,
        mihomo_path: &PathBuf,
        config_dir: &str,
        config_path: &str,
    ) -> Result<()> {
        use crate::system::WinServiceManager;

        log::info!("Starting mihomo via service...");

        // 通过服务 API 启动 mihomo
        let pid = WinServiceManager::start_mihomo(
            &mihomo_path.to_string_lossy(),
            config_dir,
            config_path,
        )
        .await
        .map_err(|e| anyhow::anyhow!("Failed to start mihomo via service: {}", e))?;

        log::info!("Mihomo started via service with PID: {}", pid);

        // 保存 PID 到文件，以便后续通过 PID 停止进程
        if let Err(e) = self.save_pid(pid) {
            log::warn!("Failed to save PID file: {}", e);
        }

        // 优化：服务模式下使用更短的健康检查超时
        // 服务已经启动了 mihomo，只需验证 API 可用
        // 初始间隔 50ms，最大间隔 500ms，总超时约 5 秒
        let max_total_wait = Duration::from_secs(5);
        let mut total_waited = Duration::ZERO;
        let mut current_interval = Duration::from_millis(50);
        let max_interval = Duration::from_millis(500);
        let mut attempt = 0;

        while total_waited < max_total_wait {
            attempt += 1;

            match self.check_health().await {
                Ok(_) => {
                    log::info!(
                        "MiHomo started successfully via service after {} attempts ({:?})",
                        attempt,
                        total_waited
                    );
                    return Ok(());
                }
                Err(e) => {
                    if total_waited + current_interval >= max_total_wait {
                        log::error!(
                            "MiHomo health check failed after {} attempts ({:?}): {}",
                            attempt,
                            total_waited,
                            e
                        );
                        // 停止 mihomo
                        let _ = WinServiceManager::stop_mihomo().await;
                        return Err(anyhow::anyhow!("MiHomo failed to start: {}", e));
                    }
                    log::debug!(
                        "Health check attempt {}: {}, retrying in {:?}...",
                        attempt,
                        e,
                        current_interval
                    );
                    sleep(current_interval).await;
                    total_waited += current_interval;
                    // 指数退避：间隔翻倍，但不超过最大值
                    current_interval = std::cmp::min(current_interval * 2, max_interval);
                }
            }
        }

        Err(anyhow::anyhow!(
            "MiHomo failed to start: health check timeout"
        ))
    }

    /// 启动 MiHomo 进程
    pub async fn start(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if process_guard.is_some() {
            log::info!("MiHomo is already running");
            return Ok(());
        }

        // Windows: 检查是否应该使用服务模式
        // 如果服务正在运行，跳过进程清理（避免不必要的 taskkill 调用）
        #[cfg(target_os = "windows")]
        let use_service_mode = {
            use crate::system::WinServiceManager;
            let service_installed = WinServiceManager::is_installed().unwrap_or(false);
            let service_running = WinServiceManager::is_running().unwrap_or(false);
            log::debug!(
                "Service mode check: installed={}, running={}",
                service_installed,
                service_running
            );
            service_installed && service_running
        };

        #[cfg(not(target_os = "windows"))]
        let use_service_mode = false;

        // 非服务模式：在启动新进程前，清理所有残留的旧进程
        if !use_service_mode {
            Self::cleanup_stale_processes();
            // 清理后如果 PID 文件仍存在且进程仍在运行，说明无法停止旧进程；
            // 此时必须中止启动，避免产生双实例。
            if let Some(stale_pid) = Self::load_pid() {
                if Self::is_pid_running(stale_pid) {
                    return Err(anyhow::anyhow!(
                        "旧的 MiHomo 进程仍在运行 (PID: {})，已中止启动以避免双实例。请尝试手动结束进程后重试。",
                        stale_pid
                    ));
                }
                // 进程不在运行但 pidfile 仍在（理论上不应发生），这里兜底清理。
                Self::remove_pid_file();
            }
        }

        log::info!("Config path: {:?}", self.config_path);

        // 确保配置目录存在
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
            log::debug!("Ensured config dir exists: {:?}", parent);
        }

        // 确保 mihomo 二进制在数据目录（从 sidecar 或开发环境复制）
        let mihomo_path = ensure_mihomo_in_data_dir()?;
        log::info!("Using MiHomo binary at: {:?}", mihomo_path);

        let config_dir = self.config_path.parent().unwrap();
        let config_dir_str = config_dir.to_string_lossy().to_string();
        let config_path_str = self.config_path.to_string_lossy().to_string();

        // 启动 mihomo 进程
        // 注意：使用 Stdio::null() 丢弃 stdout/stderr 输出
        // 不能使用 Stdio::piped() 因为如果不读取管道，缓冲区会满导致进程阻塞
        // mihomo 的日志已经通过 WebSocket API (/logs) 获取，无需从 stdout/stderr 读取
        #[cfg(windows)]
        let child = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let tun_enabled = is_tun_enabled();

            log::info!(
                "Start check: tun_enabled={}, use_service_mode={}",
                tun_enabled,
                use_service_mode
            );

            // 优先级 1：如果服务正在运行，通过服务启动
            if use_service_mode {
                log::info!("Service is running, starting mihomo via service...");
                log::debug!("  mihomo_path: {:?}", mihomo_path);
                log::debug!("  config_dir: {}", config_dir_str);
                log::debug!("  config_path: {}", config_path_str);

                // 使用指数退避等待 IPC 就绪（最多 10 秒）
                if wait_for_service_ipc(Duration::from_secs(10)).await {
                    return self
                        .start_via_service(&mihomo_path, &config_dir_str, &config_path_str)
                        .await;
                }

                // 服务模式下 IPC 超时，返回错误
                log::error!("Service IPC not ready after 10 seconds");
                if tun_enabled {
                    return Err(anyhow::anyhow!(
                        "服务模式下无法启动增强模式：服务 IPC 未就绪。\n\
                        请检查 Conflux 服务是否正常运行，或尝试在设置中重启服务。"
                    ));
                } else {
                    // TUN 未启用，可以普通模式启动
                    log::info!("TUN not enabled, starting in normal mode...");
                    Command::new(&mihomo_path)
                        .current_dir(config_dir)
                        .args(["-d", &config_dir_str, "-f", &config_path_str])
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?
                }
            }
            // 优先级 2：TUN 启用但服务未运行，检查是否以管理员模式运行
            else if tun_enabled {
                if Self::is_running_as_admin() {
                    log::info!("TUN mode enabled, running as admin, starting mihomo directly...");
                    Command::new(&mihomo_path)
                        .current_dir(config_dir)
                        .args(["-d", &config_dir_str, "-f", &config_path_str])
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?
                } else {
                    // 不是管理员模式，返回带标识的错误，前端可据此提示用户重启
                    log::error!(
                        "TUN mode enabled but not running as admin and service not running"
                    );
                    return Err(anyhow::anyhow!(
                        "NEED_ADMIN:增强模式需要管理员权限。请选择以下方式之一：\n\
                        1. 在设置中安装并启动 Conflux 服务（推荐）\n\
                        2. 以管理员身份重新启动应用"
                    ));
                }
            }
            // 优先级 3：普通模式，直接启动
            else {
                log::info!("Starting mihomo in normal mode...");
                Command::new(&mihomo_path)
                    .current_dir(config_dir)
                    .args(["-d", &config_dir_str, "-f", &config_path_str])
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?
            }
        };

        // macOS: 根据 TUN 模式决定启动方式
        #[cfg(target_os = "macos")]
        let (child, started_via_helper) = {
            use crate::utils::{ensure_helper_in_data_dir, HELPER_PID_FILE};

            let tun_enabled = is_tun_enabled();
            log::info!("macOS start check: tun_enabled={}", tun_enabled);

            // 清理可能残留的 helper PID 文件
            let _ = fs::remove_file(HELPER_PID_FILE);

            if tun_enabled {
                // TUN 模式：通过 helper 启动
                log::info!("Starting mihomo via helper for TUN mode...");

                let helper_path = ensure_helper_in_data_dir()
                    .map_err(|e| anyhow::anyhow!("Helper not found: {}", e))?;

                let output = Command::new(&helper_path)
                    .args([
                        "start",
                        &mihomo_path.to_string_lossy(),
                        "-d",
                        &config_dir_str,
                        "-f",
                        &config_path_str,
                    ])
                    .output()
                    .map_err(|e| anyhow::anyhow!("Failed to run helper: {}", e))?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(anyhow::anyhow!("Helper failed to start mihomo: {}", stderr));
                }

                // Helper 输出 PID
                let pid_str = String::from_utf8_lossy(&output.stdout);
                let pid: u32 = pid_str
                    .trim()
                    .parse()
                    .map_err(|_| anyhow::anyhow!("Invalid PID from helper: {}", pid_str))?;

                log::info!("MiHomo started via helper with PID: {}", pid);

                // 返回 None 表示没有 Child 句柄（进程由 helper 管理）
                (None, true)
            } else {
                // 普通模式：直接启动
                log::info!("Starting mihomo in normal mode...");
                let child = Command::new(&mihomo_path)
                    .current_dir(config_dir)
                    .args(["-d", &config_dir_str, "-f", &config_path_str])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?;

                (Some(child), false)
            }
        };

        // Linux: 直接启动
        #[cfg(target_os = "linux")]
        let (child, started_via_helper) = {
            let child = Command::new(&mihomo_path)
                .current_dir(config_dir)
                .args(["-d", &config_dir_str, "-f", &config_path_str])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?;

            (Some(child), false)
        };

        // 保存 PID 到文件（所有平台通用）
        // Windows 普通模式：保存 Child 的 PID
        // macOS/Linux 普通模式：保存 Child 的 PID
        // macOS TUN 模式：PID 由 helper 管理，child 为 None
        #[cfg(windows)]
        {
            let pid = child.id();
            log::info!("MiHomo spawned with PID: {}", pid);
            if let Err(e) = self.save_pid(pid) {
                log::warn!("Failed to save PID file: {}", e);
            }
        }
        #[cfg(not(windows))]
        {
            if let Some(ref child) = child {
                let pid = child.id();
                log::info!("MiHomo spawned with PID: {}", pid);

                // 保存 PID 到文件，以便下次启动时清理
                if let Err(e) = self.save_pid(pid) {
                    log::warn!("Failed to save PID file: {}", e);
                }
            }
            // TUN 模式的 PID 由 helper 管理，不需要在这里保存
            let _ = started_via_helper; // 避免 unused 警告
        }

        // 优化：减少初始等待时间，从 500ms 降至 100ms
        sleep(Duration::from_millis(100)).await;

        // 保存 Child 句柄（macOS TUN 模式下为 None，因为进程由 helper 管理）
        #[cfg(windows)]
        {
            *process_guard = Some(child);
        }
        #[cfg(not(windows))]
        {
            *process_guard = child;
        }
        drop(process_guard);

        // 优化：使用指数退避策略进行健康检查
        // 初始间隔 100ms，最大间隔 2s，总超时 30 秒（首次启动可能需要下载 GeoIP）
        let max_total_wait = Duration::from_secs(30);
        let mut total_waited = Duration::ZERO;
        let mut current_interval = Duration::from_millis(100);
        let max_interval = Duration::from_secs(2);
        let mut attempt = 0;

        while total_waited < max_total_wait {
            attempt += 1;
            log::debug!(
                "Health check attempt {} (waited {:?})",
                attempt,
                total_waited
            );

            match self.check_health().await {
                Ok(_) => {
                    log::info!(
                        "MiHomo started successfully after {} attempts ({:?})",
                        attempt,
                        total_waited
                    );
                    return Ok(());
                }
                Err(e) => {
                    if total_waited + current_interval >= max_total_wait {
                        log::error!(
                            "MiHomo health check failed after {} attempts ({:?}): {}",
                            attempt,
                            total_waited,
                            e
                        );
                        // 尝试清理进程
                        let _ = self.stop().await;
                        return Err(anyhow::anyhow!("MiHomo failed to start: {}", e));
                    }
                    log::debug!(
                        "Health check failed (attempt {}): {}, retrying in {:?}...",
                        attempt,
                        e,
                        current_interval
                    );
                    sleep(current_interval).await;
                    total_waited += current_interval;
                    // 指数退避：间隔翻倍，但不超过最大值
                    current_interval = std::cmp::min(current_interval * 2, max_interval);
                }
            }
        }

        Err(anyhow::anyhow!(
            "MiHomo failed to start: health check timeout"
        ))
    }

    /// 停止 MiHomo 进程
    ///
    /// 停止逻辑根据当前运行状态选择方式：
    /// - Windows: 检查 service 模式
    /// - macOS: 检查 helper PID 文件判断是否为 TUN 模式
    /// - 普通模式: 直接 kill
    pub async fn stop(&self) -> Result<()> {
        // Windows: 动态检测是否通过服务启动
        #[cfg(target_os = "windows")]
        {
            use crate::system::WinServiceManager;

            // 如果服务正在运行且 mihomo 是服务启动的，通过服务 API 停止
            if let Ok(status) = WinServiceManager::get_status().await {
                if status.running && status.mihomo_running {
                    log::info!(
                        "Stopping MiHomo via service (detected mihomo_pid: {:?})...",
                        status.mihomo_pid
                    );
                    if let Err(e) = WinServiceManager::stop_mihomo().await {
                        log::warn!(
                            "Failed to stop mihomo via service: {}, falling back to PID kill",
                            e
                        );
                        // 回退到通过 PID 停止
                        if let Some(pid) = status.mihomo_pid {
                            Self::kill_process_by_pid(pid);
                        } else if let Some(pid) = Self::load_pid() {
                            Self::kill_process_by_pid(pid);
                        } else {
                            log::warn!("No PID available to stop MiHomo");
                        }
                    }
                    // 清理进程句柄和 PID 文件
                    self.process.lock().await.take();
                    Self::remove_pid_file();
                    log::info!("MiHomo stopped via service");
                    return Ok(());
                }
            }
        }

        // macOS: 检查是否是 TUN 模式（通过 helper 启动）
        #[cfg(target_os = "macos")]
        {
            use crate::utils::{ensure_helper_in_data_dir, has_helper_pid_file, HELPER_PID_FILE};

            if has_helper_pid_file() {
                // 当前是 TUN 模式运行的 -> 通过 helper 停止
                log::info!("Stopping TUN mode MiHomo via helper...");

                // 先读取 PID 以便后续验证
                let pid_before_stop: Option<u32> = fs::read_to_string(HELPER_PID_FILE)
                    .ok()
                    .and_then(|s| s.trim().parse().ok());

                match ensure_helper_in_data_dir() {
                    Ok(helper_path) => {
                        let output = Command::new(&helper_path).arg("stop").output();

                        match output {
                            Ok(out) if out.status.success() => {
                                log::info!("MiHomo stopped via helper");
                            }
                            Ok(out) => {
                                let stderr = String::from_utf8_lossy(&out.stderr);
                                log::warn!("Helper stop returned error: {}", stderr);
                            }
                            Err(e) => {
                                log::warn!("Failed to run helper stop: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Helper not found, cannot stop TUN mode: {}", e);
                    }
                }

                // 等待并验证进程是否真的停止
                if let Some(pid) = pid_before_stop {
                    // 等待最多 2 秒
                    for _ in 0..20 {
                        if !Self::is_pid_running(pid) {
                            log::info!("TUN mode MiHomo (PID: {}) confirmed stopped", pid);
                            break;
                        }
                        sleep(Duration::from_millis(100)).await;
                    }

                    // 最终检查
                    if Self::is_pid_running(pid) {
                        log::error!(
                            "TUN mode MiHomo (PID: {}) still running after helper stop",
                            pid
                        );
                        // 不返回错误，继续清理
                    }
                }

                // 确保 PID 文件被清理
                let _ = fs::remove_file(HELPER_PID_FILE);

                // 清理进程句柄
                self.process.lock().await.take();
                return Ok(());
            }
        }

        // 普通模式：停止进程
        // macOS: 直接使用 helper 以 root 权限终止（更可靠）
        // 其他平台：使用 Child 句柄或 kill_process_by_pid
        let mut process_guard = self.process.lock().await;
        let child_opt = process_guard.take();
        drop(process_guard);

        if let Some(child) = child_opt {
            let pid = child.id();
            log::info!("Stopping MiHomo process (PID: {})", pid);

            // 检查 PID 文件
            let pid_from_file = Self::load_pid();
            let check_pid = pid_from_file.unwrap_or(pid);

            // 终止进程
            #[cfg(target_os = "macos")]
            {
                log::info!(
                    "Using helper to kill process {} with elevated privileges",
                    check_pid
                );
                Self::kill_process_via_helper(check_pid);
            }
            #[cfg(not(target_os = "macos"))]
            {
                // 非 macOS: 使用 SIGTERM + SIGKILL
                Self::kill_process_by_pid(pid);
            }

            // 等待进程退出（最多 2 秒）
            let mut stopped = false;
            for i in 0..20 {
                if !Self::is_pid_running(check_pid) {
                    log::info!(
                        "MiHomo process (PID: {}) confirmed stopped after {}ms",
                        check_pid,
                        i * 100
                    );
                    stopped = true;
                    break;
                }
                sleep(Duration::from_millis(100)).await;
            }

            // 如果进程仍未停止，报错
            if !stopped && Self::is_pid_running(check_pid) {
                log::error!(
                    "MiHomo PID {} is still running after stop attempt",
                    check_pid
                );
                return Err(anyhow::anyhow!(
                    "停止 MiHomo 失败：进程仍在运行 (PID: {})",
                    check_pid
                ));
            }

            // 检查 PID 文件中是否有不同的 PID 需要处理
            if let Some(real_pid) = pid_from_file {
                if real_pid != pid && Self::is_pid_running(real_pid) {
                    log::info!(
                        "Detected different PID in pid file (pid_file={}, child_pid={}), killing...",
                        real_pid,
                        pid
                    );
                    #[cfg(target_os = "macos")]
                    Self::kill_process_via_helper(real_pid);
                    #[cfg(not(target_os = "macos"))]
                    Self::kill_process_by_pid(real_pid);

                    // 等待
                    for _ in 0..10 {
                        if !Self::is_pid_running(real_pid) {
                            break;
                        }
                        sleep(Duration::from_millis(100)).await;
                    }
                }
                // 最终检查
                if Self::is_pid_running(real_pid) {
                    log::error!(
                        "MiHomo real PID {} is still running after stop attempt",
                        real_pid
                    );
                    return Err(anyhow::anyhow!(
                        "停止 MiHomo 失败：进程仍在运行 (PID: {})",
                        real_pid
                    ));
                }
            }

            Self::remove_pid_file();
            log::info!("MiHomo stopped");
        } else if let Some(pid) = Self::load_pid() {
            log::info!("Stopping MiHomo process by PID file (PID: {})", pid);

            // macOS: 使用 helper 终止
            #[cfg(target_os = "macos")]
            Self::kill_process_via_helper(pid);
            // 非 macOS: 使用普通方式
            #[cfg(not(target_os = "macos"))]
            Self::kill_process_by_pid(pid);

            // 等待进程退出
            for _ in 0..20 {
                if !Self::is_pid_running(pid) {
                    break;
                }
                sleep(Duration::from_millis(100)).await;
            }
            if Self::is_pid_running(pid) {
                log::error!("MiHomo PID {} is still running after stop attempt", pid);
                return Err(anyhow::anyhow!(
                    "停止 MiHomo 失败：进程仍在运行 (PID: {})",
                    pid
                ));
            }
            Self::remove_pid_file();
        } else {
            log::warn!("No process handle or PID file found, MiHomo may not be running");
        }

        Ok(())
    }

    /// 同步停止进程（用于应用退出时）
    ///
    /// 停止逻辑根据当前运行状态选择方式
    pub fn stop_sync(&self) {
        log::info!("Synchronously stopping MiHomo...");

        // Windows: 动态检测是否需要通过服务停止
        #[cfg(target_os = "windows")]
        {
            use crate::system::WinServiceManager;

            // 检查服务是否运行（同步方式）
            if WinServiceManager::is_running().unwrap_or(false) {
                log::info!("Service is running, attempting to stop mihomo via service...");
                // 使用阻塞方式调用服务 API
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                if let Ok(rt) = rt {
                    if let Err(e) = rt.block_on(async { WinServiceManager::stop_mihomo().await }) {
                        log::warn!("Failed to stop mihomo via service: {}", e);
                    } else {
                        log::info!("MiHomo stopped via service");
                        Self::remove_pid_file();
                        return;
                    }
                }
            }
        }

        // macOS: 检查是否是 TUN 模式（通过 helper 启动）
        #[cfg(target_os = "macos")]
        {
            use crate::utils::{ensure_helper_in_data_dir, has_helper_pid_file, HELPER_PID_FILE};

            if has_helper_pid_file() {
                log::info!("Stopping TUN mode MiHomo via helper (sync)...");

                // 先读取 PID
                let pid_before_stop: Option<u32> = fs::read_to_string(HELPER_PID_FILE)
                    .ok()
                    .and_then(|s| s.trim().parse().ok());

                if let Ok(helper_path) = ensure_helper_in_data_dir() {
                    match Command::new(&helper_path).arg("stop").output() {
                        Ok(out) if out.status.success() => {
                            log::info!("MiHomo stopped via helper");
                        }
                        Ok(out) => {
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            log::warn!("Helper stop returned error: {}", stderr);
                        }
                        Err(e) => {
                            log::warn!("Failed to run helper stop: {}", e);
                        }
                    }
                }

                // 等待进程停止
                if let Some(pid) = pid_before_stop {
                    for _ in 0..20 {
                        if !Self::is_pid_running(pid) {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }

                // 清理 PID 文件
                let _ = fs::remove_file(HELPER_PID_FILE);
                return;
            }
        }

        // 尝试获取锁并停止进程
        if let Ok(mut guard) = self.process.try_lock() {
            if let Some(mut child) = guard.take() {
                let pid = child.id();
                log::info!("Stopping MiHomo process (PID: {})", pid);
                let _ = child.kill();
                log::info!("MiHomo process killed (PID: {})", pid);
            } else if let Some(pid) = Self::load_pid() {
                log::info!("Stopping MiHomo process by PID file (PID: {})", pid);
                Self::kill_process_by_pid(pid);
            } else {
                log::warn!("No process handle or PID file found, MiHomo may not be running");
            }
        } else {
            // 如果拿不到锁，通过 PID 文件清理
            log::warn!("Could not acquire lock, cleaning up via PID file");
            if let Some(pid) = Self::load_pid() {
                Self::kill_process_by_pid(pid);
            } else {
                log::warn!("No PID file found");
            }
        }

        // 确保 PID 文件被删除
        Self::remove_pid_file();
    }

    /// 重启 MiHomo 进程
    ///
    /// 优化后的重启流程：
    /// 1. 停止当前进程
    /// 2. 使用指数退避等待进程停止（100ms -> 200ms -> 400ms -> 500ms max）
    /// 3. 必要时清理残留进程
    /// 4. 确认进程已停止后再启动新进程
    pub async fn restart(&self) -> Result<()> {
        log::info!("Restarting MiHomo...");

        // 停止当前进程
        self.stop().await?;

        // 使用指数退避等待进程停止
        let max_wait = Duration::from_secs(5);
        let mut interval = Duration::from_millis(100);
        let max_interval = Duration::from_millis(500);
        let mut elapsed = Duration::ZERO;
        let mut stopped = false;

        while elapsed < max_wait {
            if !self.is_running().await {
                log::debug!("MiHomo stopped after {:?}", elapsed);
                stopped = true;
                break;
            }

            sleep(interval).await;
            elapsed += interval;

            // 指数退避：100ms -> 200ms -> 400ms -> 500ms (max)
            interval = std::cmp::min(interval * 2, max_interval);
        }

        // 只有在进程未正常停止时才进行额外清理
        if !stopped {
            log::warn!(
                "MiHomo did not stop gracefully after {:?}, forcing cleanup...",
                elapsed
            );

            // 尝试使用 cleanup_stale_processes
            Self::cleanup_stale_processes();
            sleep(Duration::from_millis(500)).await;

            // 最终检查
            if self.is_running().await {
                log::error!(
                    "MiHomo process still running after cleanup, cannot start new instance"
                );
                return Err(anyhow::anyhow!(
                    "无法停止旧的代理进程，请尝试手动结束 mihomo 进程后重试"
                ));
            }
        }

        // 启动新进程
        self.start().await?;

        log::info!("MiHomo restarted successfully");
        Ok(())
    }

    /// 检查进程是否正在运行
    ///
    /// 检测逻辑：
    /// 1. Windows 服务模式：通过服务 API 查询 mihomo 状态
    /// 2. macOS TUN 模式：检查 helper PID 文件
    /// 3. 普通模式：检查进程句柄或 PID 文件
    pub async fn is_running(&self) -> bool {
        // Windows: 先检查服务模式
        #[cfg(target_os = "windows")]
        {
            use crate::system::WinServiceManager;

            // 如果服务正在运行，通过服务 API 查询 mihomo 状态
            if WinServiceManager::is_running().unwrap_or(false) {
                if let Ok(status) = WinServiceManager::get_status().await {
                    if status.mihomo_running {
                        log::debug!(
                            "is_running: Service mode, mihomo_running=true, pid={:?}",
                            status.mihomo_pid
                        );
                        return true;
                    }
                }
            }
        }

        // macOS: 检查 TUN 模式（通过 helper 启动）
        #[cfg(target_os = "macos")]
        {
            use crate::utils::{has_helper_pid_file, HELPER_PID_FILE};

            if has_helper_pid_file() {
                // 读取 helper PID 文件中的 PID
                if let Ok(content) = fs::read_to_string(HELPER_PID_FILE) {
                    if let Ok(pid) = content.trim().parse::<u32>() {
                        if Self::is_pid_running(pid) {
                            log::debug!(
                                "is_running: TUN mode via helper, mihomo_running=true, pid={}",
                                pid
                            );
                            return true;
                        } else {
                            // PID 文件存在但进程已退出，清理 PID 文件
                            log::debug!(
                                "is_running: TUN mode helper PID file exists but process {} not running, cleaning up",
                                pid
                            );
                            let _ = fs::remove_file(HELPER_PID_FILE);
                        }
                    }
                }
            }
        }

        // 普通模式：检查进程句柄（应用自己启动的）
        let process_guard = self.process.lock().await;
        if let Some(child) = process_guard.as_ref() {
            let pid = child.id();
            if Self::is_pid_running(pid) {
                return true;
            }
            // 进程已退出，状态会在下次 start 时通过 cleanup_stale_processes 清理
        }
        drop(process_guard);

        // 普通模式：检查 PID 文件
        if let Some(pid) = Self::load_pid() {
            if Self::is_pid_running(pid) {
                return true;
            }
            Self::remove_pid_file();
        }

        false
    }

    /// 健康检查
    pub async fn check_health(&self) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2)) // 优化：减少超时时间，本地 API 应该很快响应
            .connect_timeout(Duration::from_millis(500))
            .build()?;

        let url = format!("{}/version", self.api_url);

        let mut request = client.get(&url);
        if !self.api_secret.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", self.api_secret));
        }

        let response = request.send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "Health check failed with status: {}",
                response.status()
            ))
        }
    }

    /// 安全启动（如果已运行则跳过，否则启动）
    ///
    /// 适用于需要确保 mihomo 运行但不确定当前状态的场景
    #[allow(dead_code)]
    pub async fn ensure_running(&self) -> Result<()> {
        if self.is_running().await {
            // 额外验证健康状态
            match self.check_health().await {
                Ok(_) => {
                    log::debug!("MiHomo is already running and healthy");
                    return Ok(());
                }
                Err(e) => {
                    log::warn!("MiHomo is running but unhealthy: {}, attempting restart", e);
                    return self.restart().await;
                }
            }
        }

        self.start().await
    }

    /// 等待健康检查通过
    ///
    /// 在启动或重启后调用，确保 mihomo 完全就绪
    /// 使用指数退避策略，初始间隔 100ms
    #[allow(dead_code)]
    pub async fn wait_for_healthy(&self, timeout_secs: u64) -> Result<()> {
        let max_total_wait = Duration::from_secs(timeout_secs);
        let mut total_waited = Duration::ZERO;
        let mut current_interval = Duration::from_millis(100);
        let max_interval = Duration::from_millis(500);
        let mut attempt = 0;

        while total_waited < max_total_wait {
            attempt += 1;
            match self.check_health().await {
                Ok(_) => {
                    log::debug!(
                        "MiHomo healthy after {} attempts ({:?})",
                        attempt,
                        total_waited
                    );
                    return Ok(());
                }
                Err(e) => {
                    if total_waited + current_interval >= max_total_wait {
                        return Err(anyhow::anyhow!(
                            "Health check timeout after {:?}: {}",
                            total_waited,
                            e
                        ));
                    }
                    sleep(current_interval).await;
                    total_waited += current_interval;
                    current_interval = std::cmp::min(current_interval * 2, max_interval);
                }
            }
        }

        Err(anyhow::anyhow!("Health check timeout"))
    }

    /// 获取进程状态信息（用于调试）
    #[allow(dead_code)]
    pub async fn get_status_info(&self) -> String {
        let process_guard = self.process.lock().await;
        let has_handle = process_guard.is_some();
        let pid = process_guard.as_ref().map(|c| c.id());
        drop(process_guard);

        let pid_from_file = Self::load_pid();
        let is_running = self.is_running().await;

        format!(
            "has_handle={}, handle_pid={:?}, file_pid={:?}, is_running={}",
            has_handle, pid, pid_from_file, is_running
        )
    }
}

impl Drop for MihomoManager {
    fn drop(&mut self) {
        log::info!("MihomoManager is being dropped");
        self.stop_sync();
    }
}
