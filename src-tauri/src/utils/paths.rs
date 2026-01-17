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
#[cfg(not(target_os = "windows"))]
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
            // 比较版本号，只有打包版本更高时才覆盖
            let source_version = get_mihomo_version(source_path);
            let dest_version = get_mihomo_version(&user_binary_path);

            let should_update = match (&source_version, &dest_version) {
                (Some(src), Some(dst)) => {
                    let cmp = compare_versions(src, dst);
                    if cmp > 0 {
                        log::info!(
                            "Bundled MiHomo {} is newer than installed {}, will update",
                            src,
                            dst
                        );
                        true
                    } else if cmp < 0 {
                        log::info!(
                            "Installed MiHomo {} is newer than bundled {}, skipping update",
                            dst,
                            src
                        );
                        false
                    } else {
                        log::debug!("MiHomo versions are the same ({}), skipping update", src);
                        false
                    }
                }
                // 无法获取版本时，回退到文件比较
                _ => {
                    log::debug!("Could not compare versions, falling back to file comparison");
                    should_refresh_binary(source_path, &user_binary_path)?
                }
            };

            if should_update {
                // 兼容旧版本：如果文件被设为 root-owned，普通用户进程将无法覆盖（EPERM）
                if let Err(e) = std::fs::copy(source_path, &user_binary_path) {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        log::warn!("MiHomo in data dir is not writable, skip refresh: {}", e);
                    } else {
                        return Err(e.into());
                    }
                } else {
                    // 规范化执行权限 (macOS/Linux)：统一设置为 755
                    #[cfg(unix)]
                    normalize_mihomo_permissions(&user_binary_path)?;
                    log::info!("Refreshed MiHomo in data dir from {:?}", source_path);
                }
            }
        }
        // 确保现有文件权限合理（不仅仅是"可执行"）
        #[cfg(unix)]
        {
            normalize_mihomo_permissions(&user_binary_path)?;
        }
        return Ok(user_binary_path);
    }

    if let Some(source_path) = source_path {
        std::fs::copy(&source_path, &user_binary_path)?;
        // 规范化执行权限 (macOS/Linux)
        #[cfg(unix)]
        normalize_mihomo_permissions(&user_binary_path)?;
        log::info!("Copied MiHomo to data dir from {:?}", source_path);
        return Ok(user_binary_path);
    }

    Err(anyhow::anyhow!(
        "MiHomo binary not found for initialization"
    ))
}

/// 获取 MiHomo 二进制文件的版本号
fn get_mihomo_version(path: &PathBuf) -> Option<String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new(path)
            .arg("-v")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new(path).arg("-v").output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // 输出格式: "Mihomo Meta v1.19.19 ..." 或 "v1.19.19"
    // 提取版本号
    for word in stdout.split_whitespace() {
        if word.starts_with('v')
            && word
                .chars()
                .skip(1)
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
        {
            return Some(word.to_string());
        }
    }
    None
}

/// 比较版本号，返回: >0 表示 a 更新, <0 表示 b 更新, =0 表示相同
fn compare_versions(a: &str, b: &str) -> i32 {
    let parse_version = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split(|c: char| c == '.' || c == '-')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };

    let va = parse_version(a);
    let vb = parse_version(b);
    let max_len = va.len().max(vb.len());

    for i in 0..max_len {
        let na = va.get(i).copied().unwrap_or(0);
        let nb = vb.get(i).copied().unwrap_or(0);
        if na != nb {
            return if na > nb { 1 } else { -1 };
        }
    }
    0
}

#[cfg(unix)]
fn normalize_mihomo_permissions(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = std::fs::metadata(path)?;
    let current_mode = metadata.permissions().mode();
    let mut permissions = metadata.permissions();
    // 统一确保可执行权限为 755 (rwxr-xr-x)
    // 清除任何特殊位（setuid/setgid/sticky）
    permissions.set_mode(0o755);
    if let Err(e) = std::fs::set_permissions(path, permissions) {
        // 兼容旧版本：如果文件是 root-owned，普通用户无法 chmod，跳过即可
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            log::debug!(
                "Skip normalizing MiHomo permissions for {:?} due to PermissionDenied: {}",
                path,
                e
            );
            return Ok(());
        }
        return Err(e.into());
    }
    log::debug!(
        "Normalized MiHomo permissions for {:?} (mode {:o} -> {:o})",
        path,
        current_mode,
        0o755
    );
    Ok(())
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
#[cfg(not(target_os = "windows"))]
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
// macOS Helper 二进制文件路径
// ============================================================================

/// 获取 Helper 二进制文件名（根据当前平台和架构）
#[cfg(target_os = "macos")]
pub fn get_helper_binary_name() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "helper-aarch64-apple-darwin"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "helper-x86_64-apple-darwin"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        compile_error!("Unsupported macOS architecture")
    }
}

/// 获取 Helper 二进制文件的完整路径
///
/// 查找优先级：
/// 1. 用户数据目录 - 权限设置后的位置
/// 2. Sidecar 路径 - Tauri externalBin 打包后的位置
/// 3. 开发环境路径 - 支持 `cargo run` 和 `pnpm tauri dev`
#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub fn get_helper_binary_path() -> Result<PathBuf> {
    let binary_name = get_helper_binary_name();
    log::debug!("Looking for Helper binary: {}", binary_name);

    // 首先检查用户数据目录（权限设置后的位置）
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);
    if user_binary_path.exists() {
        log::debug!("Found Helper at user data path: {:?}", user_binary_path);
        return Ok(user_binary_path);
    }

    // Sidecar 路径
    if let Some(sidecar_path) = find_helper_sidecar_binary(binary_name)? {
        log::debug!("Found Helper at sidecar path: {:?}", sidecar_path);
        return Ok(sidecar_path);
    }

    // 开发环境路径
    if let Some(dev_path) = find_helper_dev_binary(binary_name)? {
        log::debug!("Found Helper at dev path: {:?}", dev_path);
        return Ok(dev_path);
    }

    Err(anyhow::anyhow!("Helper binary not found: {}", binary_name))
}

/// 确保 Helper 二进制在用户数据目录，用于权限设置
#[cfg(target_os = "macos")]
pub fn ensure_helper_in_data_dir() -> Result<PathBuf> {
    let binary_name = get_helper_binary_name();
    let data_dir = get_app_data_dir()?;
    let user_binary_path = data_dir.join(binary_name);

    // 如果已存在且有 setuid 权限，不覆盖
    if user_binary_path.exists() {
        if is_setuid_root(&user_binary_path)? {
            log::debug!(
                "Helper already exists with setuid, skipping copy: {:?}",
                user_binary_path
            );
            return Ok(user_binary_path);
        }
    }

    // 查找源文件
    let sidecar_path = find_helper_sidecar_binary(binary_name)?;
    let dev_path = find_helper_dev_binary(binary_name)?;
    let source_path = sidecar_path.or(dev_path);

    if let Some(source_path) = source_path {
        // 如果目标文件存在但不是 setuid，检查是否需要更新
        if user_binary_path.exists() {
            if should_refresh_binary(&source_path, &user_binary_path)? {
                std::fs::copy(&source_path, &user_binary_path)?;
                log::info!("Refreshed Helper from {:?}", source_path);
            }
        } else {
            std::fs::copy(&source_path, &user_binary_path)?;
            log::info!("Copied Helper to data dir from {:?}", source_path);
        }

        // 设置可执行权限
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&user_binary_path)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&user_binary_path, perms)?;
        }

        return Ok(user_binary_path);
    }

    if user_binary_path.exists() {
        return Ok(user_binary_path);
    }

    Err(anyhow::anyhow!(
        "Helper binary not found for initialization"
    ))
}

/// 检查文件是否为 root 所有且设置了 setuid 位
#[cfg(target_os = "macos")]
pub fn is_setuid_root(path: &PathBuf) -> Result<bool> {
    use std::os::unix::fs::MetadataExt;

    let metadata = std::fs::metadata(path)?;

    // 检查所有者是否为 root (uid 0)
    let is_root_owned = metadata.uid() == 0;

    // 检查是否设置了 setuid 位 (0o4000)
    let has_setuid = (metadata.mode() & 0o4000) != 0;

    log::debug!(
        "Permission check for {:?}: uid={}, mode={:o}, is_root={}, has_setuid={}",
        path,
        metadata.uid(),
        metadata.mode(),
        is_root_owned,
        has_setuid
    );

    Ok(is_root_owned && has_setuid)
}

/// 查找 Helper Sidecar 二进制文件路径
#[cfg(target_os = "macos")]
fn find_helper_sidecar_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    // 尝试多种可能的文件名
    let candidates = vec![exe_dir.join("helper"), exe_dir.join(binary_name)];

    for path in candidates {
        if path.exists() {
            return Ok(Some(path));
        }
    }

    // macOS: 检查 .app bundle 内的 Resources 目录
    if let Some(contents_dir) = exe_dir.parent() {
        let resources_dir = contents_dir.join("Resources");
        let resource_candidates = vec![
            resources_dir.join("helper"),
            resources_dir.join(binary_name),
        ];
        for path in resource_candidates {
            if path.exists() {
                return Ok(Some(path));
            }
        }
    }

    Ok(None)
}

/// 查找 Helper 开发环境二进制文件路径
#[cfg(target_os = "macos")]
fn find_helper_dev_binary(binary_name: &str) -> Result<Option<PathBuf>> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get executable directory"))?;

    // 开发环境路径：从 target/debug 往上找到 src-tauri/binaries 或 helper/target/debug
    if let Some(target_dir) = exe_dir.parent() {
        let src_tauri_candidates = [
            target_dir.parent(),
            target_dir.parent().and_then(|p| p.parent()),
        ];

        for src_tauri in src_tauri_candidates.into_iter().flatten() {
            // 检查 binaries 目录
            let binaries_path = src_tauri.join("binaries").join(binary_name);
            if binaries_path.exists() {
                return Ok(Some(binaries_path));
            }

            // 检查 helper/target/debug 目录（开发时编译的位置）
            let helper_debug_path = src_tauri.join("helper/target/debug/conflux-helper");
            if helper_debug_path.exists() {
                return Ok(Some(helper_debug_path));
            }
        }
    }

    // 从当前工作目录查找
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_binaries_path = cwd.join("src-tauri/binaries").join(binary_name);
        if cwd_binaries_path.exists() {
            return Ok(Some(cwd_binaries_path));
        }

        let cwd_helper_debug = cwd.join("src-tauri/helper/target/debug/conflux-helper");
        if cwd_helper_debug.exists() {
            return Ok(Some(cwd_helper_debug));
        }
    }

    Ok(None)
}

/// TUN 模式 PID 文件路径（由 helper 管理）
#[cfg(target_os = "macos")]
pub const HELPER_PID_FILE: &str = "/tmp/conflux-mihomo-tun.pid";

/// 检查是否存在 helper 管理的 TUN 模式进程
#[cfg(target_os = "macos")]
pub fn has_helper_pid_file() -> bool {
    std::path::Path::new(HELPER_PID_FILE).exists()
}

// ============================================================================
// GeoData 内置资源
// ============================================================================

/// 内置的 GeoData 文件列表
const BUNDLED_GEODATA_FILES: &[&str] = &["GeoIP.dat", "geosite.dat", "GeoLite2-ASN.mmdb"];

/// 确保内置的 GeoData 资源已复制到数据目录
///
/// 在应用启动时调用，将内置的 GeoIP.dat、geosite.dat、GeoLite2-ASN.mmdb
/// 复制到用户数据目录（如果目标文件不存在）
pub fn ensure_bundled_geodata(app_handle: &tauri::AppHandle) -> Result<()> {
    use tauri::Manager;

    let data_dir = get_app_data_dir()?;

    for file_name in BUNDLED_GEODATA_FILES {
        let dest_path = data_dir.join(file_name);

        // 如果目标文件已存在，跳过
        if dest_path.exists() {
            log::debug!("GeoData file already exists, skipping: {:?}", dest_path);
            continue;
        }

        // 获取内置资源路径
        let source_path = if cfg!(debug_assertions) {
            // 开发模式：从项目目录加载
            let exe_path = std::env::current_exe()
                .map_err(|e| anyhow::anyhow!("Failed to get exe path: {}", e))?;
            let project_dir = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| anyhow::anyhow!("Failed to determine project root"))?;
            project_dir
                .join("src-tauri")
                .join("resources")
                .join("geodata")
                .join(file_name)
        } else {
            // 生产模式：使用 Tauri 的 resource_dir()
            app_handle
                .path()
                .resource_dir()
                .map_err(|e| anyhow::anyhow!("Failed to get resource dir: {}", e))?
                .join("resources")
                .join("geodata")
                .join(file_name)
        };

        log::debug!("Looking for bundled GeoData at: {:?}", source_path);

        if source_path.exists() {
            // 复制文件
            std::fs::copy(&source_path, &dest_path)?;
            log::info!(
                "Copied bundled GeoData: {:?} -> {:?}",
                source_path,
                dest_path
            );
        } else {
            log::warn!(
                "Bundled GeoData not found: {:?}, will download later",
                source_path
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
