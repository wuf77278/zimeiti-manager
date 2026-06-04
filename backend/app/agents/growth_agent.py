"""
视频号增长策略 Agent
分析发布时间、互动转发、私域承接和账号定位。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.growth_agent import SYSTEM_PROMPT
from app.platforms.content_data import build_content_data_summary


class GrowthAgent(BaseAgent):
    """分析视频号作品的增长策略。"""

    agent_name = "视频号增长专家"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        content: str,
        category: str,
        tags: list[str],
        baseline_comparison: dict,
        script: str = "",
        opening_hook: str = "",
        publish_time: str = "",
        metrics: dict | None = None,
    ) -> str:
        """构建包含运营数据和传播场景的消息。"""
        comparisons = baseline_comparison.get("comparisons", {})
        best_hours = comparisons.get("best_publish_hours", [])
        viral_rate = comparisons.get("viral_rate", 0)
        tag_rel = comparisons.get("tag_relevance", {})
        metrics = metrics or {}
        content_data = build_content_data_summary("wechat_channels", category, agent_type="growth", max_items=3)

        return f"""## 待诊断视频号作品
- **视频号垂类**: {category}
- **标题**: {title}
- **简介/发布文案**: {content[:300] if content else '（未填写）'}
- **开头3秒**: {opening_hook if opening_hook else '（未填写）'}
- **脚本/口播稿摘要**: {script[:600] if script else '（未填写）'}
- **话题/标签**: {json.dumps(tags, ensure_ascii=False)}
- **计划/实际发布时间**: {publish_time if publish_time else '（未填写）'}
- **运营数据**: {json.dumps(metrics, ensure_ascii=False) if metrics else '（未填写）'}

## Baseline与运营参考
- 该垂类互动较高时段: {best_hours}
- 该垂类历史爆款率: {viral_rate}%
- 命中参考热词/话题: {json.dumps(tag_rel.get('matched_hot_tags', []), ensure_ascii=False)}
- 参考Top话题: {json.dumps(tag_rel.get('top_tags_in_category', []), ensure_ascii=False)}
{content_data}

请重点判断这条作品是否适合被转发到朋友圈、微信群、客户群或家庭成员之间，并给出发布、互动、转发和私域承接建议。"""

    async def diagnose(self, **kwargs) -> dict:
        """执行增长策略诊断。"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
