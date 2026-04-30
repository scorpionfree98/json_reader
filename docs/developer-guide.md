# JSONFormatter 开发者指南

## 1. 项目概述

JSONFormatter 是基于 Tauri v2 构建的跨平台桌面 JSON 格式化工具。前端使用 TypeScript + jQuery + LayUI,后端使用 Rust。项目采用前后端分离架构:Rust 后端处理系统级操作,TypeScript 前端负责所有 JSON 处理逻辑和 UI 交互。

## 2. 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|-----------|
| 构建工具 | Vite | 前端打包,根目录为 `src/`,输出到 `dist/` |
| 前端语言 | TypeScript | 严格模式关闭 (`tsconfig.json`) |
| UI 框架 | LayUI | 含深色主题 (`layui-theme-dark`),以 vendor 形式引入 |
| DOM 操作 | jQuery | 事件处理和 DOM 操作 |
| 公式渲染 | KaTeX | LaTeX 数学公式渲染 |
| 后端语言 | Rust | 系统级操作、托盘菜单、窗口管理 |
| 跨平台框架 | Tauri v2 | 前后端通信、插件系统 |
| 包管理 | pnpm | Node.js 依赖管理 |

## 3. 开发环境配置

### 3.1 前置依赖

**Node.js 环境:**
- Node.js 18 或更高版本
- pnpm 包管理器

```bash
# 安装 pnpm
npm install -g pnpm
```

**Rust 环境:**
- Rust 1.70 或更高版本
- 通过 rustup 安装

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Tauri CLI:**
```bash
# 通过 cargo 安装
cargo install tauri-cli
```

**平台特定依赖:**

Windows:
- Visual Studio Build Tools 或 Visual Studio(含 C++ 工作负载)
- WebView2(Windows 10 通常已内置)

macOS:
- Xcode Command Line Tools: `xcode-select --install`

### 3.2 初始化项目

```bash
# 克隆仓库
git clone <repo-url>
cd json_reader

# 安装 Node.js 依赖
pnpm install
```

### 3.3 开发命令

```bash
pnpm tauri:dev        # 启动开发模式(Tauri + Vite 热重载)
pnpm tauri:build      # 构建生产版本
pnpm build            # 仅构建前端(Vite)
pnpm dev              # 仅启动前端开发服务器(端口 5173)
pnpm test:unit        # 运行单元测试
pnpm test:unit:coverage  # 运行单元测试并生成覆盖率报告
pnpm test:e2e         # 运行 E2E 测试
```

## 4. 项目结构

```
json_reader/
├── src/                        # 前端源码(Vite 根目录)
│   ├── main.ts                 # 应用入口:窗口控制、主题、视图模式、剪贴板、更新、托盘事件
│   ├── utils/
│   │   └── jsonTool.ts         # JSON 处理引擎:树渲染、LaTeX、路径解析、错误显示
│   ├── lib/
│   │   └── layui/              # Vendored LayUI 框架(排除在 TS 编译之外)
│   └── index.html              # 应用 HTML 入口
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   └── main.rs             # 托盘菜单、Tauri 命令、插件注册
│   ├── Cargo.toml              # Rust 依赖和版本
│   └── tauri.conf.json         # Tauri 配置(窗口、权限、更新端点)
├── tests/                      # 测试文件
│   ├── unit/                   # Jest 单元测试
│   └── e2e/                    # WebdriverIO E2E 测试
├── scripts/                    # 辅助脚本
│   ├── version.js              # 版本同步脚本
│   └── test-macos.sh           # macOS 跨平台测试脚本
├── docs/                       # 项目文档
├── dist/                       # 前端构建输出(gitignore)
├── package.json                # Node.js 项目配置和版本
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 构建配置
└── CLAUDE.md                   # AI 助手项目指引
```

## 5. 核心模块

### 5.1 jsonTool.ts — JSON 处理引擎

位置:`src/utils/jsonTool.ts`

**主要职责:**

**JSON 处理与树渲染**
- 解析 JSON 并递归构建树形 DOM 结构
- 支持对象、数组、字符串、数字、布尔、null 等所有 JSON 类型
- 通过 `MAX_RENDER_DEPTH` 常量限制最大渲染深度,防止栈溢出
- 使用 `escapeHtml()` 对所有用户数据进行 XSS 转义

**LaTeX 渲染**
- 检测字符串值中的 `$...$`(行内)和 `$$...$$`(块级)LaTeX 语法
- 调用 KaTeX 库进行渲染
- 渲染失败时优雅降级,显示原始文本

**路径解析与导出**
- 追踪从根节点到当前节点的完整路径
- 支持 6 种路径格式:
  - `default` — 混合点号和括号
  - `dot` — 全点号分隔
  - `jsonpath` — 标准 JSONPath (`$.key[0]`)
  - `bracket` — 全括号 (`["key"][0]`)
  - `python` — Python `.get()` 链式调用
  - `custom` — 用户自定义模板,支持 `{key}` 和 `{index}` 占位符

**错误显示**
- 解析 JSON 语法错误,提取行号和列号
- 显示错误位置附近的代码上下文片段

### 5.2 main.ts — 应用入口

位置:`src/main.ts`

**主要职责:**

**窗口控制**
- 自定义标题栏:最小化、最大化/还原、关闭按钮
- 窗口置顶:调用 Rust 命令 `set_always_on_top`

**主题管理**
- 深色/浅色主题切换
- 通过 `localStorage` 持久化主题偏好
- 切换 LayUI 的 `layui-theme-dark` CSS 类

**视图模式**
- 编辑器模式和分屏模式切换
- 通过 `localStorage` 持久化视图模式

**剪贴板集成**
- 调用 Tauri clipboard-manager 插件
- 支持粘贴和复制操作

**自动更新**
- 调用 Tauri updater 插件检查更新
- 显示更新对话框并处理用户确认

**托盘事件监听**
- 通过 `listen()` 接收后端发出的托盘菜单事件
- 处理显示/隐藏、置顶、自启动等状态同步

### 5.3 main.rs — Rust 后端

位置:`src-tauri/src/main.rs`

**主要职责:**

**托盘菜单**
- 创建系统托盘图标和右键菜单
- 使用 `Arc<Mutex>` 管理线程安全的菜单状态
- 菜单项状态变更时通过 `emit()` 通知前端

**Tauri 命令**

| 命令 | 功能 |
|------|------|
| `set_always_on_top` | 设置窗口置顶状态 |
| `set_autostart` | 配置开机自启动 |
| `set_update_disabled` | 禁用/启用更新检查 |
| `get_update_disabled` | 获取更新禁用状态 |
| `get_platform` | 返回当前操作系统平台 |

**插件注册**
- `window-state` — 持久化窗口位置和大小
- `autostart` — 管理开机自启动
- `updater` — 双端点更新(Gitee + GitHub)
- `clipboard-manager` — 剪贴板访问
- `process` — 应用退出控制

## 6. 测试策略

### 6.1 单元测试

使用 Jest 框架,测试文件位于 `tests/unit/`。

```bash
# 运行所有单元测试
pnpm test:unit

# 运行测试并生成覆盖率报告
pnpm test:unit:coverage
```

**测试覆盖范围:**
- JSON 解析和格式化逻辑
- 路径格式转换函数
- `escapeHtml` 安全函数
- LaTeX 检测逻辑
- 错误信息解析

### 6.2 E2E 测试

使用 WebdriverIO 框架,测试文件位于 `tests/e2e/`。

```bash
# 运行 E2E 测试(需要先构建应用)
pnpm test:e2e
```

**测试覆盖范围:**
- 应用启动和窗口显示
- JSON 输入和格式化流程
- 树形视图交互
- 主题切换
- 视图模式切换

### 6.3 跨平台测试

```bash
# macOS 跨平台测试脚本
bash scripts/test-macos.sh
```

该脚本在 macOS 环境下运行完整的功能测试套件,验证 Intel 和 Apple Silicon 的兼容性。

## 7. 版本管理

版本号在以下三个文件中保持同步:
- `package.json` — `version` 字段
- `src-tauri/Cargo.toml` — `[package] version` 字段
- `src-tauri/tauri.conf.json` — `version` 字段

**使用自动化脚本更新版本:**

```bash
pnpm release:patch    # 补丁版本 (x.x.X)
pnpm release:minor    # 次要版本 (x.X.0)
pnpm release:major    # 主要版本 (X.0.0)
```

脚本 `scripts/version.js` 会同步更新所有三个文件,确保版本一致性。

## 8. 发布流程

1. **更新版本号**
   ```bash
   pnpm release:patch  # 或 minor/major
   ```

2. **提交版本变更**
   ```bash
   git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
   git commit -m "chore: 发布 vX.X.X"
   ```

3. **创建并推送版本标签**
   ```bash
   git tag vX.X.X
   git push origin main --tags
   ```

4. **CI/CD 自动构建**
   推送 `v*` 标签后,GitHub Actions 自动触发:
   - macOS x64 构建
   - macOS aarch64 (Apple Silicon) 构建
   - Windows x64 构建(含/不含 WebView2)
   - 发布到 GitHub Releases
   - 发布到 Gitee

## 9. 安全最佳实践

### XSS 防护

所有来自用户输入或 JSON 数据的字符串在插入 DOM 之前必须经过 `escapeHtml()` 处理:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**重要:** 禁止对用户数据使用 `.html()` 或 `innerHTML`,必须使用 `.text()` 或先转义再使用 `.html()`。

### 内容安全策略 (CSP)

`tauri.conf.json` 中配置了 CSP 头,限制脚本和资源加载来源。修改 CSP 时需谨慎评估安全影响。

### 渲染深度限制

`MAX_RENDER_DEPTH` 常量限制树形视图的最大渲染深度,防止恶意构造的深层嵌套 JSON 导致栈溢出或性能问题。

### 错误信息安全

错误提示中显示的 JSON 上下文片段同样需要经过 XSS 转义处理。

## 10. 贡献指南

### 工作流程

1. Fork 仓库
2. 从 `main` 分支创建功能分支:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. 编写代码和测试
4. 确保所有测试通过:
   ```bash
   pnpm test:unit
   ```
5. 提交代码(遵循提交信息规范)
6. 创建 Pull Request

### 提交信息规范

提交信息使用中文,格式为 `<类型>: <描述>`:

| 类型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 构建、依赖、版本等杂项 |
| `refactor` | 代码重构(不影响功能) |
| `perf` | 性能优化 |

**示例:**
```
feat: 添加 JSON 差异对比功能
fix: 修复 TreeView 深层嵌套时的渲染问题
docs: 更新开发者指南中的测试章节
test: 添加路径格式转换的边界情况测试
chore: 升级 KaTeX 到 0.16.x
```

### 代码规范

- TypeScript 严格模式关闭,但应尽量添加类型注解
- 新增功能需同步添加单元测试
- 涉及用户数据的地方必须进行 XSS 转义
- 代码注释使用中文
