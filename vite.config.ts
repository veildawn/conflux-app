import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },

  // Env variables starting with VITE_ or TAURI_ will be exposed to your source code
  envPrefix: ['VITE_', 'TAURI_'],

  // Path alias
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Build options
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Clear the output directory before building
    emptyOutDir: true,
  },

  clearScreen: false,
});
