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
    expect(result.leftFlex).toContain('%');
    expect(result.rightFlex).toContain('%');
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
