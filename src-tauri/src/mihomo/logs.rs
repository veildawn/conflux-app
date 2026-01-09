use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

/// 日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    #[serde(rename = "type")]
    pub log_type: String,
    pub payload: String,
}

/// 日志级别
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
    Silent,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "debug",
            LogLevel::Info => "info",
            LogLevel::Warning => "warning",
            LogLevel::Error => "error",
            LogLevel::Silent => "silent",
        }
    }
}

impl From<&str> for LogLevel {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "debug" => LogLevel::Debug,
            "info" => LogLevel::Info,
            "warning" | "warn" => LogLevel::Warning,
            "error" => LogLevel::Error,
            "silent" => LogLevel::Silent,
            _ => LogLevel::Info,
        }
    }
}

/// 日志流管理器
pub struct LogStreamer {
    running: Arc<AtomicBool>,
    current_level: Arc<Mutex<LogLevel>>,
    level_changed: Arc<AtomicBool>,
    base_url: String,
    secret: String,
}

impl LogStreamer {
    pub fn new(base_url: String, secret: String) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            current_level: Arc::new(Mutex::new(LogLevel::Info)),
            level_changed: Arc::new(AtomicBool::new(false)),
            base_url,
            secret,
        }
    }

    /// 开始日志流
    pub async fn start(&self, app: AppHandle, level: LogLevel) -> Result<()> {
        // 更新日志级别
        {
            let mut current = self.current_level.lock().await;
            if *current != level {
                *current = level;
                self.level_changed.store(true, Ordering::SeqCst);
            }
        }

        // 如果已经在运行，标记级别已改变以触发重连
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let current_level = self.current_level.clone();
        let level_changed = self.level_changed.clone();
        let base_url = self.base_url.clone();
        let secret = self.secret.clone();

        tokio::spawn(async move {
            let mut current_ws_level = LogLevel::Info;

            loop {
                if !running.load(Ordering::SeqCst) {
                    break;
                }

                let level = {
                    let l = current_level.lock().await;
                    *l
                };

                // 检查级别是否改变，如果改变则重连
                if level != current_ws_level || level_changed.load(Ordering::SeqCst) {
                    current_ws_level = level;
                    level_changed.store(false, Ordering::SeqCst);
                }

                // 构建 WebSocket URL
                let ws_url = base_url
                    .replace("http://", "ws://")
                    .replace("https://", "wss://");
                let url = format!("{}/logs?level={}", ws_url, level.as_str());

                // 创建请求并添加认证头
                let mut request = match url.into_client_request() {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("Failed to create WebSocket request: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        continue;
                    }
                };

                if !secret.is_empty() {
                    request.headers_mut().insert(
                        "Authorization",
                        format!("Bearer {}", secret).parse().unwrap(),
                    );
                }

                // 连接 WebSocket
                match connect_async(request).await {
                    Ok((ws_stream, _)) => {
                        log::info!("Log WebSocket connected");
                        let _ = app.emit("log-connected", true);

                        let (_, mut read) = ws_stream.split();

                        while let Some(message) = read.next().await {
                            if !running.load(Ordering::SeqCst) {
                                break;
                            }

                            // 检查级别是否改变，如果改变则断开以触发重连
                            if level_changed.load(Ordering::SeqCst) {
                                log::info!("Log level changed, reconnecting...");
                                break;
                            }

                            match message {
                                Ok(msg) => {
                                    if let Ok(text) = msg.into_text() {
                                        // 尝试解析为 LogEntry
                                        if let Ok(entry) = serde_json::from_str::<LogEntry>(&text) {
                                            let _ = app.emit("log-entry", entry);
                                        } else {
                                            // 如果解析失败，作为普通文本发送
                                            let entry = LogEntry {
                                                log_type: "info".to_string(),
                                                payload: text.to_string(),
                                            };
                                            let _ = app.emit("log-entry", entry);
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::error!("WebSocket error: {}", e);
                                    break;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to connect to log WebSocket: {}", e);
                        let _ = app.emit("log-error", e.to_string());
                    }
                }

                // 断开连接通知
                let _ = app.emit("log-connected", false);

                // 如果仍在运行，等待后重连
                if running.load(Ordering::SeqCst) {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                }
            }

            log::info!("Log streamer stopped");
        });

        Ok(())
    }

    /// 停止日志流
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    /// 更新日志级别（会触发重新连接）
    pub async fn set_level(&self, level: LogLevel) {
        let mut current = self.current_level.lock().await;
        *current = level;
    }
}
