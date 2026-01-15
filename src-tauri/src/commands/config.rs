use crate::commands::get_app_state_or_err;
use crate::models::{AppSettings, MihomoConfig};
#[cfg(unix)]
use std::os::unix::{ffi::OsStrExt, fs::MetadataExt};

#[derive(serde::Deserialize)]
struct GithubRelease {
    tag_name: String,
    published_at: String,
    assets: Vec<GithubAsset>,
}

#[derive(serde::Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// 最佳努力修复 root-owned 资源文件：
/// - 仅在 Unix 且当前进程具备权限（euid==0）时尝试
/// - 将目标文件 chown 为其父目录的属主（通常是数据目录的用户）
#[cfg(unix)]
fn try_fix_root_owned_file(target_path: &std::path::Path) -> bool {
    if unsafe { libc::geteuid() } != 0 {
        return false;
    }

    let Some(parent) = target_path.parent() else {
        return false;
    };

    let Ok(parent_meta) = std::fs::metadata(parent) else {
        return false;
    };

    let uid = parent_meta.uid();
    let gid = parent_meta.gid();

    let Ok(c_path) = std::ffi::CString::new(target_path.as_os_str().as_bytes()) else {
        return false;
    };

    let rc = unsafe { libc::chown(c_path.as_ptr(), uid, gid) };
    rc == 0
}

/// 获取 MiHomo 配置
#[tauri::command]
pub async fn get_config() -> Result<MihomoConfig, String> {
    let state = get_app_state_or_err()?;

    state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct ProxyServerInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub server: String,
    pub port: u16,
    pub udp: bool,
}

/// 获取配置文件中的代理服务器列表
#[tauri::command]
pub async fn get_config_proxies() -> Result<Vec<ProxyServerInfo>, String> {
    let state = get_app_state_or_err()?;
    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    let mut proxies: Vec<ProxyServerInfo> = config
        .proxies
        .into_iter()
        .map(|proxy| ProxyServerInfo {
            name: proxy.name,
            proxy_type: proxy.proxy_type,
            server: proxy.server,
            port: proxy.port,
            udp: proxy.udp,
        })
        .collect();

    proxies.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(proxies)
}

/// 保存 MiHomo 配置
#[tauri::command]
pub async fn save_config(config: MihomoConfig) -> Result<(), String> {
    use crate::commands::reload::{reload_config, ConfigBackup, ReloadOptions};

    let state = get_app_state_or_err()?;

    // 验证配置
    state
        .config_manager
        .validate_mihomo_config(&config)
        .map_err(|e| e.to_string())?;

    // 自动处理 dns-hijack 逻辑
    // 如果 DNS 已关闭，则清空 dns-hijack 以避免日志刷屏和潜在冲突
    let mut config_to_save = config.clone();
    if let Some(dns) = &config_to_save.dns {
        if !dns.enable {
            if let Some(tun) = &mut config_to_save.tun {
                // 如果 DNS 关闭，强制清空 dns-hijack
                if !tun.dns_hijack.is_empty() {
                    log::info!("DNS is disabled, clearing tun.dns-hijack automatically");
                    tun.dns_hijack.clear();
                }
            }
        } else {
            // 如果 DNS 开启且 TUN 开启，确保 dns-hijack 存在
            if let Some(tun) = &mut config_to_save.tun {
                if tun.enable && tun.dns_hijack.is_empty() {
                    log::info!("DNS is enabled and TUN is enabled, restoring default dns-hijack");
                    tun.dns_hijack = vec!["any:53".to_string(), "tcp://any:53".to_string()];
                }
            }
        }
    }

    // 创建配置备份
    let backup = ConfigBackup::create(state).map_err(|e| e.to_string())?;

    // 保存配置
    state
        .config_manager
        .save_mihomo_config(&config_to_save)
        .map_err(|e| e.to_string())?;

    // 如果 MiHomo 正在运行，重新加载配置
    if state.mihomo_manager.is_running().await {
        let options = ReloadOptions::safe();
        if let Err(e) = reload_config(None, &options).await {
            // 重载失败，回滚配置
            log::error!("Config reload failed, rolling back: {}", e);
            if let Err(rollback_err) = backup.rollback() {
                log::error!("Failed to rollback config: {}", rollback_err);
            } else {
                // 尝试用回滚后的配置重新加载
                let _ = reload_config(None, &ReloadOptions::quick()).await;
            }
            return Err(format!("配置保存成功但重载失败: {}", e));
        }
    }

    backup.cleanup();

    // 同步 DNS 和其他设置到 settings.json
    if let Ok(mut app_settings) = state.config_manager.load_app_settings() {
        // 同步 DNS 配置
        if let Some(dns) = &config_to_save.dns {
            app_settings.mihomo.dns = dns.clone();
        }
        // 同步 TUN 配置
        if let Some(tun) = &config_to_save.tun {
            app_settings.mihomo.tun = tun.clone();
        }
        // 同步其他设置
        app_settings.mihomo.port = config_to_save.port;
        app_settings.mihomo.socks_port = config_to_save.socks_port;
        app_settings.mihomo.mixed_port = config_to_save.mixed_port;
        app_settings.mihomo.allow_lan = config_to_save.allow_lan;
        app_settings.mihomo.ipv6 = config_to_save.ipv6;
        app_settings.mihomo.tcp_concurrent = config_to_save.tcp_concurrent;
        app_settings.mihomo.find_process_mode = config_to_save.find_process_mode.clone();

        if let Err(e) = state.config_manager.save_app_settings(&app_settings) {
            log::warn!("Failed to sync settings to settings.json: {}", e);
        }
    }

    log::info!("Config saved and reloaded");
    Ok(())
}

/// 获取应用设置
#[tauri::command]
pub async fn get_app_settings() -> Result<AppSettings, String> {
    let state = get_app_state_or_err()?;

    state
        .config_manager
        .load_app_settings()
        .map_err(|e| e.to_string())
}

/// 保存应用设置
#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    let state = get_app_state_or_err()?;

    state
        .config_manager
        .save_app_settings(&settings)
        .map_err(|e| e.to_string())?;

    log::info!("App settings saved");
    Ok(())
}

/// 下载资源文件响应
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResourceResult {
    /// 是否已下载（false 表示无需更新）
    pub downloaded: bool,
    /// 新的 ETag（如果有）
    pub etag: Option<String>,
    /// 新的 Last-Modified（如果有）
    pub remote_modified: Option<String>,
}

/// 下载资源文件（GeoIP、GeoSite 等）
/// 支持版本检查：如果传入 current_etag 或 current_modified，会先检查是否有更新
/// 下载完成后会自动让 mihomo 重新加载 GEO 数据库
#[tauri::command]
pub async fn download_resource(
    url: String,
    file_name: String,
    current_etag: Option<String>,
    current_modified: Option<String>,
    force: Option<bool>,
    update_source_type: Option<String>,
    github_repo: Option<String>,
    asset_name: Option<String>,
) -> Result<DownloadResourceResult, String> {
    log::info!("Downloading resource: {} -> {}", url, file_name);

    let target_dir = crate::utils::get_app_data_dir().map_err(|e| e.to_string())?;
    let target_path = target_dir.join(&file_name);

    // 检查是否启用 JsDelivr 加速
    let use_jsdelivr = get_app_state_or_err()
        .ok()
        .and_then(|state| state.config_manager.load_app_settings().ok())
        .map(|settings| settings.use_jsdelivr)
        .unwrap_or(false);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5分钟超时，因为文件可能较大
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // 如果启用 JsDelivr 且是 GitHub URL，进行转换
    let mut download_url = if use_jsdelivr && crate::utils::is_github_resource_url(&url) {
        let converted = crate::utils::convert_github_to_jsdelivr(&url);
        log::info!("JsDelivr accelerated URL: {} -> {}", url, converted);
        converted
    } else {
        url
    };
    let mut resolved_etag = None;
    let mut resolved_modified = None;

    // 如果是 GitHub Release 源，先解析真实下载地址
    if let (Some(source_type), Some(repo)) = (&update_source_type, &github_repo) {
        if source_type == "github-release" {
            log::info!("Resolving download URL from GitHub release: {}", repo);
            let api_url = format!("https://api.github.com/repos/{}/releases/latest", repo);
            let response = client
                .get(&api_url)
                .header("User-Agent", "Conflux/0.1.0")
                .send()
                .await
                .map_err(|e| format!("Failed to fetch GitHub release: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("GitHub API failed: {}", response.status()));
            }

            let release: GithubRelease = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse GitHub release: {}", e))?;

            // 查找资源
            // 优先使用 asset_name 匹配，如果没有指定，使用 file_name 模糊匹配
            let target_pattern = asset_name.as_deref().unwrap_or(&file_name);
            let asset = release
                .assets
                .iter()
                .find(|a| a.name.contains(target_pattern))
                .or_else(|| release.assets.first()); // 兜底

            if let Some(asset) = asset {
                download_url = asset.browser_download_url.clone();
                resolved_etag = Some(release.tag_name.clone());
                resolved_modified = Some(release.published_at.clone());
                log::info!(
                    "Resolved GitHub URL: {} (Version: {})",
                    download_url,
                    release.tag_name
                );

                // 检查版本
                let force_download = force.unwrap_or(false);
                if !force_download {
                    if let Some(ref current) = current_etag {
                        if current == &release.tag_name {
                            log::info!(
                                "Resource {} is up to date (Tag match: {})",
                                file_name,
                                release.tag_name
                            );
                            return Ok(DownloadResourceResult {
                                downloaded: false,
                                etag: resolved_etag,
                                remote_modified: resolved_modified,
                            });
                        }
                    }
                }
            } else {
                return Err(format!(
                    "No matching asset found in release {}",
                    release.tag_name
                ));
            }
        }
    }

    // 如果不是 GitHub 源 (或者 GitHub 源已经解析出 download_url)，执行标准下载逻辑
    // 如果是 GitHub 源，我们已经做过版本检查了，这里只需要针对普通 URL 做检查
    let is_github = update_source_type.as_deref() == Some("github-release");

    // 如果不是强制下载，且有版本信息，且不是 GitHub 源（因为上面已经检查过了），先检查是否需要更新
    let force_download = force.unwrap_or(false);
    if !is_github && !force_download && (current_etag.is_some() || current_modified.is_some()) {
        log::info!(
            "Checking for updates with etag={:?}, modified={:?}",
            current_etag,
            current_modified
        );

        // 发送 HEAD 请求检查版本
        let head_response = client
            .head(&download_url)
            .header("User-Agent", "Conflux/0.1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to check resource version: {}", e))?;

        if head_response.status().is_success() {
            let remote_etag = head_response
                .headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let remote_modified = head_response
                .headers()
                .get("last-modified")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            // 检查 ETag 是否匹配
            if let (Some(ref current), Some(ref remote)) = (&current_etag, &remote_etag) {
                if current == remote {
                    log::info!("Resource {} is up to date (ETag match)", file_name);
                    return Ok(DownloadResourceResult {
                        downloaded: false,
                        etag: remote_etag,
                        remote_modified,
                    });
                }
            }

            // 检查 Last-Modified 是否匹配
            if let (Some(ref current), Some(ref remote)) = (&current_modified, &remote_modified) {
                if current == remote {
                    log::info!("Resource {} is up to date (Last-Modified match)", file_name);
                    return Ok(DownloadResourceResult {
                        downloaded: false,
                        etag: remote_etag,
                        remote_modified: Some(remote.clone()),
                    });
                }
            }

            log::info!("Resource {} has updates, downloading...", file_name);
        }
    }

    // 下载文件
    let response = client
        .get(&download_url)
        .header("User-Agent", "Conflux/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to request URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    // 提取版本信息 (如果是 GitHub 源，优先使用之前解析的信息)
    let new_etag = if is_github {
        resolved_etag
    } else {
        response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };

    let new_modified = if is_github {
        resolved_modified
    } else {
        response
            .headers()
            .get("last-modified")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };

    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // 确保目标目录存在
    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create target dir {:?}: {}", parent, e))?;
    }

    // 采用“写入临时文件 -> 原子替换”的方式，避免写到一半留下损坏文件
    let tmp_path = target_path.with_extension("download.tmp");
    if tmp_path.exists() {
        let _ = std::fs::remove_file(&tmp_path);
    }

    if let Err(e) = std::fs::write(&tmp_path, &content) {
        // 给出更可操作的提示
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            return Err(format!(
                "没有权限写入资源文件：{:?}\n\
可能原因：该文件/目录曾被 root 创建，导致当前用户无法覆盖。\n\
建议修复（macOS/Linux）：\n\
  sudo chown -R $(whoami) \"{}\"\n\
然后重启应用再试。",
                tmp_path,
                crate::utils::get_app_data_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "<Conflux 数据目录>".to_string()),
            ));
        }
        return Err(format!("Failed to write temp file: {}", e));
    }

    // Unix: 固定资源文件权限为 644，避免被意外改成只读/可执行
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&tmp_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o644);
            let _ = std::fs::set_permissions(&tmp_path, perms);
        }
    }

    // 替换目标文件（尽量先删后改名，兼容部分平台的 rename 行为）
    if target_path.exists() {
        if let Err(e) = std::fs::remove_file(&target_path) {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                // 最佳努力：若进程具备权限，尝试修复 root-owned 文件归属后再删除
                #[cfg(unix)]
                {
                    if try_fix_root_owned_file(&target_path) {
                        if std::fs::remove_file(&target_path).is_ok() {
                            // retry succeeded
                        } else {
                            return Err(format!(
                                "没有权限覆盖已有文件：{:?}\n\
该文件可能属于 root（例如曾以管理员运行过 mihomo），请先修复文件归属后再下载。",
                                target_path
                            ));
                        }
                    } else {
                        return Err(format!(
                            "没有权限覆盖已有文件：{:?}\n\
该文件可能属于 root（例如曾以管理员运行过 mihomo），请先修复文件归属后再下载。",
                            target_path
                        ));
                    }
                }
                #[cfg(not(unix))]
                {
                    return Err(format!(
                        "没有权限覆盖已有文件：{:?}\n\
该文件可能属于 root（例如曾以管理员运行过 mihomo），请先修复文件归属后再下载。",
                        target_path
                    ));
                }
            }
            return Err(format!("Failed to remove old file: {}", e));
        }
    }

    std::fs::rename(&tmp_path, &target_path)
        .map_err(|e| format!("Failed to replace file {:?}: {}", target_path, e))?;

    log::info!(
        "Resource downloaded successfully: {:?} ({} bytes)",
        target_path,
        content.len()
    );

    // 如果 mihomo 正在运行，立即重载配置以使其重新读取本地 GEO 资源。
    //
    // 注意：这里刻意不调用 core 的 update_geo 接口，避免核心在某些实现下触发网络下载。
    // GEO 资源由 Conflux 统一下载到数据目录，并通过 reload_configs 触发重载即可。
    let state = get_app_state_or_err()?;
    if state.mihomo_manager.is_running().await {
        let config_path = state.config_manager.mihomo_config_path();
        match state
            .mihomo_api
            .reload_configs(config_path.to_str().unwrap_or(""), true)
            .await
        {
            Ok(_) => log::info!("Config reloaded after resource download"),
            Err(e) => log::warn!("Failed to reload config: {}", e),
        }
    }

    Ok(DownloadResourceResult {
        downloaded: true,
        etag: new_etag,
        remote_modified: new_modified,
    })
}

/// 重新加载 GEO 数据库
#[tauri::command]
pub async fn reload_geo_database() -> Result<(), String> {
    log::info!("Reloading GEO database...");

    let state = get_app_state_or_err()?;

    if !state.mihomo_manager.is_running().await {
        return Err("Mihomo is not running".to_string());
    }

    // 只重载配置，避免触发核心网络下载（GEO 资源由 Conflux 管理）
    let config_path = state.config_manager.mihomo_config_path();
    state
        .mihomo_api
        .reload_configs(config_path.to_str().unwrap_or(""), true)
        .await
        .map_err(|e| format!("Failed to reload config: {}", e))?;

    log::info!("Config reloaded (GEO resources refreshed)");
    Ok(())
}

/// 资源更新检查请求
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUpdateCheckRequest {
    pub url: String,
    pub current_etag: Option<String>,
    pub current_modified: Option<String>,
    pub update_source_type: Option<String>,
    pub github_repo: Option<String>,
}

/// 资源更新检查结果
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUpdateCheckResult {
    pub url: String,
    pub has_update: bool,
    pub etag: Option<String>,
    pub remote_modified: Option<String>,
    pub error: Option<String>,
}

/// 批量检查资源是否有更新（只检查，不下载）
#[tauri::command]
pub async fn check_resource_updates(
    resources: Vec<ResourceUpdateCheckRequest>,
) -> Result<Vec<ResourceUpdateCheckResult>, String> {
    log::info!("Checking updates for {} resources", resources.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut results = Vec::new();

    for resource in resources {
        let result = check_single_resource_update(&client, &resource).await;
        results.push(result);
    }

    Ok(results)
}

async fn check_github_release_update(
    client: &reqwest::Client,
    resource: &ResourceUpdateCheckRequest,
    repo: &str,
) -> ResourceUpdateCheckResult {
    let api_url = format!("https://api.github.com/repos/{}/releases/latest", repo);

    // Fetch release info
    let response = match client
        .get(&api_url)
        .header("User-Agent", "Conflux/0.1.0")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            return ResourceUpdateCheckResult {
                url: resource.url.clone(),
                has_update: false,
                etag: None,
                remote_modified: None,
                error: Some(format!("Request failed: {}", e)),
            }
        }
    };

    if !response.status().is_success() {
        return ResourceUpdateCheckResult {
            url: resource.url.clone(),
            has_update: false,
            etag: None,
            remote_modified: None,
            error: Some(format!("GitHub API error: {}", response.status())),
        };
    }

    let release: GithubRelease = match response.json().await {
        Ok(r) => r,
        Err(e) => {
            return ResourceUpdateCheckResult {
                url: resource.url.clone(),
                has_update: false,
                etag: None,
                remote_modified: None,
                error: Some(format!("Failed to parse release: {}", e)),
            }
        }
    };

    // Check version using tag_name (stored in etag)
    let remote_tag = release.tag_name;
    let remote_modified = release.published_at;

    let has_update = match &resource.current_etag {
        Some(current) => current != &remote_tag,
        None => true,
    };

    ResourceUpdateCheckResult {
        url: resource.url.clone(),
        has_update,
        etag: Some(remote_tag),
        remote_modified: Some(remote_modified),
        error: None,
    }
}

async fn check_single_resource_update(
    client: &reqwest::Client,
    resource: &ResourceUpdateCheckRequest,
) -> ResourceUpdateCheckResult {
    // Check for GitHub source
    if let (Some(source_type), Some(repo)) = (&resource.update_source_type, &resource.github_repo) {
        if source_type == "github-release" {
            return check_github_release_update(client, resource, repo).await;
        }
    }

    let url = &resource.url;

    // 发送 HEAD 请求获取远程文件信息
    let response = match client
        .head(url)
        .header("User-Agent", "Conflux/0.1.0")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            return ResourceUpdateCheckResult {
                url: url.clone(),
                has_update: false,
                etag: None,
                remote_modified: None,
                error: Some(format!("Request failed: {}", e)),
            };
        }
    };

    if !response.status().is_success() {
        return ResourceUpdateCheckResult {
            url: url.clone(),
            has_update: false,
            etag: None,
            remote_modified: None,
            error: Some(format!("HTTP error: {}", response.status())),
        };
    }

    let remote_etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let remote_modified = response
        .headers()
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // 判断是否有更新
    let has_update = if resource.current_etag.is_none() && resource.current_modified.is_none() {
        // 没有本地版本信息，认为需要更新
        true
    } else {
        // 检查 ETag
        let etag_changed = match (&resource.current_etag, &remote_etag) {
            (Some(current), Some(remote)) => current != remote,
            (Some(_), None) => true, // 远程没有 ETag 了
            (None, _) => false,      // 本地没有 ETag，不比较
        };

        // 检查 Last-Modified
        let modified_changed = match (&resource.current_modified, &remote_modified) {
            (Some(current), Some(remote)) => current != remote,
            (Some(_), None) => true, // 远程没有 Last-Modified 了
            (None, _) => false,      // 本地没有 Last-Modified，不比较
        };

        etag_changed || modified_changed
    };

    ResourceUpdateCheckResult {
        url: url.clone(),
        has_update,
        etag: remote_etag,
        remote_modified,
        error: None,
    }
}

/// 外部资源文件信息
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFileInfo {
    pub file_name: String,
    pub exists: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

/// 检查外部资源文件状态
#[tauri::command]
pub async fn check_resource_files(
    file_names: Vec<String>,
) -> Result<Vec<ResourceFileInfo>, String> {
    let data_dir = crate::utils::get_app_data_dir().map_err(|e| e.to_string())?;

    let mut results = Vec::new();

    for file_name in file_names {
        let file_path = data_dir.join(&file_name);
        let exists = file_path.exists();

        let (size, modified) = if exists {
            match std::fs::metadata(&file_path) {
                Ok(meta) => {
                    let size = Some(meta.len());
                    let modified = meta.modified().ok().map(|time| {
                        let datetime: chrono::DateTime<chrono::Local> = time.into();
                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                    });
                    (size, modified)
                }
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        results.push(ResourceFileInfo {
            file_name,
            exists,
            size,
            modified,
        });
    }

    Ok(results)
}

/// 获取规则列表
#[tauri::command]
pub async fn get_rules() -> Result<Vec<String>, String> {
    let state = get_app_state_or_err()?;

    let config = state
        .config_manager
        .load_mihomo_config()
        .map_err(|e| e.to_string())?;

    Ok(config.rules)
}

/// 保存规则列表
#[tauri::command]
pub async fn save_rules(rules: Vec<String>) -> Result<(), String> {
    use crate::commands::reload::{apply_config_change, ReloadOptions};

    apply_config_change(None, &ReloadOptions::safe(), |config| {
        config.rules = rules.clone();
        Ok(())
    })
    .await?;

    log::info!("Rules saved and reloaded");
    Ok(())
}
