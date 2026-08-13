import $ from 'jquery';
import { highlightTextInElement, SearchController } from '../searchController';

const searchBar = (scope: 'editor' | 'tree') => {
  const prefix = scope === 'editor' ? 'editor' : 'tree';
  return `
    <button id="${prefix}SearchToggle"></button>
    <div id="${prefix}SearchBar" class="hidden">
      <input id="${prefix}SearchInput">
      <span id="${prefix}SearchCount"></span>
      <button id="${prefix}CaseSensitive"></button>
      <button id="${prefix}UseRegex"></button>
      <button id="${prefix}SearchPrev"></button>
      <button id="${prefix}SearchNext"></button>
      <button id="${prefix}SearchClear"></button>
    </div>`;
};

const runSearch = (scope: 'editor' | 'tree', query: string): void => {
  $(`#${scope}SearchInput`).val(query).trigger('input');
  jest.advanceTimersByTime(300);
};

describe('highlightTextInElement', () => {
  test('普通搜索高亮全部匹配并保留原始文本', () => {
    const element = document.createElement('span');
    element.textContent = 'Alpha alpha ALPHA';

    highlightTextInElement(element, 'alpha', false, null);

    expect(element.querySelectorAll('.search-highlight')).toHaveLength(3);
    expect(element.textContent).toBe('Alpha alpha ALPHA');
  });

  test('正则搜索处理多个文本节点、零宽匹配和非全局表达式', () => {
    const element = document.createElement('span');
    element.innerHTML = 'a<b>b</b>';

    highlightTextInElement(element, '', false, /(?=a|b)/g);

    expect(element.querySelectorAll('.search-highlight')).toHaveLength(2);
    expect(element.textContent).toBe('ab');

    element.textContent = 'aba';
    highlightTextInElement(element, 'a', false, /a/);
    expect(element.querySelectorAll('.search-highlight')).toHaveLength(2);
    expect(element.textContent).toBe('aba');
  });
});

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <div id="resultWorkspace" data-result-view="highlight"></div>
      ${searchBar('editor')}
      ${searchBar('tree')}
      <div id="json-display"></div>
      <div id="tree-view"></div>`;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    controller = new SearchController();
    controller.bind();
  });

  afterEach(() => {
    controller.dispose();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('编辑器搜索支持导航、大小写敏感和重复绑定', () => {
    $('#json-display').html('<span class="json-string">Alpha alpha</span>');
    controller.bind();
    $('#editorSearchToggle').trigger('click');
    runSearch('editor', 'alpha');

    expect($('#editorSearchBar').hasClass('hidden')).toBe(false);
    expect($('#editorSearchCount').text()).toBe('1/2');
    expect($('#json-display .search-highlight-active').text()).toBe('Alpha');

    $('#editorSearchNext').trigger('click');
    expect($('#editorSearchCount').text()).toBe('2/2');
    expect($('#json-display .search-highlight-active').text()).toBe('alpha');
    $('#editorSearchPrev').trigger('click');
    expect($('#editorSearchCount').text()).toBe('1/2');

    $('#editorCaseSensitive').trigger('click');
    expect($('#editorCaseSensitive').hasClass('active')).toBe(true);
    expect($('#editorSearchCount').text()).toBe('1/1');
    expect($('#json-display').text()).toBe('Alpha alpha');
  });

  test('正则模式标记无效表达式并跳过 KaTeX 内容', () => {
    $('#json-display').html(`
      <span class="json-string">item-12</span>
      <span class="json-string"><span class="katex">item-34</span></span>`);
    $('#editorUseRegex').trigger('click');
    runSearch('editor', 'item-\\d+');

    expect($('#editorSearchCount').text()).toBe('1/1');
    expect($('#json-display .search-highlight-active').text()).toBe('item-12');

    runSearch('editor', '[');
    expect($('#editorSearchInput').hasClass('regex-error')).toBe(true);
    expect($('#editorSearchCount').text()).toBe('正则无效');
  });

  test('没有结果时显示结果数，空查询恢复初始状态', () => {
    $('#json-display').html('<span class="json-key">name</span>');
    runSearch('editor', 'missing');
    expect($('#editorSearchCount').text()).toBe('0 结果');

    runSearch('editor', '');
    expect($('#editorSearchCount').text()).toBe('');
    expect($('#editorSearchInput').hasClass('regex-error')).toBe(false);
  });

  test('激活树搜索结果时展开全部折叠祖先', () => {
    $('#tree-view').html(`
      <div class="tree-node">
        <div class="tree-collection-header">
          <span class="tree-toggle" data-collapsed="true">▶</span>
          <span class="tree-ellipsis"></span>
        </div>
        <div class="tree-children collapsed"><span class="tree-value">needle</span></div>
        <div class="tree-collection-footer hidden">}</div>
      </div>`);

    runSearch('tree', 'needle');

    expect($('#tree-view .tree-children').hasClass('collapsed')).toBe(false);
    expect($('#tree-view .tree-ellipsis').hasClass('hidden')).toBe(true);
    expect($('#tree-view .tree-collection-footer').hasClass('hidden')).toBe(false);
    expect($('#tree-view .tree-toggle').attr('data-collapsed')).toBe('false');
    expect($('#tree-view .tree-toggle').text()).toBe('▼');
  });

  test('Enter、Shift+Enter 和 Escape 控制导航及关闭', () => {
    $('#tree-view').html('<span class="tree-value">x x</span>');
    $('#treeSearchToggle').trigger('click');
    runSearch('tree', 'x');

    $('#treeSearchInput').trigger($.Event('keydown', { key: 'Enter' }));
    expect($('#treeSearchCount').text()).toBe('2/2');
    $('#treeSearchInput').trigger($.Event('keydown', { key: 'Enter', shiftKey: true }));
    expect($('#treeSearchCount').text()).toBe('1/2');
    $('#treeSearchInput').trigger($.Event('keydown', { key: 'Escape' }));
    expect($('#treeSearchBar').hasClass('hidden')).toBe(true);
    expect($('#treeSearchCount').text()).toBe('');
    expect($('#tree-view .search-highlight, #tree-view .search-highlight-active')).toHaveLength(0);
    expect($('#tree-view').text()).toBe('x x');
  });

  test('Ctrl+F 根据当前视图打开对应搜索栏', () => {
    $(document).trigger($.Event('keydown', { key: 'f', ctrlKey: true }));
    expect($('#editorSearchBar').hasClass('hidden')).toBe(false);

    $('#resultWorkspace').attr('data-result-view', 'tree');
    $(document).trigger($.Event('keydown', { key: 'f', metaKey: true }));
    expect($('#treeSearchBar').hasClass('hidden')).toBe(false);
  });

  test('清理按钮移除高亮并恢复完整内容', () => {
    $('#json-display').html('<span class="json-number">10101</span>');
    $('#editorSearchToggle').trigger('click');
    runSearch('editor', '1');
    expect($('#json-display .search-highlight, #json-display .search-highlight-active')).toHaveLength(3);

    $('#editorSearchClear').trigger('click');
    expect($('#editorSearchBar').hasClass('hidden')).toBe(true);
    expect($('#editorSearchInput').val()).toBe('');
    expect($('#json-display').text()).toBe('10101');
  });

  test('销毁控制器会取消待执行搜索并解绑事件', () => {
    $('#json-display').html('<span class="json-string">pending</span>');
    $('#editorSearchInput').val('pending').trigger('input');
    controller.dispose();
    jest.advanceTimersByTime(300);

    expect($('#editorSearchCount').text()).toBe('');
    $(document).trigger($.Event('keydown', { key: 'f', ctrlKey: true }));
    expect($('#editorSearchBar').hasClass('hidden')).toBe(true);
  });

  test('关闭搜索栏会取消延迟聚焦', () => {
    const focus = jest.fn();
    $('#editorSearchInput').on('focus.test', focus);
    $('#editorSearchToggle').trigger('click');
    $('#editorSearchClear').trigger('click');
    jest.advanceTimersByTime(100);

    expect(focus).not.toHaveBeenCalled();
  });
});
