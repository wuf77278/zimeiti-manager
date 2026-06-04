"""Runtime configuration helpers for optional high-risk modules."""
from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import Header, HTTPException, status


PublisherRunMode = Literal["dry_run", "browser_prepare", "upload_prepare", "social_auto_upload"]
VALID_PUBLISHER_RUN_MODES: set[str] = {"dry_run", "browser_prepare", "upload_prepare", "social_auto_upload"}


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def ops_enabled() -> bool:
    return env_flag("OPS_ENABLED", False)


def admin_enabled() -> bool:
    return env_flag("ADMIN_ENABLED", False)


def publisher_execution_enabled() -> bool:
    return env_flag("PUBLISHER_EXECUTION_ENABLED", False)


def social_auto_upload_enabled() -> bool:
    return env_flag("SOCIAL_AUTO_UPLOAD_ENABLED", False)


def requested_publisher_run_mode() -> PublisherRunMode:
    mode = os.getenv("PUBLISHER_RUN_MODE", "dry_run").strip()
    if mode not in VALID_PUBLISHER_RUN_MODES:
        return "dry_run"
    return mode  # type: ignore[return-value]


def effective_publisher_run_mode() -> tuple[PublisherRunMode, str]:
    requested = requested_publisher_run_mode()
    if requested == "dry_run":
        return "dry_run", ""

    if not publisher_execution_enabled():
        return "dry_run", "PUBLISHER_EXECUTION_ENABLED=false，已回退到 dry_run。"

    if requested == "social_auto_upload" and not social_auto_upload_enabled():
        return "dry_run", "SOCIAL_AUTO_UPLOAD_ENABLED=false，已回退到 dry_run。"

    return requested, ""


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def _require_bearer_token(
    *,
    authorization: str | None,
    expected_token: str,
    missing_detail: str,
    invalid_detail: str,
    not_configured_detail: str,
) -> None:
    expected = expected_token.strip()
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, not_configured_detail)

    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            missing_detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, invalid_detail)


async def require_ops_admin_token(authorization: str | None = Header(default=None)) -> None:
    if not os.getenv("OPS_ADMIN_TOKEN", "").strip():
        return
    _require_bearer_token(
        authorization=authorization,
        expected_token=os.getenv("OPS_ADMIN_TOKEN", ""),
        missing_detail="ops_admin_token_required",
        invalid_detail="ops_admin_token_invalid",
        not_configured_detail="ops_admin_token_not_configured",
    )


async def require_admin_token(authorization: str | None = Header(default=None)) -> None:
    _require_bearer_token(
        authorization=authorization,
        expected_token=os.getenv("ADMIN_TOKEN", ""),
        missing_detail="admin_token_required",
        invalid_detail="admin_token_invalid",
        not_configured_detail="admin_token_not_configured",
    )
