"""JSON storage for the operation console MVP."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Callable, TypeVar

from app.ops.models import OperationsDb
from app.ops.seed import create_empty_database, create_seed_database
from app.paths import ops_data_path

T = TypeVar("T")

def get_ops_data_path() -> Path:
    return Path(os.getenv("OPS_DATA_PATH", str(ops_data_path())))


def _dump_model(db: OperationsDb) -> str:
    return json.dumps(db.model_dump(), ensure_ascii=False, indent=2) + "\n"


def _seed_demo_enabled() -> bool:
    return os.getenv("OPS_SEED_DEMO_DATA", "").strip().lower() in {"1", "true", "yes", "on"}


def _new_database() -> OperationsDb:
    return create_seed_database() if _seed_demo_enabled() else create_empty_database()


def load_ops_db() -> OperationsDb:
    path = get_ops_data_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        db = _new_database()
        save_ops_db(db)
        return db
    try:
        data = json.loads(path.read_text("utf-8"))
        return OperationsDb.model_validate(data)
    except Exception:
        db = _new_database()
        save_ops_db(db)
        return db


def save_ops_db(db: OperationsDb) -> None:
    path = get_ops_data_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_model(db), "utf-8")


def mutate_ops_db(mutator: Callable[[OperationsDb], T]) -> T:
    db = load_ops_db()
    result = mutator(db)
    save_ops_db(db)
    return result
