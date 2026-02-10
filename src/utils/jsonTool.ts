import $ from 'jquery';
import katex from 'katex';
import 'katex/dist/katex.min.css'; // 必须引入 CSS，否则公式显示会乱

import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';

interface JsonTool {
    resetTextAreaValue(objId: string, value: string): void;
    jsonFormat(): void;
    renderJson(obj: any, path: string): JQuery;
    addEventListeners(): void;
    copyToClipboard(value: any, path?: string): void;
    formatKeyPath(path: string, format: string): string;
    parsePathTokens(path: string): Array<{type: 'object' | 'array', value: string}>;
    renderTreeView(obj: any, container: JQuery): void;
    updateTreeView(obj: any): void;
}

declare const layer: {
    msg: (text: string, options?: { time?: number }) => void;
};

// 辅助函数：处理 LaTeX 渲染
const renderLatexString = (str: string): string => {
    // 1. 预处理：为了兼容你原有的非标准写法 ({frac} -> \frac)
    // 如果你的数据源以后全是标准 LaTeX ($...$), 可以去掉这部分
    let processed = str
    

    try {
        // 2. 渲染块级公式 $$...$$
        // 使用 replace 回调将匹配到的 LaTeX 字符串传给 katex
        processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
            const rendered = katex.renderToString(tex, {
                displayMode: true,    // 块级显示
                throwOnError: false,  // 解析错误时不抛出异常，而是显示源码
                output: 'html'        // 输出 HTML
            });
            return `<span class="latex-block">${rendered}</span>`;
        });

        // 3. 渲染行内公式 $...$
        processed = processed.replace(/\$([^$]+?)\$/g, (match, tex) => {
            const rendered = katex.renderToString(tex, {
                displayMode: false,   // 行内显示
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

export const jsonTool: JsonTool = {
    /**
     * 设置文本框的值
     * @param objId id选择器
     * @param value 值
     */
    resetTextAreaValue(objId: string, value: string): void {
        $(`#${objId}`).val(value);
        $(`#${objId}`).trigger("focus");
    },

    jsonFormat(): void {
        const info = $('#sourceText').val() as string;
        console.log('jsonFormat text:', info);
        try {
            const jsonObj = JSON.parse(info);
            const jsonText = JSON.stringify(jsonObj, null, 4);
            // 同步更新两个文本框
            this.resetTextAreaValue('sourceText', jsonText);
            $('#splitSourceText').val(jsonText);
            $("#valid-result")
                .html("格式正确")
                .removeClass("es-fail").addClass("es-empty");

            // 显示可折叠的JSON结构
            const html = this.renderJson(jsonObj, "");
            $('#json-display').html(html);
            this.addEventListeners();

        } catch (e: unknown) {
            const error = e as Error;
            $("#valid-result")
                .html(`格式错误：${error.message}`)
                .addClass("es-fail")
                .removeClass("es-empty");
        }
    },

    copyToClipboard: async (value: any, path?: string) => {
        const valueText = String(value ?? '');
        try {
            await writeClipboardText(valueText);
            console.log('已复制:', valueText);
            layer.msg(`已复制到剪贴板: ${valueText}`, { time: 1000 });
        } catch (e) {
            console.error('复制失败:', e);
            layer.msg(`复制失败: ${(e as Error).message}`, { time: 1000 });
        }
    },

    formatKeyPath(path: string, format: string): string {
        if (!path) return '';

        const customFormat = $('#customFormat').val() as string || '{key}';

        switch (format) {
            case 'default':
                return path;
            case 'dot':
                return path.replace(/\["([^"]+)"\]/g, '.$1').replace(/^\./, '');
            case 'jsonpath':
                return '$' + path.replace(/\["([^"]+)"\]/g, '.$1').replace(/^\./, '');
            case 'bracket':
                return path.replace(/\["([^"]+)"\]/g, "['$1']");
            case 'python':
                const pythonKeys = path.match(/\["([^"]+)"\]/g)?.map(k => k.slice(2, -2)) || [];
                return pythonKeys.length > 0 ? pythonKeys.map(k => `.get('${k}')`).join('') : '';
            case 'custom':
                const tokens = this.parsePathTokens(path);
                const customKeyFormat = $('#customKeyFormat').val() as string || '{key}';
                const customIndexFormat = $('#customIndexFormat').val() as string || '[{index}]';
                return tokens.map(token => {
                    if (token.type === 'array') {
                        return customIndexFormat.replace('{index}', token.value);
                    } else {
                        return customKeyFormat.replace('{key}', token.value);
                    }
                }).join('');
            default:
                return path;
        }
    },

    parsePathTokens(path: string): Array<{type: 'object' | 'array', value: string}> {
        const tokens: Array<{type: 'object' | 'array', value: string}> = [];
        
        const objectKeyRegex = /\["([^"]+)"\]/g;
        const arrayIndexRegex = /\[(\d+)\]/g;
        
        let match;
        let lastIndex = 0;
        
        while (lastIndex < path.length) {
            const nextObjectMatch = objectKeyRegex.exec(path);
            const nextArrayMatch = arrayIndexRegex.exec(path);
            
            if (!nextObjectMatch && !nextArrayMatch) break;
            
            if (nextObjectMatch && (!nextArrayMatch || nextObjectMatch.index < nextArrayMatch.index)) {
                tokens.push({ type: 'object', value: nextObjectMatch[1] });
                lastIndex = nextObjectMatch.index + nextObjectMatch[0].length;
                objectKeyRegex.lastIndex = lastIndex;
                arrayIndexRegex.lastIndex = lastIndex;
            } else if (nextArrayMatch) {
                tokens.push({ type: 'array', value: nextArrayMatch[1] });
                lastIndex = nextArrayMatch.index + nextArrayMatch[0].length;
                objectKeyRegex.lastIndex = lastIndex;
                arrayIndexRegex.lastIndex = lastIndex;
            }
        }
        
        return tokens;
    },

    renderJson(obj: any, path: string = ''): JQuery {
        const type = typeof obj;
        // 注意：这里每次递归都查询 DOM 可能会有轻微性能损耗，如果数据量巨大建议在外部获取一次状态传进来
        const isExplain = $('#explain')?.prop('checked') || false;

        if (obj === null) {
            return $('<span>')
                .addClass('json-null')
                .text('null')
                .on('dblclick', () => this.copyToClipboard(null));
        }
        else if (type === 'number' || type === 'boolean') {
            return $('<span>')
                .addClass(`json-${type}`)
                .text(String(obj))
                .on('dblclick', () => this.copyToClipboard(obj));
        }
        else if (type === 'string') {
            const $info = $('<span>')
                .addClass('json-string')
                // 默认显示原始文本，防止 XSS，但在渲染 LaTeX 时我们会用 .html()
                .text(`"${obj}"`) 
                .on('dblclick', () => this.copyToClipboard(obj));

            if (!isExplain) {
                // 普通模式：只显示高亮后的 JSON 字符串
                // 为了保留格式，这里重置内容
                $info.html(`<span>${JSON.stringify(obj)}</span>`); 
                $info.addClass('preserve-whitespace');
            } else {
                // 开启解析模式
                const strObj = obj as string;
                // 检测是否包含 LaTeX 特征 ($ 或者 你之前的特殊标记)
                const hasLaTeX = strObj.includes('$') || /\{frac\}|\{times\}/.test(strObj);

                if (hasLaTeX) {
                    // 使用 KaTeX 渲染
                    const renderedHtml = renderLatexString(strObj);
                    // 渲染后的 HTML 放入 span 中，不再包裹引号以便阅读公式
                    $info.html(`<span class="latex-container">${renderedHtml}</span>`);
                } else {
                    // 没有 LaTeX，直接显示格式化后的字符串
                    // $info.html(`<span>${JSON.stringify(obj)}</span>`);
                }
            }

            const $toggle = $('<span>').addClass('json-toggle-string').text("-").append($info);
            const $div = $('<span>').addClass('json-combine');
            return $div.append($toggle, $info);
        }
        else if (Array.isArray(obj)) {
            const $div = $('<div>').addClass('json-array');
            const $toggle = $('<span>').addClass('json-toggle').text('▼');
            const $ul = $('<ul>').addClass('json-children');

            obj.forEach((item, i) => {
                const $li = $('<li>').append(this.renderJson(item, `${path}[${i}]`));
                if (i < obj.length - 1) $li.append(',');
                $ul.append($li);
            });

            return $div.append($toggle, '[', $ul, ']');
        }
        else if (type === 'object') {
            const $div = $('<div>').addClass('json-object');
            const $toggle = $('<span>').addClass('json-toggle').text('▼');
            const $ul = $('<ul>').addClass('json-children');
            const keys = Object.keys(obj);

            keys.forEach((key, index) => {
                const $li = $('<li>');
                const escapedKey = key.replace(/"/g, '\\"');
                const newPath = path ? `${path}["${escapedKey}"]` : `["${escapedKey}"]`;

                $('<span>')
                    .addClass('json-key')
                    .text(`"${key}"`)
                    .on('dblclick', () => {
                        const format = $('#copyFormat').val() as string || 'default';
                        const formattedPath = this.formatKeyPath(newPath, format);
                        this.copyToClipboard(formattedPath, newPath);
                    })
                    .appendTo($li);

                $li.append(': ', this.renderJson(obj[key], newPath));
                if (index < keys.length - 1) $li.append(',');
                $ul.append($li);
            });

            return $div.append($toggle, '{', $ul, '}');
        }

        return $('<span>').text('');
    },

    addEventListeners(): void {
        // 使用 off() 防止重复绑定事件
        $('#json-display').off('click', '.json-toggle').on('click', '.json-toggle', function (e) {
            e.preventDefault();
            e.stopPropagation(); // 阻止冒泡
            const $toggle = $(this);
            const $parent = $toggle.parent();
            const $children = $parent.children('.json-children');
            
            if ($children.is(':visible')) {
                $children.hide();
                $toggle.text('▶');
                
            } else {
                $children.show();
                $toggle.text('▼');
                $parent.find('.collapsed-ellipsis').remove();
            }
        });

        $('#json-display').off('click', '.json-toggle-string').on('click', '.json-toggle-string', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const $parent = $(this).parent();
            const $children = $parent.find('.json-string').first();
            if ($children.is(':visible')) {
                $children.hide();
                $(this).text('+');
            } else {
                $children.show();
                $(this).text('-');
            }
        });
    },

    // 渲染树形视图
    renderTreeView(obj: any, container: JQuery, path: string = '', isRoot: boolean = true): void {
        const type = typeof obj;
        // 获取转义状态
        const isExplain = $('#explain')?.prop('checked') || false;
        
        if (obj === null) {
            container.append(`<span class="tree-null tree-value" data-path="${path}">null</span>`);
        }
        else if (type === 'number') {
            container.append(`<span class="tree-number tree-value" data-path="${path}">${obj}</span>`);
        }
        else if (type === 'boolean') {
            container.append(`<span class="tree-boolean tree-value" data-path="${path}">${obj}</span>`);
        }
        else if (type === 'string') {
            const strObj = obj as string;
            // 检测是否包含 LaTeX 特征
            const hasLaTeX = strObj.includes('$') || /\{frac\}|\{times\}/.test(strObj);
            
            if (isExplain && hasLaTeX) {
                // 使用 KaTeX 渲染
                const renderedHtml = renderLatexString(strObj);
                const $valueSpan = $('<span>').addClass('tree-string tree-value').attr('data-path', path);
                $valueSpan.html(renderedHtml);
                container.append($valueSpan);
            } else {
                // 普通字符串显示
                const displayStr = strObj.length > 100 ? strObj.substring(0, 100) + '...' : strObj;
                container.append(`<span class="tree-string tree-value" data-path="${path}" title="${strObj.replace(/"/g, '&quot;')}">"${displayStr.replace(/"/g, '&quot;')}"</span>`);
            }
        }
        else if (Array.isArray(obj)) {
            const $node = $('<div>').addClass(isRoot ? 'tree-node-root' : 'tree-node');
            const $toggle = $('<span>').addClass('tree-toggle').text('▼').attr('data-collapsed', 'false');
            const $bracketOpen = $('<span>').addClass('tree-bracket').text('[');
            const $children = $('<div>').addClass('tree-children');
            const $bracketClose = $('<span>').addClass('tree-bracket').text(']');
            const $ellipsis = $('<span>').addClass('tree-ellipsis hidden').text(`... ${obj.length} items`);
            
            obj.forEach((item, index) => {
                const $item = $('<div>').addClass('tree-item');
                const itemPath = path ? `${path}[${index}]` : `[${index}]`;
                
                // 数组索引
                $item.append($('<span>').addClass('tree-key').text(index));
                
                // 递归渲染值
                const $valueContainer = $('<span>');
                this.renderTreeView(item, $valueContainer, itemPath, false);
                $item.append($valueContainer);
                
                if (index < obj.length - 1) {
                    $item.append($('<span>').text(','));
                }
                
                $children.append($item);
            });
            
            $toggle.on('click', function() {
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
            
            $node.append($toggle, $bracketOpen, $children, $ellipsis, $bracketClose);
            container.append($node);
        }
        else if (type === 'object') {
            const $node = $('<div>').addClass(isRoot ? 'tree-node-root' : 'tree-node');
            const $toggle = $('<span>').addClass('tree-toggle').text('▼').attr('data-collapsed', 'false');
            const $bracketOpen = $('<span>').addClass('tree-bracket').text('{');
            const $children = $('<div>').addClass('tree-children');
            const $bracketClose = $('<span>').addClass('tree-bracket').text('}');
            const $ellipsis = $('<span>').addClass('tree-ellipsis hidden').text(`... ${Object.keys(obj).length} keys`);
            
            const keys = Object.keys(obj);
            keys.forEach((key, index) => {
                const $item = $('<div>').addClass('tree-item');
                const escapedKey = key.replace(/"/g, '\\"');
                const newPath = path ? `${path}["${escapedKey}"]` : `["${escapedKey}"]`;
                
                // 键名
                const $keySpan = $('<span>')
                    .addClass('tree-key')
                    .text(`"${key}"`)
                    .on('dblclick', () => {
                        const format = $('#copyFormat').val() as string || 'default';
                        const formattedPath = this.formatKeyPath(newPath, format);
                        this.copyToClipboard(formattedPath, newPath);
                    });
                $item.append($keySpan);
                
                // 递归渲染值
                const $valueContainer = $('<span>');
                this.renderTreeView(obj[key], $valueContainer, newPath, false);
                $item.append($valueContainer);
                
                if (index < keys.length - 1) {
                    $item.append($('<span>').text(','));
                }
                
                $children.append($item);
            });
            
            $toggle.on('click', function() {
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
            
            $node.append($toggle, $bracketOpen, $children, $ellipsis, $bracketClose);
            container.append($node);
        }
        
        // 绑定值点击复制事件
        container.find('.tree-value').off('dblclick').on('dblclick', function() {
            const value = $(this).text();
            const cleanValue = value.replace(/^"|"$/g, ''); // 去除字符串引号
            jsonTool.copyToClipboard(cleanValue);
        });
    },

    // 更新树形视图
    updateTreeView(obj: any): void {
        const $treeView = $('#tree-view');

        $treeView.empty();

        if (obj !== undefined && obj !== null) {
            this.renderTreeView(obj, $treeView, '', true);
        }
    }
};

export default jsonTool;