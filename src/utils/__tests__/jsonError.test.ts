import { findJsonErrorPosition, parseJsonError } from '../jsonError';

describe('findJsonErrorPosition', () => {
  test.each([
    '{}',
    '[]',
    '{"text":"value","escaped":"\\u4e2d\\n","items":[true,false,null,-1.5e+2]}',
    '  [0, 1, {"nested": []}]  '
  ])('合法 JSON 返回 -1: %s', source => {
    expect(findJsonErrorPosition(source)).toBe(-1);
  });

  test.each([
    ['{"value" 1}', 9],
    ['{"value":1 "next":2}', 11],
    ['[1 2]', 3],
    ['{"value":}', 9],
    ['tru', 0],
    ['01', 1]
  ])('定位结构或字面量错误: %s', (source, expected) => {
    expect(findJsonErrorPosition(source)).toBe(expected);
  });

  test.each([
    ['{"value":"\\q"}', 11],
    ['{"value":"\\u12xz"}', 12],
    ['{"value":"line\nbreak"}', 14],
    ['{"value":"open}', 15]
  ])('定位字符串错误: %s', (source, expected) => {
    expect(findJsonErrorPosition(source)).toBe(expected);
  });

  test.each([
    ['{"value":1', 10],
    ['[1,2', 4]
  ])('定位未闭合容器: %s', (source, expected) => {
    expect(findJsonErrorPosition(source)).toBe(expected);
  });
});

describe('parseJsonError', () => {
  test('错误消息没有位置时使用扫描结果', () => {
    const result = parseJsonError('{\n  "value": 1\n  "next": 2\n}', 'JSON 格式错误');
    expect(result).toContain('第 3 行');
    expect(result).toContain('上下文');
  });

  test('错误行超出输入范围时不生成上下文', () => {
    const result = parseJsonError('{}', 'error at line 8 column 3');
    expect(result).toContain('第 8 行');
    expect(result).not.toContain('上下文');
  });

  test('无法定位合法 JSON 时只返回转义后的消息', () => {
    expect(parseJsonError('{}', '<unknown>')).toBe('&lt;unknown&gt;');
  });
});
