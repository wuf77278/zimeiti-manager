import type { OpsPlatform } from "../utils/opsApi";

export interface DesktopAccountBrowserPayload {
  id: string;
  displayName: string;
  platform: OpsPlatform;
  workspaceUrl?: string | null;
  browserProfileDir?: string | null;
  browserProxyEnabled: boolean;
  browserProxyServer: string;
  browserProxyBypassList: string;
}

export interface DesktopAccountBrowserResult {
  ok: boolean;
  mode: "desktop";
  accountId?: string;
  windowId?: number;
  partition?: string;
  workspaceUrl?: string;
  bridgeExtension?: {
    loaded: boolean;
    reason: string;
  };
  error?: string;
}

export interface DesktopAccountWebviewResult extends DesktopAccountBrowserResult {
  workspaceUrl?: string;
}

export interface DesktopAccountBridgeState {
  accountId: string;
  windowId: number;
  updatedAt: string;
  message: Record<string, unknown>;
}

export interface DesktopAccountCommandPayload {
  accountId: string;
  commandId?: string;
  kind?: "ping" | string;
  data?: Record<string, unknown>;
}

export interface DesktopAccountCommandResult {
  ok: boolean;
  accountId?: string;
  error?: string;
}

declare global {
  interface Window {
    zimeitiDesktop?: {
      isDesktop: true;
      openAccountBrowser(payload: DesktopAccountBrowserPayload): Promise<DesktopAccountBrowserResult>;
      prepareAccountWebview(payload: DesktopAccountBrowserPayload): Promise<DesktopAccountWebviewResult>;
      getAccountBridgeState(): Promise<DesktopAccountBridgeState[]>;
      sendAccountCommand(payload: DesktopAccountCommandPayload): Promise<DesktopAccountCommandResult>;
    };
  }
}

export {};
