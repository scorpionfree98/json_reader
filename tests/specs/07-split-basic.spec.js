import { getControlValue, resetWorkspace, safeClick, setInputValue, waitForText } from '../helpers/utils.js';

describe('统一工作台基础功能', () => {
  beforeEach(async () => {
    await resetWorkspace('split');
  });

  it('唯一输入框可编辑', async () => {
    await setInputValue('#sourceText', '{"test":"hello"}');
    expect(await getControlValue('#sourceText')).toContain('test');
  });

  it('正确 JSON 同时更新源码、状态和树形结果', async () => {
    await setInputValue('#sourceText', '{"name":"Alice","age":30}');
    await safeClick('#formatBtn');
    await waitForText('#valid-result', '格式正确');
    await waitForText('#tree-view', 'Alice');
    expect((await $$('#tree-view .tree-key')).length).toBeGreaterThan(0);
    expect(await getControlValue('#sourceText')).toContain('\n');
  });

  it('错误 JSON 显示统一错误状态', async () => {
    await setInputValue('#sourceText', '{invalid}');
    await safeClick('#formatBtn');
    await waitForText('#valid-result', 'JSON');
  });

  it('清空按钮清除输入和两种结果', async () => {
    await setInputValue('#sourceText', '{"a":1}');
    await safeClick('#formatBtn');
    await safeClick('#clearBtn');
    expect(await getControlValue('#sourceText')).toBe('');
    expect(await $('#tree-view').getText()).toBe('');
    expect(await $('#json-display').getText()).toBe('');
    expect(await $('#valid-result').getText()).toContain('等待输入');
  });

  it('格式化空输入不崩溃且清除旧结果', async () => {
    await setInputValue('#sourceText', '{"stale":true}');
    await safeClick('#formatBtn');
    await setInputValue('#sourceText', '');
    await safeClick('#formatBtn');
    expect(await $('#tree-view').getText()).toBe('');
    expect(await $('#valid-result').getText()).toContain('等待输入');
  });
});
