import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Checkbox,
  Collapse,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TroubleshootIcon from "@mui/icons-material/Troubleshoot";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import type { PlatformKey } from "../config/platforms";
import {
  acknowledgeDirectMessageAlert,
  applyCreatorCommentReplyAction,
  applyDiagnosisAction,
  approveOpsTask,
  checkDirectMessages,
  checkOpsSession,
  collectAccountMetrics,
  convertViralContentToAsset,
  createOpsAgentClient,
  createOpsAccount,
  createOpsAgentPlan,
  createOpsAsset,
  createOpsTask,
  createPublishPackageFromFolder,
  createViralContent,
  diagnoseOpsAccount,
  executeOpsTask,
  generateOpsDrafts,
  generateCreatorCoach,
  getContentPatterns,
  getOpsRuntime,
  getOpsState,
  getOpsAgentTools,
  getOpsSystemProxy,
  isOpsFrontendEnabled,
  recordAccountMetricSnapshot,
  recordDirectMessageEvent,
  rememberOpsSession,
  runOpsPublishingAgent,
  seedViralContent,
  syncOpsAccountProfile,
  updateAccountMemory,
  updateDirectMessageMonitor,
  updateOpsBrowserSettings,
  uploadOpsAssetFile,
  type AccountMemoryInput,
  type AccountDiagnosisAction,
  type AccountMetricSnapshotInput,
  type AssetFileUploadResponse,
  type AgentToolDefinition,
  type AgentClient,
  type AccountDiagnosisReport,
  type AuthType,
  type ContentPattern,
  type DirectMessageAlert,
  type DirectMessageMonitor,
  type DirectMessageSource,
  type DispatchContentType,
  type CreatorCommentReplyAction,
  type OpsAccount,
  type OpsPlatform,
  type OpsRuntime,
  type OpsState,
  type MetricSnapshot,
  type MetricCollectionJob,
  type MetricCollectorSource,
  type PlatformDraft,
  type PublishingAgentMode,
  type PublishTask,
  type ViralContentItem,
  type ViralContentSource,
} from "../utils/opsApi";
import { hasDesktopBrowser, prepareDesktopAccountWebview } from "../utils/desktopBrowser";
import type { DesktopAccountBridgeState } from "../types/desktop";
import { showToast } from "../components/toastStore";

const pageBg = "#F8FAFC";
const textPrimary = "#0F172A";
const textSecondary = "#475569";
const textMuted = "#64748B";
const cardSx = {
  bgcolor: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
};
const itemCardSx = {
  bgcolor: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(15,23,42,0.035)",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
  "&:hover": {
    borderColor: "#93C5FD",
    boxShadow: "0 8px 18px rgba(30,64,175,0.08)",
  },
};
const softButtonSx = {
  color: "#1E3A8A",
  fontSize: 12,
  fontWeight: 800,
  borderRadius: "8px",
  bgcolor: "#EFF6FF",
  border: "1px solid #BFDBFE",
  cursor: "pointer",
  "&:hover": { bgcolor: "#DBEAFE", borderColor: "#93C5FD" },
};
const primaryDarkButtonSx = {
  bgcolor: "#1E40AF",
  color: "#fff",
  border: "1px solid #1E40AF",
  borderRadius: "8px",
  fontWeight: 900,
  boxShadow: "0 8px 18px rgba(30,64,175,0.18)",
  cursor: "pointer",
  "&:hover": { bgcolor: "#1E3A8A", color: "#fff", borderColor: "#1E3A8A", boxShadow: "0 10px 22px rgba(30,64,175,0.24)" },
  "&.Mui-disabled": { bgcolor: "#CBD5E1", color: "#F8FAFC", borderColor: "#CBD5E1", boxShadow: "none" },
};

const metricAccents = ["#1E40AF", "#F59E0B", "#059669", "#DC2626", "#7C3AED", "#0891B2"];

const platformLabels: Record<OpsPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechat_channels: "视频号",
};

const platformColors: Record<OpsPlatform, { bg: string; color: string }> = {
  douyin: { bg: "#eef2ff", color: "#3730a3" },
  xiaohongshu: { bg: "#fff1f2", color: "#be123c" },
  wechat_channels: { bg: "#ecfdf5", color: "#047857" },
};

const socialAutoUploadSource = {
  name: "dreammis/social-auto-upload",
  url: "https://github.com/dreammis/social-auto-upload",
  summary: "开源多平台视频上传和定时发布引擎，当前主线推荐通过 sau CLI 调用。",
  upstreamPlatforms: ["抖音", "小红书", "快手", "Bilibili", "视频号", "百家号", "TikTok", "YouTube"],
  integratedScope: "自媒体管家默认接入抖音/小红书视频上传；视频号需实验开关和 tencent CLI 同时可用，默认保存草稿并保留人工接管入口。",
};

const statusMeta: Record<string, { label: string; bg: string; color: string }> = {
  connected: { label: "已连接", bg: "#ecfdf5", color: "#047857" },
  needs_login: { label: "需登录", bg: "#fff7ed", color: "#c2410c" },
  disabled: { label: "已停用", bg: "#f1f5f9", color: textMuted },
  healthy: { label: "正常", bg: "#ecfdf5", color: "#047857" },
  expired: { label: "失效", bg: "#fef2f2", color: "#dc2626" },
  unknown: { label: "未知", bg: "#f8fafc", color: textMuted },
  scheduled: { label: "已排期", bg: "#eef2ff", color: "#4338ca" },
  draft: { label: "草稿", bg: "#f8fafc", color: textMuted },
  pending_review: { label: "待审核", bg: "#fff7ed", color: "#c2410c" },
  publishing: { label: "执行中", bg: "#eff6ff", color: "#2563eb" },
  published: { label: "已提交", bg: "#ecfdf5", color: "#047857" },
  manual_takeover: { label: "人工接管", bg: "#fef3c7", color: "#92400e" },
  failed: { label: "失败", bg: "#fef2f2", color: "#dc2626" },
  retrying: { label: "重试中", bg: "#f5f3ff", color: "#6d28d9" },
  cancelled: { label: "已取消", bg: "#f1f5f9", color: textMuted },
  active: { label: "监控中", bg: "#ecfdf5", color: "#047857" },
  paused: { label: "已暂停", bg: "#f8fafc", color: textMuted },
  unsupported: { label: "不支持", bg: "#f1f5f9", color: textMuted },
  unread: { label: "未处理", bg: "#fef2f2", color: "#dc2626" },
  acknowledged: { label: "已处理", bg: "#ecfdf5", color: "#047857" },
  ready: { label: "可排期", bg: "#ecfdf5", color: "#047857" },
  needs_review: { label: "需审核", bg: "#fff7ed", color: "#c2410c" },
  blocked: { label: "阻塞", bg: "#fef2f2", color: "#dc2626" },
  browser_session: { label: "独立浏览器", bg: "#f0f9ff", color: "#0369a1" },
  oauth: { label: "OAuth/API", bg: "#eef2ff", color: "#4338ca" },
  manual: { label: "人工记录", bg: "#f8fafc", color: textMuted },
  official_api: { label: "官方接口", bg: "#eef2ff", color: "#4338ca" },
  webhook: { label: "Webhook", bg: "#f5f3ff", color: "#6d28d9" },
  local_snapshot: { label: "本地快照", bg: "#f8fafc", color: textMuted },
  simulated: { label: "模拟采集", bg: "#f8fafc", color: textMuted },
  queued: { label: "排队中", bg: "#f8fafc", color: textMuted },
  running: { label: "采集中", bg: "#eff6ff", color: "#2563eb" },
  succeeded: { label: "成功", bg: "#ecfdf5", color: "#047857" },
  external: { label: "外部 Agent", bg: "#f0f9ff", color: "#0369a1" },
  internal: { label: "内置 Agent", bg: "#eef2ff", color: "#4338ca" },
  completed: { label: "已完成", bg: "#ecfdf5", color: "#047857" },
};

function runtimeModeLabel(mode: OpsRuntime["publisherRunMode"]) {
  if (mode === "social_auto_upload") return "Social Auto Upload";
  if (mode === "upload_prepare") return "Upload Prepare";
  if (mode === "browser_prepare") return "Browser Prepare";
  return "Dry Run";
}

function runtimeModeSx(mode: OpsRuntime["publisherRunMode"]) {
  if (mode === "social_auto_upload") return { bgcolor: "#ECFDF5", color: "#047857" };
  if (mode === "upload_prepare") return { bgcolor: "#ECFDF5", color: "#047857" };
  if (mode === "browser_prepare") return { bgcolor: "#FEF3C7", color: "#92400E" };
  return { bgcolor: "#DBEAFE", color: "#1E40AF" };
}

function runtimeSafetyCopy(runtime?: OpsRuntime | null) {
  if (!runtime) return "发布执行仍遵守安全模式，真实平台最终提交需要人工接管。";
  if (runtime.publisherModeBlockedReason) {
    return runtime.publisherModeBlockedReason;
  }
  if (!runtime.publisherExecutionEnabled && runtime.requestedPublisherRunMode !== "dry_run") {
    return "发布执行开关未启用，当前已回退为 Dry Run。";
  }
  if (runtime.publisherRunMode === "social_auto_upload") {
    if (!runtime.socialAutoUpload.executionReady) {
      return runtime.socialAutoUpload.missingReason || "SAU 模式未完成本地安装。";
    }
    const supported = runtime.socialAutoUpload.supportedPlatforms.map((platform) => platformLabels[platform]).join("、") || "暂无平台";
    const prefix = runtime.socialAutoUpload.accountPrefix ? `；账号名前缀 ${runtime.socialAutoUpload.accountPrefix}` : "";
    return `SAU 模式会调用本地 sau 执行上传，当前自动上传：${supported}；未启用的平台回退人工接管${prefix}。`;
  }
  return "发布执行仍遵守安全模式，真实平台最终提交需要人工接管。";
}

const platformAlgorithmSignals: Record<OpsPlatform, string[]> = {
  douyin: ["前 3 秒钩子", "完播率/复看率", "垂直标签", "首小时互动密度", "搜索/推荐需求扩散"],
  xiaohongshu: ["封面点击率", "收藏/评论意图", "真实案例密度", "内容关键词", "目标用户标签一致性"],
  wechat_channels: ["决策关系扩散", "好友点赞触发", "评论互动深度", "公众号案例/初诊联动", "咨询预约转化"],
};

const contentTypeMeta: Record<DispatchContentType, { label: string; helper: string; bg: string; color: string }> = {
  video: { label: "视频", helper: "短视频/长视频自动上传", bg: "#ECFDF5", color: "#047857" },
  article: { label: "文章", helper: "富文本草稿和图文分发", bg: "#EFF6FF", color: "#1D4ED8" },
  dynamic: { label: "动态", helper: "轻量更新和短正文", bg: "#FFF7ED", color: "#C2410C" },
  story: { label: "故事", helper: "案例故事和图文叙事", bg: "#F5F3FF", color: "#6D28D9" },
};

const externalDiagnosisSkills = [
  {
    name: "LangChain Social Media Agent",
    source: "github.com/langchain-ai/social-media-agent",
    focus: "内容报告 / 选题复盘",
    use: "把账号数据和内容结果整理成运营报告，辅助账号诊断。",
  },
  {
    name: "pysentimiento",
    source: "github.com/pysentimiento/pysentimiento",
    focus: "评论情绪 / 文本信号",
    use: "用于评论、私信摘要和内容反馈的情绪倾向判断。",
  },
  {
    name: "SocialPulse",
    source: "github.com/birkelbachs/SocialPulse",
    focus: "话题趋势 / 社区洞察",
    use: "用于发现高频话题、内容聚类和运营复盘视角。",
  },
  {
    name: "Postiz",
    source: "github.com/gitroomhq/postiz-app",
    focus: "开源发布系统参考",
    use: "只借鉴账号运营和数据看板思路，不进入一键发布流程。",
  },
];

type OpsTab = "overview" | "accounts" | "quick_publish" | "automation" | "diagnosis" | "assets" | "viral" | "coach" | "collectors" | "agent" | "tasks" | "messages";

const opsNavigation: { value: OpsTab; label: string; helper: string; icon: ReactNode }[] = [
  { value: "overview", label: "总览", helper: "账号数据和私信概览", icon: <AutoAwesomeOutlinedIcon /> },
  { value: "accounts", label: "账号中心", helper: "平台分类和创作者主页", icon: <AccountCircleOutlinedIcon /> },
  { value: "quick_publish", label: "一键发布", helper: "手动选择账号即时发布", icon: <PlayArrowIcon /> },
  { value: "automation", label: "自动化发布", helper: "自动任务和执行队列", icon: <TaskAltIcon /> },
  { value: "diagnosis", label: "诊断窗口", helper: "账号和内容诊断", icon: <TroubleshootIcon /> },
];

function StatusChip({ value }: { value: string }) {
  const meta = statusMeta[value] || { label: value, bg: "#f8fafc", color: textMuted };
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: meta.bg, color: meta.color, border: "1px solid rgba(148,163,184,0.18)" }}
    />
  );
}

function PlatformChip({ platform }: { platform: OpsPlatform }) {
  const meta = platformColors[platform];
  return (
    <Chip
      label={platformLabels[platform]}
      size="small"
      sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: meta.bg, color: meta.color, border: "1px solid rgba(148,163,184,0.18)" }}
    />
  );
}

function ContentTypeChip({ contentType }: { contentType?: DispatchContentType }) {
  const meta = contentTypeMeta[contentType || "video"];
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: meta.bg, color: meta.color, border: "1px solid rgba(148,163,184,0.18)" }}
    />
  );
}

function OpsGate({
  title,
  description,
  children,
  onBack,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onBack: () => void;
}) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: pageBg, display: "grid", placeItems: "center", p: 2 }}>
      <Stack spacing={1.5} sx={{ ...cardSx, width: "min(440px, calc(100vw - 32px))", p: 3 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 950, color: textPrimary }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>{description}</Typography>
        {children}
        <Button startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />} onClick={onBack} sx={{ ...softButtonSx, alignSelf: "flex-start" }}>
          返回诊断工作台
        </Button>
      </Stack>
    </Box>
  );
}

function formatTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMetric(value?: number) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatMetricOrDash(value?: number | null) {
  return value === null || value === undefined ? "-" : formatMetric(value);
}

function formatRate(value?: number | null) {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function taskTimeValue(task: PublishTask) {
  const value = new Date(task.scheduledAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function localDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "invalid";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildCalendarDays(tasks: PublishTask[]) {
  const today = startOfLocalDay(new Date());
  const earliest = tasks.length ? startOfLocalDay(new Date(Math.min(...tasks.map(taskTimeValue)))) : today;
  const start = earliest.getTime() < today.getTime() ? earliest : today;
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function splitTags(value: string) {
  return value.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: string) {
  return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function compactPath(value?: string | null) {
  if (!value) return "未分配";
  const parts = value.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function sauAccountNameForDisplay(account: OpsAccount, runtime?: OpsRuntime | null) {
  const raw = account.sauAccountName || account.handle || account.displayName || account.id.slice(0, 8);
  const cleaned = raw.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  const accountName = cleaned || `${account.platform}-${account.id.slice(0, 8)}`;
  return `${runtime?.socialAutoUpload.accountPrefix || ""}${accountName}`.slice(0, 80);
}

function desktopPartitionForAccount(accountId: string) {
  const safe = String(accountId || "account")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "account";
  return `persist:zimeiti-account-${safe}`;
}

function asBridgeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function bridgeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bridgeProfileFromState(item: DesktopAccountBridgeState) {
  const message = asBridgeRecord(item.message);
  if (message.type !== "ZMT_ACCOUNT_PROFILE") return null;
  const profile = asBridgeRecord(message.profile);
  const metrics = asBridgeRecord(profile.metrics);
  const displayName = bridgeText(profile.displayName);
  const handle = bridgeText(profile.handle);
  return {
    accountId: item.accountId,
    platform: bridgeText(profile.platform),
    loggedIn: Boolean(profile.loggedIn),
    displayName,
    handle,
    profile: bridgeText(profile.profile),
    workspaceUrl: bridgeText(profile.url) || bridgeText(message.url),
    pageTitle: bridgeText(profile.title) || bridgeText(message.title),
    capturedAt: bridgeText(profile.capturedAt) || item.updatedAt,
    metrics,
    raw: profile,
  };
}

type EmbeddedAccountWebview = HTMLElement & {
  executeJavaScript?: (code: string) => Promise<unknown>;
};

const embeddedAccountProfileExtractor = String.raw`
(() => {
  const clean = (value, max = 120) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const rawBodyText = String(document.body && document.body.innerText || "");
  const bodyText = clean(rawBodyText, 20000);
  const lines = rawBodyText.split(/\n+/).map((line) => clean(line, 120)).filter(Boolean);
  const isGenericName = (value) => {
    const text = clean(value, 120).toLowerCase();
    if (!text) return true;
    return [
      "创作者中心",
      "创作者服务平台",
      "创作服务平台",
      "视频号助手",
      "视频号 · 助手",
      "申请认证",
      "内容管理",
      "互动管理",
      "数据中心",
      "首页",
      "设置",
      "登录",
      "扫码",
      "creator",
      "platform",
    ].some((item) => text.includes(item.toLowerCase()));
  };
  const title = document.title || "";
  const result = {
    displayName: "",
    handle: "",
    profile: "",
    url: location.href,
    title,
    rawTextSample: bodyText.slice(0, 1200),
  };

  const identityPatterns = [
    /([^|\n｜]{2,40})\s*[|｜]\s*抖音号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
    /([^|\n｜]{2,40})\s*[|｜]\s*小红书号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
    /([^|\n｜]{2,40})\s*[|｜]\s*视频号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
    /([^|\n｜]{2,40})\s*申请认证\s*>?\s*视频号\s*ID\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/i,
  ];
  for (const pattern of identityPatterns) {
    const matched = bodyText.match(pattern);
    if (matched) {
      result.displayName = clean(matched[1], 80);
      result.handle = clean(matched[2], 96);
      break;
    }
  }

  if (!result.handle) {
    const handleMatched = bodyText.match(/(?:抖音号|小红书号|视频号\s*ID|视频号|账号\s*ID|ID)\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/i);
    if (handleMatched) result.handle = clean(handleMatched[1], 96);
  }

  if (result.handle && !result.displayName) {
    const handleLineIndex = lines.findIndex((line) => /(?:抖音号|小红书号|视频号\s*ID|视频号|账号\s*ID|ID)\s*[:：]/i.test(line) && line.includes(result.handle));
    if (handleLineIndex >= 0) {
      for (let index = handleLineIndex - 1; index >= Math.max(0, handleLineIndex - 6); index -= 1) {
        const candidate = clean(lines[index], 80);
        if (candidate && candidate.length >= 2 && !isGenericName(candidate) && !/[:：>]|^\d+$/.test(candidate)) {
          result.displayName = candidate;
          break;
        }
      }
    }
  }

  if (!result.displayName) {
    const selectors = [
      '[class*="nickname" i]',
      '[class*="user-name" i]',
      '[class*="username" i]',
      '[class*="account-name" i]',
      '[class*="author-name" i]',
      '[class*="avatar" i] img[alt]',
      '[class*="user" i] img[alt]',
    ];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 20);
      for (const node of nodes) {
        const text = clean(node.getAttribute("alt") || node.getAttribute("title") || node.textContent, 80);
        if (text && !isGenericName(text)) {
          result.displayName = text;
          break;
        }
      }
      if (result.displayName) break;
    }
  }

  const signatureMatched = bodyText.match(/(?:抖音号|小红书号|视频号\s*ID|视频号)\s*[:：]\s*[@a-zA-Z0-9_.-]{3,}\s*[|｜]\s*([^|\n]{2,120})/);
  if (signatureMatched) result.profile = clean(signatureMatched[1], 120);

  return result;
})()
`;

function maskProxyServer(value?: string | null) {
  if (!value) return "";
  return value.replace(/:\/\/([^/@:]+):([^/@]+)@/, "://***:***@");
}

function normalizedProxyFingerprint(account: Pick<OpsAccount, "browserProxyEnabled" | "browserProxyServer">) {
  if (!account.browserProxyEnabled) return "";
  return (account.browserProxyServer || "").trim().toLowerCase();
}

function isolationStatusForAccount(account: OpsAccount, accounts: OpsAccount[]) {
  if (account.authType !== "browser_session") {
    return {
      severity: "info" as const,
      label: "接口授权账号",
      detail: "这个账号不依赖本地浏览器登录态；多账号 IP 隔离取决于你接入的官方授权环境。",
    };
  }

  const proxyFingerprint = normalizedProxyFingerprint(account);
  const proxyPeers = proxyFingerprint
    ? accounts.filter((item) => item.id !== account.id && normalizedProxyFingerprint(item) === proxyFingerprint)
    : [];

  if (proxyPeers.length > 0) {
    return {
      severity: "warning" as const,
      label: "代理重复",
      detail: `当前与 ${proxyPeers.map((item) => item.displayName).join("、")} 共用代理 ${maskProxyServer(account.browserProxyServer)}；登录态独立，但出口 IP 仍相同。`,
    };
  }

  if (!account.browserProxyEnabled) {
    return {
      severity: "warning" as const,
      label: "仅隔离登录态",
      detail: "当前账号会复用自己的独立浏览器档案，登录态会保留；但代理跟随系统，多账号仍可能共享同一个出口 IP。",
    };
  }

  return {
    severity: "success" as const,
    label: "独立登录态 + 独立代理",
    detail: `当前账号使用独立浏览器档案和账号专属代理 ${maskProxyServer(account.browserProxyServer)}；只要其他账号不要复用这条代理，IP 与登录态都会分开。`,
  };
}

export default function OpsDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { tab?: OpsTab } | null;
  const [state, setState] = useState<OpsState | null>(null);
  const [runtime, setRuntime] = useState<OpsRuntime | null>(null);
  const [agentTools, setAgentTools] = useState<AgentToolDefinition[]>([]);
  const [contentPatterns, setContentPatterns] = useState<ContentPattern[]>([]);
  const [tab, setTab] = useState<OpsTab>(routeState?.tab || "overview");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [embeddedBrowser, setEmbeddedBrowser] = useState<{ accountId: string; src: string; partition: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const seenDirectMessageAlerts = useRef<Set<string>>(new Set());
  const syncedBridgeProfileKeys = useRef<Set<string>>(new Set());
  const opsFrontendEnabled = isOpsFrontendEnabled();

  const openDiagnosisWindow = (account?: OpsAccount) => {
    const params = new URLSearchParams();
    if (account?.id) params.set("accountId", account.id);
    if (account?.platform && account.platform !== "xiaohongshu") params.set("platform", account.platform);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    navigate(`/diagnose/new${suffix}`);
  };

  const refresh = async () => {
    if (!opsFrontendEnabled) {
      throw new Error("运营台未启用");
    }
    const [nextState, nextRuntime, nextAgentTools, nextPatterns] = await Promise.all([
      getOpsState(),
      getOpsRuntime(),
      getOpsAgentTools(),
      getContentPatterns(),
    ]);
    setState(nextState);
    setRuntime(nextRuntime);
    setAgentTools(nextAgentTools);
    setContentPatterns(nextPatterns);
  };

  const runAction = async (key: string, action: () => Promise<unknown>, success = "操作完成") => {
    setBusy(key);
    setError("");
    try {
      await action();
      await refresh();
      showToast(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const handleCreatorCommentReplyAction = async (
    commentId: string,
    action: CreatorCommentReplyAction,
    replyText?: string,
  ) => {
    const labels: Record<CreatorCommentReplyAction, string> = {
      approve: "已确认回复草稿",
      mark_replied: "已标记为已回复",
      ignore: "已忽略该评论",
      reset: "已重置评论状态",
    };
    await runAction(
      `creator-comment-${action}-${commentId}`,
      () => applyCreatorCommentReplyAction(commentId, { action, replyText }),
      labels[action],
    );
  };

  const handlePrepareCreatorCommentReply = async (comment: {
    id: string;
    accountId: string;
    platformCommentId: string;
    authorName: string;
    content: string;
    suggestedReply: string;
  }) => {
    await runAction(
      `creator-comment-prepare-${comment.id}`,
      async () => {
        if (!hasDesktopBrowser() || !window.zimeitiDesktop) {
          throw new Error("需要在桌面版账号浏览器中打开对应评论页");
        }
        const result = await window.zimeitiDesktop.sendAccountCommand({
          accountId: comment.accountId,
          commandId: `reply-comment-${Date.now()}`,
          kind: "reply_comment",
          data: {
            commentId: comment.id,
            platformCommentId: comment.platformCommentId,
            authorName: comment.authorName,
            content: comment.content,
            replyText: comment.suggestedReply,
          },
        });
        if (!result.ok) {
          throw new Error(result.error || "账号浏览器未打开，请先打开该账号后台并进入评论页");
        }
      },
      "已发送到账号浏览器，请在页面确认发送",
    );
  };

  const runBatchAction = async (
    key: string,
    ids: string[],
    action: (id: string, index: number) => Promise<unknown>,
    success: string,
  ) => {
    setBusy(key);
    setError("");
    try {
      for (const [index, id] of ids.entries()) {
        await action(id, index);
      }
      await refresh();
      showToast(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const pullDesktopBridgeProfiles = async (accountId?: string) => {
    if (!state || !hasDesktopBrowser() || !window.zimeitiDesktop) return false;
    const bridgeStates = await window.zimeitiDesktop.getAccountBridgeState();
    let synced = false;

    for (const bridgeState of bridgeStates) {
      if (accountId && bridgeState.accountId !== accountId) continue;
      const bridgeProfile = bridgeProfileFromState(bridgeState);
      if (!bridgeProfile?.loggedIn) continue;
      if (!bridgeProfile.displayName && !bridgeProfile.handle) continue;

      const account = state.accounts.find((item) => item.id === bridgeProfile.accountId);
      if (!account) continue;
      if (bridgeProfile.platform && bridgeProfile.platform !== "unknown" && bridgeProfile.platform !== account.platform) continue;

      const syncKey = [
        bridgeProfile.accountId,
        bridgeProfile.displayName,
        bridgeProfile.handle,
        bridgeProfile.workspaceUrl,
        bridgeProfile.capturedAt,
      ].join("|");
      if (syncedBridgeProfileKeys.current.has(syncKey)) continue;
      if (
        account.status === "connected"
        && account.displayName === bridgeProfile.displayName
        && (!bridgeProfile.handle || account.handle === bridgeProfile.handle)
      ) {
        syncedBridgeProfileKeys.current.add(syncKey);
        continue;
      }

      await syncOpsAccountProfile(bridgeProfile.accountId, {
        displayName: bridgeProfile.displayName,
        handle: bridgeProfile.handle,
        profile: bridgeProfile.profile,
        workspaceUrl: bridgeProfile.workspaceUrl,
        pageTitle: bridgeProfile.pageTitle,
        source: "browser_bridge",
        raw: bridgeProfile.raw,
      });
      syncedBridgeProfileKeys.current.add(syncKey);
      synced = true;
    }

    if (synced) {
      await refresh();
      showToast("已同步创作者中心账号信息");
    }
    return synced;
  };

  const syncEmbeddedBrowserProfile = async (accountId: string, options?: { silent?: boolean }) => {
    if (!state || !hasDesktopBrowser()) return false;
    const webview = document.querySelector(`[data-account-webview="${accountId}"]`) as EmbeddedAccountWebview | null;
    if (!webview?.executeJavaScript) return false;

    const embeddedProfile = asBridgeRecord(await webview.executeJavaScript(embeddedAccountProfileExtractor));
    const displayName = bridgeText(embeddedProfile.displayName);
    const handle = bridgeText(embeddedProfile.handle);
    if (!displayName && !handle) return false;

    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return false;

    const syncKey = [
      "embedded",
      accountId,
      displayName,
      handle,
      bridgeText(embeddedProfile.url),
      bridgeText(embeddedProfile.title),
    ].join("|");
    if (syncedBridgeProfileKeys.current.has(syncKey)) return true;

    const alreadySynced = (
      account.status === "connected"
      && (!displayName || account.displayName === displayName)
      && (!handle || account.handle === handle)
    );
    if (alreadySynced) {
      syncedBridgeProfileKeys.current.add(syncKey);
      return true;
    }

    await syncOpsAccountProfile(accountId, {
      displayName,
      handle,
      profile: bridgeText(embeddedProfile.profile),
      workspaceUrl: bridgeText(embeddedProfile.url),
      pageTitle: bridgeText(embeddedProfile.title),
      source: "browser_bridge",
      raw: embeddedProfile,
    });
    syncedBridgeProfileKeys.current.add(syncKey);
    await refresh();
    if (!options?.silent) showToast("已同步创作者中心账号信息");
    return true;
  };

  const requestAccountProfileSync = async (accountId: string) => {
    if (hasDesktopBrowser() && window.zimeitiDesktop) {
      if (embeddedBrowser?.accountId === accountId) {
        const syncedFromEmbedded = await syncEmbeddedBrowserProfile(accountId, { silent: true });
        if (syncedFromEmbedded) return;

        const webview = document.querySelector(`[data-account-webview="${accountId}"]`) as EmbeddedAccountWebview | null;
        if (webview?.executeJavaScript) {
          await webview.executeJavaScript(
            `window.postMessage({ type: "ZMT_ACCOUNT_COMMAND", command: { id: "profile-${Date.now()}", kind: "extract_profile" } }, "*");`,
          );
          await webview.executeJavaScript(
            `window.postMessage({ type: "ZMT_ACCOUNT_COMMAND", command: { id: "creator-data-${Date.now()}", kind: "extract_creator_data" } }, "*");`,
          );
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const nextState = await getOpsState();
        setState(nextState);
        const updated = nextState.accounts.find((account) => account.id === accountId);
        if (updated?.status === "connected" && !updated.displayName.includes("待扫码")) {
          return;
        }
      }

      await window.zimeitiDesktop.sendAccountCommand({
        accountId,
        commandId: `profile-${Date.now()}`,
        kind: "extract_profile",
      });
      await window.zimeitiDesktop.sendAccountCommand({
        accountId,
        commandId: `creator-data-${Date.now()}`,
        kind: "extract_creator_data",
      });
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const synced = await pullDesktopBridgeProfiles(accountId);
      if (!synced) {
        throw new Error("还没有从创作者中心读取到账号名称，请确认扫码登录成功并停留在创作者中心首页。");
      }
      return;
    }

    await rememberOpsSession(accountId);
  };

  useEffect(() => {
    document.title = "自媒体管家";
    if (!opsFrontendEnabled) return;
    refresh().catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [opsFrontendEnabled]);

  useEffect(() => {
    if (!opsFrontendEnabled || !state || !hasDesktopBrowser()) return;
    const timer = window.setInterval(() => {
      pullDesktopBridgeProfiles().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [opsFrontendEnabled, state]);

  useEffect(() => {
    if (!opsFrontendEnabled || !state || !embeddedBrowser || !hasDesktopBrowser()) return;
    let stopped = false;
    const accountId = embeddedBrowser.accountId;
    const trySync = () => {
      if (stopped) return;
      syncEmbeddedBrowserProfile(accountId).catch(() => {});
    };
    const firstTimer = window.setTimeout(trySync, 1500);
    const timer = window.setInterval(trySync, 4000);
    return () => {
      stopped = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(timer);
    };
  }, [opsFrontendEnabled, state, embeddedBrowser]);

  useEffect(() => {
    if (!opsFrontendEnabled || !embeddedBrowser || !hasDesktopBrowser()) return;
    const accountId = embeddedBrowser.accountId;
    const webview = document.querySelector(`[data-account-webview="${accountId}"]`) as EmbeddedAccountWebview | null;
    if (!webview?.addEventListener) return;

    const trySync = () => {
      window.setTimeout(() => {
        syncEmbeddedBrowserProfile(accountId).catch(() => {});
      }, 450);
    };
    webview.addEventListener("dom-ready", trySync);
    webview.addEventListener("did-stop-loading", trySync);
    webview.addEventListener("did-navigate", trySync);
    webview.addEventListener("did-navigate-in-page", trySync);
    return () => {
      webview.removeEventListener("dom-ready", trySync);
      webview.removeEventListener("did-stop-loading", trySync);
      webview.removeEventListener("did-navigate", trySync);
      webview.removeEventListener("did-navigate-in-page", trySync);
    };
  }, [opsFrontendEnabled, embeddedBrowser]);

  useEffect(() => {
    if (!opsFrontendEnabled) return;
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [opsFrontendEnabled]);

  const metrics = useMemo(() => {
    const tasks = state?.tasks || [];
    return {
      accounts: state?.accounts.length || 0,
      assets: state?.assets.length || 0,
      drafts: state?.drafts.length || 0,
      viral: state?.viralContentItems.length || 0,
      scheduled: tasks.filter((item) => item.status === "scheduled").length,
      published: tasks.filter((item) => item.status === "published").length,
      failed: tasks.filter((item) => item.status === "failed").length,
      collections: state?.metricCollectionJobs.length || 0,
      coachReports: state?.creatorCoachReports.length || 0,
    };
  }, [state]);

  const selectedAccount = useMemo(
    () => state?.accounts.find((account) => account.id === selectedAccountId) || null,
    [state, selectedAccountId],
  );

  const activeNavItem = opsNavigation.find((item) => item.value === tab) || opsNavigation[0];
  const hasAccounts = Boolean(state?.accounts.length);

  const unreadMessageAlerts = useMemo(
    () => (state?.directMessageAlerts || []).filter((alert) => alert.status === "unread"),
    [state],
  );

  useEffect(() => {
    if (!state) return;
    const nextIds = new Set(unreadMessageAlerts.map((alert) => alert.id));
    const newAlerts = unreadMessageAlerts.filter((alert) => !seenDirectMessageAlerts.current.has(alert.id));
    if (seenDirectMessageAlerts.current.size > 0 && newAlerts.length > 0) {
      showToast(`收到 ${newAlerts.length} 条新的私信提醒`);
    }
    seenDirectMessageAlerts.current = nextIds;
  }, [state, unreadMessageAlerts]);

  const diagnoseDraft = (draft: PlatformDraft) => {
    if (draft.platform !== "douyin" && draft.platform !== "wechat_channels") {
      showToast("当前诊断模块先支持抖音和视频号；小红书可进入账号中心查看。");
      return;
    }
    navigate("/diagnosing", {
      state: {
        platform: draft.platform as PlatformKey,
        title: draft.title,
        content: draft.description,
        tags: draft.tags.join(","),
        category: draft.platform === "douyin" ? String(draft.publishOptions.trafficField || "interest") : String(draft.publishOptions.category || "local"),
        trafficField: draft.platform === "douyin" ? String(draft.publishOptions.trafficField || "interest") : undefined,
        goal: draft.platform === "douyin" ? "follow" : undefined,
        duration: "60",
        coverFile: null,
        coverImages: [],
        videoFile: null,
      },
    });
  };
  void agentTools;
  void contentPatterns;
  void runBatchAction;
  void metrics;
  void diagnoseDraft;

  const openAccountWorkspaceById = async (id: string) => {
    const usingDesktopBrowser = hasDesktopBrowser();
    if (usingDesktopBrowser) {
      const result = await prepareDesktopAccountWebview(id);
      setEmbeddedBrowser({
        accountId: id,
        src: result.workspaceUrl || "",
        partition: result.partition || desktopPartitionForAccount(id),
      });
      return;
    }

    throw new Error("账号中心现在使用项目内置浏览器，请在桌面版自媒体管家中打开。");
  };

  const startAccountDiagnosis = (account: OpsAccount) => {
    runAction(
      `account-diagnose-${account.id}`,
      () => diagnoseOpsAccount(account.id, { readLoggedInWorkspace: true }),
      "账号诊断已完成",
    );
  };

  const openAccountWorkspace = (id: string) => {
    runAction(
      `workspace-${id}`,
      () => openAccountWorkspaceById(id),
      "已在内置浏览器打开创作者中心",
    );
  };

  if (!opsFrontendEnabled) {
    return (
      <OpsGate
        title="运营台未启用"
        description="当前构建只启用了内容诊断工作台；账号管理、发布任务、私信监控和 Agent 发布入口保持关闭。"
        onBack={() => navigate("/")}
      />
    );
  }

  if (!state) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: pageBg, display: "grid", placeItems: "center" }}>
        <Stack spacing={1.5} sx={{ ...cardSx, alignItems: "center", p: 3, width: "min(320px, calc(100vw - 32px))" }}>
          <CircularProgress size={26} sx={{ color: "#1E40AF" }} />
          <Typography sx={{ fontSize: 13, color: textMuted }}>加载运营数据...</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {error && (
            <Button
              size="small"
              onClick={() => {
                setError("");
                refresh().catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
              }}
              sx={softButtonSx}
            >
              重新加载
            </Button>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: pageBg, color: textPrimary }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 70,
          bgcolor: "rgba(255,255,255,0.96)",
          borderBottom: "1px solid #E2E8F0",
          boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Box sx={{ px: { xs: 1.2, md: 2.2 }, py: 0.85, display: "flex", alignItems: "center", gap: 1.2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.9, minWidth: { xs: 0, lg: 238 }, flex: { xs: 1, lg: "0 0 238px" } }}>
            <Box sx={{ width: 38, height: 38, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "#F59E0B", color: "#fff", border: "1px solid #FBBF24" }}>
              <AutoAwesomeOutlinedIcon sx={{ fontSize: 19 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 950, color: textPrimary, lineHeight: 1.1, whiteSpace: "nowrap" }}>自媒体管家</Typography>
              <Typography sx={{ fontSize: 10.5, color: textMuted, mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                账号 · 创作 · 发布
              </Typography>
            </Box>
          </Box>

          <Box
            component="nav"
            aria-label="顶部功能栏"
            sx={{
              flex: 1,
              minWidth: 0,
              display: { xs: "none", md: "flex" },
              alignItems: "stretch",
              gap: 0.55,
              overflowX: "auto",
              pb: 0.1,
            }}
          >
            {opsNavigation.map((item) => {
              const selected = item.value === tab;
              const label = item.value === "messages" && unreadMessageAlerts.length ? `${item.label} ${unreadMessageAlerts.length}` : item.label;
              return (
                <Button
                  key={item.value}
                  onClick={() => setTab(item.value)}
                  startIcon={<Box sx={{ display: "grid", placeItems: "center", "& svg": { fontSize: 18 } }}>{item.icon}</Box>}
                  sx={{
                    minWidth: 112,
                    minHeight: 54,
                    px: 1.15,
                    borderRadius: "8px",
                    color: selected ? "#1E40AF" : textSecondary,
                    bgcolor: selected ? "#EFF6FF" : "transparent",
                    border: selected ? "1px solid #93C5FD" : "1px solid transparent",
                    cursor: "pointer",
                    "&:hover": { bgcolor: selected ? "#DBEAFE" : "#F8FAFC", borderColor: "#CBD5E1" },
                    "& .MuiButton-startIcon": { mr: 0.75 },
                  }}
                >
                  <Box sx={{ minWidth: 0, textAlign: "left" }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 950, lineHeight: 1.2 }}>{label}</Typography>
                    <Typography sx={{ fontSize: 10, color: selected ? "#2563EB" : textMuted, lineHeight: 1.25, mt: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.helper}
                    </Typography>
                  </Box>
                </Button>
              );
            })}
          </Box>

          {runtime && (
            <Chip
              label={runtimeModeLabel(runtime.publisherRunMode)}
              size="small"
              sx={{ display: { xs: "none", sm: "inline-flex" }, height: 24, fontSize: 10, fontWeight: 950, ...runtimeModeSx(runtime.publisherRunMode), border: "1px solid rgba(148,163,184,0.22)" }}
            />
          )}
          <Tooltip title="返回首页">
            <IconButton onClick={() => navigate("/")} sx={{ color: textSecondary, cursor: "pointer" }}>
              <ArrowBackIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="刷新">
            <IconButton onClick={() => runAction("refresh", refresh, "已刷新")} disabled={busy === "refresh"} sx={{ color: textSecondary, cursor: "pointer" }}>
              {busy === "refresh" ? <CircularProgress size={18} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: { xs: "block", md: "none" }, px: 1.2, pb: 0.85 }}>
          <Box sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", bgcolor: "#F8FAFC", p: 0.35, overflow: "hidden" }}>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 38,
                "& .MuiTabs-indicator": { display: "none" },
                "& .MuiTabs-flexContainer": { gap: 0.35 },
                "& .MuiTab-root": { minHeight: 38, borderRadius: "8px", px: 1.25, fontSize: 12, fontWeight: 900, color: textMuted },
                "& .MuiTab-root.Mui-selected": { bgcolor: "#1E40AF", color: "#fff" },
              }}
            >
              {opsNavigation.map((item) => (
                <Tab
                  key={item.value}
                  value={item.value}
                  label={item.value === "messages" && unreadMessageAlerts.length ? `${item.label} ${unreadMessageAlerts.length}` : item.label}
                />
              ))}
            </Tabs>
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ px: { xs: 1.2, md: 2 }, py: { xs: 1.3, md: 1.7 }, maxWidth: tab === "accounts" ? "none" : 1480, mx: "auto" }}>
        {error && <Alert severity="error" sx={{ mb: 1.4, borderRadius: "8px" }}>{error}</Alert>}

        {tab !== "accounts" && (
          <Box sx={{ mb: 1.4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 950, color: textPrimary, lineHeight: 1.2 }}>{activeNavItem.label}</Typography>
              <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>{activeNavItem.helper}</Typography>
            </Box>
            {runtime && (
              <Typography sx={{ display: { xs: "none", md: "block" }, maxWidth: 520, fontSize: 11, color: textMuted, lineHeight: 1.5, textAlign: "right" }}>
                {runtimeSafetyCopy(runtime)}
              </Typography>
            )}
          </Box>
        )}

        {tab === "overview" && (
          hasAccounts ? (
            <SimpleOverview
              state={state}
              busy={busy}
              onOpenAccounts={() => setTab("accounts")}
              onOpenMessages={() => setTab("diagnosis")}
              onCommentReplyAction={handleCreatorCommentReplyAction}
              onPrepareCommentReply={handlePrepareCreatorCommentReply}
            />
          ) : (
            <FirstRunEmptyPanel onOpenAccounts={() => setTab("accounts")} />
          )
        )}
        {tab === "accounts" && (
          <SimpleAccountsCenter
            state={state}
            runtime={runtime}
            busy={busy}
            embeddedBrowser={embeddedBrowser}
            canEmbedBrowser={hasDesktopBrowser()}
            selectedAccountId={selectedAccount?.id || ""}
            onSelect={(account) => setSelectedAccountId(account.id)}
            onCreateAndOpen={(input) =>
              runAction(
                "create-account",
                async () => {
                  const account = await createOpsAccount(input);
                  setSelectedAccountId(account.id);
                  await openAccountWorkspaceById(account.id);
                },
                "已在内置创作者中心打开，请扫码登录",
              )
            }
            onCheck={(id) => runAction(`check-${id}`, () => checkOpsSession(id), "登录态已检查")}
            onOpenWorkspace={openAccountWorkspace}
            onRemember={(id) =>
              runAction(
                `remember-${id}`,
                async () => {
                  await requestAccountProfileSync(id);
                },
                hasDesktopBrowser() ? "已同步账号信息" : "已保存登录档案",
              )
            }
          />
        )}
        {tab === "quick_publish" && (
          <QuickVideoPublishPanel
            state={state}
            runtime={runtime}
            busy={busy}
            onOpenAccounts={() => setTab("accounts")}
            onQuickPublish={(input, accountIds) =>
              runAction(
                "quick-publish",
                async () => {
                  const asset = await createOpsAsset(input);
                  const drafts = await generateOpsDrafts(asset.id, accountIds);
                  for (const draft of drafts) {
                    const task = await createOpsTask(draft.id);
                    await executeOpsTask(task.id);
                  }
                },
                "一键发布任务已提交",
              )
            }
          />
        )}
        {tab === "automation" && (
          <SimpleAutomationPanel
            state={state}
            runtime={runtime}
            busy={busy}
            onOpenAccounts={() => setTab("accounts")}
            onCreateTask={(draftId) => runAction(`task-${draftId}`, () => createOpsTask(draftId), "任务已创建")}
            onApprove={(taskId) => runAction(`approve-${taskId}`, () => approveOpsTask(taskId), "任务已审核")}
            onExecute={(taskId) => runAction(`execute-${taskId}`, () => executeOpsTask(taskId), "执行完成")}
            onRunPublishing={(input) => runAction("publishing-agent", () => runOpsPublishingAgent(input), "自动化发布已运行")}
            onCreateAsset={(input) => runAction("create-asset", () => createOpsAsset(input), "发布包已保存")}
            onCreatePackage={(input, accountIds, scheduledAt) =>
              runAction(
                "create-publish-package",
                async () => {
                  const asset = await createOpsAsset(input);
                  const drafts = await generateOpsDrafts(asset.id, accountIds);
                  for (const draft of drafts) {
                    await createOpsTask(draft.id, scheduledAt);
                  }
                },
                "定时发布任务已生成",
              )
            }
            onCreateFolderPackage={(input) => runAction("create-folder-package", () => createPublishPackageFromFolder(input), "文件夹发布包已生成任务")}
            onGenerateDrafts={(assetId, accountIds) => runAction(`drafts-${assetId}`, () => generateOpsDrafts(assetId, accountIds), "矩阵草稿已生成")}
          />
        )}
        {tab === "diagnosis" && (
          hasAccounts ? (
            <SimpleDiagnosisPanel
              state={state}
              busy={busy}
              onOpenDiagnosis={(account) => openDiagnosisWindow(account)}
              onDiagnoseAccount={startAccountDiagnosis}
            />
          ) : (
            <FirstRunEmptyPanel onOpenAccounts={() => setTab("accounts")} />
          )
        )}
      </Box>
    </Box>
  );
}

function FirstRunEmptyPanel({ onOpenAccounts }: { onOpenAccounts: () => void }) {
  return (
    <Box sx={{ minHeight: "calc(100vh - 132px)", display: "grid", placeItems: "center" }}>
      <Stack spacing={1.4} sx={{ width: "min(520px, 100%)", alignItems: "center", textAlign: "center", px: 2 }}>
        <Box sx={{ width: 46, height: 46, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
          <AccountCircleOutlinedIcon sx={{ fontSize: 24 }} />
        </Box>
        <Typography sx={{ fontSize: 20, fontWeight: 950, color: textPrimary }}>还没有接入账号</Typography>
        <Typography sx={{ fontSize: 13, color: textMuted, lineHeight: 1.7, maxWidth: 440 }}>
          当前运营台保持空白。先添加平台账号，打开独立浏览器扫码登录，再保存登录档案；账号写入项目后，才会显示灵感、创作、发布和任务内容。
        </Typography>
        <Button variant="contained" onClick={onOpenAccounts} sx={{ ...primaryDarkButtonSx, mt: 0.4 }}>
          去添加账号
        </Button>
      </Stack>
    </Box>
  );
}

function latestMetricForAccount(state: OpsState, accountId: string) {
  return [...state.metrics]
    .filter((metric) => metric.accountId === accountId)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
}

function sumAccountMetric(state: OpsState, key: "plays" | "comments" | "likes" | "shares" | "followers") {
  return state.accounts.reduce((total, account) => total + (latestMetricForAccount(state, account.id)?.[key] || 0), 0);
}

function SimpleOverview({
  state,
  busy,
  onOpenAccounts,
  onOpenMessages,
  onCommentReplyAction,
  onPrepareCommentReply,
}: {
  state: OpsState;
  busy: string | null;
  onOpenAccounts: () => void;
  onOpenMessages: () => void;
  onCommentReplyAction: (commentId: string, action: CreatorCommentReplyAction, replyText?: string) => void;
  onPrepareCommentReply: (comment: {
    id: string;
    accountId: string;
    platformCommentId: string;
    authorName: string;
    content: string;
    suggestedReply: string;
  }) => void;
}) {
  const unreadAlerts = state.directMessageAlerts.filter((alert) => alert.status === "unread").length;
  const totalUnreadMessages = state.directMessageMonitors.reduce((total, item) => total + item.unreadCount, 0);
  const recentAccounts = state.accounts.slice(0, 8);
  const creatorPosts = Array.isArray((state as OpsState & { creatorPosts?: unknown[] }).creatorPosts)
    ? (state as OpsState & { creatorPosts: unknown[] }).creatorPosts
    : [];
  const creatorComments = Array.isArray((state as OpsState & { creatorComments?: unknown[] }).creatorComments)
    ? (state as OpsState & { creatorComments: unknown[] }).creatorComments
    : [];
  const recentDraftComments = (creatorComments as Array<{
    id: string;
    accountId: string;
    platformCommentId: string;
    authorName: string;
    content: string;
    suggestedReply: string;
    intentTags: string[];
    replyStatus: string;
    updatedAt: string;
  }>)
    .filter((comment) => Boolean(comment.suggestedReply))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(7, 1fr)" }, gap: 1 }}>
        <MetricCard icon={<AccountCircleOutlinedIcon />} label="账号" value={state.accounts.length} helper="已保存到项目" onClick={onOpenAccounts} />
        <MetricCard icon={<PlayArrowIcon />} label="播放" value={sumAccountMetric(state, "plays")} helper="最近快照汇总" />
        <MetricCard icon={<AutoAwesomeOutlinedIcon />} label="互动" value={sumAccountMetric(state, "likes") + sumAccountMetric(state, "shares")} helper="点赞 + 分享" />
        <MetricCard icon={<MarkEmailUnreadOutlinedIcon />} label="评论" value={sumAccountMetric(state, "comments")} helper="最近快照汇总" />
        <MetricCard icon={<MarkEmailUnreadOutlinedIcon />} label="私信" value={totalUnreadMessages || unreadAlerts} helper="未读/提醒" onClick={onOpenMessages} />
        <MetricCard icon={<PlayArrowIcon />} label="作品库" value={creatorPosts.length} helper="后台桥采集" />
        <MetricCard icon={<MarkEmailUnreadOutlinedIcon />} label="评论库" value={creatorComments.length} helper="可见评论入库" />
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="账号数据概览" subtitle="这里只显示已登录并保存到项目中的账号数据" />
        {recentAccounts.length ? (
          <Stack spacing={0.8}>
            {recentAccounts.map((account) => {
              const metric = latestMetricForAccount(state, account.id);
              const monitor = state.directMessageMonitors.find((item) => item.accountId === account.id);
              return (
                <Box key={account.id} sx={{ ...itemCardSx, p: 1.2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr repeat(4, minmax(86px, 1fr))" }, gap: 1, alignItems: "center" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.6 }}>
                      <PlatformChip platform={account.platform} />
                      <StatusChip value={account.status} />
                    </Stack>
                    <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, mt: 0.55 }}>{account.displayName}</Typography>
                    <Typography sx={{ fontSize: 11, color: textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account.handle}</Typography>
                  </Box>
                  <AccountDataCell label="播放" value={formatMetricOrDash(metric?.plays)} />
                  <AccountDataCell label="评论" value={formatMetricOrDash(metric?.comments)} />
                  <AccountDataCell label="粉丝" value={formatMetricOrDash(metric?.followers)} />
                  <AccountDataCell label="私信" value={monitor ? formatMetric(monitor.unreadCount) : "-"} />
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Empty text="暂无账号数据。" />
        )}
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="私信概览" subtitle="展示各账号私信监控的大致状态" />
        {state.directMessageMonitors.length ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
            {state.directMessageMonitors.map((monitor) => {
              const account = state.accounts.find((item) => item.id === monitor.accountId);
              return (
                <Box key={monitor.id} sx={{ ...itemCardSx, p: 1.2 }}>
                  <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.65 }}>
                    <PlatformChip platform={monitor.platform} />
                    <StatusChip value={monitor.status} />
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 900 }}>{account?.displayName || "未知账号"}</Typography>
                  <Typography sx={{ fontSize: 20, color: textPrimary, fontWeight: 950, mt: 0.5 }}>{formatMetric(monitor.unreadCount)}</Typography>
                  <Typography sx={{ fontSize: 11, color: textMuted }}>未读私信 · {monitor.lastCheckedAt ? formatTime(monitor.lastCheckedAt) : "尚未检测"}</Typography>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Empty text="暂无私信监控数据，账号保存后会按平台初始化。" />
        )}
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="评论回复草稿" subtitle="从已采集评论中识别意图并生成待确认回复" />
        {recentDraftComments.length ? (
          <Stack spacing={0.85}>
            {recentDraftComments.map((comment) => (
              <Box key={comment.id} sx={{ ...itemCardSx, p: 1.2 }}>
                <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                  <Chip size="small" label={comment.replyStatus === "drafted" ? "待确认" : comment.replyStatus} sx={{ height: 22, fontSize: 11, fontWeight: 800 }} />
                  {(comment.intentTags || []).slice(0, 3).map((tag) => (
                    <Chip key={tag} size="small" label={tag} sx={{ height: 22, fontSize: 11, bgcolor: "#EEF2FF", color: "#3730A3", fontWeight: 800 }} />
                  ))}
                </Stack>
                <Typography sx={{ fontSize: 12, color: textSecondary, mt: 0.7, fontWeight: 800 }}>{comment.authorName || "评论用户"}</Typography>
                <Typography sx={{ fontSize: 13, color: textPrimary, mt: 0.35 }}>{comment.content}</Typography>
                <Typography sx={{ fontSize: 12, color: "#0F766E", mt: 0.75, bgcolor: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "8px", p: 0.85 }}>
                  {comment.suggestedReply}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.9, flexWrap: "wrap", rowGap: 0.75 }}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy === `creator-comment-approve-${comment.id}`}
                    onClick={() => onCommentReplyAction(comment.id, "approve", comment.suggestedReply)}
                  >
                    确认草稿
                  </Button>
                  {comment.replyStatus === "approved" && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disabled={busy === `creator-comment-prepare-${comment.id}`}
                      onClick={() => onPrepareCommentReply(comment)}
                    >
                      后台填入
                    </Button>
                  )}
                  <Button
                    size="small"
                    disabled={busy === `creator-comment-mark_replied-${comment.id}`}
                    onClick={() => onCommentReplyAction(comment.id, "mark_replied", comment.suggestedReply)}
                  >
                    标记已回复
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    disabled={busy === `creator-comment-ignore-${comment.id}`}
                    onClick={() => onCommentReplyAction(comment.id, "ignore")}
                  >
                    忽略
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Empty text="暂无评论回复草稿。进入作品评论页采集后会自动生成。" />
        )}
      </Box>
    </Stack>
  );
}

function AccountDataCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ fontSize: 16, color: textPrimary, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

function SimpleAccountsCenter({
  state,
  runtime,
  busy,
  embeddedBrowser,
  canEmbedBrowser,
  selectedAccountId,
  onSelect,
  onCreateAndOpen,
  onCheck,
  onOpenWorkspace,
  onRemember,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  embeddedBrowser: { accountId: string; src: string; partition: string } | null;
  canEmbedBrowser: boolean;
  selectedAccountId: string;
  onSelect: (account: OpsAccount) => void;
  onCreateAndOpen: (input: Parameters<typeof createOpsAccount>[0]) => void;
  onCheck: (id: string) => void;
  onOpenWorkspace: (id: string) => void;
  onRemember: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(state.accounts.length === 0);
  const platformOrder: OpsPlatform[] = ["douyin", "xiaohongshu", "wechat_channels"];
  const activeAccount = state.accounts.find((account) => account.id === selectedAccountId) || state.accounts[0] || null;
  const lastAutoOpenedAccountId = useRef("");

  useEffect(() => {
    if (!state.accounts.length) setCreateOpen(true);
  }, [state.accounts.length]);

  useEffect(() => {
    if (activeAccount && !selectedAccountId) {
      onSelect(activeAccount);
    }
  }, [activeAccount, onSelect, selectedAccountId]);

  useEffect(() => {
    if (!canEmbedBrowser || !activeAccount) return;
    if (embeddedBrowser?.accountId === activeAccount.id) return;
    if (lastAutoOpenedAccountId.current === activeAccount.id) return;
    lastAutoOpenedAccountId.current = activeAccount.id;
    onOpenWorkspace(activeAccount.id);
  }, [activeAccount, canEmbedBrowser, embeddedBrowser?.accountId, onOpenWorkspace]);

  const selectAccount = (account: OpsAccount) => {
    onSelect(account);
    if (canEmbedBrowser && embeddedBrowser?.accountId !== account.id) {
      lastAutoOpenedAccountId.current = account.id;
      onOpenWorkspace(account.id);
    }
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "300px minmax(0, 1fr)" },
        gap: 1.4,
        alignItems: "stretch",
        minHeight: "calc(100vh - 94px)",
      }}
    >
      <Box
        component="aside"
        sx={{
          ...cardSx,
          p: 1,
          position: { lg: "sticky" },
          top: { lg: 88 },
          alignSelf: "start",
          height: { lg: "calc(100vh - 110px)" },
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ px: 0.7, py: 0.65, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 950, color: textPrimary, lineHeight: 1.2 }}>账号中心</Typography>
            <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25 }}>选择账号后在右侧打开创作者中心</Typography>
          </Box>
          <Tooltip title={createOpen ? "收起添加账号" : "添加账号"}>
            <IconButton onClick={() => setCreateOpen((value) => !value)} sx={{ bgcolor: "#EFF6FF", color: "#1E40AF", borderRadius: "8px", cursor: "pointer", "&:hover": { bgcolor: "#DBEAFE" } }}>
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Collapse in={createOpen} unmountOnExit>
          <Box sx={{ px: 0.7, pb: 1 }}>
            <AccountCreateMiniForm busy={busy} onCreateAndOpen={onCreateAndOpen} compact />
          </Box>
          <Divider sx={{ mb: 0.8 }} />
        </Collapse>

        <Box sx={{ px: 0.7, pb: 0.8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.55 }}>
          {platformOrder.map((platform) => {
            const count = state.accounts.filter((account) => account.platform === platform).length;
            return (
              <Box key={platform} sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", p: 0.7, bgcolor: "#F8FAFC" }}>
                <Typography sx={{ fontSize: 10, color: textMuted, fontWeight: 900 }}>{platformLabels[platform]}</Typography>
                <Typography sx={{ fontSize: 18, color: textPrimary, fontWeight: 950, lineHeight: 1.1 }}>{count}</Typography>
              </Box>
            );
          })}
        </Box>

        <Stack spacing={1} sx={{ overflowY: "auto", pr: 0.25, pb: 0.5 }}>
          {platformOrder.map((platform) => {
            const accounts = state.accounts.filter((account) => account.platform === platform);
            if (!accounts.length) return null;
            return (
              <Box key={platform}>
                <Stack direction="row" spacing={0.55} sx={{ alignItems: "center", px: 0.7, py: 0.55 }}>
                  <PlatformChip platform={platform} />
                  <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 900 }}>{accounts.length} 个账号</Typography>
                </Stack>
                <Stack spacing={0.65}>
                  {accounts.map((account) => {
                    const selected = activeAccount?.id === account.id;
                    const metric = latestMetricForAccount(state, account.id);
                    return (
                      <Box
                        key={account.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectAccount(account);
                          }
                        }}
                        sx={{
                          border: selected ? "1px solid #60A5FA" : "1px solid #E2E8F0",
                          borderRadius: "8px",
                          bgcolor: selected ? "#EFF6FF" : "#fff",
                          p: 1,
                          cursor: "pointer",
                          transition: "background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
                          boxShadow: selected ? "0 8px 18px rgba(37,99,235,0.11)" : "none",
                          "&:hover": { borderColor: "#93C5FD", bgcolor: selected ? "#EFF6FF" : "#F8FAFC" },
                          "&:focus-visible": { outline: "2px solid #2563EB", outlineOffset: 2 },
                        }}
                      >
                        <Stack direction="row" spacing={0.7} sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {account.displayName}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {account.handle || account.id}
                            </Typography>
                          </Box>
                          {busy === `workspace-${account.id}` ? <CircularProgress size={15} /> : <StatusChip value={account.status} />}
                        </Stack>
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.7, mt: 0.9 }}>
                          <AccountDataCell label="播放" value={formatMetricOrDash(metric?.plays)} />
                          <AccountDataCell label="评论" value={formatMetricOrDash(metric?.comments)} />
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
          {!state.accounts.length && (
            <Box sx={{ border: "1px dashed #CBD5E1", borderRadius: "8px", p: 1.2, bgcolor: "#F8FAFC" }}>
              <Typography sx={{ fontSize: 12, color: textPrimary, fontWeight: 900 }}>暂无账号</Typography>
              <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.55, mt: 0.35 }}>先添加一个平台账号，右侧会直接进入扫码登录。</Typography>
            </Box>
          )}
        </Stack>
      </Box>

      <Box sx={{ minWidth: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 1 }}>
        <Box sx={{ ...cardSx, p: 1.2 }}>
          {activeAccount ? (
            <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.55 }}>
                  <PlatformChip platform={activeAccount.platform} />
                  <StatusChip value={activeAccount.status} />
                  <StatusChip value={activeAccount.sessionHealth} />
                  {runtime && (
                    <Chip
                      label={runtimeModeLabel(runtime.publisherRunMode)}
                      size="small"
                      sx={{ height: 23, fontSize: 10, fontWeight: 950, ...runtimeModeSx(runtime.publisherRunMode) }}
                    />
                  )}
                </Stack>
                <Typography sx={{ fontSize: 18, color: textPrimary, fontWeight: 950, mt: 0.55, lineHeight: 1.2 }}>
                  {activeAccount.displayName}
                </Typography>
                <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {platformLabels[activeAccount.platform]} · {activeAccount.handle || activeAccount.id}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.65} sx={{ flexWrap: "wrap", rowGap: 0.65 }}>
                <Button size="small" onClick={() => onRemember(activeAccount.id)} disabled={busy === `remember-${activeAccount.id}`} sx={softButtonSx}>同步账号信息</Button>
                <Button size="small" onClick={() => onCheck(activeAccount.id)} disabled={busy === `check-${activeAccount.id}`} sx={softButtonSx}>检查登录态</Button>
                <Button size="small" onClick={() => onOpenWorkspace(activeAccount.id)} disabled={!canEmbedBrowser || busy === `workspace-${activeAccount.id}`} sx={primaryDarkButtonSx}>
                  重新打开内置浏览器
                </Button>
              </Stack>
            </Stack>
          ) : (
            <SectionTitle title="账号中心" subtitle="添加账号后，右侧会显示对应平台创作者中心" />
          )}
        </Box>

        <Box sx={{ ...cardSx, p: 1, minHeight: { xs: 620, lg: "calc(100vh - 184px)" }, overflow: "hidden" }}>
          {embeddedBrowser && activeAccount?.id === embeddedBrowser.accountId ? (
            <Box sx={{ height: "100%", minHeight: { xs: 600, lg: "calc(100vh - 206px)" }, border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
              {createElement("webview", {
                src: embeddedBrowser.src,
                partition: embeddedBrowser.partition,
                allowpopups: "true",
                "data-account-webview": embeddedBrowser.accountId,
                style: { width: "100%", height: "100%", border: 0, display: "block" },
              })}
            </Box>
          ) : activeAccount ? (
            <Box sx={{ height: "100%", minHeight: 520, display: "grid", placeItems: "center", bgcolor: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: "8px", p: 2 }}>
              <Stack spacing={1.1} sx={{ alignItems: "center", textAlign: "center", maxWidth: 460 }}>
                <Box sx={{ width: 42, height: 42, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "#EFF6FF", color: "#1E40AF" }}>
                  <AccountCircleOutlinedIcon sx={{ fontSize: 22 }} />
                </Box>
                <Typography sx={{ fontSize: 18, fontWeight: 950, color: textPrimary }}>准备打开创作者中心</Typography>
                <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.65 }}>
                  账号中心只使用桌面版内置浏览器承载平台页面，不再额外启动外部浏览器窗口。
                </Typography>
                <Button onClick={() => onOpenWorkspace(activeAccount.id)} disabled={!canEmbedBrowser || busy === `workspace-${activeAccount.id}`} sx={primaryDarkButtonSx}>
                  {canEmbedBrowser ? "打开内置浏览器" : "请使用桌面版打开"}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box sx={{ minHeight: 520, display: "grid", placeItems: "center", bgcolor: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: "8px", p: 2 }}>
              <Empty text="左侧添加或选择账号后，这里会显示创作者中心。" />
            </Box>
          )}
        </Box>

      </Box>
    </Box>
  );
}

function AccountCreateMiniForm({
  busy,
  compact = false,
  onCreateAndOpen,
}: {
  busy: string | null;
  compact?: boolean;
  onCreateAndOpen: (input: Parameters<typeof createOpsAccount>[0]) => void;
}) {
  const [platform, setPlatform] = useState<OpsPlatform>("douyin");
  const platformName = platformLabels[platform];

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: compact ? "1fr" : { xs: "1fr", md: "180px 1fr auto" }, gap: 1, alignItems: "center" }}>
      <TextField select label="平台" size="small" value={platform} onChange={(event) => setPlatform(event.target.value as OpsPlatform)}>
        <MenuItem value="douyin">抖音</MenuItem>
        <MenuItem value="xiaohongshu">小红书</MenuItem>
        <MenuItem value="wechat_channels">视频号</MenuItem>
      </TextField>
      <Box sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", px: 1.2, py: 1, bgcolor: "#F8FAFC" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary }}>添加{platformName}账号</Typography>
        <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.5, mt: 0.25 }}>
          点击后会打开{platformName}创作者中心。扫码登录成功后，账号名称会同步回项目。
        </Typography>
      </Box>
      <Button
        variant="contained"
        disabled={busy === "create-account"}
        onClick={() => {
          onCreateAndOpen({ platform });
        }}
        sx={{ ...primaryDarkButtonSx, minHeight: 38 }}
      >
        添加并打开扫码
      </Button>
    </Box>
  );
}

function SimpleAutomationPanel({
  state,
  runtime,
  busy,
  onOpenAccounts,
  onCreateTask,
  onApprove,
  onExecute,
  onRunPublishing,
  onCreateAsset,
  onCreatePackage,
  onCreateFolderPackage,
  onGenerateDrafts,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  onOpenAccounts: () => void;
  onCreateTask: (draftId: string) => void;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onRunPublishing: (input: Parameters<typeof runOpsPublishingAgent>[0]) => void;
  onCreateAsset: (input: Parameters<typeof createOpsAsset>[0]) => void;
  onCreatePackage: (input: Parameters<typeof createOpsAsset>[0], accountIds: string[], scheduledAt?: string) => void;
  onCreateFolderPackage: (input: Parameters<typeof createPublishPackageFromFolder>[0]) => void;
  onGenerateDrafts: (assetId: string, accountIds?: string[]) => void;
}) {
  const executableTasks = state.tasks.filter((task) => task.status === "scheduled" || task.status === "pending_review");
  const latestTasks = state.tasks.slice(0, 8);
  const canRunPublishing = Boolean(state.accounts.length && state.assets.length && busy !== "publishing-agent");

  return (
    <Stack spacing={1.5}>
      <SocialAutoUploadIntegrationPanel
        state={state}
        runtime={runtime}
        onOpenAccounts={onOpenAccounts}
      />

      <AssetsPanel
        state={state}
        busy={busy}
        onCreate={onCreateAsset}
        onCreatePackage={onCreatePackage}
        onCreateFolderPackage={onCreateFolderPackage}
        onGenerateDrafts={onGenerateDrafts}
      />

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="自动化发布" subtitle="统一查看自动发布准备状态、草稿和执行任务" />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 1 }}>
          <MetricCard icon={<VideoLibraryOutlinedIcon />} label="作品素材" value={state.assets.length} helper="已保存发布包" />
          <MetricCard icon={<AutoAwesomeOutlinedIcon />} label="草稿" value={state.drafts.length} helper="按账号生成" />
          <MetricCard icon={<CalendarMonthOutlinedIcon />} label="待执行" value={executableTasks.length} helper="待审核/已排期" />
          <MetricCard icon={<TaskAltIcon />} label="待发布" value={state.tasks.filter((task) => task.status === "scheduled").length} helper={runtimeModeLabel(runtime?.publisherRunMode || "dry_run")} />
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}>
          <Button
            variant="contained"
            disabled={!canRunPublishing}
            onClick={() => onRunPublishing({ mode: "create_tasks", accountIds: state.accounts.map((account) => account.id), assetIds: state.assets.slice(0, 1).map((asset) => asset.id), objective: "为已接入账号生成自动化发布任务", confirmed: true })}
            sx={primaryDarkButtonSx}
          >
            运行自动发布
          </Button>
          <Button onClick={onOpenAccounts} sx={softButtonSx}>管理账号</Button>
        </Stack>
        {!state.assets.length && (
          <Alert severity="warning" sx={{ mt: 1.2, borderRadius: "8px" }}>
            <Typography sx={{ fontSize: 12, lineHeight: 1.6 }}>
              还没有发布包。先在上方上传视频和封面，或填写发布包文件夹路径生成定时任务。
            </Typography>
          </Alert>
        )}
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="发布任务" subtitle="自动化发布作品的排期和执行状态" />
        {latestTasks.length ? (
          <Stack spacing={1}>
            {latestTasks.map((task) => (
              <TaskActionCard key={task.id} task={task} state={state} busy={busy} onApprove={onApprove} onExecute={onExecute} />
            ))}
          </Stack>
        ) : (
          <Empty text="暂无发布任务。账号保存后，可以先生成草稿和自动化任务。" />
        )}
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="草稿" subtitle="可转为自动发布任务的内容草稿" />
        {state.drafts.length ? (
          <Stack spacing={0.8}>
            {state.drafts.slice(0, 8).map((draft) => (
              <Box key={draft.id} sx={{ ...itemCardSx, p: 1.2, display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.55 }}>
                    <PlatformChip platform={draft.platform} />
                    <StatusChip value={draft.readiness} />
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{draft.title}</Typography>
                </Box>
                <Button size="small" onClick={() => onCreateTask(draft.id)} sx={softButtonSx}>创建任务</Button>
              </Box>
            ))}
          </Stack>
        ) : (
          <Empty text="暂无草稿。" />
        )}
      </Box>
    </Stack>
  );
}

function QuickVideoPublishPanel({
  state,
  runtime,
  busy,
  onQuickPublish,
  onOpenAccounts,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  onQuickPublish: (input: Parameters<typeof createOpsAsset>[0], accountIds: string[]) => void;
  onOpenAccounts: () => void;
}) {
  const connectedAccounts = useMemo(
    () => state.accounts.filter((account) => account.status === "connected"),
    [state.accounts],
  );
  const sauSupported = runtime?.socialAutoUpload.supportedPlatforms || [];
  const [titleBase, setTitleBase] = useState("");
  const [descriptionBase, setDescriptionBase] = useState("");
  const [topics, setTopics] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLocalPath, setVideoLocalPath] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverLocalPath, setCoverLocalPath] = useState("");
  const [duration, setDuration] = useState(60);
  const [owner, setOwner] = useState("内容运营团队");
  const [uploading, setUploading] = useState<"video" | "cover" | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(connectedAccounts.map((account) => account.id));

  useEffect(() => {
    setSelectedAccountIds((current) => {
      const existing = current.filter((id) => connectedAccounts.some((account) => account.id === id));
      return existing.length ? existing : connectedAccounts.map((account) => account.id);
    });
  }, [connectedAccounts]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleAssetFile = async (kind: "video" | "cover", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(kind);
    try {
      const uploaded = await uploadOpsAssetFile(kind, file);
      if (kind === "video") {
        setVideoUrl(uploaded.fileUrl);
        setVideoLocalPath(uploaded.filePath);
        if (!titleBase.trim()) setTitleBase(file.name.replace(/\.[^.]+$/, ""));
      } else {
        setCoverUrl(uploaded.fileUrl);
        setCoverLocalPath(uploaded.filePath);
      }
      showToast(kind === "video" ? "视频已上传" : "封面已上传");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "文件上传失败");
    } finally {
      setUploading(null);
    }
  };

  const clearForm = () => {
    setTitleBase("");
    setDescriptionBase("");
    setTopics("");
    setVideoUrl("");
    setVideoLocalPath("");
    setCoverUrl("");
    setCoverLocalPath("");
  };

  const selectedConnectedAccounts = connectedAccounts.filter((account) => selectedAccountIds.includes(account.id));
  const unsupportedSelected = selectedConnectedAccounts.filter((account) => (
    runtime?.publisherRunMode === "social_auto_upload"
    && sauSupported.length > 0
    && !sauSupported.includes(account.platform)
  ));
  const input = {
    contentType: "video" as const,
    titleBase: titleBase.trim(),
    descriptionBase: descriptionBase.trim(),
    videoUrl: videoUrl || videoLocalPath,
    videoLocalPath,
    coverUrl: coverUrl || coverLocalPath,
    coverLocalPath,
    tags: splitTags(topics).map((tag) => tag.replace(/^#/, "")),
    durationSeconds: duration,
    owner,
    copyrightStatus: "owned" as const,
  };
  const canPublish = Boolean(
    input.titleBase
    && input.descriptionBase
    && input.videoUrl.trim()
    && input.coverUrl.trim()
    && selectedConnectedAccounts.length
    && busy !== "quick-publish"
    && !uploading,
  );

  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <SectionTitle
        title="视频一键发布"
        subtitle="上传视频、封面、话题和文案后，选择账号并立即创建多平台发布任务"
        action={<Button size="small" onClick={onOpenAccounts} sx={softButtonSx}>账号中心</Button>}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(360px, 0.9fr) 1.1fr" }, gap: 1.5 }}>
        <Stack spacing={1.1}>
          <TextField label="标题" size="small" value={titleBase} onChange={(event) => setTitleBase(event.target.value)} placeholder="这条视频发布时使用的基础标题" />
          <TextField label="文案" size="small" multiline minRows={4} value={descriptionBase} onChange={(event) => setDescriptionBase(event.target.value)} placeholder="正文、口播稿或发布描述" />
          <TextField label="三观话题 / 标签" size="small" value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="#创业日记 #日常 #观点" />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
            <TextField label="时长/秒" size="small" type="number" value={duration} onChange={(event) => setDuration(Math.max(1, Number(event.target.value || 1)))} />
            <TextField label="负责人" size="small" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button component="label" disabled={uploading === "video"} sx={softButtonSx}>
              {uploading === "video" ? "视频上传中" : "上传视频"}
              <input hidden type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" onChange={(event) => void handleAssetFile("video", event)} />
            </Button>
            <Button component="label" disabled={uploading === "cover"} sx={softButtonSx}>
              {uploading === "cover" ? "封面上传中" : "上传封面"}
              <input hidden type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void handleAssetFile("cover", event)} />
            </Button>
          </Stack>
          {(videoLocalPath || coverLocalPath) && (
            <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
              {videoLocalPath && <Typography sx={{ fontSize: 11, color: "#047857", wordBreak: "break-all" }}>视频：{compactPath(videoLocalPath)}</Typography>}
              {coverLocalPath && <Typography sx={{ fontSize: 11, color: "#047857", wordBreak: "break-all", mt: videoLocalPath ? 0.4 : 0 }}>封面：{compactPath(coverLocalPath)}</Typography>}
            </Box>
          )}
        </Stack>

        <Stack spacing={1.1}>
          <Box sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", p: 1, bgcolor: "#F8FAFC" }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.9, gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 950, color: textPrimary }}>目标账号 {selectedConnectedAccounts.length}/{connectedAccounts.length}</Typography>
              <Stack direction="row" spacing={0.6}>
                <Button size="small" onClick={() => setSelectedAccountIds(connectedAccounts.map((account) => account.id))} sx={softButtonSx}>全选</Button>
                <Button size="small" onClick={() => setSelectedAccountIds([])} sx={softButtonSx}>清空</Button>
              </Stack>
            </Stack>
            {connectedAccounts.length ? (
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
                {connectedAccounts.map((account) => {
                  const checked = selectedAccountIds.includes(account.id);
                  const unsupported = runtime?.publisherRunMode === "social_auto_upload" && sauSupported.length > 0 && !sauSupported.includes(account.platform);
                  return (
                    <Button
                      key={account.id}
                      size="small"
                      variant={checked ? "contained" : "outlined"}
                      onClick={() => toggleAccount(account.id)}
                      sx={checked ? primaryDarkButtonSx : softButtonSx}
                    >
                      {platformLabels[account.platform]} · {account.displayName}{unsupported ? " · 接管" : ""}
                    </Button>
                  );
                })}
              </Stack>
            ) : (
              <Empty text="暂无已连接账号。先到账号中心扫码登录。" />
            )}
          </Box>

          <Alert severity={unsupportedSelected.length ? "warning" : "info"} sx={{ borderRadius: "8px" }}>
            <Typography sx={{ fontSize: 12, lineHeight: 1.6 }}>
              当前发布模式：{runtimeModeLabel(runtime?.publisherRunMode || "dry_run")}。{unsupportedSelected.length ? ` ${unsupportedSelected.map((account) => platformLabels[account.platform]).join("、")} 暂不在 SAU 自动提交范围内，会生成任务并按当前后端能力处理。` : " 已连接账号会生成草稿、任务并立即执行。"}
            </Typography>
          </Alert>

          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            disabled={!canPublish}
            onClick={() => {
              onQuickPublish(input, selectedConnectedAccounts.map((account) => account.id));
              clearForm();
            }}
            sx={{ ...primaryDarkButtonSx, minHeight: 42 }}
          >
            {busy === "quick-publish" ? "发布中" : `一键发布到 ${selectedConnectedAccounts.length} 个账号`}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

function SocialAutoUploadIntegrationPanel({
  state,
  runtime,
  onOpenAccounts,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  onOpenAccounts: () => void;
}) {
  const sau = runtime?.socialAutoUpload;
  const installed = Boolean(sau?.available);
  const enabled = Boolean(sau?.enabled);
  const ready = Boolean(sau?.executionReady && runtime?.publisherRunMode === "social_auto_upload");
  const supportedLabels = (sau?.supportedPlatforms || []).map((platform) => platformLabels[platform]).join("、") || "抖音、小红书";
  const connectedAccounts = state.accounts.filter((account) => account.status === "connected");
  const statusItems = [
    { label: "本地引擎", value: installed ? "已安装" : "待安装", ready: installed, helper: "自动发布底层能力" },
    { label: "SAU 开关", value: enabled ? "已启用" : "未启用", ready: enabled, helper: "SOCIAL_AUTO_UPLOAD_ENABLED" },
    { label: "发布模式", value: runtimeModeLabel(runtime?.publisherRunMode || "dry_run"), ready, helper: runtimeSafetyCopy(runtime) },
    { label: "已接入平台", value: supportedLabels, ready: Boolean(sau?.supportedPlatforms.length), helper: socialAutoUploadSource.integratedScope },
  ];

  return (
    <Box sx={{ ...cardSx, p: { xs: 1.4, md: 2 } }}>
      <SectionTitle
        title="开源自动发布引擎"
        subtitle={`${socialAutoUploadSource.name} 已作为本机 sau CLI 发布引擎接入此窗口`}
        action={
          <Button
            component="a"
            href={socialAutoUploadSource.url}
            target="_blank"
            rel="noreferrer"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={softButtonSx}
          >
            GitHub
          </Button>
        }
      />
      <Box sx={{ display: "grid", gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.65 }}>
            自动发布会优先读取账号中心已经保存的登录态和独立浏览器档案；不需要在自动发布页再次扫码登录。抖音/小红书如果本机 sau cookie 可用会直接提交，否则回退到项目已登录浏览器档案准备上传。
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 0.8 }}>
            {statusItems.map((item) => (
              <Box key={item.label} sx={{ bgcolor: item.ready ? "#F0FDF4" : "#FFF7ED", border: `1px solid ${item.ready ? "#BBF7D0" : "#FED7AA"}`, borderRadius: "8px", p: 1 }}>
                <Stack direction="row" spacing={0.55} sx={{ alignItems: "center", mb: 0.45 }}>
                  {item.ready ? <DoneAllIcon sx={{ fontSize: 15, color: "#047857" }} /> : <TroubleshootIcon sx={{ fontSize: 15, color: "#C2410C" }} />}
                  <Typography sx={{ fontSize: 11, color: item.ready ? "#047857" : "#C2410C", fontWeight: 950 }}>{item.label}</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 950, lineHeight: 1.25 }}>{item.value}</Typography>
                <Typography sx={{ fontSize: 10.5, color: textMuted, lineHeight: 1.45, mt: 0.35 }}>{item.helper}</Typography>
              </Box>
            ))}
          </Box>
          {!state.accounts.length && (
            <Box sx={{ bgcolor: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", p: 1.15 }}>
              <Typography sx={{ fontSize: 12, color: "#1E40AF", fontWeight: 950 }}>窗口现在不再空白</Typography>
              <Typography sx={{ fontSize: 11.5, color: textSecondary, lineHeight: 1.6, mt: 0.35 }}>
                先添加账号并扫码登录。登录成功后，自动发布会直接读取项目中的账号名称、登录状态和独立浏览器档案。
              </Typography>
              <Button size="small" onClick={onOpenAccounts} sx={{ ...primaryDarkButtonSx, minHeight: 30, mt: 0.9, boxShadow: "none" }}>
                添加账号
              </Button>
            </Box>
          )}
          {state.accounts.length > 0 && (
            <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.15 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 0.8 }}>
                <Box>
                  <Typography sx={{ fontSize: 12, color: textPrimary, fontWeight: 950 }}>自动发布账号</Typography>
                  <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.5, mt: 0.2 }}>
                    这里读取账号中心已保存的登录账号。选择账号执行自动发布时，不再要求二次登录。
                  </Typography>
                </Box>
                {!connectedAccounts.length && (
                  <Button size="small" onClick={onOpenAccounts} sx={softButtonSx}>
                    添加并扫码登录
                  </Button>
                )}
              </Stack>
              <Stack spacing={0.75}>
                {connectedAccounts.map((account) => {
                  const accountName = sauAccountNameForDisplay(account, runtime);
                  const supportedBySau = Boolean(sau?.supportedPlatforms.includes(account.platform));
                  return (
                    <Box key={account.id} sx={{ bgcolor: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", p: 0.9 }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={0.55} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                            <PlatformChip platform={account.platform} />
                            <StatusChip value={account.sessionHealth} />
                            <Typography sx={{ fontSize: 12, color: textPrimary, fontWeight: 950 }}>{account.displayName}</Typography>
                          </Stack>
                          <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.35, wordBreak: "break-all" }}>
                            已保存账号：{accountName} · 登录档案：{compactPath(account.browserProfileDir)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
                          <StatusChip value={account.status} />
                          <StatusChip value={account.sessionHealth} />
                          <Chip
                            label={supportedBySau ? "可自动提交" : "已登录接管"}
                            size="small"
                            sx={{
                              height: 22,
                              borderRadius: "8px",
                              bgcolor: supportedBySau ? "#ECFDF5" : "#FFF7ED",
                              color: supportedBySau ? "#047857" : "#C2410C",
                              fontWeight: 900,
                              fontSize: 11,
                            }}
                          />
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}
      </Box>
    </Box>
  );
}

function SimpleDiagnosisPanel({
  state,
  busy,
  onOpenDiagnosis,
  onDiagnoseAccount,
}: {
  state: OpsState;
  busy: string | null;
  onOpenDiagnosis: (account?: OpsAccount) => void;
  onDiagnoseAccount: (account: OpsAccount) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="诊断窗口" subtitle="集中处理账号诊断和内容诊断" />
        <Button variant="contained" onClick={() => onOpenDiagnosis(state.accounts[0])} sx={primaryDarkButtonSx}>
          打开诊断窗口
        </Button>
      </Box>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="外部诊断技能" subtitle="只用于分析账号、内容、评论和趋势，不参与一键发布" />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 1 }}>
          {externalDiagnosisSkills.map((skill) => (
            <Box key={skill.name} sx={{ ...itemCardSx, p: 1.2 }}>
              <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 950 }}>{skill.name}</Typography>
              <Typography sx={{ fontSize: 11, color: "#1E40AF", fontWeight: 900, mt: 0.45 }}>{skill.focus}</Typography>
              <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.55, mt: 0.5 }}>{skill.use}</Typography>
              <Typography sx={{ fontSize: 10.5, color: "#94A3B8", lineHeight: 1.45, mt: 0.65, wordBreak: "break-all" }}>{skill.source}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 1 }}>
        {state.accounts.map((account) => (
          <Box key={account.id} sx={{ ...cardSx, p: 1.4 }}>
            <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.6 }}>
              <PlatformChip platform={account.platform} />
              <StatusChip value={account.status} />
            </Stack>
            <Typography sx={{ fontSize: 14, color: textPrimary, fontWeight: 900, mt: 0.85 }}>{account.displayName}</Typography>
            <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25 }}>{account.handle}</Typography>
            <Stack direction="row" spacing={0.7} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.7 }}>
              <Button size="small" onClick={() => onOpenDiagnosis(account)} sx={softButtonSx}>内容诊断</Button>
              <Button size="small" disabled={busy === `account-diagnose-${account.id}`} onClick={() => onDiagnoseAccount(account)} sx={primaryDarkButtonSx}>账号诊断</Button>
            </Stack>
          </Box>
        ))}
      </Box>
      {state.accountDiagnoses.length ? (
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="最近诊断" subtitle="账号诊断结果会在这里回流" />
          <Stack spacing={0.8}>
            {state.accountDiagnoses.slice(0, 6).map((report) => {
              const account = state.accounts.find((item) => item.id === report.accountId);
              return (
                <Box key={report.id} sx={{ ...itemCardSx, p: 1.2 }}>
                  <Typography sx={{ fontSize: 13, color: textPrimary, fontWeight: 900 }}>{account?.displayName || "未知账号"} · {report.grade}</Typography>
                  <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.35 }}>{report.summary}</Typography>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function Overview({
  state,
  metrics,
  runtime,
  busy,
  onOpenTasks,
  onOpenAccounts,
  onOpenAssets,
  onRunPublishing,
}: {
  state: OpsState;
  metrics: Record<string, number>;
  runtime: OpsRuntime | null;
  busy: string | null;
  onOpenTasks: () => void;
  onOpenAccounts: () => void;
  onOpenAssets: () => void;
  onRunPublishing: (input: Parameters<typeof runOpsPublishingAgent>[0]) => void;
}) {
  const latestTasks = state.tasks.slice(0, 5);
  return (
    <Stack spacing={2}>
      <MatrixPublishingPilot
        state={state}
        runtime={runtime}
        busy={busy}
        onOpenAccounts={onOpenAccounts}
        onOpenAssets={onOpenAssets}
        onOpenTasks={onOpenTasks}
        onRunPublishing={onRunPublishing}
      />
      <AutoPublishReadinessPanel
        state={state}
        runtime={runtime}
        onOpenAccounts={onOpenAccounts}
        onOpenAssets={onOpenAssets}
        onOpenTasks={onOpenTasks}
      />
      <XhhWorkflowPanel state={state} onOpenAccounts={onOpenAccounts} onOpenAssets={onOpenAssets} onOpenTasks={onOpenTasks} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<AccountCircleOutlinedIcon />} label="账号" value={metrics.accounts} helper="已添加账号" />
        <MetricCard icon={<VideoLibraryOutlinedIcon />} label="发布包" value={metrics.assets} helper="视频素材" />
        <MetricCard icon={<CalendarMonthOutlinedIcon />} label="已排期" value={metrics.scheduled} helper="待发布" tone={metrics.scheduled ? "info" : "neutral"} onClick={onOpenTasks} />
        <MetricCard icon={<TaskAltIcon />} label="已发布" value={metrics.published} helper="任务结果" tone="success" onClick={onOpenTasks} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="账号状态" subtitle="登录态和后台入口" />
          <Stack spacing={1}>
            {state.accounts.map((account) => (
              <AccountRow key={account.id} account={account} runtime={runtime} compact />
            ))}
          </Stack>
        </Box>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="最近任务" subtitle="排期和发布状态" action={<Button size="small" onClick={onOpenTasks}>查看全部</Button>} />
          {latestTasks.length ? (
            <Stack spacing={1}>
              {latestTasks.map((task) => (
                <TaskRow key={task.id} task={task} state={state} />
              ))}
            </Stack>
          ) : (
            <Empty text="暂无任务，先生成 Agent 排期。" action={<Button size="small" onClick={onOpenTasks}>进入发布任务</Button>} />
          )}
        </Box>
      </Box>
    </Stack>
  );
}

function MatrixPublishingPilot({
  state,
  runtime,
  busy,
  onOpenAccounts,
  onOpenAssets,
  onOpenTasks,
  onRunPublishing,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  onOpenAccounts: () => void;
  onOpenAssets: () => void;
  onOpenTasks: () => void;
  onRunPublishing: (input: Parameters<typeof runOpsPublishingAgent>[0]) => void;
}) {
  const autoUploadPlatforms = runtime?.socialAutoUpload.supportedPlatforms ?? [];
  const defaultAccountIds = useMemo(
    () => state.accounts.filter((account) => account.status !== "disabled").slice(0, 6).map((account) => account.id),
    [state.accounts],
  );
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(defaultAccountIds);
  const [assetId, setAssetId] = useState(state.assets[0]?.id || "");
  const [mode, setMode] = useState<PublishingAgentMode>("create_tasks");
  const [objective, setObjective] = useState("为选中账号生成一轮矩阵发布计划，按平台改写标题、正文和标签，并创建发布任务");

  useEffect(() => {
    setSelectedAccountIds((current) => {
      const existing = current.filter((id) => state.accounts.some((account) => account.id === id));
      return existing.length ? existing : defaultAccountIds;
    });
  }, [defaultAccountIds, state.accounts]);

  useEffect(() => {
    if (!assetId && state.assets[0]) {
      setAssetId(state.assets[0].id);
    }
  }, [assetId, state.assets]);

  const platformGroups = (["douyin", "xiaohongshu", "wechat_channels"] as OpsPlatform[]).map((platform) => ({
    platform,
    accounts: state.accounts.filter((account) => account.platform === platform && account.status !== "disabled"),
  }));
  const selectedAssetIds = assetId ? [assetId] : state.assets.slice(0, 1).map((asset) => asset.id);
  const runnable = selectedAccountIds.length > 0 && selectedAssetIds.length > 0 && busy !== "publishing-agent";

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <Box sx={{ ...cardSx, p: { xs: 1.4, md: 2 }, overflow: "hidden" }}>
      <SectionTitle
        title="矩阵发布驾驶舱"
        subtitle="选账号、选发布包，让 AI 按平台生成草稿、排期任务，并在 Social Auto Upload 模式下提交到本机 sau"
        action={
          <Chip
            label={runtime?.publisherRunMode === "social_auto_upload" ? "SAU 自动发布" : runtimeModeLabel(runtime?.publisherRunMode || "dry_run")}
            size="small"
            sx={{ height: 24, fontSize: 10, fontWeight: 950, ...runtimeModeSx(runtime?.publisherRunMode || "dry_run") }}
          />
        }
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.25fr 0.75fr" }, gap: 1.5 }}>
        <Box sx={{ display: "grid", gap: 1.2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, minmax(0, 1fr))" }, gap: 0.8 }}>
            {platformGroups.map((group) => (
              <Box key={group.platform} sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
                <Stack direction="row" spacing={0.7} sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
                  <PlatformChip platform={group.platform} />
                  {autoUploadPlatforms.includes(group.platform) && (
                    <Chip label="SAU" size="small" sx={{ height: 19, fontSize: 9, fontWeight: 950, bgcolor: "#ECFDF5", color: "#047857" }} />
                  )}
                </Stack>
                <Stack spacing={0.55}>
                  {group.accounts.length ? group.accounts.slice(0, 3).map((account) => {
                    const checked = selectedAccountIds.includes(account.id);
                    return (
                      <Button
                        key={account.id}
                        size="small"
                        onClick={() => toggleAccount(account.id)}
                        sx={{
                          justifyContent: "flex-start",
                          minHeight: 30,
                          px: 0.8,
                          borderRadius: "8px",
                          fontSize: 11,
                          fontWeight: 850,
                          color: checked ? "#1E40AF" : textSecondary,
                          bgcolor: checked ? "#EFF6FF" : "#fff",
                          border: checked ? "1px solid #93C5FD" : "1px solid #E2E8F0",
                          overflow: "hidden",
                        }}
                      >
                        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {account.displayName}
                        </Box>
                      </Button>
                    );
                  }) : (
                    <Button size="small" onClick={onOpenAccounts} sx={{ ...softButtonSx, justifyContent: "flex-start" }}>
                      添加账号
                    </Button>
                  )}
                </Stack>
              </Box>
            ))}
          </Box>
          <TextField
            label="AI 发布目标"
            size="small"
            multiline
            minRows={2}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
        </Box>
        <Box sx={{ display: "grid", gap: 1 }}>
          <TextField select label="发布包" size="small" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
            {state.assets.length ? state.assets.map((asset) => (
              <MenuItem key={asset.id} value={asset.id}>{asset.titleBase}</MenuItem>
            )) : (
              <MenuItem value="">暂无发布包</MenuItem>
            )}
          </TextField>
          <TextField select label="AI 执行模式" size="small" value={mode} onChange={(event) => setMode(event.target.value as PublishingAgentMode)}>
            <MenuItem value="plan_only">只生成计划</MenuItem>
            <MenuItem value="create_tasks">生成草稿和任务</MenuItem>
            <MenuItem value="approve_ready">自动审核可发布任务</MenuItem>
            <MenuItem value="execute_ready">执行已审核任务</MenuItem>
          </TextField>
          <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
            <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 900, mb: 0.45 }}>当前选择</Typography>
            <Typography sx={{ fontSize: 12, color: textPrimary, fontWeight: 850 }}>
              {selectedAccountIds.length} 个账号 · {selectedAssetIds.length} 个发布包 · {runtimeSafetyCopy(runtime)}
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75}>
            <Button size="small" onClick={onOpenAssets} sx={softButtonSx}>发布包</Button>
            <Button size="small" onClick={onOpenTasks} sx={softButtonSx}>任务队列</Button>
            <Button
              size="small"
              startIcon={busy === "publishing-agent" ? <CircularProgress size={14} /> : <AutoAwesomeOutlinedIcon sx={{ fontSize: 14 }} />}
              disabled={!runnable}
              onClick={() => onRunPublishing({ objective, accountIds: selectedAccountIds, assetIds: selectedAssetIds, mode, confirmed: mode === "execute_ready" })}
              sx={{ ...primaryDarkButtonSx, flex: 1, minHeight: 34 }}
            >
              AI 运行矩阵发布
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

function AutoPublishReadinessPanel({
  state,
  runtime,
  onOpenAccounts,
  onOpenAssets,
  onOpenTasks,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  onOpenAccounts: () => void;
  onOpenAssets: () => void;
  onOpenTasks: () => void;
}) {
  const connectedAccounts = state.accounts.filter((account) => account.status === "connected");
  const localVideoAssets = state.assets.filter((asset) => Boolean(asset.videoLocalPath || asset.videoUrl?.startsWith("/")));
  const scheduledTasks = state.tasks.filter((task) => task.status === "scheduled");
  const failedTasks = state.tasks.filter((task) => task.status === "failed");
  const readyChecks = [
    {
      label: "SAU 引擎可执行",
      ready: Boolean(runtime?.socialAutoUpload.executionReady),
      helper: runtime?.socialAutoUpload.executionReady ? "本地 sau CLI 已就绪" : runtime?.socialAutoUpload.missingReason || "当前仍是 dry-run 或 SAU 未启用",
      action: "任务队列",
      onClick: onOpenTasks,
    },
    {
      label: "至少 1 个账号已连接",
      ready: connectedAccounts.length > 0,
      helper: connectedAccounts.length ? `${connectedAccounts.length} 个账号可参与矩阵发布` : "先添加账号并完成登录态检查",
      action: "账号中心",
      onClick: onOpenAccounts,
    },
    {
      label: "存在本地视频发布包",
      ready: localVideoAssets.length > 0,
      helper: localVideoAssets.length ? `${localVideoAssets.length} 个发布包可自动上传` : "SAU 真实上传需要本地视频文件",
      action: "发布包",
      onClick: onOpenAssets,
    },
    {
      label: "已有排期任务",
      ready: scheduledTasks.length > 0,
      helper: scheduledTasks.length ? `${scheduledTasks.length} 个任务等待执行` : "先由 AI 生成草稿和任务",
      action: "任务队列",
      onClick: onOpenTasks,
    },
  ];
  const readyCount = readyChecks.filter((item) => item.ready).length;
  const score = Math.round((readyCount / readyChecks.length) * 100);
  const blocking = readyChecks.find((item) => !item.ready);
  const tone = score >= 75
    ? { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" }
    : score >= 50
      ? { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" }
      : { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };

  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <SectionTitle
        title="自动发布准备度"
        subtitle="把第一次自动发布拆成可执行清单，优先消除阻塞"
        action={
          <Chip
            label={`${score}% ready`}
            size="small"
            sx={{ height: 24, fontSize: 10, fontWeight: 950, bgcolor: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
          />
        }
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "220px 1fr" }, gap: 1.4, alignItems: "stretch" }}>
        <Box sx={{ bgcolor: tone.bg, border: `1px solid ${tone.border}`, borderRadius: "8px", p: 1.4 }}>
          <Typography sx={{ fontSize: 11, color: tone.color, fontWeight: 900 }}>下一步</Typography>
          <Typography sx={{ fontSize: 14, color: textPrimary, fontWeight: 950, lineHeight: 1.35, mt: 0.4 }}>
            {blocking ? blocking.label : failedTasks.length ? "处理失败任务" : "可以进入执行队列"}
          </Typography>
          <Typography sx={{ fontSize: 11, color: textSecondary, lineHeight: 1.55, mt: 0.5 }}>
            {blocking ? blocking.helper : failedTasks.length ? `${failedTasks.length} 个失败任务需要看日志` : "准备度已满，继续审核和执行任务。"}
          </Typography>
          <Button size="small" onClick={blocking?.onClick || onOpenTasks} sx={{ ...primaryDarkButtonSx, minHeight: 30, mt: 1, boxShadow: "none" }}>
            {blocking?.action || "查看任务"}
          </Button>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 0.8 }}>
          {readyChecks.map((check) => (
            <Box key={check.label} sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", p: 1, bgcolor: check.ready ? "#FBFDFB" : "#fff" }}>
              <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.55 }}>
                <Chip
                  label={check.ready ? "OK" : "待处理"}
                  size="small"
                  sx={{ height: 20, fontSize: 9, fontWeight: 950, bgcolor: check.ready ? "#ECFDF5" : "#FFF7ED", color: check.ready ? "#047857" : "#C2410C" }}
                />
                <Typography sx={{ fontSize: 12, color: textPrimary, fontWeight: 900, lineHeight: 1.25 }}>{check.label}</Typography>
              </Stack>
              <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.5, minHeight: 34 }}>{check.helper}</Typography>
              {!check.ready && (
                <Button size="small" onClick={check.onClick} sx={{ ...softButtonSx, minHeight: 26, mt: 0.7 }}>
                  {check.action}
                </Button>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function XhhWorkflowPanel({
  state,
  onOpenAccounts,
  onOpenAssets,
  onOpenTasks,
}: {
  state: OpsState;
  onOpenAccounts: () => void;
  onOpenAssets: () => void;
  onOpenTasks: () => void;
}) {
  const contentTypeCounts = (Object.keys(contentTypeMeta) as DispatchContentType[]).map((type) => ({
    type,
    count: state.assets.filter((asset) => (asset.contentType || "video") === type).length,
  }));
  const failedCount = state.tasks.filter((task) => task.status === "failed").length;
  const manualCount = state.tasks.filter((task) => task.status === "manual_takeover").length;
  const unreadCount = state.directMessageAlerts.filter((alert) => alert.status === "unread").length;
  const items = [
    { title: "内容编辑器", value: state.assets.length, helper: "标题/正文/封面/标签", action: "去编辑", onClick: onOpenAssets },
    { title: "账号选择器", value: state.accounts.length, helper: "按平台归类账号", action: "账号中心", onClick: onOpenAccounts },
    { title: "批量分发", value: state.tasks.filter((task) => task.status === "scheduled").length, helper: "排期后统一执行", action: "任务队列", onClick: onOpenTasks },
    { title: "失败回流", value: failedCount + manualCount + unreadCount, helper: "失败/接管/私信提醒", action: "查看记录", onClick: onOpenTasks },
  ];

  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <SectionTitle title="小火花模式融合" subtitle="提炼本地小火花的工作流：内容类型、账号选择、批量分发、记录回流" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1 }}>
        {items.map((item) => (
          <Box key={item.title} sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.15 }}>
            <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 900 }}>{item.title}</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 950, color: textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{item.value}</Typography>
            <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.45, minHeight: 30 }}>{item.helper}</Typography>
            <Button size="small" onClick={item.onClick} sx={{ ...softButtonSx, mt: 0.8, minHeight: 28 }}>{item.action}</Button>
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, mt: 1 }}>
        {contentTypeCounts.map((item) => (
          <Chip
            key={item.type}
            label={`${contentTypeMeta[item.type].label} ${item.count}`}
            size="small"
            sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: contentTypeMeta[item.type].bg, color: contentTypeMeta[item.type].color }}
          />
        ))}
      </Stack>
    </Box>
  );
}

function CreatorCoachPanel({
  state,
  busy,
  patterns,
  onGenerate,
}: {
  state: OpsState;
  busy: string | null;
  patterns: ContentPattern[];
  onGenerate: (accountId: string, input: { focusGoal?: string; ideaCount?: number }) => void;
}) {
  const [preferredAccountId, setPreferredAccountId] = useState(state.accounts[0]?.id || "");
  const [focusGoal, setFocusGoal] = useState("线索");
  const account = state.accounts.find((item) => item.id === preferredAccountId) || state.accounts[0];
  const reports = state.creatorCoachReports || [];
  const activeReport = account ? reports.find((report) => report.accountId === account.id) : undefined;
  const accountPatterns = account ? patterns.filter((pattern) => pattern.suitablePlatforms.includes(account.platform)) : patterns;
  const ideaCount = reports.reduce((sum, report) => sum + report.ideas.length, 0);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<AccountCircleOutlinedIcon />} label="可分析账号" value={state.accounts.length} />
        <MetricCard icon={<BookmarkAddedOutlinedIcon />} label="内容打法" value={patterns.length} />
        <MetricCard icon={<AutoAwesomeOutlinedIcon />} label="教练报告" value={reports.length} />
        <MetricCard icon={<TaskAltIcon />} label="推荐选题" value={ideaCount} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.85fr 1.15fr" }, gap: 2 }}>
        <Stack spacing={2}>
          <Box sx={{ ...cardSx, p: 2 }}>
            <SectionTitle title="创作教练" subtitle="账号画像、内容打法和下一条选题" />
            <Stack spacing={1.2}>
              <TextField select size="small" label="账号" value={account?.id || ""} onChange={(event) => setPreferredAccountId(event.target.value)}>
                {state.accounts.map((item) => (
                  <MenuItem key={item.id} value={item.id}>{item.displayName}</MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="目标" value={focusGoal} onChange={(event) => setFocusGoal(event.target.value)}>
                {["线索", "互动", "转化", "信任", "搜索"].map((goal) => (
                  <MenuItem key={goal} value={goal}>{goal}</MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
                disabled={!account || busy === `coach-${account?.id}`}
                onClick={() => account && onGenerate(account.id, { focusGoal, ideaCount: 5 })}
                sx={primaryDarkButtonSx}
              >
                生成教练建议
              </Button>
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 2 }}>
            <SectionTitle title="内容模式库" subtitle={`${accountPatterns.length} 个适配打法`} />
            <Stack spacing={1}>
              {accountPatterns.slice(0, 6).map((pattern) => (
                <Box key={pattern.key} sx={{ borderBottom: "1px solid #eef2f7", pb: 1, "&:last-child": { borderBottom: 0, pb: 0 } }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                    <Chip label={pattern.goal} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#eef2ff", color: "#4338ca" }} />
                    <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary }}>{pattern.title}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.35, lineHeight: 1.55 }}>{pattern.bestFor}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={2}>
          {activeReport ? (
            <>
              <Box sx={{ ...cardSx, p: 2 }}>
                <SectionTitle
                  title="账号画像"
                  subtitle={`${platformLabels[activeReport.platform]} · ${formatTime(activeReport.createdAt)}`}
                  action={<Chip label={`${activeReport.profile.readinessScore} 分`} size="small" sx={{ height: 24, fontSize: 11, fontWeight: 950, bgcolor: "#ecfdf5", color: "#047857" }} />}
                />
                <Typography sx={{ fontSize: 14, color: textPrimary, lineHeight: 1.65, fontWeight: 650 }}>{activeReport.profile.summary}</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.2, mt: 1.5 }}>
                  <CoachList title="优势" items={activeReport.profile.strengths} />
                  <CoachList title="短板" items={activeReport.profile.weaknesses} />
                  <CoachList title="边界" items={activeReport.profile.constraints} />
                  <CoachList title="下一步" items={activeReport.nextActions} />
                </Box>
              </Box>

              <Box sx={{ ...cardSx, p: 2 }}>
                <SectionTitle title="下一条选题" subtitle={`${activeReport.ideas.length} 条候选`} />
                <Stack spacing={1}>
                  {activeReport.ideas.map((idea) => (
                    <Box key={idea.id} sx={{ ...itemCardSx, p: 1.35 }}>
                      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                            <PlatformChip platform={idea.platform} />
                            <Chip label={idea.goal} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#f0f9ff", color: "#0369a1" }} />
                          </Stack>
                          <Typography sx={{ fontSize: 15, fontWeight: 950, color: textPrimary, mt: 0.7, lineHeight: 1.35 }}>{idea.title}</Typography>
                          <Typography sx={{ fontSize: 12, color: textSecondary, mt: 0.45, lineHeight: 1.55 }}>{idea.hook}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 18, fontWeight: 950, color: idea.score >= 75 ? "#047857" : "#c2410c", fontVariantNumeric: "tabular-nums" }}>{idea.score}</Typography>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.55 }}>{idea.reason}</Typography>
                      <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap", rowGap: 0.6, mt: 1 }}>
                        {idea.tags.map((tag) => (
                          <Chip key={tag} label={tag} size="small" sx={{ height: 21, fontSize: 10, bgcolor: "#f8fafc" }} />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          ) : (
            <Box sx={{ ...cardSx, p: 2 }}>
              <SectionTitle title="账号画像" subtitle="先选择账号生成一份教练建议" />
              <Empty text="暂无创作教练报告。" />
            </Box>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

function CoachList({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", p: 1.2 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 950, color: textPrimary, mb: 0.7 }}>{title}</Typography>
      <Stack spacing={0.6}>
        {items.length ? items.map((item) => (
          <Typography key={item} sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.45 }}>• {item}</Typography>
        )) : <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>暂无</Typography>}
      </Stack>
    </Box>
  );
}

const viralTrackOptions = [
  { value: "account_growth", label: "账号增长" },
  { value: "content_ideas", label: "内容灵感" },
  { value: "case_study", label: "案例复盘" },
  { value: "conversion", label: "转化承接" },
];

const viralSourceLabels: Record<ViralContentSource, string> = {
  public_research: "公开研究",
  manual: "人工录入",
  platform_observation: "平台观察",
  account_data: "账号数据",
};

function ViralContentPanel({
  state,
  busy,
  onSeed,
  onCreate,
  onConvert,
}: {
  state: OpsState;
  busy: string | null;
  onSeed: (force: boolean) => void;
  onCreate: (input: Parameters<typeof createViralContent>[0]) => void;
  onConvert: (itemId: string, createDrafts: boolean) => void;
}) {
  const [platform, setPlatform] = useState<"all" | OpsPlatform>("all");
  const [track, setTrack] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [newPlatform, setNewPlatform] = useState<OpsPlatform>("douyin");
  const [newTrack, setNewTrack] = useState("hospitality_design");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [hotScore, setHotScore] = useState(82);
  const [playCount, setPlayCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [hook, setHook] = useState("");
  const [structure, setStructure] = useState("");
  const [tags, setTags] = useState("");
  const [adaptationTitle, setAdaptationTitle] = useState("");
  const [adaptationScript, setAdaptationScript] = useState("");

  const items = state.viralContentItems || [];
  const filtered = items.filter((item) => {
    if (platform !== "all" && item.platform !== platform) return false;
    if (track !== "all" && item.track !== track) return false;
    const text = `${item.title} ${item.hook} ${item.adaptationTitle} ${item.tags.join(" ")}`.toLowerCase();
    return keyword.trim() ? text.includes(keyword.trim().toLowerCase()) : true;
  });
  const douyinCount = items.filter((item) => item.platform === "douyin").length;
  const channelsCount = items.filter((item) => item.platform === "wechat_channels").length;
  const avgScore = items.length ? Math.round(items.reduce((sum, item) => sum + item.hotScore, 0) / items.length) : 0;

  const submit = () => {
    onCreate({
      platform: newPlatform,
      track: newTrack,
      title,
      sourceUrl,
      sourceType: sourceUrl.trim() ? "platform_observation" : "manual",
      hotScore,
      playCount,
      likeCount,
      commentCount,
      shareCount,
      saveCount,
      hook,
      structure: splitLines(structure),
      tags: splitTags(tags),
      adaptationTitle: adaptationTitle || title,
      adaptationScript,
      riskNotes: ["只复用结构，不搬运原视频素材；客户案例公开前确认授权。"],
    });
    setTitle("");
    setSourceUrl("");
    setHook("");
    setStructure("");
    setTags("");
    setAdaptationTitle("");
    setAdaptationScript("");
    setPlayCount(0);
    setLikeCount(0);
    setCommentCount(0);
    setShareCount(0);
    setSaveCount(0);
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<AutoAwesomeOutlinedIcon />} label="样本总数" value={items.length} helper="公开样本 + 人工录入" />
        <MetricCard icon={<VideoLibraryOutlinedIcon />} label="抖音样本" value={douyinCount} helper="推荐/搜索结构" />
        <MetricCard icon={<MarkEmailUnreadOutlinedIcon />} label="视频号样本" value={channelsCount} helper="转发/私域结构" />
        <MetricCard icon={<TaskAltIcon />} label="平均热度" value={avgScore} helper="结构复用优先级" />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "420px 1fr" }, gap: 2 }}>
        <Stack spacing={2}>
          <Box sx={{ ...cardSx, p: 2 }}>
            <SectionTitle
              title="爆款内容库"
              subtitle="沉淀抖音和视频号的可复用结构，避免直接搬运素材"
              action={<Button size="small" onClick={() => onSeed(false)} disabled={busy === "viral-seed"} sx={softButtonSx}>补齐公开样本</Button>}
            />
            <Stack spacing={1.2}>
              <TextField select size="small" label="平台筛选" value={platform} onChange={(event) => setPlatform(event.target.value as "all" | OpsPlatform)}>
                <MenuItem value="all">全部平台</MenuItem>
                <MenuItem value="douyin">抖音</MenuItem>
                <MenuItem value="wechat_channels">视频号</MenuItem>
              </TextField>
              <TextField select size="small" label="赛道筛选" value={track} onChange={(event) => setTrack(event.target.value)}>
                <MenuItem value="all">全部赛道</MenuItem>
                {viralTrackOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="关键词" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="房型、前台、预算、平面图" />
              <Alert severity="info" sx={{ borderRadius: "8px", fontSize: 12 }}>
                当前库记录的是标题结构、开头、互动信号和改编方案；平台链接只做来源留档，不复制原视频。
              </Alert>
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 2 }}>
            <SectionTitle title="手动入库" subtitle="看到平台爆款后，把链接和拆解结论录进自己的库" />
            <Stack spacing={1.2}>
              <TextField select size="small" label="平台" value={newPlatform} onChange={(event) => setNewPlatform(event.target.value as OpsPlatform)}>
                <MenuItem value="douyin">抖音</MenuItem>
                <MenuItem value="wechat_channels">视频号</MenuItem>
              </TextField>
              <TextField select size="small" label="赛道" value={newTrack} onChange={(event) => setNewTrack(event.target.value)}>
                {viralTrackOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="爆款标题/选题" value={title} onChange={(event) => setTitle(event.target.value)} />
              <TextField size="small" label="来源链接，可选" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <TextField size="small" type="number" label="热度分" value={hotScore} onChange={(event) => setHotScore(Number(event.target.value || 0))} />
                <TextField size="small" type="number" label="播放" value={playCount} onChange={(event) => setPlayCount(Number(event.target.value || 0))} />
                <TextField size="small" type="number" label="点赞" value={likeCount} onChange={(event) => setLikeCount(Number(event.target.value || 0))} />
                <TextField size="small" type="number" label="评论" value={commentCount} onChange={(event) => setCommentCount(Number(event.target.value || 0))} />
                <TextField size="small" type="number" label="转发" value={shareCount} onChange={(event) => setShareCount(Number(event.target.value || 0))} />
                <TextField size="small" type="number" label="收藏" value={saveCount} onChange={(event) => setSaveCount(Number(event.target.value || 0))} />
              </Box>
              <TextField size="small" multiline minRows={2} label="前 3 秒/开头" value={hook} onChange={(event) => setHook(event.target.value)} />
              <TextField size="small" multiline minRows={3} label="结构拆解，每行一步" value={structure} onChange={(event) => setStructure(event.target.value)} />
              <TextField size="small" label="标签" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="选题,爆款结构,转化承接" />
              <TextField size="small" label="改编标题" value={adaptationTitle} onChange={(event) => setAdaptationTitle(event.target.value)} />
              <TextField size="small" multiline minRows={3} label="改编脚本" value={adaptationScript} onChange={(event) => setAdaptationScript(event.target.value)} />
              <Button variant="contained" disabled={!title.trim() || busy === "viral-create"} onClick={submit} sx={primaryDarkButtonSx}>
                存入爆款库
              </Button>
            </Stack>
          </Box>
        </Stack>

        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="样本拆解" subtitle={`${filtered.length} 条可复用样本`} />
          {filtered.length ? (
            <Stack spacing={1.2}>
              {filtered.map((item) => (
                <ViralContentCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onConvert={(createDrafts) => onConvert(item.id, createDrafts)}
                />
              ))}
            </Stack>
          ) : (
            <Empty text="暂无匹配样本，先补齐公开样本或手动录入平台观察。" />
          )}
        </Box>
      </Box>
    </Stack>
  );
}

function ViralContentCard({ item, busy, onConvert }: { item: ViralContentItem; busy: string | null; onConvert: (createDrafts: boolean) => void }) {
  const trackLabel = viralTrackOptions.find((option) => option.value === item.track)?.label || item.track;
  return (
    <Box sx={{ ...itemCardSx, p: 1.45 }}>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.65} sx={{ flexWrap: "wrap", rowGap: 0.65, alignItems: "center" }}>
            <PlatformChip platform={item.platform} />
            <Chip label={trackLabel} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#EFF6FF", color: "#1D4ED8" }} />
            <Chip label={viralSourceLabels[item.sourceType]} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#F8FAFC", color: textMuted }} />
          </Stack>
          <Typography sx={{ fontSize: 15, fontWeight: 950, color: textPrimary, mt: 0.7, lineHeight: 1.35 }}>{item.title}</Typography>
          <Typography sx={{ fontSize: 12, color: textSecondary, mt: 0.45, lineHeight: 1.55 }}>{item.hook || "待补充开头拆解"}</Typography>
        </Box>
        <Box sx={{ minWidth: 44, textAlign: "right" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 950, color: item.hotScore >= 90 ? "#047857" : "#1D4ED8", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{item.hotScore}</Typography>
          <Typography sx={{ fontSize: 10, color: textMuted, mt: 0.2 }}>热度分</Typography>
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }, gap: 0.8, mt: 1.1 }}>
        <MiniStat label="播放" value={item.playCount} />
        <MiniStat label="点赞" value={item.likeCount} />
        <MiniStat label="评论" value={item.commentCount} />
        <MiniStat label="转发" value={item.shareCount} />
        <MiniStat label="收藏" value={item.saveCount} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1, mt: 1.1 }}>
        <ListBlock title="结构" items={item.structure} />
        <ListBlock title="可复用角度" items={item.reusableAngles} />
        <ListBlock title="评论信号" items={item.commentSignals} />
        <ListBlock title="风险" items={item.riskNotes} />
      </Box>

      {item.adaptationScript && (
        <Box sx={{ mt: 1.1, bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: textPrimary }}>{item.adaptationTitle || "改编方案"}</Typography>
          <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.6, mt: 0.35 }}>{item.adaptationScript}</Typography>
        </Box>
      )}

      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, mt: 1.1, alignItems: "center" }}>
        {item.tags.slice(0, 8).map((tag) => <Chip key={tag} label={tag} size="small" sx={{ height: 22, fontSize: 10 }} />)}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => onConvert(false)} disabled={busy === `viral-asset-${item.id}`} sx={softButtonSx}>转成素材</Button>
        <Button size="small" onClick={() => onConvert(true)} disabled={busy === `viral-asset-${item.id}`} sx={primaryDarkButtonSx}>生成草稿</Button>
      </Stack>
    </Box>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 0.8 }}>
      <Typography sx={{ fontSize: 10.5, color: textMuted, fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ fontSize: 15, color: textPrimary, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{formatMetric(value)}</Typography>
    </Box>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ bgcolor: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 950, color: textPrimary, mb: 0.55 }}>{title}</Typography>
      <Stack spacing={0.35}>
        {items.length ? items.slice(0, 4).map((item) => (
          <Typography key={item} sx={{ fontSize: 11.5, color: textSecondary, lineHeight: 1.45 }}>• {item}</Typography>
        )) : <Typography sx={{ fontSize: 11.5, color: "#94A3B8" }}>待补充</Typography>}
      </Stack>
    </Box>
  );
}

function MetricCollectorsPanel({
  state,
  busy,
  onCollect,
  onDiagnoseAccount,
}: {
  state: OpsState;
  busy: string | null;
  onCollect: (account: OpsAccount, source: MetricCollectorSource) => void;
  onDiagnoseAccount: (account: OpsAccount) => void;
}) {
  const supportedAccounts = state.accounts.filter((account) => account.platform === "douyin" || account.platform === "wechat_channels");
  const recentJobs = state.metricCollectionJobs.slice(0, 8);
  const latestJobByAccount = new Map<string, MetricCollectionJob>();
  state.metricCollectionJobs.forEach((job) => {
    if (!latestJobByAccount.has(job.accountId)) latestJobByAccount.set(job.accountId, job);
  });
  const latestMetricByAccount = new Map<string, MetricSnapshot>();
  state.metrics.forEach((metric) => {
    if (!latestMetricByAccount.has(metric.accountId)) latestMetricByAccount.set(metric.accountId, metric);
  });

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<AccountCircleOutlinedIcon />} label="可采集账号" value={supportedAccounts.length} />
        <MetricCard icon={<RefreshIcon />} label="采集任务" value={state.metricCollectionJobs.length} />
        <MetricCard icon={<TaskAltIcon />} label="成功任务" value={state.metricCollectionJobs.filter((job) => job.status === "succeeded").length} />
        <MetricCard icon={<TroubleshootIcon />} label="可诊断快照" value={state.metrics.filter((metric) => metric.platform === "douyin" || metric.platform === "wechat_channels").length} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(520px, 1fr) minmax(420px, 0.85fr)" }, gap: 2, minWidth: 0 }}>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="账号采集任务" subtitle="先用模拟采集打通链路，后续接入独立浏览器和官方接口适配器" />
          <Stack spacing={1}>
            {supportedAccounts.map((account) => {
              const latestJob = latestJobByAccount.get(account.id);
              const latestMetric = latestMetricByAccount.get(account.id);
              return (
                <Box key={account.id} sx={{ ...itemCardSx, p: 1.35 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                        <PlatformChip platform={account.platform} />
                        <StatusChip value={account.status} />
                        <StatusChip value={account.sessionHealth} />
                        {latestJob && <StatusChip value={latestJob.status} />}
                      </Stack>
                      <Typography sx={{ fontSize: 14, fontWeight: 900, color: textPrimary, mt: 0.65 }}>{account.displayName}</Typography>
                      <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>
                        {latestMetric ? `最近快照 ${formatTime(latestMetric.capturedAt)} · 播放 ${formatMetric(latestMetric.plays)}` : "暂无指标快照"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.75 }}>
                      <Button size="small" onClick={() => onCollect(account, "simulated")} disabled={busy === `collect-${account.id}-simulated`}>
                        模拟采集
                      </Button>
                      <Button size="small" onClick={() => onCollect(account, account.authType === "oauth" ? "official_api" : "browser_session")} disabled={busy?.startsWith(`collect-${account.id}`)}>
                        真实适配器
                      </Button>
                      <Button size="small" startIcon={<TroubleshootIcon sx={{ fontSize: 14 }} />} onClick={() => onDiagnoseAccount(account)} disabled={busy === `account-diagnose-${account.id}`}>
                        账号诊断
                      </Button>
                    </Stack>
                  </Box>
                  {latestJob ? (
                    <Typography sx={{ fontSize: 11, color: latestJob.status === "failed" || latestJob.status === "needs_login" ? "#b91c1c" : "#94a3b8", mt: 0.8 }}>
                      {formatTime(latestJob.updatedAt)} · {latestJob.logs[0]?.message || latestJob.errorMessage || "采集任务已记录"}
                    </Typography>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        </Box>

        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="最近采集记录" subtitle="任务日志不会保存密码、Cookie、私信正文或联系人" />
          <Stack spacing={0.9}>
            {recentJobs.length ? recentJobs.map((job) => (
              <MetricCollectionJobCard key={job.id} job={job} state={state} />
            )) : <Empty text="暂无采集任务，先对抖音或视频号账号执行一次模拟采集。" />}
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}

function MetricCollectionJobCard({ job, state }: { job: MetricCollectionJob; state: OpsState }) {
  const account = state.accounts.find((item) => item.id === job.accountId);
  return (
    <Box sx={{ ...itemCardSx, p: 1.1 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
        <PlatformChip platform={job.platform} />
        <StatusChip value={job.source} />
        <StatusChip value={job.status} />
      </Stack>
      <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, mt: 0.65 }}>{account?.displayName || "未知账号"}</Typography>
      <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25 }}>
        {formatTime(job.updatedAt)} · {job.resultMetricId ? `快照 ${job.resultMetricId.slice(0, 8)}` : job.errorMessage || "未生成快照"}
      </Typography>
      {job.logs[0] && <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: 0.45 }}>{job.logs[0].message}</Typography>}
    </Box>
  );
}

function DirectMessagesPanel({
  state,
  busy,
  onCheck,
  onToggle,
  onSource,
  onTestEvent,
  onAcknowledge,
  onOpenWorkspace,
}: {
  state: OpsState;
  busy: string | null;
  onCheck: (accountIds?: string[]) => void;
  onToggle: (monitor: DirectMessageMonitor) => void;
  onSource: (monitor: DirectMessageMonitor, source: DirectMessageSource) => void;
  onTestEvent: (monitor: DirectMessageMonitor) => void;
  onAcknowledge: (alert: DirectMessageAlert) => void;
  onOpenWorkspace: (id: string) => void;
}) {
  const supportedAccounts = state.accounts.filter((account) => account.platform === "douyin" || account.platform === "wechat_channels");
  const monitorsByAccount = new Map(state.directMessageMonitors.map((monitor) => [monitor.accountId, monitor]));
  const unreadAlerts = state.directMessageAlerts.filter((alert) => alert.status === "unread");
  const handledAlerts = state.directMessageAlerts.filter((alert) => alert.status === "acknowledged").slice(0, 5);
  const totalUnread = state.directMessageMonitors.reduce((sum, monitor) => sum + monitor.unreadCount, 0);
  const activeCount = state.directMessageMonitors.filter((monitor) => monitor.status === "active").length;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<MarkEmailUnreadOutlinedIcon />} label="未读私信" value={totalUnread} />
        <MetricCard icon={<NotificationsActiveOutlinedIcon />} label="未处理提醒" value={unreadAlerts.length} />
        <MetricCard icon={<AccountCircleOutlinedIcon />} label="监控账号" value={supportedAccounts.length} />
        <MetricCard icon={<TaskAltIcon />} label="监控中" value={activeCount} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(420px, 1fr) minmax(420px, 1fr)" }, gap: 2, minWidth: 0 }}>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle
            title="私信监控"
            subtitle="抖音和视频号账号的未读提醒"
            action={
              <Button size="small" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />} onClick={() => onCheck()} disabled={busy === "dm-check"}>
                检测一次
              </Button>
            }
          />
          <Stack spacing={1}>
            {supportedAccounts.length ? supportedAccounts.map((account) => {
              const monitor = monitorsByAccount.get(account.id);
              if (!monitor) return <Empty key={account.id} text={`${account.displayName} 的私信监控尚未初始化，刷新后会自动创建。`} />;
              return (
                <Box key={monitor.id} sx={{ ...itemCardSx, p: 1.4 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.2, alignItems: "flex-start" }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                        <PlatformChip platform={account.platform} />
                        <StatusChip value={monitor.status} />
                        <StatusChip value={monitor.source} />
                        {monitor.unreadCount > 0 && <Chip label={`${monitor.unreadCount} 未读`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#fef2f2", color: "#dc2626" }} />}
                      </Stack>
                      <Typography sx={{ fontSize: 14, fontWeight: 900, color: textPrimary, mt: 0.8 }}>{account.displayName}</Typography>
                      <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>
                        {account.handle} · {monitor.lastCheckedAt ? `${formatTime(monitor.lastCheckedAt)} 检测` : "尚未检测"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.75 }}>
                      <Button size="small" onClick={() => onCheck([account.id])} disabled={busy === "dm-check"}>检测</Button>
                      <Button size="small" onClick={() => onToggle(monitor)} disabled={busy === `dm-toggle-${monitor.accountId}`}>
                        {monitor.enabled ? "暂停" : "开启"}
                      </Button>
                      <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />} onClick={() => onOpenWorkspace(account.id)} disabled={busy === `workspace-${account.id}`}>
                        账号浏览器
                      </Button>
                    </Stack>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "170px 1fr" }, gap: 1, mt: 1.2 }}>
                    <TextField
                      select
                      size="small"
                      label="接入来源"
                      value={monitor.source}
                      onChange={(event) => onSource(monitor, event.target.value as DirectMessageSource)}
                      disabled={busy === `dm-source-${monitor.accountId}`}
                    >
                      <MenuItem value="browser_session">独立浏览器</MenuItem>
                      <MenuItem value="official_api">官方接口</MenuItem>
                      <MenuItem value="webhook">Webhook</MenuItem>
                      <MenuItem value="manual">人工记录</MenuItem>
                    </TextField>
                    <Button
                      size="small"
                      startIcon={<NotificationsActiveOutlinedIcon sx={{ fontSize: 14 }} />}
                      onClick={() => onTestEvent(monitor)}
                      disabled={busy === `dm-test-${monitor.accountId}`}
                      sx={{ justifySelf: "start" }}
                    >
                      测试提醒
                    </Button>
                  </Box>
                  {monitor.logs.length ? (
                    <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: 1 }}>
                      {formatTime(monitor.logs[0].at)} · {monitor.logs[0].message}
                    </Typography>
                  ) : null}
                </Box>
              );
            }) : <Empty text="当前没有抖音或视频号账号。" />}
          </Stack>
        </Box>

        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="提醒中心" subtitle="只显示账号级未读提醒，不展示私信正文" />
          <Stack spacing={1}>
            {unreadAlerts.length ? unreadAlerts.map((alert) => (
              <DirectMessageAlertCard
                key={alert.id}
                alert={alert}
                state={state}
                busy={busy}
                onAcknowledge={onAcknowledge}
              />
            )) : <Empty text="暂无未处理私信提醒。" />}
          </Stack>

          {handledAlerts.length ? (
            <>
              <Divider sx={{ my: 1.8 }} />
              <SectionTitle title="最近已处理" />
              <Stack spacing={0.8}>
                {handledAlerts.map((alert) => (
                  <DirectMessageAlertCard
                    key={alert.id}
                    alert={alert}
                    state={state}
                    busy={busy}
                    onAcknowledge={onAcknowledge}
                    compact
                  />
                ))}
              </Stack>
            </>
          ) : null}
        </Box>
      </Box>
    </Stack>
  );
}

function DirectMessageAlertCard({
  alert,
  state,
  busy,
  compact = false,
  onAcknowledge,
}: {
  alert: DirectMessageAlert;
  state: OpsState;
  busy: string | null;
  compact?: boolean;
  onAcknowledge: (alert: DirectMessageAlert) => void;
}) {
  const account = state.accounts.find((item) => item.id === alert.accountId);
  return (
    <Box sx={{ ...itemCardSx, p: compact ? 1.1 : 1.4, bgcolor: alert.status === "unread" ? "#fffafa" : "#fff" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
            <PlatformChip platform={alert.platform} />
            <StatusChip value={alert.status} />
            <StatusChip value={alert.source} />
            <Chip label={`${alert.unreadCount} 条`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#fef2f2", color: "#dc2626" }} />
          </Stack>
          <Typography sx={{ fontSize: compact ? 12 : 14, fontWeight: 900, color: textPrimary, mt: 0.7 }}>{alert.headline}</Typography>
          <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>
            {account?.displayName || "未知账号"} · {formatTime(alert.updatedAt)}
          </Typography>
        </Box>
        {alert.status === "unread" && (
          <Button
            size="small"
            startIcon={<DoneAllIcon sx={{ fontSize: 14 }} />}
            onClick={() => onAcknowledge(alert)}
            disabled={busy === `dm-ack-${alert.id}`}
          >
            已处理
          </Button>
        )}
      </Box>
    </Box>
  );
}

type MetricTone = "neutral" | "info" | "success" | "warning" | "danger";

const metricToneColors: Record<MetricTone, string> = {
  neutral: "#1E40AF",
  info: "#0891B2",
  success: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
};

function MetricCard({
  icon,
  label,
  value,
  helper,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  helper?: string;
  tone?: MetricTone;
  onClick?: () => void;
}) {
  const accent = tone ? metricToneColors[tone] : metricAccents[Math.abs(label.length + Number(value || 0)) % metricAccents.length];
  const interactive = Boolean(onClick);
  return (
    <Box
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      sx={{
        ...cardSx,
        p: 1.35,
        minHeight: 92,
        display: "flex",
        alignItems: "center",
        gap: 1.2,
        position: "relative",
        overflow: "hidden",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
        "&:hover": interactive ? { borderColor: "#93C5FD", boxShadow: "0 8px 18px rgba(30,64,175,0.08)", bgcolor: "#F8FBFF" } : undefined,
        "&:focus-visible": interactive ? { outline: "2px solid #2563EB", outlineOffset: 2 } : undefined,
        "&:before": { content: '""', position: "absolute", left: 0, top: 0, bottom: 0, width: 4, bgcolor: accent },
      }}
    >
      <Box sx={{ width: 40, height: 40, borderRadius: "8px", bgcolor: `${accent}14`, color: accent, display: "grid", placeItems: "center", border: `1px solid ${accent}22`, flex: "0 0 auto" }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, color: textMuted, mb: 0.25, fontWeight: 750 }}>{label}</Typography>
        <Typography sx={{ fontSize: 24, fontWeight: 950, color: textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</Typography>
        {helper && <Typography sx={{ fontSize: 10.5, color: textSecondary, mt: 0.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{helper}</Typography>}
      </Box>
    </Box>
  );
}

function PriorityCommandBar({
  state,
  activeTab,
  busy,
  onNavigate,
  onRefresh,
  onOpenDiagnosis,
}: {
  state: OpsState;
  activeTab: OpsTab;
  busy: string | null;
  onNavigate: (tab: OpsTab) => void;
  onRefresh: () => void;
  onOpenDiagnosis: () => void;
}) {
  const pendingReview = state.tasks.filter((task) => task.status === "pending_review").length;
  const failedTasks = state.tasks.filter((task) => task.status === "failed").length;
  const needsLogin = state.accounts.filter((account) => account.status === "needs_login" || account.sessionHealth === "expired").length;
  const todayKey = localDayKey(new Date());
  const todayTasks = state.tasks.filter((task) => localDayKey(task.scheduledAt) === todayKey).length;
  const primaryIssue =
    failedTasks > 0
      ? "有失败任务需要排查"
      : pendingReview > 0
          ? "有发布任务待审核"
          : needsLogin > 0
            ? "有账号需要重新登录"
            : todayTasks > 0
              ? "今日排期已就绪"
              : "今天没有紧急事项";

  const chips = [
    { label: "登录", value: needsLogin, tone: "warning" as MetricTone, tab: "accounts" as OpsTab },
    { label: "待审核", value: pendingReview, tone: "warning" as MetricTone, tab: "tasks" as OpsTab },
    { label: "失败", value: failedTasks, tone: "danger" as MetricTone, tab: "tasks" as OpsTab },
    { label: "今日排期", value: todayTasks, tone: "info" as MetricTone, tab: "tasks" as OpsTab },
  ];

  return (
    <Box
      sx={{
        ...cardSx,
        mb: 2,
        p: { xs: 1.25, md: 1.5 },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", xl: "minmax(320px, 0.85fr) minmax(420px, 1.2fr) auto" },
        gap: 1.2,
        alignItems: "center",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 950, color: textPrimary, lineHeight: 1.25 }}>今日优先级</Typography>
        <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {primaryIssue} · 当前页：{opsNavigation.find((item) => item.value === activeTab)?.label || "总览"}
        </Typography>
      </Box>

      <Stack direction="row" spacing={0.65} sx={{ flexWrap: "wrap", rowGap: 0.65, minWidth: 0 }}>
        {chips.map((item) => {
          const accent = metricToneColors[item.tone];
          const active = item.value > 0;
          return (
            <Chip
              key={item.label}
              label={`${item.label} ${item.value}`}
              size="small"
              onClick={() => onNavigate(item.tab)}
              sx={{
                height: 26,
                fontSize: 11,
                fontWeight: 900,
                bgcolor: active ? `${accent}12` : "#F8FAFC",
                color: active ? accent : textMuted,
                border: `1px solid ${active ? `${accent}33` : "#E2E8F0"}`,
                cursor: "pointer",
                "&:hover": { bgcolor: active ? `${accent}1F` : "#EFF6FF", borderColor: active ? `${accent}55` : "#BFDBFE" },
              }}
            />
          );
        })}
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} sx={{ justifyContent: { xs: "stretch", xl: "flex-end" } }}>
        <Button size="small" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />} onClick={onRefresh} disabled={busy === "refresh"} sx={{ ...softButtonSx, minHeight: 36 }}>
          刷新
        </Button>
        <Button size="small" startIcon={<TaskAltIcon sx={{ fontSize: 14 }} />} onClick={() => onNavigate("tasks")} sx={{ ...softButtonSx, minHeight: 36, bgcolor: activeTab === "tasks" ? "#DBEAFE" : softButtonSx.bgcolor }}>
          任务
        </Button>
        <Button size="small" startIcon={<TroubleshootIcon sx={{ fontSize: 14 }} />} onClick={onOpenDiagnosis} sx={{ ...primaryDarkButtonSx, minHeight: 36, boxShadow: "none", px: 1.5 }}>
          诊断
        </Button>
      </Stack>
    </Box>
  );
}

function AccountsPanel({
  state,
  accounts,
  runtime,
  busy,
  selectedAccountId,
  onSelect,
  onCreate,
  onCheck,
  onOpenWorkspace,
  onRemember,
  onDiagnose,
  onDiagnoseAccount,
  onUpdateBrowser,
  onUpdateMemory,
  onRecordMetric,
  onApplyDiagnosisAction,
  onCreateTask,
  onApprove,
  onExecute,
  onDiagnoseDraft,
  onBatchCheck,
  onBatchOpenWorkspace,
  onBatchRemember,
}: {
  state: OpsState;
  accounts: OpsAccount[];
  runtime: OpsRuntime | null;
  busy: string | null;
  selectedAccountId: string;
  onSelect: (account: OpsAccount) => void;
  onCreate: (input: Parameters<typeof createOpsAccount>[0]) => void;
  onCheck: (id: string) => void;
  onOpenWorkspace: (id: string) => void;
  onRemember: (id: string) => void;
  onDiagnose: (account: OpsAccount) => void;
  onDiagnoseAccount: (account: OpsAccount) => void;
  onUpdateBrowser: (account: OpsAccount, input: Parameters<typeof updateOpsBrowserSettings>[1]) => void;
  onUpdateMemory: (account: OpsAccount, input: AccountMemoryInput) => void;
  onRecordMetric: (account: OpsAccount, input: AccountMetricSnapshotInput) => void;
  onApplyDiagnosisAction: (report: AccountDiagnosisReport, action: AccountDiagnosisAction) => void;
  onCreateTask: (draftId: string) => void;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onDiagnoseDraft: (draft: PlatformDraft) => void;
  onBatchCheck: (ids: string[]) => void;
  onBatchOpenWorkspace: (ids: string[]) => void;
  onBatchRemember: (ids: string[]) => void;
}) {
  const [platform, setPlatform] = useState<OpsPlatform>("douyin");
  const [authType, setAuthType] = useState<AuthType>("browser_session");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [sauAccountName, setSauAccountName] = useState("");
  const [profile, setProfile] = useState("");
  const [limit, setLimit] = useState(3);
  const [browserProxyEnabled, setBrowserProxyEnabled] = useState("off");
  const [browserProxyServer, setBrowserProxyServer] = useState("");
  const [browserProxyBypassList, setBrowserProxyBypassList] = useState("localhost,127.0.0.1,::1");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(accounts.slice(0, 3).map((account) => account.id));
  const [createFormOpen, setCreateFormOpen] = useState(accounts.length === 0);
  const activeAccount = accounts.find((account) => account.id === selectedAccountId) || accounts[0] || null;
  const platformOrder: OpsPlatform[] = ["douyin", "xiaohongshu", "wechat_channels"];
  const accountsByPlatform = platformOrder.map((item) => ({
    platform: item,
    accounts: accounts.filter((account) => account.platform === item),
  }));

  useEffect(() => {
    setSelectedAccountIds((current) => current.filter((id) => accounts.some((account) => account.id === id)));
  }, [accounts]);

  useEffect(() => {
    if (!accounts.length) {
      setCreateFormOpen(true);
    }
  }, [accounts.length]);

  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const selectAllAccounts = () => {
    setSelectedAccountIds(accounts.map((account) => account.id));
  };

  const clearSelection = () => {
    setSelectedAccountIds([]);
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle
          title="账户中心"
          subtitle="自主添加账号，系统会按平台自动分类；每个账号都有独立登录档案"
          action={
            <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={() => setCreateFormOpen((value) => !value)} sx={primaryDarkButtonSx}>
              {createFormOpen ? "收起" : "添加账号"}
            </Button>
          }
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" }, gap: 1, mb: 1.2 }}>
          {accountsByPlatform.map((group) => (
            <Box key={group.platform} sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <PlatformChip platform={group.platform} />
                <Typography sx={{ fontSize: 18, fontWeight: 950, color: textPrimary, fontVariantNumeric: "tabular-nums" }}>
                  {group.accounts.length}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.35 }}>
                {group.accounts.length ? `${platformLabels[group.platform]}账号已归类` : `暂无${platformLabels[group.platform]}账号`}
              </Typography>
            </Box>
          ))}
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.2, alignItems: { sm: "center" } }}>
          <Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 800 }}>
            已选 {selectedAccountIds.length}/{accounts.length}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            <Button size="small" onClick={selectAllAccounts} sx={softButtonSx}>
              全选
            </Button>
            <Button size="small" onClick={clearSelection} sx={softButtonSx}>
              清空
            </Button>
            <Button size="small" disabled={!selectedAccountIds.length || busy?.startsWith("accounts-batch")} onClick={() => onBatchCheck(selectedAccountIds)} sx={softButtonSx}>
              批量检查
            </Button>
            <Button
              size="small"
              disabled={!selectedAccountIds.length || busy?.startsWith("accounts-batch")}
              onClick={() => onBatchOpenWorkspace(selectedAccountIds)}
              sx={softButtonSx}
            >
              批量打开
            </Button>
            <Button
              size="small"
              disabled={!selectedAccountIds.length || busy?.startsWith("accounts-batch")}
              onClick={() => onBatchRemember(selectedAccountIds)}
              sx={softButtonSx}
            >
              批量记住
            </Button>
          </Stack>
        </Stack>
        <Stack spacing={1.2}>
          {accountsByPlatform.map((group) => (
            <Box key={group.platform} sx={{ border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
              <Box sx={{
                px: 1.2,
                py: 1,
                bgcolor: "#F8FAFC",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                  <PlatformChip platform={group.platform} />
                  <Typography sx={{ fontSize: 13, color: textMuted, fontWeight: 800 }}>
                    {group.accounts.length} 个账号
                  </Typography>
                </Stack>
                <Button
                  size="small"
                  onClick={() => {
                    setPlatform(group.platform);
                    setCreateFormOpen(true);
                  }}
                  sx={{ ...softButtonSx, minWidth: "auto", px: 1 }}
                >
                  添加{platformLabels[group.platform]}
                </Button>
              </Box>
              {group.accounts.length ? (
                <Stack spacing={0} sx={{ p: 1 }}>
                  {group.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                runtime={runtime}
                selected={activeAccount?.id === account.id}
                selectedForBatch={selectedAccountIds.includes(account.id)}
                leadingControl={
                  <Checkbox
                    size="small"
                    checked={selectedAccountIds.includes(account.id)}
                    onChange={() => toggleAccountSelection(account.id)}
                    sx={{ p: 0.35, color: "#94A3B8", "&.Mui-checked": { color: "#1E40AF" } }}
                  />
                }
              actions={
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.75 }}>
                  <Button size="small" onClick={() => onSelect(account)}>详情</Button>
                  <Button size="small" onClick={() => onCheck(account.id)} disabled={busy === `check-${account.id}`}>检查</Button>
                  <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />} onClick={() => onOpenWorkspace(account.id)} disabled={busy === `workspace-${account.id}`}>账号浏览器</Button>
                  <Button size="small" startIcon={<BookmarkAddedOutlinedIcon sx={{ fontSize: 14 }} />} onClick={() => onRemember(account.id)} disabled={busy === `remember-${account.id}`}>记住登录</Button>
                  <Button size="small" startIcon={<TroubleshootIcon sx={{ fontSize: 14 }} />} onClick={() => onDiagnoseAccount(account)} disabled={busy === `account-diagnose-${account.id}`}>账号诊断</Button>
                  <Button size="small" onClick={() => onDiagnose(account)}>素材诊断</Button>
                </Stack>
              }
            />
                  ))}
                </Stack>
              ) : (
                <Box sx={{ p: 1.5 }}>
                  <Empty text={`还没有${platformLabels[group.platform]}账号，点击右侧按钮添加。`} />
                </Box>
              )}
            </Box>
          ))}
        </Stack>

        <Collapse in={createFormOpen} unmountOnExit>
          <Divider sx={{ my: 1.6 }} />
          <SectionTitle title="添加账号" subtitle="选择平台后保存，账号会自动进入对应平台分类" />
          <Stack spacing={1.5}>
            <TextField select label="平台" size="small" value={platform} onChange={(e) => setPlatform(e.target.value as OpsPlatform)}>
              <MenuItem value="douyin">抖音</MenuItem>
              <MenuItem value="xiaohongshu">小红书</MenuItem>
              <MenuItem value="wechat_channels">视频号</MenuItem>
            </TextField>
            <TextField select label="登录方式" size="small" value={authType} onChange={(e) => setAuthType(e.target.value as AuthType)}>
              <MenuItem value="browser_session">独立浏览器登录</MenuItem>
              <MenuItem value="oauth">OAuth/API</MenuItem>
              <MenuItem value="manual">人工记录</MenuItem>
            </TextField>
            <TextField label="账号名称" size="small" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <TextField label="账号标识" size="small" value={handle} onChange={(e) => setHandle(e.target.value)} />
            <TextField label="SAU 账号名" size="small" value={sauAccountName} onChange={(e) => setSauAccountName(e.target.value)} placeholder="默认使用账号标识" />
            <TextField label="账号定位" size="small" multiline minRows={3} value={profile} onChange={(e) => setProfile(e.target.value)} />
            <TextField label="每日发布上限" size="small" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value || 1))} />
            <TextField select label="账号浏览器代理" size="small" value={browserProxyEnabled} onChange={(e) => setBrowserProxyEnabled(e.target.value)}>
              <MenuItem value="off">跟随电脑系统代理</MenuItem>
              <MenuItem value="on">启用账号专属代理</MenuItem>
            </TextField>
            <TextField
              label="代理服务器"
              size="small"
              value={browserProxyServer}
              onChange={(e) => setBrowserProxyServer(e.target.value)}
              disabled={browserProxyEnabled === "off"}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
            />
            <TextField
              label="绕过代理"
              size="small"
              value={browserProxyBypassList}
              onChange={(e) => setBrowserProxyBypassList(e.target.value)}
              disabled={browserProxyEnabled === "off"}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!displayName.trim() || !handle.trim() || (browserProxyEnabled === "on" && !browserProxyServer.trim()) || busy === "create-account"}
              onClick={() => {
                onCreate({
                  platform,
                  displayName,
                  handle,
                  authType,
                  profile,
                  dailyPublishLimit: limit,
                  browserProxyEnabled: browserProxyEnabled === "on",
                  browserProxyServer: browserProxyServer.trim(),
                  browserProxyBypassList: browserProxyBypassList.trim(),
                  sauAccountName: sauAccountName.trim(),
                });
                setDisplayName("");
                setHandle("");
                setSauAccountName("");
                setProfile("");
                setBrowserProxyEnabled("off");
                setBrowserProxyServer("");
                setBrowserProxyBypassList("localhost,127.0.0.1,::1");
                setCreateFormOpen(false);
              }}
              sx={primaryDarkButtonSx}
            >
              新增账号
            </Button>
          </Stack>
        </Collapse>
      </Box>

      {activeAccount ? (
        <AccountDetailPanel
          account={activeAccount}
          state={state}
          runtime={runtime}
          busy={busy}
          onOpenWorkspace={onOpenWorkspace}
          onDiagnose={onDiagnose}
          onDiagnoseAccount={onDiagnoseAccount}
          onUpdateBrowser={onUpdateBrowser}
          onUpdateMemory={onUpdateMemory}
          onRecordMetric={onRecordMetric}
          onApplyDiagnosisAction={onApplyDiagnosisAction}
          onCreateTask={onCreateTask}
          onApprove={onApprove}
          onExecute={onExecute}
          onDiagnoseDraft={onDiagnoseDraft}
        />
      ) : (
        <Box sx={{ ...cardSx, p: 2 }}>
          <Empty text="暂无账号，先在账户中心添加一个账号。" />
        </Box>
      )}
    </Box>
  );
}

function AccountDetailPanel({
  account,
  state,
  runtime,
  busy,
  onOpenWorkspace,
  onDiagnose,
  onDiagnoseAccount,
  onUpdateBrowser,
  onUpdateMemory,
  onRecordMetric,
  onApplyDiagnosisAction,
  onCreateTask,
  onApprove,
  onExecute,
  onDiagnoseDraft,
}: {
  account: OpsAccount;
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  onOpenWorkspace: (id: string) => void;
  onDiagnose: (account: OpsAccount) => void;
  onDiagnoseAccount: (account: OpsAccount) => void;
  onUpdateBrowser: (account: OpsAccount, input: Parameters<typeof updateOpsBrowserSettings>[1]) => void;
  onUpdateMemory: (account: OpsAccount, input: AccountMemoryInput) => void;
  onRecordMetric: (account: OpsAccount, input: AccountMetricSnapshotInput) => void;
  onApplyDiagnosisAction: (report: AccountDiagnosisReport, action: AccountDiagnosisAction) => void;
  onCreateTask: (draftId: string) => void;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onDiagnoseDraft: (draft: PlatformDraft) => void;
}) {
  const drafts = state.drafts.filter((draft) => draft.accountId === account.id);
  const tasks = state.tasks.filter((task) => task.accountId === account.id).sort((a, b) => taskTimeValue(a) - taskTimeValue(b));
  const isolation = isolationStatusForAccount(account, state.accounts);
  const latestMetric = [...state.metrics]
    .filter((item) => item.accountId === account.id)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
  const relatedAssetIds = new Set(drafts.map((draft) => draft.assetId));
  const relatedAssets = state.assets.filter((asset) => relatedAssetIds.has(asset.id));
  const pendingTasks = tasks.filter((task) => task.status === "pending_review").length;
  const scheduledTasks = tasks.filter((task) => task.status === "scheduled").length;
  const publishedTasks = tasks.filter((task) => task.status === "published").length;
  const latestDiagnosis = [...state.accountDiagnoses]
    .filter((report) => report.accountId === account.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <SectionTitle
        title="账号详情"
        subtitle={`${platformLabels[account.platform]} · ${account.handle}`}
        action={
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.75 }}>
            <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />} onClick={() => onOpenWorkspace(account.id)} disabled={busy === `workspace-${account.id}`}>
              账号浏览器
            </Button>
            <Button
              size="small"
              startIcon={<TroubleshootIcon sx={{ fontSize: 14 }} />}
              onClick={() => onDiagnoseAccount(account)}
              disabled={busy === `account-diagnose-${account.id}`}
            >
              账号诊断
            </Button>
            <Button size="small" onClick={() => onDiagnose(account)}>
              素材诊断
            </Button>
          </Stack>
        }
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.2, mb: 1.5 }}>
        <AccountStat label="发布额度" value={`${account.publishedToday}/${account.dailyPublishLimit}`} helper="今日已发/上限" />
        <AccountStat label="待办任务" value={pendingTasks + scheduledTasks} helper={`待审核 ${pendingTasks} · 已排期 ${scheduledTasks}`} />
        <AccountStat label="已完成" value={publishedTasks} helper="dry-run 或人工接管记录" />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.1fr 0.9fr" }, gap: 1.5 }}>
        <Box>
          <SectionTitle title="账号记忆" subtitle="定位、登录档案和平台入口" />
          <Alert severity={isolation.severity} sx={{ mb: 1, borderRadius: "8px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{isolation.label}</Typography>
            <Typography sx={{ fontSize: 12, lineHeight: 1.6, mt: 0.25 }}>{isolation.detail}</Typography>
          </Alert>
          <Stack spacing={0.8}>
            <MemoryRow label="账号定位" value={account.profile || "未填写"} />
            <MemoryRow label="登录档案" value={compactPath(account.browserProfileDir)} />
            <MemoryRow label="桌面分区" value={desktopPartitionForAccount(account.id)} />
            <MemoryRow label="状态保持" value="下次重开项目时会继续复用这个账号自己的浏览器档案/桌面分区" />
            <MemoryRow label="最近打开" value={account.workspaceOpenedAt ? formatTime(account.workspaceOpenedAt) : "尚未打开"} />
            <MemoryRow label="平台入口" value={account.workspaceUrl || "未初始化"} />
            <MemoryRow label="浏览器代理" value={account.browserProxyEnabled ? account.browserProxyServer || "已启用，未填写代理" : "跟随电脑系统代理"} />
            <MemoryRow label="SAU 账号名" value={sauAccountNameForDisplay(account, runtime)} />
          </Stack>
          <BrowserSettingsPanel
            key={`${account.id}-${account.browserProxyEnabled}-${account.browserProxyServer}-${account.browserProxyBypassList}-${account.sauAccountName}`}
            account={account}
            accounts={state.accounts}
            runtime={runtime}
            busy={busy}
            onUpdateBrowser={onUpdateBrowser}
            onOpenWorkspace={onOpenWorkspace}
          />
          <AccountMemoryPanel
            key={`${account.id}-${account.memory?.updatedAt || ""}`}
            account={account}
            busy={busy}
            onUpdateMemory={onUpdateMemory}
          />
        </Box>
        <Box>
          <SectionTitle title="数据快照" subtitle={latestMetric ? formatTime(latestMetric.capturedAt) : "暂无采集记录"} />
          {latestMetric ? (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.8 }}>
        <AccountStat label="粉丝/关注" value={formatMetric(latestMetric.followers)} />
                <AccountStat label="播放" value={formatMetric(latestMetric.plays)} />
                <AccountStat label="点赞" value={formatMetric(latestMetric.likes)} />
                <AccountStat label="评论/分享" value={`${formatMetric(latestMetric.comments)}/${formatMetric(latestMetric.shares)}`} />
              </Box>
              <PlatformMetricSignals account={account} metric={latestMetric} />
            </>
          ) : (
            <Empty text="暂无账号指标快照。" />
          )}
        </Box>
      </Box>

      <Divider sx={{ my: 1.8 }} />

      <SectionTitle title="平台推送关注点" subtitle="用于诊断和排期时的账号侧检查" />
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, mb: 1.8 }}>
        {platformAlgorithmSignals[account.platform].map((item) => (
          <Chip key={item} label={item} size="small" sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: "#f8fafc", color: "#334155" }} />
        ))}
      </Stack>

      <AccountMetricSnapshotPanel
        key={`${account.id}-${latestMetric?.id || "empty"}`}
        account={account}
        latestMetric={latestMetric}
        busy={busy}
        onRecordMetric={onRecordMetric}
      />

      <AccountDiagnosisReportPanel
        report={latestDiagnosis}
        busy={busy}
        onApply={(action) => latestDiagnosis && onApplyDiagnosisAction(latestDiagnosis, action)}
      />

      <Divider sx={{ my: 1.8 }} />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
        <Box>
          <SectionTitle title="账号草稿" subtitle={`${drafts.length} 条草稿 · ${relatedAssets.length} 条关联资产`} />
          <Stack spacing={1}>
            {drafts.length ? drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                state={state}
                busy={busy}
                onCreateTask={onCreateTask}
                onDiagnoseDraft={onDiagnoseDraft}
              />
            )) : <Empty text="该账号暂无草稿。" />}
          </Stack>
        </Box>
        <Box>
          <SectionTitle title="任务反馈" subtitle={`${tasks.length} 条发布任务`} />
          <Stack spacing={1}>
            {tasks.length ? tasks.map((task) => (
              <TaskActionCard
                key={task.id}
                task={task}
                state={state}
                busy={busy}
                onApprove={onApprove}
                onExecute={onExecute}
              />
            )) : <Empty text="该账号暂无任务。" />}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

function BrowserSettingsPanel({
  account,
  accounts,
  runtime,
  busy,
  onUpdateBrowser,
  onOpenWorkspace,
}: {
  account: OpsAccount;
  accounts: OpsAccount[];
  runtime: OpsRuntime | null;
  busy: string | null;
  onUpdateBrowser: (account: OpsAccount, input: Parameters<typeof updateOpsBrowserSettings>[1]) => void;
  onOpenWorkspace: (id: string) => void;
}) {
  const [proxyEnabled, setProxyEnabled] = useState(account.browserProxyEnabled ? "on" : "off");
  const [proxyServer, setProxyServer] = useState(account.browserProxyServer || "");
  const [proxyBypassList, setProxyBypassList] = useState(account.browserProxyBypassList || "localhost,127.0.0.1,::1");
  const [sauName, setSauName] = useState(account.sauAccountName || "");
  const [proxyDetecting, setProxyDetecting] = useState(false);

  const saveDisabled = proxyEnabled === "on" && !proxyServer.trim();
  const previewIsolation = isolationStatusForAccount(
    {
      ...account,
      browserProxyEnabled: proxyEnabled === "on",
      browserProxyServer: proxyServer.trim(),
    },
    accounts,
  );

  const readSystemProxy = async () => {
    setProxyDetecting(true);
    try {
      const systemProxy = await getOpsSystemProxy();
      if (!systemProxy.detected || !systemProxy.proxyServer) {
        showToast(systemProxy.message || "未检测到本机固定代理");
        return;
      }
      setProxyEnabled("on");
      setProxyServer(systemProxy.proxyServer);
      setProxyBypassList(systemProxy.bypassList || "localhost,127.0.0.1,::1");
      showToast(`已读取${systemProxy.source}，请保存到当前账号`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "读取电脑代理失败");
    } finally {
      setProxyDetecting(false);
    }
  };

  return (
    <Box sx={{ mt: 1.2, p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#fbfdff" }}>
      <SectionTitle
        title="独立浏览器与代理"
        subtitle="每个账号使用自己的浏览器档案，登录态会留在该档案目录"
      />
      <Stack spacing={1}>
        <Alert severity={previewIsolation.severity} sx={{ borderRadius: "8px" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{previewIsolation.label}</Typography>
          <Typography sx={{ fontSize: 12, lineHeight: 1.6, mt: 0.25 }}>{previewIsolation.detail}</Typography>
        </Alert>
        <TextField
          select
          size="small"
          label="代理"
          value={proxyEnabled}
          onChange={(event) => setProxyEnabled(event.target.value)}
        >
          <MenuItem value="off">跟随电脑系统代理</MenuItem>
          <MenuItem value="on">启用账号专属代理</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="代理服务器"
          value={proxyServer}
          onChange={(event) => setProxyServer(event.target.value)}
          placeholder="例如：http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
          helperText="只写当前账号浏览器要走的代理；不填写系统 Chrome 配置。"
          disabled={proxyEnabled === "off"}
        />
        <TextField
          size="small"
          label="绕过代理"
          value={proxyBypassList}
          onChange={(event) => setProxyBypassList(event.target.value)}
          placeholder="localhost,127.0.0.1,::1"
          disabled={proxyEnabled === "off"}
        />
        <TextField
          size="small"
          label="SAU 账号名"
          value={sauName}
          onChange={(event) => setSauName(event.target.value)}
          placeholder={sauAccountNameForDisplay(account, runtime)}
          helperText={`留空时使用：${sauAccountNameForDisplay({ ...account, sauAccountName: "" }, runtime)}`}
        />
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
          <Button
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
            disabled={proxyDetecting}
            onClick={() => void readSystemProxy()}
            sx={softButtonSx}
          >
            {proxyDetecting ? "读取中" : "读取电脑代理"}
          </Button>
          <Button
            size="small"
            startIcon={<BookmarkAddedOutlinedIcon sx={{ fontSize: 14 }} />}
            disabled={saveDisabled || busy === `browser-settings-${account.id}`}
            onClick={() => onUpdateBrowser(account, {
              browserProxyEnabled: proxyEnabled === "on",
              browserProxyServer: proxyServer.trim(),
              browserProxyBypassList: proxyBypassList.trim(),
              sauAccountName: sauName.trim(),
            })}
            sx={softButtonSx}
          >
            保存浏览器设置
          </Button>
          <Button
            size="small"
            startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            disabled={busy === `workspace-${account.id}`}
            onClick={() => onOpenWorkspace(account.id)}
            sx={softButtonSx}
          >
            用此设置打开
          </Button>
        </Stack>
        <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.55 }}>
          登录记忆会保存在这个账号自己的浏览器档案里；桌面版同时使用固定的持久化分区 {desktopPartitionForAccount(account.id)}。只要你不要删除这些档案，下次打开项目时仍会回到这个账号自己的登录状态。
        </Typography>
      </Stack>
    </Box>
  );
}

function buildMemoryForm(account: OpsAccount): Record<string, string> {
  const memory = account.memory || {
    targetAudience: [],
    contentPillars: [],
    conversionGoal: "",
    personaTone: "",
    highPerformingPatterns: [],
    lowPerformingPatterns: [],
    avoidTopics: [],
    commentStrategy: "",
    privateDomainStrategy: "",
  };
  return {
    targetAudience: memory.targetAudience.join("，"),
    contentPillars: memory.contentPillars.join("，"),
    conversionGoal: memory.conversionGoal || "",
    personaTone: memory.personaTone || "",
    highPerformingPatterns: memory.highPerformingPatterns.join("，"),
    lowPerformingPatterns: memory.lowPerformingPatterns.join("，"),
    avoidTopics: memory.avoidTopics.join("，"),
    commentStrategy: memory.commentStrategy || "",
    privateDomainStrategy: memory.privateDomainStrategy || "",
  };
}

function AccountMemoryPanel({
  account,
  busy,
  onUpdateMemory,
}: {
  account: OpsAccount;
  busy: string | null;
  onUpdateMemory: (account: OpsAccount, input: AccountMemoryInput) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => buildMemoryForm(account));

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    onUpdateMemory(account, {
      targetAudience: splitTags(form.targetAudience),
      contentPillars: splitTags(form.contentPillars),
      conversionGoal: form.conversionGoal.trim(),
      personaTone: form.personaTone.trim(),
      highPerformingPatterns: splitTags(form.highPerformingPatterns),
      lowPerformingPatterns: splitTags(form.lowPerformingPatterns),
      avoidTopics: splitTags(form.avoidTopics),
      commentStrategy: form.commentStrategy.trim(),
      privateDomainStrategy: form.privateDomainStrategy.trim(),
    });
  };

  return (
    <Box sx={{ borderTop: "1px solid #eef2f7", mt: 1.3, pt: 1.3 }}>
      <SectionTitle
        title="长期画像"
        subtitle={account.memory?.updatedAt ? `${formatTime(account.memory.updatedAt)} 更新` : "用于诊断、草稿生成和 Agent 决策"}
        action={
          <Button size="small" onClick={save} disabled={busy === `memory-${account.id}`}>
            保存记忆
          </Button>
        }
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
        <TextField size="small" label="目标人群" value={form.targetAudience} onChange={(event) => setField("targetAudience", event.target.value)} />
        <TextField size="small" label="内容支柱" value={form.contentPillars} onChange={(event) => setField("contentPillars", event.target.value)} />
        <TextField size="small" label="转化目标" value={form.conversionGoal} onChange={(event) => setField("conversionGoal", event.target.value)} />
        <TextField size="small" label="人设语气" value={form.personaTone} onChange={(event) => setField("personaTone", event.target.value)} />
        <TextField size="small" label="高表现规律" value={form.highPerformingPatterns} onChange={(event) => setField("highPerformingPatterns", event.target.value)} />
        <TextField size="small" label="低效规律" value={form.lowPerformingPatterns} onChange={(event) => setField("lowPerformingPatterns", event.target.value)} />
        <TextField size="small" label="选题禁区" value={form.avoidTopics} onChange={(event) => setField("avoidTopics", event.target.value)} />
        <TextField size="small" label="评论承接" value={form.commentStrategy} onChange={(event) => setField("commentStrategy", event.target.value)} />
        <TextField size="small" label="项目初诊承接" value={form.privateDomainStrategy} onChange={(event) => setField("privateDomainStrategy", event.target.value)} sx={{ gridColumn: { xs: "auto", md: "span 2" } }} />
      </Box>
    </Box>
  );
}

function buildMetricForm(account: OpsAccount, metric?: MetricSnapshot): Record<string, string> {
  const text = (value?: number | null) => (value === null || value === undefined ? "" : String(value));
  return {
    followers: text(metric?.followers ?? 0),
    plays: text(metric?.plays ?? 0),
    likes: text(metric?.likes ?? 0),
    comments: text(metric?.comments ?? 0),
    shares: text(metric?.shares ?? 0),
    avgViewDurationSeconds: text(metric?.avgViewDurationSeconds),
    threeSecondRetentionRate: text(metric?.threeSecondRetentionRate),
    completionRate: text(metric?.completionRate),
    replayRate: text(metric?.replayRate),
    followConversionRate: text(metric?.followConversionRate),
    profileVisitRate: text(metric?.profileVisitRate),
    searchImpressionRate: text(metric?.searchImpressionRate),
    localTrafficRate: text(metric?.localTrafficRate),
    socialShareRate: text(metric?.socialShareRate),
    friendLikeRate: text(metric?.friendLikeRate),
    privateDomainClickRate: text(metric?.privateDomainClickRate),
    officialAccountClickRate: text(metric?.officialAccountClickRate),
    liveReservationRate: text(metric?.liveReservationRate),
    topContentTags: metric?.topContentTags?.join("，") || (account.platform === "douyin" ? "账号定位,内容选题,线索承接" : "好友转发,内容互动,预约咨询"),
  };
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function AccountMetricSnapshotPanel({
  account,
  latestMetric,
  busy,
  onRecordMetric,
}: {
  account: OpsAccount;
  latestMetric?: MetricSnapshot;
  busy: string | null;
  onRecordMetric: (account: OpsAccount, input: AccountMetricSnapshotInput) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => buildMetricForm(account, latestMetric));

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  if (account.platform === "xiaohongshu") {
    return (
      <Box sx={{ mb: 1.5 }}>
        <SectionTitle title="算法数据快照" subtitle="小红书先使用本地快照、账号记忆、草稿和任务做整体体检" />
        <Empty text="小红书后台指标采集暂未接入，可先通过账号诊断查看整体建议。" />
      </Box>
    );
  }

  const commonFields = [
    ["followers", "粉丝"],
    ["plays", "播放"],
    ["likes", "点赞"],
    ["comments", "评论"],
    ["shares", "分享"],
    ["avgViewDurationSeconds", "均看秒"],
  ];
  const platformFields =
    account.platform === "douyin"
      ? [
          ["threeSecondRetentionRate", "3秒留存%"],
          ["completionRate", "完播率%"],
          ["replayRate", "复看率%"],
          ["followConversionRate", "转粉率%"],
          ["searchImpressionRate", "搜索流量%"],
          ["localTrafficRate", "同城流量%"],
        ]
      : [
          ["friendLikeRate", "好友点赞%"],
          ["socialShareRate", "社交转发%"],
          ["privateDomainClickRate", "初诊点击%"],
          ["officialAccountClickRate", "公众号点击%"],
          ["liveReservationRate", "直播预约%"],
          ["completionRate", "完播率%"],
        ];

  const save = () => {
    const searchRate = toOptionalNumber(form.searchImpressionRate);
    const localRate = toOptionalNumber(form.localTrafficRate);
    onRecordMetric(account, {
      source: "manual",
      periodDays: 7,
      followers: toNumber(form.followers),
      plays: toNumber(form.plays),
      likes: toNumber(form.likes),
      comments: toNumber(form.comments),
      shares: toNumber(form.shares),
      avgViewDurationSeconds: toOptionalNumber(form.avgViewDurationSeconds),
      threeSecondRetentionRate: toOptionalNumber(form.threeSecondRetentionRate),
      completionRate: toOptionalNumber(form.completionRate),
      replayRate: toOptionalNumber(form.replayRate),
      followConversionRate: toOptionalNumber(form.followConversionRate),
      profileVisitRate: toOptionalNumber(form.profileVisitRate),
      searchImpressionRate: searchRate,
      localTrafficRate: localRate,
      socialShareRate: toOptionalNumber(form.socialShareRate),
      friendLikeRate: toOptionalNumber(form.friendLikeRate),
      privateDomainClickRate: toOptionalNumber(form.privateDomainClickRate),
      officialAccountClickRate: toOptionalNumber(form.officialAccountClickRate),
      liveReservationRate: toOptionalNumber(form.liveReservationRate),
      trafficFieldBreakdown:
        account.platform === "douyin"
          ? {
              search: searchRate || 0,
              local: localRate || 0,
              interest: Math.max(0, 100 - (searchRate || 0) - (localRate || 0)),
            }
          : {},
      topContentTags: splitTags(form.topContentTags),
    });
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      <SectionTitle
        title="算法数据快照"
        subtitle="写入近 7 天账号层数据，诊断模型会按平台推荐逻辑重新评分"
        action={
          <Button size="small" onClick={save} disabled={busy === `metric-${account.id}`}>
            写入快照
          </Button>
        }
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }, gap: 1 }}>
        {commonFields.map(([key, label]) => (
          <TextField key={key} size="small" type="number" label={label} value={form[key] || ""} onChange={(event) => setField(key, event.target.value)} />
        ))}
        {platformFields.map(([key, label]) => (
          <TextField key={key} size="small" type="number" label={label} value={form[key] || ""} onChange={(event) => setField(key, event.target.value)} />
        ))}
        <TextField
          size="small"
          label="高频内容标签"
          value={form.topContentTags || ""}
          onChange={(event) => setField("topContentTags", event.target.value)}
          sx={{ gridColumn: { xs: "span 2", md: "span 3", xl: "span 2" } }}
        />
      </Box>
    </Box>
  );
}

function PlatformMetricSignals({ account, metric }: { account: OpsAccount; metric: MetricSnapshot }) {
  const signals =
    account.platform === "douyin"
      ? [
          ["3秒留存", formatRate(metric.threeSecondRetentionRate)],
          ["完播", formatRate(metric.completionRate)],
          ["复看", formatRate(metric.replayRate)],
          ["转粉", formatRate(metric.followConversionRate)],
          ["搜索", formatRate(metric.searchImpressionRate)],
          ["同城", formatRate(metric.localTrafficRate)],
        ]
      : account.platform === "wechat_channels"
        ? [
            ["好友点赞", formatRate(metric.friendLikeRate)],
            ["社交转发", formatRate(metric.socialShareRate)],
            ["初诊点击", formatRate(metric.privateDomainClickRate)],
            ["公众号点击", formatRate(metric.officialAccountClickRate)],
            ["直播预约", formatRate(metric.liveReservationRate)],
            ["完播", formatRate(metric.completionRate)],
          ]
        : [
            ["完播", formatRate(metric.completionRate)],
            ["搜索", formatRate(metric.searchImpressionRate)],
          ];

  return (
    <Stack direction="row" spacing={0.6} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.6 }}>
      {signals.map(([label, value]) => (
        <Chip
          key={label}
          label={`${label} ${value}`}
          size="small"
          sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: value === "-" ? "#f8fafc" : "#eef2ff", color: value === "-" ? "#94a3b8" : "#4338ca" }}
        />
      ))}
    </Stack>
  );
}

function AccountDiagnosisReportPanel({
  report,
  busy,
  onApply,
}: {
  report?: AccountDiagnosisReport;
  busy: string | null;
  onApply: (action: AccountDiagnosisAction) => void;
}) {
  if (!report) {
    return (
      <Box sx={{ mb: 1.5 }}>
        <SectionTitle title="最近账号诊断" subtitle="从账号详情或账号列表点击账号诊断后生成" />
        <Empty text="暂无账号级诊断报告。诊断会读取该账号的登录档案、运营快照、草稿任务和未读私信计数。" />
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <SectionTitle
        title="最近账号诊断"
        subtitle={`${formatTime(report.createdAt)} · 读取来源：${statusMeta[report.source]?.label || report.source}`}
        action={
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <StatusChip value={report.source} />
            <Chip label={`等级 ${report.grade}`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: "#1E40AF", color: "#fff" }} />
          </Stack>
        }
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "140px 1fr" }, gap: 1.4, alignItems: "start" }}>
        <Box sx={{ p: 1.2, borderLeft: "4px solid #1E40AF", bgcolor: "#EFF6FF" }}>
          <Typography sx={{ fontSize: 11, color: textMuted }}>整体健康度</Typography>
          <Typography sx={{ fontSize: 32, fontWeight: 900, color: textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {report.overallScore}
          </Typography>
          <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.4 }}>{report.summary}</Typography>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 0.8 }}>
          {report.dimensions.map((dimension) => (
            <Box key={dimension.key} sx={{ borderTop: "1px solid #e5e7eb", pt: 0.9, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary }}>{dimension.label}</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 900, color: dimension.score >= 70 ? "#047857" : "#c2410c", fontVariantNumeric: "tabular-nums" }}>
                  {dimension.score}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.55, mt: 0.3 }}>{dimension.summary}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr 1fr" }, gap: 1.2, mt: 1.5 }}>
        <DiagnosisList title="关键发现" items={report.findings} emptyText="暂无发现。" />
        <DiagnosisList title="优化建议" items={report.suggestions} emptyText="暂无建议。" />
        <DiagnosisList title="风险提醒" items={report.risks} emptyText="暂无风险。" danger />
      </Box>

      <AccountDiagnosisActions report={report} busy={busy} onApply={onApply} />
      <AgentDiagnosisChain report={report} />
    </Box>
  );
}

function AccountDiagnosisActions({
  report,
  busy,
  onApply,
}: {
  report: AccountDiagnosisReport;
  busy: string | null;
  onApply: (action: AccountDiagnosisAction) => void;
}) {
  const actions = report.actions || [];
  if (!actions.length) return null;
  return (
    <Box sx={{ mt: 1.5, borderTop: "1px solid #e5e7eb", pt: 1.2 }}>
      <SectionTitle title="可执行运营动作" subtitle="把诊断建议直接导入草稿、话术或待审核任务" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, gap: 1 }}>
        {actions.map((action) => (
          <Box key={action.key} sx={{ ...itemCardSx, p: 1.2, bgcolor: action.priority === "high" ? "#fffafa" : "#fff" }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
              <Chip label={action.priority === "high" ? "高优先级" : action.priority === "medium" ? "中优先级" : "低优先级"} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, bgcolor: action.priority === "high" ? "#fef2f2" : "#f8fafc", color: action.priority === "high" ? "#dc2626" : textMuted }} />
              <Chip label={action.kind} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800 }} />
            </Stack>
            <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, mt: 0.7 }}>{action.title}</Typography>
            <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.6, mt: 0.35 }}>{action.summary}</Typography>
            <Box sx={{ mt: 0.9, p: 1, bgcolor: "#f8fafc", borderRadius: "8px", border: "1px solid #eef2f7" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, lineHeight: 1.45 }}>{action.suggestedTitle}</Typography>
              <Typography sx={{ fontSize: 11, color: textSecondary, lineHeight: 1.6, mt: 0.45, whiteSpace: "pre-line" }}>
                {action.suggestedContent.slice(0, 180)}{action.suggestedContent.length > 180 ? "..." : ""}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between", mt: 1, gap: 1 }}>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                {action.tags.slice(0, 3).map((tag) => <Chip key={tag} label={tag} size="small" sx={{ height: 20, fontSize: 10 }} />)}
              </Stack>
              <Button
                size="small"
                onClick={() => onApply(action)}
                disabled={busy === `diagnosis-action-${report.id}-${action.key}`}
                sx={{ whiteSpace: "nowrap", fontWeight: 800 }}
              >
                {action.applyLabel}
              </Button>
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function AgentDiagnosisChain({ report }: { report: AccountDiagnosisReport }) {
  return (
    <Box sx={{ mt: 1.5, borderTop: "1px solid #e5e7eb", pt: 1.2 }}>
      <SectionTitle title="Agent 诊断链路" subtitle="独立诊断、互相讨论、JudgeAgent 汇总" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.9fr 1.1fr" }, gap: 1.2 }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.7 }}>诊断阶段</Typography>
          <Stack spacing={0.7}>
            {report.workflowStages.map((stage, index) => (
              <Box key={stage.key} sx={{ borderLeft: `3px solid ${stage.status === "done" ? "#059669" : stage.status === "warn" ? "#d97706" : "#dc2626"}`, pl: 1, py: 0.2 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary }}>{index + 1}. {stage.label}</Typography>
                <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.55 }}>{stage.summary}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.7 }}>专家 Agent 独立意见</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 0.8 }}>
            {report.agentOpinions.map((opinion) => (
              <Box key={opinion.agentName} sx={{ ...itemCardSx, p: 1, bgcolor: "#fbfdff" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary }}>{opinion.agentName}</Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: opinion.score >= 75 ? "#047857" : "#c2410c", fontVariantNumeric: "tabular-nums" }}>{opinion.score}</Typography>
                </Box>
                <Typography sx={{ fontSize: 10, color: "#94a3b8", mt: 0.15 }}>{opinion.focus} · {opinion.stance}</Typography>
                <Typography sx={{ fontSize: 11, color: textSecondary, lineHeight: 1.55, mt: 0.55 }}>{opinion.evidence[0] || "暂无证据摘要"}</Typography>
                <Typography sx={{ fontSize: 11, color: "#334155", lineHeight: 1.55, mt: 0.35 }}>{opinion.suggestions[0] || "暂无建议"}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.2, mt: 1.2 }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.7 }}>Agent 讨论记录</Typography>
          <Stack spacing={0.65}>
            {report.debateTimeline.map((turn, index) => (
              <Box key={`${turn.round}-${turn.agentName}-${index}`} sx={{ ...itemCardSx, p: 0.9, bgcolor: turn.kind === "judge" ? "#f8fafc" : "#fff" }}>
                <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.35, flexWrap: "wrap", rowGap: 0.4 }}>
                  <Chip label={`R${turn.round}`} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 900 }} />
                  <Chip label={turn.kind} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 900, bgcolor: turn.kind === "challenge" ? "#fff7ed" : "#eef2ff", color: turn.kind === "challenge" ? "#c2410c" : "#4338ca" }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: textPrimary }}>{turn.agentName}</Typography>
                </Stack>
                <Typography sx={{ fontSize: 11, color: textSecondary, lineHeight: 1.55 }}>{turn.message}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Box sx={{ ...itemCardSx, p: 1.2, bgcolor: "#f8fafc" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.55 }}>JudgeAgent 最终汇总</Typography>
          <Typography sx={{ fontSize: 12, color: "#334155", lineHeight: 1.7 }}>{report.judgeSummary || report.summary}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

function DiagnosisList({ title, items, emptyText, danger = false }: { title: string; items: string[]; emptyText: string; danger?: boolean }) {
  const displayItems = items.length ? items : [emptyText];
  return (
    <Box sx={{ borderTop: "1px solid #e5e7eb", pt: 0.9 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 900, color: danger ? "#b91c1c" : textPrimary, mb: 0.6 }}>{title}</Typography>
      <Stack spacing={0.55}>
        {displayItems.map((item, index) => (
          <Typography key={`${title}-${index}`} sx={{ fontSize: 11, color: danger ? "#991b1b" : textSecondary, lineHeight: 1.6 }}>
            {item}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

function AccountStat({ label, value, helper }: { label: string; value: ReactNode; helper?: string }) {
  return (
    <Box sx={{ p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#fbfdff", minWidth: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)" }}>
      <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ fontSize: 21, fontWeight: 950, color: textPrimary, fontVariantNumeric: "tabular-nums", mt: 0.25, lineHeight: 1.1 }}>{value}</Typography>
      {helper && <Typography sx={{ fontSize: 10, color: "#94a3b8", mt: 0.3, lineHeight: 1.4 }}>{helper}</Typography>}
    </Box>
  );
}

function MemoryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 1, alignItems: "start", py: 0.35 }}>
      <Typography sx={{ fontSize: 11, color: "#94a3b8", fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12, color: "#334155", wordBreak: "break-all" }}>{value}</Typography>
    </Box>
  );
}

function AssetsPanel({
  state,
  busy,
  onCreate,
  onCreatePackage,
  onCreateFolderPackage,
  onGenerateDrafts,
}: {
  state: OpsState;
  busy: string | null;
  onCreate: (input: Parameters<typeof createOpsAsset>[0]) => void;
  onCreatePackage: (input: Parameters<typeof createOpsAsset>[0], accountIds: string[], scheduledAt?: string) => void;
  onCreateFolderPackage: (input: Parameters<typeof createPublishPackageFromFolder>[0]) => void;
  onGenerateDrafts: (assetId: string, accountIds?: string[]) => void;
}) {
  const [titleBase, setTitleBase] = useState("");
  const [contentType, setContentType] = useState<DispatchContentType>("video");
  const [descriptionBase, setDescriptionBase] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLocalPath, setVideoLocalPath] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverLocalPath, setCoverLocalPath] = useState("");
  const [tags, setTags] = useState("");
  const [duration, setDuration] = useState(60);
  const [owner, setOwner] = useState("内容运营团队");
  const [scheduledAt, setScheduledAt] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [uploading, setUploading] = useState<"video" | "cover" | null>(null);
  const [selectedDraftAccountIds, setSelectedDraftAccountIds] = useState<string[]>(
    state.accounts.filter((account) => account.status !== "disabled").slice(0, 4).map((account) => account.id),
  );

  useEffect(() => {
    setSelectedDraftAccountIds((current) => current.filter((id) => state.accounts.some((account) => account.id === id)));
  }, [state.accounts]);

  const toggleDraftAccount = (id: string) => {
    setSelectedDraftAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleAssetFile = async (kind: "video" | "cover", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(kind);
    try {
      const uploaded: AssetFileUploadResponse = await uploadOpsAssetFile(kind, file);
      if (kind === "video") {
        setVideoUrl(uploaded.fileUrl);
        setVideoLocalPath(uploaded.filePath);
        if (!titleBase.trim()) {
          setTitleBase(file.name.replace(/\.[^.]+$/, ""));
        }
      } else {
        setCoverUrl(uploaded.fileUrl);
        setCoverLocalPath(uploaded.filePath);
      }
      showToast(kind === "video" ? "视频文件已保存到本地素材库" : "封面文件已保存到本地素材库");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "文件上传失败");
    } finally {
      setUploading(null);
    }
  };

  const publishPackageInput = {
    contentType,
    titleBase,
    descriptionBase,
    videoUrl: videoUrl || videoLocalPath,
    videoLocalPath,
    coverUrl: coverUrl || coverLocalPath,
    coverLocalPath,
    tags: splitTags(tags).map((tag) => tag.replace(/^#/, "")),
    durationSeconds: duration,
    owner,
    copyrightStatus: "owned" as const,
  };

  const canCreateAsset = Boolean(titleBase.trim() && descriptionBase.trim() && publishPackageInput.videoUrl.trim() && publishPackageInput.coverUrl.trim());
  const connectedAccountCount = state.accounts.filter((account) => selectedDraftAccountIds.includes(account.id) && account.status === "connected").length;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "400px 1fr" }, gap: 2 }}>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="本地发布包" subtitle="视频、封面、文案、话题和定时时间一次建好" />
        <Stack spacing={1.5}>
          <TextField label="基础标题" size="small" value={titleBase} onChange={(e) => setTitleBase(e.target.value)} />
          <TextField select label="分发类型" size="small" value={contentType} onChange={(e) => setContentType(e.target.value as DispatchContentType)}>
            {(Object.keys(contentTypeMeta) as DispatchContentType[]).map((type) => (
              <MenuItem key={type} value={type}>{contentTypeMeta[type].label} · {contentTypeMeta[type].helper}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="发布包文件夹"
            size="small"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="/Users/Apple_501/Desktop/发布包/0602选题"
          />
          <TextField label="发布文案" size="small" multiline minRows={4} value={descriptionBase} onChange={(e) => setDescriptionBase(e.target.value)} />
          <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
              <ContentTypeChip contentType={contentType} />
              <Button size="small" sx={softButtonSx} onClick={() => void navigator.clipboard?.writeText(titleBase).then(() => showToast("标题已复制"))} disabled={!titleBase.trim()}>
                复制标题
              </Button>
              <Button size="small" sx={softButtonSx} onClick={() => void navigator.clipboard?.writeText(descriptionBase).then(() => showToast("正文已复制"))} disabled={!descriptionBase.trim()}>
                复制正文
              </Button>
              <Button
                size="small"
                sx={softButtonSx}
                onClick={() => {
                  const hint = "封面建议：结果图/空间主体 + 8字内核心冲突 + 项目类型关键词";
                  setDescriptionBase((value) => (value.includes(hint) ? value : `${value.trim()}\n\n${hint}`.trim()));
                }}
              >
                自动封面建议
              </Button>
            </Stack>
            <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.6, mt: 0.65 }}>
              先定内容类型，再准备标题、正文、封面和标签；视频类型可继续进入 SAU 自动上传。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField label="视频路径/地址" size="small" value={videoUrl || videoLocalPath} onChange={(e) => { setVideoUrl(e.target.value); setVideoLocalPath(e.target.value.startsWith("/") || e.target.value.startsWith("~") ? e.target.value : ""); }} sx={{ flex: 1 }} />
            <Button size="small" component="label" disabled={uploading === "video"} sx={softButtonSx}>
              {uploading === "video" ? "上传中" : "上传视频"}
              <input hidden type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" onChange={(event) => void handleAssetFile("video", event)} />
            </Button>
          </Stack>
          {videoLocalPath && <Typography sx={{ fontSize: 11, color: "#047857", wordBreak: "break-all" }}>本地视频：{compactPath(videoLocalPath)}</Typography>}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField label="封面路径/地址" size="small" value={coverUrl || coverLocalPath} onChange={(e) => { setCoverUrl(e.target.value); setCoverLocalPath(e.target.value.startsWith("/") || e.target.value.startsWith("~") ? e.target.value : ""); }} sx={{ flex: 1 }} />
            <Button size="small" component="label" disabled={uploading === "cover"} sx={softButtonSx}>
              {uploading === "cover" ? "上传中" : "上传封面"}
              <input hidden type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void handleAssetFile("cover", event)} />
            </Button>
          </Stack>
          {coverLocalPath && <Typography sx={{ fontSize: 11, color: "#047857", wordBreak: "break-all" }}>本地封面：{compactPath(coverLocalPath)}</Typography>}
          <TextField label="@话题/标签，用逗号或空格分隔" size="small" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="选题, 干货, 案例复盘" />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            <TextField label="时长/秒" size="small" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value || 1))} />
            <TextField label="负责人" size="small" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </Box>
          <TextField
            label="定时发布时间"
            size="small"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Alert severity="info" sx={{ borderRadius: "8px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900 }}>将发布到 {selectedDraftAccountIds.length} 个账号，其中 {connectedAccountCount} 个已连接。</Typography>
            <Typography sx={{ fontSize: 12, lineHeight: 1.6, mt: 0.25 }}>文件夹可包含 video.mp4、cover.png、文案.txt、话题.txt、标题.txt；视频类型可走 SAU，其它类型先进入平台草稿和分发记录。</Typography>
          </Alert>
          <Button
            variant="contained"
            startIcon={<CalendarMonthOutlinedIcon />}
            disabled={!folderPath.trim() || !selectedDraftAccountIds.length || !scheduledAt || busy === "create-folder-package"}
            onClick={() => {
              onCreateFolderPackage({
                folderPath,
                contentType,
                accountIds: selectedDraftAccountIds,
                scheduledAt: new Date(scheduledAt).toISOString(),
                titleBase: titleBase.trim() || undefined,
                durationSeconds: duration,
                owner,
              });
              setFolderPath("");
              setTitleBase("");
              setScheduledAt("");
            }}
            sx={{ ...primaryDarkButtonSx, boxShadow: "none" }}
          >
            从文件夹生成定时任务
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!canCreateAsset || busy === "create-asset"}
            onClick={() => {
              onCreate(publishPackageInput);
              setTitleBase("");
              setDescriptionBase("");
              setVideoUrl("");
              setVideoLocalPath("");
              setCoverUrl("");
              setCoverLocalPath("");
              setTags("");
            }}
            sx={primaryDarkButtonSx}
          >
            新增资产
          </Button>
          <Button
            variant="contained"
            startIcon={<CalendarMonthOutlinedIcon />}
            disabled={!canCreateAsset || !selectedDraftAccountIds.length || !scheduledAt || busy === "create-publish-package"}
            onClick={() => {
              onCreatePackage(publishPackageInput, selectedDraftAccountIds, new Date(scheduledAt).toISOString());
              setTitleBase("");
              setDescriptionBase("");
              setVideoUrl("");
              setVideoLocalPath("");
              setCoverUrl("");
              setCoverLocalPath("");
              setTags("");
              setScheduledAt("");
            }}
            sx={{ ...primaryDarkButtonSx, boxShadow: "none" }}
          >
            生成定时发布任务
          </Button>
        </Stack>
      </Box>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="资产库" subtitle="先选目标账号，再生成矩阵草稿进入排期" />
        <Stack spacing={1} sx={{ mb: 1.4 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
            <Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 800 }}>
              草稿目标账号 {selectedDraftAccountIds.length}/{state.accounts.length}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
              <Button
                size="small"
                onClick={() => setSelectedDraftAccountIds(state.accounts.filter((account) => account.status !== "disabled").map((account) => account.id))}
                sx={softButtonSx}
              >
                全部可用账号
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedDraftAccountIds(state.accounts.filter((account) => account.status === "connected").map((account) => account.id))}
                sx={softButtonSx}
              >
                只选已登录
              </Button>
              <Button size="small" onClick={() => setSelectedDraftAccountIds([])} sx={softButtonSx}>
                清空
              </Button>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            {state.accounts.map((account) => {
              const checked = selectedDraftAccountIds.includes(account.id);
              return (
                <Button
                  key={account.id}
                  size="small"
                  variant={checked ? "contained" : "outlined"}
                  onClick={() => toggleDraftAccount(account.id)}
                  sx={checked ? primaryDarkButtonSx : softButtonSx}
                >
                  {account.displayName}
                </Button>
              );
            })}
          </Stack>
        </Stack>
        <Stack spacing={1}>
          {state.assets.map((asset) => {
            const draftCount = state.drafts.filter((draft) => draft.assetId === asset.id).length;
            return (
              <Box key={asset.id} sx={{ ...itemCardSx, p: 1.4 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.45, flexWrap: "wrap", rowGap: 0.45 }}>
                      <ContentTypeChip contentType={asset.contentType} />
                      <Typography sx={{ fontSize: 11, color: "#94A3B8", fontWeight: 800 }}>{contentTypeMeta[asset.contentType || "video"].helper}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: textPrimary }}>{asset.titleBase}</Typography>
                    <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.6, mt: 0.4 }}>{asset.descriptionBase}</Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={() => onGenerateDrafts(asset.id, selectedDraftAccountIds)}
                    disabled={!selectedDraftAccountIds.length || busy === `drafts-${asset.id}`}
                  >
                    生成矩阵草稿
                  </Button>
                </Box>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}>
                  <Chip label={`${asset.durationSeconds}s`} size="small" sx={{ height: 22, fontSize: 10 }} />
                  <Chip label={asset.videoLocalPath ? "本地视频" : "外链视频"} size="small" sx={{ height: 22, fontSize: 10, bgcolor: asset.videoLocalPath ? "#ecfdf5" : "#fff7ed", color: asset.videoLocalPath ? "#047857" : "#c2410c" }} />
                  <Chip label={`${draftCount} 个草稿`} size="small" sx={{ height: 22, fontSize: 10 }} />
                  {asset.tags.map((tag) => <Chip key={tag} label={tag} size="small" sx={{ height: 22, fontSize: 10 }} />)}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}

function AgentPanel({
  state,
  busy,
  tools,
  onPlan,
  onCreateClient,
  onRunPublishing,
}: {
  state: OpsState;
  busy: string | null;
  tools: AgentToolDefinition[];
  onPlan: (objective: string) => void;
  onCreateClient: (input: Parameters<typeof createOpsAgentClient>[0]) => void;
  onRunPublishing: (input: Parameters<typeof runOpsPublishingAgent>[0]) => void;
}) {
  const [objective, setObjective] = useState("根据已接入账号和现有素材生成多平台差异化发布排期");
  const [publishMode, setPublishMode] = useState<PublishingAgentMode>("create_tasks");
  const [clientName, setClientName] = useState("外部运营 Agent");
  const [clientPublishAccess, setClientPublishAccess] = useState("assist");
  const [clientAccountId, setClientAccountId] = useState("all");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(state.accounts.map((account) => account.id));
  const recentRuns = state.publishingAgentRuns.slice(0, 5);
  const recentCalls = state.agentToolCallLogs.slice(0, 6);
  const externalClients = state.agentClients.filter((client) => client.kind === "external");

  useEffect(() => {
    setSelectedAccountIds((current) => current.filter((id) => state.accounts.some((account) => account.id === id)));
  }, [state.accounts]);

  const togglePublishAccount = (id: string) => {
    setSelectedAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const selectAllPublishAccounts = () => {
    setSelectedAccountIds(state.accounts.filter((account) => account.status !== "disabled").map((account) => account.id));
  };

  const clearPublishAccounts = () => {
    setSelectedAccountIds([]);
  };

  const createClient = () => {
    onCreateClient({
      name: clientName,
      canExecutePublish: clientPublishAccess === "publish",
      allowedAccountIds: clientAccountId === "all" ? [] : [clientAccountId],
      notes: clientPublishAccess === "publish" ? "允许在确认后运行发布 Agent" : "仅允许生成计划、草稿、诊断和采集",
    });
  };
  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricCard icon={<AutoAwesomeOutlinedIcon />} label="Agent 连接" value={state.agentClients.length} />
        <MetricCard icon={<PlayArrowIcon />} label="发布运行" value={state.publishingAgentRuns.length} />
        <MetricCard icon={<TaskAltIcon />} label="工具调用" value={state.agentToolCallLogs.length} />
        <MetricCard icon={<OpenInNewIcon />} label="可用工具" value={tools.length} />
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="内置发布 Agent" subtitle="生成计划、创建任务，并在安全边界内推进执行" />
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ alignItems: { md: "center" } }}>
          <TextField fullWidth size="small" label="目标" value={objective} onChange={(e) => setObjective(e.target.value)} />
          <TextField select size="small" label="运行模式" value={publishMode} onChange={(e) => setPublishMode(e.target.value as PublishingAgentMode)} sx={{ minWidth: 180 }}>
            <MenuItem value="plan_only">只生成计划</MenuItem>
            <MenuItem value="create_tasks">创建任务</MenuItem>
            <MenuItem value="approve_ready">审核可发任务</MenuItem>
            <MenuItem value="execute_ready">执行可发任务</MenuItem>
          </TextField>
        </Stack>
        <Stack spacing={1} sx={{ mt: 1.2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 800 }}>
              发布账号 {selectedAccountIds.length || state.accounts.length}/{state.accounts.length}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
              <Button size="small" onClick={selectAllPublishAccounts} sx={softButtonSx}>
                全选可用账号
              </Button>
              <Button size="small" onClick={clearPublishAccounts} sx={softButtonSx}>
                清空
              </Button>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            {state.accounts.map((account) => {
              const checked = selectedAccountIds.includes(account.id);
              return (
                <Button
                  key={account.id}
                  size="small"
                  variant={checked ? "contained" : "outlined"}
                  onClick={() => togglePublishAccount(account.id)}
                  sx={checked ? primaryDarkButtonSx : softButtonSx}
                >
                  {account.displayName}
                </Button>
              );
            })}
          </Stack>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 1.3 }}>
          <Button
            variant="outlined"
            startIcon={<AutoAwesomeOutlinedIcon />}
            disabled={busy === "agent-plan"}
            onClick={() => onPlan(objective)}
            sx={{ borderRadius: "8px", fontWeight: 800 }}
          >
            生成排期计划
          </Button>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            disabled={busy === "publishing-agent"}
            onClick={() => onRunPublishing({ objective, accountIds: selectedAccountIds, mode: publishMode, confirmed: publishMode === "execute_ready" })}
            sx={primaryDarkButtonSx}
          >
            运行发布 Agent
          </Button>
        </Stack>
        <Alert severity="info" sx={{ mt: 1.4, borderRadius: "8px" }}>
          当前执行遵守运行模式：Dry Run 只记录模拟发布，Browser Prepare 只打开工作台，Upload Prepare 会准备上传和填写；Social Auto Upload 会调用本地 sau CLI 执行上传。
        </Alert>
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="Agent 接入" subtitle="外部 Agent 通过工具清单和统一调用入口操控项目" />
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: "8px" }}>
          外部 Agent 调用写入或执行类工具时必须传已登记的 clientId；匿名调用只允许读取只读状态。
        </Alert>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.2, mb: 1.5 }}>
          <Box sx={{ p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#f8fafc", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
            <Typography sx={{ fontSize: 11, color: textMuted, mb: 0.4 }}>Manifest</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: textPrimary, fontFamily: "monospace" }}>GET /api/ops/agent/manifest</Typography>
          </Box>
          <Box sx={{ p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#f8fafc", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
            <Typography sx={{ fontSize: 11, color: textMuted, mb: 0.4 }}>工具清单</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: textPrimary, fontFamily: "monospace" }}>GET /api/ops/agent/tools</Typography>
          </Box>
          <Box sx={{ p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#f8fafc", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
            <Typography sx={{ fontSize: 11, color: textMuted, mb: 0.4 }}>工具调用</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: textPrimary, fontFamily: "monospace" }}>POST /api/ops/agent/invoke</Typography>
          </Box>
          <Box sx={{ p: 1.2, border: "1px solid #e7edf5", borderRadius: "8px", bgcolor: "#f8fafc", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
            <Typography sx={{ fontSize: 11, color: textMuted, mb: 0.4 }}>发布运行</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: textPrimary, fontFamily: "monospace" }}>POST /api/ops/agent/publishing-runs</Typography>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr 1fr auto" }, gap: 1, mb: 1.5 }}>
          <TextField size="small" label="连接名称" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          <TextField select size="small" label="权限" value={clientPublishAccess} onChange={(e) => setClientPublishAccess(e.target.value)}>
            <MenuItem value="assist">诊断/排期</MenuItem>
            <MenuItem value="publish">可确认发布</MenuItem>
          </TextField>
          <TextField select size="small" label="账号范围" value={clientAccountId} onChange={(e) => setClientAccountId(e.target.value)}>
            <MenuItem value="all">全部账号</MenuItem>
            {state.accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.displayName}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={createClient} disabled={busy === "agent-client" || !clientName.trim()} sx={primaryDarkButtonSx}>
            新增连接
          </Button>
        </Box>

        <Stack spacing={0.8} sx={{ mb: 1.5 }}>
          {state.agentClients.length ? state.agentClients.map((client) => (
            <AgentClientCard key={client.id} client={client} />
          )) : <Empty text="暂无 Agent 连接。" />}
        </Stack>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="工具权限" subtitle={`${externalClients.length} 个外部连接 · ${tools.length} 个工具`} />
        <Stack spacing={0.8}>
          {tools.length ? tools.map((tool) => (
            <Box key={tool.name} sx={{ ...itemCardSx, p: 1.2, display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary }}>{tool.title}</Typography>
                <Typography sx={{ fontSize: 11, color: textMuted, fontFamily: "monospace", mt: 0.2 }}>{tool.name}</Typography>
              </Box>
              <Stack direction="row" spacing={0.6}>
                {tool.readOnly && <Chip label="read" size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800 }} />}
                {tool.requiresConfirmation && <Chip label="confirm" size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: "#fff7ed", color: "#c2410c" }} />}
              </Stack>
            </Box>
          )) : <Empty text="工具清单加载中。" />}
        </Stack>
        </Box>
        <Box sx={{ ...cardSx, p: 2 }}>
          <SectionTitle title="调用日志" subtitle="最近外部或内置 Agent 工具调用" />
          <Stack spacing={0.8}>
            {recentCalls.length ? recentCalls.map((call) => (
              <Box key={call.id} sx={{ ...itemCardSx, p: 1.2 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                  <Chip label={call.ok ? "ok" : "blocked"} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: call.ok ? "#ecfdf5" : "#fff7ed", color: call.ok ? "#047857" : "#c2410c" }} />
                  {call.requiresConfirmation && <Chip label="confirm" size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: "#fff7ed", color: "#c2410c" }} />}
                </Stack>
                <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, mt: 0.6 }}>{call.tool}</Typography>
                <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25 }}>{call.clientName} · {call.resultSummary || call.message} · {formatTime(call.createdAt)}</Typography>
              </Box>
            )) : <Empty text="暂无工具调用日志。" />}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="发布 Agent 运行" subtitle="最近生成和执行的发布运行记录" />
        <Stack spacing={1}>
          {recentRuns.length ? recentRuns.map((run) => (
            <Box key={run.id} sx={{ ...itemCardSx, p: 1.4 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                <StatusChip value={run.status} />
                <Chip label={run.mode} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800 }} />
                {run.executedTaskIds.length > 0 && <Chip label={`执行 ${run.executedTaskIds.length}`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: "#ecfdf5", color: "#047857" }} />}
                {run.blockedTaskIds.length > 0 && <Chip label={`阻塞 ${run.blockedTaskIds.length}`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: "#fff7ed", color: "#c2410c" }} />}
              </Stack>
              <Typography sx={{ fontSize: 14, fontWeight: 900, color: textPrimary, mt: 0.7 }}>{run.objective}</Typography>
              <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.35 }}>{run.summary}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: 0.7 }}>{formatTime(run.createdAt)} · 计划 {run.planId?.slice(0, 8) || "-"}</Typography>
            </Box>
          )) : <Empty text="暂无发布 Agent 运行记录。" />}
        </Stack>
        {state.plans.length ? (
          <>
            <Divider sx={{ my: 1.8 }} />
            <SectionTitle title="排期计划" subtitle="最近生成的计划记录" />
            <Stack spacing={1}>
              {state.plans.slice(0, 4).map((plan) => (
                <Box key={plan.id} sx={{ ...itemCardSx, p: 1.2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary }}>{plan.objective}</Typography>
                  <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.35 }}>{plan.summary}</Typography>
                  <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: 0.6 }}>草稿 {plan.draftIds.length} 个 · 任务 {plan.taskIds.length} 个 · {formatTime(plan.createdAt)}</Typography>
                </Box>
              ))}
            </Stack>
          </>
        ) : null}
      </Box>
    </Stack>
  );
}

function AgentClientCard({ client }: { client: AgentClient }) {
  return (
    <Box sx={{ ...itemCardSx, p: 1.2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
          <StatusChip value={client.kind} />
          <StatusChip value={client.status} />
          {client.canExecutePublish && <Chip label="publish" size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: "#fff7ed", color: "#c2410c" }} />}
        </Stack>
        <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, mt: 0.55 }}>{client.name}</Typography>
        <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.25 }}>
          工具 {client.allowedTools.length} 个 · 账号 {client.allowedAccountIds.length || "全部"} · {client.lastSeenAt ? `${formatTime(client.lastSeenAt)} 调用` : "尚未调用"}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", mt: 0.45, wordBreak: "break-all" }}>
          clientId: {client.id}
        </Typography>
      </Box>
    </Box>
  );
}

function TasksPanel({
  state,
  runtime,
  busy,
  onCreateTask,
  onApprove,
  onExecute,
  onBatchApprove,
  onBatchExecute,
  onDiagnoseDraft,
}: {
  state: OpsState;
  runtime: OpsRuntime | null;
  busy: string | null;
  onCreateTask: (draftId: string) => void;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onBatchApprove: (taskIds: string[]) => void;
  onBatchExecute: (taskIds: string[]) => void;
  onDiagnoseDraft: (draft: PlatformDraft) => void;
}) {
  const [taskView, setTaskView] = useState<"queue" | "calendar">("queue");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const sortedTasks = useMemo(() => [...state.tasks].sort((a, b) => taskTimeValue(a) - taskTimeValue(b)), [state.tasks]);
  const queueSelectableTaskIds = useMemo(
    () => sortedTasks.filter((task) => task.status === "pending_review" || task.status === "scheduled").map((task) => task.id),
    [sortedTasks],
  );
  const selectedPendingReviewIds = useMemo(
    () => sortedTasks.filter((task) => selectedTaskIds.includes(task.id) && task.status === "pending_review").map((task) => task.id),
    [selectedTaskIds, sortedTasks],
  );
  const selectedExecutableIds = useMemo(
    () => sortedTasks.filter((task) => selectedTaskIds.includes(task.id) && task.status === "scheduled").map((task) => task.id),
    [selectedTaskIds, sortedTasks],
  );

  useEffect(() => {
    setSelectedTaskIds((current) => current.filter((id) => state.tasks.some((task) => task.id === id)));
  }, [state.tasks]);

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(420px, 1fr) minmax(420px, 1fr)" }, gap: 2, minWidth: 0 }}>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle title="平台草稿" subtitle="按平台生态生成的差异化标题、正文和标签" />
        <Stack spacing={1}>
          {state.drafts.length ? state.drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              state={state}
              onCreateTask={onCreateTask}
              onDiagnoseDraft={onDiagnoseDraft}
              busy={busy}
            />
          )) : <Empty text="暂无草稿，先到视频资产页生成。" />}
        </Stack>
      </Box>
      <Box sx={{ ...cardSx, p: 2 }}>
        <SectionTitle
          title="发布任务"
          subtitle={runtime?.publisherRunMode === "social_auto_upload" ? "当前执行会调用本地 social-auto-upload；抖音、小红书可自动提交，视频号走人工接管" : "当前执行为 dry-run 或人工接管模式，不会自动向平台提交作品"}
          action={
            <ButtonGroup size="small" variant="outlined" sx={{ "& .MuiButton-root": { fontSize: 11, fontWeight: 800, borderRadius: "8px" } }}>
              <Button variant={taskView === "queue" ? "contained" : "outlined"} onClick={() => setTaskView("queue")} sx={{ bgcolor: taskView === "queue" ? "#1E40AF" : "transparent" }}>
                队列
              </Button>
              <Button variant={taskView === "calendar" ? "contained" : "outlined"} onClick={() => setTaskView("calendar")} sx={{ bgcolor: taskView === "calendar" ? "#1E40AF" : "transparent" }}>
                日历
              </Button>
            </ButtonGroup>
          }
        />
        <DispatchRecordSummary state={state} />
        <TaskStatusSummary tasks={state.tasks} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.2, alignItems: { sm: "center" } }}>
          <Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 800 }}>
            已选任务 {selectedTaskIds.length}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            <Button size="small" onClick={() => setSelectedTaskIds(queueSelectableTaskIds)} sx={softButtonSx}>
              选中可执行
            </Button>
            <Button size="small" onClick={() => setSelectedTaskIds([])} sx={softButtonSx}>
              清空
            </Button>
            <Button size="small" disabled={!selectedPendingReviewIds.length || busy?.startsWith("tasks-batch")} onClick={() => onBatchApprove(selectedPendingReviewIds)} sx={softButtonSx}>
              批量审核
            </Button>
            <Button size="small" disabled={!selectedExecutableIds.length || busy?.startsWith("tasks-batch")} onClick={() => onBatchExecute(selectedExecutableIds)} sx={softButtonSx}>
              批量执行
            </Button>
          </Stack>
        </Stack>
        {taskView === "queue" ? (
          <TaskQueueView
            tasks={sortedTasks}
            state={state}
            busy={busy}
            onApprove={onApprove}
            onExecute={onExecute}
            selectedTaskIds={selectedTaskIds}
            onToggleSelect={toggleTaskSelection}
          />
        ) : (
          <TaskCalendarView tasks={sortedTasks} state={state} busy={busy} onApprove={onApprove} onExecute={onExecute} />
        )}
      </Box>
    </Box>
  );
}

function DispatchRecordSummary({ state }: { state: OpsState }) {
  const records = state.tasks.map((task) => {
    const draft = state.drafts.find((item) => item.id === task.draftId);
    const asset = draft ? state.assets.find((item) => item.id === draft.assetId) : undefined;
    return { task, draft, asset, contentType: asset?.contentType || "video" as DispatchContentType };
  });
  const recent = records.slice(0, 4);
  const success = records.filter((item) => item.task.status === "published").length;
  const failed = records.filter((item) => item.task.status === "failed").length;
  const waiting = records.filter((item) => item.task.status === "scheduled" || item.task.status === "pending_review").length;

  return (
    <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.15, mb: 1.2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
          <Chip label={`发布记录 ${records.length}`} size="small" sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: "#fff", color: textPrimary }} />
          <Chip label={`成功 ${success}`} size="small" sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: "#ECFDF5", color: "#047857" }} />
          <Chip label={`等待 ${waiting}`} size="small" sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: "#EFF6FF", color: "#1D4ED8" }} />
          <Chip label={`失败 ${failed}`} size="small" sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: failed ? "#FEF2F2" : "#F1F5F9", color: failed ? "#DC2626" : textMuted }} />
        </Stack>
        <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>
          记录视角承接小火花的分发结果回流：失败任务优先排查，人工接管保留日志。
        </Typography>
      </Stack>
      {recent.length > 0 && (
        <Stack spacing={0.55} sx={{ mt: 1 }}>
          {recent.map(({ task, draft, asset, contentType }) => (
            <Box key={task.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "72px 1fr 84px" }, gap: 0.8, alignItems: "center" }}>
              <ContentTypeChip contentType={contentType} />
              <Typography sx={{ fontSize: 12, color: textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {draft?.title || asset?.titleBase || "未关联草稿"} · {platformLabels[task.platform]} · {formatTime(task.scheduledAt)}
              </Typography>
              <StatusChip value={task.status} />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function TaskStatusSummary({ tasks }: { tasks: PublishTask[] }) {
  const items = [
    { status: "pending_review", count: tasks.filter((task) => task.status === "pending_review").length },
    { status: "scheduled", count: tasks.filter((task) => task.status === "scheduled").length },
    { status: "manual_takeover", count: tasks.filter((task) => task.status === "manual_takeover").length },
    { status: "published", count: tasks.filter((task) => task.status === "published").length },
    { status: "failed", count: tasks.filter((task) => task.status === "failed").length },
  ].filter((item) => item.count > 0);

  if (!items.length) return null;
  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, mb: 1.2 }}>
      {items.map((item) => {
        const meta = statusMeta[item.status];
        return (
          <Chip
            key={item.status}
            label={`${meta.label} ${item.count}`}
            size="small"
            sx={{ height: 22, fontSize: 10, fontWeight: 800, bgcolor: meta.bg, color: meta.color }}
          />
        );
      })}
    </Stack>
  );
}

function TaskQueueView({
  tasks,
  state,
  busy,
  onApprove,
  onExecute,
  selectedTaskIds,
  onToggleSelect,
}: {
  tasks: PublishTask[];
  state: OpsState;
  busy: string | null;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  selectedTaskIds: string[];
  onToggleSelect: (taskId: string) => void;
}) {
  return (
    <Stack spacing={1}>
      {tasks.length ? tasks.map((task) => (
        <TaskActionCard
          key={task.id}
          task={task}
          state={state}
          busy={busy}
          onApprove={onApprove}
          onExecute={onExecute}
          selectedForBatch={selectedTaskIds.includes(task.id)}
          onToggleSelect={onToggleSelect}
        />
      )) : <Empty text="暂无任务，从草稿创建任务或生成 Agent 计划。" />}
    </Stack>
  );
}

function TaskCalendarView({
  tasks,
  state,
  busy,
  onApprove,
  onExecute,
}: {
  tasks: PublishTask[];
  state: OpsState;
  busy: string | null;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
}) {
  const days = buildCalendarDays(tasks);
  const tasksByDay = new Map<string, PublishTask[]>();
  tasks.forEach((task) => {
    const key = localDayKey(task.scheduledAt);
    tasksByDay.set(key, [...(tasksByDay.get(key) || []), task]);
  });

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(128px, 1fr))", gap: 1, overflowX: "auto" }}>
      {days.map((day) => {
        const dayTasks = tasksByDay.get(localDayKey(day)) || [];
        return (
          <Box key={localDayKey(day)} sx={{ border: "1px solid #e7edf5", borderRadius: "8px", minHeight: 132, overflow: "hidden", bgcolor: "#fbfdff", boxShadow: "0 4px 14px rgba(15,23,42,0.04)" }}>
            <Box sx={{ px: 1, py: 0.8, bgcolor: "#f8fafc", borderBottom: "1px solid #eef2f7" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary }}>
                {new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(day)}
              </Typography>
              <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day)}
              </Typography>
            </Box>
            <Stack spacing={0.8} sx={{ p: 0.8 }}>
              {dayTasks.length ? dayTasks.map((task) => (
                <CalendarTaskCard
                  key={task.id}
                  task={task}
                  state={state}
                  busy={busy}
                  onApprove={onApprove}
                  onExecute={onExecute}
                />
              )) : (
                <Typography sx={{ fontSize: 11, color: "#cbd5e1", textAlign: "center", py: 2 }}>空档</Typography>
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

function CalendarTaskCard({
  task,
  state,
  busy,
  onApprove,
  onExecute,
}: {
  task: PublishTask;
  state: OpsState;
  busy: string | null;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
}) {
  const account = state.accounts.find((item) => item.id === task.accountId);
  const draft = state.drafts.find((item) => item.id === task.draftId);
  return (
    <Box sx={{ ...itemCardSx, p: 0.9 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
        <PlatformChip platform={task.platform} />
        <StatusChip value={task.status} />
      </Stack>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: textPrimary, lineHeight: 1.45, mt: 0.6 }}>
        {draft?.title || "草稿缺失"}
      </Typography>
      <Typography sx={{ fontSize: 10, color: textMuted, mt: 0.4 }}>
        {account?.displayName || "未知账号"} · {formatTime(task.scheduledAt)}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.7, flexWrap: "wrap", rowGap: 0.5 }}>
        {task.status === "pending_review" && <Button size="small" onClick={() => onApprove(task.id)} disabled={busy === `approve-${task.id}`} sx={{ minWidth: 0, fontSize: 10 }}>审核</Button>}
        <Button size="small" startIcon={<PlayArrowIcon sx={{ fontSize: 12 }} />} onClick={() => onExecute(task.id)} disabled={busy === `execute-${task.id}`} sx={{ minWidth: 0, fontSize: 10 }}>
          执行
        </Button>
      </Stack>
    </Box>
  );
}

function DraftCard({
  draft,
  state,
  busy,
  onCreateTask,
  onDiagnoseDraft,
}: {
  draft: PlatformDraft;
  state: OpsState;
  busy: string | null;
  onCreateTask: (draftId: string) => void;
  onDiagnoseDraft: (draft: PlatformDraft) => void;
}) {
  const account = state.accounts.find((item) => item.id === draft.accountId);
  return (
    <Box sx={{ ...itemCardSx, p: 1.45 }}>
      <Stack direction="row" spacing={0.75} sx={{ mb: 0.75, alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
        <PlatformChip platform={draft.platform} />
        <StatusChip value={draft.readiness} />
        <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{account?.displayName || "未知账号"}</Typography>
      </Stack>
      <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary, lineHeight: 1.45 }}>{draft.title}</Typography>
      <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.6, mt: 0.5, whiteSpace: "pre-wrap" }}>
        {draft.description}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}>
        {draft.tags.map((tag) => <Chip key={tag} label={tag} size="small" sx={{ height: 22, fontSize: 10 }} />)}
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
        <Button size="small" onClick={() => onCreateTask(draft.id)} disabled={busy === `task-${draft.id}`}>创建任务</Button>
        <Button size="small" startIcon={<TroubleshootIcon sx={{ fontSize: 14 }} />} onClick={() => onDiagnoseDraft(draft)}>诊断草稿</Button>
      </Stack>
    </Box>
  );
}

function AccountRow({
  account,
  runtime,
  compact = false,
  selected = false,
  selectedForBatch = false,
  leadingControl,
  actions,
}: {
  account: OpsAccount;
  runtime?: OpsRuntime | null;
  compact?: boolean;
  selected?: boolean;
  selectedForBatch?: boolean;
  leadingControl?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        ...itemCardSx,
        p: compact ? 1.1 : 1.45,
        border: selected ? "1px solid #1E40AF" : itemCardSx.border,
        display: "flex",
        alignItems: "center",
        gap: 1.2,
        justifyContent: "space-between",
        bgcolor: selectedForBatch ? "#F8FAFF" : selected ? "#EFF6FF" : "#fff",
      }}
    >
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "flex-start", gap: 1 }}>
        {leadingControl}
        <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap", rowGap: 0.75 }}>
          <PlatformChip platform={account.platform} />
          <StatusChip value={account.authType} />
          <StatusChip value={account.status} />
          <StatusChip value={account.sessionHealth} />
          {account.browserProxyEnabled && <Chip label="代理" size="small" sx={{ height: 23, fontSize: 10, fontWeight: 900, bgcolor: "#f0f9ff", color: "#0369a1", border: "1px solid rgba(14,165,233,0.18)" }} />}
        </Stack>
        <Typography sx={{ fontSize: 13, fontWeight: 900, color: textPrimary }}>{account.displayName}</Typography>
        <Typography sx={{ fontSize: 12, color: textMuted }}>{account.handle} · {account.profile || "未填写定位"}</Typography>
        <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: 0.35 }}>
          登录档案：{compactPath(account.browserProfileDir)}{account.browserProxyEnabled ? ` · 代理 ${account.browserProxyServer || "未配置"}` : ""}{account.workspaceOpenedAt ? ` · ${formatTime(account.workspaceOpenedAt)} 打开` : ""}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#047857", mt: 0.25 }}>
          SAU account：{sauAccountNameForDisplay(account, runtime)}
        </Typography>
      </Box>
      </Box>
      {actions}
    </Box>
  );
}

function TaskActionCard({
  task,
  state,
  busy,
  onApprove,
  onExecute,
  selectedForBatch = false,
  onToggleSelect,
}: {
  task: PublishTask;
  state: OpsState;
  busy: string | null;
  onApprove: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  selectedForBatch?: boolean;
  onToggleSelect?: (taskId: string) => void;
}) {
  const visibleLogs = task.logs.slice(0, 12).reverse();
  return (
    <Box sx={{ ...itemCardSx, p: 1.45, bgcolor: selectedForBatch ? "#F8FAFF" : "#fff" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Checkbox
          size="small"
          checked={selectedForBatch}
          onChange={() => onToggleSelect?.(task.id)}
          disabled={!onToggleSelect}
          sx={{ p: 0.2, color: "#94A3B8", "&.Mui-checked": { color: "#1E40AF" } }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TaskRow task={task} state={state} />
        </Box>
      </Stack>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
        {task.status === "pending_review" && <Button size="small" onClick={() => onApprove(task.id)} disabled={busy === `approve-${task.id}`}>审核通过</Button>}
        <Button size="small" startIcon={<PlayArrowIcon sx={{ fontSize: 14 }} />} onClick={() => onExecute(task.id)} disabled={busy === `execute-${task.id}`}>执行</Button>
      </Stack>
      {visibleLogs.length ? (
        <Stack spacing={0.55} sx={{ mt: 1, borderTop: "1px solid #e5e7eb", pt: 1 }}>
          {visibleLogs.map((row, index) => (
            <Box key={`${task.id}-${row.at}-${row.message}-${index}`} sx={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 0.75, alignItems: "start" }}>
              <Box sx={{ width: 18, height: 18, borderRadius: "999px", bgcolor: row.level === "error" ? "#fee2e2" : row.level === "warn" ? "#fef3c7" : "#eff6ff", color: row.level === "error" ? "#dc2626" : row.level === "warn" ? "#b45309" : "#1d4ed8", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 950 }}>
                {index + 1}
              </Box>
              <Typography sx={{ fontSize: 11, lineHeight: 1.55, color: row.level === "error" ? "#dc2626" : row.level === "warn" ? "#b45309" : textMuted }}>
                {formatTime(row.at)} · {row.message}
              </Typography>
            </Box>
          ))}
          {task.logs.length > visibleLogs.length && (
            <Typography sx={{ fontSize: 10.5, color: "#94a3b8" }}>仅展示最近 {visibleLogs.length} 条流程日志</Typography>
          )}
        </Stack>
      ) : null}
    </Box>
  );
}

function TaskRow({ task, state }: { task: PublishTask; state: OpsState }) {
  const account = state.accounts.find((item) => item.id === task.accountId);
  const draft = state.drafts.find((item) => item.id === task.draftId);
  const asset = state.assets.find((item) => item.id === draft?.assetId);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
        <PlatformChip platform={task.platform} />
        <StatusChip value={task.status} />
        <Chip label={task.executionMode} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800 }} />
      </Stack>
      <Typography sx={{ fontSize: 13, fontWeight: 800, color: textPrimary, mt: 0.65 }}>
        {draft?.title || "草稿缺失"}
      </Typography>
      <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>
        {account?.displayName || "未知账号"} · {asset?.titleBase || "未知资产"} · {formatTime(task.scheduledAt)}
      </Typography>
      {task.errorMessage && <Typography sx={{ fontSize: 11, color: "#dc2626", mt: 0.45 }}>{task.errorMessage}</Typography>}
    </Box>
  );
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 950, color: textPrimary, lineHeight: 1.2 }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.35, lineHeight: 1.45 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  );
}

function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <Box sx={{ border: "1px dashed #cbd5e1", borderRadius: "8px", p: 2.2, textAlign: "center", color: textMuted, fontSize: 12, bgcolor: "#f8fafc" }}>
      <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.55 }}>{text}</Typography>
      {action && <Box sx={{ mt: 1.2, display: "flex", justifyContent: "center" }}>{action}</Box>}
    </Box>
  );
}

const legacyOpsPanelReferences = [
  Overview,
  CreatorCoachPanel,
  ViralContentPanel,
  MetricCollectorsPanel,
  DirectMessagesPanel,
  PriorityCommandBar,
  AccountsPanel,
  AssetsPanel,
  AgentPanel,
  TasksPanel,
  acknowledgeDirectMessageAlert,
  applyDiagnosisAction,
  checkDirectMessages,
  collectAccountMetrics,
  convertViralContentToAsset,
  createOpsAgentPlan,
  generateOpsDrafts,
  generateCreatorCoach,
  recordAccountMetricSnapshot,
  recordDirectMessageEvent,
  seedViralContent,
  updateAccountMemory,
  updateDirectMessageMonitor,
];
void legacyOpsPanelReferences;
