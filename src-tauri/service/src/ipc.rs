//! IPC Server for communication with the main application

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use warp::Filter;

/// Ready signal sender type
pub type ReadySignal = std::sync::mpsc::Sender<()>;

/// IPC server port
const IPC_PORT: u16 = 33211;

/// Service state
#[derive(Default)]
pub struct ServiceState {
    pub mihomo_running: bool,
    pub mihomo_pid: Option<u32>,
    pub config_path: Option<String>,
}

/// Request to start mihomo
#[derive(Debug, Deserialize)]
pub struct StartRequest {
    pub config_dir: String,
    pub config_path: String,
    pub mihomo_path: String,
}

/// Response from service
#[derive(Debug, Serialize)]
pub struct ServiceResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}

/// Status response
#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub running: bool,
    pub pid: Option<u32>,
    pub version: String,
}

/// Build IPC server routes
fn build_routes(
    state: Arc<Mutex<ServiceState>>,
) -> impl Filter<Extract = (impl warp::Reply,), Error = warp::Rejection> + Clone {
    // Health check endpoint
    let health = warp::path("health").and(warp::get()).map(|| {
        warp::reply::json(&StatusResponse {
            running: true,
            pid: None,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    });

    // Status endpoint
    // 动态检查 mihomo 进程实际状态，而不仅仅返回内部跟踪的状态
    let state_for_status = state.clone();
    let status = warp::path("status").and(warp::get()).and_then(move || {
        let state = state_for_status.clone();
        async move {
            let mut s = state.lock().await;

            // 动态检查进程是否实际在运行
            let actually_running = crate::mihomo::is_mihomo_running();
            let actual_pid = if actually_running {
                crate::mihomo::get_mihomo_pid()
            } else {
                None
            };

            // 同步内部状态与实际状态
            if s.mihomo_running != actually_running {
                log::info!(
                    "Syncing mihomo status: internal={}, actual={}",
                    s.mihomo_running,
                    actually_running
                );
                s.mihomo_running = actually_running;
                s.mihomo_pid = actual_pid;
            }

            Ok::<_, warp::Rejection>(warp::reply::json(&StatusResponse {
                running: actually_running,
                pid: actual_pid,
                version: env!("CARGO_PKG_VERSION").to_string(),
            }))
        }
    });

    // Start mihomo endpoint
    let state_for_start = state.clone();
    let start = warp::path("start")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |req: StartRequest| {
            let state = state_for_start.clone();
            async move {
                let mut s = state.lock().await;

                // 如果服务端认为已经在运行，验证进程是否真的存在
                if s.mihomo_running {
                    if crate::mihomo::is_mihomo_running() {
                        return Ok::<_, warp::Rejection>(warp::reply::json(&ServiceResponse {
                            success: false,
                            message: "Mihomo is already running".to_string(),
                            pid: s.mihomo_pid,
                        }));
                    }
                    // 进程已不存在，重置状态
                    log::info!("Mihomo process not found, resetting state");
                    s.mihomo_running = false;
                    s.mihomo_pid = None;
                }

                match crate::mihomo::start_mihomo(
                    &req.mihomo_path,
                    &req.config_dir,
                    &req.config_path,
                ) {
                    Ok(pid) => {
                        s.mihomo_running = true;
                        s.mihomo_pid = Some(pid);
                        s.config_path = Some(req.config_path);
                        log::info!("Mihomo started with PID: {}", pid);
                        Ok(warp::reply::json(&ServiceResponse {
                            success: true,
                            message: "Mihomo started".to_string(),
                            pid: Some(pid),
                        }))
                    }
                    Err(e) => {
                        log::error!("Failed to start mihomo: {}", e);
                        Ok(warp::reply::json(&ServiceResponse {
                            success: false,
                            message: format!("Failed to start: {}", e),
                            pid: None,
                        }))
                    }
                }
            }
        });

    // Stop mihomo endpoint
    let state_for_stop = state.clone();
    let stop = warp::path("stop").and(warp::post()).and_then(move || {
        let state = state_for_stop.clone();
        async move {
            let mut s = state.lock().await;

            if !s.mihomo_running {
                return Ok::<_, warp::Rejection>(warp::reply::json(&ServiceResponse {
                    success: true,
                    message: "Mihomo is not running".to_string(),
                    pid: None,
                }));
            }

            crate::mihomo::stop_mihomo();
            s.mihomo_running = false;
            s.mihomo_pid = None;

            log::info!("Mihomo stopped");
            Ok(warp::reply::json(&ServiceResponse {
                success: true,
                message: "Mihomo stopped".to_string(),
                pid: None,
            }))
        }
    });

    // Restart mihomo endpoint
    let state_for_restart = state.clone();
    let restart = warp::path("restart").and(warp::post()).and_then(move || {
        let state = state_for_restart.clone();
        async move {
            let mut s = state.lock().await;

            // Stop if running
            if s.mihomo_running {
                crate::mihomo::stop_mihomo();
                s.mihomo_running = false;
                s.mihomo_pid = None;
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }

            // We need config to restart, return error if not available
            if s.config_path.is_none() {
                return Ok::<_, warp::Rejection>(warp::reply::json(&ServiceResponse {
                    success: false,
                    message: "No config available, use /start instead".to_string(),
                    pid: None,
                }));
            }

            Ok(warp::reply::json(&ServiceResponse {
                success: false,
                message: "Restart requires /start with config".to_string(),
                pid: None,
            }))
        }
    });

    health
        .or(status)
        .or(start)
        .or(stop)
        .or(restart)
        .with(warp::log("conflux-service"))
}

/// Start the IPC server (legacy version without ready signal)
pub async fn start_ipc_server() -> anyhow::Result<()> {
    let state = Arc::new(Mutex::new(ServiceState::default()));
    let routes = build_routes(state);

    log::info!("Starting IPC server on port {}", IPC_PORT);

    warp::serve(routes).run(([127, 0, 0, 1], IPC_PORT)).await;

    Ok(())
}

/// Start the IPC server with ready signal
///
/// This version sends a signal when the server has successfully bound to the port,
/// allowing the caller to know when the IPC is ready to accept connections.
pub async fn start_ipc_server_with_ready_signal(ready_tx: ReadySignal) -> anyhow::Result<()> {
    use std::net::{SocketAddr, TcpListener};

    let state = Arc::new(Mutex::new(ServiceState::default()));
    let routes = build_routes(state);

    log::info!("Starting IPC server on port {}", IPC_PORT);

    // First, verify we can bind to the port by creating a temporary TCP listener
    // This ensures the port is available before we signal ready
    let socket_addr: SocketAddr = format!("127.0.0.1:{}", IPC_PORT).parse().unwrap();
    match TcpListener::bind(socket_addr) {
        Ok(listener) => {
            // Port is available, drop the listener so warp can use it
            drop(listener);
            log::info!("Port {} verified available", IPC_PORT);
        }
        Err(e) => {
            log::error!("Failed to bind to port {}: {}", IPC_PORT, e);
            return Err(anyhow::anyhow!("Port {} unavailable: {}", IPC_PORT, e));
        }
    }

    // Send ready signal - port is available and we're about to start serving
    // There's a tiny race window here, but it's acceptable for our use case
    if ready_tx.send(()).is_err() {
        log::warn!("Failed to send ready signal (receiver dropped)");
    }

    log::info!("IPC server ready signal sent, starting server");

    // Run the server - this will bind to the port and start serving
    warp::serve(routes).run(socket_addr).await;

    Ok(())
}
