# JSON Workbench Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持现有功能和 Tauri 行为稳定的前提下，统一 JSON 解析与渲染数据流，持续删除重复代码，并最终收敛为单输入源的 JSON 工作台。

**Architecture:** 先建立独立解析状态和单向渲染管线，让现有编辑器/分屏界面共享同一入口；再拆分设置、更新和托盘服务；最后按已有设计合并重复输入框与工具栏。每个阶段都以真实 Tauri E2E 为准入条件，禁止跨阶段累计未验证修改。

**Tech Stack:** Tauri v2、TypeScript、Vite、jQuery、LayUI、WebdriverIO、Rust Clippy

---

## Current Baseline

- Tauri E2E：70 项全部通过。
- `jsonTool.ts` 已拆出树渲染、图片/HTML 预览、路径格式、错误定位和 LaTeX 模块。
- `main.ts` 仍有约 897 行，混合输入状态、解析、主题、设置、更新、托盘和事件绑定。
- 分屏支持 `JSON Str` 和“富内容”两个复选框，但命名需要明确：
  - `JSON Str` 只在最外层 JSON 值是字符串时，再解析一次字符串内部的 JSON。
  - “富内容”只预览字符串值中的 Base64 图片和沙箱 HTML（如图片、表格），不会递归解析 JSON 字段，也不会执行脚本。

## Main Risks

1. 分屏设置切换会先调用 `formatJson()`，再调用 `refreshTreeView()`，导致同一内容重复解析和重复渲染。
2. `sourceContent`、两个 textarea、两个校验区域和多个复选框分别同步，新增功能容易漏掉其中一条路径。
3. `isExplainEnabled` 与 DOM checkbox 重复保存同一状态，可能发生状态分叉。
4. 托盘 `listen()` 返回的取消监听函数未集中管理，开发热更新或重复初始化时存在重复监听风险。
5. 更新、窗口、自动启动和 UI 弹窗仍直接混在入口文件，错误处理和测试边界不清晰。
6. 富内容 iframe 虽有空 sandbox 和 CSP，但仍需补充内容长度、危险协议和无效图片的边界测试。

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

### Task 2: Introduce a Single JSON Parse Pipeline

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

### Task 3: Replace Duplicate Rendering With Workbench State

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

### Task 4: Extract Settings, Update, and Tray Services

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

### Task 6: Security and Performance Hardening

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
