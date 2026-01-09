pub mod config;
pub mod logs;
pub mod profile;
pub mod proxy;
pub mod reload;
pub mod service;
pub mod substore;
pub mod system;
pub mod webdav;

use anyhow::Result;
use once_cell::sync::OnceCell;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;

use crate::config::{ConfigManager, Workspace};
use crate::mihomo::{LogStreamer, MihomoApi, MihomoManager};
use crate::substore::SubStoreManager;
use crate::utils::generate_api_secret;

/// 应用状态
#[derive(Clone)]
pub struct AppState {
    pub mihomo_manager: Arc<MihomoManager>,
    pub mihomo_api: Arc<MihomoApi>,
    pub config_manager: Arc<ConfigManager>,
    pub log_streamer: Arc<LogStreamer>,
    pub substore_manager: Arc<Mutex<SubStoreManager>>,
    pub system_proxy_enabled: Arc<Mutex<bool>>,
    pub enhanced_mode: Arc<Mutex<bool>>,
}

/// 全局应用状态（用于非命令的地方访问）
static APP_STATE: OnceCell<AppState> = OnceCell::new();

/// 获取应用状态
pub fn get_app_state() -> &'static AppState {
    APP_STATE.get().expect("App state not initialized")
}

/// 需要有激活的远程订阅，并且订阅配置中存在代理节点
pub fn require_active_subscription_with_proxies() -> Result<(), String> {
    let workspace = Workspace::new().map_err(|e| e.to_string())?;
    let active = workspace.get_active_profile().map_err(|e| e.to_string())?;

    let Some((_metadata, config)) = active else {
        return Err("需要先激活订阅才能开启该功能。".to_string());
    };

    if config.proxies.is_empty() && config.proxy_providers.is_empty() {
        return Err("当前配置中没有可用代理服务器。".to_string());
    }

    Ok(())
}

/// 初始化应用状态
pub async fn init_app_state(app: &AppHandle) -> Result<AppState> {
    let config_manager = Arc::new(ConfigManager::new()?);

    // 加载或生成 API secret
    let mut config = config_manager.load_mihomo_config()?;
    if config.secret.is_empty() {
        config.secret = generate_api_secret();
        config_manager.save_mihomo_config(&config)?;
    }

    let api_secret = config.secret.clone();
    let api_url = format!("http://{}", config.external_controller);

    let mihomo_manager = Arc::new(MihomoManager::new(api_secret.clone())?);
    let mihomo_api = Arc::new(MihomoApi::new(api_url.clone(), api_secret.clone()));
    let log_streamer = Arc::new(LogStreamer::new(api_url, api_secret));

    // 检测系统当前的代理状态（恢复上次的状态）
    let current_system_proxy = crate::system::SystemProxy::get_proxy_status().unwrap_or(false);
    log::info!("Detected system proxy status: {}", current_system_proxy);

    // Windows: 检查服务状态，如果服务正在运行但 mihomo 没有启动，则通过服务启动
    #[cfg(target_os = "windows")]
    {
        use crate::system::WinServiceManager;

        if let Ok(service_status) = WinServiceManager::get_status().await {
            log::info!(
                "Windows service status: installed={}, running={}, mihomo_running={}",
                service_status.installed,
                service_status.running,
                service_status.mihomo_running
            );

            if service_status.running && !service_status.mihomo_running {
                log::info!("Service is running but mihomo is not, starting mihomo via service...");

                // 通过服务启动 mihomo
                if let Err(e) = mihomo_manager.start().await {
                    log::error!("Failed to start mihomo via service: {}", e);
                } else {
                    log::info!("Mihomo started via service successfully");
                }
            }
        }
    }

    let enhanced_mode = if mihomo_manager.is_running().await {
        match mihomo_api.get_configs().await {
            Ok(configs) => configs
                .get("tun")
                .and_then(|tun| tun.get("enable"))
                .and_then(|enabled| enabled.as_bool())
                .unwrap_or(false),
            Err(err) => {
                log::warn!("Failed to fetch MiHomo configs: {}", err);
                false
            }
        }
    } else {
        false
    };

    // 初始化 Sub-Store 管理器
    let substore_manager = Arc::new(Mutex::new(
        SubStoreManager::new(Some(39001))
            .map_err(|e| anyhow::anyhow!("Failed to create SubStore manager: {}", e))?,
    ));

    // 自动启动 Sub-Store 服务
    log::info!("Starting Sub-Store service...");
    let app_handle_clone = app.clone();
    let substore_manager_clone = substore_manager.clone();
    tokio::spawn(async move {
        match substore_manager_clone
            .lock()
            .await
            .start(app_handle_clone)
            .await
        {
            Ok(_) => {
                log::info!("Sub-Store service started successfully");
            }
            Err(e) => {
                log::error!("Failed to start Sub-Store service: {}", e);
            }
        }
    });

    let state = AppState {
        mihomo_manager,
        mihomo_api,
        config_manager,
        log_streamer,
        substore_manager,
        system_proxy_enabled: Arc::new(Mutex::new(current_system_proxy)),
        enhanced_mode: Arc::new(Mutex::new(enhanced_mode)),
    };

    // 也保存到全局状态，用于非命令的地方访问
    let _ = APP_STATE.set(state.clone());

    log::info!("App state initialized");
    Ok(state)
}
