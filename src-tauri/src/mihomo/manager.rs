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

/// 检查服务模式是否可用（包括 IPC 是否就绪）
#[cfg(target_os = "windows")]
fn is_service_available() -> bool {
    use crate::system::WinServiceManager;
    
    // 检查服务是否已安装并运行
    if let Ok(installed) = WinServiceManager::is_installed() {
        if installed {
            if let Ok(running) = WinServiceManager::is_running() {
                if running {
                    // 进一步检查 IPC 是否真的可用
                    return is_service_ipc_ready();
                }
            }
        }
    }
    false
}

/// 检查服务 IPC 是否就绪
#[cfg(target_os = "windows")]
fn is_service_ipc_ready() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;
    
    const SERVICE_PORT: u16 = 33211;
    
    // 尝试连接 IPC 端口
    match TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", SERVICE_PORT).parse().unwrap(),
        Duration::from_millis(500),
    ) {
        Ok(_) => true,
        Err(_) => {
            log::debug!("Service IPC not ready yet");
            false
        }
    }
}

/// MiHomo 进程管理器
pub struct MihomoManager {
    process: Arc<Mutex<Option<Child>>>,
    config_path: PathBuf,
    api_url: String,
    api_secret: String,
    /// 是否通过服务模式启动（用于 TUN 模式）
    #[cfg(target_os = "windows")]
    service_mode: Arc<Mutex<bool>>,
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
            #[cfg(target_os = "windows")]
            service_mode: Arc::new(Mutex::new(false)),
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
        log::info!("Cleaning up stale MiHomo processes...");

        // 1. 首先尝试通过 PID 文件清理
        if let Some(old_pid) = Self::load_pid() {
            log::info!("Found old PID file with PID: {}", old_pid);
            Self::kill_process_by_pid(old_pid);
        }

        // 2. 然后通过进程名清理所有 mihomo 进程（更彻底）
        Self::kill_all_mihomo_processes();

        // 3. 删除 PID 文件
        Self::remove_pid_file();

        log::info!("Cleanup completed");
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
                fn GetExitCodeProcess(
                    hProcess: *mut std::ffi::c_void,
                    lpExitCode: *mut u32,
                ) -> i32;
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

            let mut elevation = TokenElevation { token_is_elevated: 0 };
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
    fn start_elevated(
        mihomo_path: &PathBuf,
        config_dir: &str,
        config_path: &str,
    ) -> Result<Child> {
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
            
            log::info!("MiHomo started directly with admin privileges, PID: {}", child.id());
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
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| anyhow::anyhow!("执行提权命令失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("UAC elevation failed or was cancelled: {}", stderr);
            
            // 检查是否是用户取消
            if stderr.contains("canceled") || stderr.contains("cancelled") 
                || stderr.contains("拒绝") || stderr.contains("denied")
                || stderr.contains("The operation was canceled")
                || output.status.code() == Some(1) {
                return Err(anyhow::anyhow!("用户取消了管理员权限请求"));
            }
            
            return Err(anyhow::anyhow!("管理员权限请求失败: {}", stderr.trim()));
        }

        log::info!("UAC elevation completed successfully");

        // 等待一小段时间让进程启动
        std::thread::sleep(std::time::Duration::from_millis(500));

        // 验证 mihomo 进程是否真的启动了
        if !Self::is_mihomo_process_running() {
            return Err(anyhow::anyhow!("管理员权限已授予，但 mihomo 启动失败"));
        }

        // 返回一个 dummy 进程作为占位符
        // 真正的 mihomo 进程由 PowerShell 启动，通过进程名来管理
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

        // 标记为服务模式
        {
            let mut service_mode = self.service_mode.lock().await;
            *service_mode = true;
        }

        // 等待健康检查
        let max_retries = 15;
        let retry_interval = Duration::from_secs(2);

        for attempt in 1..=max_retries {
            log::debug!("Health check attempt {}/{}", attempt, max_retries);

            match self.check_health().await {
                Ok(_) => {
                    log::info!("MiHomo started successfully via service after {} attempts", attempt);
                    return Ok(());
                }
                Err(e) => {
                    if attempt == max_retries {
                        log::error!(
                            "MiHomo health check failed after {} attempts: {}",
                            max_retries,
                            e
                        );
                        // 停止 mihomo
                        let _ = WinServiceManager::stop_mihomo().await;
                        // 重置服务模式标志
                        {
                            let mut service_mode = self.service_mode.lock().await;
                            *service_mode = false;
                        }
                        return Err(anyhow::anyhow!("MiHomo failed to start: {}", e));
                    }
                    log::debug!(
                        "Health check failed (attempt {}): {}, retrying...",
                        attempt,
                        e
                    );
                    sleep(retry_interval).await;
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
            // 匹配所有包含 "mihomo" 的进程
            log::info!("Killing all processes matching: mihomo");

            let _ = Command::new("pkill").args(["-9", "-f", "mihomo"]).output();
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            // Windows 上匹配可执行文件名
            let binary_name = crate::utils::get_mihomo_binary_name();
            log::info!("Killing all processes matching: {}", binary_name);
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", binary_name])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }

    /// 启动 MiHomo 进程
    pub async fn start(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if process_guard.is_some() {
            log::info!("MiHomo is already running");
            return Ok(());
        }

        // 在启动新进程前，清理所有残留的旧进程
        Self::cleanup_stale_processes();

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
            use crate::system::WinServiceManager;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            
            // 检查是否需要 TUN 模式
            if is_tun_enabled() {
                log::info!("TUN mode enabled, checking service mode...");
                
                // 检查服务是否已安装
                let service_installed = WinServiceManager::is_installed().unwrap_or(false);
                let service_running = WinServiceManager::is_running().unwrap_or(false);
                
                if service_installed && service_running {
                    // 服务已安装并运行，等待 IPC 就绪
                    log::info!("Service is running, waiting for IPC to be ready...");
                    log::info!("  mihomo_path: {:?}", mihomo_path);
                    log::info!("  config_dir: {}", config_dir_str);
                    log::info!("  config_path: {}", config_path_str);
                    
                    // 最多等待 5 秒
                    for i in 0..10 {
                        if is_service_ipc_ready() {
                            log::info!("Service IPC ready after {} attempts", i + 1);
                            return self.start_via_service(&mihomo_path, &config_dir_str, &config_path_str).await;
                        }
                        sleep(Duration::from_millis(500)).await;
                    }
                    
                    log::warn!("Service IPC not ready after 5 seconds, falling back to UAC elevation");
                } else if service_installed {
                    log::info!("Service is installed but not running, using UAC elevation...");
                } else {
                    log::info!("Service not installed, using UAC elevation...");
                }
                
                // 服务不可用，使用 UAC 提权方式
                Self::start_elevated(&mihomo_path, &config_dir_str, &config_path_str)?
            } else {
                // 普通模式，直接启动
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

        #[cfg(not(windows))]
        let child = Command::new(&mihomo_path)
            .current_dir(config_dir)
            .args(["-d", &config_dir_str, "-f", &config_path_str])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?;

        let pid = child.id();
        log::info!("MiHomo spawned with PID: {}", pid);

        // 保存 PID 到文件，以便下次启动时清理
        if let Err(e) = self.save_pid(pid) {
            log::warn!("Failed to save PID file: {}", e);
        }

        // 稍微等待一下，让进程启动
        sleep(Duration::from_millis(500)).await;

        *process_guard = Some(child);
        drop(process_guard);

        // 等待启动完成，使用重试机制
        // mihomo 首次启动可能需要下载 GeoIP 数据库，最多等待 30 秒
        let max_retries = 15;
        let retry_interval = Duration::from_secs(2);

        for attempt in 1..=max_retries {
            log::debug!("Health check attempt {}/{}", attempt, max_retries);

            match self.check_health().await {
                Ok(_) => {
                    log::info!("MiHomo started successfully after {} attempts", attempt);
                    return Ok(());
                }
                Err(e) => {
                    if attempt == max_retries {
                        log::error!(
                            "MiHomo health check failed after {} attempts: {}",
                            max_retries,
                            e
                        );
                        // 尝试清理进程
                        let _ = self.stop().await;
                        return Err(anyhow::anyhow!("MiHomo failed to start: {}", e));
                    }
                    log::debug!(
                        "Health check failed (attempt {}): {}, retrying...",
                        attempt,
                        e
                    );
                    sleep(retry_interval).await;
                }
            }
        }

        Err(anyhow::anyhow!(
            "MiHomo failed to start: health check timeout"
        ))
    }

    /// 停止 MiHomo 进程
    pub async fn stop(&self) -> Result<()> {
        // Windows 服务模式下，通过服务 API 停止
        #[cfg(target_os = "windows")]
        {
            let is_service_mode = {
                let service_mode = self.service_mode.lock().await;
                *service_mode
            };

            if is_service_mode {
                log::info!("Stopping MiHomo via service...");
                use crate::system::WinServiceManager;
                if let Err(e) = WinServiceManager::stop_mihomo().await {
                    log::warn!("Failed to stop mihomo via service: {}", e);
                    // 尝试通过进程名清理
                    Self::kill_all_mihomo_processes();
                }
                // 重置服务模式标志
                {
                    let mut service_mode = self.service_mode.lock().await;
                    *service_mode = false;
                }
                // 清理 process_guard，避免下次 start() 时误判
                {
                    let mut process_guard = self.process.lock().await;
                    let _ = process_guard.take();
                }
                // 删除 PID 文件
                Self::remove_pid_file();
                log::info!("MiHomo stopped via service");
                return Ok(());
            }
        }

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

            // 删除 PID 文件
            Self::remove_pid_file();

            log::info!("MiHomo stopped");
        } else if let Some(pid) = Self::load_pid() {
            log::info!("Stopping MiHomo process by PID file (PID: {})", pid);
            Self::kill_process_by_pid(pid);
            Self::remove_pid_file();
        }

        Ok(())
    }

    /// 同步停止进程（用于应用退出时）
    pub fn stop_sync(&self) {
        log::info!("Synchronously stopping MiHomo...");

        // Windows 服务模式下，通过服务 API 停止
        #[cfg(target_os = "windows")]
        {
            if let Ok(service_mode) = self.service_mode.try_lock() {
                if *service_mode {
                    log::info!("Stopping MiHomo via service (sync)...");
                    // 使用阻塞方式调用服务 API
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build();
                    if let Ok(rt) = rt {
                        use crate::system::WinServiceManager;
                        let _ = rt.block_on(async {
                            WinServiceManager::stop_mihomo().await
                        });
                    }
                    // 也尝试通过进程名清理确保完全停止
                    Self::kill_all_mihomo_processes();
                    log::info!("MiHomo stopped via service (sync)");
                    return;
                }
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
    /// 2. 等待进程完全停止
    /// 3. 清理残留进程
    /// 4. 启动新进程
    /// 5. 等待健康检查通过
    pub async fn restart(&self) -> Result<()> {
        log::info!("Restarting MiHomo...");

        // 停止当前进程
        self.stop().await?;

        // 等待进程完全停止，最多等待 3 秒
        for i in 0..6 {
            sleep(Duration::from_millis(500)).await;
            if !self.is_running().await {
                log::debug!("MiHomo stopped after {} ms", (i + 1) * 500);
                break;
            }
        }

        // 额外清理可能的残留进程
        Self::cleanup_stale_processes();

        // 短暂等待后启动
        sleep(Duration::from_millis(200)).await;

        // 启动新进程
        self.start().await?;

        log::info!("MiHomo restarted successfully");
        Ok(())
    }

    /// 检查进程是否正在运行
    pub async fn is_running(&self) -> bool {
        // Windows 服务模式下，通过服务 API 查询或进程名检测
        #[cfg(windows)]
        {
            let is_service_mode = {
                let service_mode = self.service_mode.lock().await;
                *service_mode
            };

            if is_service_mode {
                // 服务模式下，通过进程名检测
                return Self::is_mihomo_process_running();
            }

            // 检查服务是否正在运行，且服务报告 mihomo 是通过服务启动的
            // 这处理应用重启后的情况
            if is_service_available() {
                // 查询服务状态确认 mihomo 确实是通过服务启动的
                if let Ok(status) = crate::system::WinServiceManager::get_status().await {
                    if status.mihomo_running {
                        log::info!("Detected mihomo running via service (PID: {:?}), restoring service_mode", status.mihomo_pid);
                        let mut service_mode = self.service_mode.lock().await;
                        *service_mode = true;
                        return true;
                    }
                }
            }

            // 非服务模式但 TUN 启用时（可能是 UAC 提权方式）
            if is_tun_enabled() {
                return Self::is_mihomo_process_running();
            }
        }

        let process_guard = self.process.lock().await;
        if let Some(child) = process_guard.as_ref() {
            // 检查进程是否还存在
            let pid = child.id();
            if Self::is_pid_running(pid) {
                return true;
            }
            // 进程已退出，但由于我们持有的是不可变引用，这里不能清理
            // 状态会在下次 start 时通过 cleanup_stale_processes 清理
            return false;
        }
        drop(process_guard);

        // 进程句柄丢失时，尝试通过 PID 文件判断
        if let Some(pid) = Self::load_pid() {
            if Self::is_pid_running(pid) {
                return true;
            }
            Self::remove_pid_file();
        }

        // 最后通过进程名检测
        #[cfg(windows)]
        {
            return Self::is_mihomo_process_running();
        }

        #[cfg(not(windows))]
        false
    }

    /// 检查 mihomo 进程是否在运行（通过进程名）
    #[cfg(windows)]
    fn is_mihomo_process_running() -> bool {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let binary_name = crate::utils::get_mihomo_binary_name();
        let output = Command::new("tasklist")
            .args(["/FI", &format!("IMAGENAME eq {}", binary_name), "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                // tasklist 可能截断进程名，所以只检查不带 .exe 的前缀
                // 例如 "mihomo-x86_64-pc-windows-msvc.exe" 可能显示为 "mihomo-x86_64-pc-windows-"
                let name_prefix = binary_name.trim_end_matches(".exe");
                let name_short = if name_prefix.len() > 20 {
                    &name_prefix[..20]
                } else {
                    name_prefix
                };
                stdout.contains(name_short) && !stdout.contains("INFO: No tasks")
            }
            Err(_) => false,
        }
    }

    /// 健康检查
    pub async fn check_health(&self) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
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
    #[allow(dead_code)]
    pub async fn wait_for_healthy(&self, timeout_secs: u64) -> Result<()> {
        let max_attempts = timeout_secs * 2; // 每 500ms 检查一次

        for attempt in 1..=max_attempts {
            match self.check_health().await {
                Ok(_) => {
                    log::debug!("MiHomo healthy after {} attempts", attempt);
                    return Ok(());
                }
                Err(e) => {
                    if attempt == max_attempts {
                        return Err(anyhow::anyhow!(
                            "Health check timeout after {} seconds: {}",
                            timeout_secs,
                            e
                        ));
                    }
                    sleep(Duration::from_millis(500)).await;
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
