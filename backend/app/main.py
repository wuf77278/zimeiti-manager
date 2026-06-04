"""
自媒体管家后端入口
"""
import logging
import os
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import router as api_router
from app.config import admin_enabled
from app import local_memory
from app.paths import baseline_db_path, docs_dir, frontend_dist_dir

FRONTEND_DIST = str(frontend_dist_dir())
FRONTEND_INDEX = os.path.join(FRONTEND_DIST, "index.html")
FRONTEND_ASSETS = os.path.join(FRONTEND_DIST, "assets")

DB_PATH = str(baseline_db_path())


def _ensure_history_table():
    """启动时自动创建 diagnosis_history 表（如不存在）"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            platform TEXT DEFAULT 'wechat_channels',
            overall_score REAL,
            grade TEXT,
            report_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(diagnosis_history)").fetchall()}
    if "platform" not in columns:
        conn.execute("ALTER TABLE diagnosis_history ADD COLUMN platform TEXT DEFAULT 'wechat_channels'")
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_created
        ON diagnosis_history(created_at DESC)
    """)
    # Usage tracking table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'diagnose',
            title TEXT DEFAULT '',
            category TEXT DEFAULT '',
            total_tokens INTEGER DEFAULT 0,
            duration_sec REAL DEFAULT 0,
            status TEXT DEFAULT 'ok',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_ip ON usage_log(ip)")
    conn.commit()
    conn.close()
    local_memory.ensure_memory_md()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """应用生命周期：启动时自动建表"""
    _ensure_history_table()
    yield

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="自媒体管家 API",
    description="微信视频号与抖音内容诊断工作台",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://noterx.muran.tech",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://creator.douyin.com",
        "https://creator.xiaohongshu.com",
        "https://channels.weixin.qq.com",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# Admin panel at /admin (no /api prefix), disabled by default.
if admin_enabled():
    from app.api.admin_api import router as admin_router

    app.include_router(admin_router)

# ── Landing page: research whitepaper at / ──
RESEARCH_HTML = str(docs_dir() / "research_whitepaper.html")

@app.get("/")
async def serve_landing():
    """首页 → 研究白皮书着陆页"""
    if os.path.isfile(RESEARCH_HTML):
        return FileResponse(RESEARCH_HTML, media_type="text/html")
    # Fallback: serve SPA if whitepaper not found
    if os.path.isfile(FRONTEND_INDEX):
        return FileResponse(FRONTEND_INDEX)
    return {"status": "ok", "service": "自媒体管家 API"}

@app.get("/research")
async def serve_research():
    """兼容旧链接"""
    if os.path.isfile(RESEARCH_HTML):
        return FileResponse(RESEARCH_HTML, media_type="text/html")
    return {"error": "Research page not found"}

# ── Legal pages ──
TERMS_HTML = str(docs_dir() / "terms.html")
PRIVACY_HTML = str(docs_dir() / "privacy.html")

@app.get("/terms")
async def serve_terms():
    """服务条款"""
    if os.path.isfile(TERMS_HTML):
        return FileResponse(TERMS_HTML, media_type="text/html")
    return {"error": "Terms page not found"}

@app.get("/privacy")
async def serve_privacy():
    """隐私政策"""
    if os.path.isfile(PRIVACY_HTML):
        return FileResponse(PRIVACY_HTML, media_type="text/html")
    return {"error": "Privacy page not found"}

# ── SPA: product app at /app and sub-routes ──
SPA_ROUTES = {"/app", "/diagnosing", "/report", "/history", "/screenshot"}

if os.path.isfile(FRONTEND_INDEX) and os.path.isdir(FRONTEND_ASSETS):
    from starlette.middleware.base import BaseHTTPMiddleware

    class SPAMiddleware(BaseHTTPMiddleware):
        """Serve SPA index.html for /app and its sub-routes"""
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            path = request.url.path
            if (response.status_code == 404
                    and not path.startswith("/api")
                    and not path.startswith("/assets")
                    and not path.startswith("/app/assets")
                    and path not in ("/", "/research", "/terms", "/privacy")
                    and not path.startswith("/admin")):
                return FileResponse(FRONTEND_INDEX)
            return response

    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="static")
    app.mount("/app/assets", StaticFiles(directory=FRONTEND_ASSETS), name="app-static")
    app.add_middleware(SPAMiddleware)

    @app.get("/app")
    async def serve_app():
        """产品主页面"""
        return FileResponse(FRONTEND_INDEX)


@app.get("/api/health")
async def health():
    """详细健康检查，含数据库探测"""
    import sqlite3
    db_path = DB_PATH
    db_ok = False
    note_count = 0
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM notes")
        note_count = cur.fetchone()[0]
        conn.close()
        db_ok = True
    except Exception:
        pass
    return {
        "ok": True,
        "status": "ok" if db_ok else "degraded",
        "database": {"connected": db_ok, "note_count": note_count},
    }
