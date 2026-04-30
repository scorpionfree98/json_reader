/// <reference types="vite/client" />
// Entry for Tauri v2 frontend
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { saveWindowState, restoreStateCurrent, StateFlags } from '@tauri-apps/plugin-window-state';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled
} from '@tauri-apps/plugin-autostart';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import $ from 'jquery';
import jsonTool from './utils/jsonTool';

// 导入 LayUI CSS（npm 安装）
import 'layui/dist/css/layui.css';
// 导入 LayUI 深色主题 CSS
import 'layui-theme-dark/dist/layui-theme-dark-selector.css';
// 导入 LayUI JS
import 'layui/dist/layui.js';

// 声明全局 layui 对象
declare global {
  interface Window {
    layui: any;
  }
}

// 获取全局 layui 对象
const layui = window.layui;

// 工具函数
const byId = (id: string) => $(`#${id}`);
const byClass = (cls: string) => $(`.${cls}`);
const getLayui = (): any => (window as any).layui;

// 应用窗口对象（延迟初始化，确保在 Tauri 环境中正确获取）
let appWindow: ReturnType<typeof getCurrentWebviewWindow> | null = null;
let isTauriEnv = false;

// 初始化 Tauri 环境
try {
  appWindow = getCurrentWebviewWindow();
  isTauriEnv = true;
  console.log('Tauri 环境检测成功');
} catch (e) {
  console.log('非 Tauri 环境，使用浏览器模式');
  isTauriEnv = false;
  appWindow = null;
}

// 检测是否在 Tauri 环境中运行
const isTauri = () => isTauriEnv;

// 状态管理
let isExplainEnabled = false;

// 视图模式管理
type ViewMode = 'editor' | 'split';
const VIEW_MODE_KEY = 'json_formatter_view_mode';
let currentViewMode: ViewMode = loadViewMode();

// 禁用更新状态
let isUpdateDisabled = false;

// 主题状态
const THEME_KEY = 'json_formatter_theme';
let isDarkMode = loadTheme();

// ==================== 本地存储工具函数 ====================

function loadViewMode(): ViewMode {
  try {
    const savedMode = localStorage.getItem(VIEW_MODE_KEY) as ViewMode;
    if (savedMode && (savedMode === 'editor' || savedMode === 'split')) {
      return savedMode;
    }
  } catch (e) {
    console.log('加载视图模式失败:', e);
  }
  return 'editor';
}

function saveViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch (e) {
    console.log('保存视图模式失败:', e);
  }
}

function loadTheme(): boolean {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === 'dark';
  } catch (e) {
    console.log('加载主题失败:', e);
    return false;
  }
}

function saveTheme(isDark: boolean) {
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  } catch (e) {
    console.log('保存主题失败:', e);
  }
}

// ==================== UI 工具函数 ====================

function showLayuiMsg(text: string, options?: any) {
  const layui = getLayui();
  if (layui?.layer) {
    layui.layer.msg(text, options);
  } else {
    console.log('LayUI message:', text);
  }
}

function applyTheme(isDark: boolean) {
  const html = document.documentElement;
  if (isDark) {
    html.classList.add('dark');
    document.body.classList.add('dark-mode');
    $('#themeToggle').html('<i class="layui-icon layui-icon-light"></i> 白天');
    $('#splitThemeToggle').html('<i class="layui-icon layui-icon-light"></i>');
    $('#splitThemeToggle').attr('title', '切换到白天模式');
  } else {
    html.classList.remove('dark');
    document.body.classList.remove('dark-mode');
    $('#themeToggle').html('<i class="layui-icon layui-icon-moon"></i> 夜间');
    $('#splitThemeToggle').html('<i class="layui-icon layui-icon-moon"></i>');
    $('#splitThemeToggle').attr('title', '切换到夜间模式');
  }
}

// ==================== 窗口控制函数 ====================

async function toggleWindowMaximize(buttonSelector?: string) {
  if (!appWindow) {
    showLayuiMsg('窗口控制仅在应用模式中可用');
    return;
  }
  try {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
    // 更新按钮状态
    updateMaximizeButton(await appWindow.isMaximized(), buttonSelector);
  } catch (error) {
    console.error('最大化/还原失败:', error);
    showLayuiMsg('操作失败');
  }
}

function updateMaximizeButton(isMaximized: boolean, buttonSelector?: string) {
  const selectors = buttonSelector ? [buttonSelector] : ['#maximizeBtn', '#splitMaximize'];
  const icon = isMaximized ? 'layui-icon-screen-restore' : 'layui-icon-screen-full';
  const text = isMaximized ? '还原' : '最大化';
  
  selectors.forEach(selector => {
    const $btn = $(selector);
    if ($btn.length) {
      if (selector === '#maximizeBtn') {
        $btn.html(`<i class="layui-icon ${icon}"></i> ${text}`);
      } else {
        $btn.html(`<i class="layui-icon ${icon}"></i>`);
        $btn.attr('title', text);
      }
    }
  });
}

async function minimizeWindow() {
  if (appWindow) {
    try {
      await appWindow.minimize();
    } catch (e) {
      console.error('窗口最小化失败:', e);
      showLayuiMsg('最小化窗口失败');
    }
  } else {
    showLayuiMsg('窗口控制仅在应用模式中可用');
  }
}

async function closeWindow() {
  if (appWindow) {
    await appWindow.close();
  } else {
    showLayuiMsg('窗口控制仅在应用模式中可用');
  }
}

// ==================== 同步函数 ====================

function syncContentToMode(mode: ViewMode) {
  if (mode === 'split') {
    const sourceText = $('#sourceText').val() as string;
    $('#splitSourceText').val(sourceText);
    try {
      if (sourceText.trim()) {
        const jsonObj = JSON.parse(sourceText);
        jsonTool.updateTreeView(jsonObj);
      } else {
        $('#tree-view').empty();
      }
    } catch (e) {
      $('#tree-view').html('<div style="color: #999; padding: 20px;">JSON 格式错误，无法渲染树形视图</div>');
    }
  } else {
    const splitText = $('#splitSourceText').val() as string;
    if (splitText) {
      $('#sourceText').val(splitText);
    }
  }
}

function syncSettingsToSplitMode(mode: ViewMode) {
  if (mode === 'split') {
    $('#splitExplainBtn').toggleClass('active', $('#explain').prop('checked'));
    $('#splitTopBtn').toggleClass('active', $('#topCheck').prop('checked'));
  }
}

function syncCheckboxState(sourceId: string, targetId: string) {
  const checked = $(sourceId).prop('checked');
  $(targetId).prop('checked', checked);
  return checked;
}

// ==================== 视图模式函数 ====================

function switchViewMode(mode: ViewMode) {
  currentViewMode = mode;
  
  $('.view-mode-btn').removeClass('active');
  $(`.view-mode-btn[data-mode="${mode}"]`).addClass('active');
  $('.mode-container').addClass('hidden');
  $(`#${mode}-mode`).removeClass('hidden');

  const isSplit = mode === 'split';
  $('#editor-input-container').toggleClass('hidden', isSplit);
  $('#main-toolbar').toggleClass('hidden', isSplit);

  syncContentToMode(mode);
  syncSettingsToSplitMode(mode);
  saveViewMode(mode);
  console.log('切换到模式:', mode);
}

function applySavedViewMode() {
  const savedMode = loadViewMode();
  if (savedMode === 'split') {
    setTimeout(() => switchViewMode('split'), 100);
  }
}

// ==================== 功能函数 ====================

function toggleTheme() {
  isDarkMode = !isDarkMode;
  applyTheme(isDarkMode);
  saveTheme(isDarkMode);
  showLayuiMsg(`已切换到${isDarkMode ? '夜间' : '白天'}模式`);
}

export async function toggleTop() {
  if (!appWindow) {
    showLayuiMsg('置顶功能仅在应用模式中可用');
    return;
  }
  try {
    const current = await appWindow.isAlwaysOnTop();
    const newStatus = !current;
    byId('topCheck')?.prop('checked', newStatus);
    $('#splitTopBtn').toggleClass('active', newStatus);
    await appWindow.setAlwaysOnTop(newStatus);
    showLayuiMsg(`窗口${newStatus ? '已' : '未'}置顶`);
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    showLayuiMsg('操作失败');
  }
}

export async function toggleAutostart() {
  if (!isTauri()) {
    showLayuiMsg('自启动功能仅在应用模式中可用');
    return;
  }
  try {
    const current = await isAutostartEnabled();
    const newStatus = !current;
    byId('autoStart')?.prop('checked', newStatus);
    if (newStatus) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }
    showLayuiMsg(`开机自启动${newStatus ? '已启用' : '已禁用'}`);
    invoke('set_autostart');
  } catch (error) {
    console.error('切换自启动失败:', error);
    showLayuiMsg('操作失败');
  }
}

export function clearInputContent() {
  $('#sourceText, #splitSourceText').val('');
  $('#tree-view').empty();
  byId('valid-result')?.html('').addClass('es-empty');
  showLayuiMsg('已清空内容');
}

export function formatJson() {
  const text = $('#sourceText').val() as string;
  if (!text.trim()) {
    showLayuiMsg('请输入JSON字符串');
    return;
  }
  try {
    const jsonObj = JSON.parse(text);
    const formatted = JSON.stringify(jsonObj, null, 2);
    $('#sourceText, #splitSourceText').val(formatted);
    byId('valid-result')?.html('格式正确').removeClass('es-fail').addClass('es-pass');
    // 更新编辑器模式的显示
    const $rendered = jsonTool.renderJson(jsonObj, '');
    $('#json-display').empty().append($rendered);
    jsonTool.addEventListeners();
    if (currentViewMode === 'split') {
      jsonTool.updateTreeView(jsonObj);
      $('#split-valid-result').hide();
    }
    showLayuiMsg('格式化成功');
  } catch (e: unknown) {
    const error = e as Error;
    const errorInfo = jsonTool.parseJsonError(text, error.message);
    byId('valid-result')?.html(errorInfo).removeClass('es-pass').addClass('es-fail');
    // 在分屏模式下也显示错误信息
    if (currentViewMode === 'split') {
      $('#split-valid-result')
        .html(errorInfo)
        .removeClass('es-pass es-empty')
        .addClass('es-fail')
        .show();
    }
    showLayuiMsg('JSON格式错误');
  }
}

export async function tryPasteFromClipboard() {
  try {
    const text = await readClipboardText();
    if (!text) {
      showLayuiMsg('剪贴板为空');
      return;
    }
    $('#sourceText, #splitSourceText').val(text);
    formatJson();
    showLayuiMsg('已从剪贴板读取');
  } catch (err) {
    console.error('从剪贴板读取失败:', err);
    showLayuiMsg('读取剪贴板失败');
  }
}

export async function checkUpdate(isManual = false) {
  if (!isTauri()) {
    showLayuiMsg('更新检查仅在应用模式中可用');
    return;
  }
  if (isUpdateDisabled && !isManual) {
    console.log('自动更新已禁用，跳过检查');
    return;
  }
  try {
    const update = await check();
    if (update) {
      // 获取当前版本
      const currentVersion = await getVersion();
      const latestVersion = update.version || '未知';
      const releaseNotes = update.body || '暂无更新日志';

      // 显示确认对话框
      layui.use(['layer'], function() {
        const layer = layui.layer;
        layer.open({
          type: 1,
          title: '发现新版本',
          area: ['480px', 'auto'],
          shade: 0.3,
          content: `
            <div style="padding: 20px;">
              <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                  <span style="color: #666;">当前版本：</span>
                  <span style="font-weight: bold; color: #333;">${currentVersion}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                  <span style="color: #666;">最新版本：</span>
                  <span style="font-weight: bold; color: #1890ff;">${latestVersion}</span>
                </div>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 15px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #333;">更新日志：</div>
                <div style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 13px; line-height: 1.6; color: #555; white-space: pre-wrap;">${releaseNotes}</div>
              </div>
            </div>
          `,
          btn: ['立即更新', '稍后再说'],
          yes: async function(index) {
            layer.close(index);
            showLayuiMsg('正在下载更新...');
            try {
              await update.downloadAndInstall();
              await relaunch();
            } catch (err) {
              console.error('下载更新失败:', err);
              showLayuiMsg('下载更新失败');
            }
          },
          btn2: function(index) {
            layer.close(index);
            showLayuiMsg('已取消更新');
          }
        });
      });
    } else if (isManual) {
      showLayuiMsg('当前已是最新版本');
    }
  } catch (error) {
    console.error('检查更新失败:', error);
    if (isManual) {
      showLayuiMsg('检查更新失败');
    }
  }
}

// ==================== 树形视图控制 ====================

function expandAllTree() {
  $('#tree-view .tree-toggle').each(function() {
    const $this = $(this);
    const $parent = $this.closest('.tree-node, .tree-node-root');
    $parent.find('.tree-children').first().removeClass('collapsed');
    $parent.find('.tree-ellipsis').first().addClass('hidden');
    $parent.find('.tree-bracket').last().removeClass('hidden');
    $this.text('▼').attr('data-collapsed', 'false');
  });
  showLayuiMsg('已展开全部');
}

function collapseAllTree() {
  $('#tree-view .tree-toggle').each(function() {
    const $this = $(this);
    const $parent = $this.closest('.tree-node, .tree-node-root');
    $parent.find('.tree-children').first().addClass('collapsed');
    $parent.find('.tree-ellipsis').first().removeClass('hidden');
    $parent.find('.tree-bracket').last().addClass('hidden');
    $this.text('▶').attr('data-collapsed', 'true');
  });
  showLayuiMsg('已折叠全部');
}

function refreshTreeView() {
  if (currentViewMode !== 'split') return;
  const sourceText = $('#sourceText').val() as string;
  try {
    if (sourceText.trim()) {
      const jsonObj = JSON.parse(sourceText);
      jsonTool.updateTreeView(jsonObj);
      $('#split-valid-result').hide();
    } else {
      $('#tree-view').empty();
      $('#split-valid-result').hide();
    }
  } catch (e: unknown) {
    const error = e as Error;
    const errorInfo = jsonTool.parseJsonError(sourceText, error.message);
    $('#tree-view').html('<div style="color: #999; padding: 20px;">JSON 格式错误</div>');
    $('#split-valid-result')
      .html(errorInfo)
      .removeClass('es-pass es-empty')
      .addClass('es-fail')
      .show();
  }
}

// ==================== 事件绑定 ====================

function bindViewModeEvents() {
  $('.view-mode-btn').off('click').on('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $btn = $(this).closest('.view-mode-btn');
    const mode = $btn.data('mode') as ViewMode;
    switchViewMode(mode);
    showLayuiMsg(`已切换到${$btn.text().trim()}模式`);
  });

  // 主工具栏最大化按钮
  $('#maximizeBtn').off('click').on('click', () => toggleWindowMaximize('#maximizeBtn'));

  // 分屏模式编辑器实时同步
  $('#splitSourceText').off('input').on('input', function() {
    const text = $(this).val() as string;
    $('#sourceText').val(text);
    try {
      if (text.trim()) {
        const jsonObj = JSON.parse(text);
        jsonTool.updateTreeView(jsonObj);
        $('#valid-result').html('格式正确').removeClass('es-fail').addClass('es-empty');
      } else {
        $('#tree-view').empty();
        $('#valid-result').html('').addClass('es-empty');
      }
    } catch (e) {
      $('#tree-view').html('<div style="color: #999; padding: 20px;">JSON 格式错误</div>');
      $('#valid-result').html('格式错误').addClass('es-fail').removeClass('es-empty');
    }
  });

  // 主题切换按钮
  $('#themeToggle').off('click').on('click', toggleTheme);
}

function bindButtonEvents() {
  // 窗口控制按钮
  byId('minimize')?.off('click').on('click', minimizeWindow);
  byId('close')?.off('click').on('click', closeWindow);

  // 功能按钮
  byId('pasteBtn')?.off('click').on('click', tryPasteFromClipboard);
  byId('clearBtn')?.off('click').on('click', clearInputContent);
  byId('formatBtn')?.off('click').on('click', formatJson);
  byId('checkUpdate')?.off('click').on('click', () => checkUpdate(true));

  // 拖拽区域
  if (appWindow) {
    byClass('drag-region').off('mousedown').on('mousedown', (e) => {
      e.preventDefault();
      appWindow!.startDragging();
    });
  }

  bindSplitToolbarEvents();
}

function bindSplitToolbarEvents() {
  // 功能按钮
  $('#splitFormatBtn').off('click').on('click', formatJson);
  $('#splitPasteBtn').off('click').on('click', tryPasteFromClipboard);
  $('#splitClearBtn').off('click').on('click', clearInputContent);
  $('#splitExpandAll').off('click').on('click', expandAllTree);
  $('#splitCollapseAll').off('click').on('click', collapseAllTree);

  // 转义和置顶按钮
  $('#splitExplainBtn').off('click').on('click', function() {
    const $btn = $(this);
    const isActive = !$btn.hasClass('active');
    $btn.toggleClass('active', isActive);
    $('#explain').prop('checked', isActive);
    isExplainEnabled = isActive;
    formatJson();
    refreshTreeView();
    showLayuiMsg(`转义状态已${isActive ? '启用' : '禁用'}`);
  });

  $('#splitTopBtn').off('click').on('click', function() {
    const $btn = $(this);
    const isActive = !$btn.hasClass('active');
    $btn.toggleClass('active', isActive);
    $('#topCheck').prop('checked', isActive);
    toggleTop();
  });

  // 复制格式弹窗
  $('#splitCopyFormatBtn').off('click').on('click', function() {
    const currentValue = $('#copyFormat').val() as string;
    const customKeyFormat = $('#customKeyFormat').val() as string || '.{key}';
    const customIndexFormat = $('#customIndexFormat').val() as string || '[{index}]';
    layui.use(['layer'], function() {
      const layer = layui.layer;
      layer.open({
        type: 1,
        title: '选择复制格式',
        area: ['320px', 'auto'],
        shade: 0.3,
        content: `
          <div style="padding: 15px;">
            <div class="layui-form">
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="default" title='默认 ["key"]' ${currentValue === 'default' ? 'checked' : ''}>
              </div>
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="dot" title="点号 .key" ${currentValue === 'dot' ? 'checked' : ''}>
              </div>
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="jsonpath" title="JSONPath $.key" ${currentValue === 'jsonpath' ? 'checked' : ''}>
              </div>
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="bracket" title="方括号 ['key']" ${currentValue === 'bracket' ? 'checked' : ''}>
              </div>
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="python" title="Python .get" ${currentValue === 'python' ? 'checked' : ''}>
              </div>
              <div class="layui-form-item" style="margin-bottom: 10px;">
                <input type="radio" name="formatOption" value="custom" title="自定义" ${currentValue === 'custom' ? 'checked' : ''}>
              </div>
              <div id="dialogCustomFormat" style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; ${currentValue === 'custom' ? '' : 'display: none;'}">
                <div style="margin-bottom: 10px;">
                  <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">键格式:</label>
                  <input type="text" id="dialogCustomKeyFormat" value="${customKeyFormat}" placeholder="如: .{key}" class="layui-input" style="height: 32px;">
                </div>
                <div>
                  <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">索引格式:</label>
                  <input type="text" id="dialogCustomIndexFormat" value="${customIndexFormat}" placeholder="如: [{index}]" class="layui-input" style="height: 32px;">
                </div>
              </div>
            </div>
          </div>
        `,
        btn: ['确定', '取消'],
        yes: function(index: number) {
          const selectedValue = $('input[name="formatOption"]:checked').val() as string;
          if (selectedValue === 'custom') {
            const keyFormat = $('#dialogCustomKeyFormat').val() as string;
            const indexFormat = $('#dialogCustomIndexFormat').val() as string;
            if (keyFormat) $('#customKeyFormat').val(keyFormat);
            if (indexFormat) $('#customIndexFormat').val(indexFormat);
          }
          $('#copyFormat').val(selectedValue).trigger('change');
          layer.close(index);
          showLayuiMsg('复制格式已更新');
        },
        success: function() {
          layui.form.render('radio');
          // 监听自定义选项，显示/隐藏输入框
          $('input[name="formatOption"]').on('change', function() {
            const isCustom = $(this).val() === 'custom';
            $('#dialogCustomFormat').toggle(isCustom);
          });
        }
      });
    });
  });

  // 主题切换
  $('#splitThemeToggle').off('click').on('click', toggleTheme);

  // 窗口控制按钮
  $('#splitMinimize').off('click').on('click', minimizeWindow);
  $('#splitMaximize').off('click').on('click', () => toggleWindowMaximize('#splitMaximize'));
  $('#splitClose').off('click').on('click', closeWindow);

  // 初始化可拖动分割线
  initSplitResizer();
}

function initSplitResizer() {
  const resizer = document.getElementById('splitResizer');
  const leftPanel = document.getElementById('splitLeftPanel');
  const rightPanel = document.getElementById('splitRightPanel');
  const container = document.getElementById('splitViewContainer');

  if (!resizer || !leftPanel || !rightPanel || !container) return;

  let isResizing = false;
  let startX = 0;
  let startLeftWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerWidth = container.getBoundingClientRect().width;
    const deltaX = e.clientX - startX;
    const newLeftWidth = ((startLeftWidth + deltaX) / containerWidth) * 100;
    if (newLeftWidth >= 20 && newLeftWidth <= 80) {
      leftPanel.style.flex = `0 0 ${newLeftWidth}%`;
      rightPanel.style.flex = `0 0 ${100 - newLeftWidth}%`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function bindCheckboxEvents() {
  const tryInitLayuiForm = () => {
    if (typeof layui !== 'undefined') {
      initLayuiForm();
    } else {
      setTimeout(tryInitLayuiForm, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInitLayuiForm);
  } else {
    tryInitLayuiForm();
  }
}

function initLayuiForm() {
  layui.use(['form'], function () {
    const form = layui.form;
    form.render();

    form.on('checkbox(explain)', function () {
      isExplainEnabled = $(this).prop('checked');
      $('#splitExplainBtn').toggleClass('active', isExplainEnabled);
      formatJson();
      refreshTreeView();
      showLayuiMsg(`转义状态已${isExplainEnabled ? '启用' : '禁用'}`);
    });

    form.on('checkbox(topCheck)', function () {
      toggleTop();
    });

    form.on('checkbox(autoStart)', function () {
      toggleAutostart();
    });

    form.on('checkbox(disableUpdate)', function () {
      isUpdateDisabled = $(this).prop('checked');
      showLayuiMsg(`自动更新已${isUpdateDisabled ? '禁用' : '启用'}`);
      invoke('set_update_disabled', { disabled: isUpdateDisabled });
    });

    form.on('select(copyFormat)', function (data) {
      $('#customFormatContainer').toggle(data.value === 'custom');
    });
  });
}

// ==================== 托盘事件监听 ====================

function initTrayListeners() {
  if (!isTauri()) return;

  // 监听托盘菜单的"检查更新"事件
  listen('tray://check-updates', () => {
    console.log('收到托盘检查更新事件');
    checkUpdate(true);
  });

  // 监听托盘菜单的"显示主窗口"事件
  listen('tray://show', () => {
    console.log('收到托盘显示窗口事件');
    if (appWindow) {
      appWindow.show();
      appWindow.setFocus();
    }
  });

  // 监听托盘菜单的"隐藏主窗口"事件
  listen('tray://hide', () => {
    console.log('收到托盘隐藏窗口事件');
    if (appWindow) {
      appWindow.hide();
    }
  });

  // 监听托盘菜单的"置顶切换"事件
  listen('tray://toggle-always-on-top', () => {
    console.log('收到托盘置顶切换事件');
    toggleTop();
  });

  // 监听托盘菜单的"自启动切换"事件
  listen('tray://toggle-autostart', () => {
    console.log('收到托盘自启动切换事件');
    toggleAutostart();
  });

  // 监听托盘菜单的"禁用更新切换"事件
  listen('tray://toggle-disable-update', (event) => {
    console.log('收到托盘禁用更新切换事件:', event.payload);
    isUpdateDisabled = event.payload as boolean;
    byId('disableUpdate')?.prop('checked', isUpdateDisabled);
    showLayuiMsg(`自动更新已${isUpdateDisabled ? '禁用' : '启用'}`);
  });
}

// ==================== 初始化 ====================

async function initCheckboxStates() {
  try {
    if (appWindow) {
      byId('topCheck')?.prop('checked', await appWindow.isAlwaysOnTop());
    }
    if (isTauri()) {
      byId('autoStart')?.prop('checked', await isAutostartEnabled());
      try {
        isUpdateDisabled = await invoke('get_update_disabled') as boolean;
        byId('disableUpdate')?.prop('checked', isUpdateDisabled);
      } catch (e) {
        console.log('获取禁用更新状态失败:', e);
      }
    }
    isExplainEnabled = byId('explain')?.prop('checked') || false;
  } catch (error) {
    console.error('初始化复选框状态失败:', error);
  }
}

async function displayVersion() {
  try {
    const version = await getVersion();
    byId('version')?.text(version);
    byId('splitVersionText')?.text(version);
  } catch (e) {
    console.log('获取版本号失败:', e);
  }
}

// 窗口关闭时保存状态
window.addEventListener('beforeunload', () => {
  if (!isTauri()) return;
  try {
    saveWindowState(StateFlags.ALL);
  } catch { /* 忽略保存失败的情况 */ }
});

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await restoreStateCurrent(StateFlags.ALL);
  } catch (e) {
    console.warn('恢复窗口状态失败:', e);
  }

  await initCheckboxStates();
  bindButtonEvents();
  bindCheckboxEvents();
  bindViewModeEvents();
  applySavedViewMode();
  applyTheme(isDarkMode);
  displayVersion();
  initTrayListeners();
});
