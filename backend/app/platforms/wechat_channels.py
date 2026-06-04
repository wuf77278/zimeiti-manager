"""WeChat Channels platform push-chain heuristics.

The model is a transparent proxy for diagnosis. It only uses user-submitted
material and first-party metrics; it does not claim to know internal weights.
"""
from __future__ import annotations

import re
from typing import Any

from app.platforms.content_data import get_platform_content_profile, reference_comments
from app.platforms.noterx_workflow import build_noterx_workflow_trace


CATEGORY_LABELS = {
    "hospitality_design": "民宿酒店设计",
    "office_design": "办公空间设计",
    "case_study": "设计案例复盘",
    "owner_education": "业主避坑/设计科普",
    "local": "民宿酒店设计",
    "knowledge": "业主避坑/设计科普",
    "emotion": "设计案例复盘",
    "enterprise": "办公空间设计",
    "shop": "业主避坑/设计科普",
    "ip": "设计案例复盘",
}


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group(0)) if match else default


def _clamp(value: float) -> int:
    return int(round(min(max(value, 0), 100)))


def _status(score: float) -> str:
    if score >= 78:
        return "strong"
    if score >= 62:
        return "watch"
    return "risk"


def _grade(score: float) -> str:
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def _has(text: str, pattern: str) -> bool:
    return re.search(pattern, text, flags=re.I) is not None


def build_wechat_algorithm_chain(
    *,
    title: str,
    content: str = "",
    category: str = "local",
    tags: list[str] | None = None,
    script: str = "",
    opening_hook: str = "",
    publish_time: str = "",
    metrics: dict[str, Any] | None = None,
    image_count: int = 0,
    video_analysis: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    tags = tags or []
    metrics = metrics or {}
    text = "\n".join([title, content, script, opening_hook, ",".join(tags), str(video_analysis or "")])
    plays = max(_to_float(metrics.get("plays")), 1)
    completion_rate = _to_float(metrics.get("completion_rate"))
    if completion_rate > 0 and completion_rate <= 1:
        completion_rate *= 100
    interaction_rate = (
        _to_float(metrics.get("likes"))
        + _to_float(metrics.get("comments")) * 1.5
        + _to_float(metrics.get("shares")) * 2.2
        + _to_float(metrics.get("favorites")) * 1.6
    ) / plays * 100
    share_signal = _to_float(metrics.get("shares")) / plays * 100
    category_label = CATEGORY_LABELS.get(category, category or "视频号场景")

    title_score = 42
    title_score += 16 if 10 <= len(title) <= 34 else 4
    title_score += 12 if _has(title, r"为什么|别|不要|先|原来|竟然|避坑|方法|清单|民宿|酒店|办公|设计|预算|动线") else 0
    title_score += 10 if _has(title, r"\d|一|二|三|四|五|六|七|八|九|十") else 0
    title_score += 8 if opening_hook else 0

    cover_score = 46
    cover_score += min(image_count * 8, 16)
    cover_score += 12 if _has(text, r"封面|首帧|大字|对比|结果|预算|平面图|动线|实景|前台|房型") else 0
    cover_score += 8 if video_analysis else 0

    retention_score = 42
    retention_score += 18 if opening_hook or _has(text, r"前3秒|开头|先给结论|直接说结果") else 0
    retention_score += 18 if _has(text, r"第一|第二|第三|步骤|案例|最后|清单|流程") else 0
    retention_score += min(completion_rate * 0.28, 16) if completion_rate else 6

    social_score = 40
    social_score += 16 if _has(text, r"转发|收藏|评论|留言|投票|发给|分享给|群|朋友圈|家人|朋友|同事") else 0
    social_score += min(interaction_rate * 4, 18) if interaction_rate else 6
    social_score += min(share_signal * 8, 14) if share_signal else 0

    private_score = 42
    private_score += 14 if _has(text, r"私信|企微|预约|案例|方案|预算|面积|电话|领取|咨询|初诊") else 0
    private_score += 10 if category in {"hospitality_design", "office_design", "local", "enterprise", "shop"} else 5
    private_score += 8 if publish_time else 0

    positioning_score = 44
    positioning_score += 14 if category in CATEGORY_LABELS else 0
    positioning_score += min(len(tags) * 4, 14)
    positioning_score += 12 if _has(text, rf"{category_label}|民宿|酒店|办公|办公室|设计|空间|业主|老板|行政|客户") else 0

    configs = [
        (
            "title_hook",
            "标题/开头准入",
            title_score,
            "视频号信息流和转发卡片先看标题是否能让用户知道“和我有什么关系”。",
            "标题压成一个明确人群 + 痛点/结果 + 数字或反常识判断。",
        ),
        (
            "cover_card",
            "封面与卡片点击",
            cover_score,
            "视频号内容会出现在信息流、朋友圈和群聊卡片，首帧需要离开正文也能被理解。",
            "封面补空间主体、前后对比、预算/结果大字；群聊缩略图里仍能看懂。",
        ),
        (
            "watch_retention",
            "完播与有效观看",
            retention_score,
            "继续分发依赖用户是否看下去，开头结论和中段兑现决定留存。",
            "按“先给项目问题 -> 案例证明 -> 3 个设计动作 -> 评论/转发理由”重排脚本。",
        ),
        (
            "social_spread",
            "互动与熟人转发",
            social_score,
            "视频号的放大不只靠点赞，还依赖评论、收藏、转发和熟人关系链。",
            "设计一句用户愿意转给老板、业主、行政或合伙人的理由，并把评论问题提前。",
        ),
        (
            "private_handoff",
            "项目初诊承接",
            private_score,
            "设计服务内容需要把公开视频自然接到案例资料、项目初诊或人工咨询。",
            "结尾给平台内低门槛动作：评论关键词、收藏清单、私信案例或预约初诊。",
        ),
        (
            "positioning_fit",
            "账号定位匹配",
            positioning_score,
            "平台需要识别账号长期内容方向，垂类、人群和标签越稳定越容易形成基线。",
            f"围绕“{category_label}”固定人群词、场景词和结果词，连续测试同结构内容。",
        ),
    ]
    return [
        {
            "stage": stage,
            "label": label,
            "score": _clamp(score),
            "status": _status(score),
            "reason": reason,
            "suggestion": suggestion,
        }
        for stage, label, score, reason, suggestion in configs
    ]


def _wechat_radar_from_chain(chain: list[dict[str, Any]]) -> dict[str, int]:
    stage_scores = {str(item.get("stage")): _clamp(_to_float(item.get("score"))) for item in chain}
    interaction_score = stage_scores.get("social_spread", 50)
    positioning_score = round(
        (
            stage_scores.get("positioning_fit", 50) * 0.65
            + stage_scores.get("private_handoff", 50) * 0.35
        )
    )
    radar = {
        "title_hook": stage_scores.get("title_hook", 50),
        "cover_click": stage_scores.get("cover_card", 50),
        "script_retention": stage_scores.get("watch_retention", 50),
        "interaction_share": interaction_score,
        "positioning_fit": positioning_score,
    }
    radar["overall"] = _clamp(sum(radar.values()) / len(radar))
    return radar


def _wechat_agent_opinion(
    *,
    agent_name: str,
    dimension: str,
    chain_item: dict[str, Any],
    issue: str,
    suggestion: str,
) -> dict[str, Any]:
    return {
        "agent_name": agent_name,
        "dimension": dimension,
        "score": _clamp(_to_float(chain_item.get("score"), 50)),
        "issues": [issue],
        "suggestions": [suggestion],
        "reasoning": str(chain_item.get("reason") or ""),
        "debate_comments": [],
    }


def _find_chain(chain: list[dict[str, Any]], stage: str) -> dict[str, Any]:
    return next((item for item in chain if item.get("stage") == stage), chain[0])


def build_wechat_fallback_report(
    *,
    title: str,
    content: str = "",
    category: str = "local",
    tags: list[str] | None = None,
    script: str = "",
    opening_hook: str = "",
    publish_time: str = "",
    metrics: dict[str, Any] | None = None,
    image_count: int = 0,
    video_analysis: dict[str, Any] | None = None,
    fallback_reason: str = "",
) -> dict[str, Any]:
    """Build a deterministic WeChat Channels diagnosis when LLM agents fail."""
    tags = tags or []
    metrics = metrics or {}
    chain = build_wechat_algorithm_chain(
        title=title,
        content=content,
        category=category,
        tags=tags,
        script=script,
        opening_hook=opening_hook,
        publish_time=publish_time,
        metrics=metrics,
        image_count=image_count,
        video_analysis=video_analysis,
    )
    radar = _wechat_radar_from_chain(chain)
    weakest = sorted(chain, key=lambda item: _to_float(item.get("score"), 50))[0]
    content_profile = get_platform_content_profile("wechat_channels", category)
    category_label = content_profile.get("category_label") or CATEGORY_LABELS.get(category, category or "视频号")
    primary_formula = (content_profile.get("content_formulas") or ["项目场景 -> 设计证据 -> 转发理由 -> 初诊承接"])[0]
    metric_focus = (content_profile.get("metric_focus") or ["完播、转发、评论和项目初诊"])[0]
    metric_focus_sentence = str(metric_focus).rstrip("。.!！")
    keyword_pack = (content_profile.get("keyword_packs") or [{"items": []}])[0].get("items", [])
    keyword_hint = "、".join(keyword_pack[:5]) if keyword_pack else category_label

    issue_items = [
        {
            "severity": "high" if item.get("status") == "risk" else "medium",
            "description": f"{item['label']}偏弱：{item['reason']}",
            "from_agent": "规则兜底 Agent",
        }
        for item in sorted(chain, key=lambda x: _to_float(x.get("score"), 50))[:3]
    ]
    if fallback_reason:
        issue_items.append({
            "severity": "medium",
            "description": "本次未完成 LLM 多 Agent 会诊，已切换为本地规则兜底诊断。",
            "from_agent": "系统兜底",
        })

    suggestions = [
        {
            "priority": 1,
            "description": f"先修“{weakest['label']}”：{weakest['suggestion']}",
            "expected_impact": "优先恢复视频号信息流点击、停留、决策转发或项目初诊中的最大短板",
        },
        {
            "priority": 1,
            "description": f"按“{category_label}”内容结构重排：{primary_formula}",
            "expected_impact": f"让内容更贴近同场景高表现样本，重点改善{metric_focus}",
        },
        {
            "priority": 2,
            "description": f"标题、封面和前 3 秒统一使用同一组识别词：{keyword_hint}",
            "expected_impact": "降低用户理解成本，并帮助平台识别账号垂类与目标人群",
        },
        {
            "priority": 2,
            "description": "结尾只保留一个低门槛动作：评论关键词、收藏案例、项目初诊或转发给具体决策人。",
            "expected_impact": "避免动作分散，提高评论、转发和项目初诊效率",
        },
    ]

    title_prefix = title.strip() or f"{category_label}选题"
    optimized_title = title_prefix if re.search(r"\d|别|先|为什么|清单|避坑", title_prefix) else f"{title_prefix}：先看这 3 个关键点"
    optimized_content = "\n".join([
        f"开头：先给结论，这条内容解决“{category_label}”用户的一个具体问题。",
        f"正文：按“{primary_formula}”展开，先讲场景，再给证据和步骤。",
        "承接：结尾设置一个明确动作，例如“评论关键词领取清单”或“收藏后按步骤做”。",
    ])

    agent_opinions = [
        _wechat_agent_opinion(
            agent_name="标题脚本专家",
            dimension="标题钩子",
            chain_item=_find_chain(chain, "title_hook"),
            issue="标题需要更快说明适合谁、解决什么和为什么值得停留。",
            suggestion=_find_chain(chain, "title_hook")["suggestion"],
        ),
        _wechat_agent_opinion(
            agent_name="封面视觉专家",
            dimension="封面点击力",
            chain_item=_find_chain(chain, "cover_card"),
            issue="封面/首帧需要在信息流、朋友圈和群聊缩略图里独立成立。",
            suggestion=_find_chain(chain, "cover_card")["suggestion"],
        ),
        _wechat_agent_opinion(
            agent_name="视频号增长专家",
            dimension="互动转发力",
            chain_item=_find_chain(chain, "social_spread"),
            issue="内容还需要一个用户愿意评论、收藏或转发给熟人的理由。",
            suggestion=_find_chain(chain, "social_spread")["suggestion"],
        ),
        _wechat_agent_opinion(
            agent_name="项目初诊承接专家",
            dimension="转化承接",
            chain_item=_find_chain(chain, "private_handoff"),
            issue="用户看完后的下一步动作要更具体，避免只有泛泛号召。",
            suggestion=_find_chain(chain, "private_handoff")["suggestion"],
        ),
    ]

    comment_refs = reference_comments("wechat_channels", content_profile["category"], 3)
    comments = [
        {
            "username": "视频号用户",
            "avatar_emoji": "💬",
            "comment": comment_refs[0] if len(comment_refs) > 0 else "这个能不能整理成清单？",
            "sentiment": "positive",
        },
        {
            "username": "潜在客户",
            "avatar_emoji": "📌",
            "comment": comment_refs[1] if len(comment_refs) > 1 else "地址/步骤可以发一下吗？",
            "sentiment": "neutral",
        },
        {
            "username": "熟人转发用户",
            "avatar_emoji": "👥",
            "comment": comment_refs[2] if len(comment_refs) > 2 else "这个适合转给正在做这件事的人。",
            "sentiment": "positive",
        },
    ]

    report = {
        "platform": "wechat_channels",
        "diagnosis_method": "noterx_rule_fallback",
        "overall_score": radar["overall"],
        "grade": _grade(radar["overall"]),
        "radar_data": radar,
        "agent_opinions": agent_opinions,
        "issues": issue_items[:5],
        "suggestions": suggestions,
        "debate_summary": (
            f"本地规则兜底判断：这条视频号内容当前最弱项是“{weakest['label']}”。"
            f"先补强该环节，再围绕“{category_label}”持续验证{metric_focus_sentence}。"
        ),
        "debate_timeline": [
            {"round": 1, "agent_name": "标题脚本专家", "kind": "add", "text": "标题和开头必须先给用户一个停留理由。"},
            {"round": 1, "agent_name": "封面视觉专家", "kind": "add", "text": "封面大字、主体和结果词要在群聊缩略图里仍可读。"},
            {"round": 2, "agent_name": "项目初诊承接专家", "kind": "rebuttal", "text": "没有明确评论/私信/收藏动作，播放很难变成可运营线索。"},
        ],
        "simulated_comments": comments,
        "optimized_title": optimized_title,
        "optimized_content": optimized_content,
        "cover_direction": {
            "layout": "人物/场景主体 + 结果词大字 + 价格/步骤/对象补充",
            "color_scheme": "白底或真实场景底，核心词使用高对比红/黑强调",
            "text_style": "12-16 字，保留人群词、痛点词和结果词",
            "tips": [
                "封面文案与标题第一句保持同一个卖点",
                "群聊缩略图里仍能看清主体和大字",
                "结尾动作同步放入评论区置顶话术",
            ],
        },
    }
    return enrich_wechat_report(
        report,
        title=title,
        content=content,
        category=category,
        tags=tags,
        script=script,
        opening_hook=opening_hook,
        publish_time=publish_time,
        metrics=metrics,
        image_count=image_count,
        video_analysis=video_analysis,
    )


def enrich_wechat_report(report: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    """Attach push-chain diagnostics and use them to strengthen suggestions."""
    chain = build_wechat_algorithm_chain(**kwargs)
    category = str(kwargs.get("category") or "local")
    content_profile = get_platform_content_profile("wechat_channels", category)
    primary_formula = (content_profile.get("content_formulas") or ["项目场景 -> 设计证据 -> 转发理由 -> 初诊承接"])[0]
    metric_focus = (content_profile.get("metric_focus") or ["完播、转发、评论和项目初诊"])[0]
    report["platform"] = "wechat_channels"
    report["diagnosis_method"] = report.get("diagnosis_method") or "noterx_multi_agent"
    is_rule_fallback = report["diagnosis_method"] == "noterx_rule_fallback"
    report["algorithm_chain"] = chain
    report["workflow_trace"] = build_noterx_workflow_trace("wechat_channels")
    report["content_profile"] = content_profile

    weakest = sorted(chain, key=lambda item: item["score"])[0]
    suggestions = list(report.get("suggestions") or [])
    if not is_rule_fallback:
        suggestions.insert(
            0,
            {
                "priority": 1,
                "description": f"先修视频号推送链路里的“{weakest['label']}”：{weakest['suggestion']}",
                "expected_impact": "提升视频号信息流停留、决策转发或项目初诊效率",
            },
        )
        suggestions.insert(
            1,
            {
                "priority": 1,
                "description": f"按“{content_profile['category_label']}”内容样本重排：{primary_formula}",
                "expected_impact": f"对齐视频号同场景高表现结构，重点改善{metric_focus}",
            },
        )
    deduped_suggestions: list[dict[str, Any]] = []
    seen_descriptions: set[str] = set()
    for suggestion in suggestions:
        description = str(suggestion.get("description", "")).strip()
        if description and description not in seen_descriptions:
            seen_descriptions.add(description)
            deduped_suggestions.append(suggestion)
    report["suggestions"] = deduped_suggestions[:8]

    title = str(kwargs.get("title") or "").strip()
    category_label = str(content_profile.get("category_label") or CATEGORY_LABELS.get(category, category or "视频号"))
    score = int(round(_to_float(report.get("overall_score"), 0)))
    first_action = report.get("first_action") or (
        report["suggestions"][0]["description"] if report.get("suggestions") else weakest["suggestion"]
    )
    biggest_weakness = report.get("biggest_weakness") or f"{weakest['label']}偏弱：{weakest['reason']}"
    optimized_title = str(report.get("optimized_title") or "").strip()
    if not optimized_title:
        title_prefix = title or f"{category_label}选题"
        optimized_title = title_prefix if re.search(r"\d|别|先|为什么|清单|避坑", title_prefix) else f"{title_prefix}：先看这 3 个关键点"
        report["optimized_title"] = optimized_title
    optimized_content = str(report.get("optimized_content") or "").strip()
    if not optimized_content:
        optimized_content = "\n".join([
            f"这条内容先解决一个具体的{category_label}问题。",
            f"按“{primary_formula}”展开，先讲场景，再给证据和步骤。",
            "结尾只保留一个动作：评论关键词、收藏清单或预约项目初诊。",
        ])
        report["optimized_content"] = optimized_content
    comment_prompts = report.get("comment_prompts") or [
        f"你现在最想先解决哪个{category_label}问题？",
        "A. 预算不清 B. 动线不好 C. 封面不吸引 D. 不知道怎么承接咨询",
        f"想要{category_label}检查清单，可以评论关键词：清单",
    ]
    publish_checklist = report.get("publish_checklist") or [
        "标题前半句是否直接说清人群、场景或痛点",
        "封面在信息流、朋友圈和群聊缩略图里是否仍能看懂",
        "前 3 秒是否先给结果、冲突或明确判断，而不是铺背景",
        "结尾是否只保留一个评论、收藏、转发或项目初诊动作",
    ]
    report["summary_conclusion"] = report.get("summary_conclusion") or (
        f"综合 {score} 分，当前最需要先修“{weakest['label']}”；按“{category_label}”结构重排后再发布或复盘。"
    )
    report["first_action"] = first_action
    report["biggest_weakness"] = biggest_weakness
    report["comment_prompts"] = comment_prompts
    report["publish_checklist"] = publish_checklist
    report["reuse_actions"] = report.get("reuse_actions") or [
        {"label": "复制标题", "text": optimized_title},
        {"label": "复制文案", "text": optimized_content},
        {"label": "复制评论引导", "text": "\n".join(comment_prompts)},
        {"label": "复制发布检查清单", "text": "\n".join(f"- {item}" for item in publish_checklist)},
    ]

    comments = list(report.get("simulated_comments") or [])
    comment_refs = reference_comments("wechat_channels", content_profile["category"], 3)
    avatars = ["👥", "💬", "📌"]
    while len(comments) < 3 and len(comments) < len(comment_refs):
        idx = len(comments)
        comments.append({
            "username": "视频号用户",
            "avatar_emoji": avatars[idx % len(avatars)],
            "comment": comment_refs[idx],
            "sentiment": "positive" if idx != 1 else "neutral",
        })
    report["simulated_comments"] = comments
    if report.get("debate_summary") and not is_rule_fallback:
        report["debate_summary"] = (
            f"{report['debate_summary']} 平台链路补充：当前最弱环节是“{weakest['label']}”。"
            f" 内容数据补充：当前场景建议优先套用“{primary_formula}”。"
        )
    return report
