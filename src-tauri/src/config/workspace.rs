use anyhow::{anyhow, Result};
use std::path::PathBuf;

use crate::config::Composer;
use crate::models::{MihomoConfig, ProfileConfig, ProfileMetadata, ProfileType};
use crate::utils::get_app_data_dir;

/// 工作区管理器
/// 负责管理 Profile 目录结构、读写配置和激活 Profile
pub struct Workspace {
    /// profiles 目录路径
    profiles_dir: PathBuf,
    /// 共享规则集目录路径
    ruleset_dir: PathBuf,
}

impl Workspace {
    /// 创建新的工作区管理器
    pub fn new() -> Result<Self> {
        let data_dir = get_app_data_dir()?;
        let profiles_dir = data_dir.join("profiles");
        let ruleset_dir = data_dir.join("ruleset");

        std::fs::create_dir_all(&profiles_dir)?;
        std::fs::create_dir_all(&ruleset_dir)?;

        Ok(Self {
            profiles_dir,
            ruleset_dir,
        })
    }

    /// 获取指定 Profile 的目录路径
    fn profile_dir(&self, id: &str) -> PathBuf {
        self.profiles_dir.join(id)
    }

    /// 获取所有 Profile 列表
    pub fn list_profiles(&self) -> Result<Vec<ProfileMetadata>> {
        let mut profiles = Vec::new();

        if !self.profiles_dir.exists() {
            return Ok(profiles);
        }

        for entry in std::fs::read_dir(&self.profiles_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let metadata_path = entry.path().join("metadata.json");
                if metadata_path.exists() {
                    match std::fs::read_to_string(&metadata_path) {
                        Ok(content) => match serde_json::from_str::<ProfileMetadata>(&content) {
                            Ok(metadata) => profiles.push(metadata),
                            Err(e) => {
                                log::warn!(
                                    "Failed to parse metadata for {:?}: {}",
                                    entry.path(),
                                    e
                                );
                            }
                        },
                        Err(e) => {
                            log::warn!("Failed to read metadata for {:?}: {}", entry.path(), e);
                        }
                    }
                }
            }
        }

        // 按更新时间降序排序
        profiles.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(profiles)
    }

    /// 获取单个 Profile
    pub fn get_profile(&self, id: &str) -> Result<(ProfileMetadata, ProfileConfig)> {
        let profile_dir = self.profile_dir(id);
        let metadata_path = profile_dir.join("metadata.json");
        let config_path = profile_dir.join("profile.yaml");

        if !metadata_path.exists() {
            return Err(anyhow!("Profile not found: {}", id));
        }

        let metadata: ProfileMetadata =
            serde_json::from_str(&std::fs::read_to_string(&metadata_path)?)?;

        let config: ProfileConfig = if config_path.exists() {
            serde_yaml::from_str(&std::fs::read_to_string(&config_path)?)?
        } else {
            ProfileConfig::default()
        };

        Ok((metadata, config))
    }

    /// 获取 Profile 元数据
    pub fn get_metadata(&self, id: &str) -> Result<ProfileMetadata> {
        let metadata_path = self.profile_dir(id).join("metadata.json");
        if !metadata_path.exists() {
            return Err(anyhow!("Profile not found: {}", id));
        }
        let metadata: ProfileMetadata =
            serde_json::from_str(&std::fs::read_to_string(&metadata_path)?)?;
        Ok(metadata)
    }

    /// 创建新 Profile（从远程 URL）
    pub async fn create_from_remote(&self, name: &str, url: &str) -> Result<ProfileMetadata> {
        let id = uuid::Uuid::new_v4().to_string();
        let (mut config, default_rules_applied) = Composer::fetch_and_parse_with_flags(url).await?;

        // 修正 rule-provider 路径
        Composer::fix_provider_paths(&mut config, &self.ruleset_dir)?;

        // 过滤无效规则
        Composer::filter_invalid_rules(&mut config);

        let mut metadata =
            ProfileMetadata::new_remote(id.clone(), name.to_string(), url.to_string());
        metadata.update_stats(
            config.proxy_count(),
            config.group_count(),
            config.rule_count(),
        );
        metadata.default_rules_applied = Some(default_rules_applied);

        self.save_profile(&id, &metadata, &config)?;

        log::info!(
            "Created remote profile '{}' with {} proxies, {} groups, {} rules",
            name,
            config.proxy_count(),
            config.group_count(),
            config.rule_count()
        );

        Ok(metadata)
    }

    /// 创建新 Profile（从本地文件复制）
    pub fn create_from_local(&self, name: &str, file_path: &str) -> Result<ProfileMetadata> {
        let content = std::fs::read_to_string(file_path)
            .map_err(|e| anyhow!("Failed to read file '{}': {}", file_path, e))?;

        let mut config = Composer::parse_yaml(&content)?;

        // 修正 rule-provider 路径
        Composer::fix_provider_paths(&mut config, &self.ruleset_dir)?;

        // 过滤无效规则
        Composer::filter_invalid_rules(&mut config);

        let id = uuid::Uuid::new_v4().to_string();
        let mut metadata = ProfileMetadata::new_local(id.clone(), name.to_string());
        metadata.update_stats(
            config.proxy_count(),
            config.group_count(),
            config.rule_count(),
        );

        self.save_profile(&id, &metadata, &config)?;

        log::info!(
            "Created local profile '{}' from '{}' with {} proxies, {} groups, {} rules",
            name,
            file_path,
            config.proxy_count(),
            config.group_count(),
            config.rule_count()
        );

        Ok(metadata)
    }

    /// 创建空白 Profile
    pub fn create_blank(&self, name: &str) -> Result<ProfileMetadata> {
        let id = uuid::Uuid::new_v4().to_string();
        let config = ProfileConfig::with_default_group();
        let mut metadata = ProfileMetadata::new_blank(id.clone(), name.to_string());
        metadata.update_stats(
            config.proxy_count(),
            config.group_count(),
            config.rule_count(),
        );

        self.save_profile(&id, &metadata, &config)?;

        log::info!("Created blank profile '{}'", name);

        Ok(metadata)
    }

    /// 保存 Profile
    pub fn save_profile(
        &self,
        id: &str,
        metadata: &ProfileMetadata,
        config: &ProfileConfig,
    ) -> Result<()> {
        let profile_dir = self.profile_dir(id);
        std::fs::create_dir_all(&profile_dir)?;

        // 保存元数据
        let metadata_path = profile_dir.join("metadata.json");
        std::fs::write(&metadata_path, serde_json::to_string_pretty(metadata)?)?;

        // 保存配置
        let config_path = profile_dir.join("profile.yaml");
        std::fs::write(&config_path, serde_yaml::to_string(config)?)?;

        Ok(())
    }

    /// 更新 Profile 配置
    pub fn update_config(&self, id: &str, config: &ProfileConfig) -> Result<ProfileMetadata> {
        let profile_dir = self.profile_dir(id);
        let metadata_path = profile_dir.join("metadata.json");

        // 读取并更新元数据
        let mut metadata: ProfileMetadata =
            serde_json::from_str(&std::fs::read_to_string(&metadata_path)?)?;

        metadata.update_stats(
            config.proxy_count(),
            config.group_count(),
            config.rule_count(),
        );

        self.save_profile(id, &metadata, config)?;

        Ok(metadata)
    }

    /// 更新 Profile 元数据
    pub fn update_metadata(&self, id: &str, metadata: &ProfileMetadata) -> Result<()> {
        let metadata_path = self.profile_dir(id).join("metadata.json");
        std::fs::write(&metadata_path, serde_json::to_string_pretty(metadata)?)?;
        Ok(())
    }

    /// 删除 Profile
    pub fn delete_profile(&self, id: &str) -> Result<()> {
        let profile_dir = self.profile_dir(id);
        if profile_dir.exists() {
            std::fs::remove_dir_all(&profile_dir)?;
            log::info!("Deleted profile: {}", id);
        }
        Ok(())
    }

    /// 生成运行时配置（不改变 active 状态）
    pub fn generate_runtime_config(
        &self,
        id: &str,
        base_config: &MihomoConfig,
    ) -> Result<MihomoConfig> {
        let (_metadata, mut config) = self.get_profile(id)?;

        // 修正 rule-provider 路径
        Composer::fix_provider_paths(&mut config, &self.ruleset_dir)?;

        // 补全 vmess 缺失的 alterId，避免运行时配置校验失败
        for proxy in &mut config.proxies {
            if proxy.proxy_type == "vmess" && proxy.alter_id.is_none() {
                proxy.alter_id = Some(0);
            }
            if proxy.proxy_type == "vmess" && proxy.cipher.is_none() {
                proxy.cipher = Some("auto".to_string());
            }
        }

        // 合并配置
        let mut runtime_config = base_config.clone();
        runtime_config.proxies = config.proxies;
        runtime_config.proxy_groups = config.proxy_groups;
        runtime_config.proxy_providers = config.proxy_providers;
        runtime_config.rule_providers = config.rule_providers;
        runtime_config.rules = config.rules;

        Ok(runtime_config)
    }

    /// 激活 Profile（生成运行时配置）
    pub fn activate_profile(&self, id: &str, base_config: &MihomoConfig) -> Result<MihomoConfig> {
        let metadata = self.get_metadata(id)?;
        let runtime_config = self.generate_runtime_config(id, base_config)?;

        // 更新所有 Profile 的 active 状态
        self.set_active_profile(id)?;

        log::info!("Activated profile '{}' ({})", metadata.name, id);

        Ok(runtime_config)
    }

    /// 设置活跃 Profile
    fn set_active_profile(&self, active_id: &str) -> Result<()> {
        for entry in std::fs::read_dir(&self.profiles_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let metadata_path = entry.path().join("metadata.json");
                if metadata_path.exists() {
                    let content = std::fs::read_to_string(&metadata_path)?;
                    let mut metadata: ProfileMetadata = serde_json::from_str(&content)?;

                    let should_be_active = entry.file_name().to_string_lossy() == active_id;
                    if metadata.active != should_be_active {
                        metadata.active = should_be_active;
                        std::fs::write(&metadata_path, serde_json::to_string_pretty(&metadata)?)?;
                    }
                }
            }
        }
        Ok(())
    }

    /// 获取当前活跃的 Profile
    pub fn get_active_profile(&self) -> Result<Option<(ProfileMetadata, ProfileConfig)>> {
        let profiles = self.list_profiles()?;
        for profile in profiles {
            if profile.active {
                return Ok(Some(self.get_profile(&profile.id)?));
            }
        }
        Ok(None)
    }

    /// 获取当前活跃的 Profile ID
    pub fn get_active_profile_id(&self) -> Result<Option<String>> {
        let profiles = self.list_profiles()?;
        for profile in profiles {
            if profile.active {
                return Ok(Some(profile.id));
            }
        }
        Ok(None)
    }

    /// 刷新远程 Profile
    pub async fn refresh_remote(&self, id: &str) -> Result<ProfileMetadata> {
        // 1. 获取现有的 Profile 和配置
        // 我们需要保留现有的非 Proxy 配置（如规则、代理组等）
        let (metadata, old_config) = self.get_profile(id)?;

        if metadata.profile_type != ProfileType::Remote {
            return Err(anyhow!("Profile is not a remote subscription"));
        }

        let url = metadata
            .url
            .as_ref()
            .ok_or_else(|| anyhow!("Remote profile has no URL"))?;

        // 2. 获取新的远程配置
        // 注意：fetch_and_parse_with_flags 可能会应用模板，但这不影响我们获取代理列表
        // 因为 fetch_and_parse_with_flags 也会返回解析出的 proxies
        let (new_fetched_config, _default_rules_applied) =
            Composer::fetch_and_parse_with_flags(url).await?;

        // 3. 合并配置：保留本地配置，仅用远程的代理列表覆盖
        // 但我们需要保留那些被标记为 "local" 的代理节点
        let local_proxies: Vec<_> = old_config
            .proxies
            .iter()
            .filter(|p| {
                p.extra
                    .get("x-conflux-managed")
                    .and_then(|v| v.as_str())
                    .map(|s| s == "local")
                    .unwrap_or(false)
            })
            .cloned()
            .collect();

        let mut final_config = old_config.clone();
        final_config.proxies = new_fetched_config.proxies;

        // 追加保留的本地代理
        if !local_proxies.is_empty() {
            log::info!(
                "Preserving {} local proxies during refresh",
                local_proxies.len()
            );
            final_config.proxies.extend(local_proxies);
        }

        // 4. 更新元数据
        let mut new_metadata = metadata.clone();
        new_metadata.update_stats(
            final_config.proxy_count(), // 使用新的代理数量
            final_config.group_count(), // 保持旧的组数量
            final_config.rule_count(),  // 保持旧的规则数量
        );
        // 这里我们不更新 default_rules_applied，因为我们没有重新应用规则模板

        // 5. 保存结果
        self.save_profile(id, &new_metadata, &final_config)?;

        log::info!(
            "Refreshed remote profile '{}' (Server List Only). Proxies: {} (Updated), Groups: {} (Preserved), Rules: {} (Preserved)",
            new_metadata.name,
            final_config.proxy_count(),
            final_config.group_count(),
            final_config.rule_count()
        );

        Ok(new_metadata)
    }

    /// 重命名 Profile
    pub fn rename_profile(&self, id: &str, new_name: &str) -> Result<ProfileMetadata> {
        let mut metadata = self.get_metadata(id)?;
        metadata.name = new_name.to_string();
        metadata.updated_at = chrono::Local::now().to_rfc3339();
        self.update_metadata(id, &metadata)?;
        Ok(metadata)
    }

    /// 解析配置文件（预览，不保存）
    pub fn parse_config_file(&self, path: &str) -> Result<ProfileConfig> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| anyhow!("Failed to read file '{}': {}", path, e))?;
        Composer::parse_yaml(&content)
    }

    /// 预览远程配置（不保存）
    pub async fn preview_remote(&self, url: &str) -> Result<ProfileConfig> {
        Composer::fetch_and_parse(url).await
    }
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new().expect("Failed to create Workspace")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_creation() {
        let workspace = Workspace::new();
        assert!(workspace.is_ok());
    }
}
