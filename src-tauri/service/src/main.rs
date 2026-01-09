//! Conflux TUN Service
//!
//! A Windows service that runs mihomo with elevated privileges,
//! enabling TUN mode without requiring the main application to run as admin.

#[cfg(windows)]
mod service;

#[cfg(windows)]
mod ipc;

#[cfg(windows)]
mod mihomo;

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    // Parse command line arguments
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 {
        match args[1].as_str() {
            "install" => {
                println!("Installing Conflux Service...");
                service::install_service()?;
                println!("Service installed successfully!");
                return Ok(());
            }
            "uninstall" => {
                println!("Uninstalling Conflux Service...");
                service::uninstall_service()?;
                println!("Service uninstalled successfully!");
                return Ok(());
            }
            "run" => {
                // Run as a regular process (for debugging)
                println!("Running in standalone mode...");
                let rt = tokio::runtime::Runtime::new()?;
                rt.block_on(async { ipc::start_ipc_server().await })?;
                return Ok(());
            }
            _ => {
                println!("Usage: conflux-service [install|uninstall|run]");
                return Ok(());
            }
        }
    }

    // Run as Windows service
    service::run_service()?;

    Ok(())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("This service is only supported on Windows");
    std::process::exit(1);
}
