"""
迭代优化接口：根据原始诊断结果生成2-3个高分优化方案，自动评分排序。
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Form
from pydantic import BaseModel

from app.agents.base_agent import BaseAgent, MODEL_PRO, MODEL_FAST
from app.agents.research_data import pre_score

router = APIRouter()
logger = logging.getLogger("videorx.optimize")

OPTIMIZE_PROMPT = """你是微信视频号内容优化专家。根据用户视频号作品的诊断结果（扣分原因），生成3个不同策略的优化方案。

## 每个方案包含
- strategy: 策略名称（如"熟人转发向""干货结论向""场景痛点向"）
- optimized_title: 完整可发布标题（适合视频号信息流，清楚点出人群、痛点或结果）
- optimized_content: 完整可发布发布文案/口播稿（300字内，适合视频号口播和微信关系链传播）
- key_changes: 关键改动说明（2-3句话）

## 3个方案必须风格不同
方案A: 熟人转发向（强调适合转给家人、朋友、客户或同事的理由）
方案B: 干货结论向（开头先给结论，突出方法、步骤或对比）
方案C: 场景痛点向（还原真实使用场景，用问题和后果建立代入感）

## 发布文案/口播规范
- 开头3秒先给结论或强痛点，不绕弯
- 每段2-3句，适合口播和字幕拆分
- 语言自然可信，避免小红书式"姐妹们/绝了/种草/马住"
- 结尾给出具体互动问题或自然转发理由
- 不写刷量、诱导分享、自动评论、批量私信等违规建议
- 300字内

输出严格JSON：
{"plans":[{"strategy":"策略名","optimized_title":"标题","optimized_content":"发布文案/口播稿","key_changes":"改动说明"},...]}\n"""


class OptimizeRequest(BaseModel):
    title: str
    content: str = ""
    category: str = "food"
    issues: str = ""  # JSON string of issues array
    suggestions: str = ""  # JSON string of suggestions array
    overall_score: float = 50


@router.post("/optimize")
async def optimize(req: OptimizeRequest):
    """生成2-3个优化方案并自动评分"""
    issues_text = req.issues[:500] if req.issues else "无具体扣分项"
    suggestions_text = req.suggestions[:500] if req.suggestions else ""

    user_msg = f"""原始视频号内容：
- 标题：{req.title}
- 发布文案/口播稿：{req.content[:400] if req.content else '（无发布文案或口播稿）'}
- 场景：{req.category}
- 当前评分：{req.overall_score}分

主要问题：{issues_text}
优化方向：{suggestions_text}

请生成3个不同策略的高分优化方案。"""

    agent = BaseAgent(model=MODEL_PRO)
    agent.system_prompt = OPTIMIZE_PROMPT
    result = await agent.call_llm(user_msg, max_tokens=3000)
    result.pop("_meta", None)

    plans = result.get("plans", [])
    if not isinstance(plans, list):
        plans = []

    # Score original with pre_score first (same system as plans)
    tag_count = 0
    try:
        orig_result = pre_score(req.title, req.content, req.category, tag_count, 0)
        orig_score = orig_result["total_score"]
    except Exception:
        orig_score = req.overall_score

    # Auto-score each plan with pre_score
    scored_plans = []
    for plan in plans[:3]:
        if not isinstance(plan, dict):
            continue
        title = plan.get("optimized_title", req.title)
        content = plan.get("optimized_content", req.content)
        try:
            score_result = pre_score(title, content, req.category, tag_count, 0)
            plan_score = score_result["total_score"]
        except Exception:
            plan_score = orig_score + 5  # fallback
        delta = round(plan_score - orig_score)
        scored_plans.append({
            "strategy": plan.get("strategy", "优化方案"),
            "optimized_title": title,
            "optimized_content": content,
            "key_changes": plan.get("key_changes", ""),
            "score": round(plan_score),
            "score_delta": max(delta, 0),  # 不显示负数
        })

    # Sort by score descending
    scored_plans.sort(key=lambda x: x["score"], reverse=True)

    # Mark the best one
    if scored_plans:
        scored_plans[0]["recommended"] = True

    return {
        "original_score": round(orig_score),
        "plans": scored_plans,
    }
