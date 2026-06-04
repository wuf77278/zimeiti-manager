"""Local model provider configuration API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.model_config import ModelConfigUpdate, get_effective_model_config, save_model_config

router = APIRouter(prefix="/model-config", tags=["model-config"])


def _require_local_request(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host in {"127.0.0.1", "::1", "localhost"}:
        return
    raise HTTPException(status_code=403, detail="model_config_local_only")


@router.get("")
async def get_model_config(request: Request):
    _require_local_request(request)
    return get_effective_model_config()


@router.post("")
async def update_model_config(request: Request, payload: ModelConfigUpdate):
    _require_local_request(request)
    return save_model_config(payload)
