import {
  elementExists,
  formatInSplit,
  getControlValue,
  isElementVisible,
  resetWorkspace,
  safeClick,
  setInputValue,
  setWorkbenchLayout,
  switchToEditor,
  switchToSplit,
  waitForText
} from '../helpers/utils.js';

describe('统一工作台布局与结果视图', () => {
  beforeEach(async () => {
    await resetWorkspace('split');
  });

  it('只保留一个输入源、校验区和主操作按钮', async () => {
    const counts = await browser.execute(() => ({
      textareas: document.querySelectorAll('textarea').length,
      validation: document.querySelectorAll('#valid-result').length,
      format: document.querySelectorAll('#formatBtn').length,
      paste: document.querySelectorAll('#pasteBtn').length,
      clear: document.querySelectorAll('#clearBtn').length,
      theme: document.querySelectorAll('#themeToggle').length,
      maximize: document.querySelectorAll('#maximizeBtn').length
    }));

    expect(counts).toEqual({
      textareas: 1,
      validation: 1,
      format: 1,
      paste: 1,
      clear: 1,
      theme: 1,
      maximize: 1
    });
  });

  it('默认使用双栏和树形结果', async () => {
    expect(await browser.execute(() => document.querySelector('#workbenchShell')?.getAttribute('data-layout'))).toBe('split');
    expect(await isElementVisible('#splitLeftPanel')).toBe(true);
    expect(await isElementVisible('#splitRightPanel')).toBe(true);
    expect(await isElementVisible('#tree-result')).toBe(true);
    expect(await isElementVisible('#highlight-result')).toBe(false);
  });

  it('唯一输入框可编辑并生成树形结果', async () => {
    await formatInSplit('{"name":"Bob","age":25}');
    expect(await getControlValue('#sourceText')).toContain('Bob');
    await waitForText('#tree-view', 'Bob');
  });

  it('切换高亮和树形结果不修改输入', async () => {
    await formatInSplit('{"nested":{"value":1}}');
    const formatted = await getControlValue('#sourceText');

    await switchToEditor();
    await waitForText('#json-display', 'nested');
    expect(await getControlValue('#sourceText')).toBe(formatted);

    await switchToSplit();
    await waitForText('#tree-view', 'nested');
    expect(await getControlValue('#sourceText')).toBe(formatted);
  });

  [
    ['editor', true, false],
    ['split', true, true],
    ['result', false, true]
  ].forEach(([layout, leftVisible, rightVisible]) => {
    it(`布局 ${layout} 控制左右面板可见性`, async () => {
      await setWorkbenchLayout(layout);
      expect(await isElementVisible('#splitLeftPanel')).toBe(leftVisible);
      expect(await isElementVisible('#splitRightPanel')).toBe(rightVisible);
    });
  });

  it('拖动分割线应调整面板比例并清理拖动状态', async () => {
    await setWorkbenchLayout('split');
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

  it('分割线边界仍保留两侧最小宽度', async () => {
    const state = await browser.execute(() => {
      const resizer = document.querySelector('#splitResizer');
      const leftPanel = document.querySelector('#splitLeftPanel');
      const rightPanel = document.querySelector('#splitRightPanel');
      const startX = resizer.getBoundingClientRect().left + 2;

      resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -1000 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: -1000 }));
      return {
        leftWidth: leftPanel.getBoundingClientRect().width,
        rightWidth: rightPanel.getBoundingClientRect().width
      };
    });

    expect(state.leftWidth).toBeGreaterThanOrEqual(419);
    expect(state.rightWidth).toBeGreaterThanOrEqual(319);
  });

  it('树形结果保留展开与折叠操作', async () => {
    expect(await elementExists('#splitExpandAll')).toBe(true);
    expect(await elementExists('#splitCollapseAll')).toBe(true);
    await formatInSplit('{"nested":{"value":1}}');
    await safeClick('#splitCollapseAll');
    expect((await $$('#tree-view .tree-children.collapsed')).length).toBeGreaterThan(0);
    await safeClick('#splitExpandAll');
    expect(await $$('#tree-view .tree-children.collapsed')).toHaveLength(0);
  });

  it('非法输入只更新统一校验状态并清理结果', async () => {
    await setInputValue('#sourceText', '{invalid}');
    await safeClick('#formatBtn');
    await waitForText('#valid-result', 'JSON');
    await waitForText('#tree-view', 'JSON 格式错误');
  });
});
