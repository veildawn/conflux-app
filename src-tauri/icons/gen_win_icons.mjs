/**
 * 生成 Windows 专用图标（无 macOS 留白）
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

async function svgToPng(svgPath, pngPath, size) {
  const svgBuffer = fs.readFileSync(svgPath);
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(pngPath);
}

async function main() {
  const svgPath = 'icon-win.svg';
  
  // 生成 Windows 应用图标 PNG 文件（临时用于生成 ICO）
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tempFiles = [];
  
  for (const size of sizes) {
    const pngPath = `icon-win-${size}.png`;
    tempFiles.push(pngPath);
    await svgToPng(svgPath, pngPath, size);
    console.log(`Generated ${pngPath}`);
  }
  
  // 生成 Windows 托盘图标 (32x32)
  await svgToPng('tray-icon-win.svg', 'tray-icon-win.png', 32);
  console.log('Generated tray-icon-win.png');
  
  // 生成 Windows ICO 文件（使用 sharp 合并多尺寸）
  // ICO 文件需要特殊处理，sharp 本身不支持 ICO，我们先生成各尺寸 PNG
  // 然后使用 Python 的 PIL 来合并
  console.log('PNG files generated. Use PIL to create ICO file.');
  
  // 生成 Windows Store 图标
  const storeIcons = {
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
  };
  
  for (const [filename, size] of Object.entries(storeIcons)) {
    await svgToPng(svgPath, filename, size);
    console.log(`Generated ${filename} (${size}x${size})`);
  }
  
  // 生成通用尺寸的 Windows 图标
  const generalIcons = {
    '32x32-win.png': 32,
    '64x64-win.png': 64,
    '128x128-win.png': 128,
    '256x256-win.png': 256,
  };
  
  for (const [filename, size] of Object.entries(generalIcons)) {
    await svgToPng(svgPath, filename, size);
    console.log(`Generated ${filename} (${size}x${size})`);
  }
  
  console.log('\nPNG files generated. Now creating ICO...');
}

main().catch(console.error);








