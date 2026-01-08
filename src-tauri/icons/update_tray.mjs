import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, 'tray-icon-win.svg');
const svgBuffer = fs.readFileSync(svgPath);

// 生成 256x256 的高清托盘图标
await sharp(svgBuffer)
  .resize(256, 256)
  .png()
  .toFile(path.join(__dirname, 'tray-icon-win.png'));

console.log('Generated tray-icon-win.png (256x256)');

// 验证
const img = await sharp(path.join(__dirname, 'tray-icon-win.png')).metadata();
console.log('Verified:', img.width, 'x', img.height);









