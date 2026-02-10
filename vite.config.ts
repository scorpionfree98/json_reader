import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',                 // 关键：入口在 src 下
  base: './',                  // 打包路径相对，保证 Tauri asset:// 能加载
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: '../dist',         // 打包到项目根目录下的 dist，而不是 src/dist
    emptyOutDir: true,         // 清空 dist 目录，避免旧文件残留
    minify: 'esbuild',         // 启用代码压缩，生产环境特性
    sourcemap: false,          // 禁用 Source Maps，生产环境特性
    rollupOptions: {
      output: {
        manualChunks: {
          // 启用代码分割，将第三方库单独打包
          'vendor': ['jquery'],
        },
        format: 'es',             // 保持 ES 模块格式一致
      }
    },
    assetsDir: 'assets'
  },
  optimizeDeps: {
    include: ['jquery', 'layui'],       // 明确包含需要优化的依赖
    esbuildOptions: {
      target: 'ES2020',        // 确保开发和生产环境的目标一致
    }
  },
  css: {
    devSourcemap: false,       // 生产环境不生成 CSS Source Maps
  },
  esbuild: {
    drop: ['debugger'],        // 删除调试代码，生产环境特性
  },
});
