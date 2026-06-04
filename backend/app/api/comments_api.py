"""
模拟评论生成 API
使用 flash 模型快速生成更多评论、回复和争论。
"""
import json
import logging
from pydantic import BaseModel
from fastapi import APIRouter

from app.agents.base_agent import BaseAgent, MODEL_FAST

router = APIRouter()
logger = logging.getLogger("videorx.comments")

COMMENT_PROMPT = """你是微信视频号评论区模拟器。模拟真实视频号作品在信息流、朋友圈转发和微信群扩散后的评论。

## 核心规则：禁止AI味
- 不要用"非常""建议""值得"这类书面词
- 用真实微信用户的说话方式：短句、口语、生活化、有熟人语境
- 评论要像来自民宿业主、酒店投资人、企业行政负责人、老板、同事、客户或普通观众

## 评论风格参考
短评："这个有用" / "我家也这样" / "转给我妈了" / "说到点上了" / "收藏了晚上看"
中评："前面这句可以更直接点，不然我可能就划走了" / "这个适合发客户群，别太像广告就行"
长评："我之前也试过类似方法，真正有用的是最后那个场景，但是开头如果先说结果会更想看完。"
质疑："这是不是有点夸张" / "感觉还是要看行业吧" / "讲得对但案例少了点"
群聊感："@老王 你上次说的不就是这个接待区问题" / "这个可以给老板看看"

## 昵称风格
必须像真实微信/视频号用户：如"民宿老板阿峰""老王在改办公室""项目咨询中""空间项目负责人""认真看完了""行政小陈""做企业号的阿明"

## 必须满足
1. 40%短评(5-12字)、30%中评(15-40字)、30%长评(40-100字)
2. 至少1条质疑/吐槽（不是所有人都夸）
3. 至少2条有回复（模拟楼中楼讨论）
4. 每条评论带字段：username, comment, sentiment, likes(数字0-999), time_ago(如"3小时前""昨天""2天前"), ip_location(如"北京""广东""浙江""四川")
5. 可以有1条标记 is_author:true 的作者回复

## JSON格式
{"comments":[{"username":"昵称","comment":"内容","sentiment":"positive/negative/neutral","likes":数字,"time_ago":"时间","ip_location":"省份","is_author":false,"replies":[同结构]}]}

生成5-6条主评论，2-3条有回复。"""


class GenerateCommentsRequest(BaseModel):
    title: str
    content: str = ""
    category: str = "food"
    existing_count: int = 0


@router.post("/generate-comments")
async def generate_comments(req: GenerateCommentsRequest):
    """用 flash 模型快速生成更多模拟评论"""
    category_names = {
        "hospitality_design": "民宿酒店设计",
        "office_design": "办公空间设计",
        "case_study": "设计案例复盘",
        "owner_education": "业主避坑/设计科普",
        "local": "民宿酒店设计",
        "knowledge": "业主避坑/设计科普",
        "emotion": "项目故事",
        "enterprise": "办公空间设计",
        "shop": "设计咨询",
        "ip": "设计公司账号",
        "food": "民宿酒店设计",
        "lifestyle": "设计案例复盘",
        "tech": "办公空间设计",
    }
    cat_cn = category_names.get(req.category, req.category)

    user_msg = f"""视频号作品信息：
- 场景：{cat_cn}
- 标题：{req.title}
- 发布文案/口播稿：{req.content[:300] if req.content else '（无发布文案或口播稿）'}

已有 {req.existing_count} 条评论，请生成新的、不重复的评论。
如果已有评论较多，可以生成一些更有争议性的评论和激烈的回复。"""

    agent = BaseAgent(model=MODEL_FAST)
    agent.system_prompt = COMMENT_PROMPT
    result = await agent.call_llm(user_msg, max_tokens=2000)

    result.pop("_meta", None)
    comments = result.get("comments", [])

    formatted = []
    for c in comments:
        if not isinstance(c, dict):
            continue
        replies = []
        for r in c.get("replies", []):
            if isinstance(r, dict):
                replies.append({
                    "username": r.get("username", "视频号用户"),
                    "comment": r.get("comment", ""),
                    "sentiment": r.get("sentiment", "neutral"),
                    "likes": int(r.get("likes", 0)) if r.get("likes") is not None else 0,
                    "time_ago": r.get("time_ago", "刚刚"),
                    "ip_location": r.get("ip_location", ""),
                    "is_author": bool(r.get("is_author", False)),
                })
        formatted.append({
            "username": c.get("username", "视频号用户"),
            "comment": c.get("comment", ""),
            "sentiment": c.get("sentiment", "neutral"),
            "likes": int(c.get("likes", 0)) if c.get("likes") is not None else 0,
            "time_ago": c.get("time_ago", "刚刚"),
            "ip_location": c.get("ip_location", ""),
            "is_author": bool(c.get("is_author", False)),
            "replies": replies,
        })

    return {"comments": formatted}
