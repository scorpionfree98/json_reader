# Tauri v2 重构模板

这个目录已经把 **系统托盘**、**记住窗口尺寸**、**自动更新**、**开机自启**、**切换置顶** 等能力配齐，
并把 `a-tauri.html` 的内联脚本抽离到了 `src/main.ts`。

## 开发
```bash
pnpm i   # 或 npm/yarn/bun
pnpm tauri:dev
```

## 打包
```bash
pnpm tauri:build
```

## 文件结构
- `src/a-tauri.html` — 由你的 `a.html` 生成，已移除内联 `<script>` 并引入 `src/main.ts`
- `src/main.ts` — 前端入口（窗口状态/更新/托盘事件/开机自启/剪贴板）
- `src/utils/jsonTool.ts` — 由你的 `a.js` 生成（已 `export`）
- `src-tauri/` — Tauri v2 工程（系统托盘、插件初始化、权限）

> 注意：自动更新需要你在 `src-tauri/tauri.conf.json` 中配置 `plugins.updater.pubkey` 和 `endpoints`，并在 CI 里生成 Updater artifacts。
