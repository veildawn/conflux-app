//! Conflux TUN Helper
//!
//! A lightweight CLI tool for managing mihomo with elevated privileges on macOS.
//! This helper is set with setuid root to allow starting/stopping mihomo
//! with the necessary permissions for TUN mode.
//!
//! Usage:
//!   conflux-helper start <mihomo_path> -d <config_dir> -f <config_path>
//!   conflux-helper stop
//!   conflux-helper kill <pid>

use std::fs;
use std::process::{Command, Stdio};
use std::time::Duration;

/// PID file location for TUN mode mihomo process
const PID_FILE: &str = "/tmp/conflux-mihomo-tun.pid";

fn main() {
    let args: Vec<String> = std::env::args().collect();

    match args.get(1).map(|s| s.as_str()) {
        Some("start") => handle_start(&args),
        Some("stop") => handle_stop(),
        Some("kill") => handle_kill(&args),
        _ => {
            eprintln!("Conflux TUN Helper");
            eprintln!("Usage:");
            eprintln!("  conflux-helper start <mihomo_path> -d <config_dir> -f <config_path>");
            eprintln!("  conflux-helper stop");
            eprintln!("  conflux-helper kill <pid>");
            std::process::exit(1);
        }
    }
}

/// Handle the start command
/// Spawns mihomo as a child process and saves its PID
fn handle_start(args: &[String]) {
    // Validate arguments: start <mihomo_path> -d <dir> -f <config>
    if args.len() < 6 {
        eprintln!("Usage: conflux-helper start <mihomo_path> -d <config_dir> -f <config_path>");
        std::process::exit(1);
    }

    let mihomo_path = &args[2];
    let mihomo_args: Vec<&str> = args[3..].iter().map(|s| s.as_str()).collect();

    // Get config_dir from args for current_dir
    let config_dir = args
        .iter()
        .position(|s| s == "-d")
        .and_then(|i| args.get(i + 1))
        .map(|s| s.as_str());

    // Spawn mihomo process
    let mut cmd = Command::new(mihomo_path);
    cmd.args(&mihomo_args)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dir) = config_dir {
        cmd.current_dir(dir);
    }

    // Pass SAFE_PATHS to mihomo for config reload security check
    // Priority: inherited from parent process > config_dir
    if let Ok(safe_paths) = std::env::var("SAFE_PATHS") {
        cmd.env("SAFE_PATHS", safe_paths);
    } else if let Some(dir) = config_dir {
        cmd.env("SAFE_PATHS", dir);
    }

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();

            // Save PID to file
            if let Err(e) = fs::write(PID_FILE, pid.to_string()) {
                eprintln!("Warning: Failed to write PID file: {}", e);
            }

            // Output PID for the caller
            println!("{}", pid);
        }
        Err(e) => {
            eprintln!("Failed to spawn mihomo: {}", e);
            std::process::exit(1);
        }
    }
}

/// Handle the stop command
/// Reads PID from file and kills the process
fn handle_stop() {
    // Read PID from file
    let pid_str = match fs::read_to_string(PID_FILE) {
        Ok(s) => s,
        Err(_) => {
            // No PID file means no process to stop
            return;
        }
    };

    let pid: i32 = match pid_str.trim().parse() {
        Ok(p) => p,
        Err(_) => {
            // Invalid PID, clean up the file
            let _ = fs::remove_file(PID_FILE);
            return;
        }
    };

    // Send SIGTERM first for graceful shutdown
    unsafe {
        if libc::kill(pid, libc::SIGTERM) == 0 {
            // Wait for graceful shutdown (up to 1 second)
            for _ in 0..10 {
                std::thread::sleep(Duration::from_millis(100));
                if libc::kill(pid, 0) != 0 {
                    // Process has stopped
                    let _ = fs::remove_file(PID_FILE);
                    return;
                }
            }

            // Still running, send SIGKILL
            libc::kill(pid, libc::SIGKILL);

            // Wait a bit more for SIGKILL to take effect
            for _ in 0..5 {
                std::thread::sleep(Duration::from_millis(100));
                if libc::kill(pid, 0) != 0 {
                    break;
                }
            }
        }
    }

    // Clean up PID file
    let _ = fs::remove_file(PID_FILE);
}

/// Handle the kill command
/// Kills a process by PID with elevated privileges
fn handle_kill(args: &[String]) {
    if args.len() < 3 {
        eprintln!("Usage: conflux-helper kill <pid>");
        std::process::exit(1);
    }

    let pid: i32 = match args[2].trim().parse() {
        Ok(p) => p,
        Err(_) => {
            eprintln!("Invalid PID: {}", args[2]);
            std::process::exit(1);
        }
    };

    // Check if process exists
    unsafe {
        if libc::kill(pid, 0) != 0 {
            // Process doesn't exist, already stopped
            return;
        }

        // Send SIGTERM first for graceful shutdown
        libc::kill(pid, libc::SIGTERM);

        // Wait for graceful shutdown (up to 500ms)
        for _ in 0..5 {
            std::thread::sleep(Duration::from_millis(100));
            if libc::kill(pid, 0) != 0 {
                // Process has stopped
                return;
            }
        }

        // Still running, send SIGKILL
        libc::kill(pid, libc::SIGKILL);

        // Wait for SIGKILL to take effect (up to 1 second)
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(100));
            if libc::kill(pid, 0) != 0 {
                // Process has stopped
                return;
            }
        }

        // Process still running after SIGKILL, report failure
        eprintln!(
            "Failed to kill process {}: still running after SIGKILL",
            pid
        );
        std::process::exit(1);
    }
}
