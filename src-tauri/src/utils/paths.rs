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

/// 获取 MiHomo 二进制文件名（根据当前平台和架构，使用 Tauri sidecar 命名规则）
pub fn get_mihomo_binary_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "mihomo-x86_64-pc-windows-msvc.exe"
    }

    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            "mihomo-aarch64-apple-darwin"
        }
        #[cfg(target_arch = "x86_64")]
        {
            "mihomo-x86_64-apple-darwin"
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
            "mihomo-x86_64-unknown-linux-gnu"
        }
        #[cfg(target_arch = "aarch64")]
        {
            "mihomo-aarch64-unknown-linux-gnu"
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
        {
            "mihomo-x86_64-unknown-linux-gnu" // fallback
        }
    }
}

/// 获取 MiHomo 二进制文件的完整路径
///
/// 查找优先级：
/// 1. 用户数据目录 - 支持用户手动更新 mihomo
/// 2. Sidecar 路径 - Tauri externalBin 打包后的位置
/// 3. 开发环境路径 - 支持 `cargo run` 和 `pnpm tauri dev`
#[allow(dead_code)]
pub fn get_mihomo_binary_path() -> Result<PathBuf> {
    let binary_name = get_mihomo_binary_name();
    log::debug!("Looking for MiHomo binary: {}", binary_name);

    // 首先尝试确保 mihomo 在用户数据目录
    if let Ok(data_path) = ensure_mihomo_in_data_dir() {
        if data_path.exists() {
            return Ok(data_path);
        }
    }

    // 用户数据目录
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);
    log::debug!("Checking user data path: {:?}", user_binary_path);
    if user_binary_path.exists() {
        log::info!("Found MiHomo at user data path: {:?}", user_binary_path);
        return Ok(user_binary_path);
    }

    // Sidecar 路径（可执行文件同级目录）
    if let Some(sidecar_path) = find_sidecar_binary(binary_name)? {
        log::info!("Found MiHomo at sidecar path: {:?}", sidecar_path);
        return Ok(sidecar_path);
    }

    // 开发环境路径
    if let Some(dev_path) = find_dev_binary(binary_name)? {
        log::info!("Found MiHomo at dev path: {:?}", dev_path);
        return Ok(dev_path);
    }

    // 未找到，记录所有尝试过的路径
    log_search_paths(binary_name)?;

    // 返回用户数据目录路径作为默认值（即使不存在）
    Ok(user_binary_path)
}

/// 确保 MiHomo 二进制在用户数据目录，并可用于权限设置
pub fn ensure_mihomo_in_data_dir() -> Result<PathBuf> {
    let binary_name = get_mihomo_binary_name();
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);

    let sidecar_path = find_sidecar_binary(binary_name)?;
    let dev_path = find_dev_binary(binary_name)?;
    let source_path = sidecar_path.or(dev_path);

    if user_binary_path.exists() {
        if let Some(ref source_path) = source_path {
            if should_refresh_binary(source_path, &user_binary_path)? {
                std::fs::copy(source_path, &user_binary_path)?;
                // 设置执行权限 (macOS/Linux)
                #[cfg(unix)]
                set_executable_permission(&user_binary_path)?;
                log::info!("Refreshed MiHomo in data dir from {:?}", source_path);
            }
        }
        // 确保现有文件有执行权限
        #[cfg(unix)]
        {
            if !has_executable_permission(&user_binary_path) {
                set_executable_permission(&user_binary_path)?;
                log::info!("Fixed executable permission for {:?}", user_binary_path);
            }
        }
        return Ok(user_binary_path);
    }

    if let Some(source_path) = source_path {
        std::fs::copy(&source_path, &user_binary_path)?;
        // 设置执行权限 (macOS/Linux)
        #[cfg(unix)]
        set_executable_permission(&user_binary_path)?;
        log::info!("Copied MiHomo to data dir from {:?}", source_path);
        return Ok(user_binary_path);
    }

    Err(anyhow::anyhow!(
        "MiHomo binary not found for initialization"
    ))
}

/// 设置文件的执行权限 (Unix only)
#[cfg(unix)]
fn set_executable_permission(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = std::fs::metadata(path)?;
    let mut permissions = metadata.permissions();
    // 设置 755 权限 (rwxr-xr-x)
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)?;
    log::debug!("Set executable permission (755) for {:?}", path);
    Ok(())
}

/// 检查文件是否有执行权限 (Unix only)
#[cfg(unix)]
fn has_executable_permission(path: &PathBuf) -> bool {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = std::fs::metadata(path) {
        let mode = metadata.permissions().mode();
        // 检查所有者执行位
        return (mode & 0o100) != 0;
    }
    false
}

/// 查找 Sidecar 二进制文件路径
/// Tauri externalBin 打包后文件名可能简化（去掉 target triple）或保留完整名称
#[allow(unused_variables)]
fn find_sidecar_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    log::debug!("Current exe: {:?}", current_exe);
    log::debug!("Exe directory: {:?}", exe_dir);

    // 尝试多种可能的文件名：
    // 1. 简化名称 (Tauri 默认行为)
    // 2. 完整的 target triple 名称 (某些 Tauri 版本或配置)

    #[cfg(target_os = "windows")]
    let candidates = vec![exe_dir.join("mihomo.exe"), exe_dir.join(binary_name)];

    #[cfg(not(target_os = "windows"))]
    let candidates = vec![exe_dir.join("mihomo"), exe_dir.join(binary_name)];

    for sidecar_path in candidates {
        log::debug!("Checking sidecar path: {:?}", sidecar_path);
        if sidecar_path.exists() {
            return Ok(Some(sidecar_path));
        }
    }

    // macOS 特殊处理：检查 .app bundle 内的 Resources 目录
    #[cfg(target_os = "macos")]
    {
        // .app/Contents/MacOS -> .app/Contents/Resources
        if let Some(contents_dir) = exe_dir.parent() {
            let resources_dir = contents_dir.join("Resources");
            let resource_candidates = vec![
                resources_dir.join("mihomo"),
                resources_dir.join(binary_name),
            ];
            for resource_path in resource_candidates {
                log::debug!("Checking macOS Resources path: {:?}", resource_path);
                if resource_path.exists() {
                    return Ok(Some(resource_path));
                }
            }
        }
    }

    // Linux 特殊处理：系统安装路径
    #[cfg(target_os = "linux")]
    {
        let system_path = PathBuf::from("/usr/bin").join("mihomo");
        log::debug!("Checking Linux system path: {:?}", system_path);
        if system_path.exists() {
            return Ok(Some(system_path));
        }
    }

    Ok(None)
}

/// 查找开发环境的二进制文件路径
fn find_dev_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    // 开发环境路径：从 target/debug 往上找到 src-tauri/binaries
    if let Some(target_dir) = exe_dir.parent() {
        let src_tauri_candidates = [
            target_dir.parent(),
            target_dir.parent().and_then(|p| p.parent()),
        ];

        for src_tauri in src_tauri_candidates.into_iter().flatten() {
            let dev_path = src_tauri.join("binaries").join(binary_name);
            log::debug!("Checking dev path: {:?}", dev_path);
            if dev_path.exists() {
                return Ok(Some(dev_path));
            }
        }
    }

    // 从当前工作目录查找
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_path = cwd.join("src-tauri").join("binaries").join(binary_name);
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
#[allow(dead_code)]
fn log_search_paths(binary_name: &str) -> Result<()> {
    let data_dir = get_app_data_dir()?;
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    log::error!("MiHomo binary '{}' not found. Searched paths:", binary_name);
    log::error!("  - User data: {:?}", data_dir.join(binary_name));
    log::error!("  - Sidecar path: {:?}", exe_dir.join(binary_name));

    #[cfg(target_os = "linux")]
    {
        log::error!(
            "  - Linux system: {:?}",
            PathBuf::from("/usr/bin").join(binary_name)
        );
    }

    // 开发环境路径
    if let Some(target_dir) = exe_dir.parent() {
        if let Some(src_tauri) = target_dir.parent() {
            log::error!(
                "  - Dev path: {:?}",
                src_tauri.join("binaries").join(binary_name)
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
            assert!(name.starts_with("mihomo-") && name.contains("apple-darwin"));
        }

        #[cfg(target_os = "windows")]
        {
            assert!(name.starts_with("mihomo-") && name.contains("windows"));
            assert!(name.ends_with(".exe"));
        }

        #[cfg(target_os = "linux")]
        {
            assert!(name.starts_with("mihomo-") && name.contains("linux"));
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
