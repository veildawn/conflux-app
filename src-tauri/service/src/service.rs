//! Windows Service implementation

use std::ffi::OsString;
use std::time::Duration;
use windows_service::{
    define_windows_service,
    service::{
        ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl,
        ServiceExitCode, ServiceInfo, ServiceStartType, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};

const SERVICE_NAME: &str = "ConfluxService";
const SERVICE_DISPLAY_NAME: &str = "Conflux TUN Service";
const SERVICE_DESCRIPTION: &str = "Provides TUN mode support for Conflux proxy";

define_windows_service!(ffi_service_main, service_main);

/// Install the Windows service
pub fn install_service() -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CREATE_SERVICE,
    )?;

    let service_binary_path = std::env::current_exe()
        .map_err(|e| windows_service::Error::Winapi(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        )))?;

    let service_info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from(SERVICE_DISPLAY_NAME),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: service_binary_path,
        launch_arguments: vec![],
        dependencies: vec![],
        account_name: None, // LocalSystem
        account_password: None,
    };

    let service = manager.create_service(&service_info, ServiceAccess::CHANGE_CONFIG)?;

    // Set service description
    service.set_description(SERVICE_DESCRIPTION)?;

    // 设置服务权限，允许普通用户启动/停止服务（无需 UAC）
    // SDDL 说明：
    // - SY (LocalSystem): 完全控制
    // - BA (Administrators): 完全控制
    // - IU (Interactive Users): 可以启动、停止、暂停、查询服务
    // - SU (Service Users): 可以启动、停止、暂停、查询服务
    set_service_permissions()?;

    Ok(())
}

/// 设置服务权限，允许普通用户控制服务
fn set_service_permissions() -> windows_service::Result<()> {
    use std::process::Command;
    
    // SDDL 权限字符串：
    // D: = DACL
    // A = Allow
    // CC = SERVICE_QUERY_CONFIG
    // LC = SERVICE_QUERY_STATUS
    // SW = SERVICE_ENUMERATE_DEPENDENTS
    // RP = SERVICE_START
    // WP = SERVICE_STOP
    // DT = SERVICE_PAUSE_CONTINUE
    // LO = SERVICE_INTERROGATE
    // CR = SERVICE_USER_DEFINED_CONTROL
    // RC = READ_CONTROL
    // SD = DELETE
    // WD = WRITE_DAC
    // WO = WRITE_OWNER
    let sddl = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPDTLOCRRC;;;IU)(A;;CCLCSWRPWPDTLOCRRC;;;SU)";
    
    let output = Command::new("sc")
        .args(["sdset", SERVICE_NAME, sddl])
        .output()
        .map_err(|e| windows_service::Error::Winapi(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to set service permissions: {}", e),
        )))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!("Failed to set service permissions: {}", stderr);
        // 权限设置失败不阻止安装，只是警告
    } else {
        log::info!("Service permissions set successfully - users can now start/stop without UAC");
    }
    
    Ok(())
}

/// Uninstall the Windows service
pub fn uninstall_service() -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT,
    )?;

    let service = manager.open_service(
        SERVICE_NAME,
        ServiceAccess::DELETE | ServiceAccess::STOP,
    )?;

    // Stop the service if running
    let _ = service.stop();

    // Wait for service to stop
    std::thread::sleep(Duration::from_secs(2));

    // Delete the service
    service.delete()?;

    Ok(())
}

/// Run the service
pub fn run_service() -> windows_service::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}

/// Service main function
fn service_main(_arguments: Vec<OsString>) {
    if let Err(e) = run_service_main() {
        log::error!("Service error: {}", e);
    }
}

fn run_service_main() -> windows_service::Result<()> {
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                log::info!("Service stop requested");
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

    // Report running status
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    log::info!("Conflux Service started");

    // Start IPC server in a separate thread
    let _ = std::thread::spawn(|| {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
        rt.block_on(async {
            if let Err(e) = crate::ipc::start_ipc_server().await {
                log::error!("IPC server error: {}", e);
            }
        });
    });

    // Wait for shutdown signal
    let _ = shutdown_rx.recv();

    log::info!("Stopping Conflux Service...");

    // Stop mihomo if running
    crate::mihomo::stop_mihomo();

    // Report stopped status
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    log::info!("Conflux Service stopped");

    Ok(())
}


