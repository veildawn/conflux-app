fn main() {
    // 确保在开发模式下修改图标资源后，Rust 侧会重新触发构建，
    // 否则 `tauri::generate_context!()` 里嵌入的默认图标不会更新，
    // 你会看到 Dock 图标“改了没生效”。
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=tauri.windows.conf.json");

    // 图标资源（Dock / tray / window icon 相关）
    println!("cargo:rerun-if-changed=icons/icon.svg");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");

    tauri_build::build()
}
