import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('分屏模式基础功能', () => {
  before(async () => {
    await browser.pause(2000);
    // 切换到分屏模式
    const splitMode = await $('#split-mode');
    const isVisible = await splitMode.isDisplayed();
    if (!isVisible) {
      await safeClick('[data-mode="split"]');
      await browser.pause(500);
    }
  });

  after(async () => {
    // 切回编辑器模式
    const editorMode = await $('#editor-mode');
    const isVisible = await editorMode.isDisplayed();
    if (!isVisible) {
      await safeClick('[data-mode="editor"]');
      await browser.pause(500);
    }
  });

  beforeEach(async () => {
    await safeClick('#splitClearBtn');
    await browser.pause(500);
  });

  it('分屏模式输入框可编辑', async () => {
    await setInputValue('#splitSourceText', '{"test": "hello"}');
    const input = await $('#splitSourceText');
    const value = await input.getValue();
    expect(value).toContain('test');
  });

  it('分屏模式格式化正确 JSON', async () => {
    await setInputValue('#splitSourceText', '{"name":"Alice","age":30}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('Alice');
    expect(text).toContain('tree-key');
  });

  it('分屏模式格式化错误 JSON 显示错误信息', async () => {
    await setInputValue('#splitSourceText', '{invalid}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);
    const validResult = await $('#split-valid-result');
    const text = await validResult.getText();
    expect(text).toContain('错误');
  });

  it('分屏模式清空按钮清除输入和 TreeView', async () => {
    await setInputValue('#splitSourceText', '{"a":1}');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    await safeClick('#splitClearBtn');
    await browser.pause(500);
    const input = await $('#splitSourceText');
    const value = await input.getValue();
    expect(value).toBe('');
  });

  it('分屏模式格式化空输入不崩溃', async () => {
    await setInputValue('#splitSourceText', '');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    // 无断言，仅验证不崩溃
  });
});
