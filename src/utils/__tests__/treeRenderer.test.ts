import $ from 'jquery';
import { renderTreeView, TreeRendererOptions } from '../treeRenderer';

jest.mock('../contentPreview', () => ({
  bindImagePreviewEvents: jest.fn(),
  createHtmlPreviewCard: jest.fn(() => null),
  createSandboxedHtmlPreview: jest.fn(() => null),
  detectImagePreview: jest.fn(() => null),
  markImagePreview: jest.fn()
}));
jest.mock('../latexRenderer', () => ({
  hasLatex: jest.fn(() => false),
  renderLatexString: jest.fn((value: string) => value)
}));

const createOptions = (copyToClipboard = jest.fn()): TreeRendererOptions => ({
  copyToClipboard,
  formatPath: path => path,
  explainEnabled: false,
  richContentEnabled: false
});

const directChildren = ($node: JQuery): JQuery => $node.children('.tree-children').first();
const directToggle = ($node: JQuery): JQuery =>
  $node.children('.tree-collection-header').first().children('.tree-toggle').first();

describe('renderTreeView batching', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="tree"></div>';
  });

  test('500 x 500 嵌套集合首屏只创建根级外壳', () => {
    const value = Array.from({ length: 500 }, () => Array.from({ length: 500 }, (_, index) => index));
    const $container = $('#tree');

    renderTreeView(value, $container, createOptions());

    expect($container.find('.tree-node')).toHaveLength(500);
    expect($container.find('.tree-item')).toHaveLength(0);
    expect($container.find('*').length).toBeLessThan(5000);
    expect($container.find('.tree-node .tree-toggle[data-collapsed="true"]')).toHaveLength(500);
  });

  test('普通小型嵌套集合保持默认展开', () => {
    const value = [{ user: { name: 'Alice', roles: ['admin', 'reviewer'] } }];
    const $container = $('#tree');
    renderTreeView(value, $container, createOptions());

    expect($container.text()).toContain('Alice');
    expect($container.text()).toContain('reviewer');
    expect($container.find('.tree-node .tree-toggle[data-collapsed="false"]').length).toBeGreaterThan(0);
  });

  test('预算耗尽后的嵌套集合展开时才加载且重复展开不追加节点', () => {
    const value = Array.from({ length: 500 }, (_, outer) =>
      Array.from({ length: 1200 }, (_, index) => `item-${outer}-${index}`));
    const $container = $('#tree');
    renderTreeView(value, $container, createOptions());

    const $firstNestedNode = $container.find('.tree-node').first();
    expect(directChildren($firstNestedNode).children()).toHaveLength(0);

    directToggle($firstNestedNode).trigger('click');
    expect(directChildren($firstNestedNode).children('.tree-item')).toHaveLength(500);
    expect(directChildren($firstNestedNode).children('.tree-load-more')).toHaveLength(1);
    directToggle($firstNestedNode).trigger('click');
    directToggle($firstNestedNode).trigger('click');
    expect(directChildren($firstNestedNode).children('.tree-item')).toHaveLength(500);
    expect(directChildren($firstNestedNode).children('.tree-load-more')).toHaveLength(1);
  });

  test.each([
    {
      label: '数组',
      value: Array.from({ length: 1200 }, (_, index) => `item-${index}`),
      firstMessage: '继续加载 500 项（剩余 700）',
      lastMessage: '继续加载 200 项（剩余 200）'
    },
    {
      label: '对象',
      value: Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [`key-${index}`, index])),
      firstMessage: '继续加载 500 个键（剩余 700）',
      lastMessage: '继续加载 200 个键（剩余 200）'
    }
  ])('1200 项平面$label保持每批 500 项的继续加载契约', ({ value, firstMessage, lastMessage }) => {
    const $container = $('#tree');
    renderTreeView(value, $container, createOptions());
    const $rootChildren = directChildren($container.children('.tree-node-root').first());

    expect($rootChildren.children('.tree-item')).toHaveLength(500);
    expect($rootChildren.children('.tree-load-more').text()).toContain(firstMessage);

    $rootChildren.children('.tree-load-more').trigger('click');
    expect($rootChildren.children('.tree-item')).toHaveLength(1000);
    expect($rootChildren.children('.tree-load-more').text()).toContain(lastMessage);

    $rootChildren.children('.tree-load-more').trigger('click');
    expect($rootChildren.children('.tree-item')).toHaveLength(1200);
    expect($rootChildren.children('.tree-load-more')).toHaveLength(0);
  });

  test('嵌套集合后加载的值仍通过单一委托事件复制', () => {
    const copyToClipboard = jest.fn();
    const value = [Array.from({ length: 501 }, (_, index) => `item-${index}`)];
    const $container = $('#tree');
    const options = createOptions(copyToClipboard);

    renderTreeView(value, $container, options);
    renderTreeView([], $container, options);

    const $nestedNode = $container.find('.tree-node').first();
    directToggle($nestedNode).trigger('click');
    directChildren($nestedNode).children('.tree-load-more').trigger('click');
    directChildren($nestedNode).find('.tree-value').last().trigger('dblclick');

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard).toHaveBeenCalledWith('item-500');
  });
});
