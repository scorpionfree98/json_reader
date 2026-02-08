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
            this.resetTextAreaValue('sourceText', jsonText);
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
            // const $toggle = $(this);
            // 这里逻辑微调：toggle-string 内部包含了 info，点击其实是切换自身状态
            // 根据你原来的 DOM 结构调整：
            // 原结构：toggle 包含了 text("-") 和 append($info)。
            // 点击 toggle 会触发 info 的点击吗？取决于布局。
            // 建议：点击前面的 [-] 符号折叠
            
            // 简单实现：点击前面的符号只是视觉效果，或者你可以实现字符串太长时的折叠
            //  if ($toggle.text().includes('-')) {
            //      $toggle.contents().filter((_, node) => node.nodeType === 3).first().replaceWith('+');
            //      $toggle.find('.json-string').hide();
            //  } else {
            //      $toggle.contents().filter((_, node) => node.nodeType === 3).first().replaceWith('-');
            //      $toggle.find('.json-string').show();
            //  }
            const $parent = $(this).parent();
            const $children = $parent.find('.json-string').first();
            if ($children.is(':visible')) {
                $children.hide(); // 相当于 display: none
                $(this).text('+');
            } else {
                $children.show(); // 恢复显示
                $(this).text('-');
            }
        });
    }
};

export default jsonTool;