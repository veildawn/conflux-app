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
#[cfg(target_os = "windows")]
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

        // 1. 首先尝试通过 PID 文件清理
        if let Some(old_pid) = Self::load_pid() {
            log::debug!("Found old PID file with PID: {}", old_pid);
            Self::kill_process_by_pid(old_pid);
        }

        // 2. 然后通过进程名清理所有 mihomo 进程（更彻底）
        Self::kill_all_mihomo_processes();

        // 3. 删除 PID 文件
        Self::remove_pid_file();

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
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }

    /// 判断 PID 是否存在
    fn is_pid_running(pid: u32) -> bool {
        #[cfg(unix)]
        {
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

    /// 检查启用 TUN 模式时是否需要 UAC 权限提升
    ///
    /// 返回 true 如果：
    /// - 服务未运行（或未安装）
    /// - 且当前应用没有管理员权限
    #[cfg(windows)]
    pub fn is_tun_elevation_required() -> bool {
        use crate::system::WinServiceManager;

        // 如果服务正在运行，不需要 UAC（通过服务启动）
        let service_running = WinServiceManager::is_running().unwrap_or(false);
        if service_running {
            log::debug!("Service is running, no UAC required for TUN mode");
            return false;
        }

        // 如果已经是管理员权限，不需要 UAC
        if Self::is_running_as_admin() {
            log::debug!("Already running as admin, no UAC required for TUN mode");
            return false;
        }

        log::debug!("UAC elevation required for TUN mode (service not running, not admin)");
        true
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

    /// 以管理员权限启动 mihomo（Windows TUN 模式）
    ///
    /// 如果应用已经以管理员权限运行，直接启动
    /// 否则使用 PowerShell Start-Process -Verb RunAs 触发 UAC
    #[cfg(windows)]
    fn start_elevated(mihomo_path: &PathBuf, config_dir: &str, config_path: &str) -> Result<Child> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 检查当前进程是否已经有管理员权限
        if Self::is_running_as_admin() {
            log::info!("Already running as admin, starting mihomo directly...");

            // 直接启动 mihomo，无需 UAC
            let child = Command::new(mihomo_path)
                .current_dir(std::path::Path::new(config_dir))
                .args(["-d", config_dir, "-f", config_path])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?;

            log::info!(
                "MiHomo started directly with admin privileges, PID: {}",
                child.id()
            );
            return Ok(child);
        }

        // 需要请求管理员权限
        log::info!("Not running as admin, requesting elevation...");

        // 构建 mihomo 命令参数
        let args = format!("-d \"{}\" -f \"{}\"", config_dir, config_path);

        log::info!("Elevating mihomo: {} {}", mihomo_path.display(), args);

        // 使用 PowerShell 的 Start-Process -Verb RunAs 启动
        // 这会触发 UAC 对话框
        // -PassThru 让我们可以获取进程信息
        let ps_command = format!(
            "$ErrorActionPreference = 'Stop'; \
            try {{ \
                $proc = Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -WindowStyle Hidden -PassThru; \
                Write-Output $proc.Id; \
            }} catch {{ \
                Write-Error $_.Exception.Message; \
                exit 1; \
            }}",
            mihomo_path.display(),
            args
        );

        log::info!("UAC elevation requested, waiting for user confirmation...");

        // 同步执行 PowerShell，等待 UAC 结果
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
            .map_err(|e| anyhow::anyhow!("执行提权命令失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("UAC elevation failed or was cancelled: {}", stderr);

            // 检查是否是用户取消
            if stderr.contains("canceled")
                || stderr.contains("cancelled")
                || stderr.contains("拒绝")
                || stderr.contains("denied")
                || stderr.contains("The operation was canceled")
                || output.status.code() == Some(1)
            {
                return Err(anyhow::anyhow!("用户取消了管理员权限请求"));
            }

            return Err(anyhow::anyhow!("管理员权限请求失败: {}", stderr.trim()));
        }

        log::info!("UAC elevation completed successfully");

        // 解析 PowerShell 返回的实际 mihomo PID
        let stdout = String::from_utf8_lossy(&output.stdout);
        let actual_pid: Option<u32> = stdout.trim().parse().ok();

        if let Some(pid) = actual_pid {
            log::info!("MiHomo spawned with PID: {} (via UAC elevation)", pid);
            // 保存真正的 mihomo PID 到文件
            if let Ok(pid_file) = Self::get_pid_file_path() {
                if let Ok(mut file) = fs::File::create(&pid_file) {
                    let _ = file.write_all(pid.to_string().as_bytes());
                    log::info!("Saved MiHomo PID {} to {:?}", pid, pid_file);
                }
            }
        } else {
            log::warn!(
                "Could not parse mihomo PID from UAC elevation output: {}",
                stdout
            );
        }

        // 等待一小段时间让进程启动
        std::thread::sleep(std::time::Duration::from_millis(500));

        // 验证 mihomo 进程是否真的启动了
        if !Self::is_mihomo_process_running() {
            return Err(anyhow::anyhow!("管理员权限已授予，但 mihomo 启动失败"));
        }

        // 返回一个 dummy 进程作为占位符
        // 真正的 mihomo PID 已通过上面的逻辑保存到 PID 文件
        // 注意：caller 中的 save_pid 调用会覆盖这个 PID，但因为是 dummy 进程，
        // 我们需要在 start() 函数中跳过保存，或者在这里标记已保存
        let dummy = Command::new("cmd")
            .args(["/C", "timeout", "/t", "1", "/nobreak"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to create placeholder: {}", e))?;

        Ok(dummy)
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

    /// 杀死所有 mihomo 进程（通过进程名匹配）
    fn kill_all_mihomo_processes() {
        #[cfg(unix)]
        {
            // 使用 pkill 杀死所有 mihomo 进程
            log::debug!("Killing all mihomo processes");
            let _ = Command::new("pkill").args(["-9", "-f", "mihomo"]).output();
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            // Windows 上匹配可执行文件名
            let binary_name = crate::utils::get_mihomo_binary_name();
            // 尝试杀死当前版本的进程，以及可能存在的旧版本进程
            let targets = vec![binary_name, "mihomo.exe", "mihomo-core.exe"];

            log::debug!("Killing mihomo processes: {:?}", targets);
            for target in targets {
                let _ = Command::new("taskkill")
                    .args(["/F", "/IM", target])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
        }
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
        let (child, pid_already_saved) = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let tun_enabled = is_tun_enabled();

            log::info!(
                "Start check: tun_enabled={}, use_service_mode={}",
                tun_enabled,
                use_service_mode
            );

            // 优先级 1：如果服务正在运行且非开发模式，通过服务启动
            if use_service_mode {
                log::info!("Service is running, starting mihomo via service...");
                log::debug!("  mihomo_path: {:?}", mihomo_path);
                log::debug!("  config_dir: {}", config_dir_str);
                log::debug!("  config_path: {}", config_path_str);

                // 使用指数退避等待 IPC 就绪（最多 10 秒）
                // 服务模式下不需要重启 Windows 服务本身，只需等待 IPC 就绪
                // 重启 Windows 服务可能触发 UAC，违背服务模式的设计初衷
                if wait_for_service_ipc(Duration::from_secs(10)).await {
                    return self
                        .start_via_service(&mihomo_path, &config_dir_str, &config_path_str)
                        .await;
                }

                // 服务模式下 IPC 超时，返回错误而不是尝试重启服务或回退到 UAC
                // 用户选择服务模式就是为了避免 UAC
                log::error!("Service IPC not ready after 10 seconds");
                if tun_enabled {
                    return Err(anyhow::anyhow!(
                        "服务模式下无法启动增强模式：服务 IPC 未就绪。\n\
                        请检查 Conflux 服务是否正常运行，或尝试在设置中重启服务。"
                    ));
                } else {
                    // TUN 未启用，可以普通模式启动
                    log::info!("TUN not enabled, starting in normal mode...");
                    (
                        Command::new(&mihomo_path)
                            .current_dir(config_dir)
                            .args(["-d", &config_dir_str, "-f", &config_path_str])
                            .creation_flags(CREATE_NO_WINDOW)
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .spawn()
                            .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?,
                        false,
                    )
                }
            }
            // 优先级 2：TUN 启用但服务未运行，使用 UAC 提权
            else if tun_enabled {
                log::info!("TUN mode enabled but service not running, using UAC elevation...");
                // UAC 提权模式：start_elevated 已保存正确的 mihomo PID，返回 (child, true)
                (
                    Self::start_elevated(&mihomo_path, &config_dir_str, &config_path_str)?,
                    true,
                )
            }
            // 优先级 3：普通模式，直接启动
            else {
                log::info!("Starting mihomo in normal mode...");
                (
                    Command::new(&mihomo_path)
                        .current_dir(config_dir)
                        .args(["-d", &config_dir_str, "-f", &config_path_str])
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?,
                    false,
                )
            }
        };

        #[cfg(not(windows))]
        let (child, pid_already_saved) = (
            Command::new(&mihomo_path)
                .current_dir(config_dir)
                .args(["-d", &config_dir_str, "-f", &config_path_str])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?,
            false,
        );

        let pid = child.id();
        log::info!("MiHomo spawned with PID: {}", pid);

        // 保存 PID 到文件，以便下次启动时清理
        // 注意：UAC 提权模式下，PID 已在 start_elevated 中保存（保存的是真正的 mihomo PID）
        if !pid_already_saved {
            if let Err(e) = self.save_pid(pid) {
                log::warn!("Failed to save PID file: {}", e);
            }
        }

        // 优化：减少初始等待时间，从 500ms 降至 100ms
        sleep(Duration::from_millis(100)).await;

        *process_guard = Some(child);
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
    /// 简化的停止逻辑：动态判断停止方式，不依赖任何状态标志
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
                            "Failed to stop mihomo via service: {}, falling back to process kill",
                            e
                        );
                        Self::kill_all_mihomo_processes();
                    }
                    // 清理进程句柄和 PID 文件
                    self.process.lock().await.take();
                    Self::remove_pid_file();
                    log::info!("MiHomo stopped via service");
                    return Ok(());
                }
            }
        }

        // 其他情况：直接停止进程
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            let pid = child.id();
            log::info!("Stopping MiHomo process (PID: {})", pid);

            // 使用进程句柄的 kill 方法
            if let Err(e) = child.kill() {
                log::warn!("Failed to kill MiHomo process: {}", e);
                // 回退到直接通过 PID 杀死
                Self::kill_process_by_pid(pid);
            }

            Self::remove_pid_file();
            log::info!("MiHomo stopped");
        } else if let Some(pid) = Self::load_pid() {
            log::info!("Stopping MiHomo process by PID file (PID: {})", pid);
            Self::kill_process_by_pid(pid);
            Self::remove_pid_file();
        } else {
            // 最后尝试通过进程名清理（覆盖 UAC 模式等情况）
            #[cfg(windows)]
            {
                log::info!("No process handle or PID file, killing by process name...");
                Self::kill_all_mihomo_processes();
            }
        }

        Ok(())
    }

    /// 同步停止进程（用于应用退出时）
    ///
    /// 简化的停止逻辑：动态判断停止方式，不依赖任何状态标志
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
                    let _ = rt.block_on(async { WinServiceManager::stop_mihomo().await });
                }
            }
            // 无论服务停止是否成功，都通过进程名清理确保完全停止
            Self::kill_all_mihomo_processes();
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
            }
        } else {
            // 如果拿不到锁，通过 PID 文件清理
            log::warn!("Could not acquire lock, cleaning up via PID file");
            if let Some(pid) = Self::load_pid() {
                Self::kill_process_by_pid(pid);
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
    /// 4. 立即启动新进程
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
            Self::cleanup_stale_processes();
            // 清理后短暂等待
            sleep(Duration::from_millis(200)).await;
        }

        // 启动新进程
        self.start().await?;

        log::info!("MiHomo restarted successfully");
        Ok(())
    }

    /// 检查进程是否正在运行
    ///
    /// 简化的检测逻辑：不依赖任何状态标志，只检查进程是否存在
    /// 无论是服务模式、UAC 模式还是普通模式启动，最终都是 mihomo 进程在运行
    pub async fn is_running(&self) -> bool {
        // 1. 先检查进程句柄（应用自己启动的）
        let process_guard = self.process.lock().await;
        if let Some(child) = process_guard.as_ref() {
            let pid = child.id();
            if Self::is_pid_running(pid) {
                return true;
            }
            // 进程已退出，状态会在下次 start 时通过 cleanup_stale_processes 清理
        }
        drop(process_guard);

        // 2. 检查 PID 文件
        if let Some(pid) = Self::load_pid() {
            if Self::is_pid_running(pid) {
                return true;
            }
            Self::remove_pid_file();
        }

        // 3. 最后通过进程名检测（覆盖服务模式、UAC 模式等所有情况）
        #[cfg(windows)]
        {
            return Self::is_mihomo_process_running();
        }

        #[cfg(not(windows))]
        false
    }

    /// 检查 mihomo 进程是否在运行（通过进程名）
    /// 优化：使用 Windows API (CreateToolhelp32Snapshot) 替代 tasklist 命令
    /// 性能提升约 20 倍（从 ~100ms 降至 ~5ms）
    #[cfg(windows)]
    fn is_mihomo_process_running() -> bool {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        // Windows API 常量和结构
        const TH32CS_SNAPPROCESS: u32 = 0x00000002;
        const INVALID_HANDLE_VALUE: isize = -1;
        const MAX_PATH: usize = 260;

        #[repr(C)]
        struct PROCESSENTRY32W {
            dw_size: u32,
            cnt_usage: u32,
            th32_process_id: u32,
            th32_default_heap_id: usize,
            th32_module_id: u32,
            cnt_threads: u32,
            th32_parent_process_id: u32,
            pc_pri_class_base: i32,
            dw_flags: u32,
            sz_exe_file: [u16; MAX_PATH],
        }

        extern "system" {
            fn CreateToolhelp32Snapshot(
                dw_flags: u32,
                th32_process_id: u32,
            ) -> *mut std::ffi::c_void;
            fn Process32FirstW(
                h_snapshot: *mut std::ffi::c_void,
                lppe: *mut PROCESSENTRY32W,
            ) -> i32;
            fn Process32NextW(h_snapshot: *mut std::ffi::c_void, lppe: *mut PROCESSENTRY32W)
                -> i32;
            fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
        }

        let binary_name = crate::utils::get_mihomo_binary_name();
        // 获取用于匹配的短名称（前 20 个字符）
        let name_prefix = binary_name.trim_end_matches(".exe");
        let match_prefix = if name_prefix.len() > 20 {
            &name_prefix[..20]
        } else {
            name_prefix
        };

        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE as *mut std::ffi::c_void {
                log::warn!("Failed to create process snapshot");
                return false;
            }

            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dw_size = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            let mut found = false;

            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    // 将 UTF-16 进程名转换为 Rust 字符串
                    let name_len = entry
                        .sz_exe_file
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(MAX_PATH);
                    let process_name = OsString::from_wide(&entry.sz_exe_file[..name_len]);

                    if let Some(name_str) = process_name.to_str() {
                        // 检查进程名是否匹配
                        if name_str.contains(match_prefix) || name_str == binary_name {
                            found = true;
                            break;
                        }
                    }

                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }

            CloseHandle(snapshot);
            found
        }
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
