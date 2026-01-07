use anyhow::Result;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::utils::{ensure_mihomo_in_data_dir, get_app_data_dir, get_mihomo_config_path};

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
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new(&mihomo_path)
                .current_dir(config_dir)
                .args(["-d", &config_dir_str, "-f", &config_path_str])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn mihomo: {}", e))?
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

        false
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
