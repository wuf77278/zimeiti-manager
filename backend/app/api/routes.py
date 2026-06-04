"""
API 路由定义
"""
from fastapi import APIRouter

from app.api.diagnose import router as diagnose_router
from app.api.baseline_api import router as baseline_router
from app.api.comments_api import router as comments_router
from app.api.history_api import router as history_router
from app.api.screenshot_api import router as screenshot_router
from app.api.optimize_api import router as optimize_router
from app.api.model_config_api import router as model_config_router
from app.config import ops_enabled

router = APIRouter()


@router.get("/health")
async def api_health():
    """轻量探活：前端可用来判断 Vite 代理到后端是否通畅（不调用外网 LLM）。"""
    return {"ok": True, "service": "自媒体管家-api"}


router.include_router(diagnose_router, tags=["diagnose"])
router.include_router(baseline_router, tags=["baseline"])
router.include_router(comments_router, tags=["comments"])
# history_router disabled — #58 fix: history is local-only (IndexedDB), server endpoints were a data leak
# router.include_router(history_router, tags=["history"])
router.include_router(screenshot_router, tags=["screenshot"])
router.include_router(optimize_router, tags=["optimize"])
router.include_router(model_config_router)

if ops_enabled():
    from app.api.ops_api import router as ops_router

    router.include_router(ops_router)
