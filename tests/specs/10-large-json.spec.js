import { safeClick, setInputValue, getElementHTML, switchToEditor, waitForText } from '../helpers/utils.js';

describe('大 JSON 和边界情况', () => {
  before(async () => {
    await browser.pause(2000);
    await switchToEditor();
  });

  beforeEach(async () => {
    await safeClick('#clearBtn');
    await browser.pause(500);
  });

  it('1000+ 键值对 JSON 格式化不崩溃', async () => {
    // 生成包含 1000 个键值对的 JSON 对象
    const keys = [];
    for (let i = 0; i < 1000; i++) {
      keys.push(`"key_${i}": ${i}`);
    }
    const largeJson = `{${keys.join(',')}}`;

    await setInputValue('#sourceText', largeJson);

    await safeClick('#formatBtn');
    await browser.pause(3000);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });

  it('50 层嵌套 JSON 正常渲染', async () => {
    // 构建 50 层嵌套对象
    let nestedJson = '{"value":"deep"}';
    for (let i = 0; i < 50; i++) {
      nestedJson = `{"level":${nestedJson}}`;
    }

    await setInputValue('#sourceText', nestedJson);

    await safeClick('#formatBtn');
    await browser.pause(2000);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });

  it('超过 50 层显示深度限制提示', async () => {
    // 构建 55 层嵌套对象
    let nestedJson = '{"value":"deep"}';
    for (let i = 0; i < 55; i++) {
      nestedJson = `{"level":${nestedJson}}`;
    }

    await setInputValue('#sourceText', nestedJson);

    await safeClick('#formatBtn');
    await browser.pause(2000);

    const outputHtml = await getElementHTML('#json-display');
    expect(outputHtml).toContain('max depth reached');
  });

  it('5000 层 JSON 应显示明确错误且应用可继续格式化', async () => {
    const tooDeepJson = `${'{"value":'.repeat(5000)}0${'}'.repeat(5000)}`;
    await setInputValue('#sourceText', tooDeepJson);
    await safeClick('#formatBtn');
    await waitForText('#valid-result', 'JSON 嵌套超过 100 层', 10000);

    await setInputValue('#sourceText', '{"recovered":true}');
    await safeClick('#formatBtn');
    await waitForText('#valid-result', '格式正确');
    expect(await getElementHTML('#json-display')).toContain('recovered');
  });

  it('空 JSON {} 正常处理', async () => {
    await setInputValue('#sourceText', '{}');
    await safeClick('#formatBtn');
    await browser.pause(500);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });

  it('空数组 [] 正常处理', async () => {
    await setInputValue('#sourceText', '[]');
    await safeClick('#formatBtn');
    await browser.pause(500);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });

  it('Unicode 字符和 emoji 正常显示', async () => {
    const unicodeJson = '{"chinese":"你好世界","emoji":"🎉🚀💻","japanese":"こんにちは"}';
    await setInputValue('#sourceText', unicodeJson);
    await safeClick('#formatBtn');
    await browser.pause(1000);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');

    const outputHtml = await getElementHTML('#json-display');
    expect(outputHtml).toContain('你好世界');
  });

  it('转义字符正确处理', async () => {
    const escapedJson = '{"newline":"line1\\nline2","tab":"col1\\tcol2"}';
    await setInputValue('#sourceText', escapedJson);
    await safeClick('#formatBtn');
    await browser.pause(1000);

    const result = await getElementHTML('#valid-result');
    expect(result).toContain('格式正确');
  });
});
