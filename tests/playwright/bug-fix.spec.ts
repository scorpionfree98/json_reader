import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Bug 修复验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('转义功能：禁用时显示真实换行，启用时显示转义字符', async ({ page }) => {
    // 输入包含真实换行符的 JSON
    const testJson = JSON.stringify({
      text: 'Line 1\nLine 2\nLine 3'
    });

    await page.locator('#sourceText').fill(testJson);
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);

    // 切换到分屏模式
    await page.evaluate(() => {
      const btn = document.querySelector('.view-mode-btn[data-mode="split"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // 默认状态：转义按钮未激活，应该显示真实换行（pre-wrap）
    const explainBtn = page.locator('#splitExplainBtn');
    const isActive = await explainBtn.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(false);

    // 检查树视图中字符串值的 white-space 样式
    const stringValue = page.locator('.tree-string.tree-value').first();
    const whiteSpace = await stringValue.evaluate(el =>
      window.getComputedStyle(el).whiteSpace
    );
    expect(whiteSpace).toContain('pre'); // 应该是 pre-wrap 允许换行

    // 点击转义按钮启用转义
    await explainBtn.click();
    await page.waitForTimeout(500);

    // 检查按钮状态
    const isActiveAfter = await explainBtn.evaluate(el => el.classList.contains('active'));
    expect(isActiveAfter).toBe(true);

    // 转义模式下，应该看到 \n 字符而不是真实换行
    const stringContent = await stringValue.textContent();
    expect(stringContent).toContain('\\n'); // 应该包含转义的 \n
  });

  test('大型 JSON 完整显示：a.txt 测试', async ({ page }) => {
    // 读取 a.txt 文件
    const filePath = path.join(process.cwd(), 'a.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // 输入到编辑器
    await page.locator('#sourceText').fill(fileContent);
    await page.waitForTimeout(500);

    // 切换到分屏模式
    await page.evaluate(() => {
      const btn = document.querySelector('.view-mode-btn[data-mode="split"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // 检查树视图是否渲染
    const treeView = page.locator('#tree-view');
    await expect(treeView).toBeVisible();

    // 检查是否有 "max depth reached" 错误
    const maxDepthError = page.locator('.tree-null:has-text("[max depth reached]")');
    const errorCount = await maxDepthError.count();
    expect(errorCount).toBe(0); // 不应该有深度限制错误

    // 检查主要字段是否存在
    const idKey = page.locator('.tree-key:has-text("id")');
    await expect(idKey).toBeVisible();

    const queryKey = page.locator('.tree-key:has-text("query")');
    await expect(queryKey).toBeVisible();

    const paramKey = page.locator('.tree-key:has-text("param")');
    await expect(paramKey).toBeVisible();

    // 检查 query 字段的值是否显示（即使很长）
    const queryValue = page.locator('.tree-key:has-text("query")').locator('..').locator('.tree-string.tree-value');
    const queryText = await queryValue.textContent();
    expect(queryText).toBeTruthy();
    expect(queryText!.length).toBeGreaterThan(0);
  });

  test('转义功能：切换多次保持同步', async ({ page }) => {
    const testJson = JSON.stringify({ msg: 'Hello\nWorld\tTab' });

    await page.locator('#sourceText').fill(testJson);
    await page.locator('#formatBtn').click();
    await page.waitForTimeout(500);

    // 切换到分屏模式
    await page.evaluate(() => {
      const btn = document.querySelector('.view-mode-btn[data-mode="split"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    const explainBtn = page.locator('#splitExplainBtn');

    // 切换 3 次
    for (let i = 0; i < 3; i++) {
      await explainBtn.click();
      await page.waitForTimeout(300);

      const isActive = await explainBtn.evaluate(el => el.classList.contains('active'));
      expect(isActive).toBe(true);

      await explainBtn.click();
      await page.waitForTimeout(300);

      const isInactive = await explainBtn.evaluate(el => el.classList.contains('active'));
      expect(isInactive).toBe(false);
    }
  });
});
