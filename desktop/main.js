// نسخة الديسكتوب لنظام كاشير السقا — بتفتح البرنامج في نافذة خاصة
// ومتوصلة بالطابعات: قائمة الطابعات الحقيقية + طباعة صامتة على الطابعة المختارة
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function getAppUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    return cfg.url || 'http://localhost:3000';
  } catch {
    return 'http://localhost:3000';
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });
  Menu.setApplicationMenu(null);
  win.loadURL(getAppUrl());
}

// قائمة الطابعات المتاحة على الجهاز
ipcMain.handle('printers', async () => {
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => p.name);
});

// طباعة الصفحة الحالية — لو فيه طابعة مختارة بتطبع صامت عليها مباشرة
ipcMain.handle('print', (event, deviceName) => {
  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: !!deviceName,
        deviceName: deviceName || undefined,
        printBackground: true,
      },
      (ok) => resolve(ok)
    );
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
