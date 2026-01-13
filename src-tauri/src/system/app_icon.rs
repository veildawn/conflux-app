use once_cell::sync::OnceCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::Mutex;

static ICON_CACHE: OnceCell<Mutex<HashMap<String, Option<String>>>> = OnceCell::new();

fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "windows")]
fn query_full_process_image_name_windows(pid: u32) -> Option<PathBuf> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if h == 0 {
        return None;
    }
    let mut buf: Vec<u16> = vec![0u16; 4096];
    let mut len: u32 = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len) };
    unsafe { CloseHandle(h) };
    if ok == 0 || len == 0 {
        return None;
    }
    let path = OsString::from_wide(&buf[..len as usize])
        .to_string_lossy()
        .to_string();
    let pb = PathBuf::from(path);
    if pb.exists() {
        Some(pb)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn resolve_process_ids_by_name_windows(process_name: &str) -> Vec<(u32, u32)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let needle = process_name.trim();
    if needle.is_empty() || needle.eq_ignore_ascii_case("unknown") {
        return vec![];
    }

    // Common normalization: allow "chrome" to match "chrome.exe" (and vice versa)
    let needle_no_ext = needle.strip_suffix(".exe").unwrap_or(needle);

    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snap == INVALID_HANDLE_VALUE {
        return vec![];
    }

    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    let mut matches: Vec<(u32, u32)> = Vec::new();
    let mut ok = unsafe { Process32FirstW(snap, &mut entry) };
    while ok != 0 {
        // szExeFile is a null-terminated UTF-16 string
        let end = entry
            .szExeFile
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(entry.szExeFile.len());
        let exe_name = OsString::from_wide(&entry.szExeFile[..end])
            .to_string_lossy()
            .to_string();

        let exe_no_ext = exe_name.strip_suffix(".exe").unwrap_or(&exe_name);
        if exe_name.eq_ignore_ascii_case(needle)
            || exe_no_ext.eq_ignore_ascii_case(needle)
            || exe_name.eq_ignore_ascii_case(needle_no_ext)
            || exe_no_ext.eq_ignore_ascii_case(needle_no_ext)
        {
            matches.push((entry.th32ProcessID, entry.th32ParentProcessID));
        }

        ok = unsafe { Process32NextW(snap, &mut entry) };
    }

    unsafe { CloseHandle(snap) };
    matches
}

#[cfg(target_os = "windows")]
fn resolve_parent_pid_windows(pid: u32) -> Option<u32> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    if pid == 0 {
        return None;
    }

    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snap == INVALID_HANDLE_VALUE {
        return None;
    }

    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut ok = unsafe { Process32FirstW(snap, &mut entry) };
    let mut out: Option<u32> = None;

    while ok != 0 {
        if entry.th32ProcessID == pid {
            out = Some(entry.th32ParentProcessID);
            break;
        }
        ok = unsafe { Process32NextW(snap, &mut entry) };
    }

    unsafe { CloseHandle(snap) };
    out
}

#[cfg(target_os = "windows")]
fn extract_file_icon_png_data_url_windows(exec_path: &Path) -> Option<String> {
    use base64::Engine;
    use png::{BitDepth, ColorType, Encoder};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HICON;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

    let wide: Vec<u16> = OsStr::new(exec_path.as_os_str())
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut info = SHFILEINFOW {
        hIcon: 0,
        iIcon: 0,
        dwAttributes: 0,
        szDisplayName: [0; 260],
        szTypeName: [0; 80],
    };

    let ok = unsafe {
        SHGetFileInfoW(
            wide.as_ptr(),
            0,
            &mut info,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if ok == 0 || info.hIcon == 0 {
        return None;
    }
    let hicon: HICON = info.hIcon;

    // Render icon into a 32-bit BGRA DIB, then encode as PNG.
    let size: i32 = 32;
    let hdc = unsafe { CreateCompatibleDC(0) };
    if hdc == 0 {
        unsafe { DestroyIcon(hicon) };
        return None;
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [0],
    };

    let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
    let hbmp = unsafe { CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits_ptr, 0, 0) };
    if hbmp == 0 || bits_ptr.is_null() {
        unsafe {
            DeleteDC(hdc);
            DestroyIcon(hicon);
        }
        return None;
    }

    let old = unsafe { SelectObject(hdc, hbmp) };
    let draw_ok = unsafe { DrawIconEx(hdc, 0, 0, hicon, size, size, 0, 0, DI_NORMAL) };

    // Copy pixels out (BGRA -> RGBA)
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    if draw_ok != 0 {
        unsafe {
            let src = std::slice::from_raw_parts(bits_ptr as *const u8, rgba.len());
            for i in 0..(size * size) as usize {
                let b = src[i * 4 + 0];
                let g = src[i * 4 + 1];
                let r = src[i * 4 + 2];
                let a = src[i * 4 + 3];
                rgba[i * 4 + 0] = r;
                rgba[i * 4 + 1] = g;
                rgba[i * 4 + 2] = b;
                rgba[i * 4 + 3] = a;
            }
        }
    }

    unsafe {
        let _ = SelectObject(hdc, old);
        DeleteObject(hbmp);
        DeleteDC(hdc);
        DestroyIcon(hicon);
    }

    if draw_ok == 0 {
        return None;
    }

    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut enc = Encoder::new(&mut png_bytes, size as u32, size as u32);
        enc.set_color(ColorType::Rgba);
        enc.set_depth(BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

#[cfg(target_os = "windows")]
fn get_process_icon_data_url_windows(
    process_name: Option<&str>,
    process_path: Option<&str>,
) -> Option<String> {
    // 1) Prefer processPath from Mihomo metadata.
    if let Some(p) = process_path {
        let pb = PathBuf::from(p);
        if pb.exists() {
            if let Some(icon) = extract_file_icon_png_data_url_windows(&pb) {
                return Some(icon);
            }
        }
    }

    // 2) Fallback: use processName -> resolve PID -> exe path -> icon.
    let Some(name) = process_name else {
        return None;
    };
    let mut visited: std::collections::HashSet<u32> = std::collections::HashSet::new();

    // Iterate all matches (could be multiple processes with same name).
    for (pid, ppid) in resolve_process_ids_by_name_windows(name) {
        if let Some(path) = query_full_process_image_name_windows(pid) {
            if let Some(icon) = extract_file_icon_png_data_url_windows(&path) {
                return Some(icon);
            }
        }

        // 3) Parent fallback: walk up a few levels (child helpers -> main app)
        let mut cur = ppid;
        for _ in 0..3 {
            if cur == 0 || !visited.insert(cur) {
                break;
            }
            if let Some(ppath) = query_full_process_image_name_windows(cur) {
                if let Some(icon) = extract_file_icon_png_data_url_windows(&ppath) {
                    return Some(icon);
                }
            }

            // next parent
            if let Some(next) = resolve_parent_pid_windows(cur) {
                cur = next;
            } else {
                break;
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn find_app_bundles_from_exec(exec_path: &Path) -> Vec<PathBuf> {
    let mut bundles: Vec<PathBuf> = Vec::new();
    for anc in exec_path.ancestors() {
        if anc.extension().and_then(|s| s.to_str()) == Some("app") {
            bundles.push(anc.to_path_buf());
        }
    }
    bundles
}

#[cfg(target_os = "macos")]
fn plistbuddy_read_value(info_plist: &Path, key_path: &str) -> Option<String> {
    let out = std::process::Command::new("/usr/libexec/PlistBuddy")
        .arg("-c")
        .arg(format!("Print :{key_path}"))
        .arg(info_plist)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[cfg(target_os = "macos")]
fn pick_icns_path(app_bundle: &Path) -> Option<PathBuf> {
    let info_plist = app_bundle.join("Contents").join("Info.plist");
    let resources_dir = app_bundle.join("Contents").join("Resources");

    // 1) CFBundleIconFile
    if let Some(mut icon) = plistbuddy_read_value(&info_plist, "CFBundleIconFile") {
        if !icon.to_lowercase().ends_with(".icns") {
            icon.push_str(".icns");
        }
        let p = resources_dir.join(&icon);
        if p.exists() {
            return Some(p);
        }
    }

    // 2) CFBundleIcons -> CFBundlePrimaryIcon -> CFBundleIconFile
    if let Some(mut icon) = plistbuddy_read_value(
        &info_plist,
        "CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconFile",
    ) {
        if !icon.to_lowercase().ends_with(".icns") {
            icon.push_str(".icns");
        }
        let p = resources_dir.join(&icon);
        if p.exists() {
            return Some(p);
        }
    }

    // 3) Fallback: pick any .icns in Resources (prefer AppIcon*).
    let entries = std::fs::read_dir(&resources_dir).ok()?;
    let mut fallback: Option<PathBuf> = None;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("icns"))
            != Some(true)
        {
            continue;
        }
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        if name.to_lowercase().contains("appicon") {
            return Some(p);
        }
        if fallback.is_none() {
            fallback = Some(p);
        }
    }
    fallback
}

#[cfg(target_os = "macos")]
fn icns_to_png_data_url(icns_path: &Path, cache_key: &str) -> Option<String> {
    use base64::Engine;
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(cache_key.as_bytes());
    let hex = format!("{:x}", hasher.finalize());

    let out_path = std::env::temp_dir().join(format!("conflux-proc-icon-{hex}.png"));

    // Convert using sips (system tool). It's okay if it fails; we return None.
    let status = std::process::Command::new("/usr/bin/sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(icns_path)
        .arg("--out")
        .arg(&out_path)
        .status()
        .ok()?;
    if !status.success() || !out_path.exists() {
        return None;
    }

    let bytes = std::fs::read(&out_path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

#[cfg(target_os = "macos")]
fn normalize_process_name_macos(name: &str) -> String {
    let n = name.trim();
    if n.is_empty() {
        return String::new();
    }
    // Common: "Cursor Helper (Plugin)" -> "Cursor Helper"
    let base = n.split('(').next().unwrap_or(n).trim();
    base.to_string()
}

#[cfg(target_os = "macos")]
fn resolve_exec_path_by_process_name(process_name: &str) -> Option<PathBuf> {
    // Best-effort: find PID by exact "comm" name, then use proc_pidpath for the executable path.
    let out = std::process::Command::new("/bin/ps")
        .arg("-ax")
        .arg("-o")
        .arg("pid=")
        .arg("-o")
        .arg("comm=")
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }

    let needle = normalize_process_name_macos(process_name);
    if needle.is_empty() {
        return None;
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut pids: Vec<i32> = Vec::new();

    for line in text.lines() {
        let line = line.trim_start();
        if line.is_empty() {
            continue;
        }
        // split once: PID + rest (comm may include spaces)
        let mut it = line.splitn(2, char::is_whitespace);
        let pid_str = it.next()?.trim();
        let comm = it.next().unwrap_or("").trim();
        if comm.is_empty() {
            continue;
        }

        // ps "comm" on macOS is usually the full executable path.
        // Match by basename and allow prefix match (e.g. "Cursor Helper (Plugin)" -> "Cursor Helper")
        let base = std::path::Path::new(comm)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(comm);

        let base_norm = normalize_process_name_macos(base);
        if base_norm == needle || base_norm.starts_with(&needle) || needle.starts_with(&base_norm) {
            if let Ok(pid) = pid_str.parse::<i32>() {
                pids.push(pid);
            }
        }
    }

    if pids.is_empty() {
        return None;
    }

    // proc_pidpath from libproc is robust and returns the actual executable path.
    #[link(name = "proc")]
    extern "C" {
        fn proc_pidpath(pid: i32, buffer: *mut libc::c_void, buffersize: u32) -> i32;
    }

    for pid in pids {
        let mut buf = vec![0u8; 4096];
        let rc = unsafe {
            proc_pidpath(
                pid,
                buf.as_mut_ptr().cast::<libc::c_void>(),
                buf.len() as u32,
            )
        };
        if rc <= 0 {
            continue;
        }
        let path = String::from_utf8_lossy(&buf[..(rc as usize)]).to_string();
        if path.starts_with('/') {
            return Some(PathBuf::from(path));
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn get_process_icon_data_url_macos(
    process_name: Option<&str>,
    process_path: Option<&str>,
) -> Option<String> {
    // 1) Prefer processPath from Mihomo metadata (most accurate).
    let exec_path = if let Some(p) = process_path {
        let pb = PathBuf::from(p);
        if pb.exists() {
            Some(pb)
        } else {
            None
        }
    } else {
        None
    }
    .or_else(|| process_name.and_then(resolve_exec_path_by_process_name))?;

    let bundles = find_app_bundles_from_exec(&exec_path);
    if bundles.is_empty() {
        return None;
    }

    // Prefer the outermost .app (e.g. Cursor.app) over nested helper apps (e.g. Cursor Helper.app),
    // so that helper / plugin subprocesses still show the main app icon.
    let mut preferred = bundles.last().cloned();
    for b in bundles.iter().rev() {
        let name = b
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !name.contains("helper") && !name.contains("plugin") {
            preferred = Some(b.clone());
            break;
        }
    }

    let app_bundle = preferred?;
    let icns = pick_icns_path(&app_bundle)?;

    let cache_key = format!("bundle={};icns={}", app_bundle.display(), icns.display());
    icns_to_png_data_url(&icns, &cache_key)
}

/// 获取进程对应的应用图标（PNG data URL）。
/// - 优先使用 `process_path`（MiHomo metadata 提供，最准确）
/// - 兜底使用 `process_name`（macOS：通过 PID 查询可执行路径）
pub async fn get_process_icon_data_url(
    process_name: Option<String>,
    process_path: Option<String>,
) -> Result<Option<String>, String> {
    let key = process_path
        .clone()
        .or_else(|| process_name.clone())
        .unwrap_or_default()
        .trim()
        .to_string();

    if key.is_empty() || key.eq_ignore_ascii_case("unknown") {
        return Ok(None);
    }

    // Cache hit.
    if let Some(v) = icon_cache().lock().await.get(&key).cloned() {
        return Ok(v);
    }

    let process_name2 = process_name.clone();
    let process_path2 = process_path.clone();

    let computed = tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            get_process_icon_data_url_macos(process_name2.as_deref(), process_path2.as_deref())
        }
        #[cfg(target_os = "windows")]
        {
            get_process_icon_data_url_windows(process_name2.as_deref(), process_path2.as_deref())
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = (process_name2, process_path2);
            None
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    icon_cache().lock().await.insert(key, computed.clone());
    Ok(computed)
}
