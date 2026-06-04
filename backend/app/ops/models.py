"""Models for the matrix operation console."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Platform = Literal["douyin", "xiaohongshu", "wechat_channels"]
AuthType = Literal["oauth", "browser_session", "manual"]
AccountStatus = Literal["connected", "needs_login", "disabled"]
SessionHealth = Literal["healthy", "expired", "unknown"]
TaskStatus = Literal[
    "draft",
    "pending_review",
    "scheduled",
    "publishing",
    "published",
    "manual_takeover",
    "failed",
    "retrying",
    "cancelled",
]
ExecutionMode = Literal["api", "browser", "manual_takeover"]
CopyrightStatus = Literal["owned", "licensed", "unknown"]
Readiness = Literal["ready", "needs_review", "blocked"]
DirectMessageSource = Literal["browser_session", "official_api", "webhook", "manual"]
DirectMessageMonitorStatus = Literal["active", "paused", "needs_login", "unsupported"]
DirectMessageAlertStatus = Literal["unread", "acknowledged"]
AccountDiagnosisSource = Literal["local_snapshot", "browser_session", "official_api"]
MetricSource = Literal["manual", "simulated", "browser_session", "official_api", "webhook", "seed"]
MetricCollectorSource = Literal["simulated", "browser_session", "official_api"]
MetricCollectionStatus = Literal["queued", "running", "succeeded", "failed", "needs_login", "unsupported"]
AgentClientKind = Literal["external", "internal"]
AgentClientStatus = Literal["active", "paused"]
PublishingAgentMode = Literal["plan_only", "create_tasks", "approve_ready", "execute_ready"]
PublishingAgentRunStatus = Literal["completed", "blocked", "failed"]
DiagnosisActionKind = Literal["title_hook", "script_revision", "comment_reply", "publish_task"]
DiagnosisActionPriority = Literal["high", "medium", "low"]
ViralContentSource = Literal["public_research", "manual", "platform_observation", "account_data"]
DispatchContentType = Literal["video", "article", "dynamic", "story"]
CreatorDataSource = Literal["browser_bridge", "manual", "official_api", "import"]
CreatorCommentSentiment = Literal["positive", "neutral", "negative", "question", "lead"]
CreatorCommentReplyStatus = Literal["unknown", "unreplied", "replied", "drafted", "approved", "ignored"]
CreatorCommentReplyAction = Literal["approve", "mark_replied", "ignore", "reset"]


class ExecutionLog(BaseModel):
    at: str
    level: Literal["info", "warn", "error"] = "info"
    message: str


class AccountMemory(BaseModel):
    targetAudience: list[str] = Field(default_factory=list)
    contentPillars: list[str] = Field(default_factory=list)
    conversionGoal: str = ""
    personaTone: str = ""
    highPerformingPatterns: list[str] = Field(default_factory=list)
    lowPerformingPatterns: list[str] = Field(default_factory=list)
    avoidTopics: list[str] = Field(default_factory=list)
    commentStrategy: str = ""
    privateDomainStrategy: str = ""
    updatedAt: str | None = None


class Account(BaseModel):
    id: str
    platform: Platform
    displayName: str
    handle: str
    status: AccountStatus = "needs_login"
    authType: AuthType = "browser_session"
    profile: str = ""
    dailyPublishLimit: int = Field(default=3, ge=1, le=20)
    publishedToday: int = 0
    sessionHealth: SessionHealth = "unknown"
    workspaceUrl: str | None = None
    browserProfileDir: str | None = None
    workspaceOpenedAt: str | None = None
    browserProxyEnabled: bool = False
    browserProxyServer: str = ""
    browserProxyBypassList: str = ""
    sauAccountName: str = ""
    memory: AccountMemory = Field(default_factory=AccountMemory)
    createdAt: str
    updatedAt: str


class Asset(BaseModel):
    id: str
    contentType: DispatchContentType = "video"
    titleBase: str
    descriptionBase: str
    videoUrl: str
    videoLocalPath: str = ""
    coverUrl: str
    coverLocalPath: str = ""
    tags: list[str] = Field(default_factory=list)
    durationSeconds: int = Field(default=60, ge=1, le=3600)
    owner: str = "内容团队"
    copyrightStatus: CopyrightStatus = "owned"
    createdAt: str
    updatedAt: str


class PlatformDraft(BaseModel):
    id: str
    assetId: str
    accountId: str
    platform: Platform
    title: str
    description: str
    tags: list[str] = Field(default_factory=list)
    coverUrl: str = ""
    publishOptions: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict)
    readiness: Readiness = "ready"
    createdAt: str
    updatedAt: str


class PublishTask(BaseModel):
    id: str
    platform: Platform
    accountId: str
    draftId: str
    scheduledAt: str
    status: TaskStatus = "draft"
    executionMode: ExecutionMode = "manual_takeover"
    retryCount: int = 0
    errorMessage: str | None = None
    platformItemId: str | None = None
    logs: list[ExecutionLog] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class AgentPlan(BaseModel):
    id: str
    objective: str
    summary: str
    accountIds: list[str] = Field(default_factory=list)
    assetIds: list[str] = Field(default_factory=list)
    draftIds: list[str] = Field(default_factory=list)
    taskIds: list[str] = Field(default_factory=list)
    createdAt: str


class AgentClient(BaseModel):
    id: str
    name: str
    kind: AgentClientKind = "external"
    status: AgentClientStatus = "active"
    allowedTools: list[str] = Field(default_factory=list)
    allowedAccountIds: list[str] = Field(default_factory=list)
    canExecutePublish: bool = False
    notes: str = ""
    createdAt: str
    updatedAt: str
    lastSeenAt: str | None = None


class AgentToolCallLog(BaseModel):
    id: str
    clientId: str | None = None
    clientName: str = "unregistered-agent"
    tool: str
    ok: bool = False
    message: str = ""
    requiresConfirmation: bool = False
    arguments: dict[str, Any] = Field(default_factory=dict)
    resultSummary: str = ""
    createdAt: str


class PublishingAgentRun(BaseModel):
    id: str
    objective: str
    mode: PublishingAgentMode = "create_tasks"
    status: PublishingAgentRunStatus = "completed"
    accountIds: list[str] = Field(default_factory=list)
    assetIds: list[str] = Field(default_factory=list)
    planId: str | None = None
    draftIds: list[str] = Field(default_factory=list)
    taskIds: list[str] = Field(default_factory=list)
    executedTaskIds: list[str] = Field(default_factory=list)
    blockedTaskIds: list[str] = Field(default_factory=list)
    summary: str = ""
    logs: list[ExecutionLog] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class ContentPattern(BaseModel):
    key: str
    title: str
    goal: str
    suitablePlatforms: list[Platform] = Field(default_factory=list)
    bestFor: str
    titleFormula: str
    hookTemplate: str
    scriptStructure: list[str] = Field(default_factory=list)
    coverSuggestion: str
    commentStrategy: str
    reuseSignal: str


class CreatorProfile(BaseModel):
    role: str
    stage: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    summary: str
    readinessScore: int = Field(ge=0, le=100)


class ContentIdea(BaseModel):
    id: str
    accountId: str
    platform: Platform
    patternKey: str
    goal: str
    title: str
    hook: str
    outline: list[str] = Field(default_factory=list)
    materialChecklist: list[str] = Field(default_factory=list)
    reason: str
    cta: str
    tags: list[str] = Field(default_factory=list)
    score: int = Field(ge=0, le=100)


class ViralContentItem(BaseModel):
    id: str
    platform: Platform
    track: str = "hospitality_design"
    title: str
    creatorName: str = ""
    sourceUrl: str = ""
    sourceType: ViralContentSource = "public_research"
    publishDate: str = ""
    durationSeconds: int = Field(default=45, ge=1, le=3600)
    hotScore: int = Field(default=80, ge=0, le=100)
    playCount: int = Field(default=0, ge=0)
    likeCount: int = Field(default=0, ge=0)
    commentCount: int = Field(default=0, ge=0)
    shareCount: int = Field(default=0, ge=0)
    saveCount: int = Field(default=0, ge=0)
    hook: str = ""
    structure: list[str] = Field(default_factory=list)
    visualNotes: list[str] = Field(default_factory=list)
    commentSignals: list[str] = Field(default_factory=list)
    reusableAngles: list[str] = Field(default_factory=list)
    riskNotes: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    adaptationTitle: str = ""
    adaptationScript: str = ""
    createdAt: str
    updatedAt: str


class CreatorCoachReport(BaseModel):
    id: str
    accountId: str
    platform: Platform
    profile: CreatorProfile
    recommendedPatterns: list[ContentPattern] = Field(default_factory=list)
    ideas: list[ContentIdea] = Field(default_factory=list)
    nextActions: list[str] = Field(default_factory=list)
    createdAt: str


class MetricSnapshot(BaseModel):
    id: str
    accountId: str
    platform: Platform
    source: MetricSource = "manual"
    periodDays: int = Field(default=7, ge=1, le=90)
    followers: int = 0
    plays: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    avgViewDurationSeconds: float | None = Field(default=None, ge=0)
    threeSecondRetentionRate: float | None = Field(default=None, ge=0, le=100)
    completionRate: float | None = Field(default=None, ge=0, le=100)
    replayRate: float | None = Field(default=None, ge=0, le=100)
    followConversionRate: float | None = Field(default=None, ge=0, le=100)
    profileVisitRate: float | None = Field(default=None, ge=0, le=100)
    searchImpressionRate: float | None = Field(default=None, ge=0, le=100)
    localTrafficRate: float | None = Field(default=None, ge=0, le=100)
    socialShareRate: float | None = Field(default=None, ge=0, le=100)
    friendLikeRate: float | None = Field(default=None, ge=0, le=100)
    privateDomainClickRate: float | None = Field(default=None, ge=0, le=100)
    officialAccountClickRate: float | None = Field(default=None, ge=0, le=100)
    liveReservationRate: float | None = Field(default=None, ge=0, le=100)
    trafficFieldBreakdown: dict[str, float] = Field(default_factory=dict)
    topContentTags: list[str] = Field(default_factory=list)
    capturedAt: str


class MetricCollectionJob(BaseModel):
    id: str
    accountId: str
    platform: Platform
    source: MetricCollectorSource = "simulated"
    status: MetricCollectionStatus = "queued"
    periodDays: int = Field(default=7, ge=1, le=90)
    resultMetricId: str | None = None
    errorMessage: str | None = None
    logs: list[ExecutionLog] = Field(default_factory=list)
    createdAt: str
    startedAt: str | None = None
    finishedAt: str | None = None
    updatedAt: str


class CreatorPostMetric(BaseModel):
    plays: int = Field(default=0, ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    saves: int = Field(default=0, ge=0)
    completionRate: float | None = Field(default=None, ge=0, le=100)
    avgViewDurationSeconds: float | None = Field(default=None, ge=0)


class CreatorPost(BaseModel):
    id: str
    accountId: str
    platform: Platform
    platformPostId: str = ""
    source: CreatorDataSource = "browser_bridge"
    title: str = ""
    description: str = ""
    publishTime: str = ""
    postUrl: str = ""
    coverUrl: str = ""
    metrics: CreatorPostMetric = Field(default_factory=CreatorPostMetric)
    raw: dict[str, Any] = Field(default_factory=dict)
    capturedAt: str
    createdAt: str
    updatedAt: str


class CreatorComment(BaseModel):
    id: str
    accountId: str
    platform: Platform
    postId: str | None = None
    platformPostId: str = ""
    platformCommentId: str = ""
    source: CreatorDataSource = "browser_bridge"
    authorName: str = ""
    authorHandle: str = ""
    content: str = ""
    likeCount: int = Field(default=0, ge=0)
    replyCount: int = Field(default=0, ge=0)
    postedAt: str = ""
    sentiment: CreatorCommentSentiment = "neutral"
    intentTags: list[str] = Field(default_factory=list)
    replyStatus: CreatorCommentReplyStatus = "unknown"
    suggestedReply: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)
    capturedAt: str
    createdAt: str
    updatedAt: str


class DirectMessageMonitor(BaseModel):
    id: str
    accountId: str
    platform: Platform
    enabled: bool = True
    source: DirectMessageSource = "browser_session"
    status: DirectMessageMonitorStatus = "paused"
    unreadCount: int = Field(default=0, ge=0)
    unreadDelta: int = Field(default=0, ge=0)
    lastCheckedAt: str | None = None
    lastEventAt: str | None = None
    lastNotifiedAt: str | None = None
    logs: list[ExecutionLog] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class DirectMessageAlert(BaseModel):
    id: str
    accountId: str
    platform: Platform
    source: DirectMessageSource = "browser_session"
    unreadCount: int = Field(default=1, ge=1)
    status: DirectMessageAlertStatus = "unread"
    headline: str = "收到新的私信"
    createdAt: str
    updatedAt: str
    acknowledgedAt: str | None = None


class AccountDiagnosisDimension(BaseModel):
    key: str
    label: str
    score: int = Field(ge=0, le=100)
    summary: str


class AccountDiagnosisAgentOpinion(BaseModel):
    agentName: str
    focus: str
    score: int = Field(ge=0, le=100)
    stance: str
    evidence: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class AccountDiagnosisDebateTurn(BaseModel):
    round: int = Field(ge=1)
    agentName: str
    kind: Literal["agree", "challenge", "add", "judge"] = "add"
    message: str


class AccountDiagnosisStage(BaseModel):
    key: str
    label: str
    status: Literal["done", "warn", "blocked"] = "done"
    summary: str


class AccountDiagnosisAction(BaseModel):
    key: str
    kind: DiagnosisActionKind
    priority: DiagnosisActionPriority = "medium"
    title: str
    summary: str
    suggestedTitle: str = ""
    suggestedContent: str = ""
    tags: list[str] = Field(default_factory=list)
    applyLabel: str = "导入草稿"


class AccountDiagnosisReport(BaseModel):
    id: str
    accountId: str
    platform: Platform
    source: AccountDiagnosisSource = "local_snapshot"
    readLoggedInWorkspace: bool = True
    overallScore: int = Field(ge=0, le=100)
    grade: str
    summary: str
    dimensions: list[AccountDiagnosisDimension] = Field(default_factory=list)
    findings: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    workflowStages: list[AccountDiagnosisStage] = Field(default_factory=list)
    agentOpinions: list[AccountDiagnosisAgentOpinion] = Field(default_factory=list)
    debateTimeline: list[AccountDiagnosisDebateTurn] = Field(default_factory=list)
    actions: list[AccountDiagnosisAction] = Field(default_factory=list)
    judgeSummary: str = ""
    dataPoints: dict[str, Any] = Field(default_factory=dict)
    logs: list[ExecutionLog] = Field(default_factory=list)
    createdAt: str


class OperationsDb(BaseModel):
    accounts: list[Account] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)
    drafts: list[PlatformDraft] = Field(default_factory=list)
    tasks: list[PublishTask] = Field(default_factory=list)
    plans: list[AgentPlan] = Field(default_factory=list)
    agentClients: list[AgentClient] = Field(default_factory=list)
    agentToolCallLogs: list[AgentToolCallLog] = Field(default_factory=list)
    publishingAgentRuns: list[PublishingAgentRun] = Field(default_factory=list)
    creatorCoachReports: list[CreatorCoachReport] = Field(default_factory=list)
    viralContentItems: list[ViralContentItem] = Field(default_factory=list)
    metrics: list[MetricSnapshot] = Field(default_factory=list)
    metricCollectionJobs: list[MetricCollectionJob] = Field(default_factory=list)
    creatorPosts: list[CreatorPost] = Field(default_factory=list)
    creatorComments: list[CreatorComment] = Field(default_factory=list)
    directMessageMonitors: list[DirectMessageMonitor] = Field(default_factory=list)
    directMessageAlerts: list[DirectMessageAlert] = Field(default_factory=list)
    accountDiagnoses: list[AccountDiagnosisReport] = Field(default_factory=list)


class SocialAutoUploadState(BaseModel):
    enabled: bool = False
    available: bool = False
    executionReady: bool = False
    cliCommand: list[str] = Field(default_factory=list)
    repoPath: str = ""
    accountHome: str = ""
    accountPrefix: str = ""
    supportedPlatforms: list[Platform] = Field(default_factory=list)
    missingReason: str = ""
    installHint: str = ""


class RuntimeState(BaseModel):
    publisherRunMode: Literal["dry_run", "browser_prepare", "upload_prepare", "social_auto_upload"] = "dry_run"
    requestedPublisherRunMode: Literal["dry_run", "browser_prepare", "upload_prepare", "social_auto_upload"] = "dry_run"
    publisherExecutionEnabled: bool = False
    socialAutoUploadEnabled: bool = False
    publisherModeBlockedReason: str = ""
    browserHeadless: bool = False
    browserProfilesDir: str
    browserExecutablePath: str | None = None
    platformEntryUrls: dict[Platform, str]
    socialAutoUpload: SocialAutoUploadState = Field(default_factory=SocialAutoUploadState)


class SystemProxyState(BaseModel):
    detected: bool = False
    source: str = ""
    proxyServer: str = ""
    bypassList: str = ""
    pacUrl: str = ""
    message: str = ""


class WorkspaceOpenResponse(BaseModel):
    account: Account
    logs: list[ExecutionLog] = Field(default_factory=list)
    opened: bool = False
    launchMode: Literal["opened", "skipped", "missing_browser", "failed"] = "skipped"
    workspaceUrl: str
    browserProfileDir: str
    browserExecutable: str | None = None
    proxyEnabled: bool = False
    proxyServer: str = ""


class AgentToolDefinition(BaseModel):
    name: str
    title: str
    description: str
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    readOnly: bool = False
    requiresConfirmation: bool = False
    safetyNote: str = ""


class AgentToolInvokeRequest(BaseModel):
    tool: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    confirmed: bool = False
    clientId: str | None = None
    purpose: str = ""


class AgentToolInvokeResponse(BaseModel):
    ok: bool
    tool: str
    message: str
    result: Any | None = None
    requiresConfirmation: bool = False
    callLogId: str | None = None


class AgentManifest(BaseModel):
    name: str = "设计运营管家 Agent Control API"
    version: str = "0.4.0"
    endpoints: dict[str, str] = Field(default_factory=dict)
    safetyRules: list[str] = Field(default_factory=list)
    tools: list[AgentToolDefinition] = Field(default_factory=list)
    runtime: RuntimeState


class AgentClientCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    kind: AgentClientKind = "external"
    allowedTools: list[str] = Field(default_factory=list)
    allowedAccountIds: list[str] = Field(default_factory=list)
    canExecutePublish: bool = False
    notes: str = ""


class AgentClientUpdateRequest(BaseModel):
    status: AgentClientStatus | None = None
    allowedTools: list[str] | None = None
    allowedAccountIds: list[str] | None = None
    canExecutePublish: bool | None = None
    notes: str | None = None


class PublishingAgentRunRequest(BaseModel):
    objective: str = "内置 Agent 自动生成多平台发布计划"
    accountIds: list[str] = Field(default_factory=list)
    assetIds: list[str] = Field(default_factory=list)
    mode: PublishingAgentMode = "create_tasks"
    confirmed: bool = False


class CreatorCoachRequest(BaseModel):
    accountId: str | None = None
    focusGoal: str = ""
    ideaCount: int = Field(default=5, ge=1, le=10)


class ViralContentCreateRequest(BaseModel):
    platform: Platform
    track: str = "hospitality_design"
    title: str = Field(min_length=1)
    creatorName: str = ""
    sourceUrl: str = ""
    sourceType: ViralContentSource = "manual"
    publishDate: str = ""
    durationSeconds: int = Field(default=45, ge=1, le=3600)
    hotScore: int = Field(default=80, ge=0, le=100)
    playCount: int = Field(default=0, ge=0)
    likeCount: int = Field(default=0, ge=0)
    commentCount: int = Field(default=0, ge=0)
    shareCount: int = Field(default=0, ge=0)
    saveCount: int = Field(default=0, ge=0)
    hook: str = ""
    structure: list[str] = Field(default_factory=list)
    visualNotes: list[str] = Field(default_factory=list)
    commentSignals: list[str] = Field(default_factory=list)
    reusableAngles: list[str] = Field(default_factory=list)
    riskNotes: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    adaptationTitle: str = ""
    adaptationScript: str = ""


class ViralContentSeedRequest(BaseModel):
    force: bool = False


class ViralContentToAssetRequest(BaseModel):
    itemId: str = Field(min_length=1)
    createDrafts: bool = False


class ViralContentToAssetResponse(BaseModel):
    item: ViralContentItem
    asset: Asset
    drafts: list[PlatformDraft] = Field(default_factory=list)


class DiagnosisActionApplyRequest(BaseModel):
    actionKey: str = Field(min_length=1)
    createTask: bool = False


class DiagnosisImportRequest(BaseModel):
    accountId: str = Field(min_length=1)
    title: str = Field(min_length=1)
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    sourceDiagnosisId: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    durationSeconds: int = Field(default=60, ge=1, le=3600)
    createTask: bool = False


class DiagnosisImportResponse(BaseModel):
    account: Account
    asset: Asset
    draft: PlatformDraft
    task: PublishTask | None = None


class DirectMessageMonitorUpdateRequest(BaseModel):
    enabled: bool
    source: DirectMessageSource = "browser_session"


class DirectMessageCheckRequest(BaseModel):
    accountIds: list[str] | None = None


class DirectMessageEventRequest(BaseModel):
    accountId: str = Field(min_length=1)
    unreadCount: int = Field(default=1, ge=0, le=10000)
    source: DirectMessageSource = "manual"


class DirectMessageCheckResponse(BaseModel):
    monitors: list[DirectMessageMonitor] = Field(default_factory=list)
    alerts: list[DirectMessageAlert] = Field(default_factory=list)
    logs: list[ExecutionLog] = Field(default_factory=list)


class CreatorPostIngestItem(BaseModel):
    platformPostId: str = ""
    title: str = ""
    description: str = ""
    publishTime: str = ""
    postUrl: str = ""
    coverUrl: str = ""
    metrics: CreatorPostMetric = Field(default_factory=CreatorPostMetric)
    raw: dict[str, Any] = Field(default_factory=dict)


class CreatorCommentIngestItem(BaseModel):
    platformPostId: str = ""
    platformCommentId: str = ""
    authorName: str = ""
    authorHandle: str = ""
    content: str = ""
    likeCount: int = Field(default=0, ge=0)
    replyCount: int = Field(default=0, ge=0)
    replyStatus: CreatorCommentReplyStatus = "unknown"
    postedAt: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class CreatorDataSyncRequest(BaseModel):
    accountId: str = Field(min_length=1)
    source: CreatorDataSource = "browser_bridge"
    capturedAt: str | None = None
    posts: list[CreatorPostIngestItem] = Field(default_factory=list)
    comments: list[CreatorCommentIngestItem] = Field(default_factory=list)


class CreatorDataSyncResponse(BaseModel):
    account: Account
    posts: list[CreatorPost] = Field(default_factory=list)
    comments: list[CreatorComment] = Field(default_factory=list)
    logs: list[ExecutionLog] = Field(default_factory=list)


class CreatorCommentDraftReplyRequest(BaseModel):
    accountId: str | None = None
    commentIds: list[str] = Field(default_factory=list)
    force: bool = False
    limit: int = Field(default=50, ge=1, le=200)


class CreatorCommentDraftReplyResponse(BaseModel):
    comments: list[CreatorComment] = Field(default_factory=list)
    logs: list[ExecutionLog] = Field(default_factory=list)


class CreatorCommentReplyActionRequest(BaseModel):
    action: CreatorCommentReplyAction
    replyText: str = ""


class CreatorCommentReplyActionResponse(BaseModel):
    comment: CreatorComment
    logs: list[ExecutionLog] = Field(default_factory=list)


class AccountMetricSnapshotRequest(BaseModel):
    accountId: str | None = None
    source: MetricSource = "manual"
    periodDays: int = Field(default=7, ge=1, le=90)
    followers: int = Field(default=0, ge=0)
    plays: int = Field(default=0, ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    avgViewDurationSeconds: float | None = Field(default=None, ge=0)
    threeSecondRetentionRate: float | None = Field(default=None, ge=0, le=100)
    completionRate: float | None = Field(default=None, ge=0, le=100)
    replayRate: float | None = Field(default=None, ge=0, le=100)
    followConversionRate: float | None = Field(default=None, ge=0, le=100)
    profileVisitRate: float | None = Field(default=None, ge=0, le=100)
    searchImpressionRate: float | None = Field(default=None, ge=0, le=100)
    localTrafficRate: float | None = Field(default=None, ge=0, le=100)
    socialShareRate: float | None = Field(default=None, ge=0, le=100)
    friendLikeRate: float | None = Field(default=None, ge=0, le=100)
    privateDomainClickRate: float | None = Field(default=None, ge=0, le=100)
    officialAccountClickRate: float | None = Field(default=None, ge=0, le=100)
    liveReservationRate: float | None = Field(default=None, ge=0, le=100)
    trafficFieldBreakdown: dict[str, float] = Field(default_factory=dict)
    topContentTags: list[str] = Field(default_factory=list)


class AccountMetricCollectRequest(BaseModel):
    accountId: str | None = None
    source: MetricCollectorSource = "simulated"
    periodDays: int = Field(default=7, ge=1, le=90)


class AccountMemoryUpdateRequest(BaseModel):
    targetAudience: list[str] = Field(default_factory=list)
    contentPillars: list[str] = Field(default_factory=list)
    conversionGoal: str = ""
    personaTone: str = ""
    highPerformingPatterns: list[str] = Field(default_factory=list)
    lowPerformingPatterns: list[str] = Field(default_factory=list)
    avoidTopics: list[str] = Field(default_factory=list)
    commentStrategy: str = ""
    privateDomainStrategy: str = ""


class AccountDiagnoseRequest(BaseModel):
    accountId: str | None = None
    readLoggedInWorkspace: bool = True


class AccountCreateRequest(BaseModel):
    platform: Platform
    displayName: str = ""
    handle: str = ""
    authType: AuthType = "browser_session"
    profile: str = ""
    dailyPublishLimit: int = Field(default=3, ge=1, le=20)
    browserProxyEnabled: bool = False
    browserProxyServer: str = ""
    browserProxyBypassList: str = ""
    sauAccountName: str = ""


class AccountBrowserUpdateRequest(BaseModel):
    browserProxyEnabled: bool | None = None
    browserProxyServer: str | None = None
    browserProxyBypassList: str | None = None
    sauAccountName: str | None = None


class AccountProfileSyncRequest(BaseModel):
    displayName: str = ""
    handle: str = ""
    profile: str = ""
    workspaceUrl: str = ""
    pageTitle: str = ""
    source: Literal["browser_bridge", "manual"] = "browser_bridge"
    raw: dict[str, Any] = Field(default_factory=dict)


class AssetCreateRequest(BaseModel):
    contentType: DispatchContentType = "video"
    titleBase: str = Field(min_length=1)
    descriptionBase: str = Field(min_length=1)
    videoUrl: str = Field(min_length=1)
    videoLocalPath: str = ""
    coverUrl: str = Field(min_length=1)
    coverLocalPath: str = ""
    tags: list[str] = Field(default_factory=list)
    durationSeconds: int = Field(ge=1, le=3600)
    owner: str = "内容团队"
    copyrightStatus: CopyrightStatus = "owned"


class AssetFileUploadResponse(BaseModel):
    kind: Literal["video", "cover"]
    fileName: str
    filePath: str
    fileUrl: str
    contentType: str
    bytes: int


class DraftGenerateRequest(BaseModel):
    assetId: str
    accountIds: list[str] | None = None


class TaskCreateRequest(BaseModel):
    draftId: str
    scheduledAt: str | None = None


class PublishPackageCreateRequest(BaseModel):
    folderPath: str = Field(min_length=1)
    contentType: DispatchContentType = "video"
    accountIds: list[str] = Field(default_factory=list)
    scheduledAt: str | None = None
    titleBase: str | None = None
    durationSeconds: int = Field(default=60, ge=1, le=3600)
    owner: str = "内容团队"


class PublishPackageCreateResponse(BaseModel):
    asset: Asset
    drafts: list[PlatformDraft]
    tasks: list[PublishTask]
    detectedFiles: dict[str, str]


class AgentPlanCreateRequest(BaseModel):
    objective: str = "多平台内容发布计划"
