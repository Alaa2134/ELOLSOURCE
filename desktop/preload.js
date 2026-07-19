// كوبري آمن بين البرنامج ونظام التشغيل (الطابعات)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('printers'),
  print: (deviceName) => ipcRenderer.invoke('print', deviceName),
});
