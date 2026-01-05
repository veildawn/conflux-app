use anyhow::{Result, anyhow};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;
use std::process::{Child, Command, Stdio};
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

/// Sub-Store 进程管理器
pub struct SubStoreManager {
    process: Arc<Mutex<Option<Child>>>,
    api_url: String,
    api_port: u16,
}

impl SubStoreManager {
    /// 创建新的 Sub-Store 管理器
    pub fn new(port: Option<u16>) -> Result<Self> {
        let api_port = port.unwrap_or(3001);

        Ok(Self {
            process: Arc::new(Mutex::new(None)),
            api_url: format!("http://127.0.0.1:{}", api_port),
            api_port,
        })
    }

    /// 获取 API URL
    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    /// 获取 API 端口
    pub fn api_port(&self) -> u16 {
        self.api_port
    }

    /// 获取平台特定的目标三元组
    fn get_target_triple() -> &'static str {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        return "aarch64-apple-darwin";

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        return "x86_64-apple-darwin";

        #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
        return "x86_64-unknown-linux-gnu";

        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        return "x86_64-pc-windows-msvc";

        #[cfg(not(any(
            all(target_os = "macos", target_arch = "aarch64"),
            all(target_os = "macos", target_arch = "x86_64"),
            all(target_os = "linux", target_arch = "x86_64"),
            all(target_os = "windows", target_arch = "x86_64")
        )))]
        compile_error!("Unsupported platform");
    }

    /// 获取 Node.js 二进制文件路径
    /// 
    /// Tauri externalBin 会自动处理跨平台路径：
    /// - 开发模式：从 src-tauri/binaries/node-{target_triple}[.exe] 读取
    /// - 生产模式：
    ///   - Windows: 与主程序同级 (Conflux/node.exe)
    ///   - macOS: Contents/MacOS/node
    ///   - Linux: 与主程序同级
    fn get_node_binary_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let node_name = if cfg!(debug_assertions) {
            format!("node-{}{}", Self::get_target_triple(), if cfg!(windows) { ".exe" } else { "" })
        } else {
            format!("node{}", if cfg!(windows) { ".exe" } else { "" })
        };

        let node_binary = if cfg!(debug_assertions) {
            // 开发模式：从项目目录的 binaries 加载
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
            let project_dir = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| anyhow!("Failed to determine project root"))?;
            project_dir.join("src-tauri").join("binaries").join(&node_name)
        } else {
            // 生产模式：externalBin 被 Tauri 放在主程序同级目录
            // Tauri 会处理 macOS 的 Contents/MacOS 路径
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
            let exe_dir = exe_path
                .parent()
                .ok_or_else(|| anyhow!("Failed to get exe directory"))?;
            exe_dir.join(&node_name)
        };

        // 添加调试日志
        log::debug!("Looking for node binary at: {:?}", node_binary);

        if !node_binary.exists() {
            // 备用方案：尝试使用 resource_dir
            let fallback = app_handle
                .path()
                .resource_dir()
                .ok()
                .map(|d| d.join(&node_name));
            
            if let Some(ref path) = fallback {
                if path.exists() {
                    log::info!("Found node binary in resource_dir: {:?}", path);
                    return Ok(path.clone());
                }
            }
            
            return Err(anyhow!("Node.js binary not found at: {:?} or {:?}", node_binary, fallback));
        }

        Ok(node_binary)
    }

    /// 获取 Sub-Store 脚本路径
    /// 
    /// 使用 Tauri 的 resource_dir() 统一处理跨平台路径
    fn get_substore_script_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let script_path = if cfg!(debug_assertions) {
            // 开发模式：从项目目录加载
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
            let project_dir = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| anyhow!("Failed to determine project root"))?;
            project_dir
                .join("src-tauri")
                .join("resources")
                .join("sub-store")
                .join("run-substore.js")
        } else {
            // 生产模式：使用 Tauri 的 resource_dir() - 统一处理所有平台
            app_handle
                .path()
                .resource_dir()
                .map_err(|e| anyhow!("Failed to get resource dir: {}", e))?
                .join("resources")
                .join("sub-store")
                .join("run-substore.js")
        };

        log::debug!("Looking for Sub-Store script at: {:?}", script_path);

        if !script_path.exists() {
            return Err(anyhow!("Sub-Store script not found at: {:?}", script_path));
        }

        Ok(script_path)
    }

    /// 获取 Sub-Store 前端路径
    /// 
    /// 使用 Tauri 的 resource_dir() 统一处理跨平台路径
    fn get_frontend_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let frontend_path = if cfg!(debug_assertions) {
            // 开发模式
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
            let project_dir = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| anyhow!("Failed to determine project root"))?;
            project_dir
                .join("src-tauri")
                .join("resources")
                .join("sub-store")
                .join("frontend")
        } else {
            // 生产模式：使用 Tauri 的 resource_dir() - 统一处理所有平台
            app_handle
                .path()
                .resource_dir()
                .map_err(|e| anyhow!("Failed to get resource dir: {}", e))?
                .join("resources")
                .join("sub-store")
                .join("frontend")
        };

        log::debug!("Frontend path: {:?}", frontend_path);
        Ok(frontend_path)
    }

    /// 获取 Sub-Store 默认数据文件路径
    /// 
    /// 使用 Tauri 的 resource_dir() 统一处理跨平台路径
    fn get_default_data_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let data_path = if cfg!(debug_assertions) {
            // 开发模式：从项目目录加载
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
            let project_dir = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| anyhow!("Failed to determine project root"))?;
            project_dir
                .join("src-tauri")
                .join("resources")
                .join("sub-store")
                .join("sub-store.json")
        } else {
            // 生产模式：使用 Tauri 的 resource_dir() - 统一处理所有平台
            app_handle
                .path()
                .resource_dir()
                .map_err(|e| anyhow!("Failed to get resource dir: {}", e))?
                .join("resources")
                .join("sub-store")
                .join("sub-store.json")
        };

        log::debug!("Looking for default data file at: {:?}", data_path);

        if !data_path.exists() {
            return Err(anyhow!("Default Sub-Store data file not found at: {:?}", data_path));
        }

        Ok(data_path)
    }

    /// 获取 Sub-Store 数据文件路径
    pub fn get_data_file_path(&self, app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let data_dir = Self::ensure_data_directory(app_handle)?;
        let data_file = data_dir.join("sub-store.json");

        if !data_file.exists() {
            match Self::get_default_data_file_path(app_handle) {
                Ok(default_data) => {
                    std::fs::copy(&default_data, &data_file).map_err(|e| {
                        anyhow!("Failed to copy default Sub-Store data file: {}", e)
                    })?;
                }
                Err(_) => {
                    let default_content = r#"{
  "subs": [],
  "collections": [],
  "artifacts": [],
  "rules": [],
  "files": [],
  "tokens": [],
  "schemaVersion": "2.0",
  "settings": {},
  "modules": []
}
"#;
                    std::fs::write(&data_file, default_content).map_err(|e| {
                        anyhow!("Failed to create default Sub-Store data file: {}", e)
                    })?;
                }
            }
        }

        Ok(data_file)
    }

    /// 获取并创建 Sub-Store 数据目录
    fn ensure_data_directory(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow!("Failed to get app data dir: {}", e))?;

        let substore_data_dir = data_dir.join("sub-store");

        if !substore_data_dir.exists() {
            std::fs::create_dir_all(&substore_data_dir)
                .map_err(|e| anyhow!("Failed to create Sub-Store data directory: {}", e))?;
        }

        Ok(substore_data_dir)
    }

    /// 启动 Sub-Store 进程
    pub async fn start(&self, app_handle: tauri::AppHandle) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        // 检查进程是否已经在运行
        if let Some(ref mut child) = *process_guard {
            // 检查进程是否真的还活着
            match child.try_wait() {
                Ok(Some(status)) => {
                    log::warn!("Sub-Store process exited with status: {:?}", status);
                    *process_guard = None;
                }
                Ok(None) => {
                    log::info!("Sub-Store is already running");
                    return Ok(());
                }
                Err(e) => {
                    log::error!("Failed to check Sub-Store process status: {}", e);
                    *process_guard = None;
                }
            }
        }

        log::info!("Starting Sub-Store...");

        // 获取所有必要的路径
        let node_binary = Self::get_node_binary_path(&app_handle)?;
        let substore_script = Self::get_substore_script_path(&app_handle)?;
        let frontend_path = Self::get_frontend_path(&app_handle)?;
        let substore_data_dir = Self::ensure_data_directory(&app_handle)?;

        log::info!("Node binary: {:?}", node_binary);
        log::info!("Sub-Store script: {:?}", substore_script);
        log::info!("Frontend path: {:?}", frontend_path);
        log::info!("Data directory: {:?}", substore_data_dir);

        // 构建命令
        let mut cmd = Command::new(&node_binary);
        cmd.arg(&substore_script)
            .current_dir(&substore_data_dir)
            .env("SUB_STORE_BACKEND_API_HOST", "127.0.0.1")
            .env("SUB_STORE_BACKEND_API_PORT", self.api_port.to_string())
            .env("SUB_STORE_FRONTEND_BACKEND_PATH", "/api")
            .env("SUB_STORE_BACKEND_MERGE", "true")
            .env("SUB_STORE_DATA_DIR", substore_data_dir.to_string_lossy().to_string());

        // 仅在前端目录存在时设置前端路径
        // Sub-Store 2.x 前端已嵌入 bundle,不需要单独的前端目录
        if frontend_path.exists() {
            cmd.env("SUB_STORE_FRONTEND_PATH", frontend_path.to_string_lossy().to_string());
            log::info!("Using external frontend directory");
        } else {
            log::info!("Using embedded frontend (no external frontend directory)");
        }

        // Keep the child process headless to avoid spawning a terminal UI.
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        // macOS/Unix: 在新的进程组中启动，避免终端弹窗
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                // 创建新的进程组，与父进程分离
                libc::setsid();
                Ok(())
            });
        }

        // Windows 特殊处理：防止创建控制台窗口
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // 启动进程
        let child = cmd.spawn()
            .map_err(|e| anyhow!("Failed to spawn Sub-Store process: {}", e))?;

        log::info!("Sub-Store process started with PID: {:?}", child.id());

        // 存储进程句柄
        *process_guard = Some(child);

        log::info!("Sub-Store started successfully on port {}", self.api_port);
        Ok(())
    }

    /// 停止 Sub-Store 进程
    pub async fn stop(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            log::info!("Stopping Sub-Store process (PID: {:?})...", child.id());

            // 尝试优雅地终止进程
            #[cfg(unix)]
            {
                use nix::sys::signal::{self, Signal};
                use nix::unistd::Pid;

                let pid = Pid::from_raw(child.id() as i32);

                // 先发送 SIGTERM 信号
                if let Err(e) = signal::kill(pid, Signal::SIGTERM) {
                    log::warn!("Failed to send SIGTERM to Sub-Store: {}", e);
                    // 如果 SIGTERM 失败,直接 kill
                    child.kill()
                        .map_err(|e| anyhow!("Failed to kill Sub-Store process: {}", e))?;
                } else {
                    // 等待最多 5 秒让进程优雅退出
                    let start = std::time::Instant::now();
                    loop {
                        match child.try_wait() {
                            Ok(Some(_)) => {
                                log::info!("Sub-Store process terminated gracefully");
                                return Ok(());
                            }
                            Ok(None) => {
                                if start.elapsed().as_secs() >= 5 {
                                    log::warn!("Sub-Store did not exit gracefully, forcing kill...");
                                    child.kill()
                                        .map_err(|e| anyhow!("Failed to kill Sub-Store process: {}", e))?;
                                    break;
                                }
                                std::thread::sleep(std::time::Duration::from_millis(100));
                            }
                            Err(e) => {
                                log::error!("Error waiting for Sub-Store process: {}", e);
                                child.kill()
                                    .map_err(|e| anyhow!("Failed to kill Sub-Store process: {}", e))?;
                                break;
                            }
                        }
                    }
                }
            }

            #[cfg(windows)]
            {
                // Windows 直接 kill
                child.kill()
                    .map_err(|e| anyhow!("Failed to kill Sub-Store process: {}", e))?;
            }

            // 等待进程完全退出
            match child.wait() {
                Ok(status) => {
                    log::info!("Sub-Store stopped with status: {:?}", status);
                }
                Err(e) => {
                    log::warn!("Error waiting for Sub-Store process: {}", e);
                }
            }
        } else {
            log::info!("Sub-Store is not running");
        }

        Ok(())
    }

    /// 同步停止进程（用于应用退出时）
    pub fn stop_sync(&self) {
        if let Ok(mut process_guard) = self.process.try_lock() {
            #[cfg(windows)]
            if let Some(mut child) = process_guard.take() {
                let pid = child.id();
                log::info!("Synchronously stopping Sub-Store process (PID: {})...", pid);
                let _ = child.kill();
                log::info!("Sub-Store process killed (PID: {})", pid);
            }

            #[cfg(not(windows))]
            if let Some(child) = process_guard.take() {
                let pid = child.id();
                log::info!("Synchronously stopping Sub-Store process (PID: {})...", pid);

                // 直接发送 SIGKILL，不等待
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }

                // 不调用 wait()，避免阻塞
                // 进程会被系统回收
                log::info!("Sub-Store process killed (PID: {})", pid);
            }
        } else {
            log::warn!("Could not acquire Sub-Store process lock for sync shutdown");
        }
    }

    /// 检查端口是否可访问
    async fn check_port_accessible(&self) -> bool {
        // 尝试连接到 Sub-Store API
        match tokio::net::TcpStream::connect(format!("127.0.0.1:{}", self.api_port)).await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    /// 检查是否正在运行
    pub async fn is_running(&self) -> bool {
        let mut process_guard = self.process.lock().await;

        // 先检查进程句柄
        if let Some(ref mut child) = *process_guard {
            // 检查进程是否真的还活着
            match child.try_wait() {
                Ok(Some(status)) => {
                    log::info!("Sub-Store process has exited with status: {:?}", status);
                    *process_guard = None;
                    // 清空句柄后,继续检查端口
                }
                Ok(None) => {
                    // 进程还在运行
                    return true;
                }
                Err(e) => {
                    log::error!("Failed to check Sub-Store process status: {}", e);
                    *process_guard = None;
                    // 清空句柄后,继续检查端口
                }
            }
        }

        // 如果没有进程句柄或进程已退出,检查端口是否可访问
        // 这样可以检测到外部启动的 Sub-Store 进程
        drop(process_guard); // 释放锁,避免死锁
        self.check_port_accessible().await
    }
}

impl Drop for SubStoreManager {
    fn drop(&mut self) {
        self.stop_sync();
        log::info!("SubStoreManager dropped");
    }
}
