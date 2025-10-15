// Entry for Tauri v2 frontend
// 关键修复：从 @tauri-apps/api/core 导入 invoke（Tauri v2 最新路径）
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
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

// 工具函数
const byId = (id: string) => $(`#${id}`);
const byClass = (cls: string) => $(`.${cls}`);

// 补全 layui 类型定义
declare const layui: {
  use: (modules: string[], callback: () => void) => void;
  form: {
    on: (event: string, handler: (data: any) => void) => void;
  };
  layer: typeof layer;
};

// 补全 layer 类型定义
declare const layer: {
  msg: (text: string, options?: { time?: number }) => void;
  confirm: (text: string, options: { btn: string[] }, yes: () => void, no: () => void) => void;
  use: (modules: string[], callback: () => void) => void;
  form: any;
  layer: any;
};

// 应用窗口对象
const appWindow = getCurrentWebviewWindow();

// 状态管理
let isExplainEnabled = false;
const unlistenFns: Array<() => void> = [];

// 尽快恢复窗口状态以避免闪烁
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await restoreStateCurrent(StateFlags.ALL);
  } catch (e) {
    console.warn('恢复窗口状态失败:', e);
  }

  // 初始化复选框状态
  await initCheckboxStates();

  // 绑定按钮事件
  bindButtonEvents();

  // 绑定复选框事件
  bindCheckboxEvents();
});

// 初始化复选框状态
async function initCheckboxStates() {
  try {
    // 初始化置顶状态
    const topChecked = await appWindow.isAlwaysOnTop();
    byId('topCheck')?.prop('checked', topChecked);

    // 初始化自启动状态
    const autoStartChecked = await isAutostartEnabled();
    byId('autoStart')?.prop('checked', autoStartChecked);

    // 初始化转义状态
    isExplainEnabled = byId('explain')?.prop('checked') || false;
  } catch (error) {
    console.error('初始化复选框状态失败:', error);
  }
}

// 绑定按钮事件
function bindButtonEvents() {
  // 窗口控制按钮
  byId('minimize')?.on('click', () => appWindow.minimize());
  byId('close')?.on('click', () => appWindow.close());

  // 功能按钮
  byId('pasteBtn')?.on('click', tryPasteFromClipboard);
  byId('clearBtn')?.on('click', clearInputContent);
  byId('formatBtn')?.on('click', () => formatJson());
  byId('checkUpdate')?.on('click', checkUpdate);

  // 拖拽区域
  byClass('drag-region').on('mousedown', () => {
    appWindow.startDragging();
  });
}

// 绑定复选框事件
function bindCheckboxEvents() {
  layui.use(['form'], function () {
    const form = layui.form;
    const layer = layui.layer;
    
    // 转义复选框事件
    form.on('checkbox(explain)', function () {
      isExplainEnabled = $(this).prop('checked');
      formatJson();
      layer.msg(`转义状态已${isExplainEnabled ? '启用' : '禁用'}`);
    });
    
    // 置顶复选框事件
    form.on('checkbox(topCheck)', function () {
      toggleTop();
    });
    
    // 自启动复选框事件
    form.on('checkbox(autoStart)', function () {
      toggleAutostart();
    });
  });
}

// 窗口关闭时保存状态
window.addEventListener('beforeunload', () => {
  try {
    saveWindowState(StateFlags.ALL);
  } catch { /* 忽略保存失败的情况 */ }
});

// 验证并更新置顶状态显示
export async function toggleTopInfo() {
  try {
  const finalStatus = await appWindow.isAlwaysOnTop();
  console.log('最终置顶状态:', finalStatus);

    // 显示结果并修正UI
  layer.msg(`窗口${finalStatus ? '已' : '未'}置顶`);
  byId('topCheck')?.prop('checked', finalStatus);
  } catch (error) {
    console.error('获取置顶状态失败:', error);
    layer.msg('获取状态失败');
  }
}

// 切换置顶状态并通知后端同步
export async function toggleTop() {
  try {
    console.log('开始切换置顶状态...');
    // 获取当前状态并计算新状态
    const current = await appWindow.isAlwaysOnTop();
    const newStatus = !current;

    // 更新UI
    byId('topCheck')?.prop('checked', newStatus);

    // 执行状态修改
    await appWindow.setAlwaysOnTop(newStatus);
    
    // 通知后端更新状态（关键修改）
    await invoke('set_always_on_top');
    
    // 验证并刷新状态显示
    toggleTopInfo();
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    layer.msg('操作失败，请检查控制台');
  }
}

// 验证并更新自启动状态显示
export async function toggleAutostartInfo() {
  try {
  const finalStatus = await isAutostartEnabled();
  console.log('最终自启动状态:', finalStatus);

    // 更新UI并显示结果
  byId('autoStart')?.prop('checked', finalStatus);
  layer.msg(`开机自启已${finalStatus ? '启用' : '禁用'}`);
  } catch (error) {
    console.error('获取自启动状态失败:', error);
    layer.msg('获取状态失败');
  }
}

// 切换自启动状态并通知后端同步
export async function toggleAutostart() {
  try {
    // 获取当前状态
    const enabled = await isAutostartEnabled();
    console.log('当前自启动状态:', enabled);
    const newStatus = !enabled;

    // 执行状态修改
    if (newStatus) {
      await disableAutostart();
    } else {
      await enableAutostart();
    }
    
    const enabled2 = await isAutostartEnabled();
    console.log('当前自启动状态:', enabled2);

    // 通知后端更新状态（关键修改）
    await invoke('set_autostart');
    
    // 验证并刷新状态显示
    toggleAutostartInfo();
  } catch (error) {
    console.error('切换自启动失败:', error);
    layer.msg('操作失败，请检查控制台');
  }
}

// 监听后端事件
(async () => {
  try {
    // 监听显示/隐藏事件
    unlistenFns.push(await listen('tray://show', () => appWindow.show()));
    unlistenFns.push(await listen('tray://hide', () => appWindow.hide()));

    // 监听置顶切换事件
    unlistenFns.push(await listen('tray://toggle-always-on-top', toggleTopInfo));
    
    // 监听自启动切换事件
    unlistenFns.push(await listen('tray://toggle-autostart', toggleAutostartInfo));
    
    // 监听托盘检查更新事件
    unlistenFns.push(await listen('tray://check-updates', checkUpdate));
  } catch (e) {
    console.warn('注册事件失败：', e);
    layer.msg('注册事件失败：' + e);
  }
})();

// 检查更新
export async function checkUpdate() {
  try {
    const res = await check();
    if (res?.available) {
      console.log('发现新版本:', res.version, '当前:', res.currentVersion);
      layer.confirm(`发现新版本: ${res.version}，是否现在更新？`, {
        btn: ['确定', '关闭']
      }, async function () {
        try {
          await res.downloadAndInstall();
          await relaunch();
        } catch (error) {
          console.error('更新失败:', error);
          layer.msg('更新失败，请稍后再试');
        }
      }, function () {
        layer.msg('已取消更新');
      });
    } else {
      layer.msg('已是最新版本');
    }
  } catch (e) {
    console.warn('自动更新检查失败：', e);
  }
}

// 初始检查更新
checkUpdate();

// 清空输入内容
export function clearInputContent() {
  byId('sourceText')?.val('');
  byId('json-display')?.html('');
  const validResult = byId('valid-result');
  if (validResult) {
    validResult.html('')
      .removeClass("es-fail")
      .addClass("es-empty");
  }
}

// 格式化JSON
export function formatJson() {
  console.log('格式化JSON，转义状态:', isExplainEnabled);
  if (jsonTool && typeof jsonTool.jsonFormat === 'function') {
    jsonTool.jsonFormat();
  }
}

// 从剪贴板粘贴
export async function tryPasteFromClipboard() {
  try {
    const text = await readClipboardText();
    const textarea = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    if (textarea && text && textarea.value !== text) {
      textarea.value = text;
      formatJson();
    }
  } catch {
    console.log("从剪贴板读取失败");
  }
}

// Vite HMR 清理
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const unlisten of unlistenFns) {
      try { unlisten(); } catch { /* 忽略清理失败 */ }
    }
  });
}

/// <reference types="vite/client" />
