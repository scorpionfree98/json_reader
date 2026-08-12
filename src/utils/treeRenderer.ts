import $ from 'jquery';
import {
  bindImagePreviewEvents,
  createHtmlPreviewCard,
  detectImagePreview,
  markImagePreview
} from './contentPreview';
import { hasLatex, renderLatexString } from './latexRenderer';

export interface TreeRendererOptions {
  copyToClipboard(value: string): void | Promise<void>;
  formatPath(path: string): string;
  explainEnabled: boolean;
  richContentEnabled: boolean;
}

const TREE_RENDER_BATCH_SIZE = 500;
const MAX_TREE_DEPTH = 50;
const AUTO_EXPAND_PARENT_ENTRY_LIMIT = 50;

interface TreeRenderSession {
  initialEntriesRemaining: number;
}

const createTreeToggle = (
  $children: JQuery,
  $ellipsis: JQuery,
  initiallyCollapsed: boolean,
  ensureChildrenRendered: () => void
): JQuery => $('<span>')
  .addClass('tree-toggle')
  .text(initiallyCollapsed ? '▶' : '▼')
  .attr('data-collapsed', String(initiallyCollapsed))
  .on('click', function() {
    const $toggle = $(this);
    const isCollapsed = $toggle.attr('data-collapsed') === 'true';
    const $parent = $toggle.closest('.tree-node, .tree-node-root');
    const $footer = $parent.children('.tree-collection-footer').first();

    if (isCollapsed) {
      ensureChildrenRendered();
      $children.removeClass('collapsed');
      $ellipsis.addClass('hidden');
      $footer.removeClass('hidden');
      $toggle.text('▼').attr('data-collapsed', 'false');
    } else {
      $children.addClass('collapsed');
      $ellipsis.removeClass('hidden');
      $footer.addClass('hidden');
      $toggle.text('▶').attr('data-collapsed', 'true');
    }
  });

const createTreeKey = (key: string, path: string, options: TreeRendererOptions): JQuery => $('<span>')
  .addClass('tree-key')
  .text(`"${key}"`)
  .on('dblclick', () => options.copyToClipboard(options.formatPath(path)));

const renderTreeScalar = (
  value: unknown,
  path: string,
  container: JQuery,
  hasTrailingComma: boolean,
  options: TreeRendererOptions,
  key?: string
): void => {
  const type = value === null ? 'null' : typeof value;
  const isExplain = options.explainEnabled;
  const $line = $('<div>').addClass('tree-item tree-line');
  $line.append($('<span>').addClass('tree-toggle-placeholder'));
  if (key !== undefined) $line.append(createTreeKey(key, path, options));

  const appendComma = () => {
    if (hasTrailingComma) $line.append($('<span>').addClass('tree-comma').text(','));
  };

  const valueRenderers: Record<string, () => void> = {
    null: () => {
      $line.append($('<span>').addClass('tree-null tree-value').attr('data-path', path).text('null'));
      appendComma();
    },
    number: () => {
      $line.append($('<span>').addClass('tree-number tree-value').attr('data-path', path).text(String(value)));
      appendComma();
    },
    boolean: () => {
      $line.append($('<span>').addClass('tree-boolean tree-value').attr('data-path', path).text(String(value)));
      appendComma();
    },
    string: () => {
      const stringValue = value as string;
      const richContentEnabled = options.richContentEnabled;
      const imagePreview = detectImagePreview(stringValue);
      const htmlPreview = richContentEnabled
        ? createHtmlPreviewCard(stringValue, { copySource: source => options.copyToClipboard(source) })
        : null;
      const processedValue = isExplain
        ? stringValue.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        : stringValue;

      if (richContentEnabled && imagePreview) {
        const $span = $('<span>').addClass('tree-string tree-value').attr('data-path', path)
          .append($('<img>').addClass('inline-image-preview').attr('src', imagePreview.src).attr('alt', imagePreview.format));
        markImagePreview($span, stringValue);
        $line.append($span);
      } else if (htmlPreview) {
        $line.append($('<span>').addClass('tree-string tree-value').attr('data-path', path).append(htmlPreview));
      } else if (imagePreview) {
        const $span = $('<span>')
          .addClass('tree-string tree-value')
          .attr('data-path', path)
          .text(`"Base64 图片 · ${imagePreview.format}"`);
        markImagePreview($span, stringValue);
        $line.append($span);
      } else if (isExplain && hasLatex(processedValue)) {
        $line.append($('<span>')
          .addClass('tree-string tree-value')
          .attr('data-path', path)
          .html(renderLatexString(processedValue)));
      } else {
        const displayValue = processedValue.length > 100 ? `${processedValue.substring(0, 100)}...` : processedValue;
        const $span = $('<span>')
          .addClass('tree-string tree-value')
          .attr('data-path', path)
          .attr('title', stringValue)
          .text(`"${displayValue}"`);
        if (isExplain) $span.css('white-space', 'pre-wrap');
        $line.append($span);
      }
      appendComma();
    }
  };

  if (valueRenderers[type]) {
    valueRenderers[type]();
    $line.find('.tree-value').data('copy-value', String(value));
  }

  container.append($line);
};

const renderTreeCollection = (
  value: Record<string, unknown> | unknown[],
  path: string,
  container: JQuery,
  isArray: boolean,
  options: TreeRendererOptions,
  isRoot = false,
  hasTrailingComma = false,
  key?: string,
  depth = 0,
  session: TreeRenderSession = { initialEntriesRemaining: TREE_RENDER_BATCH_SIZE },
  autoExpand = isRoot
): void => {
  const $node = $('<div>').addClass(isRoot ? 'tree-node-root' : 'tree-node');
  const $header = $('<div>').addClass('tree-line tree-collection-header');
  const $bracketOpen = $('<span>').addClass('tree-bracket').text(isArray ? '[' : '{');
  const initiallyCollapsed = !isRoot && !autoExpand;
  const $children = $('<div>').addClass('tree-children').toggleClass('collapsed', initiallyCollapsed);
  const $bracketClose = $('<span>').addClass('tree-bracket').text(isArray ? ']' : '}');
  const $footer = $('<div>')
    .addClass('tree-line tree-collection-footer')
    .toggleClass('hidden', initiallyCollapsed)
    .append($bracketClose);
  if (hasTrailingComma) $footer.append($('<span>').addClass('tree-comma').text(','));

  const objectKeys = isArray ? null : Object.keys(value);
  const entryCount = isArray ? (value as unknown[]).length : objectKeys!.length;
  const getEntry = (index: number): [string | number, unknown] => {
    if (isArray) return [index, (value as unknown[])[index]];
    const entryKey = objectKeys![index];
    return [entryKey, (value as Record<string, unknown>)[entryKey]];
  };
  const $ellipsis = $('<span>')
    .addClass('tree-ellipsis')
    .toggleClass('hidden', !initiallyCollapsed)
    .text(`… ${entryCount} ${isArray ? '项' : '个键'} ${isArray ? ']' : '}'}${hasTrailingComma ? ',' : ''}`);

  const renderEntry = ([entryKey, entryValue]: [string | number, unknown], index: number): void => {
    const itemPath = isArray ? `${path}[${entryKey}]` : `${path}[${JSON.stringify(String(entryKey))}]`;
    const trailingComma = index < entryCount - 1;
    const childKey = isArray ? undefined : String(entryKey);

    if (depth >= MAX_TREE_DEPTH && entryValue !== null && typeof entryValue === 'object') {
      renderTreeScalar('[max depth reached]', itemPath, $children, trailingComma, options, childKey);
    } else if (Array.isArray(entryValue)) {
      renderTreeCollection(
        entryValue,
        itemPath,
        $children,
        true,
        options,
        false,
        trailingComma,
        childKey,
        depth + 1,
        session,
        entryCount <= AUTO_EXPAND_PARENT_ENTRY_LIMIT && session.initialEntriesRemaining > 0
      );
    } else if (entryValue !== null && typeof entryValue === 'object') {
      renderTreeCollection(
        entryValue as Record<string, unknown>,
        itemPath,
        $children,
        false,
        options,
        false,
        trailingComma,
        childKey,
        depth + 1,
        session,
        entryCount <= AUTO_EXPAND_PARENT_ENTRY_LIMIT && session.initialEntriesRemaining > 0
      );
    } else {
      renderTreeScalar(entryValue, itemPath, $children, trailingComma, options, childKey);
    }
  };

  let renderedCount = 0;
  const $loadMore = $('<button>').attr('type', 'button').addClass('tree-load-more');
  const renderNextBatch = (limit = TREE_RENDER_BATCH_SIZE): void => {
    $loadMore.detach();
    const nextCount = Math.min(renderedCount + limit, entryCount);
    for (let index = renderedCount; index < nextCount; index += 1) renderEntry(getEntry(index), index);

    renderedCount = nextCount;
    const remaining = entryCount - renderedCount;
    if (remaining > 0) {
      const batchCount = Math.min(TREE_RENDER_BATCH_SIZE, remaining);
      $loadMore
        .text(`继续加载 ${batchCount} ${isArray ? '项' : '个键'}（剩余 ${remaining}）`)
        .appendTo($children);
    }
  };

  $loadMore.on('click', event => {
    event.stopPropagation();
    renderNextBatch();
  });

  let childrenInitialized = false;
  const ensureChildrenRendered = (limit = TREE_RENDER_BATCH_SIZE): void => {
    if (childrenInitialized) return;
    childrenInitialized = true;
    renderNextBatch(limit);
  };
  const $toggle = createTreeToggle($children, $ellipsis, initiallyCollapsed, ensureChildrenRendered);

  $header.append($toggle);
  if (key !== undefined) $header.append(createTreeKey(key, path, options));
  $header.append($bracketOpen, $ellipsis);

  if (!initiallyCollapsed && session.initialEntriesRemaining > 0) {
    const initialCount = Math.min(TREE_RENDER_BATCH_SIZE, entryCount);
    session.initialEntriesRemaining = Math.max(0, session.initialEntriesRemaining - initialCount);
    ensureChildrenRendered(initialCount);
  }

  $node.append($header, $children, $footer);
  container.append($node);
};

export const renderTreeView = (
  value: unknown,
  container: JQuery,
  options: TreeRendererOptions,
  path = '',
  isRoot = true
): void => {
  const session: TreeRenderSession = { initialEntriesRemaining: TREE_RENDER_BATCH_SIZE };
  if (Array.isArray(value)) {
    renderTreeCollection(value, path, container, true, options, isRoot, false, undefined, 0, session, true);
  } else if (value !== null && typeof value === 'object') {
    renderTreeCollection(
      value as Record<string, unknown>,
      path,
      container,
      false,
      options,
      isRoot,
      false,
      undefined,
      0,
      session,
      true
    );
  } else {
    renderTreeScalar(value, path, container, false, options);
  }

  bindImagePreviewEvents();
  container
    .off('dblclick.treeValueCopy', '.tree-value')
    .on('dblclick.treeValueCopy', '.tree-value', function() {
      options.copyToClipboard($(this).data('copy-value') ?? '');
    });
};
