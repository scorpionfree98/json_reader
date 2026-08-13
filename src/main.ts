/// <reference types="vite/client" />
// Entry for Tauri v2 frontend
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled
} from '@tauri-apps/plugin-autostart';
import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import $ from 'jquery';
import { AsyncActionQueue } from './utils/asyncActionQueue';
import { DEFAULT_MAX_EDITOR_RENDER_NODES, exceedsJsonNodeLimit } from './utils/jsonComplexity';
import jsonTool from './utils/jsonTool';
import { SearchController } from './utils/searchController';
import { SettingsStore } from './utils/settingsStore';
import { initSplitResizer } from './utils/splitResizer';
import { TrayController, type TrayListen } from './utils/trayController';
import { UpdateService, type SafeUpdateDetails, type UpdateDialogActions } from './utils/updateService';
import {
  WorkbenchController,
  type WorkbenchLayout,
  type WorkbenchResultView
} from './utils/workbenchController';
import { createWindowController } from './utils/windowController';

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

// 防抖函数
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const windowController = createWindowController(showLayuiMsg);
const { appWindow } = windowController;
const isTauri = () => windowController.isTauri;
const settings = new SettingsStore();
const workbench = new WorkbenchController(settings.getWorkbenchView());
const topActionQueue = new AsyncActionQueue();
const autostartActionQueue = new AsyncActionQueue();
const updateDisabledActionQueue = new AsyncActionQueue();
const searchController = new SearchController();

// 禁用更新状态
let isUpdateDisabled = settings.getUpdateDisabled();

// 主题状态
let isDarkMode = settings.getTheme() === 'dark';

// ==================== UI 工具函数 ====================

export function showLayuiMsg(text: string, options?: any) {
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
  } else {
    html.classList.remove('dark');
    document.body.classList.remove('dark-mode');
    $('#themeToggle').html('<i class="layui-icon layui-icon-moon"></i> 夜间');
  }
}

// ==================== 工作台状态 ====================

function setSourceContent(value: string) {
  workbench.setSource(value);
  $('#sourceText').val(value);
}

function syncCopyFormat(value: string) {
  $('#customFormatContainer').toggleClass('hidden', value !== 'custom');
}

function applyLayout(layout: WorkbenchLayout) {
  workbench.setLayout(layout);
  $('#workbenchShell').attr('data-layout', layout);
  $('.layout-mode-btn')
    .removeClass('active')
    .filter(`[data-layout="${layout}"]`)
    .addClass('active');
  settings.setLayout(layout);
}

function switchResultView(resultView: WorkbenchResultView, refresh = true) {
  workbench.setResultView(resultView);
  $('#resultWorkspace').attr('data-result-view', resultView);
  $('.result-view-btn')
    .removeClass('active')
    .attr('aria-selected', 'false')
    .filter(`[data-result-view="${resultView}"]`)
    .addClass('active')
    .attr('aria-selected', 'true');
  $('.result-view-panel').addClass('hidden');
  $(`#${resultView === 'tree' ? 'tree-result' : 'highlight-result'}`).removeClass('hidden');
  $('.result-tools').addClass('hidden');
  $(`.result-tools[data-result-tools="${resultView}"]`).removeClass('hidden');
  settings.setResultView(resultView);
  if (refresh) refreshActiveResult();
}

function applySavedWorkbenchView() {
  applyLayout(workbench.layout);
  switchResultView(workbench.resultView, false);
}

// ==================== 功能函数 ====================

function toggleTheme() {
  isDarkMode = !isDarkMode;
  applyTheme(isDarkMode);
  settings.setTheme(isDarkMode ? 'dark' : 'light');
  showLayuiMsg(`已切换到${isDarkMode ? '夜间' : '白天'}模式`);
}

async function copyOutputToClipboard(text: string) {
  try {
    // 优先尝试 Tauri 剪贴板 API
    await writeClipboardText(text);
    showLayuiMsg('输出内容已复制到剪贴板');
  } catch (e) {
    // Fallback 到浏览器 Clipboard API
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showLayuiMsg('输出内容已复制到剪贴板');
      } else {
        console.error('剪贴板 API 不可用');
      }
    } catch (fallbackError) {
      console.error('复制失败:', e, fallbackError);
      showLayuiMsg('复制失败');
    }
  }
}

const syncTopState = (enabled: boolean): void => {
  byId('topCheck')?.prop('checked', enabled);
  layui.form.render('checkbox');
};

export function toggleTop(requestedState?: boolean): Promise<void> {
  if (!appWindow) {
    showLayuiMsg('置顶功能仅在应用模式中可用');
    return Promise.resolve();
  }
  return topActionQueue.run(async () => {
    try {
      const current = await appWindow.isAlwaysOnTop();
      const next = requestedState ?? !current;
      if (next !== current) await appWindow.setAlwaysOnTop(next);
      await invoke('set_always_on_top');
      syncTopState(next);
      showLayuiMsg(`窗口${next ? '已' : '未'}置顶`);
    } catch (error) {
      console.error('切换置顶状态失败:', error);
      showLayuiMsg('操作失败');
      try {
        syncTopState(await appWindow.isAlwaysOnTop());
      } catch (recoveryError) {
        console.error('恢复置顶状态失败:', recoveryError);
      }
    }
  });
}

export function toggleAutostart(requestedState?: boolean): Promise<void> {
  if (!isTauri()) {
    showLayuiMsg('自启动功能仅在应用模式中可用');
    return Promise.resolve();
  }
  return autostartActionQueue.run(async () => {
    try {
      const current = await isAutostartEnabled();
      const next = requestedState ?? !current;
      if (next !== current) {
        if (next) await enableAutostart();
        else await disableAutostart();
      }
      await invoke('set_autostart');
      byId('autoStart')?.prop('checked', next);
      layui.form.render('checkbox');
      showLayuiMsg(`开机自启动${next ? '已启用' : '已禁用'}`);
    } catch (error) {
      console.error('切换自启动失败:', error);
      showLayuiMsg('操作失败');
      try {
        byId('autoStart')?.prop('checked', await isAutostartEnabled());
        layui.form.render('checkbox');
      } catch (recoveryError) {
        console.error('恢复自启动状态失败:', recoveryError);
      }
    }
  });
}

export function clearInputContent() {
  setSourceContent('');
  clearRenderedOutput();
  setValidationState('empty', '等待输入 JSON');
  showLayuiMsg('已清空内容');
}

function clearRenderedOutput() {
  searchController.clear('editor');
  searchController.clear('tree');
  $('#tree-view, #json-display').empty();
}

function setValidationState(state: 'empty' | 'valid' | 'invalid', message: string) {
  const isValid = state === 'valid';
  const isInvalid = state === 'invalid';

  $('#valid-result')
    .text(state === 'empty' ? message : isValid ? '格式正确' : message)
    .toggleClass('es-empty', state === 'empty')
    .toggleClass('es-pass', isValid)
    .toggleClass('es-fail', isInvalid);
}

export function formatJson() {
  const result = workbench.parse();
  if (result.ok === false && result.kind === 'empty') {
    clearRenderedOutput();
    setValidationState('empty', '等待输入 JSON');
    showLayuiMsg('请输入JSON字符串');
    return;
  }
  if (result.ok === false && result.kind === 'too-large') {
    clearRenderedOutput();
    setValidationState('invalid', '输入超过 5MB');
    if (workbench.resultView === 'tree') {
      $('#tree-view').html('<div class="tree-error-state">输入超过 5MB</div>');
    }
    showLayuiMsg('输入内容过大（超过5MB），请缩减后重试');
    return;
  }
  if (result.ok === false && result.kind === 'unsafe-number') {
    const token = result.token.length > 32 ? `${result.token.slice(0, 29)}...` : result.token;
    const message = `数字 ${token} 超出安全精度范围`;
    clearRenderedOutput();
    setValidationState('invalid', message);
    if (workbench.resultView === 'tree') {
      $('#tree-view').html(`<div class="tree-error-state">${message}</div>`);
    }
    showLayuiMsg('检测到可能损失精度的数字，已停止格式化');
    return;
  }
  if (result.ok === true) {
    renderParsedJson(result.value, result.formatted);
    showLayuiMsg('格式化成功');
    return;
  }

  if (result.ok === false && result.kind === 'too-deep') {
    const message = `JSON 嵌套超过 ${result.maxDepth} 层`;
    clearRenderedOutput();
    setValidationState('invalid', message);
    if (workbench.resultView === 'tree') {
      $('#tree-view').html(`<div class="tree-error-state">${message}</div>`);
    }
    showLayuiMsg(message);
    return;
  }

  if (result.ok === false && result.kind === 'format-error') {
    clearRenderedOutput();
    setValidationState('invalid', 'JSON 格式化失败');
    if (workbench.resultView === 'tree') {
      $('#tree-view').html('<div class="tree-error-state">JSON 格式化失败</div>');
    }
    console.error('JSON 格式化失败:', result.error);
    showLayuiMsg('JSON 格式化失败');
    return;
  }

  if (result.ok === false && result.kind === 'invalid') {
    const errorInfo = jsonTool.parseJsonError(result.errorSource, result.error.message);
    clearRenderedOutput();
    byId('valid-result')?.html(errorInfo).removeClass('es-pass es-empty').addClass('es-fail');
    if (workbench.resultView === 'tree') {
      $('#tree-view').html('<div class="tree-error-state">JSON 格式错误</div>');
    }
    showLayuiMsg('JSON格式错误');
  }
}

function renderParsedJson(jsonObj: unknown, formatted = JSON.stringify(jsonObj, null, 2)) {
  workbench.commitFormattedResult(jsonObj, formatted);
  searchController.clear('editor');
  searchController.clear('tree');
  $('#sourceText').val(formatted);
  setValidationState('valid', 'JSON 有效');
  renderResult(jsonObj, workbench.resultView);
}

function renderResult(jsonObj: unknown, resultView: WorkbenchResultView) {
  if (resultView === 'tree') {
    jsonTool.updateTreeView(jsonObj, workbench.renderOptions);
    return;
  }

  if (exceedsJsonNodeLimit(jsonObj)) {
    const $switchButton = $('<button type="button">')
      .addClass('json-render-limit-action')
      .text('查看树形视图')
      .on('click', () => switchResultView('tree'));
    $('#json-display').empty().append(
      $('<div>')
        .addClass('json-render-limit')
        .append(
          $('<strong>').text('数据量较大，已暂停高亮完整渲染'),
          $('<span>').text(`超过 ${DEFAULT_MAX_EDITOR_RENDER_NODES.toLocaleString()} 个节点。源码已完成格式化，可在树形视图中按需加载。`),
          $switchButton
        )
    );
    return;
  }

  const $rendered = jsonTool.renderJson(jsonObj, '', workbench.renderOptions);
  $('#json-display').empty().append($rendered);
  jsonTool.addEventListeners();
}

export async function tryPasteFromClipboard() {
  try {
    const text = isTauri()
      ? await readClipboardText()
      : await navigator.clipboard.readText();
    if (!text) {
      showLayuiMsg('剪贴板为空');
      return;
    }
    setSourceContent(text);
    formatJson();
    showLayuiMsg('已从剪贴板读取');
  } catch (err) {
    console.error('从剪贴板读取失败:', err);
    showLayuiMsg('读取剪贴板失败');
  }
}

const showUpdateDialog = (details: SafeUpdateDetails, actions: UpdateDialogActions): void => {
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
              <span style="font-weight: bold; color: #333;">${details.currentVersion}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <span style="color: #666;">最新版本：</span>
              <span style="font-weight: bold; color: #1890ff;">${details.latestVersion}</span>
            </div>
          </div>
          <div style="border-top: 1px solid #eee; padding-top: 15px;">
            <div style="font-weight: bold; margin-bottom: 10px; color: #333;">更新日志：</div>
            <div style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 13px; line-height: 1.6; color: #555; white-space: pre-wrap;">${details.releaseNotes}</div>
          </div>
        </div>
      `,
      btn: ['立即更新', '稍后再说'],
      yes: async function(index: number) {
        layer.close(index);
        await actions.confirm();
      },
      btn2: function(index: number) {
        layer.close(index);
        actions.cancel();
      }
    });
  });
};

const updateService = new UpdateService({
  isTauri,
  isDisabled: () => isUpdateDisabled,
  checkForUpdate: check,
  getCurrentVersion: getVersion,
  relaunch: async () => { await relaunch(); },
  showMessage: showLayuiMsg,
  showDialog: showUpdateDialog,
  log: (message, error) => error === undefined ? console.log(message) : console.error(message, error)
});

export async function checkUpdate(isManual = false): Promise<void> {
  await updateService.check(isManual);
}

const trayController = new TrayController({
  isTauri,
  listen: listen as TrayListen,
  handlers: {
    checkUpdates: () => checkUpdate(true),
    showWindow: async () => {
      if (!appWindow) return;
      await appWindow.show();
      await appWindow.setFocus();
    },
    hideWindow: async () => {
      if (appWindow) await appWindow.hide();
    },
    setAlwaysOnTop: enabled => {
      byId('topCheck')?.prop('checked', enabled);
      layui.form.render('checkbox');
    },
    setAutostart: enabled => {
      byId('autoStart')?.prop('checked', enabled);
      layui.form.render('checkbox');
    },
    setUpdateDisabled: disabled => {
      isUpdateDisabled = disabled;
      settings.setUpdateDisabled(disabled);
      byId('disableUpdate')?.prop('checked', disabled);
      layui.form.render('checkbox');
      showLayuiMsg(`自动更新已${disabled ? '禁用' : '启用'}`);
    }
  },
  log: (message, error) => error === undefined ? console.log(message) : console.error(message, error)
});

// ==================== 树形视图控制 ====================

function expandAllTree() {
  $('#tree-view .tree-toggle').each(function() {
    const $this = $(this);
    const $parent = $this.closest('.tree-node, .tree-node-root');
    const $children = $parent.find('.tree-children').first();

    // 懒加载分支保持折叠，避免“展开全部”一次性生成海量 DOM。
    if ($this.attr('data-collapsed') === 'true' && $children.children().length === 0) return;

    $children.removeClass('collapsed');
    $parent.find('.tree-ellipsis').first().addClass('hidden');
    $parent.children('.tree-collection-footer').first().removeClass('hidden');
    $this.text('▼').attr('data-collapsed', 'false');
  });
  showLayuiMsg('已展开已加载节点');
}

function collapseAllTree() {
  $('#tree-view .tree-toggle').each(function() {
    const $this = $(this);
    const $parent = $this.closest('.tree-node, .tree-node-root');
    $parent.find('.tree-children').first().addClass('collapsed');
    $parent.find('.tree-ellipsis').first().removeClass('hidden');
    $parent.children('.tree-collection-footer').first().addClass('hidden');
    $this.text('▶').attr('data-collapsed', 'true');
  });
  showLayuiMsg('已折叠全部');
}

function refreshActiveResult() {
  const resultView = workbench.resultView;
  searchController.clear(resultView === 'tree' ? 'tree' : 'editor');
  const result = workbench.parse();
  if (result.ok === true) {
    renderResult(result.value, resultView);
    setValidationState('valid', 'JSON 有效');
  } else if (result.kind === 'empty') {
    $(resultView === 'tree' ? '#tree-view' : '#json-display').empty();
    setValidationState('empty', '等待输入 JSON');
  } else {
    const message = result.kind === 'too-large'
      ? '输入内容过大（超过5MB），请缩减后重试'
      : result.kind === 'unsafe-number'
        ? `数字 ${result.token.length > 32 ? `${result.token.slice(0, 29)}...` : result.token} 超出安全精度范围`
      : result.kind === 'too-deep'
        ? `JSON 嵌套超过 ${result.maxDepth} 层`
        : result.kind === 'format-error'
          ? 'JSON 格式化失败'
          : 'JSON 格式错误';
    $(resultView === 'tree' ? '#tree-view' : '#json-display')
      .html(`<div class="tree-error-state">${message}</div>`);
    if (result.kind === 'invalid') {
      const errorInfo = jsonTool.parseJsonError(result.errorSource, result.error.message);
      byId('valid-result')?.html(errorInfo).removeClass('es-pass es-empty').addClass('es-fail');
    } else {
      setValidationState('invalid', result.kind === 'too-large' ? '输入超过 5MB' : message);
    }
  }
}

function refreshTreeView() {
  if (workbench.resultView === 'tree') refreshActiveResult();
}

// ==================== 事件绑定 ====================

function bindViewModeEvents() {
  $('.result-view-btn').off('click').on('click', function(e) {
    e.preventDefault();
    const resultView = $(this).data('result-view') as WorkbenchResultView;
    switchResultView(resultView);
  });

  $('.layout-mode-btn').off('click').on('click', function(e) {
    e.preventDefault();
    applyLayout($(this).data('layout') as WorkbenchLayout);
  });

  $('#maximizeBtn').off('click').on('click', windowController.toggleMaximize);

  const debouncedTreeUpdate = debounce((text: string) => {
    if (text !== workbench.source) return;
    refreshTreeView();
  }, 200);

  $('#sourceText').off('input.contentSync').on('input.contentSync', function() {
    const text = $(this).val() as string;
    workbench.setSource(text);
    debouncedTreeUpdate(text);
  });

  $('#themeToggle').off('click').on('click', toggleTheme);
}

function bindButtonEvents() {
  // 窗口控制按钮
  byId('minimize')?.off('click').on('click', windowController.minimize);
  byId('close')?.off('click').on('click', windowController.close);

  // 功能按钮
  byId('pasteBtn')?.off('click').on('click', tryPasteFromClipboard);
  byId('clearBtn')?.off('click').on('click', clearInputContent);
  byId('formatBtn')?.off('click').on('click', formatJson);
  byId('checkUpdate')?.off('click').on('click', () => checkUpdate(true));
  $('#copyFormat').off('change.copyFormat').on('change.copyFormat', function() {
    syncCopyFormat($(this).val() as string);
  });
  $('#splitExpandAll').off('click').on('click', expandAllTree);
  $('#splitCollapseAll').off('click').on('click', collapseAllTree);

  // 拖拽区域
  if (appWindow) {
    byClass('drag-region').off('mousedown').on('mousedown', (e) => {
      e.preventDefault();
      void windowController.startDragging();
    });
  }

  initSplitResizer();
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

    form.on('checkbox(explain)', function (this: HTMLInputElement) {
      const enabled = $(this).prop('checked');
      workbench.setExplain(enabled);
      formatJson();
      showLayuiMsg(`转义状态已${enabled ? '启用' : '禁用'}`);
    });

    form.on('checkbox(renderHtml)', function (this: HTMLInputElement) {
      const enabled = $(this).prop('checked');
      workbench.setRichContent(enabled);
      formatJson();
    });

    form.on('checkbox(parseJsonString)', function (this: HTMLInputElement) {
      const enabled = $(this).prop('checked');
      workbench.setParseJsonString(enabled);
      formatJson();
    });

    form.on('checkbox(topCheck)', function (this: HTMLInputElement) {
      void toggleTop(this.checked);
    });

    form.on('checkbox(autoStart)', function (this: HTMLInputElement) {
      void toggleAutostart(this.checked);
    });

    form.on('checkbox(disableUpdate)', function (this: HTMLInputElement) {
      const newStatus = $(this).prop('checked');
      void updateDisabledActionQueue.run(async () => {
        try {
          await invoke('set_update_disabled', { disabled: newStatus });
          isUpdateDisabled = newStatus;
          settings.setUpdateDisabled(newStatus);
          showLayuiMsg(`自动更新已${newStatus ? '禁用' : '启用'}`);
        } catch (error) {
          console.error('设置更新状态失败:', error);
          showLayuiMsg('操作失败');
          byId('disableUpdate')?.prop('checked', isUpdateDisabled);
          layui.form.render('checkbox');
        }
      });
    });

    form.on('select(copyFormat)', function (data: { value: string }) {
      syncCopyFormat(data.value);
    });
  });
}

// ==================== 初始化 ====================

async function initCheckboxStates() {
  try {
    if (appWindow) {
      const isTop = await appWindow.isAlwaysOnTop();
      byId('topCheck')?.prop('checked', isTop);
    }
    if (isTauri()) {
      byId('autoStart')?.prop('checked', await isAutostartEnabled());
      try {
        await invoke('set_update_disabled', { disabled: isUpdateDisabled });
        byId('disableUpdate')?.prop('checked', isUpdateDisabled);
      } catch (e) {
        console.log('获取禁用更新状态失败:', e);
      }
    }
    const explainEnabled = byId('explain')?.prop('checked') || false;
    workbench.setExplain(explainEnabled);
    workbench.setRichContent(Boolean(byId('renderHtml')?.prop('checked')));
    workbench.setParseJsonString(Boolean(byId('parseJsonString')?.prop('checked')));
    layui.form.render();
  } catch (error) {
    console.error('初始化复选框状态失败:', error);
  }
}

async function displayVersion() {
  if (!isTauri()) {
    byId('version')?.text('Web');
    return;
  }
  try {
    const version = await getVersion();
    byId('version')?.text(version);
  } catch (e) {
    console.log('获取版本号失败:', e);
  }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.toggle('browser-mode', !isTauri());

  if (isTauri()) {
    try {
      await appWindow?.setDecorations(false);
    } catch (e) {
      console.warn('恢复窗口状态失败:', e);
    }
    await windowController.syncMaximizeState();
  }

  await initCheckboxStates();
  bindButtonEvents();
  bindCheckboxEvents();
  bindViewModeEvents();
  searchController.bind();
  applySavedWorkbenchView();
  applyTheme(isDarkMode);
  setValidationState('empty', '等待输入 JSON');
  displayVersion();
  await trayController.init();
});

window.addEventListener('beforeunload', () => {
  searchController.dispose();
  void trayController.dispose();
});
