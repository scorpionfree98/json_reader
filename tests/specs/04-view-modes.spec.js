import { formatInSplit, getControlValue, resetWorkspace, safeClick, setInputValue, elementExists, isElementVisible, switchToEditor, switchToSplit, waitForText } from '../helpers/utils.js';

describe('视图模式切换', () => {
  beforeEach(async () => {
    await resetWorkspace('editor');
  });

  it('编辑器模式应为默认模式', async () => {
    expect(await isElementVisible('#editor-mode')).toBe(true);
  });

  it('切换到分屏模式', async () => {
    await switchToSplit();
    expect(await isElementVisible('#split-mode')).toBe(true);
  });

  it('分屏模式输入框应可用', async () => {
    await switchToSplit();
    await setInputValue('#splitSourceText', '{"test": "split mode"}');
    const value = await getControlValue('#splitSourceText');
    expect(value).toContain('split mode');
  });

  it('分屏模式格式化按钮应工作', async () => {
    await formatInSplit('{"name":"Bob","age":25}');
    await waitForText('#tree-view', 'Bob');
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('Bob');
  });

  it('拖动分割线应调整面板比例并清理拖动状态', async () => {
    await switchToSplit();
    const result = await browser.execute(() => {
      const resizer = document.querySelector('#splitResizer');
      const leftPanel = document.querySelector('#splitLeftPanel');
      const rightPanel = document.querySelector('#splitRightPanel');
      const startX = resizer.getBoundingClientRect().left + 2;
      const beforeWidth = leftPanel.getBoundingClientRect().width;

      resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX + 80 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: startX + 80 }));

      return {
        beforeWidth,
        afterWidth: leftPanel.getBoundingClientRect().width,
        leftFlex: leftPanel.style.flex,
        rightFlex: rightPanel.style.flex,
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect
      };
    });

    expect(result.afterWidth).toBeGreaterThan(result.beforeWidth + 40);
    expect(result.leftFlex).toContain('px');
    expect(result.rightFlex).toContain('auto');
    expect(result.cursor).toBe('');
    expect(result.userSelect).toBe('');
  });

  it('分屏模式应有展开全部按钮', async () => {
    await switchToSplit();
    const exists = await elementExists('#splitExpandAll');
    expect(exists).toBe(true);
  });

  it('分屏模式应有折叠全部按钮', async () => {
    await switchToSplit();
    const exists = await elementExists('#splitCollapseAll');
    expect(exists).toBe(true);
  });

  it('默认窗口宽度下分屏工具栏控件不应被隐藏或裁切', async () => {
    await switchToSplit();
    const state = await browser.execute(() => {
      const panel = document.querySelector('#splitLeftPanel');
      const controls = [
        '#splitLeftPanel .view-mode-btn', '#splitFormatBtn', '#splitPasteBtn', '#splitClearBtn',
        '#splitRenderHtml', '#splitParseJsonString', '#splitCheckUpdate', '#splitThemeToggle',
        '#splitMinimize', '#splitMaximize', '#splitClose'
      ];
      const panelRect = panel.getBoundingClientRect();
      return controls.map(selector => {
        const element = document.querySelector(selector);
        const target = element.matches('input') ? element.closest('label') : element;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        return {
          selector,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          insidePanel: rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1
        };
      });
    });

    expect(state.every(control => control.visible)).toBe(true);
    expect(state.filter(control => !control.insidePanel)).toEqual([]);
  });

  it('分割线拖到边界时仍应为两侧工具栏保留最小宽度', async () => {
    await switchToSplit();
    const state = await browser.execute(() => {
      const resizer = document.querySelector('#splitResizer');
      const leftPanel = document.querySelector('#splitLeftPanel');
      const rightPanel = document.querySelector('#splitRightPanel');
      const startX = resizer.getBoundingClientRect().left + 2;

      resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -1000 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: -1000 }));

      const leftRect = leftPanel.getBoundingClientRect();
      const rightRect = rightPanel.getBoundingClientRect();
      const toolbarRect = leftPanel.querySelector('.split-toolbar').getBoundingClientRect();
      return {
        leftWidth: leftRect.width,
        rightWidth: rightRect.width,
        toolbarInside: toolbarRect.left >= leftRect.left - 1 && toolbarRect.right <= leftRect.right + 1
      };
    });

    expect(state.leftWidth).toBeGreaterThanOrEqual(419);
    expect(state.rightWidth).toBeGreaterThanOrEqual(319);
    expect(state.toolbarInside).toBe(true);
  });

  it('折叠全部应折叠 TreeView', async () => {
    await formatInSplit('{"nested":{"value":1}}');
    await safeClick('#splitCollapseAll');
    const collapsed = await $$('#tree-view .tree-children.collapsed');
    expect(collapsed.length).toBeGreaterThan(0);
  });

  it('展开全部应展开 TreeView', async () => {
    await formatInSplit('{"nested":{"value":1}}');
    await safeClick('#splitCollapseAll');
    await safeClick('#splitExpandAll');
    const collapsed = await $$('#tree-view .tree-children.collapsed');
    expect(collapsed.length).toBe(0);
  });

  it('切回编辑器模式', async () => {
    await switchToSplit();
    await switchToEditor();
    expect(await isElementVisible('#editor-mode')).toBe(true);
  });

  it('分屏模式应隐藏', async () => {
    await switchToSplit();
    await switchToEditor();
    expect(await isElementVisible('#split-mode')).toBe(false);
  });

  it('编辑器中的最新内容切换到分屏后不应被旧内容覆盖', async () => {
    await switchToSplit();
    await setInputValue('#splitSourceText', '{"version":"old"}');
    await switchToEditor();
    await setInputValue('#sourceText', '{"version":"new"}');
    await switchToSplit();
    expect(await getControlValue('#splitSourceText')).toBe('{"version":"new"}');
    await waitForText('#tree-view', 'new');
  });
});
