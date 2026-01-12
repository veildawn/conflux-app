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
    /// API 密钥（应用运行期间保持不变，确保认证一致性）
    pub api_secret: String,
    /// Profile 切换锁，防止并发重载导致的网络错误和状态不一致
    pub profile_switch_lock: Arc<Mutex<()>>,
    /// 记录最后请求激活的 Profile ID，用于跳过过期的重载任务
    pub pending_profile_id: Arc<Mutex<Option<String>>>,
}

/// 全局应用状态（用于非命令的地方访问）
static APP_STATE: OnceCell<AppState> = OnceCell::new();

/// 获取应用状态（返回 Option，调用方需要处理未初始化的情况）
pub fn try_get_app_state() -> Option<&'static AppState> {
    APP_STATE.get()
}

/// 获取应用状态（如果未初始化则 panic）
/// 注意：优先使用 get_app_state_or_err() 以获得更好的错误处理
#[allow(dead_code)]
pub fn get_app_state() -> &'static AppState {
    APP_STATE
        .get()
        .expect("App state not initialized. Please wait for the app to fully load.")
}

/// 获取应用状态，如果未初始化返回友好错误信息
pub fn get_app_state_or_err() -> Result<&'static AppState, String> {
    APP_STATE
        .get()
        .ok_or_else(|| "应用正在初始化中，请稍候再试...".to_string())
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

    // 从 settings 获取 API 配置
    let mut app_settings = config_manager.load_app_settings()?;

    // 加载当前 config.yaml
    let mut config = config_manager.load_mihomo_config()?;

    // 检查是否有激活的 Profile
    // 如果没有激活的 Profile，使用基础配置重置 config.yaml（清除残留的代理和规则）
    // 这避免了加载一个不可用的旧配置
    let workspace = Workspace::new()?;
    let active_profile_id = workspace.get_active_profile_id()?;

    let mut config_changed = false;

    if active_profile_id.is_none() {
        log::info!("No active profile detected, resetting config to default");

        // 使用 reload 模块中的辅助函数构建基础配置（仅包含 settings 中的配置，无代理/规则）
        use crate::commands::reload::build_base_config_from_settings;
        let mut base_config = build_base_config_from_settings(&app_settings.mihomo);

        // 确保密钥和控制器地址与设置一致 (避免后续不必要的同步)
        if !app_settings.mihomo.secret.is_empty() {
            base_config.secret = app_settings.mihomo.secret.clone();
        }
        base_config.external_controller = app_settings.mihomo.external_controller.clone();

        // 替换当前加载的配置
        config = base_config;
        config_changed = true;
    }

    // 确定使用哪个 secret：
    // 1. 如果 settings.json 有 secret，使用它
    // 2. 如果 settings.json 没有但 config.yaml 有，使用 config.yaml 的（可能 mihomo 正在运行）
    // 3. 如果都没有，生成新的
    let api_secret = if !app_settings.mihomo.secret.is_empty() {
        log::debug!("Using secret from settings.json");
        app_settings.mihomo.secret.clone()
    } else if !config.secret.is_empty() {
        // config.yaml 中有 secret，说明 mihomo 可能正在使用它
        // 将它同步回 settings.json
        log::info!("Recovering secret from config.yaml");
        app_settings.mihomo.secret = config.secret.clone();
        config_manager.save_app_settings(&app_settings)?;
        config.secret.clone()
    } else {
        // 两者都没有，生成新的
        let new_secret = generate_api_secret();
        app_settings.mihomo.secret = new_secret.clone();
        config_manager.save_app_settings(&app_settings)?;
        log::info!("Generated new API secret");
        new_secret
    };

    let api_url = format!("http://{}", app_settings.mihomo.external_controller);

    // 同步 secret 和 external_controller 到 config.yaml
    // 确保 MiHomo 启动时使用正确的配置
    if config.secret != api_secret
        || config.external_controller != app_settings.mihomo.external_controller
    {
        config.secret = api_secret.clone();
        config.external_controller = app_settings.mihomo.external_controller.clone();
        config_changed = true;
    }

    if config_changed {
        config_manager.save_mihomo_config(&config)?;
        log::debug!("Synced API settings to config.yaml (or reset to default)");
    }

    let mihomo_manager = Arc::new(MihomoManager::new(api_secret.clone())?);
    let mihomo_api = Arc::new(MihomoApi::new(api_url.clone(), api_secret.clone()));
    let log_streamer = Arc::new(LogStreamer::new(api_url, api_secret.clone()));

    // 检测系统当前的代理状态（恢复上次的状态）- 同步操作，很快
    let current_system_proxy = crate::system::SystemProxy::get_proxy_status().unwrap_or(false);
    log::info!("Detected system proxy status: {}", current_system_proxy);

    // 优化：并行执行多个异步检查
    // 1. 检查 mihomo 是否运行
    // 2. Windows: 检查服务状态
    let is_running = mihomo_manager.is_running().await;

    // Windows: 检查服务状态，如果服务正在运行但 mihomo 没有启动，则通过服务启动
    #[cfg(target_os = "windows")]
    {
        use crate::system::WinServiceManager;

        // 优化：只检查服务是否运行，不查询 mihomo 状态（节省一次 HTTP 请求）
        let service_running = WinServiceManager::is_running().unwrap_or(false);

        if service_running && !is_running {
            log::info!("Service is running but mihomo is not, starting mihomo via service...");

            // 通过服务启动 mihomo
            if let Err(e) = mihomo_manager.start().await {
                log::error!("Failed to start mihomo via service: {}", e);
            } else {
                log::info!("Mihomo started via service successfully");
            }
        } else if service_running {
            log::info!("Service and mihomo are both running");
        }
    }

    // 如果配置发生变更（如密钥更新）且 Mihomo 正在运行，需要重启以应用新配置
    // 否则 API 调用会因认证失败而报错
    // 注意：这需要在服务启动检查之后，因为可能刚启动了 mihomo
    let is_running_now = mihomo_manager.is_running().await;
    if config_changed && is_running_now {
        log::info!("API configuration changed, restarting Mihomo...");
        if let Err(e) = mihomo_manager.restart().await {
            log::warn!("Failed to restart Mihomo after config change: {}", e);
        }
    }

    // 优化：在后台获取 enhanced_mode，不阻塞初始化
    // 先假设 false，后续通过前端轮询或事件更新
    let enhanced_mode = if is_running_now {
        // 快速尝试获取配置，超时 500ms
        match tokio::time::timeout(
            std::time::Duration::from_millis(500),
            mihomo_api.get_configs(),
        )
        .await
        {
            Ok(Ok(configs)) => configs
                .get("tun")
                .and_then(|tun| tun.get("enable"))
                .and_then(|enabled| enabled.as_bool())
                .unwrap_or(false),
            Ok(Err(err)) => {
                log::warn!("Failed to fetch MiHomo configs: {}", err);
                false
            }
            Err(_) => {
                log::debug!("Timeout fetching MiHomo configs, will update later");
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
        api_secret,
        profile_switch_lock: Arc::new(Mutex::new(())),
        pending_profile_id: Arc::new(Mutex::new(None)),
    };

    // 也保存到全局状态，用于非命令的地方访问
    let _ = APP_STATE.set(state.clone());

    log::info!("App state initialized");
    Ok(state)
}
