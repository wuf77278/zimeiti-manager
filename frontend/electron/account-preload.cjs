const { contextBridge, ipcRenderer } = require("electron");

function isBridgeMessage(value) {
  return Boolean(value && typeof value === "object" && typeof value.type === "string" && value.type.startsWith("ZMT_"));
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !isBridgeMessage(event.data)) return;
  ipcRenderer.send("account-bridge:message", event.data);
});

ipcRenderer.on("account-bridge:command", (_event, command) => {
  window.postMessage({ type: "ZMT_ACCOUNT_COMMAND", command }, "*");
});

contextBridge.exposeInMainWorld("zimeitiAccountBridge", {
  ping() {
    return ipcRenderer.invoke("account-bridge:ping");
  },
  reportStatus(status) {
    ipcRenderer.send("account-bridge:message", { type: "ZMT_EXTENSION_STATUS", status });
  },
});
