// Entry for Tauri v2 frontend
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

interface JsonTool {
  jsonFormat: (escape?: boolean) => void;
}
declare const jsonTool: JsonTool | undefined;

// 工具函数
const byId = (id: string) => $(`#${id}`);
const byClass = (cls: string) => $(`.${cls}`);

// 应用窗口对象
const appWindow = getCurrentWebviewWindow();

// 状态管理
let isExplainEnabled = false;
const unlistenFns: Array<() => void> = [];

// 1) 尽快恢复窗口状态以避免闪烁
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
  // 转义复选框
  // byId('explain')?.on('change', function() {
  //   isExplainEnabled = $(this).prop('checked');
  //   formatJson();
  // });

  // // 置顶复选框
  // byId('topCheck')?.on('change', toggleTop);

  // // 自启动复选框
  // byId('autoStart')?.on('change', toggleAutostart);
  layui.use(['form'], function () {
    var form = layui.form;
    var layer = layui.layer;
    // checkbox 事件
    form.on('checkbox(explain)', function (data) {
      var elem = data.elem; // 获得 checkbox 原始 DOM 对象
            isExplainEnabled = $(this).prop('checked');
      formatJson();
      layer.msg('explain checked 状态: ' + elem.checked);
    });
    form.on('checkbox(topCheck)', function (data) {
      var elem = data.elem; // 获得 checkbox 原始 DOM 对象      
      toggleTop();
      layer.msg('topCheck checked 状态: ' + elem.checked);
    });
    form.on('checkbox(autoStart)', function (data) {
      var elem = data.elem; // 获得 checkbox 原始 DOM 对象
      toggleAutostart();
      layer.msg('autoStart checked 状态: ' + elem.checked);
    });
  });
}

// 窗口关闭时保存状态
window.addEventListener('beforeunload', () => {
  try {
    saveWindowState(StateFlags.ALL);
  } catch { /* ignore */ }
});

// 切换置顶状态
export async function toggleTop() {
  try {
    console.log('开始切换置顶状态...');
    // 获取当前状态
    const current = await appWindow.isAlwaysOnTop();
    const newStatus = !current;

    // 更新UI
    byId('topCheck')?.prop('checked', newStatus);

    // 设置新状态
    await appWindow.setAlwaysOnTop(newStatus);

    // 验证状态
    const finalStatus = await appWindow.isAlwaysOnTop();
    console.log('最终置顶状态:', finalStatus);

    // 显示结果
    layer.msg(`窗口${finalStatus ? '已' : '未'}置顶`);

    // 状态不一致时修正UI
    if (finalStatus !== newStatus) {
      byId('topCheck')?.prop('checked', finalStatus);
    }
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    layer.msg('操作失败，请检查控制台');
  }
}

// 切换自启动状态
export async function toggleAutostart() {
  try {
    // 获取当前状态
    const enabled = await isAutostartEnabled();
    const newStatus = !enabled;

    // 执行切换操作
    if (newStatus) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }

    // 验证状态
    const finalStatus = await isAutostartEnabled();

    // 更新UI
    byId('autoStart')?.prop('checked', finalStatus);

    // 显示结果
    layer.msg(`开机自启已${finalStatus ? '启用' : '禁用'}`);
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
    unlistenFns.push(await listen('tray://toggle-always-on-top', toggleTop));
    // 监听自启动切换事件
    unlistenFns.push(await listen('tray://toggle-autostart', toggleAutostart));
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
    jsonTool.jsonFormat(isExplainEnabled);
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
      try { unlisten(); } catch { /* ignore */ }
    }
  });
}

/// <reference types="vite/client" />
