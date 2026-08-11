import { formatInEditor, getControlValue, resetWorkspace, safeClick, setInputValue, toggleLayuiCheckbox, waitForText, waitForVisibility } from '../helpers/utils.js';
import { serializeCase, validCases } from '../fixtures/json-cases.js';

describe('基础 JSON 功能', () => {
  beforeEach(async () => {
    await resetWorkspace('editor');
  });

  it('输入框应可编辑', async () => {
    await setInputValue('#sourceText', '{"test": "hello"}');
    const value = await getControlValue('#sourceText');
    expect(value).toContain('test');
  });

  it('格式化正确的 JSON', async () => {
    await formatInEditor(serializeCase(validCases.primitives));
    await waitForText('#valid-result', '格式正确');
  });

  it('清空按钮应清除输入', async () => {
    await safeClick('#clearBtn');
    const value = await getControlValue('#sourceText');
    expect(value).toBe('');
  });

  it('格式化后输出区应有内容', async () => {
    await formatInEditor(serializeCase(validCases.nested));
    const output = await waitForVisibility('#json-display');
    const value = await output.getText();
    for (const expected of validCases.nested.expectedText) expect(value).toContain(expected);
  });

  it('格式化空输入不应崩溃', async () => {
    await setInputValue('#sourceText', '');
    await safeClick('#formatBtn');
    expect(await getControlValue('#sourceText')).toBe('');
  });

  it('格式化非 JSON 文本应报错', async () => {
    await setInputValue('#sourceText', 'this is not json');
    await safeClick('#formatBtn');
    await waitForText('#valid-result', /Unexpected|JSON|位置|Syntax/i);
    expect(await $('#json-display').getText()).toBe('');
  });

  it('勾选 JSON Str 后应自动解析最外层 JSON 字符串', async () => {
    const inner = JSON.stringify({ user: { name: '张三' }, enabled: true });
    await setInputValue('#sourceText', JSON.stringify(inner));
    await toggleLayuiCheckbox('parseJsonString');
    await waitForText('#json-display', '张三');
    expect(await getControlValue('#sourceText')).toContain('"user"');
    await toggleLayuiCheckbox('parseJsonString');
  });

  it('未勾选 JSON Str 时应保留外层字符串', async () => {
    const inner = JSON.stringify({ name: '保留字符串' });
    const encoded = JSON.stringify(inner);
    await formatInEditor(encoded);
    expect(await getControlValue('#sourceText')).toBe(encoded);
  });

});
