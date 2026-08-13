import { formatInSplit, isChecked, resetWorkspace, safeClick, toggleLayuiCheckbox } from '../helpers/utils.js';

describe('统一工作台控件', () => {
  beforeEach(async () => {
    await resetWorkspace('split');
  });

  it('置顶使用唯一复选框切换', async () => {
    const initial = await isChecked('#topCheck');
    await toggleLayuiCheckbox('topCheck');
    expect(await isChecked('#topCheck')).not.toBe(initial);
    await toggleLayuiCheckbox('topCheck');
    expect(await isChecked('#topCheck')).toBe(initial);
  });

  it('转义使用唯一复选框切换', async () => {
    const initial = await isChecked('#explain');
    await toggleLayuiCheckbox('explain');
    expect(await isChecked('#explain')).not.toBe(initial);
    await toggleLayuiCheckbox('explain');
    expect(await isChecked('#explain')).toBe(initial);
  });

  it('主题使用唯一按钮切换并恢复', async () => {
    const initial = await $('body').getAttribute('class');
    await safeClick('#themeToggle');
    expect(await $('body').getAttribute('class')).not.toBe(initial);
    await safeClick('#themeToggle');
    expect(await $('body').getAttribute('class')).toBe(initial);
  });

  it('树形结果可展开和折叠已加载节点', async () => {
    await formatInSplit('{"a":{"b":{"c":1}}}');
    await safeClick('#splitCollapseAll');
    expect((await $$('.tree-toggle[data-collapsed="true"]')).length).toBeGreaterThan(0);
    await safeClick('#splitExpandAll');
    expect((await $$('.tree-toggle[data-collapsed="false"]')).length).toBeGreaterThan(0);
  });
});
