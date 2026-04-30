import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('基础 JSON 功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  it('输入框应可编辑', async () => {
    const input = await $('#sourceText');
    await input.clearValue();
    await input.setValue('{"test": "hello"}');
    const value = await input.getValue();
    expect(value).toContain('test');
  });

  it('格式化正确的 JSON', async () => {
    await setInputValue('#sourceText', '{"name":"Alice","age":30}');
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });

  it('清空按钮应清除输入', async () => {
    await safeClick('#clearBtn');
    await browser.pause(500);
    const input = await $('#sourceText');
    const value = await input.getValue();
    expect(value).toBe('');
  });

  it('格式化后输出区应有内容', async () => {
    await setInputValue('#sourceText', '{"a":1,"b":2,"c":3}');
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const output = await $('#outputText');
    const value = await output.getValue();
    expect(value).toContain('"a"');
    expect(value).toContain('"b"');
  });

  it('格式化空输入不应崩溃', async () => {
    await setInputValue('#sourceText', '');
    await safeClick('#formatBtn');
    await browser.pause(500);
  });

  it('格式化非 JSON 文本应报错', async () => {
    await setInputValue('#sourceText', 'this is not json');
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const result = await getElementHTML('#valid-result');
    expect(result).not.toContain('格式正确');
  });
});
