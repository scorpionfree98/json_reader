import $ from 'jquery';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';

// ==================== 类型定义 ====================
interface PathToken {
  type: 'object' | 'array';
  value: string;
}

interface JsonTool {
  resetTextAreaValue(objId: string, value: string): void;
  jsonFormat(): void;
  renderJson(obj: any, path: string): JQuery;
  addEventListeners(): void;
  copyToClipboard(value: any, path?: string): void;
  formatKeyPath(path: string, format: string): string;
  parsePathTokens(path: string): PathToken[];
  renderTreeView(obj: any, container: JQuery, path?: string, isRoot?: boolean): void;
  updateTreeView(obj: any): void;
  parseJsonError(jsonStr: string, errorMsg: string): string;
}

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
  const layui = getLayui();
  if (layui?.layer) {
    layui.layer.msg(msg, options);
  } else {
    console.log('LayUI message:', msg);
  }
};

const getCopyFormat = (): string => $('#copyFormat').val() as string || 'default';

const getCustomFormats = (): { key: string; index: string } => ({
  key: $('#customKeyFormat').val() as string || '.{key}',
  index: $('#customIndexFormat').val() as string || '[{index}]'
});

// ==================== LaTeX 渲染 ====================

const renderLatexString = (str: string): string => {
  try {
    // 渲染块级公式 $$...$$
    let processed = str.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
      const rendered = katex.renderToString(tex, {
        displayMode: true,
        throwOnError: false,
        output: 'html'
      });
      return `<span class="latex-block">${rendered}</span>`;
    });

    // 渲染行内公式 $...$
    processed = processed.replace(/\$([^$]+?)\$/g, (match, tex) => {
      const rendered = katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
        output: 'html'
      });
      return `<span class="latex-inline">${rendered}</span>`;
    });

    return processed;
  } catch (e) {
    console.error("KaTeX Render Error", e);
    return str;
  }
};

const hasLatex = (str: string): boolean => str.includes('$') || /\{frac\}|\{times\}/.test(str);

// ==================== 路径格式化 ====================

const formatters: Record<string, (path: string, tokens: PathToken[]) => string> = {
  default: (path) => path,
  dot: (path) => path.replace(/\["([^"]+)"\]/g, '.$1').replace(/^\./, ''),
  jsonpath: (path) => '$' + path.replace(/\["([^"]+)"\]/g, '.$1').replace(/^\./, ''),
  bracket: (path) => path.replace(/\["([^"]+)"\]/g, "['$1']"),
  python: (path) => {
    const keys = path.match(/\["([^"]+)"\]/g)?.map(k => k.slice(2, -2)) || [];
    return keys.length > 0 ? keys.map(k => `.get('${k}')`).join('') : '';
  },
  custom: (path, tokens) => {
    const { key: keyFormat, index: indexFormat } = getCustomFormats();
    return tokens.map(token =>
      token.type === 'array'
        ? indexFormat.replace('{index}', token.value)
        : keyFormat.replace('{key}', token.value)
    ).join('');
  }
};

const parsePathTokens = (path: string): PathToken[] => {
  const tokens: PathToken[] = [];
  const objectKeyRegex = /\["([^"]+)"\]/g;
  const arrayIndexRegex = /\[(\d+)\]/g;

  let lastIndex = 0;
  while (lastIndex < path.length) {
    objectKeyRegex.lastIndex = lastIndex;
    arrayIndexRegex.lastIndex = lastIndex;

    const objMatch = objectKeyRegex.exec(path);
    const arrMatch = arrayIndexRegex.exec(path);

    if (!objMatch && !arrMatch) break;

    if (objMatch && (!arrMatch || objMatch.index < arrMatch.index)) {
      tokens.push({ type: 'object', value: objMatch[1] });
      lastIndex = objMatch.index + objMatch[0].length;
    } else if (arrMatch) {
      tokens.push({ type: 'array', value: arrMatch[1] });
      lastIndex = arrMatch.index + arrMatch[0].length;
    }
  }

  return tokens;
};

const formatKeyPath = (path: string, format: string): string => {
  if (!path) return '';
  const formatter = formatters[format] || formatters.default;
  return formatter(path, parsePathTokens(path));
};

// ==================== JSON 渲染器 ====================

const createValueElement = (value: any, type: string, path: string): JQuery => {
  const $el = $('<span>')
    .addClass(`json-${type}`)
    .text(String(value))
    .on('dblclick', () => jsonTool.copyToClipboard(value));

  if (type === 'string') {
    const strValue = value as string;
    const isExplain = $('#explain')?.prop('checked') || false;

    if (isExplain && hasLatex(strValue)) {
      $el.html(`<span class="latex-container">${renderLatexString(strValue)}</span>`);
    } else if (isExplain) {
      // 转义状态下，处理转义字符
      const processedStr = strValue
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      $el.html(`<span>${JSON.stringify(processedStr).slice(1, -1)}</span>`).addClass('preserve-whitespace');
    } else {
      $el.html(`<span>${JSON.stringify(value)}</span>`).addClass('preserve-whitespace');
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
  renderItem: (item: any, index: number | string, itemPath: string) => JQuery
): JQuery => {
  const $div = $('<div>').addClass(isArray ? 'json-array' : 'json-object');
  const $toggle = $('<span>').addClass('json-toggle').text('▼');
  const $ul = $('<ul>').addClass('json-children');

  const entries = isArray
    ? (obj as any[]).map((item, i) => [i, item] as [number, any])
    : Object.entries(obj);

  entries.forEach(([key, value], index) => {
    const escapedKey = String(key).replace(/"/g, '\\"');
    const newPath = path ? `${path}["${escapedKey}"]` : `["${escapedKey}"]`;
    const $li = isArray
      ? $('<li>').append(renderItem(value, key, newPath))
      : $('<li>')
          .append(createKeyElement(String(key), newPath))
          .append(jsonTool.renderJson(value, newPath));
    if (index < entries.length - 1) $li.append(',');
    $ul.append($li);
  });

  $div.append($toggle, isArray ? '[' : '{', $ul, isArray ? ']' : '}');
  return $div;
};

// ==================== 树形视图渲染器 ====================

const createTreeToggle = ($children: JQuery, $ellipsis: JQuery, $bracketClose: JQuery): JQuery => {
  return $('<span>')
    .addClass('tree-toggle')
    .text('▼')
    .attr('data-collapsed', 'false')
    .on('click', function() {
      const $this = $(this);
      const isCollapsed = $this.attr('data-collapsed') === 'true';
      const $parent = $this.closest('.tree-node, .tree-node-root');

      if (isCollapsed) {
        $parent.find('.tree-children').first().removeClass('collapsed');
        $parent.find('.tree-ellipsis').first().addClass('hidden');
        $parent.find('.tree-bracket').last().removeClass('hidden');
        $this.text('▼').attr('data-collapsed', 'false');
      } else {
        $parent.find('.tree-children').first().addClass('collapsed');
        $parent.find('.tree-ellipsis').first().removeClass('hidden');
        $parent.find('.tree-bracket').last().addClass('hidden');
        $this.text('▶').attr('data-collapsed', 'true');
      }
    });
};

const renderTreeValue = (obj: any, path: string, container: JQuery, depth: number = 0): void => {
  // 检查深度限制
  if (depth > MAX_RENDER_DEPTH) {
    container.append($('<span>').addClass('tree-null tree-value').text('[max depth reached]'));
    return;
  }

  const type = typeof obj;
  const isExplain = $('#explain')?.prop('checked') || false;

  const valueRenderers: Record<string, () => void> = {
    null: () => container.append($('<span>').addClass('tree-null tree-value').attr('data-path', path).text('null')),
    number: () => container.append($('<span>').addClass('tree-number tree-value').attr('data-path', path).text(String(obj))),
    boolean: () => container.append($('<span>').addClass('tree-boolean tree-value').attr('data-path', path).text(String(obj))),
    string: () => {
      const strObj = obj as string;

      const processedStr = isExplain
        ? strObj.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        : strObj;

      if (isExplain && hasLatex(processedStr)) {
        const $valueSpan = $('<span>').addClass('tree-string tree-value').attr('data-path', path);
        $valueSpan.html(renderLatexString(processedStr));
        container.append($valueSpan);
      } else if (isExplain) {
        const displayStr = processedStr.length > 100 ? processedStr.substring(0, 100) + '...' : processedStr;
        const $span = $('<span>')
          .addClass('tree-string tree-value')
          .attr('data-path', path)
          .attr('title', strObj)
          .css('white-space', 'pre-wrap')
          .text(`"${displayStr}"`);
        container.append($span);
      } else {
        const displayStr = strObj.length > 100 ? strObj.substring(0, 100) + '...' : strObj;
        const $span = $('<span>')
          .addClass('tree-string tree-value')
          .attr('data-path', path)
          .attr('title', strObj)
          .text(`"${displayStr}"`);
        container.append($span);
      }
    }
  };

  if (valueRenderers[type]) {
    valueRenderers[type]();
  } else if (Array.isArray(obj)) {
    renderTreeCollection(obj, path, container, true, false, depth);
  } else if (type === 'object') {
    renderTreeCollection(obj, path, container, false, false, depth);
  }
};

const renderTreeCollection = (
  obj: any,
  path: string,
  container: JQuery,
  isArray: boolean,
  isRoot: boolean = false,
  depth: number = 0
): void => {
  const $node = $('<div>').addClass(isRoot ? 'tree-node-root' : 'tree-node');
  const $bracketOpen = $('<span>').addClass('tree-bracket').text(isArray ? '[' : '{');
  const $children = $('<div>').addClass('tree-children');
  const $bracketClose = $('<span>').addClass('tree-bracket').text(isArray ? ']' : '}');
  const $ellipsis = $('<span>')
    .addClass('tree-ellipsis hidden')
    .text(`... ${isArray ? obj.length : Object.keys(obj).length} ${isArray ? 'items' : 'keys'}`);

  const $toggle = createTreeToggle($children, $ellipsis, $bracketClose);

  const entries = isArray
    ? (obj as any[]).map((item, i) => [i, item] as [number, any])
    : Object.entries(obj);

  entries.forEach(([key, value], index) => {
    const $item = $('<div>').addClass('tree-item');
    const itemPath = isArray ? `${path}[${key}]` : `${path ? path : ''}["${String(key).replace(/"/g, '\\"')}"]`;

    if (!isArray) {
      const $keySpan = $('<span>')
        .addClass('tree-key')
        .text(`"${key}"`)
        .on('dblclick', () => {
          const formattedPath = formatKeyPath(itemPath, getCopyFormat());
          jsonTool.copyToClipboard(formattedPath, itemPath);
        });
      $item.append($keySpan);
    } else {
      $item.append($('<span>').addClass('tree-key').text(key));
    }

    const $valueContainer = $('<span>');
    renderTreeValue(value, itemPath, $valueContainer, depth + 1);
    $item.append($valueContainer);

    if (index < entries.length - 1) {
      $item.append($('<span>').text(','));
    }

    $children.append($item);
  });

  $node.append($toggle, $bracketOpen, $children, $ellipsis, $bracketClose);
  container.append($node);
};

// ==================== 主对象 ====================

export const jsonTool: JsonTool = {
  resetTextAreaValue(objId: string, value: string): void {
    $(`#${objId}`).val(value).trigger("focus");
  },

  jsonFormat(): void {
    const info = $('#sourceText').val() as string;
    if (!info.trim()) {
      showLayuiMsg('请输入JSON字符串');
      return;
    }

    try {
      const jsonObj = JSON.parse(info);
      const jsonText = JSON.stringify(jsonObj, null, 4);

      this.resetTextAreaValue('sourceText', jsonText);
      $('#splitSourceText').val(jsonText);

      $("#valid-result")
        .html("格式正确")
        .removeClass("es-fail").addClass("es-empty");

      $('#json-display').html(this.renderJson(jsonObj, ""));
      this.addEventListeners();
      showLayuiMsg('格式化成功');

    } catch (e: unknown) {
      const error = e as Error;
      const errorInfo = this.parseJsonError(info, error.message);
      $("#valid-result")
        .html(`格式错误：${errorInfo}`)
        .addClass("es-fail")
        .removeClass("es-empty");
      showLayuiMsg('JSON格式错误');
    }
  },

  parseJsonError(jsonStr: string, errorMsg: string): string {
    // 尝试从错误消息中提取位置信息
    const positionMatch = errorMsg.match(/position\s+(\d+)/i);
    const lineMatch = errorMsg.match(/line\s+(\d+)/i);
    const columnMatch = errorMsg.match(/column\s+(\d+)/i);

    let position = positionMatch ? parseInt(positionMatch[1]) : -1;
    let line = lineMatch ? parseInt(lineMatch[1]) : -1;
    let column = columnMatch ? parseInt(columnMatch[1]) : -1;

    // 如果没有行号，尝试从位置计算
    if (line === -1 && position >= 0) {
      const lines = jsonStr.substring(0, position).split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    let result = escapeHtml(errorMsg);

    // 添加行号和列号信息
    if (line > 0) {
      result += `<br><strong>位置：第 ${line} 行`;
      if (column > 0) {
        result += `，第 ${column} 列`;
      }
      result += '</strong>';

      // 显示上下文
      const lines = jsonStr.split('\n');
      if (line <= lines.length) {
        const contextStart = Math.max(0, line - 2);
        const contextEnd = Math.min(lines.length, line + 1);

        result += '<br><br><strong>上下文：</strong><pre style="background:#f5f5f5;padding:8px;border-radius:4px;margin-top:5px;overflow-x:auto;">';

        for (let i = contextStart; i < contextEnd; i++) {
          const lineNum = i + 1;
          const isErrorLine = lineNum === line;
          const prefix = isErrorLine ? '<strong style="color:red;">→ ' : '  ';
          const suffix = isErrorLine ? '</strong>' : '';
          result += `${prefix}${lineNum}: ${lines[i].replace(/</g, '&lt;').replace(/>/g, '&gt;')}${suffix}\n`;
        }

        result += '</pre>';
      }
    }

    return result;
  },

  renderJson(obj: any, path: string = ''): JQuery {
    const type = typeof obj;

    if (obj === null) {
      return createValueElement(null, 'null', path);
    }

    if (type === 'number' || type === 'boolean') {
      return createValueElement(obj, type, path);
    }

    if (type === 'string') {
      return createValueElement(obj, 'string', path);
    }

    if (Array.isArray(obj)) {
      return renderCollection(obj, path, true, (item, idx, itemPath) =>
        this.renderJson(item, itemPath)
      );
    }

    if (type === 'object') {
      return renderCollection(obj, path, false, (item, key, itemPath) =>
        this.renderJson(item, itemPath)
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
  },

  async copyToClipboard(value: any, path?: string): Promise<void> {
    const valueText = String(value ?? '');
    try {
      await writeClipboardText(valueText);
      showLayuiMsg(`已复制: ${valueText.substring(0, 50)}${valueText.length > 50 ? '...' : ''}`, { time: 1000 });
    } catch (e) {
      console.error('复制失败:', e);
      showLayuiMsg(`复制失败: ${(e as Error).message}`, { time: 1000 });
    }
  },

  formatKeyPath,
  parsePathTokens,

  renderTreeView(obj: any, container: JQuery, path: string = '', isRoot: boolean = true): void {
    renderTreeValue(obj, path, container, 0);

    // 绑定值点击复制事件
    container.find('.tree-value').off('dblclick').on('dblclick', function() {
      const value = $(this).text();
      const cleanValue = value.replace(/^"|"$/g, '');
      jsonTool.copyToClipboard(cleanValue);
    });
  },

  updateTreeView(obj: any): void {
    const $treeView = $('#tree-view');
    $treeView.empty();

    if (obj !== undefined && obj !== null) {
      this.renderTreeView(obj, $treeView, '', true);
    }
  }
};

export { hasLatex, renderLatexString, escapeHtml };
export default jsonTool;
