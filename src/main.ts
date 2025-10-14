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



// json_tool.ts
declare const layer: {
  msg: (text: string, options?: { time?: number }) => void;
  confirm: (text: string, options?: { btn?: string[] }, yes?: () => void, no?: () => void) => void;
};
const byId = (id: string) => $(`#${id}`);
const byClass = (cls: string) => $(`.${cls}`);

const appWindow = getCurrentWebviewWindow();

// 0) expose copy util used by the page (keeps a-tauri.html compatibility)

// 1) restore window state ASAP to avoid flash
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await restoreStateCurrent(StateFlags.ALL);
  } catch (e) {
    console.warn('restore window state failed:', e);
  }

  // 2) wire close/minimize buttons if present (放到 DOMContentLoaded 保证元素已渲染)

  byId('minimize')?.on('click', () => appWindow.minimize());
  byId('close')?.on('click', () => appWindow.close());
  byId('pasteBtn')?.on('click', () => tryPasteFromClipboard());
  byId('clearBtn')?.on('click', () => clearInputContent());
  byId('formatBtn')?.on('click', () => formatJson());
  byId('checkUpdate')?.on('click', () => checkUpdate());
  byClass('drag-region').on('mousedown', () => {
    appWindow.startDragging(); // 为元素添加拖拽功能
  });
  byId('explain')?.on('click', () => toggleExplain());

  // init the checked state
  const topChecked = appWindow.isAlwaysOnTop();
  byId('topCheck')?.prop('checked', topChecked);
  const autoStartChecked = isAutostartEnabled();
  byId('autoStart')?.prop('checked', autoStartChecked);




});

// persist on exit
window.addEventListener('beforeunload', () => {
  try {
    saveWindowState(StateFlags.ALL);
  } catch { /* ignore */ }
});

export async function toggleTop() {
  try {
    console.log('开始切换置顶状态...');
    const appWindow = getCurrentWebviewWindow();
    // 1. 获取当前置顶状态
    const current = await appWindow.isAlwaysOnTop();
    console.log('当前状态:', current);
    
    const newStatus = !current;
    console.log('将要设置的新状态:', newStatus);
    
    // 2. 立即更新UI（同步操作）
    byId('topCheck')?.prop('checked', newStatus);
    
    // 3. 设置新状态并等待完成
    await appWindow.setAlwaysOnTop(newStatus);
    console.log('已调用setAlwaysOnTop');
    
    // 4. 添加短暂延迟确保状态更新
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 5. 验证最终状态
    const last_status = await appWindow.isAlwaysOnTop();
    console.log('最终状态:', last_status);
    
    // 6. 显示操作结果
    layer.msg(`窗口置顶状态：${last_status ? '已置顶' : '未置顶'}`);
    
    // 7. 如果状态未改变，强制更新UI
    if (last_status === current) {
      console.warn('状态未改变，强制更新UI');
      byId('topCheck')?.prop('checked', current);
    }
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    layer.msg('操作失败，请检查控制台');
  }
}

export async function toggleAutostart() {
  try {
    // 1. 获取当前状态（异步等待）
    const enabled = await isAutostartEnabled();
    const new_status = !enabled;


    // 3. 启用/禁用自启动（异步操作）
    if (new_status) {
      await disableAutostart();
    } else {
      await enableAutostart();
    }

    // 2. 更新UI
    byId('autoStart')?.prop('checked', enabled);
    // 4. 验证最终状态并提示
    const last_status = await isAutostartEnabled();
    layer.msg(`开机自启状态：${last_status ? '已启用' : '已禁用'}`);
  } catch (error) {
    console.error('切换自启动失败:', error);
    layer.msg('操作失败，请检查控制台');
  }
}

// 3) listen to tray actions from backend
const unlistenFns: Array<() => void> = [];

(async () => {
  unlistenFns.push(await listen('tray://toggle-always-on-top', async () => toggleTop()));

  unlistenFns.push(await listen('tray://show', async () => appWindow.show()));
  unlistenFns.push(await listen('tray://hide', async () => appWindow.hide()));

  // 4) autostart toggled from tray
  unlistenFns.push(await listen('tray://toggle-autostart', async () => toggleAutostart()));


})().catch((e) => { console.warn('注册事件失败：', e); layer.msg('注册事件失败：' + e); });

// 5) updater: check on startup; backend also exposes a menu item
export async function checkUpdate() {
  try {
    const res = await check();
    // v2 更稳妥的写法：根据 available 字段判断
    if (res?.available) {
      console.log('发现新版本:', res.version, '当前:', res.currentVersion);
      layer.confirm('发现新版本:' + res.version + '，是否现在更新？', {
        btn: ['确定', '关闭'] // 按钮
      }, async function () { // 添加 async 关键字
        try {
          await res.downloadAndInstall();
          await relaunch();
        } catch (error) {
          console.error('更新失败:', error);
          layer.msg('更新失败，请稍后再试');
        }
      }, function () {
        // 用户点击关闭的回调
        layer.msg('已取消更新');
      });


    } else {
      console.log('已是最新版本');
    }
  } catch (e) {
    console.warn('自动更新检查失败（可忽略开发环境）：', e);
    // layer.msg('自动更新检查失败（可忽略开发环境）：' + e);
  }
};

checkUpdate();


export async function clearInputContent() {
  const sourceText = $('#sourceText');
  if (sourceText) {
    sourceText.val('');
  }
  const jsonDisplay = $('#json-display');
  if (jsonDisplay) {
    jsonDisplay.html('');
  }
  const validResult = $('#valid-result');
  if (validResult) {
    validResult.html('');
    validResult.removeClass("es-fail").addClass("es-empty");
  }
}

export async function formatJson() {
  console.log('formatJson');
  if (jsonTool && typeof (jsonTool as any).jsonFormat === 'function') {
    (jsonTool as any).jsonFormat();
  }
}
export async function toggleExplain() {
  const explainBtn = $('#explainBtn');
  if (explainBtn.val() === 'false') {
    explainBtn.addClass('layui-btn-primary');
    explainBtn.html('<i class="layui-icon layui-icon-circle"></i>转义：关');
    explainBtn.val('true');

  } else {

    explainBtn.removeClass('layui-btn-primary');
    explainBtn.html('<i class="layui-icon layui-icon-radio"></i>转义：开');
    explainBtn.val('false');
  }
  formatJson();
}

// 6) optional: clipboard-triggered paste
export async function tryPasteFromClipboard() {
  try {
    const t = await readClipboardText();
    const ta = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    if (ta && t && ta.value !== t) {
      ta.value = t;
      // 调用你的格式化器
      // @ts-ignore legacy export
      console.log('tryPasteFromClipboard:', t);
      formatJson();
    }
  } catch {
    // ignore
    console.log("复制失败");
  }
}
/// <reference types="vite/client" />
// 7) Vite HMR 清理，避免开发时重复监听
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const u of unlistenFns) {
      try { u(); } catch { /* ignore */ }
    }
  });
}