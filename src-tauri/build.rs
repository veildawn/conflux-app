fn main() {
    // 确保在开发模式下修改图标资源后,Rust 侧会重新触发构建,
    // 否则 `tauri::generate_context!()` 里嵌入的默认图标不会更新,
    // 你会看到 Dock 图标"改了没生效"。
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=tauri.windows.conf.json");

    // 图标资源(Dock / tray / window icon 相关)
    println!("cargo:rerun-if-changed=icons/icon.svg");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");

    // Sub-Store 相关资源
    println!("cargo:rerun-if-changed=resources/sub-store/sub-store.bundle.js");
    println!("cargo:rerun-if-changed=resources/sub-store/run-substore.js");
    println!("cargo:rerun-if-changed=resources/sub-store/package.json");
    println!("cargo:rerun-if-changed=binaries/node-aarch64-apple-darwin");
    println!("cargo:rerun-if-changed=binaries/node-x86_64-apple-darwin");
    println!("cargo:rerun-if-changed=binaries/node-x86_64-unknown-linux-gnu");
    println!("cargo:rerun-if-changed=binaries/node-x86_64-pc-windows-msvc.exe");

    // 在构建时检查必要的资源文件
    check_substore_resources();

    tauri_build::build()
}

/// 检查 Sub-Store 相关资源是否存在
fn check_substore_resources() {
    use std::path::Path;

    let resources_dir = Path::new("resources/sub-store");
    let binaries_dir = Path::new("binaries");

    // 检查 Sub-Store 核心文件
    let required_files = vec![
        resources_dir.join("sub-store.bundle.js"),
        resources_dir.join("run-substore.js"),
        resources_dir.join("package.json"),
    ];

    let mut missing_files = Vec::new();

    for file in &required_files {
        if !file.exists() {
            missing_files.push(file.to_string_lossy().to_string());
        }
    }

    // 检查平台特定的 Node.js 二进制文件
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let node_binary = binaries_dir.join("node-aarch64-apple-darwin");

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let node_binary = binaries_dir.join("node-x86_64-apple-darwin");

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    let node_binary = binaries_dir.join("node-x86_64-unknown-linux-gnu");

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    let node_binary = binaries_dir.join("node-x86_64-pc-windows-msvc.exe");

    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64")
    )))]
    let node_binary = binaries_dir.join("node-unknown");

    if !node_binary.exists() {
        missing_files.push(node_binary.to_string_lossy().to_string());
    }

    // 如果有缺失的文件,提供有用的错误信息
    if !missing_files.is_empty() {
        eprintln!("\n========================================");
        eprintln!("⚠️  Missing Sub-Store resources:");
        eprintln!("========================================");
        for file in &missing_files {
            eprintln!("  - {}", file);
        }
        eprintln!("\n📦 To download required resources, run:");
        eprintln!("  pnpm run fetch:substore   # Download Sub-Store");
        eprintln!("  pnpm run fetch:node       # Download Node.js binaries");
        eprintln!("\n  Or run both:");
        eprintln!("  pnpm run fetch:all        # Download everything");
        eprintln!("========================================\n");

        // 在 CI 环境或 release 构建时,缺少资源应该报错
        if std::env::var("CI").is_ok() || std::env::var("PROFILE").unwrap_or_default() == "release"
        {
            panic!("Missing required Sub-Store resources. Please run fetch scripts first.");
        } else {
            eprintln!("⚠️  Warning: Building without Sub-Store support\n");
        }
    } else {
        println!("✅ All Sub-Store resources are present");
    }
}
