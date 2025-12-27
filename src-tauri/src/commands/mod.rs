pub mod config;
pub mod proxy;
pub mod system;

use anyhow::Result;
use once_cell::sync::OnceCell;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;

use crate::config::ConfigManager;
use crate::mihomo::{MihomoApi, MihomoManager};
use crate::utils::generate_api_secret;

/// 应用状态
pub struct AppState {
    pub mihomo_manager: Arc<MihomoManager>,
    pub mihomo_api: Arc<MihomoApi>,
    pub config_manager: Arc<ConfigManager>,
    pub system_proxy_enabled: Arc<Mutex<bool>>,
}

/// 全局应用状态
static APP_STATE: OnceCell<AppState> = OnceCell::new();

/// 获取应用状态
pub fn get_app_state() -> &'static AppState {
    APP_STATE.get().expect("App state not initialized")
}

/// 初始化应用状态
pub async fn init_app_state(_app: &AppHandle) -> Result<()> {
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
    let mihomo_api = Arc::new(MihomoApi::new(api_url, api_secret));
    
    // 检测系统当前的代理状态（恢复上次的状态）
    let current_system_proxy = crate::system::SystemProxy::get_proxy_status().unwrap_or(false);
    log::info!("Detected system proxy status: {}", current_system_proxy);
    
    let state = AppState {
        mihomo_manager,
        mihomo_api,
        config_manager,
        system_proxy_enabled: Arc::new(Mutex::new(current_system_proxy)),
    };
    
    APP_STATE.set(state).map_err(|_| anyhow::anyhow!("State already initialized"))?;
    
    log::info!("App state initialized");
    Ok(())
}




