"""
标题与脚本留存 Agent
分析视频号标题、简介、开头3秒、口播脚本和结尾互动。
"""
import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.content_agent import SYSTEM_PROMPT
from app.platforms.content_data import build_content_data_summary


class ContentAgent(BaseAgent):
    """分析视频号作品的标题与脚本留存。"""

    agent_name = "标题脚本专家"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        content: str,
        category: str,
        title_analysis: dict,
        content_analysis: dict,
        baseline_comparison: dict,
        script: str = "",
        opening_hook: str = "",
        publish_time: str = "",
        metrics: dict | None = None,
    ) -> str:
        """构建包含视频号作品内容和分析数据的消息。"""
        comparisons = baseline_comparison.get("comparisons", {})
        metrics = metrics or {}
        content_data = build_content_data_summary("wechat_channels", category, agent_type="content", max_items=3)

        return f"""## 待诊断视频号作品
- **视频号垂类**: {category}
- **标题**: {title}
- **简介/发布文案**: {content if content else '（未填写）'}
- **开头3秒**: {opening_hook if opening_hook else '（未填写）'}
- **脚本/口播稿**: {script if script else '（未填写）'}
- **计划/实际发布时间**: {publish_time if publish_time else '（未填写）'}
- **运营数据**: {json.dumps(metrics, ensure_ascii=False) if metrics else '（未填写）'}

## 标题分析数据
- 字数: {title_analysis.get('length', 0)}
- 关键词: {json.dumps(title_analysis.get('keywords', []), ensure_ascii=False)}
- 情绪词: {json.dumps(title_analysis.get('emotion_words', []), ensure_ascii=False)}
- 钩子数量: {title_analysis.get('hook_count', 0)}

## 文案/脚本分析数据
- 字数: {content_analysis.get('length', 0)}
- 段落数: {content_analysis.get('paragraph_count', 0)}
- 平均句长: {content_analysis.get('avg_sentence_length', 0)}
- 可读性评分: {content_analysis.get('readability_score', 0)}
- 信息密度: {content_analysis.get('info_density', 0)}

## Baseline对比（{category}垂类）
- 该垂类爆款平均标题字数: {comparisons.get('title_length', {}).get('viral_avg', 'N/A')}
- 该垂类平均标题字数: {comparisons.get('title_length', {}).get('category_avg', 'N/A')}
- 标题字数判定: {comparisons.get('title_length', {}).get('verdict', 'N/A')}
{content_data}

请基于视频号生态给出标题、开头3秒、脚本留存和结尾互动的专业诊断。"""

    async def diagnose(self, **kwargs) -> dict:
        """执行内容诊断。"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
