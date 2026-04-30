# JSONFormatter 测试策略设计文档

## 概述

为 JSONFormatter 桌面应用建立企业级质量的测试体系，确保功能完整、安全可靠、可维护，并提供完整的用户文档和开发者文档。

## 目标

- 功能完整、无明显 bug
- 性能、安全、可维护性达标
- 完整的用户文档 + 开发者文档
- 本地日志系统（不需要远程监控）
- 发布前充分测试，出问题紧急修复发新版本

## 约束

- 当前开发环境为 Windows 11，macOS 测试后续由用户在 Mac 上执行
- macOS 测试脚本需提前写好，用户可直接运行调试
- 不需要远程监控、使用分析、特殊回滚机制

---

## 1. 测试架构

### 测试金字塔

```
        /\
       /  \  手动测试清单（跨平台、性能、安全）
      /____\
     /      \  E2E 测试（WebdriverIO，关键用户流程）
    /________\
   /          \  单元测试（Jest，核心逻辑）
  /__________\
```

### 分层职责

| 层级 | 框架 | 覆盖范围 | 运行环境 |
|------|------|---------|---------|
| 单元测试 | Jest + ts-jest + jsdom | jsonTool.ts 纯函数逻辑 | Windows + macOS CI |
| E2E 测试 | WebdriverIO + Mocha | 双模式用户流程 | Windows 本地 + macOS 本地 |
| 手动测试 | 清单文档 | 跨平台、性能、安全 | Windows + macOS |

---

## 2. 单元测试设计

### 框架配置

- Jest + ts-jest + jsdom 环境
- 测试文件位置：`src/utils/__tests__/jsonTool.test.ts`
- CSS 模块 mock：identity-obj-proxy
- 目标覆盖率：核心函数 80%+

### 测试用例

#### 路径解析（parsePathTokens / formatKeyPath）

- 对象键解析：`["name"]` → `{type: 'object', value: 'name'}`
- 数组索引解析：`[0]` → `{type: 'array', value: '0'}`
- 混合路径：`["users"][0]["name"]` → 3 个 token
- 5 种格式输出：default, dot, jsonpath, bracket, python
- 自定义格式：键格式 `.{key}`，索引格式 `[{index}]`
- 边界：空路径返回空字符串
- 边界：特殊字符（引号、反斜杠、Unicode）

#### LaTeX 渲染（hasLatex / renderLatexString）

- `hasLatex()` 检测 `$...$` 返回 true
- `hasLatex()` 检测 `$$...$$` 返回 true
- `hasLatex()` 普通文本返回 false
- `renderLatexString()` 行内公式生成 `<span class="latex-inline">`
- `renderLatexString()` 块级公式生成 `<span class="latex-block">`
- `renderLatexString()` 混合文本正确处理
- 错误处理：无效 LaTeX 语法不崩溃，返回原始字符串

#### 错误定位（parseJsonError）

- 提取 Chrome 格式错误消息中的 position
- 提取 Firefox 格式错误消息中的 line/column
- 从 position 计算行号和列号
- 上下文显示：错误行前后各 1 行
- 错误行标记：`→` 前缀
- 错误消息 HTML 转义（XSS 防护验证）

#### 深度限制

- 50 层嵌套正常渲染
- 超过 50 层显示 `[max depth reached]`

---

## 3. E2E 测试设计

### 双模式测试矩阵

| 功能 | 编辑器模式 | 分屏模式 |
|------|-----------|---------|
| JSON 格式化 | `#formatBtn` | `#splitFormatBtn` |
| 粘贴 | `#pasteBtn` | `#splitPasteBtn` |
| 清空 | `#clearBtn` | `#splitClearBtn` |
| 主题切换 | `#themeToggle` | `#splitThemeToggle` |
| 最小化/最大化/关闭 | `#minimize/#maximizeBtn/#close` | `#splitMinimize/#splitMaximize/#splitClose` |
| 置顶 | `#topCheck` (checkbox) | `#splitTopBtn` (button) |
| 转义 | `#explain` (checkbox) | `#splitExplainBtn` (button) |
| 复制格式 | `#copyFormat` (select) | `#splitCopyFormatBtn` (弹窗) |
| TreeView | 无 | `#tree-view` |
| 展开/折叠 | 无 | `#splitExpandAll/#splitCollapseAll` |
| 内容同步 | 切换到分屏时同步 | 切换回编辑器时同步 |

### 测试文件结构

```
tests/specs/
├── 01-basic.spec.js            # 编辑器模式基础功能
├── 02-json-errors.spec.js      # 错误定位（编辑器模式）
├── 03-window-ops.spec.js       # 窗口操作（编辑器模式）
├── 04-view-modes.spec.js       # 模式切换 + 内容同步
├── 05-treeview.spec.js         # TreeView（分屏模式）
├── 06-checkboxes-theme.spec.js # 复选框和主题
├── 07-split-basic.spec.js      # 分屏模式基础功能
├── 08-split-controls.spec.js   # 分屏模式控件
├── 09-clipboard.spec.js        # 剪贴板功能（双模式）
├── 10-large-json.spec.js       # 大 JSON 和边界情况
└── 11-copy-format.spec.js      # 复制格式功能（双模式）
```

### 新增测试场景

#### 07-split-basic.spec.js — 分屏模式基础功能

- 分屏模式输入框可编辑
- 分屏模式格式化正确 JSON
- 分屏模式格式化错误 JSON 显示错误信息
- 分屏模式清空按钮清除输入和 TreeView
- 分屏模式格式化空输入不崩溃

#### 08-split-controls.spec.js — 分屏模式控件

- 分屏模式窗口操作：最小化、最大化、关闭
- 分屏模式置顶按钮切换（active 类名）
- 分屏模式转义按钮切换（active 类名 + TreeView 更新）
- 分屏模式主题切换

#### 09-clipboard.spec.js — 剪贴板功能

- 编辑器模式：粘贴按钮读取剪贴板并格式化
- 分屏模式：粘贴按钮读取剪贴板并格式化
- TreeView 双击 key 复制路径
- TreeView 双击 value 复制值

#### 10-large-json.spec.js — 大 JSON 和边界情况

- 1000+ 键值对 JSON 格式化不崩溃
- 50 层嵌套 JSON 正常渲染
- 超过 50 层显示深度限制提示
- 空 JSON `{}` 和空数组 `[]` 正常处理
- Unicode 字符、emoji 正常显示
- 转义字符（`\n`, `\t`, `\"`）正确处理

#### 11-copy-format.spec.js — 复制格式功能

- 编辑器模式：切换 5 种内置格式
- 分屏模式：复制格式弹窗打开/关闭
- 分屏模式：选择格式后确认
- 自定义格式：设置键格式和索引格式

---

## 4. 跨平台测试策略

### 平台差异风险

| 风险项 | Windows | macOS | 说明 |
|--------|---------|-------|------|
| 窗口最小化恢复 | 正常 | 已修复(32dd6a3) | macOS 需重点验证 |
| 托盘图标 | 正常 | 需验证 | macOS 菜单栏行为不同 |
| 自动更新 | 正常 | 需验证 | 签名机制不同 |
| 文件路径 | `.exe` 后缀 | 无后缀 | E2E 配置已适配 |
| 开机自启 | 注册表 | LaunchAgent | Tauri 插件处理 |

### macOS 测试脚本

提供完整的 macOS E2E 测试脚本，用户在 Mac 上可直接运行：
- `wdio.conf.mjs` 已适配 macOS 二进制路径
- 所有 E2E 测试用例跨平台兼容
- 提供 `scripts/test-macos.sh` 一键运行脚本

### 测试分级

**Tier 1（阻塞发布，双平台必须通过）：**
- 窗口操作：最小化、最大化、还原、置顶、关闭
- 托盘菜单：显示/隐藏窗口、置顶切换、退出
- 自动更新：检查更新流程
- 剪贴板读写

**Tier 2（Windows 优先，macOS 抽查）：**
- JSON 处理逻辑
- UI 渲染（LayUI、KaTeX）
- 主题切换、视图模式

**Tier 3（仅 Windows 验证）：**
- 性能测试（大 JSON）
- 安全测试（XSS、CSP）

---

## 5. 文档设计

### 用户文档（docs/user-guide.md）

1. 快速开始 — 安装、首次启动
2. 功能说明 — 格式化、TreeView、复制格式、LaTeX 渲染
3. 快捷键和技巧 — 双击复制、拖拽分割线
4. 设置选项 — 主题、置顶、开机自启、禁用更新
5. 常见问题 — 更新失败、剪贴板权限、大 JSON 卡顿
6. 故障排查 — 日志位置、重置设置

### 开发者文档（docs/developer-guide.md）

1. 架构概览 — Tauri v2 前后端分离、状态管理
2. 开发环境搭建 — 依赖安装、运行调试
3. 代码结构 — 文件组织、关键模块说明
4. 测试指南 — 运行单元测试、E2E 测试、手动测试清单
5. 发布流程 — 版本管理、构建、发布到 GitHub/Gitee
6. 贡献指南 — 代码规范、提交信息格式、PR 流程

### 手动测试清单（docs/manual-test-checklist.md）

#### Windows 测试清单

- [ ] 窗口操作：最小化、最大化、还原、置顶、关闭
- [ ] 托盘菜单：显示/隐藏、置顶切换、禁用更新、退出
- [ ] JSON 格式化：正确 JSON、错误 JSON、空输入
- [ ] TreeView：展开/折叠、深层嵌套、LaTeX 渲染
- [ ] 剪贴板：粘贴、复制路径（5 种格式）、复制值
- [ ] 主题切换：白天/夜间、刷新后持久化
- [ ] 视图模式：编辑器 ↔ 分屏切换、内容同步
- [ ] 性能：10MB JSON 渲染时间 < 3 秒
- [ ] 安全：XSS 测试（恶意 JSON）、CSP 生效验证
- [ ] 更新：检查更新、下载安装

#### macOS 测试清单

- [ ] 同上所有项目
- [ ] 窗口最小化后恢复（macOS 特有问题）
- [ ] 托盘图标在菜单栏正确显示
- [ ] Apple Silicon 和 Intel 芯片兼容性
- [ ] macOS 暗色模式与应用主题联动

---

## 6. 交付物清单

### 代码交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `jest.config.js` | 新增 | Jest 配置 |
| `src/utils/__tests__/jsonTool.test.ts` | 新增 | 单元测试 |
| `tests/specs/07-split-basic.spec.js` | 新增 | 分屏基础 E2E |
| `tests/specs/08-split-controls.spec.js` | 新增 | 分屏控件 E2E |
| `tests/specs/09-clipboard.spec.js` | 新增 | 剪贴板 E2E |
| `tests/specs/10-large-json.spec.js` | 新增 | 大 JSON E2E |
| `tests/specs/11-copy-format.spec.js` | 新增 | 复制格式 E2E |
| `scripts/test-macos.sh` | 新增 | macOS 一键测试脚本 |
| `package.json` | 修改 | 新增 test 脚本和 Jest 依赖 |

### 文档交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `docs/user-guide.md` | 新增 | 用户使用手册 |
| `docs/developer-guide.md` | 新增 | 开发者文档 |
| `docs/manual-test-checklist.md` | 新增 | 手动测试清单 |

