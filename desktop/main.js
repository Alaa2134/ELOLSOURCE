// نسخة الديسكتوب لنظام كاشير السقا — بتفتح البرنامج في نافذة خاصة
// ومتوصلة بالطابعات: قائمة الطابعات الحقيقية + طباعة صامتة على الطابعة المختارة
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// مهم جداً: البرامج التلاتة (كاشير/محاسب/أدمن) بيشاركوا نفس مخزن البيانات
// على نفس الجهاز — عشان الأدمن يشوف فواتير الكاشير فوراً بدون سحابة
app.setPath('userData', path.join(app.getPath('appData'), 'SaqqaPOS-Shared'));

let win;

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function createWindow() {
  const cfg = getConfig();
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: cfg.title || 'Saqqa POS',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });
  Menu.setApplicationMenu(null);
  // تثبيت اسم البرنامج (كاشير/محاسب/أدمن) على النافذة
  win.webContents.on('page-title-updated', (e) => {
    if (cfg.title) {
      e.preventDefault();
      win.setTitle(cfg.title);
    }
  });
  win.webContents.on('did-finish-load', () => {
    if (cfg.title) win.setTitle(cfg.title);
  });
  win.loadURL(cfg.url || 'https://alsaka.vercel.app');
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

app.whenReady().then(() => {
  createWindow();
  // بوابة الواتساب المدمجة: بتشتغل تلقائياً — افتح صفحة واتساب في البرنامج وامسح الـ QR
  try {
    require('./gateway')(path.join(app.getPath('userData'), 'wa-auth'));
  } catch (e) {
    console.log('gateway not started:', e.message);
  }
});
app.on('window-all-closed', () => app.quit());
