import {
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_SOURCE_SIZE,
  parseJsonSource
} from '../jsonParser';

const nestedObjectSource = (depth: number): string =>
  `${'{"value":'.repeat(depth)}0${'}'.repeat(depth)}`;

const nestedArraySource = (depth: number): string =>
  `${'['.repeat(depth)}0${']'.repeat(depth)}`;

describe('parseJsonSource', () => {
  test('空白输入返回 empty', () => {
    expect(parseJsonSource('  \n', { parseJsonString: false })).toEqual({ ok: false, kind: 'empty' });
  });

  test('超过大小限制时不尝试解析', () => {
    expect(parseJsonSource('{"value":1}', { parseJsonString: false, maxSize: 4 })).toEqual({
      ok: false,
      kind: 'too-large',
      maxSize: 4
    });
  });

  test('普通 JSON 返回值和格式化结果', () => {
    expect(parseJsonSource('{"name":"Alice","active":true}', { parseJsonString: false })).toEqual({
      ok: true,
      value: { name: 'Alice', active: true },
      formatted: '{\n  "name": "Alice",\n  "active": true\n}'
    });
  });

  test.each(['null', 'true', '42', '"text"'])('支持顶层 JSON 原始值 %s', source => {
    const result = parseJsonSource(source, { parseJsonString: false });
    expect(result.ok).toBe(true);
  });

  test('只解析一层 JSON 文本', () => {
    const inner = JSON.stringify({ nested: { value: 1 } });
    expect(parseJsonSource(JSON.stringify(inner), { parseJsonString: true })).toEqual({
      ok: true,
      value: { nested: { value: 1 } },
      formatted: '{\n  "nested": {\n    "value": 1\n  }\n}'
    });
  });

  test('关闭 JSON 文本解析时保留外层字符串', () => {
    const inner = JSON.stringify({ value: 1 });
    expect(parseJsonSource(JSON.stringify(inner), { parseJsonString: false })).toEqual({
      ok: true,
      value: inner,
      formatted: JSON.stringify(inner)
    });
  });

  test('普通对象字段中的 JSON 字符串不会递归解析', () => {
    const source = JSON.stringify({ payload: JSON.stringify({ value: 1 }) });
    const result = parseJsonSource(source, { parseJsonString: true });
    expect(result.ok && result.value).toEqual({ payload: '{"value":1}' });
  });

  test('外层 JSON 错误保留外层错误源', () => {
    const result = parseJsonSource('{"value":}', { parseJsonString: false });
    expect(result).toMatchObject({ ok: false, kind: 'invalid', stage: 'outer', errorSource: '{"value":}' });
  });

  test('内层 JSON 错误保留解码后的错误源', () => {
    const result = parseJsonSource(JSON.stringify('{"value":}'), { parseJsonString: true });
    expect(result).toMatchObject({ ok: false, kind: 'invalid', stage: 'inner', errorSource: '{"value":}' });
  });

  test('默认限制为 5MB', () => {
    expect(DEFAULT_MAX_JSON_SOURCE_SIZE).toBe(5 * 1024 * 1024);
  });

  test('默认嵌套限制为 100 层', () => {
    expect(DEFAULT_MAX_JSON_DEPTH).toBe(100);
  });

  test.each([
    ['对象', nestedObjectSource],
    ['数组', nestedArraySource]
  ])('%s正好达到配置深度时仍可格式化', (_label, createSource) => {
    const result = parseJsonSource(createSource(50), {
      parseJsonString: false,
      maxDepth: 50
    });

    expect(result.ok).toBe(true);
  });

  test.each([
    ['对象', nestedObjectSource],
    ['数组', nestedArraySource]
  ])('%s超过配置深度时返回结构化错误', (_label, createSource) => {
    const source = createSource(51);
    const result = parseJsonSource(source, {
      parseJsonString: false,
      maxDepth: 50
    });

    expect(result).toMatchObject({
      ok: false,
      kind: 'too-deep',
      maxDepth: 50,
      detectedDepth: 51,
      errorSource: source
    });
    expect(result.ok === false && result.kind === 'too-deep' && result.error).toBeInstanceOf(RangeError);
  });

  test.each([5000, 10000])('%i 层 JSON 不抛异常且不会进入格式化阶段', depth => {
    const source = nestedObjectSource(depth);
    const stringify = jest.spyOn(JSON, 'stringify');

    const result = parseJsonSource(source, { parseJsonString: false });

    expect(result).toMatchObject({
      ok: false,
      kind: 'too-deep',
      maxDepth: DEFAULT_MAX_JSON_DEPTH,
      detectedDepth: DEFAULT_MAX_JSON_DEPTH + 1,
      errorSource: source
    });
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  test('JSON Str 内层过深时保留解码后的错误源', () => {
    const innerSource = nestedArraySource(101);
    const result = parseJsonSource(JSON.stringify(innerSource), { parseJsonString: true });

    expect(result).toMatchObject({
      ok: false,
      kind: 'too-deep',
      maxDepth: DEFAULT_MAX_JSON_DEPTH,
      detectedDepth: DEFAULT_MAX_JSON_DEPTH + 1,
      errorSource: innerSource
    });
  });

  test('格式化异常返回 format-error 而不是向调用方抛出', () => {
    const formatError = new Error('format failed');
    const stringify = jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw formatError;
    });

    expect(parseJsonSource('{"value":1}', { parseJsonString: false })).toEqual({
      ok: false,
      kind: 'format-error',
      error: formatError,
      errorSource: '{"value":1}'
    });
    stringify.mockRestore();
  });
});
