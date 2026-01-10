use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use super::client::WebDavClient;
use crate::models::{AppSettings, WebDavConfig};
use crate::utils::{get_app_config_dir, get_app_data_dir};

/// 远端目录前缀
const REMOTE_BASE_PATH: &str = "/conflux";

/// 同步状态文件名
const SYNC_STATE_FILE: &str = "sync_state.json";

// ============================================================================
// 数据结构定义
// ============================================================================

/// 文件同步状态（支持三方比较）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSyncState {
    /// 文件路径（相对路径）
    pub path: String,
    /// 上次同步时的本地文件 hash
    #[serde(alias = "hash")]
    pub local_hash: String,
    /// 上次同步时的远端文件 hash（用于检测远端变化）
    #[serde(default)]
    pub remote_hash: String,
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

/// 文件变更类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileChangeType {
    /// 无变化
    Unchanged,
    /// 本地修改
    LocalModified,
    /// 远端修改
    RemoteModified,
    /// 本地新增
    LocalAdded,
    /// 远端新增
    RemoteAdded,
    /// 本地删除
    LocalDeleted,
    /// 远端删除
    RemoteDeleted,
    /// 双方都修改（冲突）
    BothModified,
    /// 一方删除一方修改（冲突）
    DeleteModifyConflict,
}

/// 单个冲突项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictItem {
    /// 文件路径
    pub path: String,
    /// 冲突类型描述
    pub conflict_type: String,
    /// 本地状态
    pub local_status: String,
    /// 远端状态
    pub remote_status: String,
}

/// 冲突信息（保持向后兼容）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    /// 本地修改时间
    pub local_modified: String,
    /// 远端修改时间
    pub remote_modified: String,
    /// 冲突的文件列表（简单列表，向后兼容）
    pub conflicting_files: Vec<String>,
    /// 详细的冲突项列表
    #[serde(default)]
    pub conflict_items: Vec<ConflictItem>,
}

/// 变更集
#[derive(Debug, Clone, Default)]
pub struct ChangeSet {
    /// 需要上传的文件
    pub to_upload: Vec<String>,
    /// 需要下载的文件
    pub to_download: Vec<String>,
    /// 需要删除的本地文件
    pub to_delete_local: Vec<String>,
    /// 需要删除的远端文件
    pub to_delete_remote: Vec<String>,
    /// 冲突项
    pub conflicts: Vec<ConflictItem>,
}

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub uploaded_files: Vec<String>,
    pub downloaded_files: Vec<String>,
    #[serde(default)]
    pub deleted_local_files: Vec<String>,
    #[serde(default)]
    pub deleted_remote_files: Vec<String>,
    pub has_conflict: bool,
    pub conflict_info: Option<ConflictInfo>,
}

/// 本地文件信息
#[derive(Debug, Clone)]
struct LocalFileInfo {
    pub full_path: PathBuf,
    pub hash: String,
}

/// 远端文件信息
#[derive(Debug, Clone)]
struct RemoteFileInfo {
    pub hash: String, // 使用 ETag 或下载后计算
}

// ============================================================================
// 同步管理器实现
// ============================================================================

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

    /// 获取同步状态摘要
    pub fn get_sync_status() -> Result<SyncState> {
        Self::load_sync_state()
    }

    /// 清除同步状态（重置为初始状态）
    pub fn clear_sync_state() -> Result<()> {
        let state_path = Self::get_sync_state_path()?;
        if state_path.exists() {
            std::fs::remove_file(&state_path)?;
            log::info!("已清除同步状态文件: {:?}", state_path);
        }
        Ok(())
    }

    // ========================================================================
    // 增量同步核心方法
    // ========================================================================

    /// 增量同步（主入口）
    ///
    /// 自动检测本地和远端的变化，执行双向增量同步。
    /// 如果有冲突，返回冲突信息让用户选择。
    pub async fn sync(&self) -> Result<SyncResult> {
        log::info!("开始增量同步...");

        // 1. 加载上次同步状态（Base）
        let base_state = Self::load_sync_state()?;
        log::debug!("加载同步状态: {} 个文件", base_state.files.len());

        // 2. 扫描本地文件（Local）
        let local_files = self.scan_local_files()?;
        log::debug!("扫描到本地文件: {} 个", local_files.len());

        // 3. 扫描远端文件（Remote）
        let remote_files = self.scan_remote_files().await?;
        log::debug!("扫描到远端文件: {} 个", remote_files.len());

        // 4. 三方比较，生成变更集
        let change_set = self.compute_changes(&base_state, &local_files, &remote_files);
        log::info!(
            "变更集: 上传={}, 下载={}, 删除本地={}, 删除远端={}, 冲突={}",
            change_set.to_upload.len(),
            change_set.to_download.len(),
            change_set.to_delete_local.len(),
            change_set.to_delete_remote.len(),
            change_set.conflicts.len()
        );

        // 5. 如果有冲突，返回让用户选择
        if !change_set.conflicts.is_empty() {
            let conflict_files: Vec<String> = change_set
                .conflicts
                .iter()
                .map(|c| c.path.clone())
                .collect();
            return Ok(SyncResult {
                success: false,
                message: format!(
                    "检测到 {} 个文件冲突，请选择处理方式",
                    change_set.conflicts.len()
                ),
                uploaded_files: vec![],
                downloaded_files: vec![],
                deleted_local_files: vec![],
                deleted_remote_files: vec![],
                has_conflict: true,
                conflict_info: Some(ConflictInfo {
                    local_modified: chrono::Local::now().to_rfc3339(),
                    remote_modified: chrono::Local::now().to_rfc3339(),
                    conflicting_files: conflict_files,
                    conflict_items: change_set.conflicts,
                }),
            });
        }

        // 6. 无冲突，执行同步
        self.execute_sync(&change_set, &local_files, &remote_files)
            .await
    }

    /// 扫描本地文件并计算 hash
    fn scan_local_files(&self) -> Result<HashMap<String, LocalFileInfo>> {
        let mut files = HashMap::new();

        // 1. 应用设置文件
        let config_dir = get_app_config_dir()?;
        log::debug!("扫描配置目录: {:?}", config_dir);
        let settings_path = config_dir.join("settings.json");
        if settings_path.exists() {
            log::debug!("找到 settings.json: {:?}", settings_path);
            if let Ok(content) = fs::read(&settings_path) {
                let hash = Self::compute_hash(&content);
                files.insert(
                    "settings.json".to_string(),
                    LocalFileInfo {
                        full_path: settings_path,
                        hash,
                    },
                );
            }
        } else {
            log::debug!("settings.json 不存在");
        }

        let data_dir = get_app_data_dir()?;
        log::debug!("扫描数据目录: {:?}", data_dir);

        // 2. Sub-Store 数据文件
        let substore_path = data_dir.join("sub-store").join("sub-store.json");
        if substore_path.exists() {
            log::debug!("找到 sub-store.json: {:?}", substore_path);
            if let Ok(content) = fs::read(&substore_path) {
                let hash = Self::compute_hash(&content);
                files.insert(
                    "sub-store/sub-store.json".to_string(),
                    LocalFileInfo {
                        full_path: substore_path,
                        hash,
                    },
                );
            }
        }

        // 3. 规则集目录 (ruleset)
        let ruleset_dir = data_dir.join("ruleset");
        log::debug!("扫描 ruleset 目录: {:?}", ruleset_dir);
        if ruleset_dir.exists() {
            if let Ok(entries) = fs::read_dir(&ruleset_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if !name.starts_with('.') {
                                if let Ok(content) = fs::read(&path) {
                                    let hash = Self::compute_hash(&content);
                                    let relative_path = format!("ruleset/{}", name);
                                    log::debug!("找到 ruleset 文件: {}", relative_path);
                                    files.insert(
                                        relative_path,
                                        LocalFileInfo {
                                            full_path: path,
                                            hash,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        } else {
            log::debug!("ruleset 目录不存在");
        }

        // 4. 各个 Profile 目录
        let profiles_dir = data_dir.join("profiles");
        log::debug!("扫描 profiles 目录: {:?}", profiles_dir);
        if profiles_dir.exists() {
            if let Ok(entries) = fs::read_dir(&profiles_dir) {
                for entry in entries.flatten() {
                    let profile_path = entry.path();
                    if profile_path.is_dir() {
                        if let Some(profile_id) = profile_path.file_name().and_then(|n| n.to_str())
                        {
                            log::debug!("扫描 profile: {}", profile_id);
                            // metadata.json
                            let metadata_path = profile_path.join("metadata.json");
                            if metadata_path.exists() {
                                if let Ok(content) = fs::read(&metadata_path) {
                                    let hash = Self::compute_hash(&content);
                                    let relative_path =
                                        format!("profiles/{}/metadata.json", profile_id);
                                    log::debug!("找到: {}", relative_path);
                                    files.insert(
                                        relative_path,
                                        LocalFileInfo {
                                            full_path: metadata_path,
                                            hash,
                                        },
                                    );
                                }
                            }
                            // profile.yaml
                            let profile_yaml_path = profile_path.join("profile.yaml");
                            if profile_yaml_path.exists() {
                                if let Ok(content) = fs::read(&profile_yaml_path) {
                                    let hash = Self::compute_hash(&content);
                                    let relative_path =
                                        format!("profiles/{}/profile.yaml", profile_id);
                                    log::debug!("找到: {}", relative_path);
                                    files.insert(
                                        relative_path,
                                        LocalFileInfo {
                                            full_path: profile_yaml_path,
                                            hash,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        } else {
            log::debug!("profiles 目录不存在");
        }

        log::info!("本地文件扫描完成，共 {} 个文件", files.len());
        Ok(files)
    }

    /// 扫描远端文件
    ///
    /// 优化策略：
    /// 1. 获取远端 sync_state.json，利用其中的 hash 信息
    /// 2. 获取远端文件列表
    /// 3. 对于在 sync_state 中存在且在文件列表中存在的文件，直接使用记录的 hash
    /// 4. 对于只在文件列表中存在的（新文件），下载并计算 hash
    async fn scan_remote_files(&self) -> Result<HashMap<String, RemoteFileInfo>> {
        let client = self.create_client()?;
        let mut files = HashMap::new();

        // 1. 获取远端文件列表
        let entries = self
            .list_remote_files_recursive(&client, REMOTE_BASE_PATH)
            .await?;
        log::info!("远端目录列表: {} 个条目", entries.len());

        // 2. 尝试下载远端 sync_state.json
        let remote_state_path = format!("{}/{}", REMOTE_BASE_PATH, SYNC_STATE_FILE);
        let (remote_sync_state, state_file_exists) =
            match client.download_file(&remote_state_path).await {
                Ok(content) => {
                    match serde_json::from_slice::<SyncState>(&content) {
                        Ok(state) => {
                            log::debug!("成功加载远端同步状态，包含 {} 个文件", state.files.len());
                            (Some(state), true)
                        }
                        Err(e) => {
                            log::warn!("解析远端 sync_state.json 失败: {}", e);
                            // 文件存在但解析失败，我们仍然将其标记为存在，以触发后续的安全检查
                            (None, true)
                        }
                    }
                }
                Err(e) => {
                    // 404 错误表示是新环境，这是正常情况
                    log::debug!("远端 sync_state.json 不存在或下载失败: {}", e);
                    (None, false)
                }
            };

        // 安全检查：如果下载到了 sync_state.json（说明远端非空），但文件列表中没有它，
        // 说明 WebDAV 列表解析失败（可能是 XML 格式兼容性问题）。
        // 此时必须中止，否则会被误判为"远端文件被清空"，导致本地文件被错误删除。
        if state_file_exists {
            let state_file_full_path = format!("{}/{}", REMOTE_BASE_PATH, SYNC_STATE_FILE);
            // 简单的路径匹配，忽略首尾斜杠差异
            let has_state_in_list = entries
                .iter()
                .any(|(p, _)| p.trim_matches('/') == state_file_full_path.trim_matches('/'));

            if !has_state_in_list {
                return Err(anyhow!(
                    "Critical Error: WebDAV listing failed (sync_state.json missing from list). Aborting to prevent data loss."
                ));
            }
        }

        // 构建远端状态查找表
        let remote_state_map = remote_sync_state.map(|s| s.files);

        for (path, is_dir) in entries {
            if is_dir {
                continue;
            }

            // 跳过同步状态文件
            let relative_path = path
                .strip_prefix(REMOTE_BASE_PATH)
                .unwrap_or(&path)
                .trim_start_matches('/');

            if relative_path == SYNC_STATE_FILE || relative_path.is_empty() {
                continue;
            }

            // 检查是否在远端状态中有记录
            let mut hash = None;
            if let Some(ref state_map) = remote_state_map {
                if let Some(file_state) = state_map.get(relative_path) {
                    // 如果远端状态中有记录，直接使用
                    // 注意：这里我们使用的是 file_state.local_hash
                    // 因为 sync_state.json 记录的是上传者视角的 local_hash（即文件的真实 hash）
                    // 字段名虽为 local_hash，但在远端文件中代表了该文件的内容 hash
                    log::debug!("从远端状态中使用缓存 Hash: {}", relative_path);
                    hash = Some(file_state.local_hash.clone());
                }
            }

            // 如果没有记录（新文件），或者为了保险起见，我们需要下载计算
            if hash.is_none() {
                log::debug!("下载新文件计算 Hash: {}", relative_path);
                match client.download_file(&path).await {
                    Ok(content) => {
                        hash = Some(Self::compute_hash(&content));
                    }
                    Err(e) => {
                        log::warn!("下载远端文件 {} 失败: {}", relative_path, e);
                        continue;
                    }
                }
            }

            if let Some(h) = hash {
                files.insert(relative_path.to_string(), RemoteFileInfo { hash: h });
            }
        }

        log::info!("扫描到远端文件: {} 个", files.len());
        Ok(files)
    }

    /// 递归列出远端目录下所有文件
    async fn list_remote_files_recursive(
        &self,
        client: &WebDavClient,
        path: &str,
    ) -> Result<Vec<(String, bool)>> {
        let mut all_entries = Vec::new();
        let mut dirs_to_process = vec![path.to_string()];

        while let Some(current_dir) = dirs_to_process.pop() {
            log::debug!("列出远端目录: {}", current_dir);
            match client.list_dir(&current_dir).await {
                Ok(entries) => {
                    log::debug!("目录 {} 包含 {} 个条目", current_dir, entries.len());
                    for (entry_path, is_dir) in entries {
                        log::debug!("  - {} (目录: {})", entry_path, is_dir);
                        all_entries.push((entry_path.clone(), is_dir));
                        if is_dir {
                            dirs_to_process.push(entry_path);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("列出目录 {} 失败: {}", current_dir, e);
                }
            }
        }

        Ok(all_entries)
    }

    /// 三方比较算法
    ///
    /// 比较 Base（上次同步状态）、Local（当前本地）、Remote（当前远端），
    /// 生成精确的变更集。
    fn compute_changes(
        &self,
        base: &SyncState,
        local: &HashMap<String, LocalFileInfo>,
        remote: &HashMap<String, RemoteFileInfo>,
    ) -> ChangeSet {
        let mut change_set = ChangeSet::default();

        // 收集所有文件路径
        let mut all_paths: HashSet<String> = HashSet::new();
        all_paths.extend(base.files.keys().cloned());
        all_paths.extend(local.keys().cloned());
        all_paths.extend(remote.keys().cloned());

        for path in all_paths {
            let base_state = base.files.get(&path);
            let local_info = local.get(&path);
            let remote_info = remote.get(&path);

            let change_type =
                self.determine_change_type(&path, base_state, local_info, remote_info);

            match change_type {
                FileChangeType::Unchanged => {
                    // 无需操作
                }
                FileChangeType::LocalModified | FileChangeType::LocalAdded => {
                    change_set.to_upload.push(path);
                }
                FileChangeType::RemoteModified | FileChangeType::RemoteAdded => {
                    change_set.to_download.push(path);
                }
                FileChangeType::LocalDeleted => {
                    change_set.to_delete_remote.push(path);
                }
                FileChangeType::RemoteDeleted => {
                    change_set.to_delete_local.push(path);
                }
                FileChangeType::BothModified => {
                    change_set.conflicts.push(ConflictItem {
                        path,
                        conflict_type: "双方修改".to_string(),
                        local_status: "已修改".to_string(),
                        remote_status: "已修改".to_string(),
                    });
                }
                FileChangeType::DeleteModifyConflict => {
                    let (local_status, remote_status) = if local_info.is_some() {
                        ("已修改".to_string(), "已删除".to_string())
                    } else {
                        ("已删除".to_string(), "已修改".to_string())
                    };
                    change_set.conflicts.push(ConflictItem {
                        path,
                        conflict_type: "删除冲突".to_string(),
                        local_status,
                        remote_status,
                    });
                }
            }
        }

        change_set
    }

    /// 判断单个文件的变更类型
    fn determine_change_type(
        &self,
        _path: &str,
        base: Option<&FileSyncState>,
        local: Option<&LocalFileInfo>,
        remote: Option<&RemoteFileInfo>,
    ) -> FileChangeType {
        match (base, local, remote) {
            // 1. Base 中不存在（新文件）
            (None, Some(_), None) => FileChangeType::LocalAdded,
            (None, None, Some(_)) => FileChangeType::RemoteAdded,
            (None, Some(_), Some(_)) => {
                // 两边都新增，视为冲突
                FileChangeType::BothModified
            }

            // 2. Base 中存在，检查两边的变化
            (Some(base_state), local_opt, remote_opt) => {
                let local_changed = match local_opt {
                    Some(local_info) => local_info.hash != base_state.local_hash,
                    None => true, // 本地删除
                };

                let remote_changed = match remote_opt {
                    Some(remote_info) => {
                        // 如果 base 记录了 remote_hash，则比较
                        // 否则与 local_hash 比较（兼容旧数据）
                        if !base_state.remote_hash.is_empty() {
                            remote_info.hash != base_state.remote_hash
                        } else {
                            remote_info.hash != base_state.local_hash
                        }
                    }
                    None => true, // 远端删除
                };

                match (
                    local_opt.is_some(),
                    remote_opt.is_some(),
                    local_changed,
                    remote_changed,
                ) {
                    // 两边都存在
                    (true, true, false, false) => FileChangeType::Unchanged,
                    (true, true, true, false) => FileChangeType::LocalModified,
                    (true, true, false, true) => FileChangeType::RemoteModified,
                    (true, true, true, true) => FileChangeType::BothModified,

                    // 本地存在，远端不存在
                    (true, false, false, _) => FileChangeType::RemoteDeleted,
                    (true, false, true, _) => FileChangeType::DeleteModifyConflict, // 本地修改，远端删除

                    // 本地不存在，远端存在
                    (false, true, _, false) => FileChangeType::LocalDeleted,
                    (false, true, _, true) => FileChangeType::DeleteModifyConflict, // 本地删除，远端修改

                    // 两边都不存在（理论上不应该发生，但作为防御）
                    (false, false, _, _) => FileChangeType::Unchanged,
                }
            }

            // 3. Base 不存在，两边也都不存在（不应该发生）
            (None, None, None) => FileChangeType::Unchanged,
        }
    }

    /// 执行同步操作
    async fn execute_sync(
        &self,
        changes: &ChangeSet,
        local_files: &HashMap<String, LocalFileInfo>,
        remote_files: &HashMap<String, RemoteFileInfo>,
    ) -> Result<SyncResult> {
        let client = self.create_client()?;
        let mut state = Self::load_sync_state()?;

        let mut uploaded_files = Vec::new();
        let mut downloaded_files = Vec::new();
        let mut deleted_local_files = Vec::new();
        let mut deleted_remote_files = Vec::new();

        let config_dir = get_app_config_dir()?;
        let data_dir = get_app_data_dir()?;

        // 保存当前的 WebDAV 配置（下载 settings.json 后需要恢复）
        let current_webdav_config = self.config.clone();

        // 1. 上传本地修改/新增的文件
        for path in &changes.to_upload {
            if let Some(local_info) = local_files.get(path) {
                let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);
                match fs::read(&local_info.full_path) {
                    Ok(content) => {
                        if let Err(e) = client.upload_file(&remote_path, &content).await {
                            log::error!("上传文件 {} 失败: {}", path, e);
                            continue;
                        }
                        uploaded_files.push(path.clone());

                        // 更新状态
                        let hash = Self::compute_hash(&content);
                        state.files.insert(
                            path.clone(),
                            FileSyncState {
                                path: path.clone(),
                                local_hash: hash.clone(),
                                remote_hash: hash, // 上传后本地和远端一致
                                synced_at: chrono::Local::now().to_rfc3339(),
                            },
                        );
                    }
                    Err(e) => {
                        log::error!("读取本地文件 {} 失败: {}", path, e);
                    }
                }
            }
        }

        // 2. 下载远端修改/新增的文件
        for path in &changes.to_download {
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);
            match client.download_file(&remote_path).await {
                Ok(content) => {
                    // 确定本地路径
                    let local_path = if path == "settings.json" {
                        config_dir.join(path)
                    } else {
                        data_dir.join(path)
                    };

                    // 确保父目录存在
                    if let Some(parent) = local_path.parent() {
                        fs::create_dir_all(parent)?;
                    }

                    // 如果是 settings.json，需要合并而不是覆盖
                    let final_content = if path == "settings.json" {
                        self.merge_settings(&content, &current_webdav_config)?
                    } else {
                        content
                    };

                    fs::write(&local_path, &final_content)?;
                    downloaded_files.push(path.clone());

                    // 更新状态
                    let hash = Self::compute_hash(&final_content);
                    let remote_hash = remote_files
                        .get(path)
                        .map(|r| r.hash.clone())
                        .unwrap_or_else(|| hash.clone());

                    state.files.insert(
                        path.clone(),
                        FileSyncState {
                            path: path.clone(),
                            local_hash: hash,
                            remote_hash,
                            synced_at: chrono::Local::now().to_rfc3339(),
                        },
                    );
                }
                Err(e) => {
                    log::error!("下载文件 {} 失败: {}", path, e);
                }
            }
        }

        // 3. 删除本地文件（远端已删除的）
        for path in &changes.to_delete_local {
            let local_path = if path == "settings.json" {
                config_dir.join(path)
            } else {
                data_dir.join(path)
            };

            // settings.json 不删除，只移除状态
            if path != "settings.json" {
                if local_path.exists() {
                    if let Err(e) = fs::remove_file(&local_path) {
                        log::error!("删除本地文件 {} 失败: {}", path, e);
                        continue;
                    }
                }
            }

            deleted_local_files.push(path.clone());
            state.files.remove(path);
        }

        // 4. 删除远端文件（本地已删除的）
        for path in &changes.to_delete_remote {
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);
            if let Err(e) = client.delete_file(&remote_path).await {
                log::error!("删除远端文件 {} 失败: {}", path, e);
                continue;
            }
            deleted_remote_files.push(path.clone());
            state.files.remove(path);
        }

        // 5. 更新同步状态
        state.last_sync_time = Some(chrono::Local::now().to_rfc3339());
        Self::save_sync_state(&state)?;

        // 6. 上传同步状态文件到远端
        let state_content = serde_json::to_string_pretty(&state)?;
        let remote_state_path = format!("{}/{}", REMOTE_BASE_PATH, SYNC_STATE_FILE);
        client
            .upload_file(&remote_state_path, state_content.as_bytes())
            .await?;

        let total_changes = uploaded_files.len()
            + downloaded_files.len()
            + deleted_local_files.len()
            + deleted_remote_files.len();

        let message = if total_changes == 0 {
            "已是最新，无需同步".to_string()
        } else {
            format!(
                "同步完成：上传 {} 个，下载 {} 个，删除本地 {} 个，删除远端 {} 个",
                uploaded_files.len(),
                downloaded_files.len(),
                deleted_local_files.len(),
                deleted_remote_files.len()
            )
        };

        Ok(SyncResult {
            success: true,
            message,
            uploaded_files,
            downloaded_files,
            deleted_local_files,
            deleted_remote_files,
            has_conflict: false,
            conflict_info: None,
        })
    }

    /// 合并 settings.json，保留本地的 WebDAV 配置
    fn merge_settings(
        &self,
        remote_content: &[u8],
        local_webdav: &WebDavConfig,
    ) -> Result<Vec<u8>> {
        // 解析远端的 settings
        let mut remote_settings: AppSettings = serde_json::from_slice(remote_content)
            .map_err(|e| anyhow!("解析远端 settings.json 失败: {}", e))?;

        // 保留本地的 WebDAV 配置
        remote_settings.webdav = local_webdav.clone();

        // 序列化回去
        let merged = serde_json::to_string_pretty(&remote_settings)?;
        Ok(merged.into_bytes())
    }

    // ========================================================================
    // 冲突解决方法
    // ========================================================================

    /// 解决单个文件的冲突
    ///
    /// choice: "local" 保留本地版本并上传，"remote" 使用远端版本
    pub async fn resolve_file_conflict(&self, path: &str, choice: &str) -> Result<()> {
        let client = self.create_client()?;
        let mut state = Self::load_sync_state()?;

        let config_dir = get_app_config_dir()?;
        let data_dir = get_app_data_dir()?;

        let local_path = if path == "settings.json" {
            config_dir.join(path)
        } else {
            data_dir.join(path)
        };
        let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);

        match choice {
            "local" => {
                // 保留本地，上传覆盖远端
                if local_path.exists() {
                    let content = fs::read(&local_path)?;
                    client.upload_file(&remote_path, &content).await?;

                    let hash = Self::compute_hash(&content);
                    state.files.insert(
                        path.to_string(),
                        FileSyncState {
                            path: path.to_string(),
                            local_hash: hash.clone(),
                            remote_hash: hash,
                            synced_at: chrono::Local::now().to_rfc3339(),
                        },
                    );
                } else {
                    // 本地已删除，删除远端
                    let _ = client.delete_file(&remote_path).await;
                    state.files.remove(path);
                }
            }
            "remote" => {
                // 使用远端，下载覆盖本地
                match client.download_file(&remote_path).await {
                    Ok(content) => {
                        // 如果是 settings.json，合并 WebDAV 配置
                        let final_content = if path == "settings.json" {
                            self.merge_settings(&content, &self.config)?
                        } else {
                            content
                        };

                        if let Some(parent) = local_path.parent() {
                            fs::create_dir_all(parent)?;
                        }
                        fs::write(&local_path, &final_content)?;

                        let hash = Self::compute_hash(&final_content);
                        state.files.insert(
                            path.to_string(),
                            FileSyncState {
                                path: path.to_string(),
                                local_hash: hash.clone(),
                                remote_hash: hash,
                                synced_at: chrono::Local::now().to_rfc3339(),
                            },
                        );
                    }
                    Err(_) => {
                        // 远端已删除，删除本地
                        if path != "settings.json" && local_path.exists() {
                            fs::remove_file(&local_path)?;
                        }
                        state.files.remove(path);
                    }
                }
            }
            _ => {
                return Err(anyhow!("无效的选择: {}", choice));
            }
        }

        Self::save_sync_state(&state)?;
        Ok(())
    }

    /// 批量解决冲突
    ///
    /// 对所有冲突文件应用相同的选择
    pub async fn resolve_all_conflicts(&self, choice: &str) -> Result<SyncResult> {
        // 重新扫描并获取冲突列表
        let base_state = Self::load_sync_state()?;
        let local_files = self.scan_local_files()?;
        let remote_files = self.scan_remote_files().await?;
        let change_set = self.compute_changes(&base_state, &local_files, &remote_files);

        for conflict in &change_set.conflicts {
            self.resolve_file_conflict(&conflict.path, choice).await?;
        }

        // 解决冲突后重新执行同步
        self.sync().await
    }

    // ========================================================================
    // 强制全量同步方法（保留向后兼容）
    // ========================================================================

    /// 强制上传所有配置到远端（覆盖远端）
    pub async fn upload_all(&self) -> Result<SyncResult> {
        log::info!("开始强制上传所有配置...");
        let client = self.create_client()?;
        let mut uploaded_files = Vec::new();
        let mut state = SyncState::default();

        // 1. 递归删除远端目录内容
        log::info!("清理远端目录: {}", REMOTE_BASE_PATH);
        let _ = client.delete_dir_contents(REMOTE_BASE_PATH).await;

        // 2. 确保目录存在
        log::info!("确保远端目录存在: {}", REMOTE_BASE_PATH);
        client.ensure_dir(REMOTE_BASE_PATH).await?;

        // 3. 上传本地所有文件
        let local_files = self.scan_local_files()?;
        log::info!("扫描到本地文件: {} 个", local_files.len());
        for (path, info) in &local_files {
            log::debug!("  - {} ({:?})", path, info.full_path);
        }

        for (path, local_info) in &local_files {
            let content = fs::read(&local_info.full_path)?;
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);

            log::info!("上传文件: {} -> {}", path, remote_path);
            match client.upload_file(&remote_path, &content).await {
                Ok(_) => {
                    uploaded_files.push(path.clone());
                    log::info!("上传成功: {}", path);
                }
                Err(e) => {
                    log::error!("上传失败: {} - {}", path, e);
                    return Err(e);
                }
            }

            let hash = Self::compute_hash(&content);
            state.files.insert(
                path.clone(),
                FileSyncState {
                    path: path.clone(),
                    local_hash: hash.clone(),
                    remote_hash: hash,
                    synced_at: chrono::Local::now().to_rfc3339(),
                },
            );
        }

        // 更新同步状态
        state.last_sync_time = Some(chrono::Local::now().to_rfc3339());
        Self::save_sync_state(&state)?;

        // 上传同步状态文件
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
            deleted_local_files: vec![],
            deleted_remote_files: vec![],
            has_conflict: false,
            conflict_info: None,
        })
    }

    /// 强制从远端下载所有配置（覆盖本地）
    pub async fn download_all(&self, force: bool) -> Result<SyncResult> {
        // 如果不是强制下载，先检查冲突
        if !force {
            let base_state = Self::load_sync_state()?;
            let local_files = self.scan_local_files()?;
            let remote_files = self.scan_remote_files().await?;
            let change_set = self.compute_changes(&base_state, &local_files, &remote_files);

            if !change_set.conflicts.is_empty() {
                let conflict_files: Vec<String> = change_set
                    .conflicts
                    .iter()
                    .map(|c| c.path.clone())
                    .collect();
                return Ok(SyncResult {
                    success: false,
                    message: "检测到冲突，请选择保留本地或使用远端配置".to_string(),
                    uploaded_files: vec![],
                    downloaded_files: vec![],
                    deleted_local_files: vec![],
                    deleted_remote_files: vec![],
                    has_conflict: true,
                    conflict_info: Some(ConflictInfo {
                        local_modified: chrono::Local::now().to_rfc3339(),
                        remote_modified: chrono::Local::now().to_rfc3339(),
                        conflicting_files: conflict_files,
                        conflict_items: change_set.conflicts,
                    }),
                });
            }
        }

        let client = self.create_client()?;
        let mut downloaded_files = Vec::new();
        let mut state = SyncState::default();

        let config_dir = get_app_config_dir()?;
        let data_dir = get_app_data_dir()?;

        // 保存当前的 WebDAV 配置
        let current_webdav_config = self.config.clone();

        // 扫描远端文件
        let remote_files = self.scan_remote_files().await?;

        if remote_files.is_empty() {
            return Err(anyhow!("远端没有可下载的文件"));
        }

        // 清理本地数据（完全替换模式）
        log::info!("正在清理本地数据以进行覆盖恢复...");
        let _ = fs::remove_dir_all(data_dir.join("profiles"));
        let _ = fs::remove_dir_all(data_dir.join("ruleset"));
        let _ = fs::remove_file(data_dir.join("sub-store").join("sub-store.json"));
        // 不删除 settings.json，因为要合并

        // 下载所有远端文件
        for (path, remote_info) in &remote_files {
            let remote_path = format!("{}/{}", REMOTE_BASE_PATH, path);
            match client.download_file(&remote_path).await {
                Ok(content) => {
                    let local_path = if path == "settings.json" {
                        config_dir.join(path)
                    } else {
                        data_dir.join(path)
                    };

                    if let Some(parent) = local_path.parent() {
                        fs::create_dir_all(parent)?;
                    }

                    // 如果是 settings.json，合并 WebDAV 配置
                    let final_content = if path == "settings.json" {
                        self.merge_settings(&content, &current_webdav_config)?
                    } else {
                        content
                    };

                    fs::write(&local_path, &final_content)?;
                    downloaded_files.push(path.clone());

                    let hash = Self::compute_hash(&final_content);
                    state.files.insert(
                        path.clone(),
                        FileSyncState {
                            path: path.clone(),
                            local_hash: hash,
                            remote_hash: remote_info.hash.clone(),
                            synced_at: chrono::Local::now().to_rfc3339(),
                        },
                    );
                }
                Err(e) => {
                    log::warn!("下载文件 {} 失败: {}", path, e);
                }
            }
        }

        // 更新同步状态
        state.last_sync_time = Some(chrono::Local::now().to_rfc3339());
        Self::save_sync_state(&state)?;

        Ok(SyncResult {
            success: true,
            message: format!("成功下载 {} 个文件", downloaded_files.len()),
            uploaded_files: vec![],
            downloaded_files,
            deleted_local_files: vec![],
            deleted_remote_files: vec![],
            has_conflict: false,
            conflict_info: None,
        })
    }

    /// 检查是否有冲突（向后兼容）
    pub async fn check_conflict(&self) -> Result<Option<ConflictInfo>> {
        let base_state = Self::load_sync_state()?;
        let local_files = self.scan_local_files()?;
        let remote_files = self.scan_remote_files().await?;
        let change_set = self.compute_changes(&base_state, &local_files, &remote_files);

        if change_set.conflicts.is_empty() {
            Ok(None)
        } else {
            let conflict_files: Vec<String> = change_set
                .conflicts
                .iter()
                .map(|c| c.path.clone())
                .collect();
            Ok(Some(ConflictInfo {
                local_modified: chrono::Local::now().to_rfc3339(),
                remote_modified: chrono::Local::now().to_rfc3339(),
                conflicting_files: conflict_files,
                conflict_items: change_set.conflicts,
            }))
        }
    }
}
