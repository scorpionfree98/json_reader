import { formatInEditor, getElementHTML, resetWorkspace } from '../helpers/utils.js';
import { invalidCases } from '../fixtures/json-cases.js';

describe('JSON 错误定位功能 (TODO #3)', () => {
  beforeEach(async () => {
    await resetWorkspace('editor');
    await formatInEditor(invalidCases.missingComma.input);
  });

  it('输入错误 JSON 后应显示错误信息', async () => {
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
    await formatInEditor(invalidCases.missingComma.input);
    const result = await getElementHTML('#valid-result');
    expect(result).toContain(`第 ${invalidCases.missingComma.expectedLine} 行`);
  });

  it('多余逗号的错误应报错', async () => {
    await formatInEditor(invalidCases.trailingComma.input);
    const result = await getElementHTML('#valid-result');
    expect(result).not.toContain('格式正确');
  });
});
