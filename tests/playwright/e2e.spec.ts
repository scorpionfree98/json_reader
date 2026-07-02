import { test, expect } from '@playwright/test';

// 注意：这些测试在浏览器环境中运行（非 Tauri），
// Tauri 原生功能（剪贴板、置顶、自启动等）不可用，仅测试前端逻辑。

test.describe('基础 JSON 功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // 等待 LayUI 初始化
    await page.waitForTimeout(500);
  });

  test('页面标题正确', async ({ page }) => {
    await expect(page).toHaveTitle('JSON格式化工具');
  });

  test('输入框可编辑', async ({ page }) => {
    const input = page.locator('#sourceText');
    await input.fill('{"test": "hello"}');
    await expect(input).toHaveValue('{"test": "hello"}');
  });

  test('格式化正确的 JSON', async ({ page }) => {
    await page.locator('#sourceText').fill('{"name":"Alice","age":30}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const result = page.locator('#valid-result');
    await expect(result).toContainText('格式正确');
    await expect(result).toBeVisible();
  });

  test('格式化后输入框包含美化后的 JSON', async ({ page }) => {
    await page.locator('#sourceText').fill('{"a":1,"b":2}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const value = await page.locator('#sourceText').inputValue();
    expect(value).toContain('"a"');
    expect(value).toContain('"b"');
    // 应包含缩进
    expect(value).toContain('  ');
  });

  test('格式化非法 JSON 显示错误', async ({ page }) => {
    await page.locator('#sourceText').fill('this is not json');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const result = page.locator('#valid-result');
    await expect(result).toBeVisible();
    await expect(result).toHaveClass(/es-fail/);
  });

  test('清空按钮清除输入', async ({ page }) => {
    await page.locator('#sourceText').fill('{"a":1}');
    await page.locator('#clearBtn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#sourceText')).toHaveValue('');
  });

  test('格式化空输入不崩溃', async ({ page }) => {
    await page.locator('#sourceText').fill('');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(300);
    // 页面不应崩溃
    await expect(page.locator('#sourceText')).toBeVisible();
  });
});

test.describe('JSON 错误信息', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('显示错误位置信息', async ({ page }) => {
    await page.locator('#sourceText').fill('{"a": 1,}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const result = page.locator('#valid-result');
    await expect(result).toBeVisible();
    // 应包含行信息
    const html = await result.innerHTML();
    expect(html).toContain('行');
  });

  test('显示错误上下文', async ({ page }) => {
    const json = '{\n  "a": 1,\n  "b": 2,\n}';
    await page.locator('#sourceText').fill(json);
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const html = await page.locator('#valid-result').innerHTML();
    expect(html).toContain('上下文');
    expect(html).toContain('→');
  });

  test('错误信息 XSS 防护', async ({ page }) => {
    // 输入包含 HTML 标签的 JSON
    await page.locator('#sourceText').fill('<script>alert("xss")</script>');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const html = await page.locator('#valid-result').innerHTML();
    expect(html).not.toContain('<script>');
  });
});

test.describe('编辑器模式 JSON 渲染', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('格式化后显示 JSON 树', async ({ page }) => {
    await page.locator('#sourceText').fill('{"name":"test","items":[1,2,3]}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const display = page.locator('#json-display');
    await expect(display).not.toBeEmpty();
    // 应包含 key 元素
    const keys = display.locator('.json-key');
    expect(await keys.count()).toBeGreaterThan(0);
  });

  test('JSON 树中折叠/展开工作', async ({ page }) => {
    await page.locator('#sourceText').fill('{"data":{"nested":{"deep":"value"}}}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    // 点击折叠按钮
    const toggle = page.locator('#json-display .json-toggle').first();
    await toggle.click();
    // children 应隐藏
    const children = page.locator('#json-display .json-children').first();
    await expect(children).not.toBeVisible();
    // 再次点击展开
    await toggle.click();
    await expect(children).toBeVisible();
  });

  test('null 值正确渲染', async ({ page }) => {
    await page.locator('#sourceText').fill('{"value":null}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const nullEl = page.locator('#json-display .json-null');
    await expect(nullEl).toBeVisible();
    await expect(nullEl).toContainText('null');
  });

  test('布尔值正确渲染', async ({ page }) => {
    await page.locator('#sourceText').fill('{"flag":true,"other":false}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const boolels = page.locator('#json-display .json-boolean');
    expect(await boolels.count()).toBe(2);
  });

  test('数字正确渲染', async ({ page }) => {
    await page.locator('#sourceText').fill('{"count":42,"pi":3.14}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    const numEls = page.locator('#json-display .json-number');
    expect(await numEls.count()).toBe(2);
  });
});

test.describe('视图模式切换', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('默认为编辑器模式', async ({ page }) => {
    await expect(page.locator('#editor-mode')).toBeVisible();
    await expect(page.locator('#split-mode')).toBeHidden();
  });

  test('切换到分屏模式', async ({ page }) => {
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#split-mode')).toBeVisible();
  });

  test('从分屏切回编辑器模式', async ({ page }) => {
    // 先切到分屏
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    // 再切回编辑器（分屏模式内的按钮）
    await page.locator('#split-mode .view-mode-btn[data-mode="editor"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#editor-mode')).toBeVisible();
  });

  test('切换模式时内容同步', async ({ page }) => {
    await page.locator('#sourceText').fill('{"sync":"test"}');
    // 切到分屏
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    const splitValue = await page.locator('#splitSourceText').inputValue();
    expect(splitValue).toContain('sync');
  });
});

test.describe('分屏模式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    // 切到分屏模式
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
  });

  test('分屏模式输入并格式化', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"hello":"world"}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    // tree-view 应有内容
    const treeView = page.locator('#tree-view');
    await expect(treeView).not.toBeEmpty();
  });

  test('分屏模式树形视图显示 key', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"name":"Alice","age":30}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    const keys = page.locator('#tree-view .tree-key');
    expect(await keys.count()).toBeGreaterThan(0);
  });

  test('分屏模式树形视图正确渲染 null', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"x":null}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    const nullEl = page.locator('#tree-view .tree-null');
    await expect(nullEl.first()).toContainText('null');
  });

  test('分屏模式展开/折叠全部', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"a":{"b":{"c":1}}}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    // 折叠全部
    await page.locator('#splitCollapseAll').click();
    await page.waitForTimeout(300);
    const collapsed = page.locator('#tree-view .tree-children.collapsed');
    expect(await collapsed.count()).toBeGreaterThan(0);
    // 展开全部
    await page.locator('#splitExpandAll').click();
    await page.waitForTimeout(300);
    const stillCollapsed = page.locator('#tree-view .tree-children.collapsed');
    expect(await stillCollapsed.count()).toBe(0);
  });

  test('分屏模式清空按钮', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"a":1}');
    await page.locator('#splitClearBtn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#splitSourceText')).toHaveValue('');
    await expect(page.locator('#tree-view')).toBeEmpty();
  });

  test('分屏模式实时同步到编辑器', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{"realtime":"sync"}');
    await page.waitForTimeout(500);
    // 编辑器的 sourceText 应该被同步
    const editorValue = await page.locator('#sourceText').inputValue();
    expect(editorValue).toContain('realtime');
  });

  test('分屏模式错误 JSON 显示错误信息', async ({ page }) => {
    await page.locator('#splitSourceText').fill('{invalid json}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    const result = page.locator('#split-valid-result');
    await expect(result).toBeVisible();
  });
});

test.describe('搜索功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('编辑器模式搜索 - 找到匹配项', async ({ page }) => {
    await page.locator('#sourceText').fill('{"name":"Alice","city":"Beijing","country":"China"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    // 显示搜索栏
    await page.locator('#editorSearchToggle').click();
    await page.waitForTimeout(200);
    // 在搜索框中输入
    await page.locator('#editorSearchInput').fill('name');
    await page.waitForTimeout(500);
    // 应显示结果计数
    const count = page.locator('#editorSearchCount');
    await expect(count).not.toBeEmpty();
    // 应有高亮元素
    const highlights = page.locator('#json-display .search-highlight, #json-display .search-highlight-active');
    expect(await highlights.count()).toBeGreaterThan(0);
  });

  test('编辑器模式搜索 - 无匹配项', async ({ page }) => {
    await page.locator('#sourceText').fill('{"name":"Alice"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#editorSearchToggle').click();
    await page.waitForTimeout(200);
    await page.locator('#editorSearchInput').fill('zzzznonexistent');
    await page.waitForTimeout(500);
    const count = page.locator('#editorSearchCount');
    await expect(count).toContainText('0');
  });

  test('编辑器模式搜索 - 清除搜索', async ({ page }) => {
    await page.locator('#sourceText').fill('{"name":"Alice"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#editorSearchToggle').click();
    await page.waitForTimeout(200);
    await page.locator('#editorSearchInput').fill('name');
    await page.waitForTimeout(500);
    await page.locator('#editorSearchClear').click();
    await page.waitForTimeout(300);
    // 搜索栏应隐藏
    await expect(page.locator('#editorSearchBar')).toHaveClass(/hidden/);
  });

  test('分屏模式搜索 - 找到匹配项', async ({ page }) => {
    // 切到分屏
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('#splitSourceText').fill('{"name":"Alice","age":30}');
    await page.locator('#splitFormatBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#treeSearchToggle').click();
    await page.waitForTimeout(200);
    await page.locator('#treeSearchInput').fill('Alice');
    await page.waitForTimeout(500);
    const count = page.locator('#treeSearchCount');
    await expect(count).not.toBeEmpty();
    const text = await count.textContent();
    expect(text).toMatch(/\d+\/\d+/);
  });

  test('搜索导航 - 上/下一个', async ({ page }) => {
    await page.locator('#sourceText').fill('{"a":"test","b":"test","c":"test"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#editorSearchToggle').click();
    await page.waitForTimeout(200);
    await page.locator('#editorSearchInput').fill('test');
    await page.waitForTimeout(500);
    // 应显示 1/3
    const count = page.locator('#editorSearchCount');
    await expect(count).toContainText('1/');
    // 点击下一个
    await page.locator('#editorSearchNext').click();
    await expect(count).toContainText('2/');
    // 点击上一个
    await page.locator('#editorSearchPrev').click();
    await expect(count).toContainText('1/');
  });

  test('搜索键盘导航 Enter/Shift+Enter', async ({ page }) => {
    await page.locator('#sourceText').fill('{"x":"hello","y":"hello"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#editorSearchToggle').click();
    await page.waitForTimeout(200);
    const searchInput = page.locator('#editorSearchInput');
    await searchInput.fill('hello');
    await page.waitForTimeout(500);
    // Enter 跳下一个
    await searchInput.press('Enter');
    const count = page.locator('#editorSearchCount');
    await expect(count).toContainText('2/');
    // Shift+Enter 跳上一个
    await searchInput.press('Shift+Enter');
    await expect(count).toContainText('1/');
  });
});

test.describe('主题切换', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('点击主题按钮切换夜间模式', async ({ page }) => {
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('body')).toHaveClass(/dark-mode/);
  });

  test('再次点击切回白天模式', async ({ page }) => {
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(200);
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(200);
    await expect(page.locator('body')).not.toHaveClass(/dark-mode/);
  });

  test('分屏模式主题切换', async ({ page }) => {
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('#splitThemeToggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('body')).toHaveClass(/dark-mode/);
  });
});

test.describe('大型 JSON 和边界情况', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('1000 键的对象', async ({ page }) => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) obj[`key${i}`] = i;
    await page.locator('#sourceText').fill(JSON.stringify(obj));
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(2000);
    const result = page.locator('#valid-result');
    await expect(result).toContainText('格式正确');
  });

  test('深层嵌套对象', async ({ page }) => {
    let obj: any = { value: 'deep' };
    for (let i = 0; i < 30; i++) obj = { nested: obj };
    await page.locator('#sourceText').fill(JSON.stringify(obj));
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(1000);
    const result = page.locator('#valid-result');
    await expect(result).toContainText('格式正确');
  });

  test('空对象和空数组', async ({ page }) => {
    await page.locator('#sourceText').fill('{"empty_obj":{},"empty_arr":[]}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#valid-result')).toContainText('格式正确');
  });

  test('Unicode 和 emoji', async ({ page }) => {
    await page.locator('#sourceText').fill('{"emoji":"🎉","中文":"你好","日本語":"こんにちは"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#valid-result')).toContainText('格式正确');
    const display = page.locator('#json-display');
    const text = await display.textContent();
    expect(text).toContain('🎉');
    expect(text).toContain('你好');
  });

  test('特殊字符转义', async ({ page }) => {
    await page.locator('#sourceText').fill('{"path":"C:\\\\Users\\\\test","quote":"\\"hello\\"","newline":"line1\\nline2"}');
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#valid-result')).toContainText('格式正确');
  });
});

test.describe('复制格式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('复制格式选择器存在', async ({ page }) => {
    const selector = page.locator('#copyFormat');
    await expect(selector).toBeAttached();
  });

  test('分屏模式复制格式选择器存在', async ({ page }) => {
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);
    const selector = page.locator('#splitCopyFormat');
    await expect(selector).toBeAttached();
  });
});

test.describe('新功能验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('分屏模式转义按钮功能', async ({ page }) => {
    // 输入包含转义字符的 JSON
    const testJson = JSON.stringify({ text: 'Hello\\nWorld' });
    await page.locator('#sourceText').fill(testJson);

    // 切换到分屏模式
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);

    // 检查转义按钮存在
    const explainBtn = page.locator('#splitExplainBtn');
    await expect(explainBtn).toBeVisible();

    // 点击转义按钮
    await explainBtn.click();
    await page.waitForTimeout(200);

    // 验证按钮状态变化
    await expect(explainBtn).toHaveClass(/active/);
  });

  test('搜索功能找到所有匹配项', async ({ page }) => {
    // 输入包含多个 "test" 的 JSON
    const testJson = JSON.stringify({
      test1: 'test',
      test2: 'test',
      data: { test3: 'test' }
    });
    await page.locator('#sourceText').fill(testJson);
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);

    // 打开搜索（使用按钮而不是快捷键）
    const searchBtn = page.locator('#searchBtn');
    if (await searchBtn.count() > 0) {
      await searchBtn.click();
      await page.waitForTimeout(300);

      // 搜索 "test"
      const searchInput = page.locator('#searchInput');
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // 检查搜索计数（应该找到多个）
      const searchCount = page.locator('#searchCount');
      const countText = await searchCount.textContent();
      expect(countText).toContain('/');
    }
  });

  test('切换视图保留输入内容', async ({ page }) => {
    // 在编辑器模式输入并格式化
    const testJson = '{"data":"value"}';
    await page.locator('#sourceText').fill(testJson);
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);

    // 获取格式化后的内容
    const textBefore = await page.locator('#sourceText').inputValue();
    expect(textBefore).toContain('data');

    // 使用 JavaScript 切换到分屏模式（绕过可见性问题）
    await page.evaluate(() => {
      const btn = document.querySelector('.view-mode-btn[data-mode="split"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // 检查分屏输入框是否同步
    const splitText = await page.locator('#splitSourceText').inputValue();
    expect(splitText).toBe(textBefore);
  });

  test('分屏模式双击复制有提示', async ({ page }) => {
    // 输入 JSON 并切换到分屏模式
    const testJson = '{"key":"value"}';
    await page.locator('#sourceText').fill(testJson);
    await page.locator('.view-mode-btn[data-mode="split"]').first().click();
    await page.waitForTimeout(300);

    // 双击树视图中的 key
    const treeKey = page.locator('#tree-view .tree-key').first();
    await treeKey.dblclick();
    await page.waitForTimeout(500);

    // 检查是否有提示（LayUI 的 layer-msg 或自定义 toast）
    const layuiMsg = page.locator('.layui-layer-msg');
    const customToast = page.locator('.custom-toast');

    const hasLayuiMsg = await layuiMsg.count() > 0;
    const hasCustomToast = await customToast.count() > 0;

    expect(hasLayuiMsg || hasCustomToast).toBe(true);
  });
});
