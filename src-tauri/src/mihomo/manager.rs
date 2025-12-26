use anyhow::Result;
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

    /// 启动 MiHomo 进程
    pub async fn start(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;
        
        if process_guard.is_some() {
            log::info!("MiHomo is already running");
            return Ok(());
        }

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
        }

        // 启动进程（不捕获 stdout/stderr，让它继承父进程的）
        let child = Command::new(&mihomo_path)
            .arg("-d")
            .arg(self.config_path.parent().unwrap())
            .arg("-f")
            .arg(&self.config_path)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;

        log::info!("MiHomo process spawned with PID: {}", child.id());
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
            log::info!("MiHomo stopped");
        }
        
        Ok(())
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

        // 检查当前目录的 resources 子目录
        let resource_path = current_dir.join("resources").join(binary_name);
        log::debug!("Checking resource path: {:?}", resource_path);
        if resource_path.exists() {
            log::info!("Found MiHomo at resource path: {:?}", resource_path);
            return Ok(resource_path);
        }

        // macOS 应用包内的资源路径
        #[cfg(target_os = "macos")]
        {
            let bundle_path = current_dir
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("Resources").join(binary_name));
            if let Some(ref path) = bundle_path {
                log::debug!("Checking macOS bundle path: {:?}", path);
                if path.exists() {
                    log::info!("Found MiHomo at bundle path: {:?}", path);
                    return Ok(path.clone());
                }
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

        log::error!("MiHomo binary not found. Searched paths:");
        log::error!("  - Data: {:?}", data_path);
        log::error!("  - Resource: {:?}", resource_path);
        log::error!("  - Dev: {:?}", dev_path);

        // 返回默认路径（即使不存在）
        Ok(data_path)
    }
}

impl Drop for MihomoManager {
    fn drop(&mut self) {
        // 同步方式停止进程
        if let Ok(mut guard) = self.process.try_lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

