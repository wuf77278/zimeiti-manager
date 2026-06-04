import { prepareOpsWorkspace, type OpsAccount, type WorkspaceOpenResponse } from "./opsApi";
import type { DesktopAccountWebviewResult } from "../types/desktop";

export function hasDesktopBrowser() {
  return typeof window !== "undefined" && Boolean(window.zimeitiDesktop?.openAccountBrowser);
}

export async function openDesktopAccountBrowser(accountId: string): Promise<WorkspaceOpenResponse> {
  if (!window.zimeitiDesktop?.openAccountBrowser) {
    throw new Error("当前运行环境不是桌面版，无法打开内置浏览器");
  }

  const prepared = await prepareOpsWorkspace(accountId);
  const account: OpsAccount = prepared.account;
  const result = await window.zimeitiDesktop.openAccountBrowser({
    id: account.id,
    displayName: account.displayName,
    platform: account.platform,
    workspaceUrl: prepared.workspaceUrl,
    browserProfileDir: prepared.browserProfileDir,
    browserProxyEnabled: account.browserProxyEnabled,
    browserProxyServer: account.browserProxyServer,
    browserProxyBypassList: account.browserProxyBypassList,
  });

  if (!result.ok) {
    throw new Error(result.error || "内置浏览器启动失败");
  }

  return prepared;
}

export async function prepareDesktopAccountWebview(accountId: string): Promise<DesktopAccountWebviewResult> {
  if (!window.zimeitiDesktop?.prepareAccountWebview) {
    throw new Error("当前运行环境不是桌面版，无法嵌入账号浏览器");
  }

  const prepared = await prepareOpsWorkspace(accountId);
  const account: OpsAccount = prepared.account;
  const result = await window.zimeitiDesktop.prepareAccountWebview({
    id: account.id,
    displayName: account.displayName,
    platform: account.platform,
    workspaceUrl: prepared.workspaceUrl,
    browserProfileDir: prepared.browserProfileDir,
    browserProxyEnabled: account.browserProxyEnabled,
    browserProxyServer: account.browserProxyServer,
    browserProxyBypassList: account.browserProxyBypassList,
  });

  if (!result.ok) {
    throw new Error(result.error || "内置账号浏览器准备失败");
  }

  return result;
}
