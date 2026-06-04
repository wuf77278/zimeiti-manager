"""Local model-provider configuration for desktop and dev mode."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.paths import data_dir


MODEL_CONFIG_FILENAME = "model_config.env"


class ModelConfigUpdate(BaseModel):
    provider: str = Field(default="openai", max_length=40)
    base_url: str = Field(default="", max_length=500)
    wire_api: str = Field(default="chat", max_length=30)
    api_key: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=120)
    review_model: str = Field(default="", max_length=120)
    model_reasoning_effort: str = Field(default="", max_length=40)
    model_fast: str = Field(default="", max_length=120)
    model_pro: str = Field(default="", max_length=120)
    model_omni: str = Field(default="", max_length=120)
    openai_compat: str = Field(default="", max_length=40)
    skip_json_response_format: bool = False


ENV_KEYS = {
    "provider": "LLM_PROVIDER",
    "base_url": "OPENAI_BASE_URL",
    "wire_api": "LLM_WIRE_API",
    "api_key": "OPENAI_API_KEY",
    "model": "LLM_MODEL",
    "review_model": "REVIEW_MODEL",
    "model_reasoning_effort": "MODEL_REASONING_EFFORT",
    "model_fast": "LLM_MODEL_FAST",
    "model_pro": "LLM_MODEL_PRO",
    "model_omni": "LLM_MODEL_OMNI",
    "openai_compat": "OPENAI_COMPAT",
}


def model_config_path() -> Path:
    return data_dir() / MODEL_CONFIG_FILENAME


def load_saved_model_config() -> None:
    path = model_config_path()
    if path.is_file():
        load_dotenv(path, override=True)


def _mask_key(value: str) -> tuple[bool, str]:
    key = value.strip()
    if not key:
        return False, ""
    if len(key) <= 12:
        return True, "***"
    return True, f"{key[:6]}...{key[-4:]}"


def get_effective_model_config() -> dict:
    has_key, preview = _mask_key(os.getenv("OPENAI_API_KEY", ""))
    return {
        "provider": os.getenv("LLM_PROVIDER", "openai"),
        "base_url": os.getenv("OPENAI_BASE_URL", ""),
        "wire_api": os.getenv("LLM_WIRE_API", "chat"),
        "has_api_key": has_key,
        "api_key_preview": preview,
        "model": os.getenv("LLM_MODEL", ""),
        "review_model": os.getenv("REVIEW_MODEL", ""),
        "model_reasoning_effort": os.getenv("MODEL_REASONING_EFFORT", ""),
        "model_fast": os.getenv("LLM_MODEL_FAST", ""),
        "model_pro": os.getenv("LLM_MODEL_PRO", ""),
        "model_omni": os.getenv("LLM_MODEL_OMNI", ""),
        "openai_compat": os.getenv("OPENAI_COMPAT", ""),
        "skip_json_response_format": os.getenv("LLM_SKIP_JSON_RESPONSE_FORMAT", "").strip().lower()
        in {"1", "true", "yes", "on"},
        "config_path": str(model_config_path()),
    }


def _quote_env(value: object) -> str:
    raw = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{raw}"'


def _dotenv_lines(values: Mapping[str, str]) -> list[str]:
    lines = [
        "# 自媒体管家本地大模型配置",
        "# 由前端「模型接口」面板写入；本文件不会提交到 Git。",
    ]
    for key, value in values.items():
        lines.append(f"{key}={_quote_env(value)}")
    return lines


def _apply_runtime_model_constants(values: Mapping[str, str]) -> None:
    try:
        from app.agents import base_agent

        base_agent.MODEL_FAST = values.get("LLM_MODEL_FAST") or base_agent.MODEL_FAST
        base_agent.MODEL_PRO = values.get("LLM_MODEL_PRO") or values.get("LLM_MODEL") or base_agent.MODEL_PRO
        base_agent.MODEL_OMNI = values.get("LLM_MODEL_OMNI") or values.get("LLM_MODEL") or base_agent.MODEL_OMNI
    except Exception:
        pass


def save_model_config(update: ModelConfigUpdate) -> dict:
    current_key = os.getenv("OPENAI_API_KEY", "")
    normalized_wire = update.wire_api.strip().lower() or "chat"
    if normalized_wire not in {"chat", "responses"}:
        normalized_wire = "chat"

    values = {
        "LLM_PROVIDER": update.provider.strip() or "openai",
        "OPENAI_BASE_URL": update.base_url.strip().rstrip("/"),
        "LLM_WIRE_API": normalized_wire,
        "OPENAI_API_KEY": update.api_key.strip() or current_key,
        "LLM_MODEL": update.model.strip(),
        "REVIEW_MODEL": update.review_model.strip() or update.model.strip(),
        "MODEL_REASONING_EFFORT": update.model_reasoning_effort.strip(),
        "LLM_MODEL_FAST": update.model_fast.strip() or update.model.strip(),
        "LLM_MODEL_PRO": update.model_pro.strip() or update.model.strip(),
        "LLM_MODEL_OMNI": update.model_omni.strip() or update.model.strip(),
        "OPENAI_COMPAT": update.openai_compat.strip(),
        "LLM_SKIP_JSON_RESPONSE_FORMAT": "1" if update.skip_json_response_format else "",
    }
    for key, value in values.items():
        if value != "":
            os.environ[key] = value
        elif key in os.environ:
            os.environ.pop(key)

    path = model_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(_dotenv_lines(values)) + "\n", encoding="utf-8")
    _apply_runtime_model_constants(values)
    return get_effective_model_config()
