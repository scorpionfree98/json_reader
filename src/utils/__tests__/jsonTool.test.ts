// Mock setup must come before imports
const mockJQuery = Object.assign(
  (selector: string) => ({
    val: jest.fn().mockReturnValue('default'),
    prop: jest.fn().mockReturnValue(false),
    html: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    empty: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    trigger: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnValue({ off: jest.fn().mockReturnValue({ on: jest.fn() }) }),
    children: jest.fn().mockReturnThis(),
    parent: jest.fn().mockReturnThis(),
    closest: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    css: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnValue(true),
    hide: jest.fn().mockReturnThis(),
    show: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
  }),
  { fn: {} }
);

jest.mock('jquery', () => ({ __esModule: true, default: mockJQuery }));
jest.mock('katex', () => ({
  __esModule: true,
  default: { renderToString: jest.fn((tex: string) => `<span>${tex}</span>`) },
}));
jest.mock('katex/dist/katex.min.css', () => ({}));
jest.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: jest.fn(),
  writeText: jest.fn(),
}));

import { jsonTool } from '../jsonTool';
import { hasLatex, renderLatexString, escapeHtml } from '../jsonTool';

// ==================== parsePathTokens tests ====================

describe('parsePathTokens', () => {
  test('parses a single object key', () => {
    const tokens = jsonTool.parsePathTokens('["name"]');
    expect(tokens).toEqual([{ type: 'object', value: 'name' }]);
  });

  test('parses a single array index', () => {
    const tokens = jsonTool.parsePathTokens('[0]');
    expect(tokens).toEqual([{ type: 'array', value: '0' }]);
  });

  test('parses a mixed path into 3 tokens', () => {
    const tokens = jsonTool.parsePathTokens('["users"][0]["name"]');
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: 'object', value: 'users' });
    expect(tokens[1]).toEqual({ type: 'array', value: '0' });
    expect(tokens[2]).toEqual({ type: 'object', value: 'name' });
  });

  test('returns empty array for empty path', () => {
    const tokens = jsonTool.parsePathTokens('');
    expect(tokens).toEqual([]);
  });

  test('parses multi-level array indices', () => {
    const tokens = jsonTool.parsePathTokens('[0][1][2]');
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: 'array', value: '0' });
    expect(tokens[1]).toEqual({ type: 'array', value: '1' });
    expect(tokens[2]).toEqual({ type: 'array', value: '2' });
  });
});

// ==================== formatKeyPath tests ====================

describe('formatKeyPath', () => {
  test('default format returns path as-is', () => {
    const path = '["users"][0]["name"]';
    expect(jsonTool.formatKeyPath(path, 'default')).toBe(path);
  });

  test('dot format converts object keys to dot notation', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'dot')).toBe('users[0].name');
  });

  test('jsonpath format prepends $ and uses dot notation', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'jsonpath')).toBe('$users[0].name');
  });

  test('bracket format converts double quotes to single quotes', () => {
    expect(jsonTool.formatKeyPath('["users"][0]["name"]', 'bracket')).toBe("['users'][0]['name']");
  });

  test('python format uses .get() for object keys only', () => {
    expect(jsonTool.formatKeyPath('["users"]["name"]', 'python')).toBe(".get('users').get('name')");
  });

  test('empty path returns empty string for all formats', () => {
    const formats = ['default', 'dot', 'jsonpath', 'bracket', 'python', 'custom'];
    for (const format of formats) {
      expect(jsonTool.formatKeyPath('', format)).toBe('');
    }
  });

  test('unknown format falls back to default (returns path as-is)', () => {
    const path = '["users"][0]["name"]';
    expect(jsonTool.formatKeyPath(path, 'nonexistent_format')).toBe(path);
  });
});

// ==================== hasLatex tests ====================

describe('hasLatex', () => {
  it('检测行内公式 $...$', () => {
    expect(hasLatex('The formula is $E=mc^2$')).toBe(true);
  });
  it('检测块级公式 $$...$$', () => {
    expect(hasLatex('$$\\int_0^1 x dx$$')).toBe(true);
  });
  it('普通文本返回 false', () => {
    expect(hasLatex('Hello World')).toBe(false);
  });
  it('空字符串返回 false', () => {
    expect(hasLatex('')).toBe(false);
  });
  it('检测 frac/times 关键字', () => {
    expect(hasLatex('{frac}')).toBe(true);
    expect(hasLatex('{times}')).toBe(true);
  });
});

// ==================== renderLatexString tests ====================

describe('renderLatexString', () => {
  it('行内公式包含 latex-inline', () => {
    expect(renderLatexString('text $x^2$ more')).toContain('latex-inline');
  });
  it('块级公式包含 latex-block', () => {
    expect(renderLatexString('$$x^2$$')).toContain('latex-block');
  });
  it('普通文本原样返回', () => {
    expect(renderLatexString('plain text')).toBe('plain text');
  });
  it('混合公式同时包含 latex-inline 和 latex-block', () => {
    const result = renderLatexString('before $a$ middle $$b$$ after');
    expect(result).toContain('latex-inline');
    expect(result).toContain('latex-block');
  });
});

// ==================== parseJsonError tests ====================

describe('parseJsonError', () => {
  it('提取 Chrome 格式 position', () => {
    const result = jsonTool.parseJsonError('{"a": 1,}', 'Unexpected token } in JSON at position 9');
    expect(result).toContain('行');
  });
  it('提取 Firefox 格式 line/column', () => {
    const result = jsonTool.parseJsonError('{\n  "a": 1,\n}', 'JSON.parse: expected property name at line 3 column 1');
    expect(result).toContain('第 3 行');
    expect(result).toContain('第 1 列');
  });
  it('从 position 计算行号和列号', () => {
    const result = jsonTool.parseJsonError('{\n  "a": 1,\n  "b": 2,\n}', 'Unexpected token } in JSON at position 23');
    expect(result).toContain('行');
  });
  it('显示错误上下文', () => {
    const result = jsonTool.parseJsonError('{\n  "a": 1,\n  "b": 2,\n}', 'Unexpected token } in JSON at position 23');
    expect(result).toContain('上下文');
  });
  it('错误行标记 → 前缀', () => {
    const result = jsonTool.parseJsonError('{\n  "a": 1,\n}', 'Unexpected token } in JSON at position 14');
    expect(result).toContain('→');
  });
  it('HTML 转义防止 XSS', () => {
    const result = jsonTool.parseJsonError('{}', '<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

// ==================== escapeHtml tests ====================

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<div>"test" & \'value\'</div>')).not.toContain('<div>');
  });
  it('普通文本不变', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
  it('空字符串返回空字符串', () => {
    expect(escapeHtml('')).toBe('');
  });
});
