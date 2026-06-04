"""Note diagnose API routes."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import ipaddress
import logging
import os
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import DiagnoseResponse
from app.platforms.douyin import build_douyin_report
from app.platforms.wechat_channels import build_wechat_fallback_report, enrich_wechat_report

router = APIRouter()
logger = logging.getLogger("videorx.diagnose")

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
# 视频上传上限（诊断 / 快识 / 深度分析共用）。时长与体积无固定关系，高码率 4K 录屏几十秒即可超百 MB。
_max_video_mb = int(os.getenv("MAX_VIDEO_UPLOAD_MB", "300"))
_max_video_mb = max(1, min(_max_video_mb, 1024))
MAX_VIDEO_SIZE = _max_video_mb * 1024 * 1024
MAX_IMAGE_COUNT = 9
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/x-ms-wmv"}
MIMO_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv"}

MIME_TO_EXT = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "video/x-ms-wmv": ".wmv",
    "video/webm": ".webm",
}
VIDEO_FILE_RE = re.compile(r"^[a-f0-9]{32}_[0-9]{10}\.(mp4|mov|avi|wmv|webm)$")
TEMP_VIDEO_TTL_SECONDS = int(os.getenv("TEMP_VIDEO_TTL_SECONDS", "900"))
TEMP_VIDEO_SIGNING_KEY = os.getenv("TEMP_VIDEO_SIGNING_KEY", "dev-change-me")
TEMP_VIDEO_PUBLIC_BASE_URL = os.getenv("MIMO_VIDEO_PUBLIC_BASE_URL", "").strip().rstrip("/")
TEMP_VIDEO_DIR = Path(
    os.getenv(
        "TEMP_VIDEO_DIR",
        str(Path(__file__).resolve().parents[2] / "data" / "temp_videos"),
    )
)


def _extract_first_video_frame(
    video_bytes: bytes,
    container_suffix: str = ".mp4",
) -> Optional[bytes]:
    """
    从视频字节中抽取首帧为 JPEG。
    @param container_suffix - 临时文件后缀，需与真实封装一致（如 .mov/.webm），否则 OpenCV 可能打不开
    """
    try:
        import cv2
    except Exception:
        logger.warning("OpenCV unavailable; skip extracting video frame")
        return None

    suffix = container_suffix if container_suffix.startswith(".") else f".{container_suffix}"
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(video_bytes)
            temp_path = temp_file.name

        capture = cv2.VideoCapture(temp_path)
        if not capture.isOpened():
            capture.release()
            return None
        frame = None
        # 部分编码/首帧为黑屏时第一次 read 会失败，多读几帧再放弃
        for _ in range(90):
            ok, fr = capture.read()
            if ok and fr is not None and getattr(fr, "size", 0) > 0:
                frame = fr
                break
        capture.release()
        if frame is None:
            return None

        encode_ok, encoded = cv2.imencode(".jpg", frame)
        if not encode_ok:
            return None
        return encoded.tobytes()
    except Exception as exc:
        logger.warning("Extract video frame failed: %s", exc)
        return None
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.warning("Failed to remove temp file: %s", temp_path)


async def _read_and_validate_image(file: UploadFile, field_name: str) -> bytes:
    if file.content_type and file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(400, f"不支持的图片格式（{field_name}）：{file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(400, f"{field_name} 超过 {MAX_IMAGE_SIZE // (1024 * 1024)}MB 限制")
    return image_bytes


async def _read_and_validate_video(file: UploadFile) -> bytes:
    if file.content_type and file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(400, f"不支持的视频格式：{file.content_type}")

    video_bytes = await file.read()
    if len(video_bytes) > MAX_VIDEO_SIZE:
        raise HTTPException(400, f"video_file 超过 {MAX_VIDEO_SIZE // (1024 * 1024)}MB 限制")
    return video_bytes


# ─── Temp video URL serving (for MiMo video_url mode) ───

def _ensure_temp_video_dir() -> None:
    TEMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)


def _sign_temp_video(file_name: str, exp: int) -> str:
    payload = f"{file_name}:{exp}".encode("utf-8")
    return hmac.new(TEMP_VIDEO_SIGNING_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _cleanup_expired_temp_videos(now_ts: Optional[int] = None) -> None:
    _ensure_temp_video_dir()
    now = now_ts or int(time.time())
    for item in TEMP_VIDEO_DIR.iterdir():
        if not item.is_file():
            continue
        name = item.name
        if not VIDEO_FILE_RE.fullmatch(name):
            continue
        exp_str = name.split("_", 1)[1].split(".", 1)[0]
        try:
            exp = int(exp_str)
        except ValueError:
            continue
        if exp < now - 60:
            try:
                item.unlink(missing_ok=True)
            except Exception:
                logger.warning("Failed to delete expired temp video: %s", item)


def _resolve_public_base_url(request: Request) -> tuple[str, str]:
    """
    解析用于生成 temp-video 公网链接的基址与来源。
    @returns (base_url, source) where source in {"env", "forwarded", "request_base"}
    """
    if TEMP_VIDEO_PUBLIC_BASE_URL:
        return TEMP_VIDEO_PUBLIC_BASE_URL, "env"
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if proto and host:
        return f"{proto}://{host}".rstrip("/"), "forwarded"
    return str(request.base_url).rstrip("/"), "request_base"


def _build_public_base_url(request: Request) -> str:
    """
    生成 MiMo 等云端服务可拉取的 API 根 URL（不含路径）。
    上线时在反向代理后应配置 X-Forwarded-Proto / X-Forwarded-Host；
    或显式设置 MIMO_VIDEO_PUBLIC_BASE_URL（推荐固定为对外的 https 域名）。
    """
    base_url, _ = _resolve_public_base_url(request)
    return base_url


def _is_public_host(host: str) -> bool:
    """判断 host 是否可被云端服务访问（尽力判定）。"""
    h = (host or "").strip().lower().strip("[]")
    if not h:
        return False
    if h in ("localhost", "127.0.0.1", "::1"):
        return False
    if h.endswith(".local") or h.endswith(".internal") or h.endswith(".lan") or h.endswith(".home.arpa"):
        return False

    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        # 单标签主机名通常为内网 DNS 别名
        if "." not in h:
            return False
        return True

    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def get_public_base_url_diagnostics(request: Request) -> dict:
    """
    返回 video_url 可用性诊断信息。
    字段：
    - ok: 是否可用
    - reason: 不可用原因（或 ok）
    - source: 基址来源 env/forwarded/request_base
    - base_url: 解析出的基址
    - scheme/host: 解析出的协议与主机
    """
    base_url, source = _resolve_public_base_url(request)
    parsed = urlparse(base_url)
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()

    if not scheme or not host:
        return {
            "ok": False,
            "reason": "base_url 解析失败（缺少 scheme 或 host）",
            "source": source,
            "base_url": base_url,
            "scheme": scheme,
            "host": host,
        }
    if scheme not in ("http", "https"):
        return {
            "ok": False,
            "reason": f"不支持的协议: {scheme}",
            "source": source,
            "base_url": base_url,
            "scheme": scheme,
            "host": host,
        }
    if not _is_public_host(host):
        return {
            "ok": False,
            "reason": f"host 非公网可达: {host}",
            "source": source,
            "base_url": base_url,
            "scheme": scheme,
            "host": host,
        }

    warning = ""
    if scheme != "https":
        warning = "建议使用 https 公网地址，避免第三方拉取失败"
    return {
        "ok": True,
        "reason": "ok",
        "source": source,
        "base_url": base_url,
        "scheme": scheme,
        "host": host,
        "warning": warning,
    }


def public_base_url_is_localhost_only(request: Request) -> bool:
    """
    兼容旧调用方：返回是否“不适合云端拉取 temp-video”。
    注意：名称历史遗留，当前判定不仅覆盖 localhost，也覆盖私网/内网 host。
    """
    return not bool(get_public_base_url_diagnostics(request).get("ok"))


def _store_temp_video_and_build_url(request: Request, video_bytes: bytes, mime: str) -> str:
    _cleanup_expired_temp_videos()
    _ensure_temp_video_dir()

    now = int(time.time())
    exp = now + max(60, TEMP_VIDEO_TTL_SECONDS)
    ext = MIME_TO_EXT.get(mime, ".mp4")
    file_name = f"{uuid.uuid4().hex}_{exp}{ext}"
    file_path = TEMP_VIDEO_DIR / file_name
    file_path.write_bytes(video_bytes)

    sig = _sign_temp_video(file_name, exp)
    base = _build_public_base_url(request)
    return f"{base}/api/temp-video/{file_name}?exp={exp}&sig={sig}"


@router.get("/video-public-url-health")
async def video_public_url_health(request: Request):
    """
    返回当前环境下 video_url 公网可达性诊断结果（用于联调排错）。
    """
    diag = get_public_base_url_diagnostics(request)
    return {
        **diag,
        "temp_video_ttl_seconds": TEMP_VIDEO_TTL_SECONDS,
        "max_video_upload_mb": MAX_VIDEO_SIZE // (1024 * 1024),
        "recommendation": (
            "若 ok=false，请设置 MIMO_VIDEO_PUBLIC_BASE_URL 为公网 HTTPS 域名；"
            "或在反向代理正确透传 X-Forwarded-Proto / X-Forwarded-Host。"
        ),
    }


@router.get("/temp-video/{file_name}")
async def get_temp_video(
    file_name: str,
    exp: int = Query(...),
    sig: str = Query(...),
):
    if not VIDEO_FILE_RE.fullmatch(file_name):
        raise HTTPException(400, "invalid file name")

    expected_sig = _sign_temp_video(file_name, exp)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(403, "invalid signature")

    if exp < int(time.time()):
        raise HTTPException(410, "video url expired")

    file_path = TEMP_VIDEO_DIR / file_name
    if not file_path.exists():
        raise HTTPException(404, "video not found")

    ext = file_path.suffix.lower()
    media_type = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".webm": "video/webm",
    }.get(ext, "application/octet-stream")
    return FileResponse(path=file_path, media_type=media_type, filename=file_name)


def _build_metrics(
    plays: Optional[float],
    likes: Optional[float],
    comments: Optional[float],
    shares: Optional[float],
    favorites: Optional[float],
    followers_gained: Optional[float],
    completion_rate: Optional[float],
) -> dict:
    metrics = {
        "plays": plays,
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "favorites": favorites,
        "followers_gained": followers_gained,
        "completion_rate": completion_rate,
    }
    return {k: v for k, v in metrics.items() if v is not None}


@dataclass
class ParsedDiagnoseInput:
    platform: str
    title: str
    content: str
    tags: str
    tag_list: list[str]
    image_bytes: Optional[bytes]
    parsed_images: list[bytes]
    video_bytes: Optional[bytes]
    video_analysis: Optional[dict]
    metrics: dict


async def _parse_diagnose_input(
    request: Request,
    *,
    platform: str,
    title: str,
    content: str,
    category: str,
    tags: str,
    plays: Optional[float],
    likes: Optional[float],
    comments: Optional[float],
    shares: Optional[float],
    favorites: Optional[float],
    followers_gained: Optional[float],
    completion_rate: Optional[float],
    cover_image: Optional[UploadFile],
    cover_images: Optional[list[UploadFile]],
    video_file: Optional[UploadFile],
    stream: bool = False,
) -> ParsedDiagnoseInput:
    """Shared upload parsing, media analysis, OCR fallback, and metrics assembly."""
    resolved_platform = _platform_from_path(request.url.path) or platform

    image_files: list[UploadFile] = []
    if cover_image is not None:
        image_files.append(cover_image)
    if cover_images:
        image_files.extend(cover_images)

    if len(image_files) > MAX_IMAGE_COUNT:
        raise HTTPException(400, f"最多只允许上传 {MAX_IMAGE_COUNT} 张图片")

    parsed_images: list[bytes] = []
    for index, image in enumerate(image_files):
        parsed_images.append(await _read_and_validate_image(image, f"cover_images[{index}]"))

    video_bytes: Optional[bytes] = None
    if video_file is not None:
        video_bytes = await _read_and_validate_video(video_file)

    image_bytes = parsed_images[0] if parsed_images else None
    if len(parsed_images) > 1 and not stream:
        logger.info("Received %d images; use first image as cover for current pipeline", len(parsed_images))

    video_analysis: Optional[dict] = None
    if video_bytes is not None:
        mime_for_video = (video_file.content_type if video_file else None) or "video/mp4"
        ext = MIME_TO_EXT.get(mime_for_video, ".mp4")
        url_diag = get_public_base_url_diagnostics(request)
        if image_bytes is None:
            extracted = _extract_first_video_frame(video_bytes, ext)
            if extracted is not None:
                image_bytes = extracted
                if not stream:
                    logger.info("Using first frame from video for visual analysis")
            elif not stream:
                logger.info("Video frame extraction failed, visual baseline may fallback")

        if mime_for_video in MIMO_VIDEO_MIME and bool(url_diag.get("ok")):
            logger.info(
                "Trying MiMo video understanding%s via signed temp URL (%s)",
                "(stream)" if stream else "",
                mime_for_video,
            )
            try:
                from app.analysis.video_analyzer import VideoAnalyzer

                video_url = _store_temp_video_and_build_url(request, video_bytes, mime_for_video)
                analyzer = VideoAnalyzer()
                video_analysis = await analyzer.analyze(
                    video_url,
                    prompt_hint=f"title={title[:80]} | category={category}",
                )
            except Exception as e:
                logger.warning("Video understanding failed%s: %s", "(stream)" if stream else "", e)
        elif mime_for_video in MIMO_VIDEO_MIME:
            logger.info(
                "Skip MiMo video_url%s: %s (source=%s, base=%s); "
                "set MIMO_VIDEO_PUBLIC_BASE_URL or X-Forwarded-* for full video understanding",
                "(stream)" if stream else "",
                url_diag.get("reason"),
                url_diag.get("source"),
                url_diag.get("base_url"),
            )
        else:
            logger.info("Video mime %s outside MiMo supported types; skip video understanding", mime_for_video)

    tag_list = [token.strip() for token in tags.split(",") if token.strip()] if tags else []
    metrics = _build_metrics(plays, likes, comments, shares, favorites, followers_gained, completion_rate)

    if parsed_images and not title.strip():
        if not stream:
            logger.info("Title is empty; trying OCR")
        from app.agents.base_agent import _get_client
        from app.analysis.ocr_processor import OCRProcessor

        ocr = OCRProcessor()
        for idx, one_image in enumerate(parsed_images):
            ocr_result = await ocr.extract_text(one_image, client=_get_client())
            if not title.strip() and ocr_result.get("title"):
                title = ocr_result["title"]
            if not content.strip() and ocr_result.get("content"):
                content = ocr_result["content"]
            if not tag_list and ocr_result.get("tags"):
                tag_list = ocr_result["tags"]
            if not stream:
                logger.info("OCR[%d] output: title=%s, tags=%s", idx, title[:30] if title else "", tag_list)
            if title.strip() and content.strip():
                break
        if not stream:
            logger.info("OCR output: title=%s, tags=%s", title[:30] if title else "", tag_list)

    if not title.strip():
        raise HTTPException(400, "请输入标题，或上传可识别标题的图片/视频")

    return ParsedDiagnoseInput(
        platform=resolved_platform,
        title=title,
        content=content,
        tags=tags,
        tag_list=tag_list,
        image_bytes=image_bytes,
        parsed_images=parsed_images,
        video_bytes=video_bytes,
        video_analysis=video_analysis,
        metrics=metrics,
    )


def _platform_from_path(path: str) -> Optional[str]:
    if "/douyin/" in path:
        return "douyin"
    if "/wechat-channels/" in path or "/wechat_channels/" in path:
        return "wechat_channels"
    return None


def _wechat_report_needs_rule_fallback(report: dict) -> bool:
    """Detect LLM-generated error shells that should become product fallback reports."""
    if not report:
        return True
    if report.get("diagnosis_method") == "noterx_rule_fallback":
        return False

    opinions = report.get("agent_opinions") or []
    if opinions:
        error_like = [
            op for op in opinions
            if str(op.get("dimension", "")).lower() == "error"
            or _safe_float(op.get("score")) <= 0
        ]
        if len(error_like) == len(opinions):
            return True

    text_parts: list[str] = []
    for item in report.get("issues") or []:
        if isinstance(item, dict):
            text_parts.append(str(item.get("description", "")))
        else:
            text_parts.append(str(item))
    for item in opinions:
        text_parts.append(str(item.get("reasoning", "")))
    text_parts.append(str(report.get("debate_summary", "")))
    joined = " ".join(text_parts).lower()
    return any(marker in joined for marker in [
        "api key",
        "401",
        "unauthorized",
        "invalid_request_error",
        "裁判失败",
        "大模型调用失败",
    ])


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


# ─── Main diagnose endpoint ───

@router.post("/douyin/diagnose", response_model=DiagnoseResponse)
@router.post("/wechat-channels/diagnose", response_model=DiagnoseResponse)
@router.post("/wechat_channels/diagnose", response_model=DiagnoseResponse)
@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_note(
    request: Request,
    platform: str = Form("wechat_channels"),
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    script: str = Form(""),
    opening_hook: str = Form(""),
    publish_time: str = Form(""),
    audience: str = Form(""),
    trafficField: str = Form(""),
    goal: str = Form(""),
    duration: Optional[float] = Form(None),
    hook: str = Form(""),
    opsData: str = Form(""),
    baselineRows: str = Form("[]"),
    plays: Optional[float] = Form(None),
    likes: Optional[float] = Form(None),
    comments: Optional[float] = Form(None),
    shares: Optional[float] = Form(None),
    favorites: Optional[float] = Form(None),
    followers_gained: Optional[float] = Form(None),
    completion_rate: Optional[float] = Form(None),
    cover_image: Optional[UploadFile] = File(None),
    cover_images: Optional[list[UploadFile]] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    """Receive note content and run multi-agent diagnosis."""
    from app.agents.orchestrator import Orchestrator
    parsed = await _parse_diagnose_input(
        request,
        platform=platform,
        title=title,
        content=content,
        category=category,
        tags=tags,
        plays=plays,
        likes=likes,
        comments=comments,
        shares=shares,
        favorites=favorites,
        followers_gained=followers_gained,
        completion_rate=completion_rate,
        cover_image=cover_image,
        cover_images=cover_images,
        video_file=video_file,
    )
    platform = parsed.platform
    title = parsed.title
    content = parsed.content
    tag_list = parsed.tag_list

    if platform == "douyin":
        return build_douyin_report(
            title=title,
            content=content,
            category=category,
            tags=tags,
            script=script,
            audience=audience,
            trafficField=trafficField or category,
            goal=goal or "follow",
            duration=duration or 35,
            hook=hook or opening_hook,
            opsData=opsData,
            baselineRows=baselineRows,
            image_count=len(parsed.parsed_images),
            video_count=1 if parsed.video_bytes is not None else 0,
        )

    import time as _time
    from app.api.usage_tracker import get_client_ip, log_usage
    _t0 = _time.time()
    orchestrator = Orchestrator()
    usage_status = "ok"
    try:
        report = await orchestrator.run(
            title=title,
            content=content,
            category=category,
            tags=tag_list,
            cover_image=parsed.image_bytes,
            video_analysis=parsed.video_analysis,
            script=script,
            opening_hook=opening_hook,
            publish_time=publish_time,
            metrics=parsed.metrics,
        )
        if _wechat_report_needs_rule_fallback(report):
            raise RuntimeError("LLM pipeline returned an error-only report")
        report = enrich_wechat_report(
            report,
            title=title,
            content=content,
            category=category,
            tags=tag_list,
            script=script,
            opening_hook=opening_hook,
            publish_time=publish_time,
            metrics=parsed.metrics,
            image_count=len(parsed.parsed_images),
            video_analysis=parsed.video_analysis,
        )
    except Exception as exc:
        logger.exception("Wechat diagnose LLM pipeline failed; returning rule fallback report")
        usage_status = "fallback"
        report = build_wechat_fallback_report(
            title=title,
            content=content,
            category=category,
            tags=tag_list,
            script=script,
            opening_hook=opening_hook,
            publish_time=publish_time,
            metrics=parsed.metrics,
            image_count=len(parsed.parsed_images),
            video_analysis=parsed.video_analysis,
            fallback_reason=str(exc),
        )
    # Log usage
    _usage = report.pop("_usage", {})
    log_usage(
        ip=get_client_ip(request),
        action="diagnose",
        title=title[:100],
        category=category,
        total_tokens=_usage.get("total_tokens", 0),
        duration_sec=_usage.get("duration_sec", round(_time.time() - _t0, 1)),
        status=usage_status,
    )
    return report


@router.post("/pre-score")
async def pre_score_note(
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form("lifestyle"),
    tags: str = Form(""),
    image_count: int = Form(0),
):
    """Instant Model A pre-score (no LLM, pure math, <50ms)."""
    from app.agents.research_data import pre_score, MODEL_PARAMS, CATEGORY_CN

    tag_count = len([t for t in tags.split(",") if t.strip()]) if tags else 0
    result = pre_score(title, content, category, tag_count, image_count)
    result["category"] = category
    result["category_cn"] = CATEGORY_CN.get(category, category)
    return result


@router.post("/douyin/diagnose/stream")
@router.post("/wechat-channels/diagnose/stream")
@router.post("/wechat_channels/diagnose/stream")
@router.post("/diagnose/stream")
@router.post("/diagnose-stream")
async def diagnose_stream(
    request: Request,
    platform: str = Form("wechat_channels"),
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    script: str = Form(""),
    opening_hook: str = Form(""),
    publish_time: str = Form(""),
    audience: str = Form(""),
    trafficField: str = Form(""),
    goal: str = Form(""),
    duration: Optional[float] = Form(None),
    hook: str = Form(""),
    opsData: str = Form(""),
    baselineRows: str = Form("[]"),
    plays: Optional[float] = Form(None),
    likes: Optional[float] = Form(None),
    comments: Optional[float] = Form(None),
    shares: Optional[float] = Form(None),
    favorites: Optional[float] = Form(None),
    followers_gained: Optional[float] = Form(None),
    completion_rate: Optional[float] = Form(None),
    cover_image: Optional[UploadFile] = File(None),
    cover_images: Optional[list[UploadFile]] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    """SSE streaming diagnosis — sends progress events as agents complete."""
    import asyncio
    import json as json_mod
    from starlette.responses import StreamingResponse
    from app.agents.orchestrator import Orchestrator
    from app.agents.research_data import pre_score as _pre_score
    parsed = await _parse_diagnose_input(
        request,
        platform=platform,
        title=title,
        content=content,
        category=category,
        tags=tags,
        plays=plays,
        likes=likes,
        comments=comments,
        shares=shares,
        favorites=favorites,
        followers_gained=followers_gained,
        completion_rate=completion_rate,
        cover_image=cover_image,
        cover_images=cover_images,
        video_file=video_file,
        stream=True,
    )
    platform = parsed.platform
    title = parsed.title
    content = parsed.content
    tag_list = parsed.tag_list

    # --- SSE generator ---
    async def event_generator():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json_mod.dumps(data, ensure_ascii=False)}\n\n"

        if platform == "douyin":
            douyin_steps = [
                ("received", "前端已按 NoteRx 工作流打包 FormData"),
                ("parse", "后端正在解析文本、图片、视频和运营数据"),
                ("baseline", "正在对比账号历史与抖音爆款代理基线"),
                ("round1_content_done", "秒停留 Agent 完成独立诊断"),
                ("round1_visual_done", "完播 Agent 完成独立诊断"),
                ("round1_growth_done", "设计字段 Agent 完成独立诊断"),
                ("round1_user_done", "转化承接 Agent 完成独立诊断"),
                ("debate_start", "4 个抖音专家 Agent 开始互相辩论补充"),
                ("judge_start", "JudgeAgent 正在汇总抖音素材处方"),
                ("finalizing", "正在生成评分、雷达图、建议、模拟评论和分享卡片数据"),
            ]
            for step, message in douyin_steps:
                yield sse("progress", {"step": step, "message": message, "platform": "douyin"})
                await asyncio.sleep(0.05)
            report = build_douyin_report(
                title=title,
                content=content,
                category=category,
                tags=tags,
                script=script,
                audience=audience,
                trafficField=trafficField or category,
                goal=goal or "follow",
                duration=duration or 35,
                hook=hook or opening_hook,
                opsData=opsData,
                baselineRows=baselineRows,
                image_count=len(parsed.parsed_images),
                video_count=1 if parsed.video_bytes is not None else 0,
            )
            yield sse("result", report)
            return

        # 1) Instant pre-score
        score = _pre_score(title, content, category, len(tag_list),
                           parsed.image_bytes is not None and 1 or 0)
        yield sse("pre_score", {"title": title, "category": category, **score})

        # 2) Run orchestrator with realtime progress callbacks
        orchestrator = Orchestrator()
        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

        async def _progress(step: str, message: str):
            await queue.put(("progress", {"step": step, "message": message}))

        async def _run_job():
            try:
                report = await orchestrator.run(
                    title=title,
                    content=content,
                    category=category,
                    tags=tag_list,
                    cover_image=parsed.image_bytes,
                    video_analysis=parsed.video_analysis,
                    script=script,
                    opening_hook=opening_hook,
                    publish_time=publish_time,
                    metrics=parsed.metrics,
                    progress_cb=_progress,
                )
                if _wechat_report_needs_rule_fallback(report):
                    raise RuntimeError("LLM pipeline returned an error-only report")
                report = enrich_wechat_report(
                    report,
                    title=title,
                    content=content,
                    category=category,
                    tags=tag_list,
                    script=script,
                    opening_hook=opening_hook,
                    publish_time=publish_time,
                    metrics=parsed.metrics,
                    image_count=len(parsed.parsed_images),
                    video_analysis=parsed.video_analysis,
                )
                # Log usage from stream endpoint
                from app.api.usage_tracker import get_client_ip, log_usage
                _usage = report.pop("_usage", {})
                log_usage(
                    ip=get_client_ip(request),
                    action="diagnose-stream",
                    title=title[:100],
                    category=category,
                    total_tokens=_usage.get("total_tokens", 0),
                    duration_sec=_usage.get("duration_sec", 0),
                )
                await queue.put(("result", report))
            except Exception as e:
                logger.exception("Wechat stream LLM pipeline failed; returning rule fallback report")
                await queue.put(("progress", {
                    "step": "finalizing",
                    "message": "LLM 会诊暂不可用，正在生成视频号规则兜底报告",
                }))
                report = build_wechat_fallback_report(
                    title=title,
                    content=content,
                    category=category,
                    tags=tag_list,
                    script=script,
                    opening_hook=opening_hook,
                    publish_time=publish_time,
                    metrics=parsed.metrics,
                    image_count=len(parsed.parsed_images),
                    video_analysis=parsed.video_analysis,
                    fallback_reason=str(e),
                )
                await queue.put(("result", report))
            finally:
                await queue.put(("done", {}))

        task = asyncio.create_task(_run_job())
        try:
            while True:
                event, data = await queue.get()
                if event == "done":
                    break
                yield sse(event, data)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Upload one image and return visual analysis result."""
    from app.analysis.image_analyzer import ImageAnalyzer

    image_bytes = await _read_and_validate_image(file, "file")
    analyzer = ImageAnalyzer()
    return analyzer.analyze(image_bytes)
