use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};

use super::client::WebDavClient;
use crate::models::{AppSettings, WebDavConfig};
use crate::utils::{get_app_config_dir, get_app_data_dir};

/// 远端目录前缀
const REMOTE_BASE_PATH: &str = "/conflux";

/// 本地同步状态文件名（继续使用，以保持前端展示/调用不变）
const SYNC_STATE_FILE: &str = "sync_state.json";

/// 远端快照文件名
const SNAPSHOT_FILE: &str = "snapshot.zip";

/// 远端快照元信息文件名
const SNAPSHOT_META_FILE: &str = "snapshot.json";

/// 本地同步状态里用于存储“快照”的 key
const SNAPSHOT_STATE_KEY: &str = "__snapshot__";

// ============================================================================
// 数据结构定义（保持与前端 types/config.ts 一致）
// ============================================================================

/// 文件同步状态（用于前端展示；在新逻辑中用来记录快照 hash）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSyncState {
    /// 文件路径（相对路径）
    pub path: String,
    /// 上次同步时的本地内容 hash
    #[serde(alias = "hash")]
    pub local_hash: String,
    /// 上次同步时的远端内容 hash
    #[serde(default)]
    pub remote_hash: String,
    /// 上次同步时间
    #[serde(alias = "synced_at")]
    pub synced_at: String,
}

/// 全局同步状态（本地）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    /// 上次同步时间
    #[serde(alias = "last_sync_time")]
    pub last_sync_time: Option<String>,
    /// 同步状态（新逻辑中只会保存一条快照记录）
    pub files: HashMap<String, FileSyncState>,
}

/// 单个冲突项（新逻辑中用“快照冲突”占位）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictItem {
    pub path: String,
    pub conflict_type: String,
    pub local_status: String,
    pub remote_status: String,
}

/// 冲突信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    pub local_modified: String,
    pub remote_modified: String,
    pub conflicting_files: Vec<String>,
    #[serde(default)]
    pub conflict_items: Vec<ConflictItem>,
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

/// 本地文件信息（用于构建快照）
#[derive(Debug, Clone)]
struct LocalFileInfo {
    full_path: PathBuf,
    hash: String,
}

/// 远端快照元信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotMeta {
    version: u32,
    updated_at: String,
    snapshot_hash: String,
    file_count: usize,
}

// ============================================================================
// 同步管理器实现（单包快照协议）
// ============================================================================

pub struct SyncManager {
    config: WebDavConfig,
}

impl SyncManager {
    pub fn new(config: WebDavConfig) -> Self {
        Self { config }
    }

    fn create_client(&self) -> Result<WebDavClient> {
        WebDavClient::new(
            &self.config.url,
            &self.config.username,
            &self.config.password,
        )
    }

    fn get_sync_state_path() -> Result<PathBuf> {
        let config_dir = get_app_config_dir()?;
        Ok(config_dir.join(SYNC_STATE_FILE))
    }

    pub fn load_sync_state() -> Result<SyncState> {
        let state_path = Self::get_sync_state_path()?;
        if state_path.exists() {
            let content = fs::read_to_string(&state_path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            Ok(SyncState::default())
        }
    }

    fn save_sync_state(state: &SyncState) -> Result<()> {
        let state_path = Self::get_sync_state_path()?;
        let content = serde_json::to_string_pretty(state)?;
        fs::write(&state_path, content)?;
        Ok(())
    }

    fn compute_hash(content: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }

    /// 计算本地文件集合的“清单 hash”（与打包格式无关）
    fn compute_manifest_hash(local_files: &HashMap<String, LocalFileInfo>) -> String {
        let mut keys: Vec<&String> = local_files.keys().collect();
        keys.sort();

        let mut hasher = Sha256::new();
        for k in keys {
            if let Some(info) = local_files.get(k) {
                hasher.update(k.as_bytes());
                hasher.update(b"\n");
                hasher.update(info.hash.as_bytes());
                hasher.update(b"\n");
            }
        }
        format!("{:x}", hasher.finalize())
    }

    pub fn get_sync_status() -> Result<SyncState> {
        Self::load_sync_state()
    }

    pub fn clear_sync_state() -> Result<()> {
        let state_path = Self::get_sync_state_path()?;
        if state_path.exists() {
            std::fs::remove_file(&state_path)?;
            log::info!("已清除同步状态文件: {:?}", state_path);
        }
        Ok(())
    }

    /// 扫描本地文件并计算 hash（用于快照）
    fn scan_local_files(&self) -> Result<HashMap<String, LocalFileInfo>> {
        let mut files = HashMap::new();

        // 1) settings.json（config dir）
        let config_dir = get_app_config_dir()?;
        let settings_path = config_dir.join("settings.json");
        if settings_path.exists() {
            let content = fs::read(&settings_path)?;
            let hash = Self::compute_hash(&content);
            files.insert(
                "settings.json".to_string(),
                LocalFileInfo {
                    full_path: settings_path,
                    hash,
                },
            );
        }

        // 2) data dir: sub-store / ruleset / profiles
        let data_dir = get_app_data_dir()?;

        let substore_path = data_dir.join("sub-store").join("sub-store.json");
        if substore_path.exists() {
            let content = fs::read(&substore_path)?;
            let hash = Self::compute_hash(&content);
            files.insert(
                "sub-store/sub-store.json".to_string(),
                LocalFileInfo {
                    full_path: substore_path,
                    hash,
                },
            );
        }

        let ruleset_dir = data_dir.join("ruleset");
        if ruleset_dir.exists() {
            if let Ok(entries) = fs::read_dir(&ruleset_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with('.') {
                                continue;
                            }
                            let content = fs::read(&path)?;
                            let hash = Self::compute_hash(&content);
                            files.insert(
                                format!("ruleset/{}", name),
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

        let profiles_dir = data_dir.join("profiles");
        if profiles_dir.exists() {
            if let Ok(entries) = fs::read_dir(&profiles_dir) {
                for entry in entries.flatten() {
                    let profile_path = entry.path();
                    if !profile_path.is_dir() {
                        continue;
                    }
                    let Some(profile_id) = profile_path.file_name().and_then(|n| n.to_str()) else {
                        continue;
                    };

                    let metadata_path = profile_path.join("metadata.json");
                    if metadata_path.exists() {
                        let content = fs::read(&metadata_path)?;
                        let hash = Self::compute_hash(&content);
                        files.insert(
                            format!("profiles/{}/metadata.json", profile_id),
                            LocalFileInfo {
                                full_path: metadata_path,
                                hash,
                            },
                        );
                    }

                    let profile_yaml_path = profile_path.join("profile.yaml");
                    if profile_yaml_path.exists() {
                        let content = fs::read(&profile_yaml_path)?;
                        let hash = Self::compute_hash(&content);
                        files.insert(
                            format!("profiles/{}/profile.yaml", profile_id),
                            LocalFileInfo {
                                full_path: profile_yaml_path,
                                hash,
                            },
                        );
                    }
                }
            }
        }

        Ok(files)
    }

    fn build_snapshot_zip(&self, local_files: &HashMap<String, LocalFileInfo>) -> Result<Vec<u8>> {
        use zip::write::FileOptions;
        use zip::CompressionMethod;
        use zip::ZipWriter;

        let mut buf = Vec::new();
        {
            let cursor = Cursor::new(&mut buf);
            let mut zip = ZipWriter::new(cursor);
            let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

            let mut keys: Vec<&String> = local_files.keys().collect();
            keys.sort();

            for rel in keys {
                let Some(info) = local_files.get(rel) else {
                    continue;
                };
                let content = fs::read(&info.full_path)?;
                zip.start_file(rel, options)?;
                zip.write_all(&content)?;
            }

            zip.finish()?;
        }
        Ok(buf)
    }

    fn is_safe_zip_entry_path(p: &Path) -> bool {
        !p.is_absolute()
            && !p.components().any(|c| {
                matches!(
                    c,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
    }

    /// 解包快照并覆盖恢复本地（全量替换 data_dir 下的相关目录/文件；settings.json 合并）
    fn apply_snapshot_zip(&self, zip_bytes: &[u8], local_webdav: &WebDavConfig) -> Result<()> {
        use zip::ZipArchive;

        let config_dir = get_app_config_dir()?;
        let data_dir = get_app_data_dir()?;

        // 清理本地数据（完全替换模式）
        let _ = fs::remove_dir_all(data_dir.join("profiles"));
        let _ = fs::remove_dir_all(data_dir.join("ruleset"));
        let _ = fs::remove_file(data_dir.join("sub-store").join("sub-store.json"));

        // 解包到临时目录，避免半恢复
        let tmp_dir = data_dir.join(format!("webdav_restore_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&tmp_dir)?;

        let cursor = Cursor::new(zip_bytes);
        let mut archive = ZipArchive::new(cursor)?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let name = file.name().to_string();
            let rel_path = Path::new(&name);

            if !Self::is_safe_zip_entry_path(rel_path) {
                return Err(anyhow!("非法快照路径: {}", name));
            }

            if file.is_dir() {
                continue;
            }

            let out_path = tmp_dir.join(rel_path);
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }

            let mut out = fs::File::create(&out_path)?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            out.write_all(&buf)?;
        }

        // 1) settings.json：合并 WebDAV 配置后写入 config_dir
        let extracted_settings = tmp_dir.join("settings.json");
        if extracted_settings.exists() {
            let content = fs::read(&extracted_settings)?;
            let merged = self.merge_settings(&content, local_webdav)?;
            fs::write(config_dir.join("settings.json"), &merged)?;
        }

        // 2) 其他内容：只允许写入 data_dir 下的固定前缀
        for prefix in ["profiles", "ruleset", "sub-store"] {
            let src = tmp_dir.join(prefix);
            if !src.exists() {
                continue;
            }
            self.copy_dir_recursive(&src, &data_dir.join(prefix))?;
        }

        // 清理临时目录
        let _ = fs::remove_dir_all(&tmp_dir);
        Ok(())
    }

    fn copy_dir_recursive(&self, src: &Path, dst: &Path) -> Result<()> {
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(src, dst)?;
            return Ok(());
        }
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name();
            let dst_path = dst.join(name);
            if path.is_dir() {
                self.copy_dir_recursive(&path, &dst_path)?;
            } else {
                if let Some(parent) = dst_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&path, &dst_path)?;
            }
        }
        Ok(())
    }

    async fn fetch_remote_meta(&self, client: &WebDavClient) -> Result<Option<SnapshotMeta>> {
        let remote_meta_path = format!("{}/{}", REMOTE_BASE_PATH, SNAPSHOT_META_FILE);
        match client.download_file(&remote_meta_path).await {
            Ok(bytes) => {
                let meta: SnapshotMeta = serde_json::from_slice(&bytes)?;
                Ok(Some(meta))
            }
            Err(e) => {
                // 远端不存在就视为“无快照”
                if e.to_string().contains("HTTP 404") || e.to_string().contains("文件不存在") {
                    return Ok(None);
                }
                Err(e)
            }
        }
    }

    async fn upload_snapshot(&self) -> Result<SyncResult> {
        let client = self.create_client()?;
        client.ensure_dir(REMOTE_BASE_PATH).await?;

        let local_files = self.scan_local_files()?;
        if local_files.is_empty() {
            return Ok(SyncResult {
                success: true,
                message: "本地没有可同步内容".to_string(),
                uploaded_files: vec![],
                downloaded_files: vec![],
                deleted_local_files: vec![],
                deleted_remote_files: vec![],
                has_conflict: false,
                conflict_info: None,
            });
        }

        let snapshot_hash = Self::compute_manifest_hash(&local_files);
        let zip_bytes = self.build_snapshot_zip(&local_files)?;

        let remote_snapshot_path = format!("{}/{}", REMOTE_BASE_PATH, SNAPSHOT_FILE);
        client
            .upload_file(&remote_snapshot_path, zip_bytes.as_slice())
            .await?;

        let meta = SnapshotMeta {
            version: 1,
            updated_at: chrono::Local::now().to_rfc3339(),
            snapshot_hash: snapshot_hash.clone(),
            file_count: local_files.len(),
        };
        let meta_bytes = serde_json::to_vec_pretty(&meta)?;
        let remote_meta_path = format!("{}/{}", REMOTE_BASE_PATH, SNAPSHOT_META_FILE);
        client
            .upload_file(&remote_meta_path, meta_bytes.as_slice())
            .await?;

        // 更新本地同步状态（只记录快照）
        let mut state = Self::load_sync_state()?;
        let now = chrono::Local::now().to_rfc3339();
        state.last_sync_time = Some(now.clone());
        state.files.insert(
            SNAPSHOT_STATE_KEY.to_string(),
            FileSyncState {
                path: SNAPSHOT_FILE.to_string(),
                local_hash: snapshot_hash.clone(),
                remote_hash: snapshot_hash.clone(),
                synced_at: now,
            },
        );
        Self::save_sync_state(&state)?;

        Ok(SyncResult {
            success: true,
            message: format!("上传成功：快照包含 {} 个文件", local_files.len()),
            uploaded_files: vec![SNAPSHOT_FILE.to_string(), SNAPSHOT_META_FILE.to_string()],
            downloaded_files: vec![],
            deleted_local_files: vec![],
            deleted_remote_files: vec![],
            has_conflict: false,
            conflict_info: None,
        })
    }

    async fn download_snapshot(&self, force: bool) -> Result<SyncResult> {
        let client = self.create_client()?;
        client.ensure_dir(REMOTE_BASE_PATH).await?;

        let remote_meta = self
            .fetch_remote_meta(&client)
            .await?
            .ok_or_else(|| anyhow!("远端没有快照可下载"))?;

        // 非强制下载：如果本地与远端都相对上次同步发生变化，则冲突
        if !force {
            let base_state = Self::load_sync_state()?;
            let base_hash = base_state
                .files
                .get(SNAPSHOT_STATE_KEY)
                .map(|s| s.local_hash.clone());

            let local_files = self.scan_local_files()?;
            let local_current_hash = Self::compute_manifest_hash(&local_files);
            let local_changed = base_hash.as_deref() != Some(local_current_hash.as_str());
            let remote_changed = base_hash.as_deref() != Some(remote_meta.snapshot_hash.as_str());

            if local_changed && remote_changed && local_current_hash != remote_meta.snapshot_hash {
                return Ok(Self::make_conflict_result(
                    "检测到快照冲突，请选择保留本地或使用远端配置",
                ));
            }
        }

        let remote_snapshot_path = format!("{}/{}", REMOTE_BASE_PATH, SNAPSHOT_FILE);
        let zip_bytes = client.download_file(&remote_snapshot_path).await?;

        // 保留当前本地 WebDAV 配置（写回 settings 时合并）
        let current_webdav_config = self.config.clone();
        self.apply_snapshot_zip(&zip_bytes, &current_webdav_config)?;

        // 更新本地同步状态
        let mut state = Self::load_sync_state()?;
        let now = chrono::Local::now().to_rfc3339();
        state.last_sync_time = Some(now.clone());
        state.files.insert(
            SNAPSHOT_STATE_KEY.to_string(),
            FileSyncState {
                path: SNAPSHOT_FILE.to_string(),
                local_hash: remote_meta.snapshot_hash.clone(),
                remote_hash: remote_meta.snapshot_hash.clone(),
                synced_at: now,
            },
        );
        Self::save_sync_state(&state)?;

        Ok(SyncResult {
            success: true,
            message: "下载成功：配置已恢复，请前往「配置管理」激活配置以应用更改".to_string(),
            uploaded_files: vec![],
            downloaded_files: vec![SNAPSHOT_FILE.to_string(), SNAPSHOT_META_FILE.to_string()],
            deleted_local_files: vec![],
            deleted_remote_files: vec![],
            has_conflict: false,
            conflict_info: None,
        })
    }

    fn make_conflict_result(message: &str) -> SyncResult {
        let now = chrono::Local::now().to_rfc3339();
        let item = ConflictItem {
            path: "snapshot".to_string(),
            conflict_type: "快照冲突".to_string(),
            local_status: "已修改".to_string(),
            remote_status: "已修改".to_string(),
        };
        SyncResult {
            success: false,
            message: message.to_string(),
            uploaded_files: vec![],
            downloaded_files: vec![],
            deleted_local_files: vec![],
            deleted_remote_files: vec![],
            has_conflict: true,
            conflict_info: Some(ConflictInfo {
                local_modified: now.clone(),
                remote_modified: now,
                conflicting_files: vec!["snapshot".to_string()],
                conflict_items: vec![item],
            }),
        }
    }

    /// 增量同步（新语义：基于快照 hash/时间戳 的方向选择）
    pub async fn sync(&self) -> Result<SyncResult> {
        let client = self.create_client()?;
        client.ensure_dir(REMOTE_BASE_PATH).await?;

        let base_state = Self::load_sync_state()?;
        let base_hash = base_state
            .files
            .get(SNAPSHOT_STATE_KEY)
            .map(|s| s.local_hash.clone());

        let local_files = self.scan_local_files()?;
        let local_current_hash = Self::compute_manifest_hash(&local_files);
        let local_changed = base_hash.as_deref() != Some(local_current_hash.as_str());

        let remote_meta = self.fetch_remote_meta(&client).await?;
        let Some(remote_meta) = remote_meta else {
            // 远端无快照：如果本地有内容，上传；否则无需同步
            if local_files.is_empty() {
                return Ok(SyncResult {
                    success: true,
                    message: "已是最新，无需同步".to_string(),
                    uploaded_files: vec![],
                    downloaded_files: vec![],
                    deleted_local_files: vec![],
                    deleted_remote_files: vec![],
                    has_conflict: false,
                    conflict_info: None,
                });
            }
            return self.upload_snapshot().await;
        };

        let remote_hash = remote_meta.snapshot_hash.clone();
        let remote_changed = base_hash.as_deref() != Some(remote_hash.as_str());

        if !local_changed && !remote_changed {
            return Ok(SyncResult {
                success: true,
                message: "已是最新，无需同步".to_string(),
                uploaded_files: vec![],
                downloaded_files: vec![],
                deleted_local_files: vec![],
                deleted_remote_files: vec![],
                has_conflict: false,
                conflict_info: None,
            });
        }

        if local_changed && !remote_changed {
            return self.upload_snapshot().await;
        }

        if !local_changed && remote_changed {
            return self.download_snapshot(true).await;
        }

        // 两边都变了：相同则只更新状态；不同则冲突
        if local_current_hash == remote_hash {
            let mut state = Self::load_sync_state()?;
            let now = chrono::Local::now().to_rfc3339();
            state.last_sync_time = Some(now.clone());
            state.files.insert(
                SNAPSHOT_STATE_KEY.to_string(),
                FileSyncState {
                    path: SNAPSHOT_FILE.to_string(),
                    local_hash: remote_hash.clone(),
                    remote_hash: remote_hash.clone(),
                    synced_at: now,
                },
            );
            Self::save_sync_state(&state)?;
            return Ok(SyncResult {
                success: true,
                message: "已同步：本地与远端快照一致".to_string(),
                uploaded_files: vec![],
                downloaded_files: vec![],
                deleted_local_files: vec![],
                deleted_remote_files: vec![],
                has_conflict: false,
                conflict_info: None,
            });
        }

        Ok(Self::make_conflict_result("检测到快照冲突，请选择处理方式"))
    }

    /// 强制上传（全量覆盖远端快照）
    pub async fn upload_all(&self) -> Result<SyncResult> {
        self.upload_snapshot().await
    }

    /// 强制下载（全量覆盖本地）；force=false 时会做冲突检查
    pub async fn download_all(&self, force: bool) -> Result<SyncResult> {
        self.download_snapshot(force).await
    }

    pub async fn check_conflict(&self) -> Result<Option<ConflictInfo>> {
        let base_state = Self::load_sync_state()?;
        let base_hash = base_state
            .files
            .get(SNAPSHOT_STATE_KEY)
            .map(|s| s.local_hash.clone());

        let local_files = self.scan_local_files()?;
        let local_current_hash = Self::compute_manifest_hash(&local_files);
        let local_changed = base_hash.as_deref() != Some(local_current_hash.as_str());

        let client = self.create_client()?;
        let remote_meta = self.fetch_remote_meta(&client).await?;
        let Some(remote_meta) = remote_meta else {
            return Ok(None);
        };
        let remote_changed = base_hash.as_deref() != Some(remote_meta.snapshot_hash.as_str());

        if local_changed && remote_changed && local_current_hash != remote_meta.snapshot_hash {
            return Ok(Self::make_conflict_result("检测到快照冲突").conflict_info);
        }
        Ok(None)
    }

    /// 解决单个“冲突项”（新逻辑：忽略 path，只按 choice 决定上传或下载）
    pub async fn resolve_file_conflict(&self, _path: &str, choice: &str) -> Result<()> {
        match choice {
            "local" => {
                let _ = self.upload_snapshot().await?;
                Ok(())
            }
            "remote" => {
                let _ = self.download_snapshot(true).await?;
                Ok(())
            }
            _ => Err(anyhow!("无效的选择: {}", choice)),
        }
    }

    /// 批量解决冲突（新逻辑：直接按 choice 执行一次）
    pub async fn resolve_all_conflicts(&self, choice: &str) -> Result<SyncResult> {
        match choice {
            "local" => self.upload_snapshot().await,
            "remote" => self.download_snapshot(true).await,
            _ => Err(anyhow!("无效的选择: {}", choice)),
        }
    }

    fn merge_settings(
        &self,
        remote_content: &[u8],
        local_webdav: &WebDavConfig,
    ) -> Result<Vec<u8>> {
        let mut remote_settings: AppSettings = serde_json::from_slice(remote_content)
            .map_err(|e| anyhow!("解析远端 settings.json 失败: {}", e))?;
        remote_settings.webdav = local_webdav.clone();
        let merged = serde_json::to_string_pretty(&remote_settings)?;
        Ok(merged.into_bytes())
    }
}
