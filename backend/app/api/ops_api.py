"""Matrix operation API routes."""
from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import require_ops_admin_token
from app.ops.models import (
    Account,
    AccountBrowserUpdateRequest,
    AccountDiagnoseRequest,
    AccountDiagnosisReport,
    AccountCreateRequest,
    AccountMemoryUpdateRequest,
    AccountMetricCollectRequest,
    AccountMetricSnapshotRequest,
    AccountProfileSyncRequest,
    AgentClient,
    AgentClientCreateRequest,
    AgentClientUpdateRequest,
    AgentManifest,
    AgentPlanCreateRequest,
    AgentToolDefinition,
    AgentToolInvokeRequest,
    AgentToolInvokeResponse,
    Asset,
    AssetCreateRequest,
    AssetFileUploadResponse,
    ContentPattern,
    CreatorCoachReport,
    CreatorCoachRequest,
    CreatorCommentDraftReplyRequest,
    CreatorCommentDraftReplyResponse,
    CreatorCommentReplyActionRequest,
    CreatorCommentReplyActionResponse,
    CreatorDataSyncRequest,
    CreatorDataSyncResponse,
    DirectMessageAlert,
    DirectMessageCheckRequest,
    DirectMessageCheckResponse,
    DirectMessageEventRequest,
    DirectMessageMonitor,
    DirectMessageMonitorUpdateRequest,
    DiagnosisActionApplyRequest,
    DiagnosisImportRequest,
    DiagnosisImportResponse,
    DraftGenerateRequest,
    MetricCollectionJob,
    MetricSnapshot,
    OperationsDb,
    PlatformDraft,
    PublishPackageCreateRequest,
    PublishPackageCreateResponse,
    PublishingAgentRun,
    PublishingAgentRunRequest,
    PublishTask,
    SystemProxyState,
    TaskCreateRequest,
    ViralContentCreateRequest,
    ViralContentItem,
    ViralContentSeedRequest,
    ViralContentToAssetRequest,
    ViralContentToAssetResponse,
    WorkspaceOpenResponse,
)
from app.ops.service import (
    check_session,
    acknowledge_direct_message_alert,
    apply_creator_comment_reply_action,
    apply_diagnosis_action,
    check_direct_messages,
    collect_account_metrics,
    create_agent_client,
    create_platform_draft,
    create_task_for_draft,
    ensure_agent_clients,
    ensure_account_browser_profile,
    execute_publish_task,
    find_active_task_for_draft,
    diagnose_account,
    draft_creator_comment_replies,
    generate_agent_plan,
    generate_creator_coach,
    get_content_patterns,
    get_agent_manifest,
    get_agent_tools,
    get_runtime_state,
    get_system_proxy_state,
    import_diagnosis_to_account,
    invoke_agent_tool,
    log,
    normalize_account_memory,
    now_iso,
    open_isolated_browser_workspace,
    PLATFORM_LABELS,
    prepare_isolated_browser_workspace,
    record_direct_message_event,
    record_account_metric_snapshot,
    remember_account_session,
    run_builtin_publishing_agent,
    seed_viral_content_library,
    create_viral_content_item,
    convert_viral_content_to_asset,
    sync_account_profile,
    sync_creator_data,
    update_account_browser_settings,
    update_agent_client,
    update_account_memory,
    update_direct_message_monitor,
)
from app.ops.storage import mutate_ops_db
from app.ops.social_auto_upload import check_social_auto_upload_session, launch_social_auto_upload_login

router = APIRouter(prefix="/ops", tags=["ops"], dependencies=[Depends(require_ops_admin_token)])

ASSET_FILE_RE = re.compile(r"^[a-f0-9]{32}\.(mp4|mov|webm|m4v|jpg|jpeg|png|webp)$", re.IGNORECASE)
ASSET_EXTENSIONS = {
    "video": {".mp4", ".mov", ".webm", ".m4v"},
    "cover": {".jpg", ".jpeg", ".png", ".webp"},
}
ASSET_UPLOAD_LIMITS = {
    "video": 2 * 1024 * 1024 * 1024,
    "cover": 30 * 1024 * 1024,
}
PACKAGE_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v"}
PACKAGE_COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PACKAGE_COPY_NAMES = ("文案", "copy", "caption", "description", "desc", "content", "正文")
PACKAGE_TAG_NAMES = ("话题", "标签", "tags", "hashtags")


def get_asset_uploads_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "ops_asset_uploads"


@router.get("/state", response_model=OperationsDb)
async def get_ops_state():
    return mutate_ops_db(normalize_account_memory)


@router.get("/runtime")
async def get_ops_runtime():
    return get_runtime_state()


@router.get("/system-proxy", response_model=SystemProxyState)
async def get_ops_system_proxy():
    return get_system_proxy_state()


@router.get("/content-patterns", response_model=list[ContentPattern])
async def list_content_patterns():
    return get_content_patterns()


@router.post("/viral-content/seed", response_model=list[ViralContentItem], status_code=201)
async def seed_viral_content(req: ViralContentSeedRequest | None = None):
    return mutate_ops_db(lambda db: seed_viral_content_library(db, req or ViralContentSeedRequest()))


@router.post("/viral-content", response_model=ViralContentItem, status_code=201)
async def create_viral_content(req: ViralContentCreateRequest):
    return mutate_ops_db(lambda db: create_viral_content_item(db, req))


@router.post("/viral-content/to-asset", response_model=ViralContentToAssetResponse, status_code=201)
async def convert_viral_content(req: ViralContentToAssetRequest):
    result = mutate_ops_db(lambda db: convert_viral_content_to_asset(db, req))
    if isinstance(result, str):
        raise HTTPException(404, result)
    return result


@router.post("/accounts", response_model=Account, status_code=201)
async def create_account(req: AccountCreateRequest):
    def mutate(db: OperationsDb) -> Account | str:
        now = now_iso()
        platform_label = PLATFORM_LABELS[req.platform]
        handle = req.handle.strip() or f"{req.platform}-{uuid4().hex[:8]}"
        display_name = req.displayName.strip() or f"{platform_label}账号（待扫码）"
        profile = req.profile.strip() or f"{platform_label}创作者中心扫码接入"
        item = Account(
            id=str(uuid4()),
            platform=req.platform,
            displayName=display_name,
            handle=handle,
            authType=req.authType,
            profile=profile,
            dailyPublishLimit=req.dailyPublishLimit,
            sauAccountName=req.sauAccountName,
            status="connected" if req.authType == "oauth" else "needs_login",
            sessionHealth="healthy" if req.authType == "oauth" else "unknown",
            createdAt=now,
            updatedAt=now,
        )
        ensure_account_browser_profile(item)
        db.accounts.insert(0, item)
        browser_update = update_account_browser_settings(
            db,
            item.id,
            AccountBrowserUpdateRequest(
                browserProxyEnabled=req.browserProxyEnabled,
                browserProxyServer=req.browserProxyServer,
                browserProxyBypassList=req.browserProxyBypassList,
            ),
        )
        if isinstance(browser_update, str):
            db.accounts = [account for account in db.accounts if account.id != item.id]
            return browser_update
        return item

    result = mutate_ops_db(mutate)
    if isinstance(result, str):
        raise HTTPException(400, result)
    return result


@router.post("/accounts/{account_id}/session-check", response_model=Account)
async def check_account_session(account_id: str):
    def mutate(db: OperationsDb) -> Account | None:
        account = next((item for item in db.accounts if item.id == account_id), None)
        if not account:
            return None
        runtime = get_runtime_state()
        if (
            runtime.publisherRunMode == "social_auto_upload"
            and account.status != "disabled"
            and account.authType != "manual"
            and account.platform in runtime.socialAutoUpload.supportedPlatforms
        ):
            ok, _ = check_social_auto_upload_session(account)
        else:
            ok, _, _ = check_session(account)
        account.sessionHealth = "healthy" if ok else "expired"
        account.status = "connected" if ok else "needs_login"
        account.updatedAt = now_iso()
        return account

    account = mutate_ops_db(mutate)
    if not account:
        raise HTTPException(404, "account_not_found")
    return account


@router.post("/accounts/{account_id}/social-auto-upload/login")
async def start_account_social_auto_upload_login(account_id: str):
    def read_account(db: OperationsDb) -> Account | None:
        return next((item for item in db.accounts if item.id == account_id), None)

    account = mutate_ops_db(read_account)
    if not account:
        raise HTTPException(404, "account_not_found")

    ok, message, command, account_name = launch_social_auto_upload_login(account)
    if not ok:
        raise HTTPException(409, message)
    return {
        "ok": ok,
        "message": message,
        "command": command,
        "accountName": account_name,
    }


@router.post("/accounts/{account_id}/open-workspace", response_model=WorkspaceOpenResponse)
async def open_account_workspace(account_id: str):
    """Open a per-account isolated browser profile without submitting anything."""

    def mutate(db: OperationsDb) -> WorkspaceOpenResponse | None:
        account = next((item for item in db.accounts if item.id == account_id), None)
        if not account:
            return None
        return open_isolated_browser_workspace(account)

    result = mutate_ops_db(mutate)
    if not result:
        raise HTTPException(404, "account_not_found")
    return result


@router.post("/accounts/{account_id}/prepare-workspace", response_model=WorkspaceOpenResponse)
async def prepare_account_workspace(account_id: str):
    """Prepare per-account browser settings for the desktop embedded browser."""

    def mutate(db: OperationsDb) -> WorkspaceOpenResponse | None:
        account = next((item for item in db.accounts if item.id == account_id), None)
        if not account:
            return None
        return prepare_isolated_browser_workspace(account)

    result = mutate_ops_db(mutate)
    if not result:
        raise HTTPException(404, "account_not_found")
    return result


@router.post("/accounts/{account_id}/remember-session", response_model=Account)
async def remember_account_login(account_id: str):
    """Mark the current isolated browser profile as the saved login for this account."""

    def mutate(db: OperationsDb) -> Account | None:
        account = next((item for item in db.accounts if item.id == account_id), None)
        if not account:
            return None
        return remember_account_session(account)

    account = mutate_ops_db(mutate)
    if not account:
        raise HTTPException(404, "account_not_found")
    return account


@router.post("/accounts/{account_id}/sync-profile", response_model=Account)
async def sync_account_profile_from_browser(account_id: str, req: AccountProfileSyncRequest):
    """Sync account identity detected from the logged-in creator center browser."""

    def mutate(db: OperationsDb) -> Account | None:
        account = next((item for item in db.accounts if item.id == account_id), None)
        if not account:
            return None
        return sync_account_profile(account, req)

    account = mutate_ops_db(mutate)
    if not account:
        raise HTTPException(404, "account_not_found")
    return account


@router.post("/creator-data/sync", response_model=CreatorDataSyncResponse, status_code=201)
async def sync_creator_data_from_browser(req: CreatorDataSyncRequest):
    """Sync visible creator-center post/comment data from the isolated account browser."""

    result = mutate_ops_db(lambda db: sync_creator_data(db, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/creator-comments/draft-replies", response_model=CreatorCommentDraftReplyResponse)
async def draft_creator_comment_reply_batch(req: CreatorCommentDraftReplyRequest):
    return mutate_ops_db(lambda db: draft_creator_comment_replies(db, req))


@router.post("/creator-comments/{comment_id}/reply-action", response_model=CreatorCommentReplyActionResponse)
async def apply_creator_comment_reply(comment_id: str, req: CreatorCommentReplyActionRequest):
    result = mutate_ops_db(lambda db: apply_creator_comment_reply_action(db, comment_id, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "comment_not_found" else 409, result)
    return result


@router.patch("/accounts/{account_id}/browser", response_model=Account)
async def patch_account_browser(account_id: str, req: AccountBrowserUpdateRequest):
    """Update per-account isolated browser settings, including proxy."""

    result = mutate_ops_db(lambda db: update_account_browser_settings(db, account_id, req))
    if isinstance(result, str):
        status_code = 404 if result == "account_not_found" else 400
        raise HTTPException(status_code, result)
    return result


@router.patch("/accounts/{account_id}/memory", response_model=Account)
async def patch_account_memory(account_id: str, req: AccountMemoryUpdateRequest):
    result = mutate_ops_db(lambda db: update_account_memory(db, account_id, req))
    if isinstance(result, str):
        raise HTTPException(404, result)
    return result


@router.post("/accounts/{account_id}/diagnose", response_model=AccountDiagnosisReport, status_code=201)
async def diagnose_ops_account(account_id: str, req: AccountDiagnoseRequest | None = None):
    request = req or AccountDiagnoseRequest()
    request.accountId = account_id
    result = mutate_ops_db(lambda db: diagnose_account(db, request))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/accounts/{account_id}/metrics", response_model=MetricSnapshot, status_code=201)
async def record_ops_account_metrics(account_id: str, req: AccountMetricSnapshotRequest):
    req.accountId = account_id
    result = mutate_ops_db(lambda db: record_account_metric_snapshot(db, req))
    if isinstance(result, str):
        raise HTTPException(404, result)
    return result


@router.post("/accounts/{account_id}/metrics/collect", response_model=MetricCollectionJob, status_code=201)
async def collect_ops_account_metrics(account_id: str, req: AccountMetricCollectRequest | None = None):
    request = req or AccountMetricCollectRequest()
    request.accountId = account_id
    result = mutate_ops_db(lambda db: collect_account_metrics(db, request))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/accounts/{account_id}/coach", response_model=CreatorCoachReport, status_code=201)
async def create_creator_coach_report(account_id: str, req: CreatorCoachRequest | None = None):
    request = req or CreatorCoachRequest()
    request.accountId = account_id
    result = mutate_ops_db(lambda db: generate_creator_coach(db, request))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/assets/upload-file", response_model=AssetFileUploadResponse, status_code=201)
async def upload_asset_file(kind: str, file: UploadFile = File(...)):
    """Store a local video or cover file for browser-based publishing."""

    if kind not in ASSET_EXTENSIONS:
        raise HTTPException(400, "unsupported_asset_file_kind")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ASSET_EXTENSIONS[kind]:
        raise HTTPException(400, "unsupported_asset_file_type")

    root = get_asset_uploads_dir()
    root.mkdir(parents=True, exist_ok=True)
    file_name = f"{uuid4().hex}{suffix}"
    file_path = root / file_name
    limit = ASSET_UPLOAD_LIMITS[kind]
    total = 0

    try:
        with file_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    out.close()
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(413, "asset_file_too_large")
                out.write(chunk)
    finally:
        await file.close()

    return AssetFileUploadResponse(
        kind=kind,  # type: ignore[arg-type]
        fileName=file_name,
        filePath=str(file_path),
        fileUrl=f"/api/ops/assets/file/{file_name}",
        contentType=file.content_type or "application/octet-stream",
        bytes=total,
    )


@router.get("/assets/file/{file_name}")
async def get_asset_file(file_name: str):
    if not ASSET_FILE_RE.fullmatch(file_name):
        raise HTTPException(400, "invalid_asset_file_name")

    file_path = get_asset_uploads_dir() / file_name
    if not file_path.exists():
        raise HTTPException(404, "asset_file_not_found")

    return FileResponse(file_path)


@router.post("/assets", response_model=Asset, status_code=201)
async def create_asset(req: AssetCreateRequest):
    def mutate(db: OperationsDb) -> Asset:
        now = now_iso()
        item = Asset(
            id=str(uuid4()),
            contentType=req.contentType,
            titleBase=req.titleBase,
            descriptionBase=req.descriptionBase,
            videoUrl=req.videoUrl,
            videoLocalPath=req.videoLocalPath,
            coverUrl=req.coverUrl,
            coverLocalPath=req.coverLocalPath,
            tags=req.tags,
            durationSeconds=req.durationSeconds,
            owner=req.owner,
            copyrightStatus=req.copyrightStatus,
            createdAt=now,
            updatedAt=now,
        )
        db.assets.insert(0, item)
        return item

    return mutate_ops_db(mutate)


def _first_package_file(folder: Path, extensions: set[str], preferred_keywords: tuple[str, ...] = ()) -> Path | None:
    files = [item for item in folder.iterdir() if item.is_file() and item.suffix.lower() in extensions]
    if not files:
        return None
    for keyword in preferred_keywords:
        matched = next((item for item in files if keyword.lower() in item.stem.lower()), None)
        if matched:
            return matched
    return sorted(files, key=lambda item: item.name.lower())[0]


def _read_package_text(folder: Path, names: tuple[str, ...]) -> tuple[str, Path | None]:
    text_files = [item for item in folder.iterdir() if item.is_file() and item.suffix.lower() in {".txt", ".md"}]
    for name in names:
        matched = next((item for item in text_files if item.stem.lower() == name.lower()), None)
        if matched:
            return matched.read_text(encoding="utf-8", errors="ignore").strip(), matched
    return "", None


def _tags_from_package(value: str, description: str) -> list[str]:
    raw = re.split(r"[,，、\s#]+", value)
    explicit = [item.strip() for item in raw if item.strip()]
    hashtags = re.findall(r"#([\w\u4e00-\u9fff-]+)", description)
    return list(dict.fromkeys([*explicit, *hashtags]))[:12]


@router.post("/publish-packages/from-folder", response_model=PublishPackageCreateResponse, status_code=201)
async def create_publish_package_from_folder(req: PublishPackageCreateRequest):
    folder = Path(req.folderPath).expanduser()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, "folder_not_found")

    video = _first_package_file(folder, PACKAGE_VIDEO_EXTENSIONS, ("video", "视频"))
    cover = _first_package_file(folder, PACKAGE_COVER_EXTENSIONS, ("cover", "封面"))
    description, description_file = _read_package_text(folder, PACKAGE_COPY_NAMES)
    tags_text, tags_file = _read_package_text(folder, PACKAGE_TAG_NAMES)
    title_text, title_file = _read_package_text(folder, ("title", "标题"))

    missing = []
    if not video:
        missing.append("video")
    if not cover:
        missing.append("cover")
    if not description:
        missing.append("copy")
    if missing:
        raise HTTPException(400, f"publish_package_missing_{'_'.join(missing)}")

    detected = {"folder": str(folder), "video": str(video), "cover": str(cover)}
    if description_file:
        detected["copy"] = str(description_file)
    if tags_file:
        detected["tags"] = str(tags_file)
    if title_file:
        detected["title"] = str(title_file)

    def mutate(db: OperationsDb) -> PublishPackageCreateResponse | str:
        now = now_iso()
        title = (req.titleBase or title_text or video.stem).strip()
        asset = Asset(
            id=str(uuid4()),
            contentType=req.contentType,
            titleBase=title,
            descriptionBase=description,
            videoUrl=str(video),
            videoLocalPath=str(video),
            coverUrl=str(cover),
            coverLocalPath=str(cover),
            tags=_tags_from_package(tags_text, description),
            durationSeconds=req.durationSeconds,
            owner=req.owner,
            copyrightStatus="owned",
            createdAt=now,
            updatedAt=now,
        )
        accounts = [
            account
            for account in db.accounts
            if (account.id in req.accountIds if req.accountIds else account.status != "disabled")
        ]
        if not accounts:
            return "no_target_accounts"
        drafts: list[PlatformDraft] = []
        tasks: list[PublishTask] = []
        db.assets.insert(0, asset)
        for account in accounts:
            draft = create_platform_draft(asset, account)
            db.drafts.insert(0, draft)
            drafts.append(draft)
            task = create_task_for_draft(draft, account, req.scheduledAt)
            db.tasks.insert(0, task)
            tasks.append(task)
        return PublishPackageCreateResponse(asset=asset, drafts=drafts, tasks=tasks, detectedFiles=detected)

    result = mutate_ops_db(mutate)
    if isinstance(result, str):
        raise HTTPException(409, result)
    return result


@router.post("/drafts/generate", status_code=201)
async def generate_drafts(req: DraftGenerateRequest):
    def mutate(db: OperationsDb):
        asset = next((item for item in db.assets if item.id == req.assetId), None)
        if not asset:
            return None
        accounts = [
            account
            for account in db.accounts
            if (account.id in req.accountIds if req.accountIds else account.status != "disabled")
        ]
        drafts = []
        for account in accounts:
            existing = next(
                (item for item in db.drafts if item.assetId == asset.id and item.accountId == account.id),
                None,
            )
            if existing:
                drafts.append(existing)
                continue
            draft = create_platform_draft(asset, account)
            db.drafts.insert(0, draft)
            drafts.append(draft)
        return drafts

    drafts = mutate_ops_db(mutate)
    if drafts is None:
        raise HTTPException(404, "asset_not_found")
    return drafts


@router.post("/tasks", response_model=PublishTask, status_code=201)
async def create_task(req: TaskCreateRequest):
    def mutate(db: OperationsDb) -> PublishTask | str | None:
        draft = next((item for item in db.drafts if item.id == req.draftId), None)
        account = next((item for item in db.accounts if draft and item.id == draft.accountId), None)
        if not draft or not account:
            return None
        existing = find_active_task_for_draft(db.tasks, draft.id)
        if existing:
            return "task_already_exists"
        task = create_task_for_draft(draft, account, req.scheduledAt)
        db.tasks.insert(0, task)
        return task

    result = mutate_ops_db(mutate)
    if isinstance(result, str):
        raise HTTPException(409, result)
    if not result:
        raise HTTPException(404, "draft_not_found")
    return result


@router.post("/tasks/{task_id}/approve", response_model=PublishTask)
async def approve_task(task_id: str):
    def mutate(db: OperationsDb) -> PublishTask | str | None:
        task = next((item for item in db.tasks if item.id == task_id), None)
        if not task:
            return None
        previous_status = task.status
        if task.status in {"published", "manual_takeover", "publishing", "cancelled"}:
            return "task_not_approvable"
        if task.status == "scheduled":
            task.logs.insert(0, log("任务已在排期中"))
            task.updatedAt = now_iso()
            return task
        task.status = "scheduled"
        task.logs.insert(0, log("人工审核通过，进入排期" if previous_status == "pending_review" else "任务已重新进入排期"))
        task.updatedAt = now_iso()
        return task

    result = mutate_ops_db(mutate)
    if isinstance(result, str):
        raise HTTPException(409, result)
    if not result:
        raise HTTPException(404, "task_not_found")
    return result


@router.post("/tasks/{task_id}/execute", response_model=PublishTask)
async def execute_task(task_id: str):
    def mutate(db: OperationsDb) -> PublishTask | dict[str, str]:
        task = next((item for item in db.tasks if item.id == task_id), None)
        if not task:
            return {"error": "task_not_found"}
        draft = next((item for item in db.drafts if item.id == task.draftId), None)
        account = next((item for item in db.accounts if item.id == task.accountId), None)
        asset = next((item for item in db.assets if draft and item.id == draft.assetId), None)
        if not draft or not account or not asset:
            return {"error": "task_context_missing"}
        return execute_publish_task(task, account, asset, draft)

    result = mutate_ops_db(mutate)
    if isinstance(result, dict):
        raise HTTPException(404 if result["error"] == "task_not_found" else 409, result["error"])
    return result


@router.get("/agent/tools", response_model=list[AgentToolDefinition])
async def list_agent_tools():
    """Machine-readable tool list for external Agents."""

    return get_agent_tools()


@router.get("/agent/manifest", response_model=AgentManifest)
async def get_agent_control_manifest():
    """Machine-readable manifest for external Agents and local orchestrators."""

    return mutate_ops_db(get_agent_manifest)


@router.get("/agent/clients", response_model=list[AgentClient])
async def list_agent_clients():
    return mutate_ops_db(lambda db: ensure_agent_clients(db).agentClients)


@router.post("/agent/clients", response_model=AgentClient, status_code=201)
async def register_agent_client(req: AgentClientCreateRequest):
    return mutate_ops_db(lambda db: create_agent_client(db, req))


@router.patch("/agent/clients/{client_id}", response_model=AgentClient)
async def patch_agent_client(client_id: str, req: AgentClientUpdateRequest):
    result = mutate_ops_db(lambda db: update_agent_client(db, client_id, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "agent_client_not_found" else 409, result)
    return result


@router.post("/agent/invoke", response_model=AgentToolInvokeResponse)
async def invoke_agent_control(req: AgentToolInvokeRequest):
    """Single controlled entry point for external Agents."""

    return mutate_ops_db(
        lambda db: invoke_agent_tool(db, req.tool, req.arguments, req.confirmed, req.clientId, req.purpose)
    )


@router.post("/agent/plans", status_code=201)
async def create_agent_plan(req: AgentPlanCreateRequest):
    return mutate_ops_db(lambda db: generate_agent_plan(db, req.objective))


@router.post("/agent/publishing-runs", response_model=PublishingAgentRun, status_code=201)
async def run_publishing_agent(req: PublishingAgentRunRequest):
    return mutate_ops_db(lambda db: run_builtin_publishing_agent(db, req))


@router.post("/diagnosis/import", response_model=DiagnosisImportResponse, status_code=201)
async def import_diagnosis(req: DiagnosisImportRequest):
    result = mutate_ops_db(lambda db: import_diagnosis_to_account(db, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/account-diagnoses/{report_id}/actions/apply", response_model=DiagnosisImportResponse, status_code=201)
async def apply_account_diagnosis_action(report_id: str, req: DiagnosisActionApplyRequest):
    result = mutate_ops_db(lambda db: apply_diagnosis_action(db, report_id, req))
    if isinstance(result, str):
        status = 404 if result in {"diagnosis_report_not_found", "diagnosis_action_not_found"} else 409
        raise HTTPException(status, result)
    return result


@router.post("/direct-messages/check", response_model=DirectMessageCheckResponse)
async def check_direct_message_notifications(req: DirectMessageCheckRequest):
    return mutate_ops_db(lambda db: check_direct_messages(db, req))


@router.patch("/direct-messages/monitors/{account_id}", response_model=DirectMessageMonitor)
async def patch_direct_message_monitor(account_id: str, req: DirectMessageMonitorUpdateRequest):
    result = mutate_ops_db(lambda db: update_direct_message_monitor(db, account_id, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/direct-messages/events", response_model=DirectMessageCheckResponse, status_code=201)
async def record_direct_message_notification(req: DirectMessageEventRequest):
    result = mutate_ops_db(lambda db: record_direct_message_event(db, req))
    if isinstance(result, str):
        raise HTTPException(404 if result == "account_not_found" else 409, result)
    return result


@router.post("/direct-messages/alerts/{alert_id}/acknowledge", response_model=DirectMessageAlert)
async def acknowledge_direct_message_notification(alert_id: str):
    result = mutate_ops_db(lambda db: acknowledge_direct_message_alert(db, alert_id))
    if isinstance(result, str):
        raise HTTPException(404, result)
    return result
