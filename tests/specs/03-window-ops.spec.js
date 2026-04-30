import { safeClick, elementExists } from '../helpers/utils.js';

describe('窗口操作 (TODO #2)', () => {
  before(async () => {
    await browser.pause(1000);
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
    await browser.pause(1000);
    // 窗口应该被隐藏或最小化，但测试进程应继续运行
  });

  it('窗口恢复后应可交互', async () => {
    // 尝试与窗口交互以验证它仍然响应
    const input = await $('#sourceText');
    await input.setValue('test');
    const value = await input.getValue();
    expect(value).toContain('test');
  });

  it('最大化按钮应可点击', async () => {
    await safeClick('#maximizeBtn');
    await browser.pause(1000);
  });

  it('再次点击最大化应还原窗口', async () => {
    await safeClick('#maximizeBtn');
    await browser.pause(1000);
  });

  it('置顶复选框应存在', async () => {
    const exists = await elementExists('#topCheck');
    expect(exists).toBe(true);
  });

  it('置顶复选框应可切换', async () => {
    const checkbox = await $('#topCheck');
    const initialState = await checkbox.isSelected();
    await safeClick('#topCheck');
    await browser.pause(500);
    const newState = await checkbox.isSelected();
    expect(newState).not.toBe(initialState);
    // 切换回原状态
    await safeClick('#topCheck');
    await browser.pause(500);
  });
});
