import { safeClick, setInputValue } from '../helpers/utils.js';

describe('分屏模式控件', () => {
  before(async () => {
    await browser.pause(2000);
    const splitMode = await $('#split-mode');
    const isVisible = await splitMode.isDisplayed();
    if (!isVisible) {
      await safeClick('[data-mode="split"]');
      await browser.pause(500);
    }
  });

  after(async () => {
    const editorMode = await $('#editor-mode');
    const isVisible = await editorMode.isDisplayed();
    if (!isVisible) {
      await safeClick('[data-mode="editor"]');
      await browser.pause(500);
    }
  });

  it('分屏模式置顶按钮切换', async () => {
    const topBtn = await $('#splitTopBtn');

    // Click to activate
    await safeClick('#splitTopBtn');
    await browser.pause(300);
    let className = await topBtn.getAttribute('class');
    expect(className).toContain('active');

    // Click to deactivate
    await safeClick('#splitTopBtn');
    await browser.pause(300);
    className = await topBtn.getAttribute('class');
    expect(className).not.toContain('active');
  });

  it('分屏模式转义按钮切换', async () => {
    const explainBtn = await $('#splitExplainBtn');

    // Click to activate
    await safeClick('#splitExplainBtn');
    await browser.pause(300);
    let className = await explainBtn.getAttribute('class');
    expect(className).toContain('active');

    // Click to deactivate
    await safeClick('#splitExplainBtn');
    await browser.pause(300);
    className = await explainBtn.getAttribute('class');
    expect(className).not.toContain('active');
  });

  it('分屏模式主题切换', async () => {
    const htmlElement = await $('html');
    const bodyElement = await $('body');

    // Get initial class
    let initialHtmlClass = await htmlElement.getAttribute('class');
    let initialBodyClass = await bodyElement.getAttribute('class');

    // Click theme toggle
    await safeClick('#splitThemeToggle');
    await browser.pause(500);

    // Get new class
    let newHtmlClass = await htmlElement.getAttribute('class');
    let newBodyClass = await bodyElement.getAttribute('class');

    // Verify they differ
    const htmlChanged = initialHtmlClass !== newHtmlClass;
    const bodyChanged = initialBodyClass !== newBodyClass;
    expect(htmlChanged || bodyChanged).toBe(true);

    // Click again to restore
    await safeClick('#splitThemeToggle');
    await browser.pause(500);
  });

  it('分屏模式展开/折叠全部', async () => {
    // Format a nested JSON
    const testJson = '{"a":{"b":{"c":1}}}';
    await setInputValue('#splitSourceText', testJson);
    await safeClick('#splitFormatBtn');
    await browser.pause(500);

    // Click collapse all
    await safeClick('#splitCollapseAll');
    await browser.pause(500);

    // Verify collapsed state exists
    const collapsedToggles = await $$('.tree-toggle[data-collapsed="true"]');
    expect(collapsedToggles.length).toBeGreaterThan(0);

    // Click expand all
    await safeClick('#splitExpandAll');
    await browser.pause(500);

    // Verify expanded state (no collapsed toggles)
    const expandedToggles = await $$('.tree-toggle[data-collapsed="false"]');
    expect(expandedToggles.length).toBeGreaterThan(0);
  });
});
