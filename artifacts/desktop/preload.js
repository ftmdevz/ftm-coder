const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  onMenuAction: (callback) => ipcRenderer.on("menu-action", (_e, action) => callback(action)),
});
