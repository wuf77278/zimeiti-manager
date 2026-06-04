"""Security boundary tests for optional Ops/Admin modules."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _run_probe(code: str, env: dict[str, str]) -> None:
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def _clean_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in ("OPS_ENABLED", "OPS_ADMIN_TOKEN", "ADMIN_ENABLED", "ADMIN_TOKEN"):
        env.pop(key, None)
    return env


def test_ops_routes_are_not_registered_by_default() -> None:
    env = _clean_env()
    _run_probe(
        """
import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
assert client.get("/api/ops/state").status_code == 404
assert client.get("/api/health").status_code == 200
""",
        env,
    )


def test_ops_routes_require_bearer_token_when_enabled(tmp_path: Path) -> None:
    env = _clean_env()
    env.update({
        "OPS_ENABLED": "true",
        "OPS_ADMIN_TOKEN": "secret-token",
        "OPS_DATA_PATH": str(tmp_path / "ops_db.json"),
    })
    _run_probe(
        """
import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
assert client.get("/api/ops/state").status_code == 401
assert client.get("/api/ops/state", headers={"Authorization": "Bearer wrong"}).status_code == 403
assert client.get("/api/ops/state", headers={"Authorization": "Bearer secret-token"}).status_code == 200
""",
        env,
    )


def test_admin_routes_are_not_registered_by_default() -> None:
    env = _clean_env()
    _run_probe(
        """
import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
assert client.get("/admin").status_code == 404
assert client.get("/admin/api/stats").status_code == 404
""",
        env,
    )


def test_admin_stats_requires_bearer_token_when_enabled() -> None:
    env = _clean_env()
    env.update({"ADMIN_ENABLED": "true", "ADMIN_TOKEN": "admin-secret"})
    _run_probe(
        """
import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
assert client.get("/admin").status_code == 200
assert client.get("/admin/api/stats").status_code == 401
assert client.get("/admin/api/stats", headers={"Authorization": "Bearer wrong"}).status_code == 403
assert client.get("/admin/api/stats", headers={"Authorization": "Bearer admin-secret"}).status_code == 200
""",
        env,
    )
