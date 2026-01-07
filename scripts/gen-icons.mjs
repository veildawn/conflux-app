import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ICONS_DIR = path.join('src-tauri', 'icons');
const SOURCE_WIN_SVG = path.join(ICONS_DIR, 'icon-win.svg');
const SOURCE_WIN_PNG = path.join(ICONS_DIR, 'icon-win.png');
const SOURCE_STD_SVG = path.join(ICONS_DIR, 'icon.svg');
const SOURCE_STD_PNG = path.join(ICONS_DIR, 'icon.png');

// Helper to run shell commands
const run = (cmd) => {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
};

// Helper to move/rename files
const move = (src, dest) => {
  const srcPath = path.join(ICONS_DIR, src);
  const destPath = path.join(ICONS_DIR, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Updated ${dest}`);
  }
};

console.log('🔄 Starting icon generation...');

// 1. Generate Windows-specific icons
// Priority: icon-win.svg > icon-win.png > fallback to standard source
let winSource = null;
if (fs.existsSync(SOURCE_WIN_SVG)) winSource = 'icon-win.svg';
else if (fs.existsSync(SOURCE_WIN_PNG)) winSource = 'icon-win.png';

if (winSource) {
  console.log(`\n🪟 Generating Windows icons from ${winSource}...`);
  // Backup standard icon.png if we are using a png source that might conflict,
  // but since we prefer SVG, conflict is unlikely. 
  // However, tauri icon might overwrite icon.png even if source is svg.
  // Let's backup icon.png just in case.
  const iconPngPath = path.join(ICONS_DIR, 'icon.png');
  const iconPngBackup = path.join(ICONS_DIR, 'icon.png.bak_temp');
  if (fs.existsSync(iconPngPath)) {
    fs.copyFileSync(iconPngPath, iconPngBackup);
  }

  run(`pnpm tauri icon "${path.join(ICONS_DIR, winSource)}"`);

  // Move generated files to -win variants
  move('icon.ico', 'icon-win.ico');
  move('32x32.png', '32x32-win.png');
  move('128x128.png', '128x128-win.png');
  move('128x128@2x.png', '256x256-win.png');
  // Also copy square logos if needed, but Windows config mainly uses the above.
  
  // Restore icon.png
  if (fs.existsSync(iconPngBackup)) {
    fs.copyFileSync(iconPngBackup, iconPngPath);
    fs.unlinkSync(iconPngBackup);
  }
} else {
  console.log('\n🪟 No specific Windows source found. Will use standard icons for Windows.');
}

// 2. Generate Standard icons (macOS/Linux)
// Priority: icon.svg > icon.png
let stdSource = 'icon.png';
if (fs.existsSync(SOURCE_STD_SVG)) stdSource = 'icon.svg';

console.log(`\n🍎/🐧 Generating standard icons from ${stdSource}...`);
run(`pnpm tauri icon "${path.join(ICONS_DIR, stdSource)}"`);

// If we didn't have a specific Windows source, copy the standard ones to -win
if (!winSource) {
  console.log('\n🪟 Syncing standard icons to Windows variants...');
  move('icon.ico', 'icon-win.ico');
  move('32x32.png', '32x32-win.png');
  move('128x128.png', '128x128-win.png');
  move('128x128@2x.png', '256x256-win.png');
}

console.log('\n✅ Icon generation complete!');







