#!/usr/bin/env python3
"""使用 PIL 创建多尺寸 ICO 文件"""

from PIL import Image
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ICO 需要的尺寸
ico_sizes = [16, 24, 32, 48, 64, 256]

# 加载所有尺寸的图片
images = []
for size in ico_sizes:
    img_path = f'icon-win-{size}.png'
    if os.path.exists(img_path):
        img = Image.open(img_path).convert('RGBA')
        # 确保尺寸正确
        if img.size != (size, size):
            img = img.resize((size, size), Image.Resampling.LANCZOS)
        images.append(img)
        print(f'Loaded {img_path}: {img.size}')
    else:
        print(f'Warning: {img_path} not found')

if images:
    # 使用第一个图片作为基础，其他作为附加
    # PIL 的 ICO 保存需要通过 append_images 添加其他尺寸
    images[0].save(
        'icon-win.ico',
        format='ICO',
        append_images=images[1:],
        sizes=[(img.width, img.height) for img in images]
    )
    
    # 检查生成的文件
    file_size = os.path.getsize('icon-win.ico')
    print(f'\nGenerated icon-win.ico: {file_size} bytes')
    
    # 验证
    import struct
    with open('icon-win.ico', 'rb') as f:
        f.read(4)
        count = struct.unpack('<H', f.read(2))[0]
        print(f'ICO contains {count} images')
else:
    print('No images found!')







