//! IPC Server for communication with the main application

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use warp::Filter;

/// Ready signal sender type
pub type ReadySignal = std::sync::mpsc::Sender<()>;

/// IPC server port
const IPC_PORT: u16 = 33211;

/// Service state (only for IPC, actual state in mihomo module)
#[derive(Default)]
pub struct ServiceState {
    _placeholder: (),
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
    _state: Arc<Mutex<ServiceState>>,
) -> impl Filter<Extract = (impl warp::Reply,), Error = warp::Rejection> + Clone {
    // Health check endpoint
    let health = warp::path("health").and(warp::get()).map(|| {
        warp::reply::json(&StatusResponse {
            running: true,
            pid: None,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    });

    // Status endpoint - 直接从 mihomo 模块获取状态
    let status = warp::path("status").and(warp::get()).map(|| {
        let (running, pid) = crate::mihomo::get_status();
        warp::reply::json(&StatusResponse {
            running,
            pid,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    });

    // Start mihomo endpoint
    let start = warp::path("start")
        .and(warp::post())
        .and(warp::body::json())
        .map(|req: StartRequest| {
            match crate::mihomo::start_mihomo(&req.mihomo_path, &req.config_dir, &req.config_path) {
                Ok(pid) => {
                    log::info!("Mihomo started with PID: {}", pid);
                    warp::reply::json(&ServiceResponse {
                        success: true,
                        message: "Mihomo started".to_string(),
                        pid: Some(pid),
                    })
                }
                Err(e) => {
                    log::error!("Failed to start mihomo: {}", e);
                    warp::reply::json(&ServiceResponse {
                        success: false,
                        message: format!("Failed to start: {}", e),
                        pid: None,
                    })
                }
            }
        });

    // Stop mihomo endpoint
    let stop = warp::path("stop").and(warp::post()).map(|| {
        crate::mihomo::stop_mihomo();
        log::info!("Mihomo stopped");
        warp::reply::json(&ServiceResponse {
            success: true,
            message: "Mihomo stopped".to_string(),
            pid: None,
        })
    });

    health
        .or(status)
        .or(start)
        .or(stop)
        .with(warp::log("conflux-service"))
}

/// 启动进程监控任务
fn start_monitor() {
    std::thread::spawn(|| {
        log::info!("Mihomo monitor started");
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));
            crate::mihomo::check_and_restart();
        }
    });
}

/// Start the IPC server (legacy version without ready signal)
pub async fn start_ipc_server() -> anyhow::Result<()> {
    let state = Arc::new(Mutex::new(ServiceState::default()));
    let routes = build_routes(state);

    // 启动监控
    start_monitor();

    log::info!("Starting IPC server on port {}", IPC_PORT);
    warp::serve(routes).run(([127, 0, 0, 1], IPC_PORT)).await;

    Ok(())
}

/// Start the IPC server with ready signal
pub async fn start_ipc_server_with_ready_signal(ready_tx: ReadySignal) -> anyhow::Result<()> {
    use std::net::{SocketAddr, TcpListener};

    let state = Arc::new(Mutex::new(ServiceState::default()));
    let routes = build_routes(state);

    log::info!("Starting IPC server on port {}", IPC_PORT);

    let socket_addr: SocketAddr = format!("127.0.0.1:{}", IPC_PORT).parse().unwrap();
    match TcpListener::bind(socket_addr) {
        Ok(listener) => {
            drop(listener);
            log::info!("Port {} verified available", IPC_PORT);
        }
        Err(e) => {
            log::error!("Failed to bind to port {}: {}", IPC_PORT, e);
            return Err(anyhow::anyhow!("Port {} unavailable: {}", IPC_PORT, e));
        }
    }

    if ready_tx.send(()).is_err() {
        log::warn!("Failed to send ready signal (receiver dropped)");
    }

    // 启动监控
    start_monitor();

    log::info!("IPC server ready signal sent, starting server");
    warp::serve(routes).run(socket_addr).await;

    Ok(())
}
