use anyhow::Result;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

// ============================================================================
// 应用目录路径
// ============================================================================

/// 获取应用数据目录
/// - macOS: ~/Library/Application Support/Conflux
/// - Windows: C:\Users\<User>\AppData\Roaming\Conflux
/// - Linux: ~/.local/share/Conflux
pub fn get_app_data_dir() -> Result<PathBuf> {
    let path = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find data directory"))?
        .join("Conflux");

    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// 获取应用配置目录
/// - macOS: ~/Library/Application Support/Conflux
/// - Windows: C:\Users\<User>\AppData\Roaming\Conflux
/// - Linux: ~/.config/Conflux
pub fn get_app_config_dir() -> Result<PathBuf> {
    let path = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find config directory"))?
        .join("Conflux");

    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// 获取 MiHomo 配置文件路径
pub fn get_mihomo_config_path() -> Result<PathBuf> {
    let data_dir = get_app_data_dir()?;
    Ok(data_dir.join("config.yaml"))
}

/// 获取应用设置文件路径
pub fn get_app_settings_path() -> Result<PathBuf> {
    let config_dir = get_app_config_dir()?;
    Ok(config_dir.join("settings.json"))
}

// ============================================================================
// MiHomo 二进制文件路径
// ============================================================================

/// 获取 MiHomo 二进制文件名（根据当前平台和架构）
pub fn get_mihomo_binary_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "mihomo-windows-amd64.exe"
    }

    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            "mihomo-darwin-arm64"
        }
        #[cfg(target_arch = "x86_64")]
        {
            "mihomo-darwin-amd64"
        }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        {
            compile_error!("Unsupported macOS architecture")
        }
    }

    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "x86_64")]
        {
            "mihomo-linux-amd64"
        }
        #[cfg(target_arch = "aarch64")]
        {
            "mihomo-linux-arm64"
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
        {
            "mihomo-linux-amd64" // fallback
        }
    }
}

/// 获取 MiHomo 二进制文件的完整路径
///
/// 查找优先级：
/// 1. 用户数据目录 - 支持用户手动更新 mihomo
/// 2. 打包后的资源目录 - 根据平台计算
/// 3. 开发环境路径 - 支持 `cargo run` 和 `pnpm tauri dev`
///
/// # 各平台打包后的目录结构
///
/// ## macOS (.app bundle)
/// ```text
/// Conflux.app/
/// └── Contents/
///     ├── MacOS/
///     │   └── Conflux                    <- current_exe
///     └── Resources/
///         └── resources/                 <- tauri bundle.resources
///             └── mihomo-darwin-arm64
/// ```
///
/// ## Windows (NSIS installer)
/// ```text
/// C:\Program Files\Conflux\
/// ├── Conflux.exe                        <- current_exe
/// └── resources/                         <- tauri bundle.resources
///     └── mihomo-windows-amd64.exe
/// ```
///
/// ## Linux (AppImage / deb)
/// ```text
/// AppImage 解压后:
/// /tmp/.mount_XXX/
/// ├── conflux                            <- current_exe
/// └── resources/
///     └── mihomo-linux-amd64
///
/// deb 安装后:
/// /usr/bin/conflux                       <- current_exe (可能是 symlink)
/// /usr/share/conflux/resources/          <- 资源目录
///     └── mihomo-linux-amd64
/// ```
///
/// ## 开发环境
/// ```text
/// conflux-app/
/// └── src-tauri/
///     ├── target/debug/
///     │   └── Conflux                    <- current_exe
///     └── resources/
///         └── mihomo-xxx                 <- 源文件
/// ```
pub fn get_mihomo_binary_path() -> Result<PathBuf> {
    let binary_name = get_mihomo_binary_name();
    log::debug!("Looking for MiHomo binary: {}", binary_name);

    if let Ok(data_path) = ensure_mihomo_in_data_dir() {
        if data_path.exists() {
            return Ok(data_path);
        }
    }

    // ========================================================================
    // 优先级 1: 用户数据目录
    // 支持用户手动放置或更新 mihomo 二进制
    // ========================================================================
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);
    log::debug!("Checking user data path: {:?}", user_binary_path);
    if user_binary_path.exists() {
        let bundled_path = find_bundled_binary(binary_name)?;
        let dev_path = find_dev_binary(binary_name)?;
        let source_path = bundled_path.or(dev_path);

        if let Some(source_path) = source_path {
            match should_refresh_binary(&source_path, &user_binary_path) {
                Ok(true) => {
                    if let Err(err) = std::fs::copy(&source_path, &user_binary_path) {
                        log::warn!(
                            "Failed to refresh MiHomo in data dir from {:?}: {}",
                            source_path,
                            err
                        );
                    } else {
                        log::info!(
                            "Refreshed MiHomo in data dir from {:?}",
                            source_path
                        );
                    }
                }
                Ok(false) => {}
                Err(err) => {
                    log::warn!(
                        "Failed to compare MiHomo binaries for refresh: {}",
                        err
                    );
                }
            }
        }

        log::info!("Found MiHomo at user data path: {:?}", user_binary_path);
        return Ok(user_binary_path);
    }

    // ========================================================================
    // 优先级 2: 打包后的资源目录（根据平台计算）
    // ========================================================================
    if let Some(bundled_path) = find_bundled_binary(binary_name)? {
        log::info!("Found MiHomo at bundled path: {:?}", bundled_path);
        return Ok(bundled_path);
    }

    // ========================================================================
    // 优先级 3: 开发环境路径
    // ========================================================================
    if let Some(dev_path) = find_dev_binary(binary_name)? {
        log::info!("Found MiHomo at dev path: {:?}", dev_path);
        return Ok(dev_path);
    }

    // ========================================================================
    // 未找到，记录所有尝试过的路径
    // ========================================================================
    log_search_paths(binary_name)?;

    // 返回用户数据目录路径作为默认值（即使不存在）
    // 这样错误信息会指示用户将文件放到这个位置
    Ok(user_binary_path)
}

/// 确保 MiHomo 二进制在用户数据目录，并可用于权限设置
pub fn ensure_mihomo_in_data_dir() -> Result<PathBuf> {
    let binary_name = get_mihomo_binary_name();
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);

    let bundled_path = find_bundled_binary(binary_name)?;
    let dev_path = find_dev_binary(binary_name)?;
    let source_path = bundled_path.or(dev_path);

    if user_binary_path.exists() {
        if let Some(source_path) = source_path {
            if should_refresh_binary(&source_path, &user_binary_path)? {
                std::fs::copy(&source_path, &user_binary_path)?;
                log::info!(
                    "Refreshed MiHomo in data dir from {:?}",
                    source_path
                );
            }
        }
        return Ok(user_binary_path);
    }

    if let Some(source_path) = source_path {
        std::fs::copy(&source_path, &user_binary_path)?;
        log::info!(
            "Copied MiHomo to data dir from {:?}",
            source_path
        );
        return Ok(user_binary_path);
    }

    Err(anyhow::anyhow!(
        "MiHomo binary not found for initialization"
    ))
}

/// 查找打包后的二进制文件路径
fn find_bundled_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    log::debug!("Current exe: {:?}", current_exe);
    log::debug!("Exe directory: {:?}", exe_dir);

    // ------------------------------------------------------------------------
    // macOS: Conflux.app/Contents/MacOS/Conflux
    //     -> Conflux.app/Contents/Resources/resources/
    // ------------------------------------------------------------------------
    #[cfg(target_os = "macos")]
    {
        // exe_dir = .../Conflux.app/Contents/MacOS
        // 往上一级到 Contents，然后进入 Resources/resources
        if let Some(contents_dir) = exe_dir.parent() {
            let bundle_path = contents_dir
                .join("Resources")
                .join("resources")
                .join(binary_name);
            log::debug!("Checking macOS bundle path: {:?}", bundle_path);
            if bundle_path.exists() {
                return Ok(Some(bundle_path));
            }
        }
    }

    // ------------------------------------------------------------------------
    // Windows: Conflux/Conflux.exe -> Conflux/resources/
    // ------------------------------------------------------------------------
    #[cfg(target_os = "windows")]
    {
        // 方式 1: exe 同级的 resources 目录
        let resource_path = exe_dir.join("resources").join(binary_name);
        log::debug!("Checking Windows resource path: {:?}", resource_path);
        if resource_path.exists() {
            return Ok(Some(resource_path));
        }

        // 方式 2: exe 同级目录直接放置
        let same_dir_path = exe_dir.join(binary_name);
        log::debug!("Checking Windows same dir path: {:?}", same_dir_path);
        if same_dir_path.exists() {
            return Ok(Some(same_dir_path));
        }
    }

    // ------------------------------------------------------------------------
    // Linux: 多种安装方式
    // ------------------------------------------------------------------------
    #[cfg(target_os = "linux")]
    {
        // 方式 1: AppImage 或便携版 - exe 同级的 resources 目录
        let resource_path = exe_dir.join("resources").join(binary_name);
        log::debug!("Checking Linux resource path: {:?}", resource_path);
        if resource_path.exists() {
            return Ok(Some(resource_path));
        }

        // 方式 2: deb/rpm 安装 - /usr/share/conflux/resources/
        let system_path = PathBuf::from("/usr/share/conflux/resources").join(binary_name);
        log::debug!("Checking Linux system path: {:?}", system_path);
        if system_path.exists() {
            return Ok(Some(system_path));
        }

        // 方式 3: 本地安装 - ~/.local/share/conflux/resources/
        if let Some(data_dir) = dirs::data_local_dir() {
            let local_path = data_dir.join("conflux").join("resources").join(binary_name);
            log::debug!("Checking Linux local path: {:?}", local_path);
            if local_path.exists() {
                return Ok(Some(local_path));
            }
        }
    }

    // 通用: exe 同级的 resources 目录（所有平台的 fallback）
    let generic_resource_path = exe_dir.join("resources").join(binary_name);
    log::debug!("Checking generic resource path: {:?}", generic_resource_path);
    if generic_resource_path.exists() {
        return Ok(Some(generic_resource_path));
    }

    Ok(None)
}

/// 查找开发环境的二进制文件路径
fn find_dev_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    // ------------------------------------------------------------------------
    // 开发环境路径 1: 从 target/debug 或 target/release 往上找
    // target/debug/Conflux -> target/debug -> target -> src-tauri -> src-tauri/resources
    // ------------------------------------------------------------------------
    // exe_dir = src-tauri/target/debug 或 src-tauri/target/{triple}/debug
    if let Some(target_dir) = exe_dir.parent() {
        // 检查是否是 target/{triple}/debug 结构（交叉编译）
        let src_tauri_candidates = [
            target_dir.parent(), // target/debug -> target -> src-tauri (标准编译)
            target_dir
                .parent()
                .and_then(|p| p.parent()), // target/{triple}/debug -> target/{triple} -> target -> src-tauri (交叉编译)
        ];

        for src_tauri in src_tauri_candidates.into_iter().flatten() {
            let dev_path = src_tauri.join("resources").join(binary_name);
            log::debug!("Checking dev path: {:?}", dev_path);
            if dev_path.exists() {
                return Ok(Some(dev_path));
            }
        }
    }

    // ------------------------------------------------------------------------
    // 开发环境路径 2: 从当前工作目录查找
    // pnpm tauri dev 时，CWD 通常是项目根目录
    // ------------------------------------------------------------------------
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_path = cwd.join("src-tauri").join("resources").join(binary_name);
        log::debug!("Checking CWD path: {:?}", cwd_path);
        if cwd_path.exists() {
            return Ok(Some(cwd_path));
        }
    }

    Ok(None)
}

fn should_refresh_binary(source: &PathBuf, dest: &PathBuf) -> Result<bool> {
    let source_meta = std::fs::metadata(source)?;
    let dest_meta = std::fs::metadata(dest)?;

    if source_meta.len() != dest_meta.len() {
        return Ok(true);
    }

    let source_hash = hash_file(source)?;
    let dest_hash = hash_file(dest)?;
    Ok(source_hash != dest_hash)
}

fn hash_file(path: &PathBuf) -> Result<u64> {
    let mut file = File::open(path)?;
    let mut buffer = [0u8; 8192];
    let mut hasher = std::collections::hash_map::DefaultHasher::new();

    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        std::hash::Hasher::write(&mut hasher, &buffer[..read]);
    }

    Ok(std::hash::Hasher::finish(&hasher))
}

/// 记录所有尝试过的路径（用于调试）
fn log_search_paths(binary_name: &str) -> Result<()> {
    let data_dir = get_app_data_dir()?;
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    log::error!(
        "MiHomo binary '{}' not found. Searched paths:",
        binary_name
    );
    log::error!("  - User data: {:?}", data_dir.join(binary_name));

    #[cfg(target_os = "macos")]
    {
        if let Some(contents_dir) = exe_dir.parent() {
            log::error!(
                "  - macOS bundle: {:?}",
                contents_dir
                    .join("Resources")
                    .join("resources")
                    .join(binary_name)
            );
        }
    }

    #[cfg(target_os = "windows")]
    {
        log::error!(
            "  - Windows resources: {:?}",
            exe_dir.join("resources").join(binary_name)
        );
        log::error!("  - Windows same dir: {:?}", exe_dir.join(binary_name));
    }

    #[cfg(target_os = "linux")]
    {
        log::error!(
            "  - Linux resources: {:?}",
            exe_dir.join("resources").join(binary_name)
        );
        log::error!(
            "  - Linux system: {:?}",
            PathBuf::from("/usr/share/conflux/resources").join(binary_name)
        );
    }

    // 开发环境路径
    if let Some(target_dir) = exe_dir.parent() {
        if let Some(src_tauri) = target_dir.parent() {
            log::error!(
                "  - Dev path: {:?}",
                src_tauri.join("resources").join(binary_name)
            );
        }
    }

    Ok(())
}

// ============================================================================
// 工具函数
// ============================================================================

/// 生成随机 API Secret
pub fn generate_api_secret() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")[..16].to_string()
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_mihomo_binary_name() {
        let name = get_mihomo_binary_name();
        assert!(!name.is_empty());

        #[cfg(target_os = "macos")]
        {
            assert!(name.starts_with("mihomo-darwin-"));
        }

        #[cfg(target_os = "windows")]
        {
            assert!(name.starts_with("mihomo-windows-"));
            assert!(name.ends_with(".exe"));
        }

        #[cfg(target_os = "linux")]
        {
            assert!(name.starts_with("mihomo-linux-"));
        }
    }

    #[test]
    fn test_generate_api_secret() {
        let secret = generate_api_secret();
        assert_eq!(secret.len(), 16);
        assert!(!secret.contains('-'));
    }

    #[test]
    fn test_app_dirs() {
        // 这些函数应该不会失败
        assert!(get_app_data_dir().is_ok());
        assert!(get_app_config_dir().is_ok());
    }
}
