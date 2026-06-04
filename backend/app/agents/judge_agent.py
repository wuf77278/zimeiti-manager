"""
综合裁判 Agent
汇总各 Agent 观点，处理分歧，输出最终视频号优化报告。
"""
from __future__ import annotations

import json
import os

from app.agents.base_agent import BaseAgent
from app.agents.prompts.judge_agent import SYSTEM_PROMPT
from app.platforms.content_data import build_content_data_summary


class JudgeAgent(BaseAgent):
    """综合裁判，生成最终诊断报告。"""

    agent_name = "视频号综合裁判"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        category: str,
        agent_opinions: list[dict],
        debate_records: list[dict] | None = None,
        content: str = "",
        script: str = "",
        opening_hook: str = "",
        publish_time: str = "",
        metrics: dict | None = None,
    ) -> str:
        """汇总所有 Agent 意见。"""
        opinions_text = ""
        for i, op in enumerate(agent_opinions, 1):
            opinions_text += f"""
### Agent {i}: {op.get('agent_name', 'Unknown')}
- **维度**: {op.get('dimension', '')}
- **评分**: {op.get('score', 0)}
- **问题**: {json.dumps(op.get('issues', []), ensure_ascii=False)}
- **建议**: {json.dumps(op.get('suggestions', []), ensure_ascii=False)}
- **推理**: {op.get('reasoning', '')}
"""

        debate_text = ""
        if debate_records:
            debate_text = "\n## 辩论记录\n"
            for record in debate_records:
                debate_text += f"""
**{record.get('agent_name', '')}的辩论意见:**
- 同意: {json.dumps(record.get('agreements', []), ensure_ascii=False)}
- 反对: {json.dumps(record.get('disagreements', []), ensure_ascii=False)}
- 补充: {json.dumps(record.get('additions', []), ensure_ascii=False)}
"""

        metrics = metrics or {}
        content_data = build_content_data_summary("wechat_channels", category, agent_type="judge", max_items=3)
        return f"""## 待综合判定的视频号作品
- **视频号垂类**: {category}
- **标题**: {title}
- **简介/发布文案**: {content if content else '（未填写）'}
- **开头3秒**: {opening_hook if opening_hook else '（未填写）'}
- **脚本/口播稿摘要**: {script[:800] if script else '（未填写）'}
- **计划/实际发布时间**: {publish_time if publish_time else '（未填写）'}
- **运营数据**: {json.dumps(metrics, ensure_ascii=False) if metrics else '（未填写）'}

## 各Agent诊断意见
{opinions_text}
{debate_text}
{content_data}

请综合以上所有Agent的意见和辩论记录，给出最终的视频号优化诊断报告。"""

    async def diagnose(self, **kwargs) -> dict:
        """执行综合裁判（使用更高 token 限额）。"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(
            msg,
            max_tokens=int(os.getenv("JUDGE_MAX_COMPLETION_TOKENS", "6144")),
        )
