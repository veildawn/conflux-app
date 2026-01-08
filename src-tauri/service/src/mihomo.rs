//! Mihomo process management

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use anyhow::{anyhow, Result};

/// Global mihomo process handle
static MIHOMO_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Start mihomo process
pub fn start_mihomo(mihomo_path: &str, config_dir: &str, config_path: &str) -> Result<u32> {
    log::info!("Starting mihomo: {} -d {} -f {}", mihomo_path, config_dir, config_path);

    // Kill any existing mihomo processes first
    stop_mihomo();
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Start mihomo
    let child = Command::new(mihomo_path)
        .args(["-d", config_dir, "-f", config_path])
        .current_dir(config_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn mihomo: {}", e))?;

    let pid = child.id();

    // Store the process handle
    let mut process = MIHOMO_PROCESS.lock().unwrap();
    *process = Some(child);

    log::info!("Mihomo started with PID: {}", pid);
    Ok(pid)
}

/// Stop mihomo process
pub fn stop_mihomo() {
    log::info!("Stopping mihomo...");

    // Try to stop via stored handle
    let mut process = MIHOMO_PROCESS.lock().unwrap();
    if let Some(mut child) = process.take() {
        let pid = child.id();
        log::info!("Killing mihomo process (PID: {})", pid);
        let _ = child.kill();
        let _ = child.wait();
    }

    // Also kill by process name to ensure cleanup
    kill_mihomo_by_name();

    log::info!("Mihomo stopped");
}

/// Kill mihomo by process name
fn kill_mihomo_by_name() {
    use sysinfo::{System, Signal};

    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("mihomo") {
            log::info!("Killing mihomo process: {} (PID: {})", name, pid);
            process.kill_with(Signal::Kill);
        }
    }
}

/// Check if mihomo is running
pub fn is_mihomo_running() -> bool {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("mihomo") {
            return true;
        }
    }

    false
}

/// Get mihomo PID if running
pub fn get_mihomo_pid() -> Option<u32> {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("mihomo") {
            return Some(pid.as_u32());
        }
    }

    None
}




