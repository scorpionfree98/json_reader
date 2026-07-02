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
import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager';
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

// HTML 转义函数（防止 XSS）
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

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
// 暴露到 window 以便 jsonTool 访问
(window as any).isExplainEnabled = isExplainEnabled;

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
    // 切换到分屏模式
    const sourceText = $('#sourceText').val() as string;
    const splitText = $('#splitSourceText').val() as string;
    // 优先使用已有内容，如果分屏输入框为空则从编辑器同步
    const text = splitText.trim() ? splitText : sourceText;
    if (!splitText.trim() && sourceText.trim()) {
      $('#splitSourceText').val(sourceText);
    }

    // 保留并复制输入框内容（格式化后的 JSON）
    if (sourceText && sourceText.trim()) {
      copyOutputToClipboard(sourceText);
    }

    try {
      if (text.trim()) {
        const jsonObj = JSON.parse(text);
        jsonTool.updateTreeView(jsonObj);
      } else {
        $('#tree-view').empty();
      }
    } catch (e) {
      $('#tree-view').empty();
    }
  } else {
    // 切换到编辑器模式
    const splitText = $('#splitSourceText').val() as string;
    if (splitText.trim()) {
      $('#sourceText').val(splitText);
    }

    // 保留并复制输入框内容（格式化后的 JSON）
    const sourceText = $('#sourceText').val() as string;
    if (sourceText && sourceText.trim()) {
      copyOutputToClipboard(sourceText);
    }
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
  $('#sourceText, #splitSourceText').val('');
  $('#tree-view').empty();
  byId('valid-result')?.html('').addClass('es-empty');
  showLayuiMsg('已清空内容');
}

export function formatJson() {
  const text = currentViewMode === 'split'
    ? ($('#splitSourceText').val() as string)
    : ($('#sourceText').val() as string);
  if (!text.trim()) {
    showLayuiMsg('请输入JSON字符串');
    return;
  }
  try {
    const jsonObj = JSON.parse(text);
    const formatted = JSON.stringify(jsonObj, null, 2);
    $('#sourceText, #splitSourceText').val(formatted);
    byId('valid-result')?.html('格式正确').removeClass('es-fail es-empty').addClass('es-pass');
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
    byId('valid-result')?.html(errorInfo).removeClass('es-pass es-empty').addClass('es-fail');
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

      // 转义 HTML 防止 XSS 注入
      const escapedCurrentVersion = escapeHtml(currentVersion);
      const escapedLatestVersion = escapeHtml(latestVersion);
      const escapedReleaseNotes = escapeHtml(releaseNotes);

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
                  <span style="font-weight: bold; color: #333;">${escapedCurrentVersion}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                  <span style="color: #666;">最新版本：</span>
                  <span style="font-weight: bold; color: #1890ff;">${escapedLatestVersion}</span>
                </div>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 15px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #333;">更新日志：</div>
                <div style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 13px; line-height: 1.6; color: #555; white-space: pre-wrap;">${escapedReleaseNotes}</div>
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
  const sourceText = ($('#splitSourceText').val() as string) || ($('#sourceText').val() as string);
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
  $('#maximizeBtn').off('click').on('click', () => toggleWindowMaximize('#maximizeBtn'));

  // 分屏模式编辑器实时同步
  $('#splitSourceText').off('input').on('input', function() {
    const text = $(this).val() as string;
    $('#sourceText').val(text);
    try {
      if (text.trim()) {
        const jsonObj = JSON.parse(text);
        jsonTool.updateTreeView(jsonObj);
        $('#valid-result').html('格式正确').removeClass('es-fail es-empty').addClass('es-pass');
      } else {
        $('#tree-view').empty();
        $('#valid-result').html('').addClass('es-empty').removeClass('es-fail es-pass');
      }
    } catch (e) {
      $('#tree-view').html('<div style="color: #999; padding: 20px;">JSON 格式错误</div>');
      $('#valid-result').html('格式错误').addClass('es-fail').removeClass('es-empty es-pass');
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
    isExplainEnabled = isActive;
    (window as any).isExplainEnabled = isActive;
    byId('explain')?.prop('checked', isActive);
    layui.form.render('checkbox');
    formatJson();
    refreshTreeView();
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

  // 折叠/展开全部
  $('#splitExpandAll').off('click').on('click', () => {
    $('#tree-view .tree-children').removeClass('collapsed');
    $('#tree-view .tree-ellipsis').addClass('hidden');
    $('#tree-view .tree-bracket:last-child').removeClass('hidden');
    $('#tree-view .tree-toggle').text('▼').attr('data-collapsed', 'false');
  });

  $('#splitCollapseAll').off('click').on('click', () => {
    $('#tree-view .tree-children').addClass('collapsed');
    $('#tree-view .tree-ellipsis').removeClass('hidden');
    $('#tree-view .tree-bracket:last-child').addClass('hidden');
    $('#tree-view .tree-toggle').text('▶').attr('data-collapsed', 'true');
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
      (window as any).isExplainEnabled = isExplainEnabled;
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

    form.on('checkbox(disableUpdate)', async function () {
      const newStatus = $(this).prop('checked');
      try {
        await invoke('set_update_disabled', { disabled: newStatus });
        isUpdateDisabled = newStatus;
        showLayuiMsg(`自动更新已${newStatus ? '禁用' : '启用'}`);
      } catch (error) {
        console.error('设置更新状态失败:', error);
        showLayuiMsg('操作失败');
        byId('disableUpdate')?.prop('checked', isUpdateDisabled);
        layui.form.render('checkbox');
      }
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
      const isTop = await appWindow.isAlwaysOnTop();
      byId('topCheck')?.prop('checked', isTop);
      $('#splitTopBtn').toggleClass('active', isTop);
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
    (window as any).isExplainEnabled = isExplainEnabled;
    $('#splitExplainBtn').toggleClass('active', isExplainEnabled);
    layui.form.render();
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
  bindSearchEvents();
  applySavedViewMode();
  applyTheme(isDarkMode);
  displayVersion();
  initTrayListeners();
});
