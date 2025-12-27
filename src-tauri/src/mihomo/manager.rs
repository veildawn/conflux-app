use anyhow::Result;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::utils::{get_app_data_dir, get_mihomo_config_path};

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

    /// 获取 API URL
    #[allow(dead_code)]
    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    /// 获取 API Secret
    #[allow(dead_code)]
    pub fn api_secret(&self) -> &str {
        &self.api_secret
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
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }
    }

    /// 杀死所有 mihomo 进程（通过进程名匹配）
    fn kill_all_mihomo_processes() {
        #[cfg(unix)]
        {
            // 使用 pkill 杀死所有 mihomo 进程
            let binary_name = crate::utils::get_mihomo_binary_name();
            log::info!("Killing all processes matching: {}", binary_name);
            
            let _ = Command::new("pkill")
                .args(["-9", "-f", &binary_name])
                .output();
        }
        #[cfg(windows)]
        {
            let binary_name = crate::utils::get_mihomo_binary_name();
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", &binary_name])
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

        // 获取 MiHomo 二进制路径
        let mihomo_path = self.get_mihomo_binary_path()?;
        
        if !mihomo_path.exists() {
            return Err(anyhow::anyhow!(
                "MiHomo binary not found at: {:?}. Please download MiHomo and place it in the resources directory.",
                mihomo_path
            ));
        }

        log::info!("Starting MiHomo from: {:?}", mihomo_path);
        log::info!("Config path: {:?}", self.config_path);

        // 确保配置目录存在
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
            log::debug!("Ensured config dir exists: {:?}", parent);
        }

        // 启动进程
        // 注意：在开发环境中，我们尝试将 CWD 设置为配置目录的父目录，
        // 或者显式设置 working directory 为 config 所在目录，防止 GeoIP 查找失败
        
        let config_dir = self.config_path.parent().unwrap();
        
        log::info!("Spawning MiHomo with CWD: {:?}", config_dir);
        
        // 在 GUI 应用中，不能使用 Stdio::inherit()，因为 GUI 应用没有标准的
        // stdout/stderr 可以继承，这会导致进程卡死（UE 状态）
        // 使用 Stdio::null() 让进程独立运行
        let mut child = Command::new(&mihomo_path)
            .current_dir(config_dir)
            .arg("-d")
            .arg(config_dir)
            .arg("-f")
            .arg(&self.config_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                log::error!("Failed to spawn mihomo process: {}", e);
                e
            })?;

        let pid = child.id();
        log::info!("MiHomo process spawned with PID: {}", pid);

        // 保存 PID 到文件，以便下次启动时清理
        if let Err(e) = self.save_pid(pid) {
            log::warn!("Failed to save PID file: {}", e);
        }

        // 稍微等待一下，检查进程是否立即退出
        sleep(Duration::from_millis(500)).await;
        
        match child.try_wait() {
            Ok(Some(status)) => {
                log::error!("MiHomo process exited IMMEDIATELY with status: {}", status);
                return Err(anyhow::anyhow!("MiHomo process exited immediately with status: {}", status));
            }
            Ok(None) => {
                 log::info!("MiHomo process is running...");
            }
            Err(e) => {
                 log::error!("Failed to check process status: {}", e);
            }
        }

        *process_guard = Some(child);
        drop(process_guard);

        // 等待启动完成，使用重试机制
        // mihomo 首次启动可能需要下载 GeoIP 数据库，最多等待 30 秒
        let max_retries = 15;
        let retry_interval = Duration::from_secs(2);
        
        for attempt in 1..=max_retries {
            log::debug!("Health check attempt {}/{}", attempt, max_retries);

            // 检查进程是否还在运行
            let mut process_guard = self.process.lock().await;
            if let Some(child) = process_guard.as_mut() {
                 match child.try_wait() {
                    Ok(Some(status)) => {
                        log::error!("MiHomo process exited unexpectedly with status: {}", status);
                        return Err(anyhow::anyhow!("MiHomo process exited unexpectedly with status: {}", status));
                    }
                    Ok(None) => {
                        // 还在运行
                    }
                    Err(e) => {
                        log::error!("Error checking process status: {}", e);
                    }
                 }
            }
            drop(process_guard);
            
            match self.check_health().await {
                Ok(_) => {
                    log::info!("MiHomo started successfully after {} attempts", attempt);
                    return Ok(());
                }
                Err(e) => {
                    if attempt == max_retries {
                        log::error!("MiHomo health check failed after {} attempts: {}", max_retries, e);
                        // 尝试清理进程
                        let _ = self.stop().await;
                        return Err(anyhow::anyhow!("MiHomo failed to start: {}", e));
                    }
                    log::debug!("Health check failed (attempt {}): {}, retrying...", attempt, e);
                    sleep(retry_interval).await;
                }
            }
        }
        
        Err(anyhow::anyhow!("MiHomo failed to start: health check timeout"))
    }

    /// 停止 MiHomo 进程
    pub async fn stop(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;
        
        if let Some(mut child) = process_guard.take() {
            log::info!("Stopping MiHomo process");
            
            // 尝试优雅关闭
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(child.id() as i32, libc::SIGTERM);
                }
                sleep(Duration::from_millis(500)).await;
            }
            
            // 强制终止
            match child.kill() {
                Ok(_) => log::info!("MiHomo process killed"),
                Err(e) => log::warn!("Failed to kill MiHomo process: {}", e),
            }
            
            let _ = child.wait();
            
            // 删除 PID 文件
            Self::remove_pid_file();
            
            log::info!("MiHomo stopped");
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
                
                #[cfg(unix)]
                {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(300));
                }
                
                let _ = child.kill();
                let _ = child.wait();
                log::info!("MiHomo process stopped");
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
    pub async fn restart(&self) -> Result<()> {
        log::info!("Restarting MiHomo");
        self.stop().await?;
        sleep(Duration::from_millis(500)).await;
        self.start().await?;
        Ok(())
    }

    /// 检查进程是否正在运行
    pub async fn is_running(&self) -> bool {
        let process_guard = self.process.lock().await;
        if let Some(child) = process_guard.as_ref() {
            // 检查进程是否还存在
            #[cfg(unix)]
            {
                unsafe { libc::kill(child.id() as i32, 0) == 0 }
            }
            #[cfg(windows)]
            {
                true // Windows 上简单返回 true
            }
        } else {
            false
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

    /// 获取 MiHomo 二进制路径
    fn get_mihomo_binary_path(&self) -> Result<PathBuf> {
        let binary_name = crate::utils::get_mihomo_binary_name();
        
        log::debug!("Looking for MiHomo binary: {}", binary_name);
        
        // 首先检查应用数据目录
        let data_dir = get_app_data_dir()?;
        let data_path = data_dir.join(binary_name);
        log::debug!("Checking data path: {:?}", data_path);
        if data_path.exists() {
            log::info!("Found MiHomo at data path: {:?}", data_path);
            return Ok(data_path);
        }

        // 获取可执行文件目录
        let current_exe = std::env::current_exe()?;
        let current_dir = current_exe
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?
            .to_path_buf();
        
        log::debug!("Current exe: {:?}", current_exe);
        log::debug!("Current dir: {:?}", current_dir);

        // 检查当前目录的 resources 子目录 (通用路径，适用于开发环境和部分打包场景)
        let resource_path = current_dir.join("resources").join(binary_name);
        log::debug!("Checking resource path: {:?}", resource_path);
        if resource_path.exists() {
            log::info!("Found MiHomo at resource path: {:?}", resource_path);
            return Ok(resource_path);
        }

        // macOS 应用包内的资源路径
        // 结构: Conflux.app/Contents/MacOS/Conflux -> Conflux.app/Contents/Resources/resources/
        #[cfg(target_os = "macos")]
        {
            let bundle_path = current_dir
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("Resources").join("resources").join(binary_name));
            if let Some(ref path) = bundle_path {
                log::debug!("Checking macOS bundle path: {:?}", path);
                if path.exists() {
                    log::info!("Found MiHomo at bundle path: {:?}", path);
                    return Ok(path.clone());
                }
            }
        }

        // Windows 打包后的资源路径
        // 结构: Conflux/Conflux.exe -> Conflux/resources/
        // NSIS/MSI 安装后可能在不同位置，尝试多个可能的路径
        #[cfg(target_os = "windows")]
        {
            // 方式1: 直接在 exe 同级的 resources 目录 (已在上面检查过)
            // 方式2: 检查 exe 同级目录直接放置的二进制文件
            let same_dir_path = current_dir.join(binary_name);
            log::debug!("Checking Windows same dir path: {:?}", same_dir_path);
            if same_dir_path.exists() {
                log::info!("Found MiHomo at Windows same dir: {:?}", same_dir_path);
                return Ok(same_dir_path);
            }

            // 方式3: 某些安装方式可能放在 bin 目录
            let bin_path = current_dir.join("bin").join(binary_name);
            log::debug!("Checking Windows bin path: {:?}", bin_path);
            if bin_path.exists() {
                log::info!("Found MiHomo at Windows bin path: {:?}", bin_path);
                return Ok(bin_path);
            }
        }

        // 开发环境路径 - 相对于项目根目录
        // 在开发模式下，工作目录通常是项目根目录
        let dev_path = PathBuf::from("src-tauri/resources").join(binary_name);
        log::debug!("Checking dev path: {:?}", dev_path);
        if dev_path.exists() {
            log::info!("Found MiHomo at dev path: {:?}", dev_path);
            return Ok(dev_path);
        }

        // 开发环境备选路径 - 从 target/debug 目录往上找
        // target/debug/conflux -> target/debug -> target -> src-tauri -> src-tauri/resources
        if let Some(target_dir) = current_dir.parent() {
            if let Some(src_tauri) = target_dir.parent() {
                let alt_dev_path = src_tauri.join("resources").join(binary_name);
                log::debug!("Checking alt dev path: {:?}", alt_dev_path);
                if alt_dev_path.exists() {
                    log::info!("Found MiHomo at alt dev path: {:?}", alt_dev_path);
                    return Ok(alt_dev_path);
                }
            }
        }

        log::error!("MiHomo binary '{}' not found. Searched paths:", binary_name);
        log::error!("  - Data dir: {:?}", data_path);
        log::error!("  - Resource dir: {:?}", resource_path);
        #[cfg(target_os = "macos")]
        {
            let bundle_path = current_dir
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("Resources").join("resources").join(binary_name));
            log::error!("  - macOS bundle: {:?}", bundle_path);
        }
        #[cfg(target_os = "windows")]
        {
            log::error!("  - Windows same dir: {:?}", current_dir.join(binary_name));
            log::error!("  - Windows bin dir: {:?}", current_dir.join("bin").join(binary_name));
        }
        log::error!("  - Dev path: {:?}", dev_path);

        // 返回默认路径（即使不存在）
        Ok(data_path)
    }
}

impl Drop for MihomoManager {
    fn drop(&mut self) {
        log::info!("MihomoManager is being dropped");
        self.stop_sync();
    }
}
