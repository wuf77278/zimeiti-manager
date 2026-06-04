"""Douyin platform diagnosis strategy.

MVP implementation migrated from the standalone content assistant prototype. It is
intentionally deterministic and only uses user-submitted material/metrics; no
platform scraping or unauthorized account collection is performed.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
from typing import Any

from app.platforms.content_data import get_platform_content_profile, reference_comments
from app.platforms.noterx_workflow import build_noterx_workflow_trace


TRAFFIC_LABELS = {
    "hospitality_design": "民宿酒店设计",
    "office_design": "办公空间设计",
    "design_search": "设计需求搜索",
    "lead": "项目线索承接",
    "interest": "兴趣推荐",
    "search": "设计需求搜索",
    "local": "同城 / POI",
    "commerce": "咨询预约",
    "private": "项目线索承接",
}

GOAL_LABELS = {
    "follow": "转粉",
    "comment": "评论互动",
    "save": "收藏复看",
    "lead": "私信留资",
    "deal": "咨询预约",
}


KEYWORD_GROUPS = {
    "hook": ["别", "先", "不要", "只要", "3", "三", "避坑", "真相", "流程", "方法", "清单"],
    "save": ["步骤", "清单", "模板", "流程", "攻略", "避坑", "收藏", "复盘"],
    "conversion": ["私信", "预约", "方案", "评论", "领取", "咨询", "初诊", "案例", "关注"],
    "design": ["民宿", "酒店", "办公", "办公室", "设计", "平面图", "动线", "预算", "改造"],
    "local": ["同城", "附近", "门店", "到店", "地址", "预约", "本地", "POI"],
    "commerce": ["价格", "预算", "方案", "案例", "初诊", "咨询", "项目", "预约"],
}

BASELINE_FIELD_ALIASES = {
    "plays": {"plays", "play_count", "views", "view_count", "播放", "播放量"},
    "completion": {"completion", "completionRate", "completion_rate", "finish_rate", "完播", "完播率"},
    "likes": {"likes", "like_count", "点赞", "点赞数"},
    "comments": {"comments", "comment_count", "评论", "评论数"},
    "shares": {"shares", "share_count", "forwards", "分享", "转发", "分享数"},
}


def _status(score: float) -> str:
    if score >= 78:
        return "strong"
    if score >= 62:
        return "watch"
    return "risk"


def _clamp(value: float) -> int:
    return int(round(min(max(value, 0), 100)))


def _grade(score: float) -> str:
    if score >= 90:
        return "S"
    if score >= 75:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    return "D"


def _count_keywords(text: str, words: list[str]) -> int:
    return sum(1 for word in words if word and word.lower() in text.lower())


def _parse_duration(value: Any) -> float:
    try:
        n = float(value or 35)
    except (TypeError, ValueError):
        return 35.0
    return max(5.0, min(n, 600.0))


def _normalize_header(value: Any) -> str:
    return str(value or "").strip().lstrip("﻿")


def _canonical_baseline_key(header: Any) -> str | None:
    normalized = _normalize_header(header)
    normalized_lower = normalized.lower()
    for key, aliases in BASELINE_FIELD_ALIASES.items():
        if normalized in aliases or normalized_lower in {alias.lower() for alias in aliases}:
            return key
    return None


def _numeric_values_from_line(line: str) -> list[float]:
    return [float(x) for x in re.findall(r"\d+(?:\.\d+)?", line.replace(",", ""))]


def _parse_delimited_baseline(raw: str) -> list[dict[str, Any]]:
    sample = raw.strip()
    if not sample:
        return []
    try:
        dialect = csv.Sniffer().sniff(sample[:1024], delimiters=",\t;，")
    except csv.Error:
        dialect = csv.excel_tab if "\t" in sample else csv.excel

    try:
        parsed_rows = [row for row in csv.reader(io.StringIO(sample), dialect) if any(cell.strip() for cell in row)]
    except csv.Error:
        return []
    if len(parsed_rows) < 2:
        return []

    header = [_normalize_header(cell) for cell in parsed_rows[0]]
    canonical_keys = [_canonical_baseline_key(cell) for cell in header]
    if not any(canonical_keys):
        return []

    rows: list[dict[str, Any]] = []
    for row in parsed_rows[1:]:
        item: dict[str, Any] = {}
        for idx, key in enumerate(canonical_keys):
            if key and idx < len(row) and str(row[idx]).strip():
                item[key] = row[idx]
        if item:
            rows.append(item)
    return rows


def _parse_baseline_rows(raw: str) -> list[dict[str, Any]]:
    if not raw or raw.strip() in {"", "[]"}:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
    except Exception:
        pass

    delimited_rows = _parse_delimited_baseline(raw)
    if delimited_rows:
        return delimited_rows

    rows: list[dict[str, Any]] = []
    fallback_keys = ["plays", "completion", "likes", "comments", "shares"]
    for line in raw.splitlines():
        nums = _numeric_values_from_line(line)
        if nums:
            rows.append({key: nums[idx] for idx, key in enumerate(fallback_keys) if idx < len(nums)})
    return rows


def _to_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
        if match:
            return float(match.group(0))
    return default


def compute_baseline(rows: list[dict[str, Any]]) -> dict[str, float]:
    if not rows:
        return {
            "count": 0,
            "avg_plays": 0,
            "completion_rate": 0,
            "engagement_rate": 0,
        }

    plays = [_to_float(row.get("plays") or row.get("播放") or row.get("play_count") or row.get("views") or row.get("播放量")) for row in rows]
    completions = [
        _to_float(row.get("completion") or row.get("completionRate") or row.get("completion_rate") or row.get("完播") or row.get("完播率"))
        for row in rows
    ]
    likes = [_to_float(row.get("likes") or row.get("点赞") or row.get("like_count") or row.get("点赞数")) for row in rows]
    comments = [_to_float(row.get("comments") or row.get("评论") or row.get("comment_count") or row.get("评论数")) for row in rows]
    shares = [_to_float(row.get("shares") or row.get("分享") or row.get("share_count") or row.get("转发") or row.get("分享数")) for row in rows]

    total_plays = sum(plays) or 1
    return {
        "count": len(rows),
        "avg_plays": sum(plays) / max(len(plays), 1),
        "completion_rate": sum(completions) / max(len([v for v in completions if v > 0]), 1),
        "engagement_rate": (sum(likes) + sum(comments) * 1.5 + sum(shares) * 2) / total_plays * 100,
    }


def build_algorithm_chain(
    fields: dict[str, Any],
    media: dict[str, int],
    baseline: dict[str, float],
    dims: dict[str, int],
) -> list[dict[str, Any]]:
    """Build a transparent Douyin push-chain proxy diagnosis."""
    title = str(fields.get("title") or "")
    content = str(fields.get("content") or "")
    script = str(fields.get("script") or "")
    hook = str(fields.get("hook") or "")
    tags = str(fields.get("tags") or "")
    ops_data = str(fields.get("opsData") or "")
    traffic_field = str(fields.get("trafficField") or "interest")
    goal = str(fields.get("goal") or "follow")
    text = "\n".join([title, content, script, hook, tags, ops_data])

    safety_score = 84
    if re.search(r"加微信|VX|二维码|返现|稳赚|暴富|私加|站外", text, re.I):
        safety_score -= 32
    if re.search(r"绝对|唯一|100%|必赚|闭眼买|保证", text):
        safety_score -= 14

    recognition_score = dims["recognition"]
    if tags:
        recognition_score += min(len([t for t in re.split(r"[,，、\s]+", tags) if t]) * 2, 8)
    if traffic_field == "search" and re.search(r"怎么|教程|清单|流程|避坑|价格|位置|关键词", text):
        recognition_score += 8
    if traffic_field == "local" and _count_keywords(text, KEYWORD_GROUPS["local"]) >= 2:
        recognition_score += 8
    if traffic_field == "commerce" and _count_keywords(text, KEYWORD_GROUPS["commerce"]) >= 2:
        recognition_score += 8

    cold_score = dims["hook"]
    cold_score += min(media.get("images", 0) * 3 + media.get("videos", 0) * 6, 8)
    if re.search(r"前3秒|首帧|第一秒|直接看|先看", text):
        cold_score += 8

    completion_score = dims["completion"]
    if re.search(r"复看|收藏|模板|步骤|清单", text):
        completion_score += 6

    interaction_score = 46
    interaction_score += _count_keywords(text, ["评论", "你觉得", "投票", "留言", "收藏", "分享", "转发"]) * 7
    interaction_score += min(baseline.get("engagement_rate", 0) * 2.5, 18)
    if goal in {"comment", "save"}:
        interaction_score += 8

    conversion_score = dims["conversion"]
    if goal in {"lead", "deal"} and re.search(r"私信|预约|预算|方案|案例|主页|咨询|初诊", text):
        conversion_score += 10
    if traffic_field in {"local", "commerce"}:
        conversion_score += 5

    longtail_score = 44
    longtail_score += _count_keywords(text, KEYWORD_GROUPS["save"]) * 6
    longtail_score += 12 if traffic_field == "search" else 0
    longtail_score += min(baseline.get("completion_rate", 0) * 0.22, 12)

    feedback_score = 82
    if len(title) > 44:
        feedback_score -= 8
    if re.search(r"绝对|唯一|100%|必赚|闭眼买|保证", text):
        feedback_score -= 18
    if safety_score < 70:
        feedback_score -= 8

    configs = [
        (
            "admission_safety",
            "准入与负面风险",
            safety_score,
            "抖音会先过滤低质、过度营销、站外导流和高负反馈风险内容。",
            "把站外引导改成评论关键词、主页路径或平台内私信，避免绝对化承诺。",
        ),
        (
            "content_recognition",
            "内容识别与人群匹配",
            recognition_score,
            "系统需要从标题、字幕、标签、画面和账号历史判断内容该发给谁。",
            f"围绕“{TRAFFIC_LABELS.get(traffic_field, '兴趣推荐')}”统一标题关键词、字幕关键词和标签。",
        ),
        (
            "cold_start",
            "冷启动秒停留",
            cold_score,
            "首帧和前 3 秒决定初始流量池是否继续测试。",
            "第一秒给结果、反差、数字或强痛点，删掉背景铺垫。",
        ),
        (
            "completion_amplification",
            "完播与复看放大",
            completion_score,
            "用户是否看完、复看和收藏，会影响内容能否从小流量池放大。",
            "把脚本压成结果、冲突、步骤、证明、承接几个节点，每 4-6 秒给信息奖励。",
        ),
        (
            "interaction_trigger",
            "互动触发",
            interaction_score,
            "评论、收藏、分享会帮助系统判断内容价值和人群扩散可能。",
            "在脚本前半段埋一个二选一问题，结尾用置顶评论承接。",
        ),
        (
            "conversion_handoff",
            "转粉/交易承接",
            conversion_score,
            "播放不是终点，目标动作要和关注、私信、案例领取或项目初诊路径一致。",
            f"当前目标是“{GOAL_LABELS.get(goal, goal)}”，正文、结尾和置顶评论都要给同一个动作。",
        ),
        (
            "search_longtail",
            "搜索长尾",
            longtail_score,
            "教程、清单、价格、位置、避坑类内容有机会通过搜索持续进量。",
            "标题、字幕和评论区统一同一个问题词，补充可收藏的清单或模板。",
        ),
        (
            "negative_feedback",
            "负反馈控制",
            feedback_score,
            "标题党、过度承诺或营销感强会带来划走、不感兴趣和举报风险。",
            "用真实案例和条件表达替代夸张承诺，承诺必须在正文兑现。",
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


def score_dimensions(fields: dict[str, Any], media: dict[str, int], baseline: dict[str, float]) -> dict[str, int]:
    title = str(fields.get("title") or "")
    content = str(fields.get("content") or "")
    script = str(fields.get("script") or "")
    hook = str(fields.get("hook") or fields.get("opening_hook") or "")
    tags = str(fields.get("tags") or "")
    ops_data = str(fields.get("opsData") or "")
    traffic_field = str(fields.get("trafficField") or fields.get("category") or "interest")
    goal = str(fields.get("goal") or "follow")
    duration = _parse_duration(fields.get("duration"))
    text = "\n".join([title, content, script, hook, tags, ops_data])

    hook_source = f"{title} {hook}".strip()
    hook_score = 46
    hook_score += min(len(hook_source), 32) * 0.75
    hook_score += _count_keywords(hook_source, KEYWORD_GROUPS["hook"]) * 7
    hook_score += 8 if re.search(r"\d", hook_source) else 0
    hook_score += 5 if any(p in hook_source for p in ["？", "?", "！", "!"]) else 0

    script_len = len(script or content)
    completion_score = 45
    completion_score += 14 if 15 <= duration <= 60 else (6 if duration <= 120 else -4)
    completion_score += min(script_len / 18, 22)
    completion_score += _count_keywords(text, KEYWORD_GROUPS["save"]) * 4
    completion_score += 6 if "1" in text or "第一" in text or "三" in text else 0

    recognition_score = 48
    recognition_score += min(len(tags.split(",")) * 4, 14) if tags else 0
    recognition_score += min(media.get("images", 0) * 4 + media.get("videos", 0) * 7, 16)
    recognition_score += 8 if fields.get("audience") else 0
    recognition_score += 8 if traffic_field in TRAFFIC_LABELS else 0
    if traffic_field in {"local", "commerce"}:
        recognition_score += _count_keywords(text, KEYWORD_GROUPS.get(traffic_field, [])) * 3

    conversion_score = 45
    conversion_score += 10 if goal in GOAL_LABELS else 0
    conversion_score += _count_keywords(text, KEYWORD_GROUPS["conversion"]) * 6
    conversion_score += 8 if ops_data else 0
    if goal in {"lead", "deal"} and traffic_field in {"local", "commerce", "private"}:
        conversion_score += 8

    baseline_score = 54
    if baseline.get("count", 0) > 0:
        baseline_score += min(baseline["count"] * 1.5, 16)
        baseline_score += min(baseline.get("completion_rate", 0) * 0.25, 12)
        baseline_score += min(baseline.get("engagement_rate", 0) * 2, 10)
    else:
        baseline_score -= 5
    baseline_score += 6 if ops_data else 0
    baseline_score += 5 if _count_keywords(text, KEYWORD_GROUPS["save"] + KEYWORD_GROUPS["conversion"]) >= 3 else 0

    dims = {
        "hook": _clamp(hook_score),
        "completion": _clamp(completion_score),
        "recognition": _clamp(recognition_score),
        "conversion": _clamp(conversion_score),
        "baseline_fit": _clamp(baseline_score),
    }
    dims["overall"] = _clamp(
        dims["hook"] * 0.24
        + dims["completion"] * 0.22
        + dims["recognition"] * 0.18
        + dims["conversion"] * 0.16
        + dims["baseline_fit"] * 0.20
    )
    return dims


def _agent(name: str, dimension: str, score: int, issues: list[str], suggestions: list[str], reasoning: str) -> dict[str, Any]:
    return {
        "agent_name": name,
        "dimension": dimension,
        "score": score,
        "issues": issues,
        "suggestions": suggestions,
        "reasoning": reasoning,
        "debate_comments": [],
    }


def build_douyin_report(
    *,
    title: str,
    content: str = "",
    category: str = "interest",
    tags: str = "",
    script: str = "",
    audience: str = "",
    trafficField: str = "interest",
    goal: str = "follow",
    duration: Any = 35,
    hook: str = "",
    opsData: str = "",
    baselineRows: str = "[]",
    image_count: int = 0,
    video_count: int = 0,
) -> dict[str, Any]:
    raw_platform_category = trafficField or category or "interest"
    content_profile = get_platform_content_profile("douyin", raw_platform_category)
    platform_category = content_profile["category"]
    rows = _parse_baseline_rows(baselineRows)
    baseline = compute_baseline(rows)
    fields = {
        "title": title,
        "content": content,
        "category": platform_category,
        "tags": tags,
        "script": script,
        "audience": audience,
        "trafficField": platform_category,
        "goal": goal,
        "duration": duration,
        "hook": hook,
        "opsData": opsData,
    }
    media = {"images": image_count, "videos": video_count}
    dims = score_dimensions(fields, media, baseline)
    score = dims["overall"]
    algorithm_chain = build_algorithm_chain(fields, media, baseline, dims)
    weakest_stage = sorted(algorithm_chain, key=lambda item: item["score"])[0]
    traffic_label = TRAFFIC_LABELS.get(platform_category, platform_category or "兴趣推荐")
    goal_label = GOAL_LABELS.get(goal, goal or "转粉")
    primary_formula = (content_profile.get("content_formulas") or ["结果前置 -> 关键步骤 -> 证据 -> 行动承接"])[0]
    primary_hook = (content_profile.get("hook_patterns") or ["第一秒直接给出结果、冲突或明确收益。"])[0]
    metric_focus = (content_profile.get("metric_focus") or ["前3秒、完播、互动和转化承接"])[0]
    keyword_hint = "、".join((content_profile.get("keyword_packs") or [{"items": []}])[0].get("items", [])[:5])

    issues: list[dict[str, str]] = []
    suggestions: list[dict[str, Any]] = []

    def add_issue(key: str, desc: str, severity: str = "medium"):
        issues.append({"severity": severity, "description": desc, "from_agent": key})

    def add_suggestion(desc: str, impact: str, priority: int = 1):
        suggestions.append({"priority": priority, "description": desc, "expected_impact": impact})

    if dims["hook"] < 70:
        add_issue("秒停留 Agent", "标题和前 3 秒钩子还不够明确，用户可能没有立刻停下来的理由。", "high")
        add_suggestion("把开头改成“空间问题 + 改造结果 + 适用条件”，并在首帧同步出现同一句核心钩子。", "提升冷启动 3 秒留存", 1)
    if dims["completion"] < 70:
        add_issue("完播 Agent", "脚本结构的步骤感和兑现节奏不足，容易中段流失。")
        add_suggestion("按“痛点—误区—3步做法—结果对比—行动口令”重排脚本，每 6-8 秒给一次信息奖励。", "提升完播和收藏", 2)
    if dims["recognition"] < 70:
        add_issue("设计字段 Agent", f"当前素材对“{traffic_label}”内容字段的关键词和画面识别信号偏弱。")
        add_suggestion(f"补充 {traffic_label} 场景词、人群词、平面图或空间结果画面，让系统更容易识别推荐对象。", "提升分发匹配度", 2)
    if dims["conversion"] < 70:
        add_issue("线索承接 Agent", f"目标动作是“{goal_label}”，但评论区/结尾口令/项目初诊路径还不够清楚。")
        add_suggestion(f"结尾加入一个低门槛动作：评论关键词、收藏设计清单或私信领取案例，并和“{goal_label}”保持一致。", "提升互动与线索承接", 1)
    if dims["baseline_fit"] < 70:
        add_issue("基线 Agent", "缺少账号历史数据或爆款对照，当前判断更多依赖素材结构。")
        add_suggestion("导入近 10-30 条自有作品的播放、完播、互动和转化数据，形成账号自己的基线。", "让下次诊断更贴近账号实际", 3)
    if weakest_stage["score"] < 70:
        add_issue("平台链路 Agent", f"抖音推送链路里“{weakest_stage['label']}”偏弱：{weakest_stage['reason']}", "high")
        add_suggestion(f"先修“{weakest_stage['label']}”：{weakest_stage['suggestion']}", "提升抖音流量池通过率", 1)

    suggestions.insert(
        1 if suggestions else 0,
        {
            "priority": 1,
            "description": f"按“{traffic_label}”内容样本重排：{primary_formula}。首帧/第一句优先采用：{primary_hook}",
            "expected_impact": f"对齐{traffic_label}高表现结构，重点改善{metric_focus}",
        },
    )

    if not issues:
        add_issue("JudgeAgent", "整体结构完整，主要提升空间在首帧冲击力和转化口令的精细化。", "low")
    if not suggestions:
        add_suggestion("保留当前选题方向，补一版更强首帧文案和评论区置顶话术做 A/B 测试。", "验证爆发与转化上限", 1)

    agent_opinions = [
        _agent(
            "秒停留 Agent",
            "前3秒/秒停留",
            dims["hook"],
            [i["description"] for i in issues if i["from_agent"] == "秒停留 Agent"] or ["钩子需要更快给出反差或收益。"],
            [f"首帧字幕压缩到 12 字以内，突出结果或避坑；参考开场：{primary_hook}"],
            "重点评估标题、首帧和开头 3 秒是否能让推荐流用户停下。",
        ),
        _agent(
            "完播 Agent",
            "完播结构",
            dims["completion"],
            [i["description"] for i in issues if i["from_agent"] == "完播 Agent"] or ["中段需要更明确的节奏节点。"],
            [f"用步骤编号、前后对比和结尾兑现提高看完动机；参考公式：{primary_formula}"],
            "重点评估时长、脚本信息密度和兑现顺序。",
        ),
        _agent(
            "设计字段 Agent",
            "设计需求识别",
            dims["recognition"],
            [i["description"] for i in issues if i["from_agent"] == "设计字段 Agent"] or [f"{traffic_label} 的识别信号基本成立。"],
            [f"围绕 {traffic_label} 增加关键词、空间画面和标签一致性；优先关键词：{keyword_hint or traffic_label}。"],
            "重点评估素材能否被系统识别并送到正确人群。",
        ),
        _agent(
            "线索承接 Agent",
            "项目线索承接",
            dims["conversion"],
            [i["description"] for i in issues if i["from_agent"] == "线索承接 Agent"] or [f"{goal_label} 目标需要更强的结尾动作。"],
            ["把线索动作前置到正文、结尾和置顶评论三处。"],
            "重点评估互动、关注、私信或项目初诊预约的承接路径。",
        ),
    ]

    debate_timeline = [
        {"round": 2, "agent_name": "秒停留 Agent", "kind": "add", "text": "如果首帧不够具体，后面的完播结构很难被看到。"},
        {"round": 2, "agent_name": "线索承接 Agent", "kind": "rebuttal", "text": f"素材不能只追求播放，必须围绕“{goal_label}”设计评论或私信口令。"},
        {"round": 2, "agent_name": "设计字段 Agent", "kind": "agree", "text": f"{traffic_label} 场景下，人群词、空间词和结果词要同时出现，才能提升分发准确度。"},
    ]

    profile_comment_texts = reference_comments("douyin", platform_category, 3)
    comments = [
        {"username": "想收藏的用户", "avatar_emoji": "📝", "comment": profile_comment_texts[0] if len(profile_comment_texts) > 0 else "这个步骤能不能整理成清单？", "sentiment": "positive", "likes": 18},
        {"username": "路过刷到", "avatar_emoji": "👀", "comment": profile_comment_texts[1] if len(profile_comment_texts) > 1 else "开头如果直接放结果对比，我会更想看完。", "sentiment": "neutral", "likes": 9},
        {"username": "潜在客户", "avatar_emoji": "💬", "comment": profile_comment_texts[2] if len(profile_comment_texts) > 2 else "评论关键词能拿到模板吗？", "sentiment": "positive", "likes": 12},
    ]

    optimized_title = title.strip() or f"{traffic_label}这样改，先看这3个关键点"
    if optimized_title and not re.search(r"\d", optimized_title):
        optimized_title = f"{optimized_title}：先改这 3 个关键点"
    optimized_content = (content or script).strip()
    if not optimized_content:
        optimized_content = "\n".join([
            f"先看这个{traffic_label}内容的关键问题。",
            f"按“{primary_formula}”重排脚本，第一秒先给结果或冲突。",
            f"结尾只保留一个动作：围绕“{goal_label}”引导评论、收藏或私信。",
        ])
    first_action = suggestions[0]["description"] if suggestions else weakest_stage["suggestion"]
    biggest_weakness = f"{weakest_stage['label']}偏弱：{weakest_stage['reason']}"
    comment_prompts = [
        f"你现在最想先解决哪个{traffic_label}问题？",
        "A. 首帧不吸引 B. 中段掉完播 C. 评论少 D. 私信转化弱",
        f"想要{traffic_label}脚本清单，可以评论关键词：清单",
    ]
    publish_checklist = [
        "首帧大字是否 12 字以内，并和标题表达同一个卖点",
        "前 3 秒是否直接出现结果、冲突、数字或强痛点",
        f"标题、字幕和标签是否围绕“{traffic_label}”统一关键词",
        f"结尾和置顶评论是否只引导一个“{goal_label}”动作",
    ]

    return {
        "platform": "douyin",
        "diagnosis_method": "noterx_multi_agent",
        "overall_score": score,
        "grade": _grade(score),
        "summary_conclusion": f"综合 {score} 分，当前适合走“{traffic_label}”路径；先修“{weakest_stage['label']}”，再做完播和承接优化。",
        "first_action": first_action,
        "biggest_weakness": biggest_weakness,
        "comment_prompts": comment_prompts,
        "publish_checklist": publish_checklist,
        "reuse_actions": [
            {"label": "复制标题", "text": optimized_title},
            {"label": "复制文案", "text": optimized_content},
            {"label": "复制评论引导", "text": "\n".join(comment_prompts)},
            {"label": "复制发布检查清单", "text": "\n".join(f"- {item}" for item in publish_checklist)},
        ],
        "radar_data": dims,
        "agent_opinions": agent_opinions,
        "issues": issues[:6],
        "suggestions": suggestions[:6],
        "debate_summary": f"JudgeAgent 判断：这条素材适合走“{traffic_label}”路径，核心目标是“{goal_label}”。平台链路最弱项是“{weakest_stage['label']}”，优先补强首帧钩子、完播兑现和结尾承接。",
        "debate_timeline": debate_timeline,
        "simulated_comments": comments,
        "optimized_title": optimized_title,
        "optimized_content": optimized_content,
        "cover_direction": {
            "layout": "结果画面 + 大字钩子 + 人/物主体",
            "color_scheme": "高对比背景，关键词用亮色强调",
            "text_style": "12字以内，突出数字、反差或具体收益",
            "tips": [
                "首帧文字与前 3 秒口播保持一致",
                f"画面中补充“{traffic_label}”可识别的场景元素",
                "结尾行动口令同步放进置顶评论",
            ],
        },
        "algorithm_chain": algorithm_chain,
        "workflow_trace": build_noterx_workflow_trace("douyin"),
        "content_profile": content_profile,
    }
