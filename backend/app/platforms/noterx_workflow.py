"""Shared NoteRx-style diagnosis workflow descriptors."""
from __future__ import annotations

from typing import Any


PLATFORM_LABELS = {
    "douyin": "抖音号",
    "wechat_channels": "微信视频号",
}


def build_noterx_workflow_trace(platform: str) -> list[dict[str, Any]]:
    """Return the explicit NoteRx diagnosis chain adapted to the platform."""
    platform_label = PLATFORM_LABELS.get(platform, platform)
    if platform == "douyin":
        agents = "秒停留、完播、设计字段、线索承接 4 个抖音专家 Agent"
        baseline = "账号历史作品、运营数据与爆款代理基线"
        judge = "JudgeAgent 汇总抖音推送链路、设计素材结构和线索目标"
    else:
        agents = "标题脚本、封面视觉、增长运营、观众模拟 4 个视频号专家 Agent"
        baseline = "视频号同场景内容、运营指标与可观察推送信号"
        judge = "JudgeAgent 汇总视频号信息流、决策转发和项目初诊承接"

    return [
        {
            "stage": "formdata_submit",
            "label": "素材填写/上传",
            "status": "done",
            "description": f"前端将{platform_label}标题、正文、脚本、运营数据、图片和视频打包为 FormData。",
        },
        {
            "stage": "stream_api",
            "label": "流式诊断接口",
            "status": "done",
            "description": "提交到平台专属 stream API，实时返回解析、专家诊断、辩论和裁判进度。",
        },
        {
            "stage": "parse_material",
            "label": "素材解析",
            "status": "done",
            "description": "后端解析文本、图片、视频首帧/视频理解结果和用户填写的运营数据。",
        },
        {
            "stage": "baseline_compare",
            "label": "本地 baseline 对比",
            "status": "done",
            "description": f"结合{baseline}，先形成平台化预评分和可解释短板。",
        },
        {
            "stage": "agent_round",
            "label": "专家 Agent 独立诊断",
            "status": "done",
            "description": f"{agents}分别给出评分、问题、建议和判断依据。",
        },
        {
            "stage": "agent_debate",
            "label": "Agent 互相辩论",
            "status": "done",
            "description": "各 Agent 围绕彼此结论进行赞同、反驳和补充，暴露单一视角的盲区。",
        },
        {
            "stage": "judge_summary",
            "label": "JudgeAgent 最终汇总",
            "status": "done",
            "description": f"{judge}，生成最终报告、雷达图、优化建议、模拟评论和分享卡片素材。",
        },
    ]
