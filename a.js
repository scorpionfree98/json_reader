var jsonTool = {
    /**
     * 设置文本框的值
     * @param idSelector id选择器
     * @param value 值
     */
    resetTextAreaValue: function (objId, value) {
        $('#'+objId).val(value);
        $('#'+objId).trigger("focus");
    },

    jsonFormat: function(){
        var text = document.getElementById("sourceText").value;
        try {
            var jsonObj = JSON.parse(text);
            var jsonText = JSON.stringify(jsonObj, null, 4);
            this.resetTextAreaValue('sourceText', jsonText);
            $("#valid-result").html("格式正确");
            $("#valid-result").removeClass("es-fail");
            $("#valid-result").addClass("es-pass");

            // 显示可折叠的JSON结构
            var html = this.renderJson(jsonObj);
            document.getElementById('json-display').innerHTML = html;
            this.addEventListeners();

        } catch (e) {
            $("#valid-result").html("格式错误：" + e.message);
            $("#valid-result").addClass("es-fail");
            $("#valid-result").removeClass("es-pass");
        }
    },

    renderJson: function(obj) {
        var type = typeof obj;
        if (obj === null) {
            return '<span class="json-null">null</span>';
        } else if (type === 'number' || type === 'boolean') {
            return '<span class="json-' + type + '">' + obj + '</span>';
        } else if (type === 'string') {
            return '<span class="json-string">"' + obj + '"</span>';
        } else if (Array.isArray(obj)) {
            var html = '<div class="json-array">';
            html += '[<span class="json-toggle">−</span><ul class="json-children">';
            for (var i = 0; i < obj.length; i++) {
                html += '<li>' + this.renderJson(obj[i]) + '</li>';
            }
            html += '</ul>]';
            html += '</div>';
            return html;
        } else if (type === 'object') {
            var html = '<div class="json-object">';
            html += '{<span class="json-toggle">−</span><ul class="json-children">';
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    html += '<li><span class="json-key">"' + key + '"</span>: ' + this.renderJson(obj[key]) + '</li>';
                }
            }
            html += '</ul>}';
            html += '</div>';
            return html;
        }
    },

    addEventListeners: function() {
        var toggles = document.getElementById('json-display').getElementsByClassName('json-toggle');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function(e) {
                e.preventDefault();
                var parent = e.target.parentNode;
                var children = parent.getElementsByClassName('json-children')[0];
                if (children.style.display === 'none') {
                    children.style.display = '';
                    e.target.textContent = '−';
                } else {
                    children.style.display = 'none';
                    e.target.textContent = '+';
                }
            });
        }
    }
}
