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
import jsonTool from './utils/jsonTool';
import { SettingsStore } from './utils/settingsStore';
import { initSplitResizer } from './utils/splitResizer';
import { TrayController, type TrayListen } from './utils/trayController';
import { UpdateService, type SafeUpdateDetails, type UpdateDialogActions } from './utils/updateService';
import { WorkbenchController, type WorkbenchMode } from './utils/workbenchController';
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
// 视图模式管理
type ViewMode = WorkbenchMode;
const settings = new SettingsStore();
const workbench = new WorkbenchController({ mode: settings.getViewMode() });

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

// ==================== 同步函数 ====================

function setSourceContent(value: string) {
  workbench.setSource(value);
  $('#sourceText, #splitSourceText').val(value);
}

function syncContentToMode(mode: ViewMode) {
  setSourceContent(workbench.source);
  if (mode === 'split') {
    const result = workbench.parse();
    if (result.ok) jsonTool.updateTreeView(result.value, workbench.renderOptions);
    else $('#tree-view').empty();
  }
}

function syncSettingsToSplitMode(mode: ViewMode) {
  if (mode === 'split') {
    $('#splitExplainBtn').toggleClass('active', $('#explain').prop('checked'));
    $('#splitTopBtn').toggleClass('active', $('#topCheck').prop('checked'));
    // 同步复制格式选择器
    const copyFormat = $('#copyFormat').val() as string;
    $('#splitCopyFormat').val(copyFormat);
  }
}

function syncCopyFormat(value: string) {
  $('#customFormatContainer').toggleClass('hidden', value !== 'custom');
  if (value !== 'custom') $('#splitCopyFormat').val(value);
}

// ==================== 视图模式函数 ====================

function switchViewMode(mode: ViewMode) {
  workbench.setMode(mode);
  
  $('.view-mode-btn').removeClass('active');
  $(`.view-mode-btn[data-mode="${mode}"]`).addClass('active');
  $('.mode-container').addClass('hidden');
  $(`#${mode}-mode`).removeClass('hidden');

  const isSplit = mode === 'split';
  $('#editor-input-container').toggleClass('hidden', isSplit);
  $('#main-toolbar').toggleClass('hidden', isSplit);

  syncContentToMode(mode);
  syncSettingsToSplitMode(mode);
  settings.setViewMode(mode);
  console.log('切换到模式:', mode);
}

function applySavedViewMode() {
  switchViewMode(settings.getViewMode());
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

export async function toggleTop() {
  if (!appWindow) {
    showLayuiMsg('置顶功能仅在应用模式中可用');
    return;
  }
  try {
    const current = await appWindow.isAlwaysOnTop();
    const newStatus = !current;
    await appWindow.setAlwaysOnTop(newStatus);
    $('#splitTopBtn').toggleClass('active', newStatus);
    showLayuiMsg(`窗口${newStatus ? '已' : '未'}置顶`);
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    showLayuiMsg('操作失败');
    // 恢复 checkbox 状态
    try {
      const current = await appWindow.isAlwaysOnTop();
      byId('topCheck')?.prop('checked', current);
      $('#splitTopBtn').toggleClass('active', current);
      layui.form.render('checkbox');
    } catch (e) {
      console.error('恢复状态失败:', e);
    }
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
    if (newStatus) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }
    await invoke('set_autostart');
    showLayuiMsg(`开机自启动${newStatus ? '已启用' : '已禁用'}`);
  } catch (error) {
    console.error('切换自启动失败:', error);
    showLayuiMsg('操作失败');
    try {
      const current = await isAutostartEnabled();
      byId('autoStart')?.prop('checked', current);
      layui.form.render('checkbox');
    } catch (e) {
      console.error('恢复状态失败:', e);
    }
  }
}

export function clearInputContent() {
  setSourceContent('');
  $('#tree-view').empty();
  $('#json-display').empty();
  setValidationState('empty', '等待输入 JSON');
  showLayuiMsg('已清空内容');
}

function setValidationState(state: 'empty' | 'valid' | 'invalid', message: string) {
  const isValid = state === 'valid';
  const isInvalid = state === 'invalid';

  $('#valid-result')
    .text(state === 'empty' ? '' : isValid ? '格式正确' : message)
    .toggleClass('es-empty', state === 'empty')
    .toggleClass('es-pass', isValid)
    .toggleClass('es-fail', isInvalid);

  $('#split-valid-result')
    .text(message)
    .removeClass('es-empty es-pass es-fail status-empty status-valid status-invalid')
    .addClass(`status-${state}`)
    .toggleClass('es-pass', isValid)
    .toggleClass('es-fail', isInvalid)
    .show();
}

export function formatJson() {
  const result = workbench.parse();
  if (result.ok === false && result.kind === 'empty') {
    showLayuiMsg('请输入JSON字符串');
    return;
  }
  if (result.ok === false && result.kind === 'too-large') {
    setValidationState('invalid', '输入超过 5MB');
    showLayuiMsg('输入内容过大（超过5MB），请缩减后重试');
    return;
  }
  if (result.ok === true) {
    renderParsedJson(result.value, result.formatted);
    showLayuiMsg('格式化成功');
    return;
  }

  if (result.ok === false && result.kind === 'too-deep') {
    const message = `JSON 嵌套超过 ${result.maxDepth} 层`;
    $('#json-display').empty();
    setValidationState('invalid', message);
    if (workbench.mode === 'split') {
      $('#tree-view').html(`<div class="tree-error-state">${message}</div>`);
    }
    showLayuiMsg(message);
    return;
  }

  if (result.ok === false && result.kind === 'format-error') {
    $('#json-display').empty();
    setValidationState('invalid', 'JSON 格式化失败');
    if (workbench.mode === 'split') {
      $('#tree-view').html('<div class="tree-error-state">JSON 格式化失败</div>');
    }
    console.error('JSON 格式化失败:', result.error);
    showLayuiMsg('JSON 格式化失败');
    return;
  }

  if (result.ok === false && result.kind === 'invalid') {
    const errorInfo = jsonTool.parseJsonError(result.errorSource, result.error.message);
    byId('valid-result')?.html(errorInfo).removeClass('es-pass es-empty').addClass('es-fail');
    $('#json-display').empty();
    if (workbench.mode === 'split') {
      $('#tree-view').html('<div class="tree-error-state">JSON 格式错误</div>');
      setValidationState('invalid', 'JSON 格式错误');
    }
    showLayuiMsg('JSON格式错误');
  }
}

function renderParsedJson(jsonObj: unknown, formatted = JSON.stringify(jsonObj, null, 2)) {
  workbench.commitFormattedResult(jsonObj, formatted);
  $('#sourceText, #splitSourceText').val(formatted);
  setValidationState('valid', 'JSON 有效');

  if (workbench.mode === 'split') {
    jsonTool.updateTreeView(jsonObj, workbench.renderOptions);
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
      yes: async function(index) {
        layer.close(index);
        await actions.confirm();
      },
      btn2: function(index) {
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
      $('#splitTopBtn').toggleClass('active', enabled);
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

function refreshTreeView() {
  if (workbench.mode !== 'split') return;
  const result = workbench.parse();
  if (result.ok === true) {
    jsonTool.updateTreeView(result.value, workbench.renderOptions);
    setValidationState('valid', 'JSON 有效');
  } else if (result.kind === 'empty') {
    $('#tree-view').empty();
    setValidationState('empty', '等待输入 JSON');
  } else {
    const message = result.kind === 'too-large'
      ? '输入内容过大（超过5MB），请缩减后重试'
      : result.kind === 'too-deep'
        ? `JSON 嵌套超过 ${result.maxDepth} 层`
        : result.kind === 'format-error'
          ? 'JSON 格式化失败'
          : 'JSON 格式错误';
    $('#tree-view').html(`<div style="color: #999; padding: 20px;">${message}</div>`);
    setValidationState('invalid', result.kind === 'too-large' ? '输入超过 5MB' : message);
  }
}

// ==================== 搜索功能 ====================

interface SearchState {
  matches: Element[];
  currentIndex: number;
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
}

const searchState: { editor: SearchState; tree: SearchState } = {
  editor: { matches: [], currentIndex: -1, query: '', caseSensitive: false, useRegex: false },
  tree: { matches: [], currentIndex: -1, query: '', caseSensitive: false, useRegex: false }
};

function toggleSearchBar(stateKey: 'editor' | 'tree', show?: boolean) {
  const barId = stateKey === 'editor' ? 'editorSearchBar' : 'treeSearchBar';
  const inputId = stateKey === 'editor' ? 'editorSearchInput' : 'treeSearchInput';
  const $bar = $(`#${barId}`);

  if (show === undefined) {
    // Toggle
    $bar.toggleClass('hidden');
  } else {
    $bar.toggleClass('hidden', !show);
  }

  if (!$bar.hasClass('hidden')) {
    // Focus input when shown
    setTimeout(() => $(`#${inputId}`).focus(), 100);
  } else {
    // Clear search when hidden
    clearSearch(stateKey);
  }
}

function performSearch(containerId: string, inputId: string, countId: string, stateKey: 'editor' | 'tree') {
  const query = ($(`#${inputId}`).val() as string || '').trim();
  const $container = $(`#${containerId}`);
  const $input = $(`#${inputId}`);
  const state = searchState[stateKey];

  // 清除之前的高亮
  $container.find('.search-highlight, .search-highlight-active').each(function() {
    const $this = $(this);
    $this.replaceWith($this.text());
  });

  state.matches = [];
  state.currentIndex = -1;
  state.query = query;

  if (!query) {
    $(`#${countId}`).text('');
    $input.removeClass('regex-error');
    return;
  }

  // 验证正则表达式
  let searchPattern: RegExp | null = null;
  if (state.useRegex) {
    try {
      const flags = state.caseSensitive ? 'g' : 'gi';
      searchPattern = new RegExp(query, flags);
      $input.removeClass('regex-error');
    } catch (e) {
      $input.addClass('regex-error');
      $(`#${countId}`).text('正则无效');
      return;
    }
  } else {
    $input.removeClass('regex-error');
  }

  // 在 key 和 value 元素中搜索
  const selectors = containerId === 'json-display'
    ? '.json-key, .json-string, .json-number, .json-boolean, .json-null'
    : '.tree-key, .tree-value';

  $container.find(selectors).each(function() {
    const el = this as HTMLElement;
    // 跳过已包含 latex 渲染的元素
    if (el.querySelector('.katex')) return;

    const textContent = el.textContent || '';
    const hasMatch = state.useRegex
      ? searchPattern!.test(textContent)
      : state.caseSensitive
        ? textContent.includes(query)
        : textContent.toLowerCase().includes(query.toLowerCase());

    if (hasMatch) {
      highlightTextInElement(el, query, state.caseSensitive, searchPattern);
    }
  });

  // 收集所有高亮元素
  state.matches = Array.from($container.find('.search-highlight').toArray());

  if (state.matches.length > 0) {
    state.currentIndex = 0;
    activateMatch(stateKey);
    $(`#${countId}`).text(`1/${state.matches.length}`);
  } else {
    $(`#${countId}`).text('0 结果');
  }
}

function highlightTextInElement(el: HTMLElement, query: string, caseSensitive: boolean, regex: RegExp | null) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || '';
    const parent = textNode.parentNode!;
    const fragments: (Text | HTMLElement)[] = [];

    if (regex) {
      // 正则匹配
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      regex.lastIndex = 0; // Reset regex

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = match[0];
        fragments.push(span);

        lastIndex = match.index + match[0].length;

        // Prevent infinite loop for zero-width matches
        if (match[0].length === 0) regex.lastIndex++;
      }

      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
      }
    } else {
      // 普通文本匹配 - 找所有匹配
      const searchText = caseSensitive ? text : text.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      let lastIndex = 0;
      let idx = searchText.indexOf(searchQuery, lastIndex);

      while (idx !== -1) {
        if (idx > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, idx)));
        }

        const match = text.substring(idx, idx + query.length);
        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = match;
        fragments.push(span);

        lastIndex = idx + query.length;
        idx = searchText.indexOf(searchQuery, lastIndex);
      }

      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
      }
    }

    if (fragments.length > 0) {
      fragments.forEach(frag => parent.insertBefore(frag, textNode));
      parent.removeChild(textNode);
    }
  }
}

function activateMatch(stateKey: 'editor' | 'tree') {
  const state = searchState[stateKey];

  // 清除之前的活跃高亮
  const containerId = stateKey === 'editor' ? 'json-display' : 'tree-view';
  $(`#${containerId} .search-highlight-active`).removeClass('search-highlight-active').addClass('search-highlight');

  if (state.matches.length === 0 || state.currentIndex < 0) return;

  const el = state.matches[state.currentIndex];
  if (el) {
    el.classList.remove('search-highlight');
    el.classList.add('search-highlight-active');

    // 展开父节点（如果在折叠的树中）
    const $parents = $(el).parents('.tree-children.collapsed');
    $parents.each(function() {
      $(this).removeClass('collapsed');
      const $node = $(this).closest('.tree-node, .tree-node-root');
      $node.find('.tree-ellipsis').first().addClass('hidden');
      $node.find('.tree-bracket').last().removeClass('hidden');
      $node.find('.tree-toggle').first().text('▼').attr('data-collapsed', 'false');
    });

    // 滚动到可见区域
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function navigateSearch(stateKey: 'editor' | 'tree', direction: 'next' | 'prev') {
  const state = searchState[stateKey];
  if (state.matches.length === 0) return;

  if (direction === 'next') {
    state.currentIndex = (state.currentIndex + 1) % state.matches.length;
  } else {
    state.currentIndex = (state.currentIndex - 1 + state.matches.length) % state.matches.length;
  }

  activateMatch(stateKey);
  const countId = stateKey === 'editor' ? 'editorSearchCount' : 'treeSearchCount';
  $(`#${countId}`).text(`${state.currentIndex + 1}/${state.matches.length}`);
}

function clearSearch(stateKey: 'editor' | 'tree') {
  const inputId = stateKey === 'editor' ? 'editorSearchInput' : 'treeSearchInput';
  const countId = stateKey === 'editor' ? 'editorSearchCount' : 'treeSearchCount';
  const containerId = stateKey === 'editor' ? 'json-display' : 'tree-view';

  $(`#${inputId}`).val('').removeClass('regex-error');
  $(`#${countId}`).text('');
  searchState[stateKey].matches = [];
  searchState[stateKey].currentIndex = -1;
  searchState[stateKey].query = '';

  // 清除高亮
  $(`#${containerId}`).find('.search-highlight, .search-highlight-active').each(function() {
    const $this = $(this);
    $this.replaceWith($this.text());
  });
}

function bindSearchEvents() {
  // 搜索栏显示/隐藏
  $('#editorSearchToggle').on('click', () => toggleSearchBar('editor'));
  $('#treeSearchToggle').on('click', () => toggleSearchBar('tree'));

  // Ctrl+F / Cmd+F 快捷键
  $(document).on('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const isEditorMode = !$('#editor-mode').hasClass('hidden');
      toggleSearchBar(isEditorMode ? 'editor' : 'tree', true);
    }
  });

  // 编辑器模式搜索
  let editorDebounce: ReturnType<typeof setTimeout>;
  $('#editorSearchInput').on('input', function() {
    clearTimeout(editorDebounce);
    editorDebounce = setTimeout(() => {
      performSearch('json-display', 'editorSearchInput', 'editorSearchCount', 'editor');
    }, 300);
  });
  $('#editorSearchInput').on('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateSearch('editor', e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleSearchBar('editor', false);
    }
  });

  // Aa 按钮 - 大小写敏感
  $('#editorCaseSensitive').on('click', function() {
    const $btn = $(this);
    searchState.editor.caseSensitive = !searchState.editor.caseSensitive;
    $btn.toggleClass('active', searchState.editor.caseSensitive);
    performSearch('json-display', 'editorSearchInput', 'editorSearchCount', 'editor');
  });

  // .* 按钮 - 正则模式
  $('#editorUseRegex').on('click', function() {
    const $btn = $(this);
    searchState.editor.useRegex = !searchState.editor.useRegex;
    $btn.toggleClass('active', searchState.editor.useRegex);
    performSearch('json-display', 'editorSearchInput', 'editorSearchCount', 'editor');
  });

  $('#editorSearchPrev').on('click', () => navigateSearch('editor', 'prev'));
  $('#editorSearchNext').on('click', () => navigateSearch('editor', 'next'));
  $('#editorSearchClear').on('click', () => toggleSearchBar('editor', false));

  // 树形视图搜索
  let treeDebounce: ReturnType<typeof setTimeout>;
  $('#treeSearchInput').on('input', function() {
    clearTimeout(treeDebounce);
    treeDebounce = setTimeout(() => {
      performSearch('tree-view', 'treeSearchInput', 'treeSearchCount', 'tree');
    }, 300);
  });
  $('#treeSearchInput').on('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateSearch('tree', e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleSearchBar('tree', false);
    }
  });

  // Aa 按钮 - 大小写敏感
  $('#treeCaseSensitive').on('click', function() {
    const $btn = $(this);
    searchState.tree.caseSensitive = !searchState.tree.caseSensitive;
    $btn.toggleClass('active', searchState.tree.caseSensitive);
    performSearch('tree-view', 'treeSearchInput', 'treeSearchCount', 'tree');
  });

  // .* 按钮 - 正则模式
  $('#treeUseRegex').on('click', function() {
    const $btn = $(this);
    searchState.tree.useRegex = !searchState.tree.useRegex;
    $btn.toggleClass('active', searchState.tree.useRegex);
    performSearch('tree-view', 'treeSearchInput', 'treeSearchCount', 'tree');
  });

  $('#treeSearchPrev').on('click', () => navigateSearch('tree', 'prev'));
  $('#treeSearchNext').on('click', () => navigateSearch('tree', 'next'));
  $('#treeSearchClear').on('click', () => toggleSearchBar('tree', false));
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
  $('#maximizeBtn').off('click').on('click', () => windowController.toggleMaximize('#maximizeBtn'));

  // 分屏模式编辑器实时同步（带防抖）
  const debouncedTreeUpdate = debounce((text: string) => {
    if (text !== workbench.source) return;
    refreshTreeView();
  }, 200);

  $('#splitSourceText').off('input').on('input', function() {
    const text = $(this).val() as string;
    workbench.setSource(text);
    $('#sourceText').val(text);
    debouncedTreeUpdate(text);
  });

  $('#sourceText').off('input.contentSync').on('input.contentSync', function() {
    workbench.setSource($(this).val() as string);
    $('#splitSourceText').val(workbench.source);
  });

  // 主题切换按钮
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

  // 拖拽区域
  if (appWindow) {
    byClass('drag-region').off('mousedown').on('mousedown', (e) => {
      e.preventDefault();
      void windowController.startDragging();
    });
  }

  bindSplitToolbarEvents();
}

function bindSplitToolbarEvents() {
  // 功能按钮
  $('#splitFormatBtn').off('click').on('click', formatJson);
  $('#splitPasteBtn').off('click').on('click', tryPasteFromClipboard);
  $('#splitClearBtn').off('click').on('click', clearInputContent);
  $('#splitRenderHtml').off('change').on('change', function() {
    const enabled = $(this).prop('checked');
    workbench.setRichContent(enabled);
    byId('renderHtml')?.prop('checked', enabled);
    layui.form.render('checkbox');
    formatJson();
  });
  $('#splitParseJsonString').off('change').on('change', function() {
    const enabled = $(this).prop('checked');
    workbench.setParseJsonString(enabled);
    byId('parseJsonString')?.prop('checked', enabled);
    layui.form.render('checkbox');
    formatJson();
  });
  $('#splitCheckUpdate').off('click').on('click', () => checkUpdate(true));
  $('#splitExpandAll').off('click').on('click', expandAllTree);
  $('#splitCollapseAll').off('click').on('click', collapseAllTree);

  // 转义和置顶按钮
  $('#splitExplainBtn').off('click').on('click', function() {
    const $btn = $(this);
    const isActive = !$btn.hasClass('active');
    $btn.toggleClass('active', isActive);
    workbench.setExplain(isActive);
    byId('explain')?.prop('checked', isActive);
    layui.form.render('checkbox');
    formatJson();
    showLayuiMsg(`转义状态已${isActive ? '启用' : '禁用'}`);
  });

  $('#splitTopBtn').off('click').on('click', async function() {
    await toggleTop();
    if (appWindow) {
      try {
        const current = await appWindow.isAlwaysOnTop();
        byId('topCheck')?.prop('checked', current);
        layui.form.render('checkbox');
      } catch (e) {
        console.error('同步置顶状态失败:', e);
      }
    }
  });

  // 复制格式选择器 - 同步到主选择器
  $('#splitCopyFormat').off('change').on('change', function() {
    const format = $(this).val() as string;
    $('#copyFormat').val(format).trigger('change');
  });

  // 主题切换
  $('#splitThemeToggle').off('click').on('click', toggleTheme);

  // 窗口控制按钮
  $('#splitMinimize').off('click').on('click', windowController.minimize);
  $('#splitMaximize').off('click').on('click', () => windowController.toggleMaximize('#splitMaximize'));
  $('#splitClose').off('click').on('click', windowController.close);

  // 初始化可拖动分割线
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

    form.on('checkbox(explain)', function () {
      const enabled = $(this).prop('checked');
      workbench.setExplain(enabled);
      $('#splitExplainBtn').toggleClass('active', enabled);
      formatJson();
      showLayuiMsg(`转义状态已${enabled ? '启用' : '禁用'}`);
    });

    form.on('checkbox(renderHtml)', function () {
      const enabled = $(this).prop('checked');
      workbench.setRichContent(enabled);
      byId('splitRenderHtml')?.prop('checked', enabled);
      formatJson();
    });

    form.on('checkbox(parseJsonString)', function () {
      const enabled = $(this).prop('checked');
      workbench.setParseJsonString(enabled);
      byId('splitParseJsonString')?.prop('checked', enabled);
      formatJson();
    });

    form.on('checkbox(topCheck)', function () {
      toggleTop();
    });

    form.on('checkbox(autoStart)', function () {
      toggleAutostart();
    });

    form.on('checkbox(disableUpdate)', async function () {
      const newStatus = $(this).prop('checked');
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

    form.on('select(copyFormat)', function (data) {
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
      $('#splitTopBtn').toggleClass('active', isTop);
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
    $('#splitExplainBtn').toggleClass('active', explainEnabled);
    layui.form.render();
  } catch (error) {
    console.error('初始化复选框状态失败:', error);
  }
}

async function displayVersion() {
  if (!isTauri()) {
    byId('version')?.text('Web');
    byId('splitVersionText')?.text('Web');
    return;
  }
  try {
    const version = await getVersion();
    byId('version')?.text(version);
    byId('splitVersionText')?.text(version);
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
  }

  await initCheckboxStates();
  bindButtonEvents();
  bindCheckboxEvents();
  bindViewModeEvents();
  bindSearchEvents();
  applySavedViewMode();
  applyTheme(isDarkMode);
  setValidationState('empty', '等待输入 JSON');
  displayVersion();
  await trayController.init();
});

window.addEventListener('beforeunload', () => {
  void trayController.dispose();
});
