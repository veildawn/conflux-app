//! Mihomo process management

use anyhow::{anyhow, Result};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// 启动参数
#[derive(Clone)]
pub struct StartConfig {
    pub mihomo_path: String,
    pub config_dir: String,
    pub config_path: String,
}

/// 进程状态
pub struct MihomoState {
    pub process: Option<Child>,
    pub pid: Option<u32>,
    pub config: Option<StartConfig>,
}

impl Default for MihomoState {
    fn default() -> Self {
        Self {
            process: None,
            pid: None,
            config: None,
        }
    }
}

/// Global state
static STATE: Mutex<MihomoState> = Mutex::new(MihomoState {
    process: None,
    pid: None,
    config: None,
});

/// Start mihomo process
pub fn start_mihomo(mihomo_path: &str, config_dir: &str, config_path: &str) -> Result<u32> {
    let mut state = STATE.lock().unwrap();

    // 保存配置
    state.config = Some(StartConfig {
        mihomo_path: mihomo_path.to_string(),
        config_dir: config_dir.to_string(),
        config_path: config_path.to_string(),
    });

    // 如果已有进程在运行，先停止
    if let Some(mut child) = state.process.take() {
        log::info!("Stopping existing mihomo process");
        let _ = child.kill();
        let _ = child.wait();
    }

    // 启动新进程
    do_start(&mut state)
}

/// 内部启动函数
fn do_start(state: &mut MihomoState) -> Result<u32> {
    let config = state.config.as_ref().ok_or_else(|| anyhow!("No config"))?;

    log::info!(
        "Starting mihomo: {} -d {} -f {}",
        config.mihomo_path,
        config.config_dir,
        config.config_path
    );

    let child = Command::new(&config.mihomo_path)
        .args(["-d", &config.config_dir, "-f", &config.config_path])
        .current_dir(&config.config_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn mihomo: {}", e))?;

    let pid = child.id();
    state.process = Some(child);
    state.pid = Some(pid);

    log::info!("Mihomo started with PID: {}", pid);
    Ok(pid)
}

/// Stop mihomo process
pub fn stop_mihomo() {
    let mut state = STATE.lock().unwrap();

    if let Some(mut child) = state.process.take() {
        let pid = child.id();
        log::info!("Stopping mihomo process (PID: {})", pid);
        let _ = child.kill();
        let _ = child.wait();
    }
    state.pid = None;

    log::info!("Mihomo stopped");
}

/// Get current status
pub fn get_status() -> (bool, Option<u32>) {
    let state = STATE.lock().unwrap();
    let running = state.process.is_some();
    (running, state.pid)
}
