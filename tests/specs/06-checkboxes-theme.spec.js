import { safeClick, elementExists, isChecked } from '../helpers/utils.js';

describe('复选框和主题功能', () => {
  before(async () => {
    await safeClick('[data-mode="editor"]');
    await browser.pause(1000);
  });

  it('转义复选框应存在', async () => {
    const exists = await elementExists('#explain');
    expect(exists).toBe(true);
  });

  it('转义复选框应可切换', async () => {
    const before = await isChecked('#explain');
    await safeClick('#explain');
    const after = await isChecked('#explain');
    expect(after).not.toBe(before);
  });

  it('开机自启复选框应存在', async () => {
    const exists = await elementExists('#autoStart');
    expect(exists).toBe(true);
  });

  it('禁用更新复选框应存在', async () => {
    const exists = await elementExists('#disableUpdate');
    expect(exists).toBe(true);
  });

  it('主题切换按钮应存在', async () => {
    const exists = await elementExists('#themeToggle');
    expect(exists).toBe(true);
  });

  it('主题切换应改变 body 类', async () => {
    const classBefore = await browser.execute(() => document.body.className);
    const isDarkBefore = classBefore.includes('dark-mode');

    await safeClick('#themeToggle');
    await browser.pause(500);

    const classAfter = await browser.execute(() => document.body.className);
    const isDarkAfter = classAfter.includes('dark-mode');

    expect(isDarkAfter).not.toBe(isDarkBefore);
  });

  it('再次切换主题应恢复', async () => {
    const classBefore = await browser.execute(() => document.body.className);
    const isDarkBefore = classBefore.includes('dark-mode');

    await safeClick('#themeToggle');
    await browser.pause(500);

    const classAfter = await browser.execute(() => document.body.className);
    const isDarkAfter = classAfter.includes('dark-mode');

    expect(isDarkAfter).not.toBe(isDarkBefore);
  });

  it('复制格式选择器应存在', async () => {
    const exists = await elementExists('#copyFormat');
    expect(exists).toBe(true);
  });

  it('复制格式应可切换', async () => {
    const select = await $('#copyFormat');
    await select.selectByAttribute('value', 'jsonpath');
    await browser.pause(300);
    const value = await select.getValue();
    expect(value).toBe('jsonpath');
  });

  it('检查更新按钮应存在', async () => {
    const exists = await elementExists('#checkUpdate');
    expect(exists).toBe(true);
  });
});
