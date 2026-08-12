import $ from 'jquery';

export type SearchScope = 'editor' | 'tree';

interface SearchState {
  matches: Element[];
  currentIndex: number;
  caseSensitive: boolean;
  useRegex: boolean;
}

interface SearchConfig {
  bar: string;
  input: string;
  count: string;
  container: string;
  toggle: string;
  previous: string;
  next: string;
  clear: string;
  caseSensitive: string;
  useRegex: string;
  valueSelectors: string;
}

const SEARCH_CONFIG: Record<SearchScope, SearchConfig> = {
  editor: {
    bar: '#editorSearchBar',
    input: '#editorSearchInput',
    count: '#editorSearchCount',
    container: '#json-display',
    toggle: '#editorSearchToggle',
    previous: '#editorSearchPrev',
    next: '#editorSearchNext',
    clear: '#editorSearchClear',
    caseSensitive: '#editorCaseSensitive',
    useRegex: '#editorUseRegex',
    valueSelectors: '.json-key, .json-string, .json-number, .json-boolean, .json-null'
  },
  tree: {
    bar: '#treeSearchBar',
    input: '#treeSearchInput',
    count: '#treeSearchCount',
    container: '#tree-view',
    toggle: '#treeSearchToggle',
    previous: '#treeSearchPrev',
    next: '#treeSearchNext',
    clear: '#treeSearchClear',
    caseSensitive: '#treeCaseSensitive',
    useRegex: '#treeUseRegex',
    valueSelectors: '.tree-key, .tree-value'
  }
};

const createState = (): SearchState => ({
  matches: [],
  currentIndex: -1,
  caseSensitive: false,
  useRegex: false
});

const clearHighlights = ($container: JQuery): void => {
  $container.find('.search-highlight, .search-highlight-active').each(function() {
    $(this).replaceWith($(this).text());
  });
};

export const highlightTextInElement = (
  element: HTMLElement,
  query: string,
  caseSensitive: boolean,
  regex: RegExp | null
): void => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || '';
    const parent = textNode.parentNode;
    if (!parent) continue;
    const fragments: (Text | HTMLElement)[] = [];

    if (regex) {
      const pattern = new RegExp(regex.source, regex.global ? regex.flags : `${regex.flags}g`);
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = match[0];
        fragments.push(span);
        lastIndex = match.index + match[0].length;
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
      if (lastIndex < text.length) fragments.push(document.createTextNode(text.substring(lastIndex)));
    } else {
      const searchText = caseSensitive ? text : text.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      let lastIndex = 0;
      let matchIndex = searchText.indexOf(searchQuery);
      while (matchIndex !== -1) {
        if (matchIndex > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, matchIndex)));
        }
        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = text.substring(matchIndex, matchIndex + query.length);
        fragments.push(span);
        lastIndex = matchIndex + query.length;
        matchIndex = searchText.indexOf(searchQuery, lastIndex);
      }
      if (lastIndex < text.length) fragments.push(document.createTextNode(text.substring(lastIndex)));
    }

    if (fragments.length > 0) {
      fragments.forEach(fragment => parent.insertBefore(fragment, textNode));
      parent.removeChild(textNode);
    }
  }
};

export class SearchController {
  private readonly states: Record<SearchScope, SearchState> = {
    editor: createState(),
    tree: createState()
  };
  private readonly debounceTimers: Partial<Record<SearchScope, ReturnType<typeof setTimeout>>> = {};
  private readonly focusTimers: Partial<Record<SearchScope, ReturnType<typeof setTimeout>>> = {};

  bind(): void {
    this.disposeEvents();
    (Object.keys(SEARCH_CONFIG) as SearchScope[]).forEach(scope => this.bindScope(scope));
    $(document).on('keydown.jsonSearch', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        this.toggle($('#editor-mode').hasClass('hidden') ? 'tree' : 'editor', true);
      }
    });
  }

  dispose(): void {
    this.disposeEvents();
    (Object.keys(SEARCH_CONFIG) as SearchScope[]).forEach(scope => {
      this.cancelDebounce(scope);
      this.cancelFocus(scope);
    });
  }

  clear(scope: SearchScope): void {
    const config = SEARCH_CONFIG[scope];
    this.cancelDebounce(scope);
    $(config.input).val('').removeClass('regex-error');
    $(config.count).text('');
    this.states[scope].matches = [];
    this.states[scope].currentIndex = -1;
    clearHighlights($(config.container));
  }

  private bindScope(scope: SearchScope): void {
    const config = SEARCH_CONFIG[scope];
    $(config.toggle).on('click.jsonSearch', () => this.toggle(scope));
    $(config.input)
      .on('input.jsonSearch', () => {
        const timer = this.debounceTimers[scope];
        if (timer) clearTimeout(timer);
        this.debounceTimers[scope] = setTimeout(() => {
          delete this.debounceTimers[scope];
          this.search(scope);
        }, 300);
      })
      .on('keydown.jsonSearch', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.navigate(scope, event.shiftKey ? 'prev' : 'next');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.toggle(scope, false);
        }
      });
    $(config.caseSensitive).on('click.jsonSearch', () => {
      const state = this.states[scope];
      state.caseSensitive = !state.caseSensitive;
      $(config.caseSensitive).toggleClass('active', state.caseSensitive);
      this.search(scope);
    });
    $(config.useRegex).on('click.jsonSearch', () => {
      const state = this.states[scope];
      state.useRegex = !state.useRegex;
      $(config.useRegex).toggleClass('active', state.useRegex);
      this.search(scope);
    });
    $(config.previous).on('click.jsonSearch', () => this.navigate(scope, 'prev'));
    $(config.next).on('click.jsonSearch', () => this.navigate(scope, 'next'));
    $(config.clear).on('click.jsonSearch', () => this.toggle(scope, false));
  }

  private disposeEvents(): void {
    $(document).off('.jsonSearch');
    Object.values(SEARCH_CONFIG).forEach(config => {
      [config.toggle, config.input, config.caseSensitive, config.useRegex, config.previous, config.next, config.clear]
        .forEach(selector => $(selector).off('.jsonSearch'));
    });
  }

  private toggle(scope: SearchScope, show?: boolean): void {
    const config = SEARCH_CONFIG[scope];
    const $bar = $(config.bar);
    this.cancelFocus(scope);
    $bar.toggleClass('hidden', show === undefined ? !$bar.hasClass('hidden') : !show);
    if ($bar.hasClass('hidden')) this.clear(scope);
    else {
      this.focusTimers[scope] = setTimeout(() => {
        delete this.focusTimers[scope];
        $(config.input).trigger('focus');
      }, 100);
    }
  }

  private cancelDebounce(scope: SearchScope): void {
    const timer = this.debounceTimers[scope];
    if (timer) clearTimeout(timer);
    delete this.debounceTimers[scope];
  }

  private cancelFocus(scope: SearchScope): void {
    const timer = this.focusTimers[scope];
    if (timer) clearTimeout(timer);
    delete this.focusTimers[scope];
  }

  private search(scope: SearchScope): void {
    const config = SEARCH_CONFIG[scope];
    const state = this.states[scope];
    const $input = $(config.input);
    const $container = $(config.container);
    const query = (String($input.val() || '')).trim();

    clearHighlights($container);
    state.matches = [];
    state.currentIndex = -1;
    if (!query) {
      $(config.count).text('');
      $input.removeClass('regex-error');
      return;
    }

    let pattern: RegExp | null = null;
    if (state.useRegex) {
      try {
        pattern = new RegExp(query, state.caseSensitive ? 'g' : 'gi');
        $input.removeClass('regex-error');
      } catch {
        $input.addClass('regex-error');
        $(config.count).text('正则无效');
        return;
      }
    } else {
      $input.removeClass('regex-error');
    }

    $container.find(config.valueSelectors).each(function() {
      const element = this as HTMLElement;
      if (element.querySelector('.katex')) return;
      const text = element.textContent || '';
      if (pattern) pattern.lastIndex = 0;
      const matched = pattern
        ? pattern.test(text)
        : state.caseSensitive ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase());
      if (matched) highlightTextInElement(element, query, state.caseSensitive, pattern);
    });

    state.matches = Array.from($container.find('.search-highlight').toArray());
    if (state.matches.length === 0) {
      $(config.count).text('0 结果');
      return;
    }
    state.currentIndex = 0;
    this.activate(scope);
    $(config.count).text(`1/${state.matches.length}`);
  }

  private navigate(scope: SearchScope, direction: 'next' | 'prev'): void {
    const state = this.states[scope];
    if (state.matches.length === 0) return;
    const offset = direction === 'next' ? 1 : -1;
    state.currentIndex = (state.currentIndex + offset + state.matches.length) % state.matches.length;
    this.activate(scope);
    $(SEARCH_CONFIG[scope].count).text(`${state.currentIndex + 1}/${state.matches.length}`);
  }

  private activate(scope: SearchScope): void {
    const config = SEARCH_CONFIG[scope];
    const state = this.states[scope];
    $(`${config.container} .search-highlight-active`)
      .removeClass('search-highlight-active')
      .addClass('search-highlight');
    if (state.currentIndex < 0) return;
    const element = state.matches[state.currentIndex] as HTMLElement | undefined;
    if (!element) return;

    element.classList.remove('search-highlight');
    element.classList.add('search-highlight-active');
    $(element).parents('.tree-children.collapsed').each(function() {
      const $children = $(this).removeClass('collapsed');
      const $node = $children.closest('.tree-node, .tree-node-root');
      $node.find('.tree-ellipsis').first().addClass('hidden');
      $node.children('.tree-collection-footer').first().removeClass('hidden');
      $node.find('.tree-toggle').first().text('▼').attr('data-collapsed', 'false');
    });
    element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
}
