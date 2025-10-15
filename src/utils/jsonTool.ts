import $ from 'jquery';

import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';
interface JsonTool {
    resetTextAreaValue(objId: string, value: string): void;
    jsonFormat(): void;
    renderJson(obj: any, path: string): JQuery;
    addEventListeners(): void;
    copyToClipboard(value: any): void;

}
// json_tool.ts
declare const layer: {
    msg: (text: string, options?: { time?: number }) => void;
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






    copyToClipboard: async (value: any) => {
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
    renderJson(obj: any, path: string = ''): JQuery {
        const type = typeof obj;
        const isExplain = $('#explain')?.prop('checked') || false;;
        console.log($('#explain'));
        console.log(isExplain);
        if (obj === null) {
            return $('<span>')
                .addClass('json-null')
                .text('null')
                .on('dblclick', () => this.copyToClipboard(null));
        }
        else if (type === 'number' || type === 'boolean') {
            return $('<span>')
                .addClass(`json-${type}`)
                .text(obj)
                .on('dblclick', () => this.copyToClipboard(obj));
        }
        else if (type === 'string') {
            const $info = $('<span>')
                .addClass('json-string')
                .text(`"${obj}"`)
                .on('dblclick', () => this.copyToClipboard(obj));
            if (!isExplain) {

                // $info.append($("pre").html(`${obj}`));

                $info.html(`<span>${JSON.stringify(obj, null, 2)}</span>`);
                $info.addClass('preserve-whitespace');

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
                    .on('dblclick', () => this.copyToClipboard(newPath))
                    .appendTo($li);

                $li.append(this.renderJson(obj[key], newPath,));
                if (index < keys.length - 1) $li.append(',');
                $ul.append($li);
            });

            return $div.append($toggle, '{', $ul, '}');
        }

        return $('<span>').text(''); // Fallback
    },



    addEventListeners(): void {
        $('#json-display .json-toggle').on('click', function (e) {
            e.preventDefault();
            const $parent = $(this).parent();
            const $children = $parent.find('.json-children').first();
            if ($children.is(':visible')) {
                $children.hide(); // 相当于 display: none
                $(this).text('▶');
            } else {
                $children.show(); // 恢复显示
                $(this).text('▼');
            }
        });
        $('#json-display .json-toggle-string').on('click', function (e) {
            e.preventDefault();
            // const $parent = $(this);
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

