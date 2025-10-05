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

declare global {
  interface Window { myJsonTool?: { copyToClipboard: (v: unknown) => Promise<void> }; }
}

const appWindow = getCurrentWebviewWindow();

// 0) expose copy util used by the page (keeps a-tauri.html compatibility)
window.myJsonTool = {
  copyToClipboard: async (value: unknown) => {
    const valueText = String(value ?? '');
    try {
      await writeClipboardText(valueText);
      console.log('已复制:', valueText);
    } catch (e) {
      console.error('复制失败:', e);
    }
  }
};

// 1) restore window state ASAP to avoid flash
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await restoreStateCurrent(StateFlags.ALL);
  } catch (e) {
    console.warn('restore window state failed:', e);
  }

  // 2) wire close/minimize buttons if present (放到 DOMContentLoaded 保证元素已渲染)
  const byId = (id: string) => $(`#${id}`);
  byId('minimize')?.on('click', () => appWindow.minimize());
  byId('close')?.on('click', () => appWindow.close());
  byId('pasteBtn')?.on('click', () => tryPasteFromClipboard());
  byId('clearBtn')?.on('click', () => clearInputContent());
  byId('formatBtn')?.on('click', () => formatJson());
  // 你也可以在这里绑定 paste/format/clear 等按钮
});

// persist on exit
window.addEventListener('beforeunload', () => {
  try {
    saveWindowState(StateFlags.ALL);
  } catch { /* ignore */ }
});

// 3) listen to tray actions from backend
const unlistenFns: Array<() => void> = [];

(async () => {
  unlistenFns.push(await listen('tray://toggle-always-on-top', async () => {
    const current = await appWindow.isAlwaysOnTop();
    await appWindow.setAlwaysOnTop(!current);
  }));

  unlistenFns.push(await listen('tray://show', async () => appWindow.show()));
  unlistenFns.push(await listen('tray://hide', async () => appWindow.hide()));

  // 4) autostart toggled from tray
  unlistenFns.push(await listen('tray://toggle-autostart', async () => {
    const enabled = await isAutostartEnabled();
    if (enabled) await disableAutostart(); else await enableAutostart();
  }));
})().catch((e) => console.warn('注册事件失败：', e));

// 5) updater: check on startup; backend also exposes a menu item
(async () => {
  try {
    const res = await check();
    // v2 更稳妥的写法：根据 available 字段判断
    if (res?.available) {
      console.log('发现新版本:', res.version, '当前:', res.currentVersion);
      await res.downloadAndInstall();
      await relaunch();
    } else {
      console.log('已是最新版本');
    }
  } catch (e) {
    console.warn('自动更新检查失败（可忽略开发环境）：', e);
  }
})();


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
    validResult.hide();
  }
}

export async function formatJson() {
  console.log('formatJson');
  if (jsonTool && typeof (jsonTool as any).jsonFormat === 'function') {
    (jsonTool as any).jsonFormat();
  }
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