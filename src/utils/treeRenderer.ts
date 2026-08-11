import $ from 'jquery';
import {
  bindImagePreviewEvents,
  createSandboxedHtmlPreview,
  detectImagePreview,
  isRichContentEnabled,
  markImagePreview
} from './contentPreview';
import { hasLatex, renderLatexString } from './latexRenderer';

export interface TreeRendererOptions {
  copyToClipboard(value: string): void | Promise<void>;
  formatPath(path: string): string;
  isExplainEnabled(): boolean;
}

const TREE_RENDER_BATCH_SIZE = 500;
const MAX_TREE_DEPTH = 50;

const createTreeToggle = ($children: JQuery, $ellipsis: JQuery): JQuery => $('<span>')
  .addClass('tree-toggle')
  .text('▼')
  .attr('data-collapsed', 'false')
  .on('click', function() {
    const $toggle = $(this);
    const isCollapsed = $toggle.attr('data-collapsed') === 'true';
    const $parent = $toggle.closest('.tree-node, .tree-node-root');
    const $footer = $parent.children('.tree-collection-footer').first();

    if (isCollapsed) {
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
  const isExplain = options.isExplainEnabled();
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
      const richContentEnabled = isRichContentEnabled();
      const imagePreview = detectImagePreview(stringValue);
      const htmlPreview = richContentEnabled ? createSandboxedHtmlPreview(stringValue) : null;
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
  depth = 0
): void => {
  const $node = $('<div>').addClass(isRoot ? 'tree-node-root' : 'tree-node');
  const $header = $('<div>').addClass('tree-line tree-collection-header');
  const $bracketOpen = $('<span>').addClass('tree-bracket').text(isArray ? '[' : '{');
  const $children = $('<div>').addClass('tree-children');
  const $bracketClose = $('<span>').addClass('tree-bracket').text(isArray ? ']' : '}');
  const $footer = $('<div>').addClass('tree-line tree-collection-footer').append($bracketClose);
  if (hasTrailingComma) $footer.append($('<span>').addClass('tree-comma').text(','));

  const entries: Array<[string | number, unknown]> = isArray
    ? (value as unknown[]).map((item, index) => [index, item])
    : Object.entries(value);
  const $ellipsis = $('<span>')
    .addClass('tree-ellipsis hidden')
    .text(`… ${entries.length} ${isArray ? '项' : '个键'} ${isArray ? ']' : '}'}${hasTrailingComma ? ',' : ''}`);
  const $toggle = createTreeToggle($children, $ellipsis);

  $header.append($toggle);
  if (key !== undefined) $header.append(createTreeKey(key, path, options));
  $header.append($bracketOpen, $ellipsis);

  const renderEntry = ([entryKey, entryValue]: [string | number, unknown], index: number): void => {
    const itemPath = isArray ? `${path}[${entryKey}]` : `${path}[${JSON.stringify(String(entryKey))}]`;
    const trailingComma = index < entries.length - 1;
    const childKey = isArray ? undefined : String(entryKey);

    if (depth >= MAX_TREE_DEPTH && entryValue !== null && typeof entryValue === 'object') {
      renderTreeScalar('[max depth reached]', itemPath, $children, trailingComma, options, childKey);
    } else if (Array.isArray(entryValue)) {
      renderTreeCollection(entryValue, itemPath, $children, true, options, false, trailingComma, childKey, depth + 1);
    } else if (entryValue !== null && typeof entryValue === 'object') {
      renderTreeCollection(entryValue as Record<string, unknown>, itemPath, $children, false, options, false, trailingComma, childKey, depth + 1);
    } else {
      renderTreeScalar(entryValue, itemPath, $children, trailingComma, options, childKey);
    }
  };

  let renderedCount = 0;
  const $loadMore = $('<button>').attr('type', 'button').addClass('tree-load-more');
  const renderNextBatch = (): void => {
    $loadMore.detach();
    const nextCount = Math.min(renderedCount + TREE_RENDER_BATCH_SIZE, entries.length);
    for (let index = renderedCount; index < nextCount; index += 1) renderEntry(entries[index], index);

    renderedCount = nextCount;
    const remaining = entries.length - renderedCount;
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
  renderNextBatch();

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
  if (Array.isArray(value)) {
    renderTreeCollection(value, path, container, true, options, isRoot);
  } else if (value !== null && typeof value === 'object') {
    renderTreeCollection(value as Record<string, unknown>, path, container, false, options, isRoot);
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
