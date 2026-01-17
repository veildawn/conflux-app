// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod mihomo;
mod models;
mod substore;
mod system;
mod tray_menu;
mod utils;
mod webdav;

#[cfg(not(target_os = "windows"))]
use std::time::Duration;

#[cfg(target_os = "macos")]
use std::time::Instant;

#[cfg(target_os = "macos")]
use std::sync::Arc;

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent,
};

use crate::tray_menu::TrayMenuState;

const TRAY_ID: &str = "main-tray";

fn load_tray_icon() -> Option<Image<'static>> {
    // Windows 使用专用的 Windows 托盘图标（无 macOS 留白）
    // macOS/Linux 使用专用托盘图标
    #[cfg(windows)]
    {
        Image::from_bytes(include_bytes!("../icons/tray-icon-win.png")).ok()
    }
    #[cfg(not(windows))]
    {
        Image::from_bytes(include_bytes!("../icons/tray-icon.png")).ok()
    }
}

#[cfg(target_os = "macos")]
fn build_fontdb() -> Arc<resvg::usvg::fontdb::Database> {
    let mut fontdb = resvg::usvg::fontdb::Database::new();
    fontdb.load_system_fonts();
    Arc::new(fontdb)
}

#[cfg(not(target_os = "windows"))]
fn format_speed_compact(bytes_per_sec: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let value = bytes_per_sec as f64;

    if value >= GB {
        format!("{:.1}G", value / GB)
    } else if value >= MB {
        format!("{:.1}M", value / MB)
    } else if value >= KB {
        format!("{:.0}K", value / KB)
    } else {
        format!("{:.0}B", value)
    }
}

#[cfg(target_os = "macos")]
fn generate_speed_svg(up_speed: &str, down_speed: &str, mode: char, show_text: bool) -> String {
    let width = if show_text { 160 } else { 44 };
    let arrow_gap = 4;
    let arrow_col_width = 14;
    let right_padding = 4;
    let arrow_x = width - right_padding;
    let text_x = arrow_x - arrow_col_width - arrow_gap;
    let text_block = if show_text {
        format!(
            r#"<g font-family="SF Mono, Menlo, Monaco, 'Courier New', monospace" font-weight="700" font-size="22" text-rendering="geometricPrecision">
      <text x="{text_x}" y="17" text-anchor="end">{up}</text>
      <text x="{arrow_x}" y="17" text-anchor="end" font-size="24">↑</text>
      <text x="{text_x}" y="39" text-anchor="end">{down}</text>
      <text x="{arrow_x}" y="39" text-anchor="end" font-size="24">↓</text>
    </g>"#,
            up = up_speed,
            down = down_speed,
            arrow_x = arrow_x,
            text_x = text_x
        )
    } else {
        String::new()
    };
    format!(
        r##"<svg width="{width}" height="44" viewBox="0 0 {width} 44" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id="badge-mask">
      <rect x="0" y="0" width="100%" height="100%" fill="white" />
      <rect x="24" y="24" width="20" height="20" rx="5" fill="black" />
      <rect x="26" y="26" width="16" height="16" rx="3" fill="white" />
      <text x="34" y="34" font-family="SF Mono, Menlo, Monaco, 'Courier New', monospace" font-weight="900" font-size="14" text-anchor="middle" dominant-baseline="middle" fill="black">{mode}</text>
    </mask>
  </defs>
  <g fill="#FFFFFF" mask="url(#badge-mask)">
    <rect x="2" y="22" width="6" height="14" rx="2" />
    <rect x="11" y="8" width="6" height="28" rx="2" />
    <rect x="20" y="16" width="6" height="20" rx="2" />
    <rect x="29" y="12" width="6" height="24" rx="2" />
    <rect x="26" y="26" width="16" height="16" rx="3" />
    {text_block}
  </g>
</svg>"##,
        width = width,
        mode = mode,
        text_block = text_block
    )
}

#[cfg(target_os = "macos")]
fn render_speed_icon(
    fontdb: &Arc<resvg::usvg::fontdb::Database>,
    up_speed: &str,
    down_speed: &str,
    mode: char,
    show_text: bool,
) -> Option<Image<'static>> {
    let svg = generate_speed_svg(up_speed, down_speed, mode, show_text);
    let mut options = resvg::usvg::Options::default();
    options.fontdb = fontdb.clone();
    let tree = resvg::usvg::Tree::from_str(&svg, &options).ok()?;
    let size = tree.size().to_int_size();
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())?;
    let mut pixmap_mut = pixmap.as_mut();
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap_mut,
    );
    let png_bytes = pixmap.encode_png().ok()?;
    Image::from_bytes(&png_bytes).ok()
}

#[cfg(target_os = "macos")]
async fn run_tray_traffic_loop(app_handle: AppHandle) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    let fontdb = build_fontdb();
    let mut last_up = String::new();
    let mut last_down = String::new();
    let mut last_mode = '\0';
    let mut last_show_text = false;
    let mut last_update = Instant::now() - Duration::from_secs(5);
    let min_update_interval = Duration::from_millis(1800);

    loop {
        interval.tick().await;
        let status = commands::proxy::get_proxy_status().await.ok();
        let running = status.as_ref().map(|s| s.running).unwrap_or(false);
        let system_proxy = status.as_ref().map(|s| s.system_proxy).unwrap_or(false);
        let enhanced_mode = status.as_ref().map(|s| s.enhanced_mode).unwrap_or(false);
        let mode = status
            .as_ref()
            .map(|s| match s.mode.as_str() {
                "global" => 'G',
                "direct" => 'D',
                _ => 'R',
            })
            .unwrap_or('R');
        let show_text = running && (system_proxy || enhanced_mode);
        let (up, down) = if show_text {
            match commands::proxy::get_traffic().await {
                Ok(data) => (data.up, data.down),
                Err(err) => {
                    log::warn!("Failed to fetch traffic: {}", err);
                    (0, 0)
                }
            }
        } else {
            (0, 0)
        };

        let (up_text, down_text) = if show_text {
            (format_speed_compact(up), format_speed_compact(down))
        } else {
            (String::new(), String::new())
        };
        let text_changed = up_text != last_up || down_text != last_down;
        let state_changed = mode != last_mode || show_text != last_show_text;
        if !text_changed && !state_changed {
            continue;
        }
        if show_text && !state_changed && last_update.elapsed() < min_update_interval {
            continue;
        }

        last_up = up_text.clone();
        last_down = down_text.clone();
        last_mode = mode;
        last_show_text = show_text;
        last_update = Instant::now();

        let Some(tray) = app_handle.tray_by_id(TRAY_ID) else {
            break;
        };

        if let Some(icon) = render_speed_icon(&fontdb, &up_text, &down_text, mode, show_text) {
            let _ = tray.set_title(None::<&str>);
            if tray.set_icon(Some(icon)).is_err() {
                break;
            }
            let _ = tray.set_icon_as_template(true);
        } else {
            break;
        }
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
async fn run_tray_traffic_loop(app_handle: AppHandle) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    let mut last_title = String::new();
    let mut last_show_text = false;

    loop {
        interval.tick().await;
        let status = commands::proxy::get_proxy_status().await.ok();
        let running = status.as_ref().map(|s| s.running).unwrap_or(false);
        let system_proxy = status.as_ref().map(|s| s.system_proxy).unwrap_or(false);
        let enhanced_mode = status.as_ref().map(|s| s.enhanced_mode).unwrap_or(false);
        let show_text = running && (system_proxy || enhanced_mode);

        if !show_text {
            let Some(tray) = app_handle.tray_by_id(TRAY_ID) else {
                break;
            };
            if last_show_text {
                let _ = tray.set_title(None::<&str>);
                last_title.clear();
                last_show_text = false;
            }
            continue;
        }

        let (up, down) = match commands::proxy::get_traffic().await {
            Ok(data) => (data.up, data.down),
            Err(err) => {
                log::warn!("Failed to fetch traffic: {}", err);
                (0, 0)
            }
        };

        let title = format!(
            "{}\n{}",
            format_speed_compact(up),
            format_speed_compact(down)
        );
        let Some(tray) = app_handle.tray_by_id(TRAY_ID) else {
            break;
        };

        if title == last_title && last_show_text {
            continue;
        }

        last_title = title.clone();
        last_show_text = true;

        if tray.set_title(Some(title)).is_err() {
            break;
        }
    }
}

#[cfg(target_os = "windows")]
async fn run_tray_traffic_loop(_app_handle: AppHandle) {}

fn main() {
    // 设置默认日志级别为 info，可通过 RUST_LOG 环境变量覆盖
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Windows: 设置 AppUserModelId，让所有 WebView2 进程在任务管理器中显示为应用子进程
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        const APP_USER_MODEL_ID: &str = "com.conflux.desktop";

        // 1. 设置主进程的 AUMID
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
        }

        let app_id: Vec<u16> = OsStr::new(APP_USER_MODEL_ID)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
        }

        // 2. 设置 WebView2 子进程的 AUMID（通过环境变量）
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            format!("--app-user-model-id={}", APP_USER_MODEL_ID),
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // 让 IDE/RA 能追踪到通过 generate_handler 注册的命令引用（避免 dead_code 误报）
            commands::system::link_tauri_commands_for_ide();

            // 注意：ensure_mihomo_in_data_dir 已移至 init_app_state 中与 ensure_bundled_geodata 并行执行
            // 这样可以减少启动时的阻塞时间

            // 创建系统托盘
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let separator_top = PredefinedMenuItem::separator(app)?;

            let mode_rule_item =
                CheckMenuItem::with_id(app, "mode_rule", "规则", true, true, None::<&str>)?;
            let mode_global_item =
                CheckMenuItem::with_id(app, "mode_global", "全局", true, false, None::<&str>)?;
            let mode_direct_item =
                CheckMenuItem::with_id(app, "mode_direct", "直连", true, false, None::<&str>)?;
            let mode_menu = Submenu::with_items(
                app,
                "出站模式",
                true,
                &[&mode_rule_item, &mode_global_item, &mode_direct_item],
            )?;

            let separator_middle = PredefinedMenuItem::separator(app)?;
            let system_proxy_item = CheckMenuItem::with_id(
                app,
                "system_proxy",
                "设置为系统代理",
                true,
                false,
                None::<&str>,
            )?;
            let enhanced_mode_item = CheckMenuItem::with_id(
                app,
                "enhanced_mode",
                "增强模式",
                true,
                false,
                None::<&str>,
            )?;
            let copy_proxy_item = MenuItem::with_id(
                app,
                "copy_terminal_proxy",
                "复制终端代理命令",
                true,
                None::<&str>,
            )?;
            let open_data_dir_item =
                MenuItem::with_id(app, "open_data_dir", "打开用户目录", true, None::<&str>)?;
            let separator_bottom = PredefinedMenuItem::separator(app)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &separator_top,
                    &mode_menu,
                    &separator_middle,
                    &system_proxy_item,
                    &enhanced_mode_item,
                    &copy_proxy_item,
                    &open_data_dir_item,
                    &separator_bottom,
                    &quit_item,
                ],
            )?;

            app.manage(TrayMenuState {
                mode_rule_item: mode_rule_item.clone(),
                mode_global_item: mode_global_item.clone(),
                mode_direct_item: mode_direct_item.clone(),
                system_proxy_item: system_proxy_item.clone(),
                enhanced_mode_item: enhanced_mode_item.clone(),
            });

            let tray_icon = load_tray_icon()
                .or_else(|| app.default_window_icon().cloned())
                .expect("missing tray icon");

            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "mode_rule" | "mode_global" | "mode_direct" => {
                        let target_mode = match event.id.as_ref() {
                            "mode_rule" => "rule",
                            "mode_global" => "global",
                            "mode_direct" => "direct",
                            _ => return,
                        };
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ =
                                commands::proxy::switch_mode(app, target_mode.to_string()).await;
                        });
                    }
                    "system_proxy" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let current = commands::system::get_system_proxy_status()
                                .await
                                .unwrap_or(false);
                            let _ = if current {
                                commands::system::clear_system_proxy(app).await
                            } else {
                                commands::system::set_system_proxy(app).await
                            };
                        });
                    }
                    "enhanced_mode" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let current = commands::proxy::get_proxy_status()
                                .await
                                .ok()
                                .map(|status| status.enhanced_mode)
                                .unwrap_or(false);
                            let _ = commands::proxy::set_tun_mode(app, !current).await;
                        });
                    }
                    "copy_terminal_proxy" => {
                        tauri::async_runtime::spawn(async move {
                            match crate::utils::build_terminal_proxy_command() {
                                Ok(command) => {
                                    if let Err(err) = crate::utils::copy_to_clipboard(&command) {
                                        log::warn!("Failed to copy command: {}", err);
                                    }
                                }
                                Err(err) => {
                                    log::warn!("Failed to build proxy command: {}", err);
                                }
                            }
                        });
                    }
                    "open_data_dir" => {
                        if let Ok(data_dir) = crate::utils::get_app_data_dir() {
                            #[cfg(target_os = "windows")]
                            {
                                let _ = std::process::Command::new("explorer")
                                    .arg(&data_dir)
                                    .spawn();
                            }
                            #[cfg(target_os = "macos")]
                            {
                                let _ = std::process::Command::new("open").arg(&data_dir).spawn();
                            }
                            #[cfg(target_os = "linux")]
                            {
                                let _ = std::process::Command::new("xdg-open")
                                    .arg(&data_dir)
                                    .spawn();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // 初始化应用状态
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match commands::init_app_state(&app_handle).await {
                    Ok(app_state) => {
                        // 将状态注册到 Tauri
                        app_handle.manage(app_state);

                        // 启动时同步托盘菜单状态（只在启动时同步一次）
                        if let Ok(status) = commands::proxy::get_proxy_status().await {
                            app_handle
                                .state::<TrayMenuState>()
                                .sync_from_status(&status);
                        }

                        // 通知前端后端已准备就绪
                        log::info!("Backend initialized, emitting backend-ready event");
                        let _ = app_handle.emit("backend-ready", ());

                        // 短暂延迟后发送状态事件，确保前端监听器已注册
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        if let Ok(status) = commands::proxy::get_proxy_status().await {
                            log::info!("Emitting initial proxy status: running={}", status.running);
                            let _ = app_handle.emit("proxy-status-changed", &status);
                        }

                        run_tray_traffic_loop(app_handle).await;
                    }
                    Err(e) => {
                        log::error!("Failed to initialize app state: {}", e);
                        // 即使失败也通知前端，让前端可以显示错误
                        let _ = app_handle.emit("backend-init-failed", e.to_string());
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 代理命令
            commands::proxy::start_proxy,
            commands::proxy::start_proxy_normal_mode,
            commands::proxy::stop_proxy,
            commands::proxy::restart_proxy,
            commands::proxy::get_proxy_status,
            commands::proxy::switch_mode,
            commands::proxy::get_run_mode,
            // 节点命令
            commands::proxy::get_proxies,
            commands::proxy::select_proxy,
            commands::proxy::test_proxy_delay,
            // 配置命令
            commands::config::get_config,
            commands::config::get_config_proxies,
            commands::config::save_config,
            commands::config::get_app_settings,
            commands::config::save_app_settings,
            commands::config::get_rules,
            commands::config::save_rules,
            commands::config::download_resource,
            commands::config::check_resource_files,
            commands::config::check_resource_updates,
            commands::config::reload_geo_database,
            // 系统命令
            commands::system::set_system_proxy,
            commands::system::clear_system_proxy,
            commands::system::get_system_proxy_status,
            commands::system::get_autostart_enabled,
            commands::system::set_autostart_enabled,
            // 首页网络信息
            commands::system::get_public_ip_info,
            commands::system::get_local_ip_info,
            commands::system::get_terminal_proxy_command,
            commands::system::copy_to_clipboard,
            commands::system::copy_terminal_proxy_command,
            // 管理员权限相关
            commands::system::is_admin,
            commands::system::restart_as_admin,
            // 重置数据
            commands::system::reset_all_data,
            // 进程图标（连接/请求列表）
            commands::system::get_process_icon,
            // macOS Network Extension（占位，用于增强模式引导）
            commands::system::get_network_extension_status,
            commands::system::open_network_extension_settings,
            // 流量命令
            commands::proxy::get_traffic,
            // 连接命令
            commands::proxy::get_connections,
            commands::proxy::close_connection,
            commands::proxy::close_all_connections,
            // TUN 模式命令
            commands::proxy::set_tun_mode,
            commands::proxy::set_tun_stack,
            commands::proxy::set_strict_route,
            commands::proxy::set_tun_route_exclude,
            commands::proxy::check_tun_permission,
            commands::proxy::setup_tun_permission,
            commands::proxy::check_tun_consistency,
            // 规则命令
            commands::proxy::get_rules_from_api,
            // 版本信息
            commands::proxy::get_core_version,
            commands::proxy::upgrade_core,
            // 局域网共享
            commands::proxy::set_allow_lan,
            // 端口与网络选项
            commands::proxy::set_ports,
            commands::proxy::set_ipv6,
            commands::proxy::set_tcp_concurrent,
            commands::proxy::set_sniffing,
            commands::proxy::set_mixed_port,
            commands::proxy::set_find_process_mode,
            commands::proxy::get_app_version,
            commands::proxy::flush_fakeip_cache,
            // Provider 命令
            commands::proxy::get_proxy_providers,
            commands::proxy::update_proxy_provider,
            commands::proxy::health_check_proxy_provider,
            commands::proxy::get_rule_providers,
            commands::proxy::update_rule_provider,
            // 日志命令
            commands::logs::start_log_stream,
            commands::logs::stop_log_stream,
            commands::logs::set_log_level,
            // Sub-Store 命令
            commands::substore::start_substore,
            commands::substore::stop_substore,
            commands::substore::get_substore_status,
            commands::substore::get_substore_subs,
            commands::substore::get_substore_collections,
            // Windows 服务命令
            commands::service::get_service_status,
            commands::service::install_service,
            commands::service::uninstall_service,
            commands::service::start_service,
            commands::service::stop_service,
            commands::service::restart_service,
            commands::service::has_admin_privileges,
            // Profile 命令
            commands::profile::list_profiles,
            commands::profile::get_profile,
            commands::profile::get_active_profile_id,
            commands::profile::create_remote_profile,
            commands::profile::create_local_profile,
            commands::profile::create_blank_profile,
            commands::profile::delete_profile,
            commands::profile::rename_profile,
            commands::profile::activate_profile,
            commands::profile::refresh_profile,
            commands::profile::parse_config_file,
            commands::profile::preview_remote_config,
            commands::profile::export_profile_config,
            // Profile 代理 CRUD 命令
            commands::profile::add_proxy,
            commands::profile::update_proxy,
            commands::profile::delete_proxy,
            // Profile 规则命令
            commands::profile::add_rule_to_profile,
            commands::profile::delete_rule_from_profile,
            commands::profile::add_rule_provider_to_profile,
            commands::profile::delete_rule_provider_from_profile,
            commands::profile::update_rule_provider_in_profile,
            commands::profile::rename_rule_provider_in_profile,
            commands::profile::update_profile_config,
            // Profile Proxy Provider 命令
            commands::profile::add_proxy_provider_to_profile,
            commands::profile::update_proxy_provider_in_profile,
            commands::profile::rename_proxy_provider_in_profile,
            commands::profile::delete_proxy_provider_from_profile,
            // Profile Proxy Group 命令
            commands::profile::rename_proxy_group_in_profile,
            // Profile 提供者统计命令
            commands::profile::update_profile_provider_stats,
            // URL 延迟测试命令
            commands::proxy::test_url_delay,
            commands::proxy::test_urls_delay,
            // WebDAV 同步命令
            commands::webdav::test_webdav_connection,
            commands::webdav::get_webdav_config,
            commands::webdav::save_webdav_config,
            commands::webdav::webdav_upload,
            commands::webdav::webdav_download,
            commands::webdav::webdav_sync,
            commands::webdav::get_sync_status,
            commands::webdav::clear_sync_status,
            commands::webdav::check_webdav_conflict,
            commands::webdav::resolve_webdav_conflict,
            commands::webdav::resolve_file_conflict,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                RunEvent::Resumed => {
                    // 系统从休眠中唤醒，检查 mihomo 状态
                    log::info!("System resumed from sleep, checking MiHomo status...");

                    let app = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        // 等待一小段时间让系统网络恢复
                        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

                        if let Some(app_state) = app.try_state::<commands::AppState>() {
                            // 检查 mihomo 进程是否在运行
                            if !app_state.mihomo_manager.is_running().await {
                                log::info!(
                                    "MiHomo was not running before sleep, skipping recovery"
                                );
                                return;
                            }

                            // 先尝试健康检查，看 API 是否正常响应
                            log::info!("Performing health check on MiHomo...");
                            if app_state.mihomo_manager.check_health().await.is_ok() {
                                log::info!(
                                    "MiHomo is healthy after system resume, no action needed"
                                );
                                let _ = app.emit("system-resumed", ());
                                return;
                            }

                            // API 无响应，尝试重新加载配置
                            log::warn!("MiHomo health check failed, attempting config reload...");
                            let config_path = app_state.config_manager.mihomo_config_path();
                            if let Some(path_str) = config_path.to_str() {
                                if app_state
                                    .mihomo_api
                                    .reload_configs(path_str, true)
                                    .await
                                    .is_ok()
                                {
                                    log::info!("Config reload successful after system resume");
                                    if let Ok(status) = commands::proxy::get_proxy_status().await {
                                        let _ = app.emit("proxy-status-changed", &status);
                                    }
                                    let _ = app.emit("system-resumed", ());
                                    return;
                                }
                            }

                            // 重新加载失败，最后尝试重启进程
                            log::warn!("Config reload failed, restarting MiHomo process...");
                            match app_state.mihomo_manager.restart().await {
                                Ok(_) => {
                                    log::info!("MiHomo restarted successfully after system resume");
                                    if let Ok(status) = commands::proxy::get_proxy_status().await {
                                        let _ = app.emit("proxy-status-changed", &status);
                                    }
                                    let _ = app.emit("system-resumed", ());
                                }
                                Err(e) => {
                                    log::error!(
                                        "Failed to restart MiHomo after system resume: {}",
                                        e
                                    );
                                    let _ = app.emit("mihomo-restart-failed", e.to_string());
                                }
                            }
                        }
                    });
                }
                RunEvent::Exit => {
                    log::info!("Application is exiting, cleaning up...");

                    // 清理子进程和系统设置 - 使用同步方式，避免异步锁导致卡死
                    if let Some(app_state) = app_handle.try_state::<commands::AppState>() {
                        // 1. 清理系统代理设置
                        log::info!("Clearing system proxy settings...");
                        if let Ok(enabled) = app_state.system_proxy_enabled.try_lock() {
                            if *enabled {
                                if let Err(e) = system::SystemProxy::clear_proxy() {
                                    log::warn!("Failed to clear system proxy: {}", e);
                                } else {
                                    log::info!("System proxy cleared successfully");
                                }
                            }
                        } else {
                            // 无法获取锁时，保守地尝试清理
                            let _ = system::SystemProxy::clear_proxy();
                        }

                        // 2. 清理 Sub-Store 进程（使用 PID 文件，跨平台）
                        log::info!("Stopping Sub-Store service...");
                        if let Ok(manager) = app_state.substore_manager.try_lock() {
                            manager.stop_sync();
                        } else {
                            // 无法获取锁时，通过 PID 文件清理
                            log::warn!("Could not acquire Sub-Store lock, using PID file cleanup");
                            substore::SubStoreManager::cleanup_stale_processes(0);
                        }
                        log::info!("Sub-Store cleanup completed");

                        // 3. 清理 MiHomo 进程（包括服务模式）
                        log::info!("Stopping MiHomo service...");
                        app_state.mihomo_manager.stop_sync();
                        log::info!("MiHomo stopped via manager");

                        // 4. 额外清理：确保所有 mihomo 进程都被终止
                        mihomo::MihomoManager::cleanup_stale_processes();
                        log::info!("All MiHomo processes cleaned up");
                    } else {
                        // 如果没有 app_state，直接使用 cleanup 方法清理所有进程
                        log::warn!("App state not available, using fallback cleanup");

                        // 保守地清理系统代理
                        let _ = system::SystemProxy::clear_proxy();

                        // 清理所有 mihomo 进程
                        mihomo::MihomoManager::cleanup_stale_processes();
                    }

                    log::info!("Cleanup completed on exit");
                }
                _ => {}
            }
        });
}
