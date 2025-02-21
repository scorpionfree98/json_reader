const { app, BrowserWindow, globalShortcut, clipboard } = require('electron')

function createWindow() {
  // 创建浏览器窗口
  const win = new BrowserWindow({
    width: 800,
    height: 800,

    frame: false, // 去除标题栏和边框
    alwaysOnTop: true, // 窗口总是置顶
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // 如果您需要在渲染进程中使用Node.js API，请设置为false

    }
  })

  // 加载您的HTML文件
  win.loadFile('a.html')

  // 打开开发者工具（可选）
  // win.webContents.openDevTools()
  return win
}

let lastClipboardContent = '';
let isInternalCopy = false;  // 标记是否为程序内复制
app.whenReady().then(() => {

  const win = createWindow();

  // 假设这是一个监听剪贴板变化的事件，在你的渲染进程中可以通过类似的方式发出这个事件
  win.webContents.on('copy-from-app', () => {
    isInternalCopy = true;  // 当从应用程序内部复制时，将此标志设为 true
  });

  globalShortcut.register('CommandOrControl+Space', () => {
    const currentClipboardContent = clipboard.readText();
    if (win.isMinimized()) {
      win.restore();  // 如果窗口不可见，显示窗口
      win.focus();
      isInternalCopy = false;
      // 发送消息到渲染进程，触发粘贴按钮的点击
      if (!isInternalCopy && currentClipboardContent !== lastClipboardContent) {
        lastClipboardContent = currentClipboardContent;
        win.webContents.send('trigger-paste');
      }
    } else {
      lastClipboardContent = currentClipboardContent;
      win.minimize();  // 如果窗口可见，隐藏窗口
    }

    // 聚焦窗口

  })
})



// 在所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在应用激活时重新创建窗口（针对macOS）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
// 在main.js中添加以下代码
const { ipcMain } = require('electron');

ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (action === 'minimize') {
    win.minimize();
  } else if (action === 'close') {
    win.close();
  }
});
