import { formatKeyPath, parsePathTokens } from '../jsonPath';

describe('parsePathTokens', () => {
  test('解析转义对象键和数组索引', () => {
    expect(parsePathTokens('["a\\\"b"][12]["c\\\\d"]')).toEqual([
      { type: 'object', value: 'a"b' },
      { type: 'array', value: '12' },
      { type: 'object', value: 'c\\d' }
    ]);
  });

  test.each([
    ['plain', []],
    ['[x]', []],
    ['["unterminated', []],
    ['["key"', []],
    ['["\\q"]', []],
    ['[0]tail', [{ type: 'array', value: '0' }]]
  ])('遇到无效或非路径内容时保留已解析部分: %s', (path, expected) => {
    expect(parsePathTokens(path)).toEqual(expected);
  });
});

describe('formatKeyPath', () => {
  const path = '["users"][0]["display\\\"name"]';

  test('内置格式同时处理对象键和数组索引', () => {
    expect(formatKeyPath(path, 'dot')).toBe('users[0].display"name');
    expect(formatKeyPath(path, 'jsonpath')).toBe('$.users[0].display"name');
    expect(formatKeyPath(path, 'bracket')).toBe("['users'][0]['display\"name']");
    expect(formatKeyPath(path, 'python')).toBe(".get('users')[0].get('display\"name')");
  });

  test('单引号和反斜杠在单引号格式中被转义', () => {
    const escapedPath = '["a\'b\\\\c"]';
    expect(formatKeyPath(escapedPath, 'bracket')).toBe("['a\\'b\\\\c']");
    expect(formatKeyPath(escapedPath, 'python')).toBe(".get('a\\'b\\\\c')");
  });

  test('自定义格式分别替换键和索引占位符', () => {
    expect(formatKeyPath('["users"][3]', 'custom', {
      key: '/key:{key}',
      index: '/index:{index}'
    })).toBe('/key:users/index:3');
  });

  test('自定义格式缺省时使用默认模板', () => {
    expect(formatKeyPath('["users"][3]', 'custom')).toBe('.users[3]');
  });

  test('空路径和未知格式保持兼容行为', () => {
    expect(formatKeyPath('', 'custom')).toBe('');
    expect(formatKeyPath(path, 'unknown')).toBe(path);
  });
});
