"""Adapter for the optional dreammis/social-auto-upload publishing engine."""
from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import social_auto_upload_enabled
from app.ops.models import Account, Asset, Platform, PlatformDraft, PublishTask, SocialAutoUploadState


DEFAULT_SUPPORTED_VIDEO_PLATFORMS: dict[Platform, str] = {
    "douyin": "douyin",
    "xiaohongshu": "xiaohongshu",
}
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REPO_PATH = PROJECT_ROOT / "integrations" / "social-auto-upload"
DEFAULT_TIMEOUT_SECONDS = 60 * 45


class SocialAutoUploadError(RuntimeError):
    """Base error raised by the social-auto-upload adapter."""


class SocialAutoUploadUnavailable(SocialAutoUploadError):
    """Raised when the local sau command cannot be resolved."""


class SocialAutoUploadUnsupported(SocialAutoUploadError):
    """Raised when a platform is not available through the current sau CLI."""


@dataclass(slots=True)
class SocialAutoUploadRunResult:
    command: list[str]
    cwd: str
    account_name: str
    stdout: str
    stderr: str
    scheduled_for: str | None = None
    draft_mode: bool = False


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sau_cli_platforms(command: list[str] | None, repo_path: Path) -> set[str] | None:
    if not command:
        return None
    try:
        result = _run_sau([*command, "--help"], repo_path, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None

    output = f"{result.stdout}\n{result.stderr}"
    return {platform for platform in {"douyin", "xiaohongshu", "kuaishou", "bilibili", "tencent"} if platform in output}


def _supported_video_platforms(command: list[str] | None = None, repo_path: Path | None = None) -> dict[Platform, str]:
    platforms = dict(DEFAULT_SUPPORTED_VIDEO_PLATFORMS)
    if _env_flag("SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT", False):
        if command and repo_path:
            cli_platforms = _sau_cli_platforms(command, repo_path)
            if cli_platforms is not None and "tencent" not in cli_platforms:
                return platforms
        platforms["wechat_channels"] = "tencent"
    return platforms


def _social_auto_upload_repo_path() -> Path:
    return Path(os.getenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(DEFAULT_REPO_PATH))).expanduser()


def _candidate_sau_commands(repo_path: Path) -> list[list[str]]:
    configured = os.getenv("SOCIAL_AUTO_UPLOAD_CLI")
    if configured:
        return [shlex.split(configured)]

    candidates: list[list[str]] = []
    for relative in (".venv/bin/sau", ".venv/Scripts/sau.exe", "venv/bin/sau", "venv/Scripts/sau.exe"):
        path = repo_path / relative
        if path.exists():
            candidates.append([str(path)])

    resolved = shutil.which("sau")
    if resolved:
        candidates.append([resolved])

    sau_cli = repo_path / "sau_cli.py"
    for relative in (".venv/bin/python", ".venv/Scripts/python.exe", "venv/bin/python", "venv/Scripts/python.exe"):
        python_path = repo_path / relative
        if python_path.exists() and sau_cli.exists():
            candidates.append([str(python_path), str(sau_cli)])

    return candidates


def resolve_sau_command() -> tuple[list[str] | None, str]:
    repo_path = _social_auto_upload_repo_path()
    for command in _candidate_sau_commands(repo_path):
        if not command:
            continue
        executable = command[0]
        if Path(executable).exists() or shutil.which(executable):
            return command, ""

    return None, "未找到 sau CLI；请先运行 scripts/setup_social_auto_upload.sh，或设置 SOCIAL_AUTO_UPLOAD_CLI。"


def get_social_auto_upload_state() -> SocialAutoUploadState:
    repo_path = _social_auto_upload_repo_path()
    command, missing = resolve_sau_command()
    enabled = social_auto_upload_enabled()
    account_home = str(repo_path / "cookies") if repo_path.exists() else ""
    disabled_reason = "SOCIAL_AUTO_UPLOAD_ENABLED=false，发布引擎保持禁用。"
    return SocialAutoUploadState(
        enabled=enabled,
        available=bool(command),
        executionReady=enabled and bool(command),
        cliCommand=command or [],
        repoPath=str(repo_path),
        accountHome=account_home,
        accountPrefix=os.getenv("SOCIAL_AUTO_UPLOAD_ACCOUNT_PREFIX", "").strip(),
        supportedPlatforms=list(_supported_video_platforms(command, repo_path).keys()),
        missingReason=missing if enabled else disabled_reason,
        installHint=(
            "运行 scripts/setup_social_auto_upload.sh，并同时设置 "
            "PUBLISHER_EXECUTION_ENABLED=true、SOCIAL_AUTO_UPLOAD_ENABLED=true、PUBLISHER_RUN_MODE=social_auto_upload。"
        ),
    )


def social_auto_upload_account_name(account: Account) -> str:
    configured = account.sauAccountName.strip()
    raw = configured or account.handle or account.displayName or f"{account.platform}-{account.id[:8]}"
    prefix = os.getenv("SOCIAL_AUTO_UPLOAD_ACCOUNT_PREFIX", "").strip()
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("._-")
    if not cleaned:
        cleaned = f"{account.platform}-{account.id[:8]}"
    name = f"{prefix}{cleaned}" if prefix else cleaned
    return name[:80]


def _asset_video_file_path(asset: Asset) -> Path | None:
    candidates = [asset.videoLocalPath, asset.videoUrl if asset.videoUrl.startswith("/") else ""]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.exists() and path.is_file():
            return path
    return None


def _asset_cover_file_path(asset: Asset) -> Path | None:
    candidates = [asset.coverLocalPath, asset.coverUrl if asset.coverUrl.startswith("/") else ""]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.exists() and path.is_file():
            return path
    return None


def _parse_scheduled_at(value: str) -> datetime | None:
    if not value:
        return None
    cleaned = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _schedule_arg(task: PublishTask) -> str | None:
    if not _env_flag("SOCIAL_AUTO_UPLOAD_ENABLE_SCHEDULE", True):
        return None

    scheduled_at = _parse_scheduled_at(task.scheduledAt)
    if not scheduled_at:
        return None

    now = datetime.now(timezone.utc)
    if scheduled_at <= now + timedelta(minutes=1):
        return None
    return scheduled_at.astimezone().strftime("%Y-%m-%d %H:%M")


def _description_for_cli(draft: PlatformDraft) -> str:
    max_chars = int(os.getenv("SOCIAL_AUTO_UPLOAD_MAX_DESC_CHARS", "1800"))
    text = draft.description.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _run_sau(command: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd.exists() else None,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _clip_output(value: str, limit: int = 1800) -> str:
    cleaned = value.strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[-limit:]


def check_social_auto_upload_session(account: Account) -> tuple[bool, str]:
    if not social_auto_upload_enabled():
        return False, "SOCIAL_AUTO_UPLOAD_ENABLED=false，未执行 sau 登录态检查。"

    base_command, missing = resolve_sau_command()
    if not base_command:
        return False, missing

    repo_path = _social_auto_upload_repo_path()
    platform = _supported_video_platforms(base_command, repo_path).get(account.platform)
    if not platform:
        return False, "social-auto-upload 当前仅默认接入抖音和小红书；视频号需显式开启 SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT=true，且本机 sau 需要支持 tencent CLI。"

    account_name = social_auto_upload_account_name(account)
    timeout = int(os.getenv("SOCIAL_AUTO_UPLOAD_CHECK_TIMEOUT_SECONDS", "240"))
    command = [*base_command, platform, "check", "--account", account_name]
    try:
        result = _run_sau(command, repo_path, timeout)
    except subprocess.TimeoutExpired:
        return False, f"sau 登录态检查超时：{account_name}"

    output = _clip_output("\n".join(part for part in (result.stdout, result.stderr) if part))
    if result.returncode == 0:
        return True, f"sau 登录态有效：{account_name}"
    return False, output or f"sau 登录态无效：请先登录 account={account_name}"


def launch_social_auto_upload_login(account: Account) -> tuple[bool, str, list[str], str]:
    if not social_auto_upload_enabled():
        return False, "SOCIAL_AUTO_UPLOAD_ENABLED=false，未启动 sau 登录。", [], ""

    base_command, missing = resolve_sau_command()
    if not base_command:
        return False, missing, [], ""

    repo_path = _social_auto_upload_repo_path()
    platform = _supported_video_platforms(base_command, repo_path).get(account.platform)
    if not platform:
        return False, "social-auto-upload 当前未启用该平台登录入口，或本机 sau 不支持对应 CLI。", [], ""

    account_name = social_auto_upload_account_name(account)
    command = [*base_command, platform, "login", "--account", account_name, "--headed"]
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    try:
        subprocess.Popen(
            command,
            cwd=str(repo_path) if repo_path.exists() else None,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as exc:
        return False, f"sau 登录启动失败：{exc}", command, account_name

    return True, f"已启动 sau 登录窗口，请完成扫码登录：{account_name}", command, account_name


def run_social_auto_upload_task(account: Account, asset: Asset, draft: PlatformDraft, task: PublishTask) -> SocialAutoUploadRunResult:
    if not social_auto_upload_enabled():
        raise SocialAutoUploadUnavailable("SOCIAL_AUTO_UPLOAD_ENABLED=false，未执行 sau 上传。")

    base_command, missing = resolve_sau_command()
    if not base_command:
        raise SocialAutoUploadUnavailable(missing)

    repo_path = _social_auto_upload_repo_path()
    platform = _supported_video_platforms(base_command, repo_path).get(draft.platform)
    if not platform:
        raise SocialAutoUploadUnsupported(
            "social-auto-upload 当前默认只接入抖音和小红书；视频号仍走浏览器人工接管，或设置 SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT=true 且确认 sau 支持 tencent 后试用。"
        )

    video_path = _asset_video_file_path(asset)
    if not video_path:
        raise SocialAutoUploadError("social-auto-upload 需要本地视频文件；请先通过素材上传保存 videoLocalPath。")

    account_name = social_auto_upload_account_name(account)
    tags = ",".join(tag.lstrip("#") for tag in draft.tags if tag.strip())
    command = [
        *base_command,
        platform,
        "upload-video",
        "--account",
        account_name,
        "--file",
        str(video_path),
        "--title",
        draft.title,
        "--desc",
        _description_for_cli(draft),
    ]
    if tags:
        command.extend(["--tags", tags])

    cover_path = _asset_cover_file_path(asset)
    if cover_path:
        command.extend(["--thumbnail", str(cover_path)])

    scheduled_for = _schedule_arg(task)
    if scheduled_for:
        command.extend(["--schedule", scheduled_for])

    draft_mode = platform == "tencent" and _env_flag("SOCIAL_AUTO_UPLOAD_TENCENT_DRAFT", True)
    if draft_mode:
        command.append("--draft")

    if _env_flag("SOCIAL_AUTO_UPLOAD_DEBUG", False):
        command.append("--debug")
    command.append("--headless" if _env_flag("SOCIAL_AUTO_UPLOAD_HEADLESS", True) else "--headed")

    timeout = int(os.getenv("SOCIAL_AUTO_UPLOAD_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    result = _run_sau(command, repo_path, timeout)
    if result.returncode != 0:
        output = _clip_output("\n".join(part for part in (result.stdout, result.stderr) if part))
        raise SocialAutoUploadError(output or f"sau 上传失败，退出码 {result.returncode}")

    return SocialAutoUploadRunResult(
        command=command,
        cwd=str(repo_path),
        account_name=account_name,
        stdout=_clip_output(result.stdout),
        stderr=_clip_output(result.stderr),
        scheduled_for=scheduled_for,
        draft_mode=draft_mode,
    )
