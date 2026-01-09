use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use super::client::WebDavClient;
use crate::models::WebDavConfig;
use crate::utils::{get_app_config_dir, get_app_data_dir};

/// 远端目录前缀
const REMOTE_BASE_PATH: &str = "/conflux";

/// 同步状态文件名
const SYNC_STATE_FILE: &str = "sync_state.json";

/// 文件同步状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSyncState {
    /// 文件路径（相对路径）
    pub path: String,
    /// 上次同步时的文件 hash
    pub hash: String,
    /// 上次同步时间
    #[serde(alias = "synced_at")]
    pub synced_at: String,
}

/// 全局同步状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    /// 上次同步时间
    #[serde(alias = "last_sync_time")]
    pub last_sync_time: Option<String>,
    /// 各文件的同步状态
    pub files: HashMap<String, FileSyncState>,
}

/// 冲突信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    /// 本地修改时间
    pub local_modified: String,
    /// 远端修改时间
    pub remote_modified: String,
    /// 冲突的文件列表
    pub conflicting_files: Vec<String>,
}

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub uploaded_files: Vec<String>,
    pub downloaded_files: Vec<String>,
    pub has_conflict: bool,
    pub conflict_info: Option<ConflictInfo>,
}

/// 同步管理器
pub struct SyncManager {
    config: WebDavConfig,
}

impl SyncManager {
    /// 创建新的同步管理器
    pub fn new(config: WebDavConfig) -> Self {
        Self { config }
    }

    /// 创建 WebDAV 客户端
    fn create_client(&self) -> Result<WebDavClient> {
        WebDavClient::new(
            &self.config.url,
            &self.config.username,
            &self.config.password,
        )
    }

    /// 获取同步状态文件路径
    fn get_sync_state_path() -> Result<PathBuf> {
        let config_dir = get_app_config_dir()?;
        Ok(config_dir.join(SYNC_STATE_FILE))
    }

    /// 加载同步状态
    pub fn load_sync_state() -> Result<SyncState> {
        let state_path = Self::get_sync_state_path()?;
        if state_path.exists() {
            let content = fs::read_to_string(&state_path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            Ok(SyncState::default())
        }
    }

    /// 保存同步状态
    fn save_sync_state(state: &SyncState) -> Result<()> {
        let state_path = Self::get_sync_state_path()?;
        let content = serde_json::to_string_pretty(state)?;
        fs::write(&state_path, content)?;
        Ok(())
    }

    /// 计算文件 hash
    fn compute_hash(content: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }

    /// 获取需要同步的本地文件列表
    fn get_local_files() -> Result<Vec<(String, PathBuf)>> {
        let mut files = Vec::new();

        // 1. 应用设置文件
        let config_dir = get_app_config_dir()?;
        let settings_path = config_dir.join("settings.json");
        if settings_path.exists() {
            files.push(("settings.json".to_string(), settings_path));
        }

        let data_dir = get_app_data_dir()?;

        // 2. Sub-Store 数据文件
        let substore_path = data_dir.join("sub-store").join("sub-store.json");
        if substore_path.exists() {
            files.push(("sub-store/sub-store.json".to_string(), substore_path));
        }

        // 3. 规则集目录 (ruleset)
        let ruleset_dir = data_dir.join("ruleset");
        if ruleset_dir.exists() {
            if let Ok(entries) = fs::read_dir(&ruleset_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            // 忽略隐藏文件
                            if !name.starts_with('.') {
                                files.push((format!("ruleset/{}", name), path));
                            }
                        }
                    }
                }
            }
        }

        // 4. 各个 Profile 目录（每个 profile 包含 metadata.json 和 profile.yaml）
        let profiles_dir = data_dir.join("profiles");
        if profiles_dir.exists() {
            if let Ok(entries) = fs::read_dir(&profiles_dir) {
                for entry in entries.flatten() {
                    let profile_path = entry.path();
                    if profile_path.is_dir() {
                        if let Some(profile_id) = profile_path.file_name().and_then(|n| n.to_str())
                        {
                            // metadata.json
                            let metadata_path = profile_path.join("metadata.json");
                            if metadata_path.exists() {
                                files.push((
                                    format!("profiles/{}/metadata.json", profile_id),
                                    metadata_path,
                                ));
                            }
                            // profile.yaml
                            let profile_yaml_path = profile_path.join("profile.yaml");
                            if profile_yaml_path.exists() {
                                files.push((
                                    format!("profiles/{}/profile.yaml", profile_id),
                                    profile_yaml_path,
                                ));
                            }
                        }
                    }
                }
            }
        }

        // 注意：config.yaml 是运行时配置，由 settings.json + 当前激活 profile 动态生成
        // 不需要同步

        Ok(files)
    }

    /// 上传所有配置到远端（先清空远端，再上传本地配置）
    pub async fn upload_all(&self) -> Result<SyncResult> {
        let client = self.create_client()?;
        let mut uploaded_files = Vec::new();
        let mut state = Self::load_sync_state()?;

        // 1. 递归删除远端目录内容（坚果云不允许直接删除非空目录）
        let _ = client.delete_dir_contents(REMOTE_BASE_PATH).await;

        // 2. 确保目录存在
        client.ensure_dir(REMOTE_BASE_PATH).await?;

        // 3. 上传本地所有文件
        let local_files = Self::get_local_files()?;
        state.files.clear(); // 清空旧的同步状态

        for (relative_path, local_path) in &local_files {
            let content = fs::read(local_path)?;
            let hash = Self::compute_hash(&content);
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, relative_path);

            client.upload_file(&remote_path, &content).await?;
            uploaded_files.push(relative_path.clone());

            state.files.insert(
                relative_path.clone(),
                FileSyncState {
                    path: relative_path.clone(),
                    hash,
                    synced_at: chrono::Local::now().to_rfc3339(),
                },
            );
        }

        // 更新最后同步时间
        state.last_sync_time = Some(chrono::Local::now().to_rfc3339());
        Self::save_sync_state(&state)?;

        // 上传同步状态文件作为清单
        let state_content = serde_json::to_string_pretty(&state)?;
        let remote_state_path = format!("{}/{}", REMOTE_BASE_PATH, SYNC_STATE_FILE);
        client
            .upload_file(&remote_state_path, state_content.as_bytes())
            .await?;

        Ok(SyncResult {
            success: true,
            message: format!("成功上传 {} 个文件", uploaded_files.len()),
            uploaded_files,
            downloaded_files: vec![],
            has_conflict: false,
            conflict_info: None,
        })
    }

    /// 检查是否有冲突
    pub async fn check_conflict(&self) -> Result<Option<ConflictInfo>> {
        let client = self.create_client()?;
        let state = Self::load_sync_state()?;
        let local_files = Self::get_local_files()?;
        let mut conflicting_files = Vec::new();

        for (relative_path, local_path) in &local_files {
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, relative_path);

            // 检查远端文件是否存在
            if let Ok(Some(_remote_info)) = client.get_file_info(&remote_path).await {
                // 检查本地文件是否在上次同步后被修改
                let content = fs::read(local_path)?;
                let current_hash = Self::compute_hash(&content);

                if let Some(file_state) = state.files.get(relative_path) {
                    if file_state.hash != current_hash {
                        // 本地有修改，需要检查远端是否也有修改
                        // 简化处理：如果本地有修改且远端存在，则视为潜在冲突
                        conflicting_files.push(relative_path.clone());
                    }
                } else {
                    // 从未同步过但远端已存在，视为冲突
                    conflicting_files.push(relative_path.clone());
                }
            }
        }

        if conflicting_files.is_empty() {
            Ok(None)
        } else {
            Ok(Some(ConflictInfo {
                local_modified: chrono::Local::now().to_rfc3339(),
                remote_modified: "未知".to_string(),
                conflicting_files,
            }))
        }
    }

    /// 从远端下载配置
    pub async fn download_all(&self, force: bool) -> Result<SyncResult> {
        // 如果不是强制下载，先检查冲突
        if !force {
            if let Some(conflict_info) = self.check_conflict().await? {
                return Ok(SyncResult {
                    success: false,
                    message: "检测到冲突，请选择保留本地或使用远端配置".to_string(),
                    uploaded_files: vec![],
                    downloaded_files: vec![],
                    has_conflict: true,
                    conflict_info: Some(conflict_info),
                });
            }
        }

        let client = self.create_client()?;
        let mut downloaded_files = Vec::new();
        let mut state = Self::load_sync_state()?;

        // 尝试从远端下载同步状态文件作为清单
        let remote_state_path = format!("{}/{}", REMOTE_BASE_PATH, SYNC_STATE_FILE);
        match client.download_file(&remote_state_path).await {
            Ok(content) => {
                if let Ok(remote_state) = serde_json::from_slice::<SyncState>(&content) {
                    log::info!("发现远端同步状态文件，将使用它作为下载清单");
                    state = remote_state;
                }
            }
            Err(e) => {
                log::warn!("无法下载远端同步状态文件: {}", e);
                // 如果没有清单，我们只能依赖本地已知的状态，或者这里应该报错？
                // 考虑到兼容性，如果远端没有清单（旧版本上传的），我们可能无法得知完整文件列表
                // 但如果用户要求完全覆盖，最好是能获取到清单。
                // 此时继续使用本地 state (可能是空的)
            }
        }

        let config_dir = get_app_config_dir()?;
        let data_dir = get_app_data_dir()?;

        // 清理本地数据（完全替换模式）
        log::info!("正在清理本地数据以进行覆盖恢复...");
        // 1. 清理 profiles
        if let Err(e) = fs::remove_dir_all(data_dir.join("profiles")) {
            log::warn!("清理 profiles 目录失败 (可能不存在): {}", e);
        }
        // 2. 清理 ruleset
        if let Err(e) = fs::remove_dir_all(data_dir.join("ruleset")) {
            log::warn!("清理 ruleset 目录失败 (可能不存在): {}", e);
        }
        // 3. 清理 sub-store.json
        if let Err(e) = fs::remove_file(data_dir.join("sub-store").join("sub-store.json")) {
            log::warn!("清理 sub-store.json 失败 (可能不存在): {}", e);
        }
        // 4. 清理 settings.json
        if let Err(e) = fs::remove_file(config_dir.join("settings.json")) {
            log::warn!("清理 settings.json 失败 (可能不存在): {}", e);
        }

        // 下载应用设置文件（config.yaml 是运行时配置，不需要同步）
        let settings_path = config_dir.join("settings.json");
        let remote_settings_path = format!("{}/settings.json", REMOTE_BASE_PATH);

        match client.download_file(&remote_settings_path).await {
            Ok(content) => {
                if let Some(parent) = settings_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&settings_path, &content)?;
                downloaded_files.push("settings.json".to_string());

                let hash = Self::compute_hash(&content);
                state.files.insert(
                    "settings.json".to_string(),
                    FileSyncState {
                        path: "settings.json".to_string(),
                        hash,
                        synced_at: chrono::Local::now().to_rfc3339(),
                    },
                );
            }
            Err(e) => {
                log::warn!("下载文件 settings.json 失败: {}", e);
            }
        }

        // 下载数据目录下的文件（profiles, sub-store, ruleset 等）
        // 排除 settings.json（已处理）
        let data_files: Vec<String> = state
            .files
            .keys()
            .filter(|k| k.as_str() != "settings.json")
            .cloned()
            .collect();

        for relative_path in data_files {
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, relative_path);
            let local_path = data_dir.join(&relative_path);

            match client.download_file(&remote_path).await {
                Ok(content) => {
                    // 确保目录存在
                    if let Some(parent) = local_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::write(&local_path, &content)?;
                    downloaded_files.push(relative_path.clone());

                    let hash = Self::compute_hash(&content);
                    state.files.insert(
                        relative_path.clone(),
                        FileSyncState {
                            path: relative_path,
                            hash,
                            synced_at: chrono::Local::now().to_rfc3339(),
                        },
                    );
                }
                Err(e) => {
                    log::warn!("下载文件 {} 失败: {}", relative_path, e);
                }
            }
        }

        // 更新最后同步时间
        state.last_sync_time = Some(chrono::Local::now().to_rfc3339());
        Self::save_sync_state(&state)?;

        Ok(SyncResult {
            success: true,
            message: format!("成功下载 {} 个文件", downloaded_files.len()),
            uploaded_files: vec![],
            downloaded_files,
            has_conflict: false,
            conflict_info: None,
        })
    }

    /// 获取同步状态摘要
    pub fn get_sync_status() -> Result<SyncState> {
        Self::load_sync_state()
    }
}
