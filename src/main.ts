/// <reference types="vite/client" />
// Entry for Tauri v2 frontend
// 关键修复：从 @tauri-apps/api/core 导入 invoke（Tauri v2 最新路径）
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

// 工具函数
const byId = (id: string) => $(`#${id}`);
const byClass = (cls: string) => $(`.${cls}`);

// 补全 layui 类型定义
declare const layui: {
  use: (modules: string[], callback: () => void) => void;
  form: {
    on: (event: string, handler: (data: any) => void) => void;
    render: () => void;
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

  // 显示版本号
  displayVersion();
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
  byId('checkUpdate')?.on('click', () => checkUpdate(true));

  // 拖拽区域
  byClass('drag-region').on('mousedown', () => {
    appWindow.startDragging();
  });
}

// 绑定复选框事件
function bindCheckboxEvents() {
  const tryInitLayuiForm = () => {
    if (typeof layui !== 'undefined') {
      initLayuiForm();
    } else {
      setTimeout(initLayuiForm, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInitLayuiForm);
  } else {
    tryInitLayuiForm();
  }
}

// 初始化Layui表单
function initLayuiForm() {
  layui.use(['form'], function () {
    const form = layui.form;
    const layer = layui.layer;
    
    // 渲染表单元素，生成Layui动态元素
    form.render();
    
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
    
    // 复制格式选择事件
    form.on('select(copyFormat)', function (data) {
      const customContainer = $('#customFormatContainer');
      if (data.value === 'custom') {
        customContainer.show();
      } else {
        customContainer.hide();
      }
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
    showLayuiMsg(`窗口${finalStatus ? '已' : '未'}置顶`);
    byId('topCheck')?.prop('checked', finalStatus);
  } catch (error) {
    console.error('获取置顶状态失败:', error);
    showLayuiMsg('获取状态失败');
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
    showLayuiMsg('操作失败，请检查控制台');
  }
}

// 验证并更新自启动状态显示
export async function toggleAutostartInfo() {
  try {
    const finalStatus = await isAutostartEnabled();
    console.log('最终自启动状态:', finalStatus);

    // 更新UI并显示结果
    byId('autoStart')?.prop('checked', finalStatus);
    showLayuiMsg(`开机自启已${finalStatus ? '启用' : '禁用'}`);
  } catch (error) {
    console.error('获取自启动状态失败:', error);
    showLayuiMsg('获取状态失败');
  }
}

// 切换自启动状态并通知后端同步
export async function toggleAutostart() {
  try {
    // 获取当前状态
    const enabled = await isAutostartEnabled();
    console.log('当前自启动状态:', enabled);
    const newStatus = !enabled;

    // 执行状态修改（修复逻辑错误）
    if (newStatus) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }

    const actualStatus = await isAutostartEnabled();
    console.log('当前自启动状态:', actualStatus);

    // 通知后端更新状态（关键修改）
    await invoke('set_autostart');
    
    // 验证并刷新状态显示
    toggleAutostartInfo();
  } catch (error) {
    console.error('切换自启动失败:', error);
    showLayuiMsg('操作失败，请检查控制台');
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
    
    // 监听托盘检查更新事件（托盘菜单触发，视为手动检查）
    unlistenFns.push(await listen('tray://check-updates', () => checkUpdate(true)));
  } catch (e) {
    console.warn('注册事件失败：', e);
    showLayuiMsg('注册事件失败：' + (e instanceof Error ? e.message : String(e)));
  }
})();

// 检查更新
// isManual: 是否为手动检查（true=手动点击检查，false=自动检查）
export async function checkUpdate(isManual = false) {
  console.log(`=== 开始检查更新 (${isManual ? '手动' : '自动'}) ===`);
  try {
    console.log('调用 check() 函数...');
    const res = await check();
    console.log('check() 函数返回结果：', res);

    if (res) {
      console.log('发现新版本:', res.version, '当前:', res.currentVersion);
      console.log('准备显示更新确认对话框...');

      layer.confirm(`当前版本: ${res.currentVersion}，发现新版本: ${res.version}，是否现在更新？`, {
        btn: ['确定', '关闭']
      }, async function () {
        console.log('用户点击了确定，开始下载更新...');
        try {
          await res.downloadAndInstall(
            (event) => {
              // 下载进度回调
              switch (event.event) {
                case 'Started':
                  console.log('下载开始，总大小:', event.data.contentLength || '未知');
                  break;
                case 'Progress':
                  console.log('下载进度:', event.data.chunkLength, '字节');
                  break;
                case 'Finished':
                  console.log('下载完成');
                  break;
              }
            },
            { timeout: 300000 } // 5分钟超时（对于较大的安装包如 WebView2 版本约 753MB）
          );
          console.log('更新下载安装完成，准备重启应用...');
          await relaunch();
        } catch (error) {
          console.error('更新失败:', error);
          showLayuiMsg('更新失败，请稍后再试');
        }
      }, function () {
        console.log('用户点击了关闭，取消更新');
        showLayuiMsg('已取消更新');
      });
    } else {
      console.log('已是最新版本，准备显示提示...');
      // 只有手动检查时才显示"已是最新版本"提示
      if (isManual) {
        showLayuiMsg('已是最新版本');
      }
    }
  } catch (e) {
    console.error('更新检查失败：', e);
    // 只有手动检查时才显示错误弹窗
    if (isManual) {
      showLayuiMsg('检查更新失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }
  console.log('=== 检查更新结束 ===');
}

// 初始检查更新（添加延迟，避免应用启动时过于频繁的网络请求）
(async () => {
  try {
    // 延迟 3 秒后检查更新，给应用一些启动时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    await checkUpdate();
  } catch (error) {
    console.error('初始检查更新失败:', error);
  }
})();

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
    if (!text) {
      showLayuiMsg('剪贴板为空');
      return;
    }
    const textarea = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    if (textarea && text && textarea.value !== text) {
      textarea.value = text;
      formatJson();
    }
  } catch (error) {
    console.error('从剪贴板读取失败:', error);
    showLayuiMsg('读取剪贴板失败');
  }
}

// 显示Layui消息（安全封装）
function showLayuiMsg(text: string) {
  if (typeof layui !== 'undefined' && layui.layer) {
    layui.layer.msg(text);
  } else {
    console.log('[Layui未加载]', text);
  }
}

// 显示版本号
async function displayVersion() {
  console.log('=== 开始获取版本号 ===');
  try {
    // 从后端获取应用版本号
    const version = await getVersion();
    console.log('获取到版本号:', version);
    const versionEl = byId('version-display');
    console.log('版本号元素:', versionEl);
    if (versionEl) {
      versionEl.text(`v${version}`);
      console.log('版本号已显示:', `v${version}`);
    }
  } catch (e) {
    console.log('获取版本号失败:', e);
  }
}

// Vite HMR 清理
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const unlisten of unlistenFns) {
      try { unlisten(); } catch (error) { console.warn('清理事件监听器失败:', error); }
    }
  });
}

/// <reference types="vite/client" />
