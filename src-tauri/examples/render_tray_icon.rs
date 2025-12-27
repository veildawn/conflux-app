use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    const TARGET_SIZE: u32 = 44;

    let svg_path = Path::new("icons/tray-icon.svg");
    let png_path = Path::new("icons/tray-icon.png");

    let mut opt = resvg::usvg::Options::default();
    opt.resources_dir = std::fs::canonicalize(svg_path)
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    let svg_data = std::fs::read(svg_path)?;
    let tree = resvg::usvg::Tree::from_data(&svg_data, &opt)?;
    let size = tree.size();
    let scale = TARGET_SIZE as f32 / size.width();
    let width = TARGET_SIZE;
    let height = (size.height() * scale).round() as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or("Failed to allocate pixmap")?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    pixmap.save_png(png_path)?;

    Ok(())
}
