const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zimeitiDesktop", {
  isDesktop: true,
  openAccountBrowser(payload) {
    return ipcRenderer.invoke("desktop:open-account-browser", payload);
  },
  prepareAccountWebview(payload) {
    return ipcRenderer.invoke("desktop:prepare-account-webview", payload);
  },
  getAccountBridgeState() {
    return ipcRenderer.invoke("desktop:get-account-bridge-state");
  },
  sendAccountCommand(payload) {
    return ipcRenderer.invoke("desktop:send-account-command", payload);
  },
});
