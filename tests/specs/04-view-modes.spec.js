import { safeClick, setInputValue, elementExists } from '../helpers/utils.js';

describe('视图模式切换', () => {
  before(async () => {
    await browser.pause(1000);
  });

  it('编辑器模式应为默认模式', async () => {
    const editorMode = await $('#editor-mode');
    const isDisplayed = await editorMode.isDisplayed();
    expect(isDisplayed).toBe(true);
  });

  it('切换到分屏模式', async () => {
    await safeClick('[data-mode="split"]');
    await browser.pause(1000);
    const splitMode = await $('#split-mode');
    const isDisplayed = await splitMode.isDisplayed();
    expect(isDisplayed).toBe(true);
  });

  it('分屏模式输入框应可用', async () => {
    await setInputValue('#splitSourceText', '{"test": "split mode"}');
    const input = await $('#splitSourceText');
    const value = await input.getValue();
    expect(value).toContain('split mode');
  });

  it('分屏模式格式化按钮应工作', async () => {
    await setInputValue('#splitSourceText', '{"name":"Bob","age":25}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('Bob');
  });

  it('分屏模式应有展开全部按钮', async () => {
    const exists = await elementExists('#splitExpandAll');
    expect(exists).toBe(true);
  });

  it('分屏模式应有折叠全部按钮', async () => {
    const exists = await elementExists('#splitCollapseAll');
    expect(exists).toBe(true);
  });

  it('折叠全部应折叠 TreeView', async () => {
    await safeClick('#splitCollapseAll');
    await browser.pause(500);
    const collapsed = await $$('#tree-view .tree-children.collapsed');
    expect(collapsed.length).toBeGreaterThan(0);
  });

  it('展开全部应展开 TreeView', async () => {
    await safeClick('#splitExpandAll');
    await browser.pause(500);
    const collapsed = await $$('#tree-view .tree-children.collapsed');
    expect(collapsed.length).toBe(0);
  });

  it('切回编辑器模式', async () => {
    await safeClick('[data-mode="editor"]');
    await browser.pause(1000);
    const editorMode = await $('#editor-mode');
    const isDisplayed = await editorMode.isDisplayed();
    expect(isDisplayed).toBe(true);
  });

  it('分屏模式应隐藏', async () => {
    const splitMode = await $('#split-mode');
    const isDisplayed = await splitMode.isDisplayed();
    expect(isDisplayed).toBe(false);
  });
});
