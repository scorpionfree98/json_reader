import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',                 // 关键：入口在 src 下
  base: './',                  // 打包路径相对，保证 Tauri asset:// 能加载
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../dist',         // 打包到项目根目录下的 dist，而不是 src/dist
    emptyOutDir: true          // 清空 dist 目录，避免旧文件残留
  }
});