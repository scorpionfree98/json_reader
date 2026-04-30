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
