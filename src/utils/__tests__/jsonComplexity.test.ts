import { DEFAULT_MAX_EDITOR_RENDER_NODES, exceedsJsonNodeLimit } from '../jsonComplexity';

describe('exceedsJsonNodeLimit', () => {
  test('统计嵌套对象和数组中的所有节点', () => {
    const value = { list: [1, { nested: true }] };
    expect(exceedsJsonNodeLimit(value, 5)).toBe(false);
    expect(exceedsJsonNodeLimit(value, 4)).toBe(true);
  });

  test('大型数组达到限制后立即返回', () => {
    expect(exceedsJsonNodeLimit(new Array(DEFAULT_MAX_EDITOR_RENDER_NODES).fill(0))).toBe(true);
  });

  test('原始值不会超过默认限制', () => {
    expect(exceedsJsonNodeLimit('text')).toBe(false);
  });
});
