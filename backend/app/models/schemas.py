"""
Pydantic 请求 / 响应模型
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DiagnoseRequest(BaseModel):
    """诊断请求体"""
    platform: str = "wechat_channels"
    title: str
    content: str = ""
    category: str
    tags: list[str] = Field(default_factory=list)
    cover_image_url: Optional[str] = None


class AgentOpinion(BaseModel):
    """单个 Agent 的诊断意见"""
    agent_name: str
    dimension: str
    score: float
    issues: list[str]
    suggestions: list[str]
    reasoning: str
    debate_comments: list[str] = Field(default_factory=list)


class SimulatedComment(BaseModel):
    """AI模拟评论"""
    username: str
    avatar_emoji: str
    comment: str
    sentiment: str


class DebateEntry(BaseModel):
    """辩论时间线中的单条记录"""
    round: int
    agent_name: str
    kind: str
    text: str


class CoverDirection(BaseModel):
    """封面方向建议"""
    layout: str = ""
    color_scheme: str = ""
    text_style: str = ""
    tips: list[str] = Field(default_factory=list)


class AlgorithmChainItem(BaseModel):
    """平台推送链路诊断项"""
    stage: str
    label: str
    score: float
    status: str
    reason: str
    suggestion: str


class WorkflowTraceItem(BaseModel):
    """NoteRx 会诊工作流项"""
    stage: str
    label: str
    status: str
    description: str


class ContentReferenceGroup(BaseModel):
    """平台内容数据参考分组"""
    label: str
    items: list[str] = Field(default_factory=list)


class ContentProfile(BaseModel):
    """平台/场景内容参考库"""
    platform: str
    category: str
    category_label: str
    data_scope: str
    reference_count: int
    sample_titles: list[str] = Field(default_factory=list)
    hook_patterns: list[str] = Field(default_factory=list)
    comment_patterns: list[str] = Field(default_factory=list)
    content_formulas: list[str] = Field(default_factory=list)
    metric_focus: list[str] = Field(default_factory=list)
    keyword_packs: list[ContentReferenceGroup] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)


class ReuseAction(BaseModel):
    """报告复用动作"""
    label: str
    text: str


class DiagnoseResponse(BaseModel):
    """诊断报告响应体"""
    platform: str = "wechat_channels"
    diagnosis_method: str = "noterx_multi_agent"
    overall_score: float
    grade: str
    summary_conclusion: Optional[str] = None
    first_action: Optional[str] = None
    biggest_weakness: Optional[str] = None
    comment_prompts: list[str] = Field(default_factory=list)
    publish_checklist: list[str] = Field(default_factory=list)
    reuse_actions: list[ReuseAction] = Field(default_factory=list)
    radar_data: dict
    agent_opinions: list[AgentOpinion]
    issues: list[dict]
    suggestions: list[dict]
    debate_summary: str
    debate_timeline: list[DebateEntry] = Field(default_factory=list)
    simulated_comments: list[SimulatedComment]
    optimized_title: Optional[str] = None
    optimized_content: Optional[str] = None
    cover_direction: Optional[CoverDirection] = None
    algorithm_chain: list[AlgorithmChainItem] = Field(default_factory=list)
    workflow_trace: list[WorkflowTraceItem] = Field(default_factory=list)
    content_profile: Optional[ContentProfile] = None


# --------------- 历史记录 ---------------

class HistoryCreateRequest(BaseModel):
    """保存诊断历史"""
    title: str
    category: str
    platform: str = "wechat_channels"
    report: dict


class HistoryListItem(BaseModel):
    """历史列表项（不含完整报告）"""
    id: str
    title: str
    category: str
    platform: str = "wechat_channels"
    overall_score: float
    grade: str
    created_at: str


class HistoryDetail(BaseModel):
    """历史详情（含完整报告）"""
    id: str
    title: str
    category: str
    platform: str = "wechat_channels"
    overall_score: float
    grade: str
    created_at: str
    report: dict
