import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  root: 'src',                 // 关键：入口在 src 下
  base: './',                  // 打包路径相对，保证 Tauri asset:// 能加载
  server: {
    port: 5173,
    strictPort: true,
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
    // 确保 layui 相关资源能被正确处理
    assetsDir: 'assets'
  },
  optimizeDeps: {
    include: ['jquery'],       // 明确包含需要优化的依赖
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
  // 复制静态资源到 dist 目录
  publicDir: 'lib',
  // 确保 html 中的资源引用能被正确处理
  html: {
    // 启用自动注入，将脚本注入到 body 底部
    inject: {
      injectAt: 'body',
    },
  },
  // 自定义插件，确保 lib 文件夹结构正确
  plugins: [
    {
      name: 'copy-lib-folder',
      writeBundle() {
        const distDir = 'dist';
        const libDir = join(distDir, 'lib');
        
        // 确保 lib 文件夹存在
        if (!existsSync(libDir)) {
          mkdirSync(libDir, { recursive: true });
        }
        
        // 复制 layui 文件夹到 lib 目录下
        const layuiDir = join(distDir, 'layui');
        const targetLayuiDir = join(libDir, 'layui');
        
        if (existsSync(layuiDir)) {
          // 创建 layui 文件夹
          if (!existsSync(targetLayuiDir)) {
            mkdirSync(targetLayuiDir, { recursive: true });
          }
          
          // 复制 layui.js
          copyFileSync(join(layuiDir, 'layui.js'), join(targetLayuiDir, 'layui.js'));
          
          // 复制 css 文件夹
          const cssDir = join(targetLayuiDir, 'css');
          if (!existsSync(cssDir)) {
            mkdirSync(cssDir, { recursive: true });
          }
          copyFileSync(join(layuiDir, 'css', 'layui.css'), join(cssDir, 'layui.css'));
          
          // 复制 font 文件夹
          const fontDir = join(targetLayuiDir, 'font');
          if (!existsSync(fontDir)) {
            mkdirSync(fontDir, { recursive: true });
          }
          const fontFiles = readdirSync(join(layuiDir, 'font'));
          fontFiles.forEach(file => {
            copyFileSync(
              join(layuiDir, 'font', file),
              join(fontDir, file)
            );
          });
        }
      },
    },
  ],
});
