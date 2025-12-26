// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod mihomo;
mod models;
mod system;
mod utils;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 创建系统托盘
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 初始化应用状态
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = commands::init_app_state(&app_handle).await {
                    log::error!("Failed to initialize app state: {}", e);
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
            commands::config::save_config,
            commands::config::get_app_settings,
            commands::config::save_app_settings,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
