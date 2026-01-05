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
    AppHandle, Manager, RunEvent,
};

use crate::tray_menu::TrayMenuState;

const TRAY_ID: &str = "main-tray";

fn load_tray_icon() -> Option<Image<'static>> {
    Image::from_bytes(include_bytes!("../icons/tray-icon.png")).ok()
}

fn build_terminal_proxy_command() -> Result<String, String> {
    let config_manager = crate::config::ConfigManager::new().map_err(|e| e.to_string())?;
    let config = config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;
    let http = format!("http://127.0.0.1:{}", config.port);
    let socks = format!("socks5://127.0.0.1:{}", config.socks_port);
    Ok(format!(
        "export http_proxy={http} https_proxy={http} all_proxy={socks}"
    ))
}

#[cfg(target_os = "macos")]
fn copy_to_clipboard(text: &str) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    {
        let stdin = child.stdin.as_mut().ok_or("Failed to open pbcopy stdin")?;
        stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn copy_to_clipboard(_text: &str) -> Result<(), String> {
    Err("Clipboard copy is not implemented on this platform".to_string())
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
        let system_proxy = status
            .as_ref()
            .map(|s| s.system_proxy)
            .unwrap_or(false);
        let enhanced_mode = status
            .as_ref()
            .map(|s| s.enhanced_mode)
            .unwrap_or(false);
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
        let system_proxy = status
            .as_ref()
            .map(|s| s.system_proxy)
            .unwrap_or(false);
        let enhanced_mode = status
            .as_ref()
            .map(|s| s.enhanced_mode)
            .unwrap_or(false);
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
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Err(err) = crate::utils::ensure_mihomo_in_data_dir() {
                log::warn!("Failed to initialize MiHomo binary in data dir: {}", err);
            }

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
                    "mode_rule" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::proxy::switch_mode(app, "rule".to_string()).await;
                        });
                    }
                    "mode_global" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::proxy::switch_mode(app, "global".to_string()).await;
                        });
                    }
                    "mode_direct" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::proxy::switch_mode(app, "direct".to_string()).await;
                        });
                    }
                    "system_proxy" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let current = commands::system::get_system_proxy_status()
                                .await
                                .unwrap_or(false);
                            let next = !current;
                            let _ = if next {
                                commands::system::set_system_proxy(app).await
                            } else {
                                commands::system::clear_system_proxy(app).await
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
                            let next = !current;
                            let _ = commands::proxy::set_tun_mode(app, next).await;
                        });
                    }
                    "copy_terminal_proxy" => {
                        tauri::async_runtime::spawn(async move {
                            match build_terminal_proxy_command() {
                                Ok(command) => {
                                    if let Err(err) = copy_to_clipboard(&command) {
                                        log::warn!("Failed to copy command: {}", err);
                                    }
                                }
                                Err(err) => {
                                    log::warn!("Failed to build proxy command: {}", err);
                                }
                            }
                        });
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

                        if let Ok(status) = commands::proxy::get_proxy_status().await {
                            app_handle
                                .state::<TrayMenuState>()
                                .sync_from_status(&status);
                        }
                        run_tray_traffic_loop(app_handle).await;
                    }
                    Err(e) => {
                        log::error!("Failed to initialize app state: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 代理命令
            commands::proxy::start_proxy,
            commands::proxy::stop_proxy,
            commands::proxy::restart_proxy,
            commands::proxy::get_proxy_status,
            commands::proxy::switch_mode,
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
            commands::config::apply_subscription,
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
            // 流量命令
            commands::proxy::get_traffic,
            // 连接命令
            commands::proxy::get_connections,
            commands::proxy::close_connection,
            commands::proxy::close_all_connections,
            // TUN 模式命令
            commands::proxy::set_tun_mode,
            commands::proxy::check_tun_permission,
            commands::proxy::setup_tun_permission,
            // 规则命令
            commands::proxy::get_rules_from_api,
            // 版本信息
            commands::proxy::get_core_version,
            // 局域网共享
            commands::proxy::set_allow_lan,
            // 端口与网络选项
            commands::proxy::set_ports,
            commands::proxy::set_ipv6,
            commands::proxy::set_tcp_concurrent,
            commands::proxy::set_mixed_port,
            commands::proxy::set_find_process_mode,
            commands::proxy::get_app_version,
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
            commands::profile::update_profile_config,
            // Profile Proxy Provider 命令
            commands::profile::add_proxy_provider_to_profile,
            commands::profile::update_proxy_provider_in_profile,
            commands::profile::delete_proxy_provider_from_profile,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                log::info!("Application is exiting, cleaning up...");

                // 清理子进程 - 使用同步方式，避免异步锁导致卡死
                if let Some(app_state) = app_handle.try_state::<commands::AppState>() {
                    // 清理 Sub-Store 进程
                    log::info!("Stopping Sub-Store service...");
                    if let Ok(manager) = app_state.substore_manager.try_lock() {
                        manager.stop_sync();
                        log::info!("Sub-Store stopped successfully");
                    } else {
                        log::warn!("Could not acquire Sub-Store lock, using pkill fallback");
                        // 使用 pkill 作为后备方案
                        #[cfg(unix)]
                        {
                            let _ = std::process::Command::new("pkill")
                                .args(["-9", "-f", "run-substore.js"])
                                .output();
                        }
                    }

                    // 清理 MiHomo 进程
                    log::info!("Stopping MiHomo service...");
                    app_state.mihomo_manager.stop_sync();
                    log::info!("MiHomo stopped successfully");
                } else {
                    // 如果没有 app_state，直接使用 cleanup 方法
                    mihomo::MihomoManager::cleanup_stale_processes();
                }

                log::info!("Cleanup completed on exit");
            }
        });
}
