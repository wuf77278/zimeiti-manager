const { app, BrowserWindow, ipcMain, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const DEV_APP_URL = "http://localhost:5174/app";
const DEFAULT_APP_PATH = process.env.ELECTRON_APP_PATH || "/app";
const BRIDGE_EXTENSION_DIR = path.join(__dirname, "extensions", "zimeiti-bridge");
const PLATFORM_ENTRY_URLS = {
  douyin: "https://creator.douyin.com/creator-micro/home",
  xiaohongshu: "https://creator.xiaohongshu.com/",
  wechat_channels: "https://channels.weixin.qq.com/platform",
};

const accountWindows = new Map();
const accountWindowIds = new Map();
const accountBridgeState = new Map();
const loadedExtensionPartitions = new Set();
let backendProcess = null;
let backendBaseUrl = "";

function projectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function getBackendPort() {
  const value = Number(process.env.ZIMEITI_BACKEND_PORT || 8001);
  return Number.isFinite(value) && value > 0 ? value : 8001;
}

function getBackendBaseUrl() {
  if (!backendBaseUrl) {
    backendBaseUrl = process.env.ZIMEITI_API_BASE || `http://127.0.0.1:${getBackendPort()}`;
  }
  return backendBaseUrl;
}

function getAppUrl() {
  if (process.env.ELECTRON_APP_URL) return process.env.ELECTRON_APP_URL;
  if (app.isPackaged || process.env.ZIMEITI_START_BACKEND === "1") {
    return `${getBackendBaseUrl()}${DEFAULT_APP_PATH}`;
  }
  return DEV_APP_URL;
}

function packagedBackendExecutable() {
  const name = process.platform === "win32" ? "zimeiti-backend.exe" : "zimeiti-backend";
  return path.join(process.resourcesPath, "backend", name);
}

function devPythonExecutable() {
  const root = projectRoot();
  const candidates = process.platform === "win32"
    ? [
        path.join(root, "backend", "venv", "Scripts", "python.exe"),
        "python",
        "py",
      ]
    : [
        path.join(root, "backend", "venv", "bin", "python"),
        "python3",
        "python",
      ];
  return candidates.find((candidate) => !candidate.includes(path.sep) || fs.existsSync(candidate)) || candidates[0];
}

function healthcheck(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/health`, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await healthcheck(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function backendEnv() {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "backend-data");
  return {
    ...process.env,
    ZIMEITI_BACKEND_HOST: "127.0.0.1",
    ZIMEITI_BACKEND_PORT: String(getBackendPort()),
    ZIMEITI_DATA_DIR: dataDir,
    OPS_DATA_PATH: path.join(dataDir, "ops_db.json"),
  };
}

async function ensureBackendStarted() {
  if (process.env.ELECTRON_APP_URL && process.env.ZIMEITI_START_BACKEND !== "1") {
    return { started: false, reason: "external_url" };
  }

  const url = getBackendBaseUrl();
  if (await healthcheck(url)) {
    return { started: false, reason: "already_running" };
  }

  const shouldStart = app.isPackaged || process.env.ZIMEITI_START_BACKEND === "1";
  if (!shouldStart) {
    return { started: false, reason: "dev_server_expected" };
  }

  const env = backendEnv();
  let command;
  let args;
  let cwd;

  if (app.isPackaged) {
    command = packagedBackendExecutable();
    args = [];
    cwd = path.dirname(command);
  } else {
    command = devPythonExecutable();
    args = [path.join(projectRoot(), "backend", "desktop_server.py")];
    cwd = path.join(projectRoot(), "backend");
    env.ZIMEITI_RESOURCE_ROOT = projectRoot();
  }

  if (app.isPackaged && !fs.existsSync(command)) {
    throw new Error(`backend_executable_not_found:${command}`);
  }

  backendProcess = spawn(command, args, {
    cwd,
    env,
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });

  backendProcess.on("exit", () => {
    backendProcess = null;
  });

  const ready = await waitForBackend(url);
  if (!ready) {
    throw new Error("backend_start_timeout");
  }
  return { started: true, reason: "spawned" };
}

function safePart(value) {
  return String(value || "account")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "account";
}

function normalizeProxyServer(value) {
  const proxy = String(value || "").trim();
  if (!proxy) return "";
  if (/\s/.test(proxy)) throw new Error("proxy_server_must_not_contain_spaces");
  const normalized = proxy.includes("://") ? proxy : `http://${proxy}`;
  const scheme = normalized.split("://", 1)[0].toLowerCase();
  if (!["http", "https", "socks4", "socks5"].includes(scheme)) {
    throw new Error("unsupported_proxy_scheme");
  }
  return normalized;
}

function normalizeProxyBypass(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100)
    .join(",");
}

async function applyAccountProxy(accountSession, payload) {
  const proxyServer = payload.browserProxyEnabled ? normalizeProxyServer(payload.browserProxyServer) : "";
  const proxyBypass = normalizeProxyBypass(payload.browserProxyBypassList);

  if (proxyServer) {
    await accountSession.setProxy({
      proxyRules: proxyServer,
      proxyBypassRules: proxyBypass || "localhost,127.0.0.1,::1",
    });
  } else {
    await accountSession.setProxy({ mode: "system" });
  }

  if (typeof accountSession.closeAllConnections === "function") {
    await accountSession.closeAllConnections();
  }
}

async function loadBridgeExtension(accountSession, partition) {
  if (loadedExtensionPartitions.has(partition)) {
    return { loaded: true, reason: "already_loaded" };
  }

  try {
    await accountSession.loadExtension(BRIDGE_EXTENSION_DIR, { allowFileAccess: true });
    loadedExtensionPartitions.add(partition);
    return { loaded: true, reason: "loaded" };
  } catch (error) {
    return {
      loaded: false,
      reason: error instanceof Error ? error.message : "extension_load_failed",
    };
  }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: "自媒体管家",
    backgroundColor: "#F8FAFC",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.loadURL(getAppUrl());
  return mainWindow;
}

function accountBridgeUrl(url, accountId) {
  const parsed = new URL(url);
  parsed.hash = new URLSearchParams({
    zmt_account_id: accountId,
    zmt_api_base: `${getBackendBaseUrl()}/api`,
  }).toString();
  return parsed.toString();
}

function createAccountWindow(payload, partition) {
  const title = `账号浏览器 - ${payload.displayName || payload.id}`;
  return new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    title,
    backgroundColor: "#FFFFFF",
    webPreferences: {
      partition,
      preload: path.join(__dirname, "account-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
}

ipcMain.handle("desktop:open-account-browser", async (_event, payload) => {
  try {
    if (!payload || !payload.id) {
      throw new Error("account_id_required");
    }

    const accountId = String(payload.id);
    const partition = `persist:zimeiti-account-${safePart(accountId)}`;
    const accountSession = session.fromPartition(partition);
    await applyAccountProxy(accountSession, payload);
    const bridgeExtension = await loadBridgeExtension(accountSession, partition);

    let accountWindow = accountWindows.get(accountId);
    if (!accountWindow || accountWindow.isDestroyed()) {
      accountWindow = createAccountWindow(payload, partition);
      accountWindows.set(accountId, accountWindow);
      accountWindowIds.set(accountWindow.id, accountId);
      accountWindow.on("closed", () => {
        accountWindows.delete(accountId);
        accountWindowIds.delete(accountWindow.id);
      });
    }

    const url = payload.workspaceUrl || PLATFORM_ENTRY_URLS[payload.platform] || PLATFORM_ENTRY_URLS.douyin;
    await accountWindow.loadURL(url);
    accountWindow.show();
    accountWindow.focus();

    return {
      ok: true,
      mode: "desktop",
      accountId,
      windowId: accountWindow.id,
      partition,
      bridgeExtension,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "desktop",
      error: error instanceof Error ? error.message : "内置浏览器启动失败",
    };
  }
});

ipcMain.handle("desktop:prepare-account-webview", async (_event, payload) => {
  try {
    if (!payload || !payload.id) {
      throw new Error("account_id_required");
    }

    const accountId = String(payload.id);
    const partition = `persist:zimeiti-account-${safePart(accountId)}`;
    const accountSession = session.fromPartition(partition);
    await applyAccountProxy(accountSession, payload);
    const bridgeExtension = await loadBridgeExtension(accountSession, partition);
    const baseUrl = payload.workspaceUrl || PLATFORM_ENTRY_URLS[payload.platform] || PLATFORM_ENTRY_URLS.douyin;

    return {
      ok: true,
      mode: "desktop",
      accountId,
      partition,
      workspaceUrl: accountBridgeUrl(baseUrl, accountId),
      bridgeExtension,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "desktop",
      error: error instanceof Error ? error.message : "内置浏览器准备失败",
    };
  }
});

ipcMain.handle("account-bridge:ping", (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const accountId = senderWindow ? accountWindowIds.get(senderWindow.id) : undefined;
  return { ok: true, accountId: accountId || null };
});

ipcMain.on("account-bridge:message", (event, message) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const accountId = senderWindow ? accountWindowIds.get(senderWindow.id) : undefined;
  if (!accountId) return;

  const nextState = {
    accountId,
    windowId: senderWindow.id,
    message,
    updatedAt: new Date().toISOString(),
  };
  accountBridgeState.set(accountId, nextState);
});

ipcMain.handle("desktop:get-account-bridge-state", () => {
  return Array.from(accountBridgeState.values());
});

ipcMain.handle("desktop:send-account-command", (_event, payload) => {
  const accountId = String(payload?.accountId || "");
  const accountWindow = accountWindows.get(accountId);
  if (!accountId || !accountWindow || accountWindow.isDestroyed()) {
    return { ok: false, error: "account_window_not_open" };
  }

  accountWindow.webContents.send("account-bridge:command", {
    id: payload.commandId || `${Date.now()}`,
    kind: payload.kind || "ping",
    data: payload.data || {},
  });
  return { ok: true, accountId };
});

app.setPath(
  "userData",
  process.env.ZIMEITI_ELECTRON_USER_DATA_DIR ||
    path.join(os.homedir(), ".zimeiti-manager", "desktop-browser"),
);

app.whenReady().then(async () => {
  try {
    await ensureBackendStarted();
  } catch (error) {
    console.error("Failed to start backend", error);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
