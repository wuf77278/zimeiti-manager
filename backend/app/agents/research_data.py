"""
数据驱动模块：基于视频号场景的启发式研究基准。
提供场景评分参数、数据驱动提示词注入、Model A 预评分。
"""
from __future__ import annotations

import re

from app.platforms.content_data import build_content_data_summary, get_platform_content_profile

# ═══════════════════════════════════════════════════════════════
# 视频号高表现标题样本（用于 few-shot 参考）
# ═══════════════════════════════════════════════════════════════

VIRAL_TITLES: dict[str, list[str]] = {
    "local": [
        "武汉周末遛娃别再只去商场了",
        "这家社区小店为什么天天排队",
        "人均39的亲子室内馆，我替你踩过点了",
    ],
    "knowledge": [
        "一个方法判断孩子是不是真的听懂了",
        "别急着买保险，先看懂这三个坑",
        "普通人做短视频，先搞清楚这件事",
    ],
    "emotion": [
        "如果你总是忍不住吼孩子，先听完这段",
        "中年夫妻最怕的不是吵架，是这件小事",
        "真正让父母寒心的，往往不是没钱",
    ],
    "enterprise": [
        "客户为什么宁愿多花20%也选我们",
        "一家门店从冷清到复购，改了这三件事",
        "别再只介绍产品了，客户想听的是结果",
    ],
    "shop": [
        "这件东西适不适合你，看完这三点再买",
        "同样是家用清洁，为什么这款更省事",
        "别被低价骗了，买之前先看这里",
    ],
    "ip": [
        "我做个人IP踩过的第一个坑",
        "普通人建立信任感，不靠人设靠这三件事",
        "如果你刚开始做账号，先别急着追热点",
    ],
}

REAL_COMMENTS: dict[str, list[str]] = {
    "local": [
        "这个地方离地铁远不远？周末人多吗",
        "适合带老人一起去吗，想周六过去看看",
        "价格说清楚了，这种视频才有用",
    ],
    "knowledge": [
        "这个解释我听懂了，比之前看到的清楚",
        "能不能再讲讲第二种情况",
        "转给家里人看了，确实容易忽略",
    ],
    "emotion": [
        "说到心里了，我家也是这样",
        "看到最后有点沉默，确实该好好聊聊",
        "希望家里人也能刷到这条",
    ],
    "enterprise": [
        "这种案例比单纯讲产品可信多了",
        "如果是小办公室也能这样做吗",
        "想了解一下具体怎么落地",
    ],
    "shop": [
        "有没有适合老人用的版本",
        "看完知道怎么选了，不要只看价格",
        "链接在哪里，想对比一下",
    ],
    "ip": [
        "这个阶段我也经历过，太真实了",
        "不是鸡汤，能听进去",
        "继续讲，新人很需要这种实话",
    ],
}

# ═══════════════════════════════════════════════════════════════
# Model A 场景评分参数
# ═══════════════════════════════════════════════════════════════

MODEL_PARAMS: dict[str, dict] = {
    "local": {
        "weights": {"title_hook": 0.23, "cover_click": 0.22, "script_retention": 0.18, "interaction_share": 0.22, "positioning_fit": 0.15},
        "title_length": {"min": 12, "max": 26, "viral_avg": 18.0},
        "content_length": {"min": 40, "max": 180},
        "keyword_count": {"min": 2, "max": 6, "best": 4},
        "image_count": {"min": 1, "max": 4},
        "baseline": {"avg_engagement": 2800, "median": 680, "viral_threshold": 12000, "sample_size": 500},
    },
    "knowledge": {
        "weights": {"title_hook": 0.25, "cover_click": 0.14, "script_retention": 0.28, "interaction_share": 0.15, "positioning_fit": 0.18},
        "title_length": {"min": 12, "max": 28, "viral_avg": 20.0},
        "content_length": {"min": 80, "max": 360},
        "keyword_count": {"min": 2, "max": 5, "best": 3},
        "image_count": {"min": 1, "max": 3},
        "baseline": {"avg_engagement": 2100, "median": 520, "viral_threshold": 9500, "sample_size": 500},
    },
    "emotion": {
        "weights": {"title_hook": 0.27, "cover_click": 0.13, "script_retention": 0.24, "interaction_share": 0.24, "positioning_fit": 0.12},
        "title_length": {"min": 10, "max": 24, "viral_avg": 17.0},
        "content_length": {"min": 60, "max": 260},
        "keyword_count": {"min": 1, "max": 4, "best": 2},
        "image_count": {"min": 1, "max": 3},
        "baseline": {"avg_engagement": 3600, "median": 900, "viral_threshold": 15000, "sample_size": 500},
    },
    "enterprise": {
        "weights": {"title_hook": 0.18, "cover_click": 0.18, "script_retention": 0.20, "interaction_share": 0.18, "positioning_fit": 0.26},
        "title_length": {"min": 12, "max": 30, "viral_avg": 21.0},
        "content_length": {"min": 80, "max": 320},
        "keyword_count": {"min": 2, "max": 5, "best": 3},
        "image_count": {"min": 1, "max": 4},
        "baseline": {"avg_engagement": 1200, "median": 260, "viral_threshold": 5200, "sample_size": 500},
    },
    "shop": {
        "weights": {"title_hook": 0.22, "cover_click": 0.24, "script_retention": 0.18, "interaction_share": 0.16, "positioning_fit": 0.20},
        "title_length": {"min": 12, "max": 28, "viral_avg": 19.0},
        "content_length": {"min": 60, "max": 240},
        "keyword_count": {"min": 2, "max": 6, "best": 4},
        "image_count": {"min": 1, "max": 5},
        "baseline": {"avg_engagement": 2400, "median": 560, "viral_threshold": 11000, "sample_size": 500},
    },
    "ip": {
        "weights": {"title_hook": 0.24, "cover_click": 0.15, "script_retention": 0.23, "interaction_share": 0.17, "positioning_fit": 0.21},
        "title_length": {"min": 10, "max": 26, "viral_avg": 18.0},
        "content_length": {"min": 70, "max": 300},
        "keyword_count": {"min": 1, "max": 5, "best": 3},
        "image_count": {"min": 1, "max": 3},
        "baseline": {"avg_engagement": 1800, "median": 420, "viral_threshold": 8200, "sample_size": 500},
    },
}

CATEGORY_CN = {
    "local": "本地生活",
    "knowledge": "知识科普",
    "emotion": "情感口播",
    "enterprise": "企业号",
    "shop": "带货",
    "ip": "个人IP",
    "food": "本地生活",
    "lifestyle": "本地生活",
    "tech": "知识科普",
}

CATEGORY_ALIASES = {
    "food": "local",
    "lifestyle": "local",
    "tech": "knowledge",
    "travel": "local",
    "beauty": "shop",
    "fitness": "ip",
    "home": "local",
}


def _normalize_category(category: str) -> str:
    return CATEGORY_ALIASES.get(category, category if category in MODEL_PARAMS else "local")


# ═══════════════════════════════════════════════════════════════
# 特征提取 + Model A 预评分
# ═══════════════════════════════════════════════════════════════

def _detect_emoji(text: str) -> bool:
    return bool(re.search(
        "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F900-\U0001F9FF\U00002702-\U000027B0✨\U0001F525\U0001F49A‼⭐]",
        text or "",
    ))


def _count_hooks(title: str) -> int:
    hooks = 0
    if re.search(r"\d+", title):
        hooks += 1
    if re.search(r"[！!？?]", title):
        hooks += 1
    if re.search(r"[｜|，,：:]", title):
        hooks += 1
    if re.search(r"(为什么|怎么|别再|如果|普通人|适合谁|先看|避坑|方法|三点|结果|案例)", title):
        hooks += 1
    if re.search(r"(孩子|父母|客户|门店|同城|社群|朋友圈|微信群|复购|涨粉)", title):
        hooks += 1
    return hooks


def _range_score(value: float, opt_min: float, opt_max: float, base: float = 80) -> float:
    if opt_min <= value <= opt_max:
        mid = (opt_min + opt_max) / 2
        half = (opt_max - opt_min) / 2 + 1
        return base + (100 - base) * (1 - abs(value - mid) / half)
    if value < opt_min:
        return max(20, base * value / max(opt_min, 1))
    return max(40, base - (value - opt_max) * 2)


def _contains_any(text: str, words: list[str]) -> bool:
    return any(word in text for word in words)


def pre_score(title: str, content: str, category: str, tag_count: int = 0, image_count: int = 0) -> dict:
    """
    Model A 预评分。返回视频号五维分数和总分，用于注入到 Agent prompt 中。
    """
    normalized = _normalize_category(category)
    p = MODEL_PARAMS[normalized]
    w = p["weights"]
    combined = f"{title}\n{content}"

    tl = p["title_length"]
    title_score = _range_score(len(title), tl["min"], tl["max"])
    title_score += (5 if re.search(r"\d+", title) else 0)
    title_score += min(_count_hooks(title), 4) * 4
    title_score += (2 if _detect_emoji(combined) else 0)
    title_score = min(title_score, 100)

    cl = p["content_length"]
    script_score = min(_range_score(len(content), cl["min"], cl["max"], 82), 100)
    if _contains_any(combined, ["首先", "第一", "第二", "最后", "结论", "重点", "步骤", "原因"]):
        script_score = min(script_score + 8, 100)
    if _contains_any(combined, ["开头", "3秒", "三秒", "看完", "先别", "如果你"]):
        script_score = min(script_score + 6, 100)

    ic = p["image_count"]
    cover_score = min(_range_score(max(image_count, 1), ic["min"], ic["max"]), 100)
    if _contains_any(title, ["人均", "价格", "地点", "适合", "结果", "案例", "避坑"]):
        cover_score = min(cover_score + 6, 100)

    kc = p["keyword_count"]
    positioning_score = max(45, 100 - abs(tag_count - kc["best"]) * 8)
    if _contains_any(combined, [CATEGORY_CN[normalized], "同城", "客户", "家长", "门店", "社群", "小店", "个人IP", "普通人"]):
        positioning_score = min(positioning_score + 8, 100)

    share_signals = 0
    if _count_hooks(title) >= 2:
        share_signals += 25
    if _contains_any(combined, ["转给", "评论", "收藏", "私信", "群", "朋友圈", "家人", "客户", "朋友"]):
        share_signals += 25
    if _contains_any(combined, ["适合", "避坑", "清单", "方法", "步骤", "案例", "结果"]):
        share_signals += 25
    if kc["min"] <= tag_count <= kc["max"]:
        share_signals += 15
    if image_count >= ic["min"]:
        share_signals += 10
    interaction_score = min(share_signals, 100)

    dims = {
        "title_hook": round(title_score, 1),
        "cover_click": round(cover_score, 1),
        "script_retention": round(script_score, 1),
        "interaction_share": round(interaction_score, 1),
        "positioning_fit": round(positioning_score, 1),
    }

    total = min(round(sum(dims[k] * w[k] for k in w), 1), 100)

    bl = p["baseline"]
    if total >= 85:
        level = "前10%（强转发潜力）"
    elif total >= 75:
        level = "前25%（优质视频号内容）"
    elif total >= 65:
        level = "场景中位水平"
    else:
        level = "低于中位，建议先优化钩子和转发理由"

    return {
        "total_score": total,
        "dimensions": dims,
        "weights": w,
        "level": level,
        "baseline": bl,
    }


def build_data_prompt_for_agent(agent_type: str, category: str) -> str:
    """
    为指定 Agent 和视频号场景生成数据驱动的提示词片段，拼接到 system prompt 后。
    """
    normalized = _normalize_category(category)
    p = MODEL_PARAMS[normalized]
    w = p["weights"]
    bl = p["baseline"]
    cn = CATEGORY_CN.get(normalized, normalized)

    profile = get_platform_content_profile("wechat_channels", normalized)
    viral = profile.get("sample_titles") or VIRAL_TITLES.get(normalized, VIRAL_TITLES["local"])
    comments = profile.get("comment_patterns") or REAL_COMMENTS.get(normalized, REAL_COMMENTS["local"])
    content_data = build_content_data_summary("wechat_channels", normalized, agent_type=agent_type, max_items=3)

    if agent_type == "content":
        viral_str = " / ".join(f'"{t}"' for t in viral[:3])
        return (
            f"\n\n## 视频号场景基准（{cn}，基于{bl['sample_size']}条模拟基线）\n"
            f"- 标题建议长度：{p['title_length']['min']}-{p['title_length']['max']}字（高表现平均{p['title_length']['viral_avg']}字）\n"
            f"- 简介/脚本建议长度：{p['content_length']['min']}-{p['content_length']['max']}字\n"
            f"- 标题钩子权重：{w['title_hook']:.1%}，脚本留存权重：{w['script_retention']:.1%}\n"
            f"- 基线互动量：平均{bl['avg_engagement']:,}，中位数{bl['median']:,}，高表现线{bl['viral_threshold']:,}\n"
            f"\n**该场景高表现标题参考**：\n{viral_str}\n"
            f"{content_data}\n"
            f"请围绕视频号的开头3秒、口播节奏、熟人转发理由和可信表达给出诊断。"
        )
    if agent_type == "visual":
        return (
            f"\n\n## 视频号封面/首帧基准（{cn}）\n"
            f"- 建议素材数量：{p['image_count']['min']}-{p['image_count']['max']}张/段，重点看首帧和转发卡片可读性\n"
            f"- 封面点击力权重：{w['cover_click']:.1%}\n"
            f"{content_data}\n"
            f"请判断封面大字、主体、场景信息在信息流、朋友圈和群聊预览中是否一眼看懂。"
        )
    if agent_type == "growth":
        return (
            f"\n\n## 视频号增长基准（{cn}）\n"
            f"- 互动转发力权重：{w['interaction_share']:.1%}\n"
            f"- 账号定位匹配权重：{w['positioning_fit']:.1%}\n"
            f"- 基线：平均互动{bl['avg_engagement']:,}，高表现线{bl['viral_threshold']:,}\n"
            f"- 建议重点：朋友圈/微信群转发理由、评论问题、私域承接、发布时间和完播率。\n"
            f"{content_data}\n"
            f"请给出合规增长建议，不建议刷量、诱导分享或自动化骚扰。"
        )
    if agent_type == "user_sim":
        comments_str = "\n".join(f'  - "{c}"' for c in comments[:3])
        return (
            f"\n\n## 视频号用户画像（{cn}）\n"
            f"- 重点模拟信息流用户、朋友圈接收者、微信群接收者和私域客户。\n"
            f"- 评论应体现真实微信语境：问地点/价格/适不适合自己、补充经验、转给家人朋友、表达共鸣或质疑。\n"
            f"\n**该场景评论参考**：\n{comments_str}\n"
            f"{content_data}\n"
            f"生成评论时要口语化、具体、有不同立场，禁止模板化和AI味。"
        )
    if agent_type == "judge":
        w_str = "、".join(f"{k}({v:.1%})" for k, v in sorted(w.items(), key=lambda x: -x[1]))
        viral_str = " / ".join(f'"{t}"' for t in viral[:3])
        return (
            f"\n\n## 视频号数据驱动评分标准（{cn}，{bl['sample_size']}条模拟基线）\n"
            f"- 评分权重优先级：{w_str}\n"
            f"- 基线对比：平均互动{bl['avg_engagement']:,}，中位数{bl['median']:,}，高表现线{bl['viral_threshold']:,}\n"
            f"\n**该场景高表现标题参考**：\n{viral_str}\n"
            f"{content_data}\n"
            f"- optimized_title 要适合视频号熟人转发：清楚、可信、有场景、有钩子。\n"
            f"- optimized_content 要适合视频号口播/发布文案：先给价值，再讲证据，最后给自然互动动作。\n"
            f"- 请严格输出 title_hook、cover_click、script_retention、interaction_share、positioning_fit 五维评分。"
        )
    return ""
