use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

/// Sub-Store 进程管理器
pub struct SubStoreManager {
    app_handle: Option<AppHandle>,
    process: Arc<Mutex<Option<CommandChild>>>,
    api_url: String,
    api_port: u16,
}

impl SubStoreManager {
    /// 创建新的 Sub-Store 管理器
    pub fn new(port: Option<u16>) -> Result<Self> {
        let api_port = port.unwrap_or(39001);

        Ok(Self {
            app_handle: None,
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

    /// 获取 Sub-Store 脚本路径
    ///
    /// 使用 Tauri 的 resource_dir() 统一处理跨平台路径
    fn get_substore_script_path(app_handle: &AppHandle) -> Result<PathBuf> {
        let script_path = if cfg!(debug_assertions) {
            // 开发模式：从项目目录加载
            let exe_path =
                std::env::current_exe().map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
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
    fn get_frontend_path(app_handle: &AppHandle) -> Result<PathBuf> {
        let frontend_path = if cfg!(debug_assertions) {
            // 开发模式
            let exe_path =
                std::env::current_exe().map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
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
    fn get_default_data_file_path(app_handle: &AppHandle) -> Result<PathBuf> {
        let data_path = if cfg!(debug_assertions) {
            // 开发模式：从项目目录加载
            let exe_path =
                std::env::current_exe().map_err(|e| anyhow!("Failed to get exe path: {}", e))?;
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
            return Err(anyhow!(
                "Default Sub-Store data file not found at: {:?}",
                data_path
            ));
        }

        Ok(data_path)
    }

    /// 获取 Sub-Store 数据文件路径
    pub fn get_data_file_path(&self, app_handle: &AppHandle) -> Result<PathBuf> {
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
    fn ensure_data_directory(app_handle: &AppHandle) -> Result<PathBuf> {
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

    /// 清理残留的 Sub-Store 进程
    /// 在启动新进程前调用，确保没有孤儿进程（例如热重载后遗留的进程）
    pub fn cleanup_stale_processes(port: u16) {
        log::info!("Cleaning up stale Sub-Store processes...");

        #[cfg(unix)]
        {
            use std::process::Command;
            // 杀死所有 run-substore.js 相关进程
            let _ = Command::new("pkill")
                .args(["-9", "-f", "run-substore.js"])
                .output();
            log::info!("Killed stale Sub-Store processes via pkill");
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            use std::process::Command;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            // 1. 尝试通过端口杀死进程 (更可靠)
            log::info!("Attempting to kill process on port {}", port);
            let cmd = format!("Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess", port);
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", &cmd])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if let Ok(pid) = line.trim().parse::<u32>() {
                            log::info!("Killing process on port {} with PID: {}", port, pid);
                            let _ = Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output();
                        }
                    }
                }
            }

            // 2. Windows 上使用 wmic 精确匹配命令行中包含 run-substore.js 的 node 进程 (备用)
            // 先查找 PID
            if let Ok(output) = Command::new("wmic")
                .args([
                    "process",
                    "where",
                    "commandline like '%run-substore.js%'",
                    "get",
                    "processid",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if let Ok(pid) = line.trim().parse::<u32>() {
                            log::info!("Killing stale Sub-Store process with PID: {}", pid);
                            let _ = Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output();
                        }
                    }
                }
            }
        }

        log::info!("Sub-Store cleanup completed");
    }

    /// 启动 Sub-Store 进程
    pub async fn start(&mut self, app_handle: AppHandle) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        // 检查进程是否已经在运行
        if process_guard.is_some() {
            log::info!("Sub-Store is already running");
            return Ok(());
        }

        // 检查端口是否已经被占用
        // 如果已经被占用，说明有一个 Sub-Store 实例正在运行（可能是上一次调试留下的，或者是外部启动的）
        // 这种情况下，直接复用该实例，避免 EADDRINUSE 错误
        if self.check_port_accessible().await {
            log::info!(
                "Port {} is already in use. Reusing existing Sub-Store instance.",
                self.api_port
            );
            self.app_handle = Some(app_handle);
            return Ok(());
        }

        // 在启动新进程前，清理可能存在的孤儿进程（例如热重载后遗留的）
        Self::cleanup_stale_processes(self.api_port);

        log::info!("Starting Sub-Store...");

        // 获取所有必要的路径
        let substore_script = Self::get_substore_script_path(&app_handle)?;
        let frontend_path = Self::get_frontend_path(&app_handle)?;
        let substore_data_dir = Self::ensure_data_directory(&app_handle)?;

        log::info!("Sub-Store script: {:?}", substore_script);
        log::info!("Frontend path: {:?}", frontend_path);
        log::info!("Data directory: {:?}", substore_data_dir);

        // 构建环境变量
        let mut envs: Vec<(&str, String)> = vec![
            ("SUB_STORE_BACKEND_API_HOST", "127.0.0.1".to_string()),
            ("SUB_STORE_BACKEND_API_PORT", self.api_port.to_string()),
            ("SUB_STORE_FRONTEND_BACKEND_PATH", "/api".to_string()),
            ("SUB_STORE_BACKEND_MERGE", "true".to_string()),
            (
                "SUB_STORE_DATA_DIR",
                substore_data_dir.to_string_lossy().to_string(),
            ),
        ];

        // 仅在前端目录存在时设置前端路径
        if frontend_path.exists() {
            envs.push((
                "SUB_STORE_FRONTEND_PATH",
                frontend_path.to_string_lossy().to_string(),
            ));
            log::info!("Using external frontend directory");
        } else {
            log::info!("Using embedded frontend (no external frontend directory)");
        }

        // 使用 Tauri Sidecar API 启动 node
        log::info!("Creating node sidecar command...");
        let mut sidecar_command = app_handle
            .shell()
            .sidecar("node")
            .map_err(|e| anyhow!("Failed to create node sidecar command: {}", e))?
            .current_dir(&substore_data_dir)
            .args([substore_script.to_string_lossy().to_string()]);

        // 添加环境变量
        log::info!("Setting environment variables:");
        for (key, value) in &envs {
            log::info!("  {}={}", key, value);
            sidecar_command = sidecar_command.env(key, value);
        }

        log::info!("Spawning node sidecar...");
        let (mut rx, child) = sidecar_command
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn Sub-Store sidecar: {}", e))?;

        let pid = child.pid();
        log::info!("Sub-Store sidecar spawned with PID: {}", pid);

        // 克隆 process Arc 用于后台任务
        let process_clone = self.process.clone();

        // 启动后台任务处理 sidecar 输出
        tokio::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        if let Ok(s) = String::from_utf8(line) {
                            log::info!("[substore stdout] {}", s.trim());
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        if let Ok(s) = String::from_utf8(line) {
                            log::warn!("[substore stderr] {}", s.trim());
                        }
                    }
                    CommandEvent::Error(err) => {
                        log::error!("[substore error] {}", err);
                    }
                    CommandEvent::Terminated(payload) => {
                        log::error!(
                            "[substore] Process terminated with code: {:?}, signal: {:?}",
                            payload.code,
                            payload.signal
                        );
                        // 清理进程状态，确保 is_running() 返回正确结果
                        let mut guard = process_clone.lock().await;
                        *guard = None;
                        log::info!("[substore] Process state cleared");
                        break;
                    }
                    _ => {}
                }
            }
        });

        // 存储进程句柄和 app_handle
        *process_guard = Some(child);
        self.app_handle = Some(app_handle);

        log::info!("Sub-Store started successfully on port {}", self.api_port);
        Ok(())
    }

    /// 停止 Sub-Store 进程
    pub async fn stop(&mut self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(child) = process_guard.take() {
            let pid = child.pid();
            log::info!("Stopping Sub-Store process (PID: {})...", pid);

            // 使用 Tauri sidecar 的 kill 方法
            if let Err(e) = child.kill() {
                log::warn!("Failed to kill Sub-Store process via sidecar API: {}", e);
            }

            log::info!("Sub-Store stopped");
        } else {
            log::info!("Sub-Store is not running");
        }

        self.app_handle = None;
        Ok(())
    }

    /// 同步停止进程（用于应用退出时）
    pub fn stop_sync(&self) {
        if let Ok(mut process_guard) = self.process.try_lock() {
            if let Some(child) = process_guard.take() {
                let pid = child.pid();
                log::info!("Synchronously stopping Sub-Store process (PID: {})...", pid);
                let _ = child.kill();
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
        let process_guard = self.process.lock().await;

        // 先检查进程句柄
        if process_guard.is_some() {
            return true;
        }

        // 如果没有进程句柄,检查端口是否可访问
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
