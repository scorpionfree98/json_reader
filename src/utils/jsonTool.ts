import $ from 'jquery';
import { writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import {
  bindImagePreviewEvents,
  createHtmlPreviewCard,
  detectImagePreview,
  markImagePreview
} from './contentPreview';
import {
  formatKeyPath as formatJsonPath,
  parsePathTokens,
  type PathToken
} from './jsonPath';
import { parseJsonError } from './jsonError';
import { hasLatex, renderLatexString } from './latexRenderer';
import { renderTreeView as renderTree } from './treeRenderer';

export { findJsonErrorPosition } from './jsonError';

// ==================== 类型定义 ====================
interface JsonTool {
  renderJson(obj: any, path: string, options?: JsonRenderOptions): JQuery;
  addEventListeners(): void;
  copyToClipboard(value: any, path?: string): void;
  formatKeyPath(path: string, format: string): string;
  parsePathTokens(path: string): PathToken[];
  renderTreeView(obj: any, container: JQuery, path?: string, isRoot?: boolean, options?: JsonRenderOptions): void;
  updateTreeView(obj: any, options?: JsonRenderOptions): void;
  parseJsonError(jsonStr: string, errorMsg: string): string;
}

export interface JsonRenderOptions {
  explain: boolean;
  richContent: boolean;
}

const DEFAULT_RENDER_OPTIONS: JsonRenderOptions = {
  explain: false,
  richContent: false
};

// ==================== 工具函数 ====================

// 最大渲染深度（防止循环引用和栈溢出）
const MAX_RENDER_DEPTH = 50;

// HTML 转义函数（防止 XSS）
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const getLayui = (): any => (window as any).layui;

const showLayuiMsg = (msg: string, options?: any): void => {
  // 检测是否在 Tauri 环境（有 CSP 限制）
  const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    // Tauri 环境直接使用自定义通知（避免 CSP 问题）
    showCustomNotification(msg);
  } else {
    // 浏览器环境尝试使用 LayUI
    const layui = getLayui();
    if (layui?.layer) {
      try {
        layui.layer.msg(msg, options);
      } catch (e) {
        console.error('LayUI msg failed:', e);
        showCustomNotification(msg);
      }
    } else {
      showCustomNotification(msg);
    }
  }
};

// 自定义通知（不依赖 LayUI，使用 CSS class 避免 CSP 问题）
const showCustomNotification = (msg: string): void => {
  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 1000);
};

const getCopyFormat = (): string => $('#copyFormat').val() as string || 'default';

const getCustomFormats = (): { key: string; index: string } => ({
  key: $('#customKeyFormat').val() as string || '.{key}',
  index: $('#customIndexFormat').val() as string || '[{index}]'
});

// ==================== 路径格式化 ====================

const formatKeyPath = (path: string, format: string): string => {
  return formatJsonPath(path, format, getCustomFormats());
};

// ==================== JSON 渲染器 ====================

const createValueElement = (value: any, type: string, path: string, options: JsonRenderOptions): JQuery => {
  const $el = $('<span>')
    .addClass(`json-${type}`)
    .text(String(value))
    .on('dblclick', () => jsonTool.copyToClipboard(value));

  if (type === 'string') {
    const strValue = value as string;
    const isExplain = options.explain;
    const imagePreview = detectImagePreview(strValue);
    const htmlPreview = options.richContent
      ? createHtmlPreviewCard(strValue, { copySource: source => jsonTool.copyToClipboard(source) })
      : null;
    markImagePreview($el, strValue);

    if (options.richContent && imagePreview) {
      $el.empty().append($('<img>').addClass('inline-image-preview').attr('src', imagePreview.src).attr('alt', imagePreview.format));
    } else if (htmlPreview) {
      $el.empty().append(htmlPreview);
    } else if (isExplain && hasLatex(strValue)) {
      const $latexContainer = $('<span>').addClass('latex-container').html(renderLatexString(strValue));
      $el.empty().append($latexContainer);
    } else if (isExplain) {
      // 转义状态下，处理转义字符
      const processedStr = strValue
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      $el.empty().append($('<span>').text(processedStr)).addClass('preserve-whitespace');
    } else {
      $el.empty().append($('<span>').text(JSON.stringify(value))).addClass('preserve-whitespace');
    }

    // 创建折叠切换按钮，但不复制值内容
    const $toggle = $('<span>').addClass('json-toggle-string').text('-');
    const $div = $('<span>').addClass('json-combine');
    return $div.append($toggle, $el);
  }

  return $el;
};

const createKeyElement = (key: string, path: string): JQuery => {
  return $('<span>')
    .addClass('json-key')
    .text(`"${key}"`)
    .on('dblclick', () => {
      const formattedPath = formatKeyPath(path, getCopyFormat());
      jsonTool.copyToClipboard(formattedPath, path);
    });
};

const renderCollection = (
  obj: any,
  path: string,
  isArray: boolean,
  options: JsonRenderOptions,
  renderItem: (item: any, index: number | string, itemPath: string) => JQuery
): JQuery => {
  const $div = $('<div>').addClass(isArray ? 'json-array' : 'json-object');
  const $toggle = $('<span>').addClass('json-toggle').text('▼');
  const $ul = $('<ul>').addClass('json-children');

  const entries = isArray
    ? (obj as any[]).map((item, i) => [i, item] as [number, any])
    : Object.entries(obj);

  entries.forEach(([key, value], index) => {
    const newPath = isArray
      ? `${path}[${key}]`
      : `${path}[${JSON.stringify(String(key))}]`;
    const $li = isArray
      ? $('<li>').append(renderItem(value, key, newPath))
      : $('<li>')
          .append(createKeyElement(String(key), newPath))
          .append(jsonTool.renderJson(value, newPath, options));
    if (index < entries.length - 1) $li.append(',');
    $ul.append($li);
  });

  $div.append($toggle, isArray ? '[' : '{', $ul, isArray ? ']' : '}');
  return $div;
};

// ==================== 主对象 ====================

export const jsonTool: JsonTool = {
  parseJsonError,

  renderJson(obj: any, path: string = '', options: JsonRenderOptions = DEFAULT_RENDER_OPTIONS): JQuery {
    if (parsePathTokens(path).length > MAX_RENDER_DEPTH) {
      return $('<span>').addClass('json-depth-limit').text('[max depth reached]');
    }

    const type = typeof obj;

    if (obj === null) {
      return createValueElement(null, 'null', path, options);
    }

    if (type === 'number' || type === 'boolean') {
      return createValueElement(obj, type, path, options);
    }

    if (type === 'string') {
      return createValueElement(obj, 'string', path, options);
    }

    if (Array.isArray(obj)) {
      return renderCollection(obj, path, true, options, (item, idx, itemPath) =>
        this.renderJson(item, itemPath, options)
      );
    }

    if (type === 'object') {
      return renderCollection(obj, path, false, options, (item, key, itemPath) =>
        this.renderJson(item, itemPath, options)
      );
    }

    return $('<span>').text('');
  },

  addEventListeners(): void {
    const handleToggle = (e: JQuery.ClickEvent, selector: string, childSelector: string, collapsedIcon: string, expandedIcon: string) => {
      e.preventDefault();
      e.stopPropagation();
      const $toggle = $(e.currentTarget);
      const $parent = $toggle.parent();
      const $children = $parent.children(childSelector);

      if ($children.is(':visible')) {
        $children.hide();
        $toggle.text(collapsedIcon);
      } else {
        $children.show();
        $toggle.text(expandedIcon);
        $parent.find('.collapsed-ellipsis').remove();
      }
    };

    $('#json-display')
      .off('click', '.json-toggle')
      .on('click', '.json-toggle', function(e) {
        handleToggle(e, '.json-toggle', '.json-children', '▶', '▼');
      });

    $('#json-display')
      .off('click', '.json-toggle-string')
      .on('click', '.json-toggle-string', function(e) {
        handleToggle(e, '.json-toggle-string', '.json-string', '+', '-');
      });

    bindImagePreviewEvents();
  },

  async copyToClipboard(value: any, path?: string): Promise<void> {
    const valueText = value === undefined ? '' : String(value);
    console.log('copyToClipboard called with:', valueText.substring(0, 100));

    try {
      if ('__TAURI_INTERNALS__' in window) {
        await writeClipboardText(valueText);
      } else {
        await navigator.clipboard.writeText(valueText);
      }
      showLayuiMsg(`已复制: ${valueText.substring(0, 50)}${valueText.length > 50 ? '...' : ''}`, { time: 1000 });
    } catch (e) {
      console.log('Tauri clipboard failed, trying fallback:', e);
      // Fallback 到浏览器 Clipboard API
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(valueText);
          console.log('Browser clipboard write success');
          showLayuiMsg(`已复制: ${valueText.substring(0, 50)}${valueText.length > 50 ? '...' : ''}`, { time: 1000 });
        } else {
          throw new Error('剪贴板 API 不可用');
        }
      } catch (fallbackError) {
        console.error('复制失败:', e, fallbackError);
        showLayuiMsg(`复制失败: ${(fallbackError as Error).message}`, { time: 1000 });
      }
    }
  },

  formatKeyPath,
  parsePathTokens,

  renderTreeView(
    obj: any,
    container: JQuery,
    path: string = '',
    isRoot: boolean = true,
    options: JsonRenderOptions = DEFAULT_RENDER_OPTIONS
  ): void {
    renderTree(obj, container, {
      copyToClipboard: value => jsonTool.copyToClipboard(value),
      formatPath: valuePath => formatKeyPath(valuePath, getCopyFormat()),
      explainEnabled: options.explain,
      richContentEnabled: options.richContent
    }, path, isRoot);
  },

  updateTreeView(obj: any, options: JsonRenderOptions = DEFAULT_RENDER_OPTIONS): void {
    const $treeView = $('#tree-view');
    $treeView.empty();

    if (obj !== undefined) {
      this.renderTreeView(obj, $treeView, '', true, options);
    }
  }
};

export { hasLatex, renderLatexString, escapeHtml };
export default jsonTool;
