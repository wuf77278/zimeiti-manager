"""
用户模拟 Agent
模拟视频号观众在微信生态中的第一反应和评论。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.user_sim_agent import SYSTEM_PROMPT
from app.platforms.content_data import build_content_data_summary


class UserSimAgent(BaseAgent):
    """模拟目标观众的反应和评论。"""

    agent_name = "观众模拟专家"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        content: str,
        category: str,
        tags: list[str],
        script: str = "",
        opening_hook: str = "",
        publish_time: str = "",
        metrics: dict | None = None,
    ) -> str:
        """构建完整视频号作品内容供模拟。"""
        category_names = {
            "local": "本地生活",
            "knowledge": "知识科普",
            "emotion": "情感口播",
            "enterprise": "企业号",
            "shop": "带货",
            "ip": "个人IP",
            "food": "美食/本地生活",
            "lifestyle": "生活方式",
            "tech": "知识科普",
        }
        cat_cn = category_names.get(category, category)
        metrics = metrics or {}
        content_data = build_content_data_summary("wechat_channels", category, agent_type="user_sim", max_items=3)

        return f"""## 待模拟的视频号作品
- **视频号垂类**: {cat_cn}
- **标题**: {title}
- **话题/标签**: {json.dumps(tags, ensure_ascii=False)}
- **简介/发布文案**:
{content if content else '（未填写）'}
- **开头3秒**: {opening_hook if opening_hook else '（未填写）'}
- **脚本/口播稿**:
{script if script else '（未填写）'}
- **计划/实际发布时间**: {publish_time if publish_time else '（未填写）'}
- **运营数据**: {json.dumps(metrics, ensure_ascii=False) if metrics else '（未填写）'}
{content_data}

请模拟微信视频号用户、朋友圈/微信群接收者、同城或私域用户看到这条{cat_cn}作品后的反应，并生成真实评论区。"""

    async def diagnose(self, **kwargs) -> dict:
        """执行用户模拟。"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
