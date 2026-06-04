"""Filesystem paths shared by server and desktop builds."""
from __future__ import annotations

import os
import platform
import shutil
import sys
from pathlib import Path


APP_NAME = "自媒体管家"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def resource_root() -> Path:
    configured = os.getenv("ZIMEITI_RESOURCE_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
    return Path(__file__).resolve().parents[2]


def bundled_backend_data_dir() -> Path:
    return resource_root() / "backend" / "data"


def _default_user_data_dir() -> Path:
    system = platform.system().lower()
    if system == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    if system == "windows":
        base = os.getenv("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / APP_NAME
    return Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "zimeiti-manager"


def data_dir() -> Path:
    configured = os.getenv("ZIMEITI_DATA_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    if is_frozen():
        return _default_user_data_dir() / "backend-data"
    return bundled_backend_data_dir()


def ensure_data_dir() -> Path:
    path = data_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _copy_seed_once(filename: str) -> Path:
    target = ensure_data_dir() / filename
    seed = bundled_backend_data_dir() / filename
    if not target.exists() and seed.exists() and seed.resolve() != target.resolve():
        shutil.copy2(seed, target)
    return target


def baseline_db_path() -> Path:
    return _copy_seed_once("baseline.db")


def ops_data_path() -> Path:
    configured = os.getenv("OPS_DATA_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return _copy_seed_once("ops_db.json")


def local_workspace_dir() -> Path:
    return ensure_data_dir() / "noterx_workspace"


def frontend_dist_dir() -> Path:
    configured = os.getenv("ZIMEITI_FRONTEND_DIST", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return resource_root() / "frontend" / "dist"


def docs_dir() -> Path:
    configured = os.getenv("ZIMEITI_DOCS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return resource_root() / "docs"
