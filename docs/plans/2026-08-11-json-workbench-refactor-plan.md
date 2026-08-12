# JSON Workbench Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持现有功能和 Tauri 行为稳定的前提下，统一 JSON 解析与渲染数据流，持续删除重复代码，并最终收敛为单输入源的 JSON 工作台。

**Architecture:** 先建立独立解析状态和单向渲染管线，让现有编辑器/分屏界面共享同一入口；再拆分设置、更新和托盘服务；最后按已有设计合并重复输入框与工具栏。每个阶段都以真实 Tauri E2E 为准入条件，禁止跨阶段累计未验证修改。

**Tech Stack:** Tauri v2、TypeScript、Vite、jQuery、LayUI、WebdriverIO、Rust Clippy

---

## Current Baseline

- Tauri E2E：113 项、Playwright 47 项、浏览器自测 35 项全部通过；前端单元测试 176 项全部通过，语句覆盖率 97.34%、分支覆盖率 92.53%。
- `jsonTool.ts` 已拆出树渲染、图片/HTML 预览、路径格式、错误定位和 LaTeX 模块。
- `main.ts` 已拆出解析、工作台状态、设置、更新和托盘监听，仍混合搜索、主题和事件绑定。
- 分屏支持 `JSON Str` 和“富内容”两个复选框，但命名需要明确：
  - `JSON Str` 只在最外层 JSON 值是字符串时，再解析一次字符串内部的 JSON。
  - “富内容”只预览字符串值中的 Base64 图片和沙箱 HTML（如图片、表格），不会递归解析 JSON 字段，也不会执行脚本。

## Main Risks

1. ~~分屏设置切换会重复解析和重复渲染。~~ 已由解析缓存和单一格式化路径解决。
2. 两个 textarea 和两个校验区域仍需在迁移期同步，但源内容已统一到 `WorkbenchController`。
3. ~~`isExplainEnabled` 与 DOM checkbox 重复保存状态。~~ 已删除，渲染选项改为显式参数。
4. ~~托盘取消监听函数未集中管理。~~ 已由 `TrayController` 统一注册、回滚、释放并捕获异步处理异常。
5. ~~更新流程和存储逻辑直接混在入口文件。~~ 已拆为 `UpdateService` 与 `SettingsStore`；窗口关闭和拖动错误也已收口。
6. ~~富内容 iframe 缺少完整的恶意内容和大小边界验证。~~ 已增加空 sandbox、严格 CSP、危险内容、无效图片和大小限制测试。
7. ~~Jest 将 E2E 负责的 UI 模块计入单元覆盖率，导致覆盖率门槛失真。~~ 已按纯逻辑与 Tauri E2E 分层统计，并补齐错误扫描器测试。

## Visual Compatibility Gate

- 冻结 `v0.1.22`（提交 `6980b7f`）作为合并前的外观与交互基线。
- Task 2、Task 3 不允许修改 `src/index.html`、样式文件或 `src-tauri/tauri.conf.json`；当前审计无这些差异。
- 开始 Task 5 前，固定窗口尺寸和测试数据，保存编辑器/分屏模式在明暗主题下的四组基线截图。
- 结构重构与视觉改版必须分开提交。未明确批准的字体、间距、颜色、窗口尺寸和控件位置变化一律视为回归。
- 截图比较之外继续保留 Tauri E2E；只有视觉基线和功能测试同时通过，才能合并双视图。

### Task 1: Correct Feature Names and Lock the Split-Mode Contract

**Files:**
- Modify: `src/index.html`
- Modify: `tests/specs/01-basic.spec.js`
- Modify: `tests/specs/06-checkboxes-theme.spec.js`
- Modify: `tests/specs/07-content-rendering.spec.js`

**Step 1: Write failing split-mode tests**

- 在分屏输入一个双重编码 JSON 字符串。
- 勾选 `#splitParseJsonString`，断言树中出现内部对象。
- 同时勾选 `#splitRenderHtml`，断言内部字符串里的表格或图片可预览。
- 断言关闭 JSON 文本解析后，外层字符串保持字符串，不递归修改对象字段。

**Step 2: Run the targeted tests**

Run:

```bash
WDIO_GREP='JSON 文本|富内容' $HOME/.nvm/versions/node/v24.12.0/bin/node scripts/run-tauri-e2e.mjs
```

Expected: 新增行为测试在文案或分屏链路不完整处失败，现有图片测试保持通过。

**Step 3: Correct the UI copy**

- 主界面标题改为“解析 JSON 文本（JSON Str）”。
- 分屏短标签改为“JSON 文本”。
- tooltip 明确说明“仅解析最外层 JSON 字符串一次”。
- “富内容”tooltip 明确说明“沙箱预览图片和表格，不执行脚本”。
- ID 和存储语义保持不变，避免无意义迁移。

**Step 4: Run tests and static checks**

Run:

```bash
pnpm exec tsc --noEmit
pnpm build
```

Expected: 全部通过。

**Step 5: Commit checkpoint**

Suggested commit: `test: define split json text and rich content behavior`

### Task 2: Introduce a Single JSON Parse Pipeline（已完成）

**Files:**
- Create: `src/utils/jsonParser.ts`
- Modify: `src/main.ts`
- Test: `tests/specs/01-basic.spec.js`
- Test: `tests/specs/02-json-errors.spec.js`
- Test: `tests/specs/04-view-modes.spec.js`

**Step 1: Add parser contract tests**

Cover empty input, 5 MB limit, normal JSON, top-level primitive, one-layer JSON text parsing, invalid inner JSON, and invalid outer JSON.

**Step 2: Implement a pure parser result**

Use a discriminated result instead of UI-side exceptions:

```ts
export type JsonParseResult =
  | { ok: true; value: unknown; formatted: string }
  | { ok: false; kind: 'empty' | 'too-large' | 'invalid'; error?: Error };

export function parseJsonSource(
  source: string,
  options: { parseJsonString: boolean; maxSize: number }
): JsonParseResult;
```

The function parses the outer value once and, only when enabled and the result is a string, parses one inner layer.

**Step 3: Route all parsing through the module**

- Replace `parseJsonInput()` and duplicated size checks.
- Make format, live tree refresh, paste, view switch and checkbox refresh use the same result.
- Keep user-facing error formatting in `jsonError.ts`.

**Step 4: Verify targeted and full regression**

Run:

```bash
WDIO_GREP='基础 JSON|JSON 错误|最新内容' $HOME/.nvm/versions/node/v24.12.0/bin/node scripts/run-tauri-e2e.mjs
```

Expected: all targeted tests pass.

**Step 5: Commit checkpoint**

Suggested commit: `refactor: centralize json parsing pipeline`

### Task 3: Replace Duplicate Rendering With Workbench State（已完成）

**Files:**
- Create: `src/utils/workbenchController.ts`
- Modify: `src/main.ts`
- Test: `tests/specs/04-view-modes.spec.js`
- Test: `tests/specs/07-content-rendering.spec.js`

**Step 1: Add a render-count regression test**

Expose a test-only counter or observable render event in WebDriver builds. Toggle explain, JSON text, and rich content once; assert each action causes one parse and one active-view render.

**Step 2: Introduce explicit state**

```ts
interface WorkbenchState {
  source: string;
  parsed?: unknown;
  error?: Error;
  mode: 'editor' | 'split';
  parseJsonString: boolean;
  richContent: boolean;
  explain: boolean;
}
```

**Step 3: Implement one update path**

- `setSource()` updates the canonical state and mirrors legacy inputs during migration.
- `parse()` runs once per source/options change.
- `renderActiveView()` updates only the visible result.
- Remove every `formatJson(); refreshTreeView();` pair.
- Remove the standalone `isExplainEnabled` variable.

**Step 4: Verify stale debounce protection**

Rapidly type two valid payloads and assert only the latest tree is rendered.

**Step 5: Commit checkpoint**

Suggested commit: `refactor: add single workbench state flow`

### Task 4: Extract Settings, Update, and Tray Services（已完成）

**Files:**
- Create: `src/utils/settingsStore.ts`
- Create: `src/utils/updateService.ts`
- Create: `src/utils/trayController.ts`
- Modify: `src/main.ts`
- Test: `tests/specs/03-window-ops.spec.js`
- Test: `tests/specs/06-checkboxes-theme.spec.js`

**Step 1: Extract typed settings storage**

Centralize theme, layout, disabled-update and future preferences. Storage failures must return defaults without breaking startup.

**Step 2: Extract update behavior**

Move updater calls, release-note escaping, download/install and relaunch into `updateService.ts`. Keep the LayUI dialog adapter injectable.

**Step 3: Extract tray listeners with cleanup**

Store every `listen()` unsubscriber and expose `dispose()`. Reinitialization must dispose previous listeners first.

**Step 4: Harden async window operations**

Handle close, drag, show, hide and focus promise failures consistently. Do not swallow errors silently.

**Step 5: Run Rust and Tauri checks**

Run:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --features webdriver --all-targets -- -D warnings
$HOME/.nvm/versions/node/v24.12.0/bin/node scripts/run-tauri-e2e.mjs
```

Expected: all checks pass.

**Step 6: Commit checkpoint**

Suggested commit: `refactor: isolate settings updater and tray services`

### Task 5: Merge the Two UI Modes Into One Workbench

**Files:**
- Modify: `src/index.html`
- Modify: `src/main.ts`
- Modify: `src/utils/workbenchController.ts`
- Modify: `tests/helpers/utils.js`
- Modify: `tests/specs/04-view-modes.spec.js`
- Modify: `tests/specs/07-content-rendering.spec.js`

**Step 1: Add the unified-workbench E2E contract**

Assert one editable textarea, one validation state, one toolbar, and result tabs for tree/highlight. Desktop uses two columns; narrow width uses panel switching.

**Step 2: Keep one source input**

Remove `#splitSourceText` after all actions use `WorkbenchState.source`. Migrate the old view-mode preference once.

**Step 3: Merge result views**

Place tree and highlighted output in one result panel with tabs. Switching result tabs must not parse again or change source.

**Step 4: Remove duplicate controls**

Keep one format, paste, clear, theme, update, minimize, maximize and close control set. Preserve keyboard and drag-region behavior.

**Step 5: Verify desktop and narrow layouts**

Run the full Tauri suite at the normal window size, then add a narrow-window UI assertion for panel switching.

**Step 6: Commit checkpoint**

Suggested commit: `refactor: unify editor and result workspace`

### Task 6: Security and Performance Hardening（已完成）

**Files:**
- Modify: `src/utils/contentPreview.ts`
- Modify: `src/utils/treeRenderer.ts`
- Modify: `tests/fixtures/json-cases.js`
- Modify: `tests/specs/07-content-rendering.spec.js`

**Step 1: Expand hostile-content fixtures**

Cover script tags, event attributes, `javascript:` URLs, malformed Data URLs, oversized HTML strings, SVG payloads, deep nesting and large flat objects.

**Step 2: Define preview limits**

Reject or text-render oversized rich content before creating an iframe. Keep sandbox empty and CSP restrictive. Do not add `allow-scripts` or same-origin permissions.

**Step 3: Add depth protection**

Measure deeply nested input behavior. If recursion can overflow, replace recursive descent with an explicit stack or show a bounded-depth continuation control.

**Step 4: Measure large-tree behavior**

Keep the 500-item batch contract and add timing assertions for large arrays and large objects without using brittle fixed sleeps.

**Step 5: Commit checkpoint**

Suggested commit: `test: harden rich content and large json boundaries`

**Completion record:**

- HTML 预览最大 256KB；图片预览最大 4MB，只接受签名与声明 MIME 一致的 PNG、JPEG、GIF、WebP、BMP 和 ICO。
- JSON 输入最大 5MB，解析深度最大 100 层；树形视图展示深度最大 50 层。
- 会被 JavaScript 静默改写的数字会明确报错；编辑器超过 10,000 个节点时引导切换到分屏按需加载。
- 树形首屏使用全局 500 项预算，平面集合保持每批 500 项，未加载的大型分支不会被“展开全部”强制实例化。
- 176 项 Jest 单元测试、47 项 Playwright、113 项真实 Tauri E2E、35 项浏览器自测、TypeScript、Vite build、rustfmt 和 Clippy 全部通过。

## Required Gate After Every Task

Run:

```bash
pnpm exec tsc --noEmit
pnpm build
git diff --check
rustfmt --edition 2021 --check src-tauri/src/main.rs
cargo clippy --manifest-path src-tauri/Cargo.toml --features webdriver --all-targets -- -D warnings
$HOME/.nvm/versions/node/v24.12.0/bin/node scripts/run-tauri-e2e.mjs
```

Acceptance:

- No skipped product assertions.
- WebDriver infrastructure retries are allowed only for the known plugin lock failure signatures.
- No listener, Vite, WebDriver or Tauri process remains after the run.
- Do not start the next task while the current task has an unexplained failure.
