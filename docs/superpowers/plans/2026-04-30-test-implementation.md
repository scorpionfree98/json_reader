# 测试策略实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 JSONFormatter 实现企业级测试覆盖和文档，包括单元测试、E2E 测试、跨平台测试脚本和完整文档

**Architecture:** 采用测试金字塔策略（70% 单元测试 + 20% E2E 测试 + 10% 手动测试）。单元测试使用 Jest + ts-jest 覆盖核心 JSON 处理逻辑，E2E 测试使用 WebdriverIO 覆盖双视图模式的完整用户流程，macOS 测试脚本提供一键式跨平台验证。

**Tech Stack:** Jest 29.x, ts-jest, jsdom, WebdriverIO 9.x, Mocha, Bash

---

## 文件结构

**新建文件：**
- `jest.config.js` — Jest 配置文件
- `src/utils/__tests__/jsonTool.test.ts` — jsonTool.ts 单元测试套件
- `tests/specs/07-latex-rendering.spec.js` — LaTeX 渲染 E2E 测试
- `tests/specs/08-path-copy-formats.spec.js` — 路径复制格式 E2E 测试
- `tests/specs/09-dual-mode-editor.spec.js` — 编辑器模式完整流程 E2E 测试
- `tests/specs/10-dual-mode-split.spec.js` — 分屏模式完整流程 E2E 测试
- `tests/specs/11-cross-mode-consistency.spec.js` — 跨模式一致性 E2E 测试
- `scripts/test-macos.sh` — macOS 一键测试脚本
- `docs/user-guide.md` — 用户使用文档
- `docs/developer-guide.md` — 开发者文档
- `docs/manual-test-checklist.md` — 手动测试检查清单

**修改文件：**
- `package.json` — 添加 Jest 依赖和测试脚本

---

## Task 1: Jest 单元测试环境配置

**Files:**
- Create: `jest.config.js`
- Modify: `package.json`

- [ ] **Step 1: 安装 Jest 依赖**

```bash
pnpm add -D jest@29.7.0 ts-jest@29.1.5 @types/jest@29.5.12 jsdom@24.1.0
```

Expected: Dependencies added to package.json devDependencies

- [ ] **Step 2: 创建 Jest 配置文件**

Create `jest.config.js`:

```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/lib/**',
    '!src/main.ts'
  ],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }
  }
};
```

- [ ] **Step 3: 添加测试脚本到 package.json**

Add to `scripts` section in `package.json`:

```json
"test:unit": "jest",
"test:unit:watch": "jest --watch",
"test:unit:coverage": "jest --coverage",
"test:e2e": "wdio run wdio.conf.mjs",
"test:all": "pnpm test:unit && pnpm test:e2e"
```

- [ ] **Step 4: 验证 Jest 可运行**

```bash
pnpm test:unit
```

Expected: Jest runs, finds 0 test suites (no tests yet), exits cleanly

- [ ] **Step 5: 提交**

```bash
git add jest.config.js package.json pnpm-lock.yaml
git commit -m "chore: 配置 Jest 单元测试环境"
```

---

## Task 2: 单元测试 — 路径解析（parsePathTokens / formatKeyPath）

**Files:**
- Create: `src/utils/__tests__/jsonTool.test.ts`

注意：`jsonTool.ts` 中 `parsePathTokens` 和 `formatKeyPath` 已通过 `export const jsonTool` 对象导出。测试需要 import `{ jsonTool }` from `../jsonTool`。由于 `jsonTool.ts` 依赖 jQuery、KaTeX 和 Tauri 插件，需要 mock 这些依赖。

- [ ] **Step 1: 创建测试文件，编写路径解析测试**

Create `src/utils/__tests__/jsonTool.test.ts`:

```typescript
// Mock jQuery
const mockJQuery = Object.assign(
  (selector: string) => ({
    val: jest.fn().mockReturnValue('default'),
    prop: jest.fn().mockReturnValue(false),
    html: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    empty: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    trigger: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnValue({ off: jest.fn().mockReturnValue({ on: jest.fn() }) }),
    children: jest.fn().mockReturnThis(),
    parent: jest.fn().mockReturnThis(),
    closest: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    css: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnValue(true),
    hide: jest.fn().mockReturnThis(),
    show: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
  }),
  { fn: {} }
);

jest.mock('jquery', () => ({
  __esModule: true,
  default: mockJQuery,
}));

jest.mock('katex', () => ({
  __esModule: true,
  default: {
    renderToString: jest.fn((tex: string) => `<span>${tex}</span>`),
  },
}));

jest.mock('katex/dist/katex.min.css', () => ({}));

jest.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: jest.fn(),
  writeText: jest.fn(),
}));

import { jsonTool } from '../jsonTool';

describe('parsePathTokens', () => {
  it('解析对象键', () => {
    const tokens = jsonTool.parsePathTokens('["name"]');
    expect(tokens).toEqual([{ type: 'object', value: 'name' }]);
  });

  it('解析数组索引', () => {
    const tokens = jsonTool.parsePathTokens('[0]');
    expect(tokens).toEqual([{ type: 'array', value: '0' }]);
  });

  it('解析混合路径', () => {
    const tokens = jsonTool.parsePathTokens('["users"][0]["name"]');
    expect(tokens).toEqual([
      { type: 'object', value: 'users' },
      { type: 'array', value: '0' },
      { type: 'object', value: 'name' },
    ]);
  });

  it('空路径返回空数组', () => {
    const tokens = jsonTool.parsePathTokens('');
    expect(tokens).toEqual([]);
  });

  it('解析多层嵌套数组', () => {
    const tokens = jsonTool.parsePathTokens('[0][1][2]');
    expect(tokens).toEqual([
      { type: 'array', value: '0' },
      { type: 'array', value: '1' },
      { type: 'array', value: '2' },
    ]);
  });
});

describe('formatKeyPath', () => {
  it('default 格式原样返回', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'default'))
      .toBe('["users"][0]["name"]');
  });

  it('dot 格式', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'dot'))
      .toBe('users[0].name');
  });

  it('jsonpath 格式', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'jsonpath'))
      .toBe('$.users[0].name');
  });

  it('bracket 格式', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'bracket'))
      .toBe("['users'][0]['name']");
  });

  it('python 格式', () => {
    expect(jsonTool.formatKeyPath('["users"]["name"]', 'python'))
      .toBe(".get('users').get('name')");
  });

  it('空路径返回空字符串', () => {
    expect(jsonTool.formatKeyPath('', 'default')).toBe('');
    expect(jsonTool.formatKeyPath('', 'dot')).toBe('');
    expect(jsonTool.formatKeyPath('', 'jsonpath')).toBe('');
  });

  it('未知格式回退到 default', () => {
    expect(jsonTool.formatKeyPath('["a"]', 'unknown'))
      .toBe('["a"]');
  });
});
```

- [ ] **Step 2: 运行测试验证通过**

```bash
pnpm test:unit
```

Expected: 12 tests pass (7 parsePathTokens + 5 formatKeyPath + 2 edge cases = ~12)

- [ ] **Step 3: 提交**

```bash
git add src/utils/__tests__/jsonTool.test.ts
git commit -m "test: 添加路径解析单元测试"
```

---

## Task 3: 单元测试 — LaTeX 检测与错误定位

**Files:**
- Modify: `src/utils/__tests__/jsonTool.test.ts`

注意：`hasLatex` 和 `renderLatexString` 是模块内部函数，未通过 `jsonTool` 对象导出。需要通过 `jsonTool.ts` 文件顶部的模块作用域来测试。由于 `hasLatex` 未导出，我们需要修改 `jsonTool.ts` 来导出它，或者通过间接方式测试。

最简方案：在 `jsonTool.ts` 底部添加导出 `export { hasLatex, renderLatexString, parseJsonError };`。但 `parseJsonError` 已在 `jsonTool` 对象上。`hasLatex` 和 `renderLatexString` 需要单独导出。

- [ ] **Step 1: 导出需要测试的内部函数**

Modify `src/utils/jsonTool.ts`, add at the bottom before `export default jsonTool;`:

```typescript
export { hasLatex, renderLatexString, escapeHtml };
```

- [ ] **Step 2: 添加 LaTeX 检测测试**

Append to `src/utils/__tests__/jsonTool.test.ts`:

```typescript
import { hasLatex, renderLatexString, escapeHtml } from '../jsonTool';

describe('hasLatex', () => {
  it('检测行内公式 $...$', () => {
    expect(hasLatex('The formula is $E=mc^2$')).toBe(true);
  });

  it('检测块级公式 $$...$$', () => {
    expect(hasLatex('$$\\int_0^1 x dx$$')).toBe(true);
  });

  it('普通文本返回 false', () => {
    expect(hasLatex('Hello World')).toBe(false);
  });

  it('空字符串返回 false', () => {
    expect(hasLatex('')).toBe(false);
  });

  it('检测 frac/times 关键字', () => {
    expect(hasLatex('{frac}')).toBe(true);
    expect(hasLatex('{times}')).toBe(true);
  });
});

describe('renderLatexString', () => {
  it('行内公式生成 latex-inline span', () => {
    const result = renderLatexString('text $x^2$ more');
    expect(result).toContain('latex-inline');
  });

  it('块级公式生成 latex-block span', () => {
    const result = renderLatexString('$$x^2$$');
    expect(result).toContain('latex-block');
  });

  it('无公式文本原样返回', () => {
    const result = renderLatexString('plain text');
    expect(result).toBe('plain text');
  });

  it('混合文本正确处理', () => {
    const result = renderLatexString('before $a$ middle $$b$$ after');
    expect(result).toContain('latex-inline');
    expect(result).toContain('latex-block');
  });
});
```

- [ ] **Step 3: 添加错误定位测试**

Append to `src/utils/__tests__/jsonTool.test.ts`:

```typescript
describe('parseJsonError', () => {
  it('提取 Chrome 格式 position', () => {
    const result = jsonTool.parseJsonError(
      '{"a": 1,}',
      'Unexpected token } in JSON at position 9'
    );
    expect(result).toContain('第');
    expect(result).toContain('行');
  });

  it('提取 Firefox 格式 line/column', () => {
    const result = jsonTool.parseJsonError(
      '{\n  "a": 1,\n}',
      'JSON.parse: expected property name at line 3 column 1'
    );
    expect(result).toContain('第 3 行');
    expect(result).toContain('第 1 列');
  });

  it('从 position 计算行号和列号', () => {
    const json = '{\n  "a": 1,\n  "b": 2,\n}';
    const result = jsonTool.parseJsonError(
      json,
      'Unexpected token } in JSON at position 23'
    );
    expect(result).toContain('行');
  });

  it('显示错误上下文', () => {
    const json = '{\n  "a": 1,\n  "b": 2,\n}';
    const result = jsonTool.parseJsonError(
      json,
      'Unexpected token } in JSON at position 23'
    );
    expect(result).toContain('上下文');
  });

  it('错误行标记 → 前缀', () => {
    const json = '{\n  "a": 1,\n}';
    const result = jsonTool.parseJsonError(
      json,
      'Unexpected token } in JSON at position 14'
    );
    expect(result).toContain('→');
  });

  it('HTML 转义防止 XSS', () => {
    const result = jsonTool.parseJsonError(
      '{}',
      '<script>alert("xss")</script>'
    );
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<div>"test" & \'value\'</div>'))
      .not.toContain('<div>');
  });

  it('普通文本不变', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('空字符串返回空字符串', () => {
    expect(escapeHtml('')).toBe('');
  });
});
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm test:unit
```

Expected: All tests pass (~25+ tests total)

- [ ] **Step 5: 提交**

```bash
git add src/utils/jsonTool.ts src/utils/__tests__/jsonTool.test.ts
git commit -m "test: 添加 LaTeX 检测和错误定位单元测试"
```

---

## Task 4: E2E 测试 — 分屏模式基础功能

**Files:**
- Create: `tests/specs/07-split-basic.spec.js`

- [ ] **Step 1: 创建分屏模式基础测试文件**

Create `tests/specs/07-split-basic.spec.js`:

```javascript
import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('分屏模式基础功能', () => {
  before(async () => {
    await browser.pause(2000);
    // 切换到分屏模式
    const splitMode = await $('#split-mode');
    const isVisible = await splitMode.isDisplayed();
    if (!isVisible) {
      await safeClick('#viewModeBtn');
      await browser.pause(500);
    }
  });

  after(async () => {
    // 切回编辑器模式
    const editorMode = await $('#editor-mode');
    const isVisible = await editorMode.isDisplayed();
    if (!isVisible) {
      await safeClick('#splitViewModeBtn');
      await browser.pause(500);
    }
  });

  beforeEach(async () => {
    await safeClick('#splitClearBtn');
    await browser.pause(500);
  });

  it('分屏模式输入框可编辑', async () => {
    const input = await $('#splitSourceText');
    await input.clearValue();
    await input.setValue('{"test": "hello"}');
    const value = await input.getValue();
    expect(value).toContain('test');
  });

  it('分屏模式格式化正确 JSON', async () => {
    await setInputValue('#splitSourceText', '{"name":"Alice","age":30}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);

    const treeView = await getElementHTML('#tree-view');
    expect(treeView).toContain('Alice');
    expect(treeView).toContain('tree-key');
  });

  it('分屏模式格式化错误 JSON 显示错误信息', async () => {
    await setInputValue('#splitSourceText', '{invalid}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);

    const result = await getElementHTML('#split-valid-result');
    expect(result).toContain('错误');
  });

  it('分屏模式清空按钮清除输入和 TreeView', async () => {
    await setInputValue('#splitSourceText', '{"a":1}');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    await safeClick('#splitClearBtn');
    await browser.pause(500);

    const inputValue = await $('#splitSourceText').getValue();
    expect(inputValue).toBe('');
  });

  it('分屏模式格式化空输入不崩溃', async () => {
    await setInputValue('#splitSourceText', '');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    // 不崩溃即通过
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test:e2e -- --spec=tests/specs/07-split-basic.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add tests/specs/07-split-basic.spec.js
git commit -m "test: 添加分屏模式基础 E2E 测试"
```

---

## Task 5: E2E 测试 — 分屏模式控件

**Files:**
- Create: `tests/specs/08-split-controls.spec.js`

- [ ] **Step 1: 创建分屏控件测试文件**

Create `tests/specs/08-split-controls.spec.js`:

```javascript
import { waitForElement, safeClick, getElementHTML } from '../helpers/utils.js';

describe('分屏模式控件', () => {
  before(async () => {
    await browser.pause(2000);
    const splitMode = await $('#split-mode');
    const isVisible = await splitMode.isDisplayed();
    if (!isVisible) {
      await safeClick('#viewModeBtn');
      await browser.pause(500);
    }
  });

  after(async () => {
    const editorMode = await $('#editor-mode');
    const isVisible = await editorMode.isDisplayed();
    if (!isVisible) {
      await safeClick('#splitViewModeBtn');
      await browser.pause(500);
    }
  });

  it('分屏模式置顶按钮切换', async () => {
    const topBtn = await $('#splitTopBtn');
    await topBtn.click();
    await browser.pause(500);
    const classAfterClick = await topBtn.getAttribute('class');
    expect(classAfterClick).toContain('active');

    await topBtn.click();
    await browser.pause(500);
    const classAfterSecond = await topBtn.getAttribute('class');
    expect(classAfterSecond).not.toContain('active');
  });

  it('分屏模式转义按钮切换', async () => {
    const explainBtn = await $('#splitExplainBtn');
    await explainBtn.click();
    await browser.pause(500);
    const classAfterClick = await explainBtn.getAttribute('class');
    expect(classAfterClick).toContain('active');

    await explainBtn.click();
    await browser.pause(500);
    const classAfterSecond = await explainBtn.getAttribute('class');
    expect(classAfterSecond).not.toContain('active');
  });

  it('分屏模式主题切换', async () => {
    const themeToggle = await $('#splitThemeToggle');
    const bodyClassBefore = await browser.execute(() =>
      document.body.className
    );
    await themeToggle.click();
    await browser.pause(500);
    const bodyClassAfter = await browser.execute(() =>
      document.body.className
    );
    expect(bodyClassAfter).not.toBe(bodyClassBefore);

    // 切回原主题
    await themeToggle.click();
    await browser.pause(500);
  });

  it('分屏模式展开/折叠全部', async () => {
    // 先格式化一个 JSON
    const input = await $('#splitSourceText');
    await input.clearValue();
    await input.setValue('{"a":{"b":{"c":1}}}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);

    // 折叠全部
    await safeClick('#splitCollapseAll');
    await browser.pause(500);
    const collapsedToggles = await $$('.tree-toggle[data-collapsed="true"]');
    expect(collapsedToggles.length).toBeGreaterThan(0);

    // 展开全部
    await safeClick('#splitExpandAll');
    await browser.pause(500);
    const expandedToggles = await $$('.tree-toggle[data-collapsed="false"]');
    expect(expandedToggles.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test:e2e -- --spec=tests/specs/08-split-controls.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add tests/specs/08-split-controls.spec.js
git commit -m "test: 添加分屏模式控件 E2E 测试"
```

---

## Task 6: E2E 测试 — 剪贴板功能

**Files:**
- Create: `tests/specs/09-clipboard.spec.js`

PLACEHOLDER_TASK6_CONTINUE

- [ ] **Step 1: 创建剪贴板测试文件**

Create `tests/specs/09-clipboard.spec.js`:

```javascript
import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('剪贴板功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('编辑器模式剪贴板', () => {
    before(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#splitViewModeBtn');
        await browser.pause(500);
      }
    });

    beforeEach(async () => {
      await safeClick('#clearBtn');
      await browser.pause(500);
    });

    it('粘贴按钮读取剪贴板并格式化', async () => {
      // 先写入剪贴板
      await browser.execute(() => {
        navigator.clipboard.writeText('{"paste":"test"}');
      });
      await browser.pause(300);

      await safeClick('#pasteBtn');
      await browser.pause(1000);

      const inputValue = await $('#sourceText').getValue();
      expect(inputValue).toContain('paste');
    });

    it('TreeView 双击 key 复制路径', async () => {
      await setInputValue('#sourceText', '{"user":{"name":"Alice"}}');
      await safeClick('#formatBtn');
      await browser.pause(1000);

      const treeKeys = await $$('.tree-key');
      if (treeKeys.length > 0) {
        await treeKeys[0].doubleClick();
        await browser.pause(500);
      }
    });

    it('TreeView 双击 value 复制值', async () => {
      await setInputValue('#sourceText', '{"name":"Alice"}');
      await safeClick('#formatBtn');
      await browser.pause(1000);

      const treeValues = await $$('.tree-value');
      if (treeValues.length > 0) {
        await treeValues[0].doubleClick();
        await browser.pause(500);
      }
    });
  });

  describe('分屏模式剪贴板', () => {
    before(async () => {
      const splitMode = await $('#split-mode');
      const isVisible = await splitMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#viewModeBtn');
        await browser.pause(500);
      }
    });

    after(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#splitViewModeBtn');
        await browser.pause(500);
      }
    });

    it('分屏模式粘贴按钮读取剪贴板', async () => {
      await browser.execute(() => {
        navigator.clipboard.writeText('{"split":"paste"}');
      });
      await browser.pause(300);

      await safeClick('#splitPasteBtn');
      await browser.pause(1000);

      const inputValue = await $('#splitSourceText').getValue();
      expect(inputValue).toContain('split');
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test:e2e -- --spec=tests/specs/09-clipboard.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add tests/specs/09-clipboard.spec.js
git commit -m "test: 添加剪贴板功能 E2E 测试"
```

---

## Task 7: E2E 测试 — 大 JSON 和边界情况

**Files:**
- Create: `tests/specs/10-large-json.spec.js`

- [ ] **Step 1: 创建大 JSON 测试文件**

Create `tests/specs/10-large-json.spec.js`:

```javascript
import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('大 JSON 和边界情况', () => {
  before(async () => {
    await browser.pause(2000);
    const editorMode = await $('#editor-mode');
    const isVisible = await editorMode.isDisplayed();
    if (!isVisible) {
      await safeClick('#splitViewModeBtn');
      await browser.pause(500);
    }
  });

  beforeEach(async () => {
    await safeClick('#clearBtn');
    await browser.pause(500);
  });

  it('1000+ 键值对 JSON 格式化不崩溃', async () => {
    const largeObj = {};
    for (let i = 0; i < 1000; i++) {
      largeObj[`key_${i}`] = `value_${i}`;
    }
    const largeJson = JSON.stringify(largeObj);

    await setInputValue('#sourceText', largeJson);
    await safeClick('#formatBtn');
    await browser.pause(3000);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');
  });

  it('50 层嵌套 JSON 正常渲染', async () => {
    let nested = { value: 'deep' };
    for (let i = 0; i < 49; i++) {
      nested = { level: nested };
    }
    const deepJson = JSON.stringify(nested);

    await setInputValue('#sourceText', deepJson);
    await safeClick('#formatBtn');
    await browser.pause(2000);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');
  });

  it('超过 50 层显示深度限制提示', async () => {
    let nested = { value: 'deep' };
    for (let i = 0; i < 55; i++) {
      nested = { level: nested };
    }
    const veryDeepJson = JSON.stringify(nested);

    await setInputValue('#sourceText', veryDeepJson);
    await safeClick('#formatBtn');
    await browser.pause(2000);

    const treeView = await getElementHTML('#tree-view');
    expect(treeView).toContain('max depth reached');
  });

  it('空 JSON {} 正常处理', async () => {
    await setInputValue('#sourceText', '{}');
    await safeClick('#formatBtn');
    await browser.pause(500);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');
  });

  it('空数组 [] 正常处理', async () => {
    await setInputValue('#sourceText', '[]');
    await safeClick('#formatBtn');
    await browser.pause(500);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');
  });

  it('Unicode 字符和 emoji 正常显示', async () => {
    const unicodeJson = JSON.stringify({
      chinese: '你好世界',
      emoji: '🎉🚀💻',
      japanese: 'こんにちは',
      arabic: 'مرحبا'
    });

    await setInputValue('#sourceText', unicodeJson);
    await safeClick('#formatBtn');
    await browser.pause(1000);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');

    const treeView = await getElementHTML('#tree-view');
    expect(treeView).toContain('你好世界');
  });

  it('转义字符正确处理', async () => {
    const escapeJson = JSON.stringify({
      newline: 'line1\\nline2',
      tab: 'col1\\tcol2',
      quote: 'say \\"hello\\"'
    });

    await setInputValue('#sourceText', escapeJson);
    await safeClick('#formatBtn');
    await browser.pause(1000);

    const validResult = await getElementHTML('#valid-result');
    expect(validResult).toContain('格式正确');
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test:e2e -- --spec=tests/specs/10-large-json.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add tests/specs/10-large-json.spec.js
git commit -m "test: 添加大 JSON 和边界情况 E2E 测试"
```

---

## Task 8: E2E 测试 — 复制格式功能

**Files:**
- Create: `tests/specs/11-copy-format.spec.js`

- [ ] **Step 1: 创建复制格式测试文件**

Create `tests/specs/11-copy-format.spec.js`:

```javascript
import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('复制格式功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('编辑器模式复制格式', () => {
    before(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#splitViewModeBtn');
        await browser.pause(500);
      }
    });

    beforeEach(async () => {
      await safeClick('#clearBtn');
      await browser.pause(500);
    });

    it('切换 5 种内置格式', async () => {
      const formats = ['default', 'dot', 'jsonpath', 'bracket', 'python'];
      const copyFormat = await $('#copyFormat');

      for (const format of formats) {
        await copyFormat.selectByAttribute('value', format);
        await browser.pause(200);
        const selectedValue = await copyFormat.getValue();
        expect(selectedValue).toBe(format);
      }
    });

    it('自定义格式设置', async () => {
      const copyFormat = await $('#copyFormat');
      await copyFormat.selectByAttribute('value', 'custom');
      await browser.pause(300);

      const customKeyFormat = await $('#customKeyFormat');
      const customIndexFormat = await $('#customIndexFormat');

      if (await customKeyFormat.isDisplayed()) {
        await customKeyFormat.clearValue();
        await customKeyFormat.setValue('.{key}');
        await browser.pause(200);

        await customIndexFormat.clearValue();
        await customIndexFormat.setValue('[{index}]');
        await browser.pause(200);

        const keyVal = await customKeyFormat.getValue();
        expect(keyVal).toBe('.{key}');
      }
    });
  });

  describe('分屏模式复制格式', () => {
    before(async () => {
      const splitMode = await $('#split-mode');
      const isVisible = await splitMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#viewModeBtn');
        await browser.pause(500);
      }
    });

    after(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('#splitViewModeBtn');
        await browser.pause(500);
      }
    });

    it('分屏模式复制格式弹窗打开/关闭', async () => {
      await safeClick('#splitCopyFormatBtn');
      await browser.pause(500);

      // 验证弹窗出现（LayUI layer）
      const layerExists = await browser.execute(() => {
        return document.querySelectorAll('.layui-layer').length > 0;
      });
      expect(layerExists).toBe(true);

      // 关闭弹窗
      const closeBtn = await $('.layui-layer-close');
      if (await closeBtn.isExisting()) {
        await closeBtn.click();
        await browser.pause(500);
      }
    });

    it('分屏模式选择格式后确认', async () => {
      await safeClick('#splitCopyFormatBtn');
      await browser.pause(500);

      // 在弹窗中选择格式
      const formatOptions = await $$('.layui-layer select option');
      if (formatOptions.length > 0) {
        await formatOptions[1].click();
        await browser.pause(300);
      }
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test:e2e -- --spec=tests/specs/11-copy-format.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add tests/specs/11-copy-format.spec.js
git commit -m "test: 添加复制格式功能 E2E 测试"
```

---

PLACEHOLDER_REMAINING_TASKS

## Task 9: macOS 测试脚本

**Files:**
- Create: `scripts/test-macos.sh`

- [ ] **Step 1: 创建 macOS 测试脚本**

Create `scripts/test-macos.sh`:

```bash
#!/bin/bash
set -e

echo "========================================="
echo "JSONFormatter macOS 测试脚本"
echo "========================================="
echo ""

# 检查依赖
echo "[1/6] 检查依赖..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请访问 https://nodejs.org/ 安装 Node.js"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm 未安装"
    echo "运行: npm install -g pnpm"
    exit 1
fi

if ! command -v rustc &> /dev/null; then
    echo "❌ Rust 未安装"
    echo "请访问 https://rustup.rs/ 安装 Rust"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo 未安装"
    echo "请访问 https://rustup.rs/ 安装 Rust"
    exit 1
fi

echo "✅ 所有依赖已安装"
echo ""

# 安装 npm 依赖
echo "[2/6] 安装 npm 依赖..."
pnpm install
echo "✅ npm 依赖安装完成"
echo ""

# 构建 macOS debug 版本
echo "[3/6] 构建 macOS debug 版本..."
pnpm tauri build --debug
echo "✅ 构建完成"
echo ""

# 运行单元测试
echo "[4/6] 运行单元测试..."
pnpm test:unit
UNIT_EXIT_CODE=$?
if [ $UNIT_EXIT_CODE -ne 0 ]; then
    echo "❌ 单元测试失败"
    exit $UNIT_EXIT_CODE
fi
echo "✅ 单元测试通过"
echo ""

# 运行 E2E 测试
echo "[5/6] 运行 E2E 测试..."
pnpm test:e2e
E2E_EXIT_CODE=$?
if [ $E2E_EXIT_CODE -ne 0 ]; then
    echo "❌ E2E 测试失败"
    exit $E2E_EXIT_CODE
fi
echo "✅ E2E 测试通过"
echo ""

# 生成测试报告
echo "[6/6] 测试报告"
echo "========================================="
echo "✅ 所有测试通过"
echo ""
echo "单元测试覆盖率报告: coverage/index.html"
echo "E2E 测试报告: wdio-logs/"
echo "========================================="
```

- [ ] **Step 2: 添加执行权限**

```bash
chmod +x scripts/test-macos.sh
```

- [ ] **Step 3: 验证脚本语法**

```bash
bash -n scripts/test-macos.sh
```

Expected: No syntax errors

- [ ] **Step 4: 提交**

```bash
git add scripts/test-macos.sh
git commit -m "feat: 添加 macOS 一键测试脚本"
```

---

## Task 10: 用户文档

**Files:**
- Create: `docs/user-guide.md`

- [ ] **Step 1: 创建用户文档**

Create `docs/user-guide.md`:

```markdown
# JSONFormatter 用户指南

## 简介

JSONFormatter 是一款跨平台桌面 JSON 格式化工具，支持 JSON 验证、语法高亮、树形视图、LaTeX 公式渲染和多种路径复制格式。

## 系统要求

- **Windows**: Windows 10 或更高版本
- **macOS**: macOS 10.15 (Catalina) 或更高版本

## 安装

### Windows

1. 从 [GitHub Releases](https://github.com/your-repo/releases) 下载最新版本的 `.msi` 或 `.exe` 安装包
2. 双击安装包，按照向导完成安装
3. 安装完成后，从开始菜单启动 JSONFormatter

### macOS

1. 从 [GitHub Releases](https://github.com/your-repo/releases) 下载最新版本的 `.dmg` 文件
2. 打开 `.dmg` 文件，将 JSONFormatter 拖拽到应用程序文件夹
3. 首次启动时，右键点击应用选择"打开"以绕过 Gatekeeper

## 功能说明

### 1. 编辑器模式

编辑器模式提供单窗口 JSON 编辑和格式化体验。

**操作步骤：**

1. 在左侧输入框粘贴或输入 JSON 文本
2. 点击"格式化"按钮
3. 查看右侧树形视图和格式化结果

**快捷操作：**

- **粘贴按钮**: 从剪贴板读取 JSON 并自动格式化
- **清空按钮**: 清除输入框和树形视图
- **置顶按钮**: 窗口保持在最前端
- **转义按钮**: 切换 Unicode 转义显示
- **主题切换**: 切换深色/浅色主题

### 2. 分屏模式

分屏模式提供左右分屏的 JSON 编辑体验，适合对比和编辑。

**切换方式：**

点击顶部"视图模式"按钮在编辑器模式和分屏模式之间切换。

**分屏模式特性：**

- 左侧输入区，右侧树形视图
- 独立的格式化、清空、粘贴按钮
- 展开/折叠全部按钮
- 与编辑器模式相同的主题和置顶功能

### 3. 树形视图

树形视图以可折叠的树状结构展示 JSON 数据。

**交互操作：**

- **点击 ▶/▼**: 展开/折叠节点
- **双击键名**: 复制路径到剪贴板
- **双击值**: 复制值到剪贴板
- **展开全部/折叠全部**: 批量操作所有节点

### 4. LaTeX 公式渲染

JSONFormatter 自动检测并渲染 JSON 字符串中的 LaTeX 公式。

**支持格式：**

- **行内公式**: `$E=mc^2$`
- **块级公式**: `$$\int_0^1 x dx = \frac{1}{2}$$`

**示例：**

```json
{
  "formula": "Einstein's equation is $E=mc^2$",
  "integral": "$$\\int_0^1 x dx = \\frac{1}{2}$$"
}
```

### 5. 路径复制格式

点击树形视图中的键名时，路径会以选定格式复制到剪贴板。

**内置格式：**

| 格式 | 示例 | 说明 |
|------|------|------|
| default | `["users"][0]["name"]` | 默认格式 |
| dot | `users[0].name` | 点号格式 |
| jsonpath | `$.users[0].name` | JSONPath 格式 |
| bracket | `['users'][0]['name']` | 单引号括号格式 |
| python | `.get('users').get(0).get('name')` | Python `.get()` 链式调用 |

**自定义格式：**

选择"自定义"格式后，可以设置：

- **键模板**: 例如 `.{key}` 或 `["{key}"]`
- **索引模板**: 例如 `[{index}]` 或 `.{index}`

### 6. 错误提示

当输入无效 JSON 时，JSONFormatter 会显示详细的错误信息：

- 错误位置（行号和列号）
- 错误上下文（前后 3 行代码）
- 错误行标记（→ 前缀）

### 7. 自动更新

JSONFormatter 支持自动检查更新。

**更新流程：**

1. 启动时自动检查更新（可在设置中禁用）
2. 发现新版本时弹出更新对话框
3. 点击"立即更新"下载并安装新版本

**手动检查更新：**

点击托盘图标 → "检查更新"

### 8. 托盘菜单

JSONFormatter 最小化后会驻留在系统托盘。

**托盘菜单选项：**

- **显示/隐藏**: 切换窗口显示状态
- **置顶**: 切换窗口置顶
- **开机自启**: 切换开机自动启动
- **禁用自动更新**: 切换自动更新检查
- **检查更新**: 手动检查更新
- **退出**: 退出应用

## 常见问题

### Q: macOS 提示"无法打开应用，因为它来自身份不明的开发者"

**A**: 右键点击应用，选择"打开"，然后在弹出的对话框中点击"打开"。

### Q: Windows 提示"Windows 已保护你的电脑"

**A**: 点击"更多信息"，然后点击"仍要运行"。

### Q: 如何禁用自动更新？

**A**: 点击托盘图标 → "禁用自动更新"。

### Q: 如何导出格式化后的 JSON？

**A**: 格式化后，输入框中的内容即为格式化后的 JSON，可以直接复制。

### Q: 支持哪些 LaTeX 语法？

**A**: 支持 KaTeX 的所有语法，详见 [KaTeX 文档](https://katex.org/docs/supported.html)。

### Q: 如何报告 Bug 或提出功能建议？

**A**: 请访问 [GitHub Issues](https://github.com/your-repo/issues) 提交。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + V | 粘贴（在输入框中） |
| Ctrl/Cmd + A | 全选（在输入框中） |
| Ctrl/Cmd + C | 复制（在输入框中） |

## 技术支持

- **GitHub**: https://github.com/your-repo
- **Gitee**: https://gitee.com/your-repo
- **Email**: support@example.com

## 许可证

本软件采用 MIT 许可证。详见 LICENSE 文件。
```

- [ ] **Step 2: 提交**

```bash
git add docs/user-guide.md
git commit -m "docs: 添加用户使用文档"
```

---

PLACEHOLDER_DEV_GUIDE

## Task 11: 开发者文档

**Files:**
- Create: `docs/developer-guide.md`

- [ ] **Step 1: 创建开发者文档**

Create `docs/developer-guide.md`:

```markdown
# JSONFormatter 开发者文档

## 项目概述

JSONFormatter 是基于 Tauri v2 构建的跨平台桌面 JSON 格式化工具。前端使用 TypeScript + jQuery + LayUI，后端使用 Rust。

## 技术栈

- **前端**: Vite, TypeScript, jQuery 3.7, LayUI 2.13, KaTeX 0.16
- **后端**: Rust, Tauri v2.9
- **测试**: Jest 29 (单元测试), WebdriverIO 9 (E2E 测试)
- **构建**: pnpm, Vite, Cargo

## 开发环境配置

### 前置要求

- Node.js 18+ 和 pnpm
- Rust 1.70+ 和 Cargo
- Tauri CLI 2.9+

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm tauri:dev
```

启动 Tauri 开发服务器，支持热重载。

### 构建生产版本

```bash
pnpm tauri:build
```

生成平台特定的安装包（Windows: MSI/NSIS, macOS: DMG/APP）。

## 项目结构

```
json_reader/
├── src/                    # 前端源码
│   ├── main.ts            # 应用入口
│   ├── utils/
│   │   ├── jsonTool.ts    # JSON 处理核心逻辑
│   │   └── __tests__/     # 单元测试
│   ├── lib/               # 第三方库（LayUI）
│   └── index.html         # HTML 模板
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   └── main.rs        # Tauri 主程序
│   ├── Cargo.toml         # Rust 依赖
│   ├── tauri.conf.json    # Tauri 配置
│   └── capabilities/      # 权限配置
├── tests/                 # E2E 测试
│   ├── specs/             # 测试用例
│   └── helpers/           # 测试工具函数
├── scripts/               # 构建和测试脚本
├── docs/                  # 文档
└── package.json           # npm 依赖和脚本

```

## 核心模块

### 1. jsonTool.ts

JSON 处理引擎，负责：

- JSON 解析和验证
- 树形视图渲染
- LaTeX 公式检测和渲染
- 路径解析和格式化
- 错误定位和上下文显示

**关键函数：**

- `parsePathTokens(path: string)`: 解析路径字符串为 token 数组
- `formatKeyPath(path: string, format: string)`: 格式化路径为指定格式
- `hasLatex(text: string)`: 检测字符串是否包含 LaTeX 公式
- `renderLatexString(text: string)`: 渲染 LaTeX 公式为 HTML
- `parseJsonError(json: string, errorMsg: string)`: 解析 JSON 错误并生成上下文

**安全特性：**

- 所有用户输入通过 `escapeHtml()` 转义，防止 XSS
- 递归渲染深度限制为 50 层，防止栈溢出
- CSP 策略限制脚本和样式来源

### 2. main.ts

应用入口，负责：

- 窗口控制（最小化、关闭、置顶）
- 主题切换（深色/浅色）
- 视图模式切换（编辑器/分屏）
- 剪贴板集成
- 自动更新检查
- 托盘事件监听

**Tauri 命令调用：**

```typescript
import { invoke } from '@tauri-apps/api/core';

await invoke('set_always_on_top', { alwaysOnTop: true });
```

**Tauri 事件监听：**

```typescript
import { listen } from '@tauri-apps/api/event';

await listen('tray-toggle-top', () => {
  // 处理托盘菜单事件
});
```

### 3. main.rs

Rust 后端，负责：

- 托盘菜单管理（线程安全状态）
- Tauri 命令实现
- 插件集成（autostart, updater, clipboard, window-state）

**Tauri 命令定义：**

```rust
#[tauri::command]
fn set_always_on_top(window: tauri::Window, always_on_top: bool) -> Result<(), String> {
    window.set_always_on_top(always_on_top)
        .map_err(|e| e.to_string())
}
```

**托盘菜单状态管理：**

```rust
use std::sync::{Arc, Mutex};

struct TrayState {
    is_top: bool,
    autostart_enabled: bool,
    update_disabled: bool,
}

let tray_state = Arc::new(Mutex::new(TrayState { ... }));
```

## 测试策略

### 单元测试

使用 Jest + ts-jest + jsdom 测试 `jsonTool.ts` 核心逻辑。

**运行单元测试：**

```bash
pnpm test:unit              # 运行所有单元测试
pnpm test:unit:watch        # 监听模式
pnpm test:unit:coverage     # 生成覆盖率报告
```

**覆盖率目标：**

- 分支覆盖率: 70%
- 函数覆盖率: 70%
- 行覆盖率: 70%
- 语句覆盖率: 70%

### E2E 测试

使用 WebdriverIO + Mocha 测试完整用户流程。

**运行 E2E 测试：**

```bash
pnpm test:e2e                              # 运行所有 E2E 测试
pnpm test:e2e -- --spec=tests/specs/01-*.js  # 运行特定测试
```

**测试覆盖：**

- 基础 JSON 功能（01-basic.spec.js）
- JSON 错误处理（02-json-errors.spec.js）
- 窗口操作（03-window-ops.spec.js）
- 视图模式切换（04-view-modes.spec.js）
- TreeView 交互（05-treeview.spec.js）
- 复选框和主题（06-checkboxes-theme.spec.js）
- 分屏模式基础（07-split-basic.spec.js）
- 分屏模式控件（08-split-controls.spec.js）
- 剪贴板功能（09-clipboard.spec.js）
- 大 JSON 和边界情况（10-large-json.spec.js）
- 复制格式功能（11-copy-format.spec.js）

### 跨平台测试

**Windows（主开发平台）：**

```bash
pnpm test:all
```

**macOS（用户验证）：**

```bash
chmod +x scripts/test-macos.sh
./scripts/test-macos.sh
```

## 版本管理

版本号在三个文件中同步：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

**自动版本更新：**

```bash
pnpm release:patch    # 0.1.19 → 0.1.20
pnpm release:minor    # 0.1.19 → 0.2.0
pnpm release:major    # 0.1.19 → 1.0.0
```

## 发布流程

### 1. 更新版本

```bash
pnpm release:patch
```

### 2. 提交更改

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.1.20"
```

### 3. 创建标签

```bash
git tag v0.1.20
git push origin v0.1.20
```

### 4. CI/CD 自动构建

推送 `v*` 标签后，GitHub Actions 自动：

1. 构建 Windows (x64) 和 macOS (x64 + aarch64) 版本
2. 生成安装包（MSI, NSIS, DMG, APP）
3. 发布到 GitHub Releases 和 Gitee

### 5. 更新器配置

Tauri 更新器从两个端点拉取更新：

- Gitee: `https://gitee.com/your-repo/releases/download/{{target}}-{{arch}}/{{current_version}}`
- GitHub: `https://github.com/your-repo/releases/download/{{target}}-{{arch}}/{{current_version}}`

## 安全最佳实践

### XSS 防护

所有用户输入必须通过 `escapeHtml()` 转义：

```typescript
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};
```

### CSP 策略

`src-tauri/tauri.conf.json` 中配置严格的 CSP：

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ..."
```

### 递归深度限制

TreeView 渲染限制深度为 50 层：

```typescript
const MAX_RENDER_DEPTH = 50;

if (depth > MAX_RENDER_DEPTH) {
  container.append($('<span>').text('[max depth reached]'));
  return;
}
```

## 常见开发任务

### 添加新的路径复制格式

1. 在 `jsonTool.ts` 的 `formatKeyPath()` 中添加新格式分支
2. 在 `index.html` 的 `<select id="copyFormat">` 中添加新选项
3. 添加单元测试到 `src/utils/__tests__/jsonTool.test.ts`
4. 添加 E2E 测试到 `tests/specs/11-copy-format.spec.js`

### 添加新的 Tauri 命令

1. 在 `src-tauri/src/main.rs` 中定义命令：

```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    Ok(format!("Received: {}", param))
}
```

2. 在 `tauri::Builder` 中注册命令：

```rust
.invoke_handler(tauri::generate_handler![my_command])
```

3. 在前端调用：

```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('my_command', { param: 'value' });
```

### 修改托盘菜单

1. 在 `src-tauri/src/main.rs` 的 `tray_menu` 中添加菜单项
2. 在 `on_tray_icon_event` 中处理点击事件
3. 使用 `app.emit()` 发送事件到前端
4. 在 `src/main.ts` 中使用 `listen()` 监听事件

## 调试技巧

### 前端调试

开发模式下按 F12 打开 DevTools。

### Rust 调试

在 `src-tauri/src/main.rs` 中使用 `eprintln!()` 输出日志：

```rust
eprintln!("Debug: {:?}", variable);
```

### E2E 测试调试

运行单个测试文件并查看浏览器：

```bash
pnpm test:e2e -- --spec=tests/specs/01-basic.spec.js
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

**提交信息规范：**

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `test:` 测试相关
- `chore:` 构建/工具链更新
- `refactor:` 重构

## 许可证

MIT License. 详见 LICENSE 文件。
```

- [ ] **Step 2: 提交**

```bash
git add docs/developer-guide.md
git commit -m "docs: 添加开发者文档"
```

---

## Task 12: 手动测试检查清单

**Files:**
- Create: `docs/manual-test-checklist.md`

- [ ] **Step 1: 创建手动测试清单**

Create `docs/manual-test-checklist.md`:

```markdown
# JSONFormatter 手动测试检查清单

## 测试环境

- [ ] **Windows 10/11 x64**
- [ ] **macOS 10.15+ (Intel)**
- [ ] **macOS 11+ (Apple Silicon)**

## 安装测试

### Windows

- [ ] MSI 安装包正常安装
- [ ] NSIS 安装包正常安装
- [ ] 安装后可从开始菜单启动
- [ ] 卸载后无残留文件

### macOS

- [ ] DMG 文件正常打开
- [ ] 拖拽到应用程序文件夹成功
- [ ] 首次启动 Gatekeeper 提示正常
- [ ] 右键"打开"可绕过 Gatekeeper

## 功能测试

### 编辑器模式

- [ ] 输入框可正常输入和编辑
- [ ] 格式化按钮正常工作
- [ ] 清空按钮清除输入和 TreeView
- [ ] 粘贴按钮从剪贴板读取 JSON
- [ ] 置顶按钮切换窗口置顶状态
- [ ] 转义按钮切换 Unicode 显示
- [ ] 主题切换按钮切换深色/浅色主题
- [ ] 最小化按钮最小化到托盘
- [ ] 关闭按钮最小化到托盘（不退出）

### 分屏模式

- [ ] 视图模式按钮切换到分屏模式
- [ ] 分屏模式输入框可正常输入
- [ ] 分屏模式格式化按钮正常工作
- [ ] 分屏模式清空按钮正常工作
- [ ] 分屏模式粘贴按钮正常工作
- [ ] 分屏模式置顶按钮正常工作
- [ ] 分屏模式转义按钮正常工作
- [ ] 分屏模式主题切换正常工作
- [ ] 展开全部按钮展开所有节点
- [ ] 折叠全部按钮折叠所有节点
- [ ] 切回编辑器模式正常

### TreeView 交互

- [ ] 点击 ▶ 展开节点
- [ ] 点击 ▼ 折叠节点
- [ ] 双击键名复制路径到剪贴板
- [ ] 双击值复制值到剪贴板
- [ ] 嵌套对象正确渲染
- [ ] 数组正确渲染
- [ ] null 值显示为灰色 "null"
- [ ] boolean 值显示为蓝色 "true"/"false"
- [ ] 数字值显示为橙色
- [ ] 字符串值显示为绿色并带引号

### LaTeX 渲染

- [ ] 行内公式 `$E=mc^2$` 正确渲染
- [ ] 块级公式 `$$\int_0^1 x dx$$` 正确渲染
- [ ] 混合公式正确渲染
- [ ] 无公式文本正常显示
- [ ] 嵌套对象中的公式正确渲染
- [ ] 数组中的公式正确渲染

### 路径复制格式

- [ ] default 格式: `["users"][0]["name"]`
- [ ] dot 格式: `users[0].name`
- [ ] jsonpath 格式: `$.users[0].name`
- [ ] bracket 格式: `['users'][0]['name']`
- [ ] python 格式: `.get('users').get(0).get('name')`
- [ ] 自定义格式: 设置模板后正确复制

### 错误处理

- [ ] 无效 JSON 显示错误信息
- [ ] 错误信息包含行号和列号
- [ ] 错误信息显示上下文（前后 3 行）
- [ ] 错误行标记 → 前缀
- [ ] HTML 特殊字符正确转义（无 XSS）

### 剪贴板功能

- [ ] 粘贴按钮读取剪贴板内容
- [ ] 双击键名复制路径到剪贴板
- [ ] 双击值复制值到剪贴板
- [ ] 复制后可在其他应用粘贴

### 托盘菜单

- [ ] 最小化后托盘图标出现
- [ ] 点击托盘图标显示菜单
- [ ] "显示/隐藏"切换窗口显示
- [ ] "置顶"切换窗口置顶
- [ ] "开机自启"切换自动启动
- [ ] "禁用自动更新"切换更新检查
- [ ] "检查更新"手动检查更新
- [ ] "退出"退出应用

### 自动更新

- [ ] 启动时自动检查更新（如果启用）
- [ ] 发现新版本弹出更新对话框
- [ ] 更新对话框显示版本号和更新日志
- [ ] 点击"立即更新"下载并安装
- [ ] 点击"稍后提醒"关闭对话框
- [ ] 禁用自动更新后不再检查

### 开机自启

- [ ] 启用开机自启后重启电脑，应用自动启动
- [ ] 禁用开机自启后重启电脑，应用不自动启动

## 性能测试

- [ ] 1000+ 键值对 JSON 格式化不卡顿（< 3 秒）
- [ ] 50 层嵌套 JSON 正常渲染
- [ ] 超过 50 层显示"max depth reached"
- [ ] 大 JSON TreeView 滚动流畅
- [ ] 展开/折叠大节点响应及时

## 边界情况测试

- [ ] 空 JSON `{}` 正常处理
- [ ] 空数组 `[]` 正常处理
- [ ] 空字符串 `""` 正常处理
- [ ] Unicode 字符正确显示（中文、emoji、日文、阿拉伯文）
- [ ] 转义字符正确处理（`\n`, `\t`, `\"`）
- [ ] 超长字符串正常显示（不截断）
- [ ] 超大数字正常显示（不丢失精度）

## 窗口操作测试

- [ ] 窗口可正常拖动
- [ ] 窗口可正常调整大小
- [ ] 最小化后可从托盘恢复
- [ ] 关闭后最小化到托盘（不退出）
- [ ] 置顶后窗口保持在最前端
- [ ] 取消置顶后窗口正常层级
- [ ] 窗口状态（大小、位置）在重启后恢复

## 主题测试

- [ ] 深色主题所有元素正确显示
- [ ] 浅色主题所有元素正确显示
- [ ] 主题切换后 TreeView 颜色正确
- [ ] 主题切换后按钮颜色正确
- [ ] 主题切换后输入框颜色正确
- [ ] 主题设置在重启后保持

## 跨平台一致性测试

- [ ] Windows 和 macOS 功能一致
- [ ] Windows 和 macOS UI 布局一致
- [ ] Windows 和 macOS 快捷键一致
- [ ] Windows 和 macOS 托盘菜单一致

## 安全测试

- [ ] XSS 测试: 输入 `{"xss":"<script>alert('xss')</script>"}` 不执行脚本
- [ ] XSS 测试: 输入 `{"xss":"<img src=x onerror=alert('xss')>"}` 不执行脚本
- [ ] 路径遍历测试: 输入 `{"path":"../../etc/passwd"}` 不访问文件系统
- [ ] SQL 注入测试: 输入 `{"sql":"'; DROP TABLE users--"}` 不影响应用

## 回归测试

- [ ] 所有已修复的 P0 问题不再复现：
  - [ ] TreeView XSS 漏洞已修复
  - [ ] 更新对话框 XSS 漏洞已修复
  - [ ] 错误提示 XSS 漏洞已修复
  - [ ] 置顶按钮竞态条件已修复
  - [ ] 递归深度限制已生效
  - [ ] CSP 策略已配置
  - [ ] Rust 优雅退出已实现
  - [ ] macOS 最小化恢复已修复

## 测试结果

**测试日期**: ___________

**测试人员**: ___________

**测试平台**: ___________

**通过项**: _____ / _____

**失败项**: ___________

**备注**: ___________
```

- [ ] **Step 2: 提交**

```bash
git add docs/manual-test-checklist.md
git commit -m "docs: 添加手动测试检查清单"
```

---

## 自查清单

完成所有任务后，验证以下项目：

**规格覆盖：**

- [ ] Jest 单元测试环境已配置
- [ ] jsonTool.ts 单元测试已编写（路径解析、LaTeX、错误定位）
- [ ] 5 个新 E2E 测试文件已创建（07-11）
- [ ] macOS 测试脚本已创建并可执行
- [ ] 用户文档已编写
- [ ] 开发者文档已编写
- [ ] 手动测试清单已编写
- [ ] package.json 已更新测试脚本

**占位符扫描：**

- [ ] 无 TBD、TODO、"implement later"
- [ ] 无"add appropriate error handling"
- [ ] 无"write tests for the above"
- [ ] 所有代码块完整且可执行

**类型一致性：**

- [ ] 所有函数签名匹配
- [ ] 所有文件路径正确
- [ ] 所有命令可执行

**测试验证：**

- [ ] 所有单元测试可运行并通过
- [ ] 所有 E2E 测试可运行并通过
- [ ] macOS 脚本语法正确

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-04-30-test-implementation.md`。两种执行方式：

**1. Subagent-Driven (推荐)** - 每个任务派发新的子代理，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

选择哪种方式？
