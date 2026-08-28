const { contextBridge, ipcRenderer } = require("electron");

// 웹 앱에서 Electron 안에서 도는지 알 수 있게 표시만 남긴다.
// 렌더러에 Node 권한은 주지 않는다.
contextBridge.exposeInMainWorld("desk", {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send("win:minimize"),
  hide: () => ipcRenderer.send("win:hide"),
  toggleTop: () => ipcRenderer.invoke("win:toggleTop"),
});
