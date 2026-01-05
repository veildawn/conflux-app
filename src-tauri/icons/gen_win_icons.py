#!/usr/bin/env python3
"""生成 Windows 专用图标（无 macOS 留白）"""

import os
import io
from PIL import Image
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM

def svg_to_png(svg_path, png_path, size):
    """将 SVG 转换为指定尺寸的 PNG"""
    drawing = svg2rlg(svg_path)
    if drawing is None:
        raise ValueError(f"Failed to parse SVG: {svg_path}")
    
    # 计算缩放比例
    scale_x = size / drawing.width
    scale_y = size / drawing.height
    scale = min(scale_x, scale_y)
    
    drawing.width = size
    drawing.height = size
    drawing.scale(scale, scale)
    
    # 渲染为 PNG
    renderPM.drawToFile(drawing, png_path, fmt="PNG", dpi=72 * (size / max(drawing.width, drawing.height) * scale))
    
    # 确保输出尺寸正确
    img = Image.open(png_path)
    if img.size != (size, size):
        img = img.resize((size, size), Image.Resampling.LANCZOS)
        img.save(png_path)

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    svg_path = 'icon-win.svg'
    
    # 生成 Windows 应用图标 PNG 文件（临时）
    sizes = [16, 24, 32, 48, 64, 128, 256]
    temp_files = []
    
    for size in sizes:
        png_path = f'icon-win-{size}.png'
        temp_files.append(png_path)
        svg_to_png(svg_path, png_path, size)
        print(f'Generated {png_path}')
    
    # 生成 Windows 托盘图标 (32x32)
    svg_to_png('tray-icon-win.svg', 'tray-icon-win.png', 32)
    print('Generated tray-icon-win.png')
    
    # 生成 Windows ICO 文件（包含多尺寸）
    ico_sizes = [16, 24, 32, 48, 64, 256]
    images = []
    for size in ico_sizes:
        img = Image.open(f'icon-win-{size}.png').convert('RGBA')
        images.append(img)
    
    images[0].save(
        'icon-win.ico',
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
        append_images=images[1:]
    )
    print('Generated icon-win.ico')
    
    # 生成 Windows Store 图标
    store_sizes = {
        'Square30x30Logo-win.png': 30,
        'Square44x44Logo-win.png': 44,
        'Square71x71Logo-win.png': 71,
        'Square89x89Logo-win.png': 89,
        'Square107x107Logo-win.png': 107,
        'Square142x142Logo-win.png': 142,
        'Square150x150Logo-win.png': 150,
        'Square284x284Logo-win.png': 284,
        'Square310x310Logo-win.png': 310,
        'StoreLogo-win.png': 50,
    }
    
    for filename, size in store_sizes.items():
        svg_to_png(svg_path, filename, size)
        print(f'Generated {filename} ({size}x{size})')
    
    # 生成通用尺寸的 Windows 图标
    general_icons = {
        '32x32-win.png': 32,
        '64x64-win.png': 64,
        '128x128-win.png': 128,
        '256x256-win.png': 256,
    }
    
    for filename, size in general_icons.items():
        svg_to_png(svg_path, filename, size)
        print(f'Generated {filename} ({size}x{size})')
    
    # 清理临时文件
    for tmp_file in temp_files:
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
    
    print('\nDone! Windows icons generated successfully.')

if __name__ == '__main__':
    main()
