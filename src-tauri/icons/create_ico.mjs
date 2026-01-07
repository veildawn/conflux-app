import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sizes = [16, 24, 32, 48, 64, 256];
const inputs = sizes.map(s => path.join(__dirname, `icon-win-${s}.png`));

// 检查文件是否存在
for (const f of inputs) {
  if (!fs.existsSync(f)) {
    console.error('File not found:', f);
    process.exit(1);
  }
}

const buf = await pngToIco(inputs);
fs.writeFileSync(path.join(__dirname, 'icon-win.ico'), buf);
console.log('Generated icon-win.ico:', buf.length, 'bytes');








