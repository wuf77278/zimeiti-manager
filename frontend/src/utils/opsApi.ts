import api from "./api";

export function isOpsFrontendEnabled() {
  return String(import.meta.env.VITE_ENABLE_OPS || "").toLowerCase() === "true";
}

export type OpsPlatform = "douyin" | "xiaohongshu" | "wechat_channels";
export type AccountStatus = "connected" | "needs_login" | "disabled";
export type AuthType = "oauth" | "browser_session" | "manual";
export type TaskStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "publishing"
  | "published"
  | "manual_takeover"
  | "failed"
  | "retrying"
  | "cancelled";
export type ExecutionMode = "api" | "browser" | "manual_takeover";
export type DirectMessageSource = "browser_session" | "official_api" | "webhook" | "manual";
export type DirectMessageMonitorStatus = "active" | "paused" | "needs_login" | "unsupported";
export type DirectMessageAlertStatus = "unread" | "acknowledged";
export type AccountDiagnosisSource = "local_snapshot" | "browser_session" | "official_api";
export type MetricSource = "manual" | "simulated" | "browser_session" | "official_api" | "webhook" | "seed";
export type MetricCollectorSource = "simulated" | "browser_session" | "official_api";
export type MetricCollectionStatus = "queued" | "running" | "succeeded" | "failed" | "needs_login" | "unsupported";
export type AgentClientKind = "external" | "internal";
export type AgentClientStatus = "active" | "paused";
export type PublishingAgentMode = "plan_only" | "create_tasks" | "approve_ready" | "execute_ready";
export type PublishingAgentRunStatus = "completed" | "blocked" | "failed";
export type DiagnosisActionKind = "title_hook" | "script_revision" | "comment_reply" | "publish_task";
export type DiagnosisActionPriority = "high" | "medium" | "low";
export type ViralContentSource = "public_research" | "manual" | "platform_observation" | "account_data";
export type DispatchContentType = "video" | "article" | "dynamic" | "story";
export type CreatorDataSource = "browser_bridge" | "manual" | "official_api" | "import";
export type CreatorCommentSentiment = "positive" | "neutral" | "negative" | "question" | "lead";
export type CreatorCommentReplyStatus = "unknown" | "unreplied" | "replied" | "drafted" | "approved" | "ignored";
export type CreatorCommentReplyAction = "approve" | "mark_replied" | "ignore" | "reset";

export interface AccountMemory {
  targetAudience: string[];
  contentPillars: string[];
  conversionGoal: string;
  personaTone: string;
  highPerformingPatterns: string[];
  lowPerformingPatterns: string[];
  avoidTopics: string[];
  commentStrategy: string;
  privateDomainStrategy: string;
  updatedAt?: string | null;
}

export interface OpsAccount {
  id: string;
  platform: OpsPlatform;
  displayName: string;
  handle: string;
  status: AccountStatus;
  authType: AuthType;
  profile: string;
  dailyPublishLimit: number;
  publishedToday: number;
  sessionHealth: "healthy" | "expired" | "unknown";
  workspaceUrl?: string | null;
  browserProfileDir?: string | null;
  workspaceOpenedAt?: string | null;
  browserProxyEnabled: boolean;
  browserProxyServer: string;
  browserProxyBypassList: string;
  sauAccountName: string;
  memory: AccountMemory;
  createdAt: string;
  updatedAt: string;
}

export interface OpsAsset {
  id: string;
  contentType: DispatchContentType;
  titleBase: string;
  descriptionBase: string;
  videoUrl: string;
  videoLocalPath: string;
  coverUrl: string;
  coverLocalPath: string;
  tags: string[];
  durationSeconds: number;
  owner: string;
  copyrightStatus: "owned" | "licensed" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface PlatformDraft {
  id: string;
  assetId: string;
  accountId: string;
  platform: OpsPlatform;
  title: string;
  description: string;
  tags: string[];
  coverUrl: string;
  publishOptions: Record<string, string | number | boolean | string[]>;
  readiness: "ready" | "needs_review" | "blocked";
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionLog {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface PublishTask {
  id: string;
  platform: OpsPlatform;
  accountId: string;
  draftId: string;
  scheduledAt: string;
  status: TaskStatus;
  executionMode: ExecutionMode;
  retryCount: number;
  errorMessage?: string;
  platformItemId?: string;
  logs: ExecutionLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlan {
  id: string;
  objective: string;
  summary: string;
  accountIds: string[];
  assetIds: string[];
  draftIds: string[];
  taskIds: string[];
  createdAt: string;
}

export interface AgentClient {
  id: string;
  name: string;
  kind: AgentClientKind;
  status: AgentClientStatus;
  allowedTools: string[];
  allowedAccountIds: string[];
  canExecutePublish: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string | null;
}

export interface AgentToolCallLog {
  id: string;
  clientId?: string | null;
  clientName: string;
  tool: string;
  ok: boolean;
  message: string;
  requiresConfirmation: boolean;
  arguments: Record<string, unknown>;
  resultSummary: string;
  createdAt: string;
}

export interface PublishingAgentRun {
  id: string;
  objective: string;
  mode: PublishingAgentMode;
  status: PublishingAgentRunStatus;
  accountIds: string[];
  assetIds: string[];
  planId?: string | null;
  draftIds: string[];
  taskIds: string[];
  executedTaskIds: string[];
  blockedTaskIds: string[];
  summary: string;
  logs: ExecutionLog[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentPattern {
  key: string;
  title: string;
  goal: string;
  suitablePlatforms: OpsPlatform[];
  bestFor: string;
  titleFormula: string;
  hookTemplate: string;
  scriptStructure: string[];
  coverSuggestion: string;
  commentStrategy: string;
  reuseSignal: string;
}

export interface CreatorProfile {
  role: string;
  stage: string;
  strengths: string[];
  weaknesses: string[];
  constraints: string[];
  summary: string;
  readinessScore: number;
}

export interface ContentIdea {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  patternKey: string;
  goal: string;
  title: string;
  hook: string;
  outline: string[];
  materialChecklist: string[];
  reason: string;
  cta: string;
  tags: string[];
  score: number;
}

export interface CreatorCoachReport {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  profile: CreatorProfile;
  recommendedPatterns: ContentPattern[];
  ideas: ContentIdea[];
  nextActions: string[];
  createdAt: string;
}

export interface ViralContentItem {
  id: string;
  platform: OpsPlatform;
  track: string;
  title: string;
  creatorName: string;
  sourceUrl: string;
  sourceType: ViralContentSource;
  publishDate: string;
  durationSeconds: number;
  hotScore: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  hook: string;
  structure: string[];
  visualNotes: string[];
  commentSignals: string[];
  reusableAngles: string[];
  riskNotes: string[];
  tags: string[];
  adaptationTitle: string;
  adaptationScript: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetricSnapshot {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  source: MetricSource;
  periodDays: number;
  followers: number;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  avgViewDurationSeconds?: number | null;
  threeSecondRetentionRate?: number | null;
  completionRate?: number | null;
  replayRate?: number | null;
  followConversionRate?: number | null;
  profileVisitRate?: number | null;
  searchImpressionRate?: number | null;
  localTrafficRate?: number | null;
  socialShareRate?: number | null;
  friendLikeRate?: number | null;
  privateDomainClickRate?: number | null;
  officialAccountClickRate?: number | null;
  liveReservationRate?: number | null;
  trafficFieldBreakdown: Record<string, number>;
  topContentTags: string[];
  capturedAt: string;
}

export interface MetricCollectionJob {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  source: MetricCollectorSource;
  status: MetricCollectionStatus;
  periodDays: number;
  resultMetricId?: string | null;
  errorMessage?: string | null;
  logs: ExecutionLog[];
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt: string;
}

export interface CreatorPostMetric {
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completionRate?: number | null;
  avgViewDurationSeconds?: number | null;
}

export interface CreatorPost {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  platformPostId: string;
  source: CreatorDataSource;
  title: string;
  description: string;
  publishTime: string;
  postUrl: string;
  coverUrl: string;
  metrics: CreatorPostMetric;
  raw: Record<string, unknown>;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorComment {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  postId?: string | null;
  platformPostId: string;
  platformCommentId: string;
  source: CreatorDataSource;
  authorName: string;
  authorHandle: string;
  content: string;
  likeCount: number;
  replyCount: number;
  postedAt: string;
  sentiment: CreatorCommentSentiment;
  intentTags: string[];
  replyStatus: CreatorCommentReplyStatus;
  suggestedReply: string;
  raw: Record<string, unknown>;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessageMonitor {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  enabled: boolean;
  source: DirectMessageSource;
  status: DirectMessageMonitorStatus;
  unreadCount: number;
  unreadDelta: number;
  lastCheckedAt?: string | null;
  lastEventAt?: string | null;
  lastNotifiedAt?: string | null;
  logs: ExecutionLog[];
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessageAlert {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  source: DirectMessageSource;
  unreadCount: number;
  status: DirectMessageAlertStatus;
  headline: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string | null;
}

export interface AccountDiagnosisDimension {
  key: string;
  label: string;
  score: number;
  summary: string;
}

export interface AccountDiagnosisAgentOpinion {
  agentName: string;
  focus: string;
  score: number;
  stance: string;
  evidence: string[];
  suggestions: string[];
  risks: string[];
}

export interface AccountDiagnosisDebateTurn {
  round: number;
  agentName: string;
  kind: "agree" | "challenge" | "add" | "judge";
  message: string;
}

export interface AccountDiagnosisStage {
  key: string;
  label: string;
  status: "done" | "warn" | "blocked";
  summary: string;
}

export interface AccountDiagnosisAction {
  key: string;
  kind: DiagnosisActionKind;
  priority: DiagnosisActionPriority;
  title: string;
  summary: string;
  suggestedTitle: string;
  suggestedContent: string;
  tags: string[];
  applyLabel: string;
}

export interface AccountDiagnosisReport {
  id: string;
  accountId: string;
  platform: OpsPlatform;
  source: AccountDiagnosisSource;
  readLoggedInWorkspace: boolean;
  overallScore: number;
  grade: string;
  summary: string;
  dimensions: AccountDiagnosisDimension[];
  findings: string[];
  suggestions: string[];
  risks: string[];
  workflowStages: AccountDiagnosisStage[];
  agentOpinions: AccountDiagnosisAgentOpinion[];
  debateTimeline: AccountDiagnosisDebateTurn[];
  actions: AccountDiagnosisAction[];
  judgeSummary: string;
  dataPoints: Record<string, unknown>;
  logs: ExecutionLog[];
  createdAt: string;
}

export interface OpsState {
  accounts: OpsAccount[];
  assets: OpsAsset[];
  drafts: PlatformDraft[];
  tasks: PublishTask[];
  plans: AgentPlan[];
  agentClients: AgentClient[];
  agentToolCallLogs: AgentToolCallLog[];
  publishingAgentRuns: PublishingAgentRun[];
  creatorCoachReports: CreatorCoachReport[];
  viralContentItems: ViralContentItem[];
  metrics: MetricSnapshot[];
  metricCollectionJobs: MetricCollectionJob[];
  creatorPosts: CreatorPost[];
  creatorComments: CreatorComment[];
  directMessageMonitors: DirectMessageMonitor[];
  directMessageAlerts: DirectMessageAlert[];
  accountDiagnoses: AccountDiagnosisReport[];
}

export interface OpsRuntime {
  publisherRunMode: "dry_run" | "browser_prepare" | "upload_prepare" | "social_auto_upload";
  requestedPublisherRunMode: "dry_run" | "browser_prepare" | "upload_prepare" | "social_auto_upload";
  publisherExecutionEnabled: boolean;
  socialAutoUploadEnabled: boolean;
  publisherModeBlockedReason: string;
  browserHeadless: boolean;
  browserProfilesDir: string;
  browserExecutablePath?: string | null;
  platformEntryUrls: Record<OpsPlatform, string>;
  socialAutoUpload: {
    enabled: boolean;
    available: boolean;
    executionReady: boolean;
    cliCommand: string[];
    repoPath: string;
    accountHome: string;
    accountPrefix: string;
    supportedPlatforms: OpsPlatform[];
    missingReason: string;
    installHint: string;
  };
}

export interface SystemProxyState {
  detected: boolean;
  source: string;
  proxyServer: string;
  bypassList: string;
  pacUrl: string;
  message: string;
}

export interface WorkspaceOpenResponse {
  account: OpsAccount;
  logs: ExecutionLog[];
  opened: boolean;
  launchMode: "opened" | "skipped" | "missing_browser" | "failed";
  workspaceUrl: string;
  browserProfileDir: string;
  browserExecutable?: string | null;
  proxyEnabled: boolean;
  proxyServer: string;
}

export interface DiagnosisImportResponse {
  account: OpsAccount;
  asset: OpsAsset;
  draft: PlatformDraft;
  task?: PublishTask | null;
}

export interface ViralContentToAssetResponse {
  item: ViralContentItem;
  asset: OpsAsset;
  drafts: PlatformDraft[];
}

export interface PublishPackageCreateResponse {
  asset: OpsAsset;
  drafts: PlatformDraft[];
  tasks: PublishTask[];
  detectedFiles: Record<string, string>;
}

export interface AssetFileUploadResponse {
  kind: "video" | "cover";
  fileName: string;
  filePath: string;
  fileUrl: string;
  contentType: string;
  bytes: number;
}

export interface DirectMessageCheckResponse {
  monitors: DirectMessageMonitor[];
  alerts: DirectMessageAlert[];
  logs: ExecutionLog[];
}

export interface CreatorCommentDraftReplyResponse {
  comments: CreatorComment[];
  logs: ExecutionLog[];
}

export interface CreatorCommentReplyActionResponse {
  comment: CreatorComment;
  logs: ExecutionLog[];
}

export interface AgentToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  requiresConfirmation: boolean;
  safetyNote: string;
}

export interface AgentToolInvokeResponse<T = unknown> {
  ok: boolean;
  tool: string;
  message: string;
  result?: T;
  requiresConfirmation: boolean;
  callLogId?: string | null;
}

export interface AgentManifest {
  name: string;
  version: string;
  endpoints: Record<string, string>;
  safetyRules: string[];
  tools: AgentToolDefinition[];
  runtime: OpsRuntime;
}

export interface AccountMetricSnapshotInput {
  source?: MetricSource;
  periodDays?: number;
  followers?: number;
  plays?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  avgViewDurationSeconds?: number | null;
  threeSecondRetentionRate?: number | null;
  completionRate?: number | null;
  replayRate?: number | null;
  followConversionRate?: number | null;
  profileVisitRate?: number | null;
  searchImpressionRate?: number | null;
  localTrafficRate?: number | null;
  socialShareRate?: number | null;
  friendLikeRate?: number | null;
  privateDomainClickRate?: number | null;
  officialAccountClickRate?: number | null;
  liveReservationRate?: number | null;
  trafficFieldBreakdown?: Record<string, number>;
  topContentTags?: string[];
}

export type AccountMemoryInput = Omit<AccountMemory, "updatedAt">;

export async function getOpsState(): Promise<OpsState> {
  const { data } = await api.get<OpsState>("/ops/state");
  return data;
}

export async function getOpsRuntime(): Promise<OpsRuntime> {
  const { data } = await api.get<OpsRuntime>("/ops/runtime");
  return data;
}

export async function getOpsSystemProxy(): Promise<SystemProxyState> {
  const { data } = await api.get<SystemProxyState>("/ops/system-proxy");
  return data;
}

export async function getContentPatterns(): Promise<ContentPattern[]> {
  const { data } = await api.get<ContentPattern[]>("/ops/content-patterns");
  return data;
}

export async function createOpsAccount(input: {
  platform: OpsPlatform;
  displayName?: string;
  handle?: string;
  authType?: AuthType;
  profile?: string;
  dailyPublishLimit?: number;
  browserProxyEnabled?: boolean;
  browserProxyServer?: string;
  browserProxyBypassList?: string;
  sauAccountName?: string;
}): Promise<OpsAccount> {
  const { data } = await api.post<OpsAccount>("/ops/accounts", input);
  return data;
}

export async function checkOpsSession(accountId: string): Promise<OpsAccount> {
  const { data } = await api.post<OpsAccount>(`/ops/accounts/${accountId}/session-check`);
  return data;
}

export async function startSocialAutoUploadLogin(accountId: string): Promise<{
  ok: boolean;
  message: string;
  command: string[];
  accountName: string;
}> {
  const { data } = await api.post(`/ops/accounts/${accountId}/social-auto-upload/login`);
  return data;
}

export async function openOpsWorkspace(accountId: string): Promise<WorkspaceOpenResponse> {
  const { data } = await api.post<WorkspaceOpenResponse>(`/ops/accounts/${accountId}/open-workspace`);
  return data;
}

export async function prepareOpsWorkspace(accountId: string): Promise<WorkspaceOpenResponse> {
  const { data } = await api.post<WorkspaceOpenResponse>(`/ops/accounts/${accountId}/prepare-workspace`);
  return data;
}

export async function rememberOpsSession(accountId: string): Promise<OpsAccount> {
  const { data } = await api.post<OpsAccount>(`/ops/accounts/${accountId}/remember-session`);
  return data;
}

export async function syncOpsAccountProfile(
  accountId: string,
  input: {
    displayName?: string;
    handle?: string;
    profile?: string;
    workspaceUrl?: string;
    pageTitle?: string;
    source?: "browser_bridge" | "manual";
    raw?: Record<string, unknown>;
  },
): Promise<OpsAccount> {
  const { data } = await api.post<OpsAccount>(`/ops/accounts/${accountId}/sync-profile`, {
    source: input.source || "browser_bridge",
    displayName: input.displayName || "",
    handle: input.handle || "",
    profile: input.profile || "",
    workspaceUrl: input.workspaceUrl || "",
    pageTitle: input.pageTitle || "",
    raw: input.raw || {},
  });
  return data;
}

export async function updateOpsBrowserSettings(
  accountId: string,
  input: {
    browserProxyEnabled?: boolean;
    browserProxyServer?: string;
    browserProxyBypassList?: string;
    sauAccountName?: string;
  },
): Promise<OpsAccount> {
  const { data } = await api.patch<OpsAccount>(`/ops/accounts/${accountId}/browser`, input);
  return data;
}

export async function updateAccountMemory(accountId: string, input: AccountMemoryInput): Promise<OpsAccount> {
  const { data } = await api.patch<OpsAccount>(`/ops/accounts/${accountId}/memory`, input);
  return data;
}

export async function diagnoseOpsAccount(
  accountId: string,
  input: { readLoggedInWorkspace?: boolean } = {},
): Promise<AccountDiagnosisReport> {
  const { data } = await api.post<AccountDiagnosisReport>(`/ops/accounts/${accountId}/diagnose`, {
    readLoggedInWorkspace: input.readLoggedInWorkspace ?? true,
  });
  return data;
}

export async function recordAccountMetricSnapshot(
  accountId: string,
  input: AccountMetricSnapshotInput,
): Promise<MetricSnapshot> {
  const { data } = await api.post<MetricSnapshot>(`/ops/accounts/${accountId}/metrics`, input);
  return data;
}

export async function collectAccountMetrics(
  accountId: string,
  input: { source?: MetricCollectorSource; periodDays?: number } = {},
): Promise<MetricCollectionJob> {
  const { data } = await api.post<MetricCollectionJob>(`/ops/accounts/${accountId}/metrics/collect`, {
    source: input.source || "simulated",
    periodDays: input.periodDays || 7,
  });
  return data;
}

export async function generateCreatorCoach(
  accountId: string,
  input: { focusGoal?: string; ideaCount?: number } = {},
): Promise<CreatorCoachReport> {
  const { data } = await api.post<CreatorCoachReport>(`/ops/accounts/${accountId}/coach`, {
    focusGoal: input.focusGoal || "",
    ideaCount: input.ideaCount || 5,
  });
  return data;
}

export async function seedViralContent(force = false): Promise<ViralContentItem[]> {
  const { data } = await api.post<ViralContentItem[]>("/ops/viral-content/seed", { force });
  return data;
}

export async function createViralContent(input: {
  platform: OpsPlatform;
  track: string;
  title: string;
  creatorName?: string;
  sourceUrl?: string;
  sourceType?: ViralContentSource;
  publishDate?: string;
  durationSeconds?: number;
  hotScore?: number;
  playCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  saveCount?: number;
  hook?: string;
  structure?: string[];
  visualNotes?: string[];
  commentSignals?: string[];
  reusableAngles?: string[];
  riskNotes?: string[];
  tags?: string[];
  adaptationTitle?: string;
  adaptationScript?: string;
}): Promise<ViralContentItem> {
  const { data } = await api.post<ViralContentItem>("/ops/viral-content", input);
  return data;
}

export async function convertViralContentToAsset(itemId: string, createDrafts = false): Promise<ViralContentToAssetResponse> {
  const { data } = await api.post<ViralContentToAssetResponse>("/ops/viral-content/to-asset", { itemId, createDrafts });
  return data;
}

export async function createOpsAsset(input: {
  contentType?: DispatchContentType;
  titleBase: string;
  descriptionBase: string;
  videoUrl: string;
  videoLocalPath?: string;
  coverUrl: string;
  coverLocalPath?: string;
  tags: string[];
  durationSeconds: number;
  owner: string;
  copyrightStatus: OpsAsset["copyrightStatus"];
}): Promise<OpsAsset> {
  const { data } = await api.post<OpsAsset>("/ops/assets", input);
  return data;
}

export async function uploadOpsAssetFile(kind: "video" | "cover", file: File): Promise<AssetFileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<AssetFileUploadResponse>(`/ops/assets/upload-file?kind=${kind}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: kind === "video" ? 600_000 : 120_000,
  });
  return data;
}

export async function generateOpsDrafts(assetId: string, accountIds?: string[]): Promise<PlatformDraft[]> {
  const { data } = await api.post<PlatformDraft[]>("/ops/drafts/generate", {
    assetId,
    accountIds: accountIds?.length ? accountIds : undefined,
  });
  return data;
}

export async function createOpsTask(draftId: string, scheduledAt?: string): Promise<PublishTask> {
  const { data } = await api.post<PublishTask>("/ops/tasks", {
    draftId,
    scheduledAt: scheduledAt || undefined,
  });
  return data;
}

export async function createPublishPackageFromFolder(input: {
  folderPath: string;
  contentType?: DispatchContentType;
  accountIds: string[];
  scheduledAt?: string;
  titleBase?: string;
  durationSeconds?: number;
  owner?: string;
}): Promise<PublishPackageCreateResponse> {
  const { data } = await api.post<PublishPackageCreateResponse>("/ops/publish-packages/from-folder", input);
  return data;
}

export async function approveOpsTask(taskId: string): Promise<PublishTask> {
  const { data } = await api.post<PublishTask>(`/ops/tasks/${taskId}/approve`);
  return data;
}

export async function executeOpsTask(taskId: string): Promise<PublishTask> {
  const { data } = await api.post<PublishTask>(`/ops/tasks/${taskId}/execute`);
  return data;
}

export async function createOpsAgentPlan(objective: string): Promise<AgentPlan> {
  const { data } = await api.post<AgentPlan>("/ops/agent/plans", { objective });
  return data;
}

export async function getOpsAgentManifest(): Promise<AgentManifest> {
  const { data } = await api.get<AgentManifest>("/ops/agent/manifest");
  return data;
}

export async function getOpsAgentClients(): Promise<AgentClient[]> {
  const { data } = await api.get<AgentClient[]>("/ops/agent/clients");
  return data;
}

export async function createOpsAgentClient(input: {
  name: string;
  kind?: AgentClientKind;
  allowedTools?: string[];
  allowedAccountIds?: string[];
  canExecutePublish?: boolean;
  notes?: string;
}): Promise<AgentClient> {
  const { data } = await api.post<AgentClient>("/ops/agent/clients", input);
  return data;
}

export async function runOpsPublishingAgent(input: {
  objective: string;
  accountIds?: string[];
  assetIds?: string[];
  mode?: PublishingAgentMode;
  confirmed?: boolean;
}): Promise<PublishingAgentRun> {
  const { data } = await api.post<PublishingAgentRun>("/ops/agent/publishing-runs", {
    objective: input.objective,
    accountIds: input.accountIds || [],
    assetIds: input.assetIds || [],
    mode: input.mode || "create_tasks",
    confirmed: input.confirmed || false,
  });
  return data;
}

export async function importDiagnosisToOps(input: {
  accountId: string;
  title: string;
  content?: string;
  tags?: string[];
  category?: string;
  sourceDiagnosisId?: string;
  score?: number;
  durationSeconds?: number;
  createTask?: boolean;
}): Promise<DiagnosisImportResponse> {
  const { data } = await api.post<DiagnosisImportResponse>("/ops/diagnosis/import", input);
  return data;
}

export async function applyDiagnosisAction(
  reportId: string,
  input: { actionKey: string; createTask?: boolean },
): Promise<DiagnosisImportResponse> {
  const { data } = await api.post<DiagnosisImportResponse>(`/ops/account-diagnoses/${reportId}/actions/apply`, {
    actionKey: input.actionKey,
    createTask: input.createTask || false,
  });
  return data;
}

export async function checkDirectMessages(accountIds?: string[]): Promise<DirectMessageCheckResponse> {
  const { data } = await api.post<DirectMessageCheckResponse>("/ops/direct-messages/check", {
    accountIds: accountIds?.length ? accountIds : null,
  });
  return data;
}

export async function updateDirectMessageMonitor(
  accountId: string,
  input: { enabled: boolean; source: DirectMessageSource },
): Promise<DirectMessageMonitor> {
  const { data } = await api.patch<DirectMessageMonitor>(`/ops/direct-messages/monitors/${accountId}`, input);
  return data;
}

export async function recordDirectMessageEvent(input: {
  accountId: string;
  unreadCount: number;
  source?: DirectMessageSource;
}): Promise<DirectMessageCheckResponse> {
  const { data } = await api.post<DirectMessageCheckResponse>("/ops/direct-messages/events", {
    accountId: input.accountId,
    unreadCount: input.unreadCount,
    source: input.source || "manual",
  });
  return data;
}

export async function acknowledgeDirectMessageAlert(alertId: string): Promise<DirectMessageAlert> {
  const { data } = await api.post<DirectMessageAlert>(`/ops/direct-messages/alerts/${alertId}/acknowledge`);
  return data;
}

export async function draftCreatorCommentReplies(input: {
  accountId?: string;
  commentIds?: string[];
  force?: boolean;
  limit?: number;
}): Promise<CreatorCommentDraftReplyResponse> {
  const { data } = await api.post<CreatorCommentDraftReplyResponse>("/ops/creator-comments/draft-replies", {
    accountId: input.accountId || null,
    commentIds: input.commentIds || [],
    force: input.force || false,
    limit: input.limit || 50,
  });
  return data;
}

export async function applyCreatorCommentReplyAction(
  commentId: string,
  input: { action: CreatorCommentReplyAction; replyText?: string },
): Promise<CreatorCommentReplyActionResponse> {
  const { data } = await api.post<CreatorCommentReplyActionResponse>(`/ops/creator-comments/${commentId}/reply-action`, {
    action: input.action,
    replyText: input.replyText || "",
  });
  return data;
}

export async function getOpsAgentTools(): Promise<AgentToolDefinition[]> {
  const { data } = await api.get<AgentToolDefinition[]>("/ops/agent/tools");
  return data;
}

export async function invokeOpsAgentTool(input: {
  tool: string;
  arguments?: Record<string, unknown>;
  confirmed?: boolean;
  clientId?: string;
  purpose?: string;
}): Promise<AgentToolInvokeResponse> {
  const { data } = await api.post<AgentToolInvokeResponse>("/ops/agent/invoke", {
    tool: input.tool,
    arguments: input.arguments || {},
    confirmed: input.confirmed || false,
    clientId: input.clientId || null,
    purpose: input.purpose || "",
  });
  return data;
}
