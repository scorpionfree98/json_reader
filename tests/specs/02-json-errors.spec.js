import { safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('JSON 错误定位功能 (TODO #3)', () => {
  before(async () => {
    await browser.pause(1000);
  });

  const badJson = `{
  "user": {
    "name": "Alice",
    "age": 30
  },
  "settings": {
    "theme": "dark",
    "notifications": true
    "language": "zh-CN"
  }
}`;

  it('输入错误 JSON 后应显示错误信息', async () => {
    await setInputValue('#sourceText', badJson);
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const result = await getElementHTML('#valid-result');
    expect(result).not.toContain('格式正确');
  });

  it('错误信息应包含"位置"', async () => {
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('位置');
  });

  it('错误信息应包含行号', async () => {
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('行');
  });

  it('错误信息应包含上下文', async () => {
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('上下文');
  });

  it('错误信息应标记错误行（→）', async () => {
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('→');
  });

  it('缺少逗号的错误应定位到正确行', async () => {
    const missingComma = `{"a": 1\n"b": 2}`;
    await setInputValue('#sourceText', missingComma);
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const result = await getElementHTML('#valid-result');
    expect(result).toContain('行');
  });

  it('多余逗号的错误应报错', async () => {
    const trailingComma = '{"a": 1, "b": 2,}';
    await setInputValue('#sourceText', trailingComma);
    await safeClick('#formatBtn');
    await browser.pause(1000);
    const result = await getElementHTML('#valid-result');
    expect(result).not.toContain('格式正确');
  });
});
