import { safeClick, elementExists, getControlValue, setInputValue, switchToEditor, toggleLayuiCheckbox, waitForElement } from '../helpers/utils.js';

describe('窗口操作 (TODO #2)', () => {
  let initialMaximizeIconClass;
  let sizeBeforeExpand;
  let sizeAfterExpand;

  before(async () => {
    await switchToEditor();
    initialMaximizeIconClass = await $('#maximizeBtn i').getAttribute('class');
  });

  it('最小化按钮应存在', async () => {
    const exists = await elementExists('#minimize');
    expect(exists).toBe(true);
  });

  it('最大化按钮应存在', async () => {
    const exists = await elementExists('#maximizeBtn');
    expect(exists).toBe(true);
  });

  it('关闭按钮应存在', async () => {
    const exists = await elementExists('#close');
    expect(exists).toBe(true);
  });

  it('点击最小化按钮不应崩溃', async () => {
    await safeClick('#minimize');
    await browser.maximizeWindow();
    await waitForElement('#sourceText');
  });

  it('窗口恢复后应可交互', async () => {
    // 尝试与窗口交互以验证它仍然响应
    await setInputValue('#sourceText', 'test');
    const value = await getControlValue('#sourceText');
    expect(value).toContain('test');
  });

  it('最大化按钮应可点击', async () => {
    await browser.setWindowSize(900, 700);
    sizeBeforeExpand = await browser.getWindowSize();
    await safeClick('#maximizeBtn');
    await browser.waitUntil(async () => {
      const current = await browser.getWindowSize();
      return current.width !== sizeBeforeExpand.width || current.height !== sizeBeforeExpand.height;
    }, { timeout: 5000, timeoutMsg: '点击最大化后窗口尺寸未变化' });
    sizeAfterExpand = await browser.getWindowSize();
  });

  it('再次点击最大化应还原窗口', async () => {
    await safeClick('#maximizeBtn');
    await browser.waitUntil(async () => {
      const current = await browser.getWindowSize();
      return current.width !== sizeAfterExpand.width || current.height !== sizeAfterExpand.height;
    }, { timeout: 5000, timeoutMsg: '再次点击最大化后窗口未离开全屏尺寸' });
    expect(await $('#maximizeBtn i').getAttribute('class')).toBe(initialMaximizeIconClass);
  });

  it('置顶复选框应存在', async () => {
    const exists = await elementExists('#topCheck');
    expect(exists).toBe(true);
  });

  it('置顶复选框应可切换', async () => {
    const checkbox = await $('#topCheck');
    const initialState = await checkbox.isSelected();
    await toggleLayuiCheckbox('topCheck');
    const newState = await checkbox.isSelected();
    expect(newState).not.toBe(initialState);
    // 切换回原状态
    await toggleLayuiCheckbox('topCheck');
  });
});
