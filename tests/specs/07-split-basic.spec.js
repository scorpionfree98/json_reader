import { getControlValue, safeClick, setInputValue, switchToEditor, switchToSplit } from '../helpers/utils.js';

describe('分屏模式基础功能', () => {
  before(async () => {
    await browser.pause(2000);
    await switchToSplit();
  });

  after(async () => {
    await switchToEditor();
  });

  beforeEach(async () => {
    await safeClick('#splitClearBtn');
    await browser.pause(500);
  });

  it('分屏模式输入框可编辑', async () => {
    await setInputValue('#splitSourceText', '{"test": "hello"}');
    const value = await getControlValue('#splitSourceText');
    expect(value).toContain('test');
  });

  it('分屏模式格式化正确 JSON', async () => {
    await setInputValue('#splitSourceText', '{"name":"Alice","age":30}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('Alice');
    expect((await $$('#tree-view .tree-key')).length).toBeGreaterThan(0);
  });

  it('分屏模式格式化错误 JSON 显示错误信息', async () => {
    await setInputValue('#splitSourceText', '{invalid}');
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);
    const validResult = await $('#split-valid-result');
    const text = await validResult.getText();
    expect(text).toContain('无效');
  });

  it('分屏模式清空按钮清除输入和 TreeView', async () => {
    await setInputValue('#splitSourceText', '{"a":1}');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    await safeClick('#splitClearBtn');
    await browser.pause(500);
    const value = await getControlValue('#splitSourceText');
    expect(value).toBe('');
  });

  it('分屏模式格式化空输入不崩溃', async () => {
    await setInputValue('#splitSourceText', '');
    await safeClick('#splitFormatBtn');
    await browser.pause(500);
    // 无断言，仅验证不崩溃
  });
});
