# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JSONFormatter is a cross-platform desktop JSON formatting tool built with Tauri v2. The UI is Chinese-language. It supports JSON validation, syntax highlighting, tree view, LaTeX formula rendering, and multiple path copy formats.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm tauri:dev        # Run in development mode (launches Tauri + Vite dev server)
pnpm tauri:build      # Build production app
pnpm build            # Build frontend only (Vite)
pnpm dev              # Run frontend only (Vite dev server on port 5173)
```

### Version Management

Version is tracked in three files that must stay in sync: `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Use the auto-version script to update all three at once:

```bash
pnpm release:patch    # Bump patch version
pnpm release:minor    # Bump minor version
pnpm release:major    # Bump major version
```

### Release

Push a `v*` tag to trigger the GitHub Actions CI/CD pipeline, which builds for macOS (x64 + aarch64) and Windows (x64, with/without WebView2), then publishes to both GitHub Releases and Gitee.

## Architecture

**Tauri v2 split**: Rust backend (`src-tauri/`) handles OS-level concerns (tray menu, window management, autostart, updater). TypeScript frontend (`src/`) handles all JSON processing and UI.

**Frontend** (Vite + jQuery + LayUI):
- `src/main.ts` — App entry point: window controls, theme toggling, view mode switching (editor/split), clipboard integration, update checking, tray event listeners
- `src/utils/jsonTool.ts` — JSON processing engine: tree rendering, LaTeX rendering via KaTeX, path token parsing with multiple export formats (JSONPath, Python `.get()`, bracket notation, custom templates), error context display with line/column info
- `src/lib/layui/` — Vendored LayUI framework (excluded from TypeScript compilation)

**Backend** (`src-tauri/src/main.rs`):
- Tray menu with thread-safe state (`Arc<Mutex>`)
- Tauri commands: `set_always_on_top`, `set_autostart`, `set_update_disabled`, `get_update_disabled`, `get_platform`
- Plugins: window-state, autostart, updater (dual endpoints: Gitee + GitHub), clipboard-manager, process

**Frontend-backend communication**: Frontend calls Rust via `invoke()` for platform operations. Backend emits events to frontend via `emit()` for tray menu interactions. Frontend listens with `listen()`.

**State management**: UI state (theme, view mode, explain flag) lives in `localStorage`. Backend tray menu state uses `Arc<Mutex>` for thread safety. The two sync via Tauri events.

## Key Conventions

- TypeScript strict mode is off (`tsconfig.json`)
- `src/lib/` is excluded from TS compilation — it contains vendored third-party code
- Vite root is `src/`, output goes to `dist/` at project root
- The app uses LayUI's dark theme (`layui-theme-dark`) for dark mode support
- Commit messages and code comments are in Chinese
