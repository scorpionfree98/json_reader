import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import $ from 'jquery';

type ShowMessage = (message: string) => void;

export const createWindowController = (showMessage: ShowMessage) => {
  const isTauri = '__TAURI_INTERNALS__' in window;
  const appWindow = isTauri ? getCurrentWebviewWindow() : null;

  const updateMaximizeButton = (isMaximized: boolean, buttonSelector?: string, isFullscreen = false) => {
    const selectors = buttonSelector ? [buttonSelector] : ['#maximizeBtn', '#splitMaximize'];
    const icon = isMaximized ? 'layui-icon-screen-restore' : 'layui-icon-screen-full';
    const text = isMaximized ? '还原' : isFullscreen ? '全屏' : '最大化';

    selectors.forEach(selector => {
      const $button = $(selector);
      if (!$button.length) return;
      if (selector === '#maximizeBtn') {
        $button.html(`<i class="layui-icon ${icon}"></i> ${text}`);
      } else {
        $button.html(`<i class="layui-icon ${icon}"></i>`).attr('title', text);
      }
    });
  };

  const toggleMaximize = async (buttonSelector?: string): Promise<void> => {
    if (!appWindow) {
      showMessage('窗口控制仅在应用模式中可用');
      return;
    }

    try {
      const isMac = await invoke<string>('get_platform') === 'macos';
      const isExpanded = isMac ? await appWindow.isFullscreen() : await appWindow.isMaximized();
      if (isMac) {
        await appWindow.setFullscreen(!isExpanded);
      } else if (isExpanded) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      updateMaximizeButton(!isExpanded, buttonSelector, isMac);
    } catch (error) {
      console.error('最大化/还原失败:', error);
      showMessage('操作失败');
    }
  };

  const minimize = async (): Promise<void> => {
    if (!appWindow) {
      showMessage('窗口控制仅在应用模式中可用');
      return;
    }
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('窗口最小化失败:', error);
      showMessage('最小化窗口失败');
    }
  };

  const close = async (): Promise<void> => {
    if (!appWindow) {
      showMessage('窗口控制仅在应用模式中可用');
      return;
    }
    await appWindow.close();
  };

  return {
    appWindow,
    isTauri,
    close,
    minimize,
    toggleMaximize
  };
};
