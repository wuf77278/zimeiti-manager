"""Operation console business logic."""
from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlencode, urlsplit, urlunsplit
from uuid import uuid4

from app.config import (
    effective_publisher_run_mode,
    publisher_execution_enabled,
    requested_publisher_run_mode,
    social_auto_upload_enabled,
)
from app.ops.models import (
    Account,
    AccountBrowserUpdateRequest,
    AccountDiagnoseRequest,
    AccountDiagnosisAgentOpinion,
    AccountDiagnosisAction,
    AccountDiagnosisDebateTurn,
    AccountDiagnosisDimension,
    AccountDiagnosisReport,
    AccountDiagnosisStage,
    AccountMemory,
    AccountMemoryUpdateRequest,
    AccountMetricCollectRequest,
    AccountMetricSnapshotRequest,
    AccountProfileSyncRequest,
    AgentClient,
    AgentClientCreateRequest,
    AgentClientUpdateRequest,
    AgentManifest,
    AgentPlan,
    AgentToolDefinition,
    AgentToolCallLog,
    AgentToolInvokeResponse,
    Asset,
    ContentIdea,
    ContentPattern,
    CreatorCoachReport,
    CreatorCoachRequest,
    CreatorComment,
    CreatorCommentDraftReplyRequest,
    CreatorCommentDraftReplyResponse,
    CreatorCommentReplyActionRequest,
    CreatorCommentReplyActionResponse,
    CreatorDataSyncRequest,
    CreatorDataSyncResponse,
    CreatorPost,
    CreatorProfile,
    DirectMessageAlert,
    DirectMessageCheckRequest,
    DirectMessageCheckResponse,
    DirectMessageEventRequest,
    DirectMessageMonitor,
    DirectMessageMonitorUpdateRequest,
    DirectMessageSource,
    DiagnosisActionApplyRequest,
    DiagnosisImportRequest,
    DiagnosisImportResponse,
    ExecutionLog,
    MetricSnapshot,
    MetricCollectionJob,
    OperationsDb,
    Platform,
    PlatformDraft,
    PublishingAgentRun,
    PublishingAgentRunRequest,
    PublishTask,
    RuntimeState,
    SystemProxyState,
    ViralContentCreateRequest,
    ViralContentItem,
    ViralContentSeedRequest,
    ViralContentToAssetRequest,
    ViralContentToAssetResponse,
    WorkspaceOpenResponse,
)
from app.platforms.content_data import get_platform_content_profile
from app.ops.social_auto_upload import (
    check_social_auto_upload_session,
    get_social_auto_upload_state,
    run_social_auto_upload_task,
    social_auto_upload_account_name,
    SocialAutoUploadError,
    SocialAutoUploadUnavailable,
    SocialAutoUploadUnsupported,
)


PLATFORM_LABELS: dict[Platform, str] = {
    "douyin": "抖音",
    "xiaohongshu": "小红书",
    "wechat_channels": "视频号",
}

PLATFORM_ENTRY_URLS: dict[Platform, str] = {
    "douyin": "https://creator.douyin.com/",
    "xiaohongshu": "https://creator.xiaohongshu.com/",
    "wechat_channels": "https://channels.weixin.qq.com/",
}

XHS_REFERENCE = {
    "suffix": "设计案例拆解版",
    "body": "正文按问题、设计动作、预算边界、前后对比和适合人群拆开写，封面突出真实空间结果。",
    "options": {"noteStyle": "experience", "coverPriority": True, "riskCheck": "avoid_overclaim"},
    "keywords": ["设计案例", "预算避坑", "适合谁", "平面图", "前后对比", "空间改造"],
}

DIRECT_MESSAGE_PLATFORMS: set[Platform] = {"douyin", "wechat_channels"}
ACCOUNT_DIAGNOSIS_PLATFORMS: set[Platform] = {"douyin", "xiaohongshu", "wechat_channels"}

EXTERNAL_DIAGNOSIS_SKILLS = [
    {
        "name": "LangChain Social Media Agent",
        "source": "github.com/langchain-ai/social-media-agent",
        "focus": "内容报告 / 选题复盘",
    },
    {
        "name": "pysentimiento",
        "source": "github.com/pysentimiento/pysentimiento",
        "focus": "评论情绪 / 文本信号",
    },
    {
        "name": "SocialPulse",
        "source": "github.com/birkelbachs/SocialPulse",
        "focus": "话题趋势 / 社区洞察",
    },
    {
        "name": "Postiz",
        "source": "github.com/gitroomhq/postiz-app",
        "focus": "开源发布系统参考",
    },
]

CONTENT_PATTERN_LIBRARY: list[ContentPattern] = [
    ContentPattern(
        key="result_first",
        title="结果前置型",
        goal="线索",
        suitablePlatforms=["douyin", "wechat_channels"],
        bestFor="适合有真实完工、改造前后对比、平面图或关键空间结果的设计账号。",
        titleFormula="改造结果 + 空间类型 + 适合谁/项目条件",
        hookTemplate="先把改完后的结果给出来：{pillar}真正改变的是这一个空间问题。",
        scriptStructure=["3 秒改造结果", "原始问题", "设计动作", "预算/边界", "评论承接"],
        coverSuggestion="封面放前后对比、平面图或完工实景，不放抽象口号。",
        commentStrategy="引导评论关键词领取方案清单、预算边界或项目初诊。",
        reuseSignal="3 秒留存、完播率和项目咨询评论同步上升。",
    ),
    ContentPattern(
        key="avoid_pitfall",
        title="设计避坑型",
        goal="信任",
        suitablePlatforms=["douyin", "xiaohongshu", "wechat_channels"],
        bestFor="适合讲民宿酒店和办公空间在预算、材料、动线、施工落地上的真实坑。",
        titleFormula="不要直接做 X，先看这 N 个设计坑",
        hookTemplate="{pillar}最容易踩坑的地方不是风格，而是项目条件没先判断。",
        scriptStructure=["常见误区", "真实后果", "判断标准", "替代做法"],
        coverSuggestion="封面突出“设计避坑”“预算边界”“别先做”，配真实空间图。",
        commentStrategy="让用户留言面积、预算、房型或办公人数，后续按项目做分层建议。",
        reuseSignal="收藏率、长评论和项目初诊线索提升。",
    ),
    ContentPattern(
        key="comparison",
        title="方案对比型",
        goal="转化",
        suitablePlatforms=["douyin", "xiaohongshu"],
        bestFor="适合同一项目里比较两版平面方案、预算取舍、材料选择或风格方向。",
        titleFormula="A 方案和 B 方案怎么选？适合谁一眼看懂",
        hookTemplate="如果你是{audience}，{pillar}这两个方案不要只看哪一个更好看。",
        scriptStructure=["项目条件", "两版方案差异", "适合/不适合", "最终建议"],
        coverSuggestion="左右对比，放平面图、预算或关键空间指标。",
        commentStrategy="评论区设置“面积/预算/房型/人数”等关键词。",
        reuseSignal="私信咨询、主页访问和有效项目线索提升。",
    ),
    ContentPattern(
        key="case_breakdown",
        title="设计案例拆解型",
        goal="专业",
        suitablePlatforms=["douyin", "wechat_channels", "xiaohongshu"],
        bestFor="适合展示民宿酒店、办公空间、企业展厅等项目的方法论和落地结果。",
        titleFormula="一个真实空间案例：从问题到设计动作",
        hookTemplate="这个案例看起来只是变好看，但真正变好的原因是{pillar}。",
        scriptStructure=["项目背景", "关键问题", "设计动作", "落地边界", "结果复盘"],
        coverSuggestion="封面放前后变化、平面图或案例关键词。",
        commentStrategy="引导用户提交同类空间问题做下一期拆解。",
        reuseSignal="长评论、客户转发和收藏增加。",
    ),
    ContentPattern(
        key="question_answer",
        title="业主问题回答型",
        goal="互动",
        suitablePlatforms=["douyin", "xiaohongshu", "wechat_channels"],
        bestFor="适合评论区有预算、面积、工期、风格、房型或办公人数等高频问题的账号。",
        titleFormula="业主问：X 到底要不要做？",
        hookTemplate="这个问题我建议你先看自己的{pillar}条件，再决定。",
        scriptStructure=["复述问题", "判断条件", "设计建议", "评论追问"],
        coverSuggestion="用问句做封面，保留一个明确关键词。",
        commentStrategy="把评论问题沉淀成下一条选题来源。",
        reuseSignal="评论率和二次互动明显高于账号均值。",
    ),
    ContentPattern(
        key="daily_record",
        title="项目过程型",
        goal="关系",
        suitablePlatforms=["xiaohongshu", "wechat_channels"],
        bestFor="适合展示量房、汇报、选材、施工跟进、完工交付等真实项目过程。",
        titleFormula="今天处理了一个设计细节，很适合 X 参考",
        hookTemplate="今天这个细节，反而最能说明{pillar}为什么要先做判断。",
        scriptStructure=["项目现场", "关键细节", "设计判断", "轻 CTA"],
        coverSuggestion="使用真实现场、材料、图纸或汇报画面，文案短而具体。",
        commentStrategy="引导用户分享自己的空间条件，降低销售感。",
        reuseSignal="关注率、完读率和客户转发提升。",
    ),
    ContentPattern(
        key="search_guide",
        title="设计搜索攻略型",
        goal="搜索",
        suitablePlatforms=["xiaohongshu", "douyin"],
        bestFor="适合民宿设计、酒店设计、办公室设计、预算清单、改造流程等搜索意图明确的内容。",
        titleFormula="X 攻略：预算/步骤/注意事项一次讲清",
        hookTemplate="如果你正在搜{pillar}，先看这三个设计判断标准。",
        scriptStructure=["适用项目", "步骤清单", "预算/工期", "避坑提醒"],
        coverSuggestion="封面放核心关键词和空间类型，避免只有情绪词。",
        commentStrategy="评论关键词领取预算表、改造清单或初诊表。",
        reuseSignal="搜索曝光、收藏和主页咨询率上升。",
    ),
]

TRACK_LABELS = {
    "hospitality_design": "民宿酒店设计",
    "office_design": "办公空间设计",
    "case_study": "设计案例复盘",
    "owner_education": "业主避坑/设计科普",
}

VIRAL_CONTENT_LIBRARY: list[dict[str, Any]] = [
    {
        "platform": "douyin",
        "track": "hospitality_design",
        "title": "老民宿改造前，先看这 5 个会影响入住体验的位置",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 48,
        "hotScore": 94,
        "playCount": 680000,
        "likeCount": 26000,
        "commentCount": 920,
        "shareCount": 1700,
        "saveCount": 5200,
        "hook": "第一秒给改造后实景，再切回改造前房型问题。",
        "structure": ["改造后结果", "原始房型痛点", "5 个设计动作", "预算边界", "评论关键词领取清单"],
        "visualNotes": ["前后对比分屏", "平面图局部放大", "用箭头标动线问题"],
        "commentSignals": ["预算多少", "这种房型能不能改", "想看完整清单"],
        "reusableAngles": ["老房改造", "房型优化", "低预算先后顺序"],
        "riskNotes": ["不能承诺保证入住率", "需区分效果图和实景"],
        "tags": ["民宿设计", "房型优化", "前后对比", "预算避坑"],
        "adaptationTitle": "老民宿改造前，先检查这 5 个影响入住体验的位置",
        "adaptationScript": "开头先给完工后结果，再回到原始房型。按动线、采光、收纳、拍照点、卫浴体验拆解，每个动作说明适用条件和预算边界，结尾引导评论关键词领取民宿改造清单。",
    },
    {
        "platform": "douyin",
        "track": "hospitality_design",
        "title": "民宿房间不好卖，不一定是风格问题",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 38,
        "hotScore": 91,
        "playCount": 520000,
        "likeCount": 21000,
        "commentCount": 740,
        "shareCount": 1280,
        "saveCount": 4300,
        "hook": "用反常识开场，把“风格不好看”转成“空间问题没解决”。",
        "structure": ["反常识判断", "3 个空间原因", "案例证据", "不适合照搬的情况", "项目初诊入口"],
        "visualNotes": ["用字幕标出错误认知", "插入房间局部问题", "结尾放咨询表字段"],
        "commentSignals": ["我家也是采光差", "能不能看平面图", "预算有限先改哪"],
        "reusableAngles": ["风格误区", "经营结果与空间体验", "业主认知纠偏"],
        "riskNotes": ["只能说明设计逻辑，不能承诺经营结果"],
        "tags": ["酒店设计", "民宿改造", "空间诊断", "业主避坑"],
        "adaptationTitle": "民宿房间不好卖，不一定是风格问题",
        "adaptationScript": "第一句直接反常识：房间不好卖，不一定是风格问题。正文拆采光、动线、拍照点三个原因，用平面图或实景做证据，结尾让用户留言面积和预算做初步判断。",
    },
    {
        "platform": "douyin",
        "track": "office_design",
        "title": "办公室前台这样改，客户第一印象会更稳",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 42,
        "hotScore": 92,
        "playCount": 610000,
        "likeCount": 24000,
        "commentCount": 860,
        "shareCount": 2100,
        "saveCount": 4800,
        "hook": "先给前台改造后镜头，再指出原动线和品牌露出问题。",
        "structure": ["改造后前台", "原始接待问题", "动线/灯光/品牌三步改法", "施工边界", "预约初诊"],
        "visualNotes": ["客户视角走一遍动线", "前台前后对比", "品牌墙细节特写"],
        "commentSignals": ["我们公司前台也是这样", "适合多大面积", "预算区间能讲吗"],
        "reusableAngles": ["客户接待", "品牌第一印象", "前台动线"],
        "riskNotes": ["避免虚假客户背书", "不要夸大成交效果"],
        "tags": ["办公空间设计", "前台设计", "客户接待", "企业形象"],
        "adaptationTitle": "办公室前台这样改，客户第一印象会更稳",
        "adaptationScript": "开头展示改造后前台，从客户进门视角切入。正文讲原始问题、接待动线、品牌露出和灯光材料取舍，结尾承接面积、预算、工期三个咨询问题。",
    },
    {
        "platform": "douyin",
        "track": "office_design",
        "title": "会议区不好用，通常不是桌子买错了",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 35,
        "hotScore": 88,
        "playCount": 360000,
        "likeCount": 14500,
        "commentCount": 410,
        "shareCount": 760,
        "saveCount": 2600,
        "hook": "用问题纠偏开场，把家具问题转成空间分区和动线问题。",
        "structure": ["错误判断", "使用场景", "分区逻辑", "声光电细节", "评论答疑"],
        "visualNotes": ["会议室俯视图", "多人使用场景", "线缆/灯光/隔音细节"],
        "commentSignals": ["开放区旁边太吵", "小公司适合吗", "会议室要几个"],
        "reusableAngles": ["会议效率", "办公分区", "行政负责人痛点"],
        "riskNotes": ["不要把单一方案说成所有企业都适用"],
        "tags": ["会议区", "办公动线", "办公室设计", "设计避坑"],
        "adaptationTitle": "会议区不好用，通常不是桌子买错了",
        "adaptationScript": "第一句纠偏：会议区不好用，先别怪桌子。正文按使用频率、人数、隔音、展示设备和动线距离拆解，结尾引导用户留言办公人数和会议频率。",
    },
    {
        "platform": "wechat_channels",
        "track": "hospitality_design",
        "title": "做民宿改造前，这条可以先转给合伙人看",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 56,
        "hotScore": 90,
        "playCount": 180000,
        "likeCount": 8600,
        "commentCount": 310,
        "shareCount": 1900,
        "saveCount": 2600,
        "hook": "标题直接给转发对象，内容解决合伙人共同决策问题。",
        "structure": ["项目阶段", "合伙人分歧", "设计判断标准", "预算边界", "转发/初诊动作"],
        "visualNotes": ["口播配项目清单", "穿插平面图", "结尾放初诊问题表"],
        "commentSignals": ["我转给合伙人了", "预算表能发吗", "适合老房吗"],
        "reusableAngles": ["关系链转发", "合伙人决策", "项目初诊"],
        "riskNotes": ["不诱导分享，表达为适合转给具体决策人讨论"],
        "tags": ["视频号", "民宿改造", "合伙人决策", "项目初诊"],
        "adaptationTitle": "做民宿改造前，这条可以先转给合伙人看",
        "adaptationScript": "开头说明这条适合转给一起做项目的人。正文讲房型、客群、预算、施工四个判断标准，每段都给一个可讨论的问题，结尾承接项目初诊。",
    },
    {
        "platform": "wechat_channels",
        "track": "office_design",
        "title": "办公室要不要重装，老板和行政先看这 3 个信号",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 49,
        "hotScore": 93,
        "playCount": 220000,
        "likeCount": 9800,
        "commentCount": 360,
        "shareCount": 2400,
        "saveCount": 3100,
        "hook": "第一句点名老板和行政负责人，给他们一个转发讨论理由。",
        "structure": ["目标人群", "3 个重装信号", "不必重装的情况", "预算工期", "转发给决策人"],
        "visualNotes": ["办公室问题镜头", "清单式字幕", "老板/行政视角分镜"],
        "commentSignals": ["转给行政了", "我们就是会议室不够用", "工期多久"],
        "reusableAngles": ["老板决策", "行政痛点", "改造必要性判断"],
        "riskNotes": ["不制造焦虑，不把所有问题都导向重装"],
        "tags": ["视频号", "办公空间设计", "老板", "行政负责人"],
        "adaptationTitle": "办公室要不要重装，老板和行政先看这 3 个信号",
        "adaptationScript": "开头点名老板和行政。正文用客户接待、会议效率、员工动线三个信号判断是否需要改造，同时说明只做局部优化的情况，结尾引导转给项目决策人讨论。",
    },
    {
        "platform": "wechat_channels",
        "track": "case_study",
        "title": "一个真实办公空间案例，从接待动线开始拆",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 62,
        "hotScore": 89,
        "playCount": 150000,
        "likeCount": 7200,
        "commentCount": 280,
        "shareCount": 1400,
        "saveCount": 2300,
        "hook": "不用先讲风格，先讲客户进门后怎么走。",
        "structure": ["项目背景", "接待路径", "会议协作", "品牌展示", "结果复盘"],
        "visualNotes": ["用箭头画接待路径", "实景加平面图", "会议区前后对比"],
        "commentSignals": ["路径图很清楚", "适合客户来访多的公司", "想看施工周期"],
        "reusableAngles": ["案例拆解", "接待动线", "客户转发"],
        "riskNotes": ["客户案例公开前需要授权"],
        "tags": ["办公案例", "接待动线", "设计案例复盘", "视频号"],
        "adaptationTitle": "一个真实办公空间案例，从接待动线开始拆",
        "adaptationScript": "从客户进门路径开始拆案例，依次讲前台、等候区、会议区和品牌展示，不用过度渲染效果，用平面图和实景证明设计判断。",
    },
    {
        "platform": "wechat_channels",
        "track": "owner_education",
        "title": "民宿和酒店设计，预算最容易花错在这 3 个地方",
        "creatorName": "公开样本归纳",
        "sourceType": "public_research",
        "durationSeconds": 54,
        "hotScore": 87,
        "playCount": 130000,
        "likeCount": 6500,
        "commentCount": 240,
        "shareCount": 1050,
        "saveCount": 2900,
        "hook": "预算避坑比风格更容易触发收藏和转发。",
        "structure": ["预算误区", "3 个高风险位置", "正确判断顺序", "案例边界", "收藏清单"],
        "visualNotes": ["清单字幕", "材料和空间细节", "预算分配示意"],
        "commentSignals": ["预算表能发吗", "这条得收藏", "我之前就花错了"],
        "reusableAngles": ["预算避坑", "业主教育", "收藏型内容"],
        "riskNotes": ["预算区间需要说明城市、面积和材料前提"],
        "tags": ["预算避坑", "民宿设计", "酒店设计", "业主科普"],
        "adaptationTitle": "民宿和酒店设计，预算最容易花错在这 3 个地方",
        "adaptationScript": "开头说明预算不是越均匀越好。正文拆卫浴、拍照点、公区体验三个容易花错的位置，给判断标准和适用前提，结尾评论关键词领取预算清单。",
    },
]

MACOS_BROWSER_APPS = ("Google Chrome", "Chromium", "Microsoft Edge")
MACOS_BROWSER_BINARIES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
)
BROWSER_COMMANDS = ("google-chrome", "chromium", "chromium-browser", "microsoft-edge", "msedge")

AGENT_TOOL_SCHEMAS: list[AgentToolDefinition] = [
    AgentToolDefinition(
        name="ops.get_state",
        title="读取运营状态",
        description="读取账号、素材、草稿、任务、计划和指标快照。",
        readOnly=True,
        inputSchema={"type": "object", "properties": {}},
    ),
    AgentToolDefinition(
        name="ops.get_runtime",
        title="读取运行环境",
        description="读取发布运行模式、浏览器档案目录和平台入口。",
        readOnly=True,
        inputSchema={"type": "object", "properties": {}},
    ),
    AgentToolDefinition(
        name="ops.create_account",
        title="创建平台账号",
        description="创建一个抖音、小红书或视频号账号，并分配独立浏览器档案。",
        inputSchema={
            "type": "object",
            "required": ["platform", "displayName", "handle"],
            "properties": {
                "platform": {"type": "string", "enum": ["douyin", "xiaohongshu", "wechat_channels"]},
                "displayName": {"type": "string"},
                "handle": {"type": "string"},
                "authType": {"type": "string", "enum": ["browser_session", "oauth", "manual"], "default": "browser_session"},
                "profile": {"type": "string"},
                "dailyPublishLimit": {"type": "integer", "minimum": 1, "maximum": 20},
                "browserProxyEnabled": {"type": "boolean", "default": False},
                "browserProxyServer": {"type": "string", "description": "账号专属代理，例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"},
                "browserProxyBypassList": {"type": "string", "description": "Chrome 代理绕过列表，逗号分隔"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.open_workspace",
        title="打开独立浏览器窗口",
        description="使用账号专属浏览器档案打开对应平台创作者工作台。",
        requiresConfirmation=True,
        safetyNote="会在本机打开第三方平台页面并使用该账号的本地浏览器档案，但不会提交作品。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {"accountId": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.remember_session",
        title="标记登录已保存",
        description="把账号状态标记为已连接，用于表示当前独立浏览器档案已完成登录。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {"accountId": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.update_browser_settings",
        title="更新账号浏览器代理",
        description="更新账号专属浏览器的代理服务器和绕过列表。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "browserProxyEnabled": {"type": "boolean"},
                "browserProxyServer": {"type": "string"},
                "browserProxyBypassList": {"type": "string"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.update_account_memory",
        title="更新账号长期记忆",
        description="更新账号的目标人群、内容支柱、人设语气、转化目标、爆款/低效经验和风险禁区。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "targetAudience": {"type": "array", "items": {"type": "string"}},
                "contentPillars": {"type": "array", "items": {"type": "string"}},
                "conversionGoal": {"type": "string"},
                "personaTone": {"type": "string"},
                "highPerformingPatterns": {"type": "array", "items": {"type": "string"}},
                "lowPerformingPatterns": {"type": "array", "items": {"type": "string"}},
                "avoidTopics": {"type": "array", "items": {"type": "string"}},
                "commentStrategy": {"type": "string"},
                "privateDomainStrategy": {"type": "string"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.create_asset",
        title="创建视频资产",
        description="创建一条可分发到多平台的视频资产。",
        inputSchema={
            "type": "object",
            "required": ["titleBase", "descriptionBase", "videoUrl", "coverUrl", "durationSeconds"],
            "properties": {
                "contentType": {"type": "string", "enum": ["video", "article", "dynamic", "story"], "default": "video"},
                "titleBase": {"type": "string"},
                "descriptionBase": {"type": "string"},
                "videoUrl": {"type": "string"},
                "videoLocalPath": {"type": "string", "description": "上传到本地素材库后的视频文件绝对路径，用于浏览器自动上传"},
                "coverUrl": {"type": "string"},
                "coverLocalPath": {"type": "string", "description": "上传到本地素材库后的封面文件绝对路径"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "durationSeconds": {"type": "integer", "minimum": 1, "maximum": 3600},
                "owner": {"type": "string"},
                "copyrightStatus": {"type": "string", "enum": ["owned", "licensed", "unknown"], "default": "owned"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.generate_drafts",
        title="生成平台草稿",
        description="根据一条视频资产和账号列表生成多平台差异化草稿。",
        inputSchema={
            "type": "object",
            "required": ["assetId"],
            "properties": {
                "assetId": {"type": "string"},
                "accountIds": {"type": "array", "items": {"type": "string"}},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.create_task",
        title="创建发布任务",
        description="把一个平台草稿创建为发布任务。",
        inputSchema={
            "type": "object",
            "required": ["draftId"],
            "properties": {"draftId": {"type": "string"}, "scheduledAt": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.approve_task",
        title="审核发布任务",
        description="把待审核任务标记为已排期。",
        inputSchema={
            "type": "object",
            "required": ["taskId"],
            "properties": {"taskId": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.execute_task",
        title="执行发布任务",
        description="执行任务。默认 dry-run 只模拟发布；browser_prepare 只打开工作台；upload_prepare 校验本地视频并准备扩展桥接；social_auto_upload 调用本地 sau 执行抖音/小红书上传。",
        requiresConfirmation=True,
        safetyNote="执行真实上传必须显式开启 PUBLISHER_EXECUTION_ENABLED 和对应发布模式；upload_prepare 不静默点击最终发布。",
        inputSchema={
            "type": "object",
            "required": ["taskId"],
            "properties": {"taskId": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.create_agent_plan",
        title="生成 Agent 排期计划",
        description="根据当前账号和素材生成平台草稿与发布任务。",
        inputSchema={
            "type": "object",
            "properties": {"objective": {"type": "string"}},
        },
    ),
    AgentToolDefinition(
        name="ops.import_diagnosis",
        title="导入诊断到账号",
        description="把诊断报告中的优化标题和文案加入指定已登录账号，生成素材和平台草稿。",
        inputSchema={
            "type": "object",
            "required": ["accountId", "title"],
            "properties": {
                "accountId": {"type": "string"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "category": {"type": "string"},
                "sourceDiagnosisId": {"type": "string"},
                "score": {"type": "integer", "minimum": 0, "maximum": 100},
                "durationSeconds": {"type": "integer", "minimum": 1, "maximum": 3600},
                "createTask": {"type": "boolean"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.check_direct_messages",
        title="检测私信未读",
        description="检测抖音和视频号账号的私信未读状态；当前只记录未读数量和提醒事件。",
        requiresConfirmation=True,
        safetyNote="私信属于敏感通信数据。工具只记录未读数量，不保存联系人或正文内容。",
        inputSchema={
            "type": "object",
            "properties": {"accountIds": {"type": "array", "items": {"type": "string"}}},
        },
    ),
    AgentToolDefinition(
        name="ops.record_direct_message_event",
        title="写入私信提醒事件",
        description="供浏览器适配器、Webhook 或人工记录写入某个账号的私信未读数量。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "unreadCount": {"type": "integer", "minimum": 0, "maximum": 10000},
                "source": {"type": "string", "enum": ["browser_session", "official_api", "webhook", "manual"], "default": "manual"},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.record_account_metrics",
        title="写入账号算法快照",
        description="写入抖音或视频号账号的近 7 天运营指标和平台推荐算法信号，供账号诊断模型使用。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "source": {"type": "string", "enum": ["manual", "browser_session", "official_api", "webhook"], "default": "manual"},
                "periodDays": {"type": "integer", "minimum": 1, "maximum": 90, "default": 7},
                "followers": {"type": "integer", "minimum": 0},
                "plays": {"type": "integer", "minimum": 0},
                "likes": {"type": "integer", "minimum": 0},
                "comments": {"type": "integer", "minimum": 0},
                "shares": {"type": "integer", "minimum": 0},
                "threeSecondRetentionRate": {"type": "number", "minimum": 0, "maximum": 100},
                "completionRate": {"type": "number", "minimum": 0, "maximum": 100},
                "replayRate": {"type": "number", "minimum": 0, "maximum": 100},
                "followConversionRate": {"type": "number", "minimum": 0, "maximum": 100},
                "searchImpressionRate": {"type": "number", "minimum": 0, "maximum": 100},
                "localTrafficRate": {"type": "number", "minimum": 0, "maximum": 100},
                "socialShareRate": {"type": "number", "minimum": 0, "maximum": 100},
                "friendLikeRate": {"type": "number", "minimum": 0, "maximum": 100},
                "privateDomainClickRate": {"type": "number", "minimum": 0, "maximum": 100},
                "officialAccountClickRate": {"type": "number", "minimum": 0, "maximum": 100},
                "liveReservationRate": {"type": "number", "minimum": 0, "maximum": 100},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.collect_account_metrics",
        title="采集账号指标快照",
        description="为指定抖音或视频号账号创建一次指标采集任务。当前 simulated 适配器会生成模拟快照，browser_session/official_api 保留为真实采集接口。",
        requiresConfirmation=True,
        safetyNote="会读取账号级运营指标。当前不读取私信正文、联系人、密码或 Cookie；真实平台采集器接入前仅 simulated 会写入快照。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "source": {"type": "string", "enum": ["simulated", "browser_session", "official_api"], "default": "simulated"},
                "periodDays": {"type": "integer", "minimum": 1, "maximum": 90, "default": 7},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.generate_creator_coach",
        title="生成创作教练建议",
        description="基于账号长期记忆、平台指标和内容模式库，生成设计账号画像、推荐内容打法和下一条选题。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "focusGoal": {"type": "string", "description": "可选：线索、互动、转化、信任、搜索等目标"},
                "ideaCount": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.diagnose_account",
        title="诊断账号整体状态",
        description="读取指定抖音或视频号账号的登录档案、运营快照、草稿任务和私信未读信号，生成账号级诊断报告。",
        requiresConfirmation=True,
        safetyNote="会读取账号级运营数据和登录态，不读取私信正文、联系人或密码。",
        inputSchema={
            "type": "object",
            "required": ["accountId"],
            "properties": {
                "accountId": {"type": "string"},
                "readLoggedInWorkspace": {"type": "boolean", "default": True},
            },
        },
    ),
    AgentToolDefinition(
        name="ops.run_publishing_agent",
        title="运行内置发布 Agent",
        description="让系统内置 Agent 生成发布计划、创建草稿任务，并按模式推进审核或 dry-run/browser_prepare/upload_prepare/social_auto_upload 执行。",
        requiresConfirmation=True,
        safetyNote="执行模式仍遵守本地发布边界：dry-run 不提交真实平台；browser_prepare 只打开工作台；upload_prepare 不静默点击最终发布；social_auto_upload 只在显式开启后调用 sau。",
        inputSchema={
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "accountIds": {"type": "array", "items": {"type": "string"}},
                "assetIds": {"type": "array", "items": {"type": "string"}},
                "mode": {
                    "type": "string",
                    "enum": ["plan_only", "create_tasks", "approve_ready", "execute_ready"],
                    "default": "create_tasks",
                },
            },
        },
    ),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def add_hours(value: datetime, hours: int) -> str:
    return (value + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


def log(message: str, level: str = "info") -> ExecutionLog:
    return ExecutionLog(at=now_iso(), level=level, message=message)


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _safe_profile_part(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip())
    return normalized.strip("-")[:48] or "account"


def _normalize_proxy_server(value: str | None) -> str:
    proxy = (value or "").strip()
    if not proxy:
        return ""
    if re.search(r"\s", proxy):
        raise ValueError("proxy_server_must_not_contain_spaces")
    if "://" not in proxy:
        proxy = f"http://{proxy}"
    scheme = proxy.split("://", 1)[0].lower()
    if scheme not in {"http", "https", "socks4", "socks5"}:
        raise ValueError("unsupported_proxy_scheme")
    return proxy


def _normalize_proxy_bypass_list(value: str | None) -> str:
    parts = [
        item.strip()
        for item in re.split(r"[,;\n]+", value or "")
        if item.strip()
    ]
    return ",".join(parts[:100])


def _proxy_from_host_port(scheme: str, host: str | None, port: str | int | None) -> str:
    host_value = (str(host or "")).strip()
    port_value = (str(port or "")).strip()
    if not host_value or not port_value:
        return ""
    return _normalize_proxy_server(f"{scheme}://{host_value}:{port_value}")


def _parse_scutil_proxy(text: str) -> SystemProxyState:
    values: dict[str, str] = {}
    exceptions: list[str] = []
    collecting_exceptions = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("ExceptionsList"):
            collecting_exceptions = True
            continue
        if collecting_exceptions:
            if line == "}":
                collecting_exceptions = False
                continue
            match = re.match(r"\d+\s*:\s*(.+)", line)
            if match:
                exceptions.append(match.group(1).strip())
                continue
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip()

    proxy_server = ""
    source = ""
    if values.get("SOCKSEnable") == "1":
        proxy_server = _proxy_from_host_port("socks5", values.get("SOCKSProxy"), values.get("SOCKSPort"))
        source = "macOS SOCKS 系统代理"
    if not proxy_server and values.get("HTTPEnable") == "1":
        proxy_server = _proxy_from_host_port("http", values.get("HTTPProxy"), values.get("HTTPPort"))
        source = "macOS HTTP 系统代理"
    if not proxy_server and values.get("HTTPSEnable") == "1":
        proxy_server = _proxy_from_host_port("http", values.get("HTTPSProxy"), values.get("HTTPSPort"))
        source = "macOS HTTPS 系统代理"

    bypass_parts = [*exceptions]
    if values.get("ExcludeSimpleHostnames") == "1":
        bypass_parts.append("<local>")
    bypass_list = _normalize_proxy_bypass_list(",".join(bypass_parts))
    pac_url = values.get("ProxyAutoConfigURLString", "") if values.get("ProxyAutoConfigEnable") == "1" else ""
    if proxy_server:
        return SystemProxyState(
            detected=True,
            source=source,
            proxyServer=proxy_server,
            bypassList=bypass_list,
            pacUrl=pac_url,
            message="已读取本机系统代理，可填入账号浏览器代理。",
        )
    if pac_url:
        return SystemProxyState(
            detected=False,
            source="macOS PAC 自动代理",
            pacUrl=pac_url,
            bypassList=bypass_list,
            message="检测到 PAC 自动代理；当前账号浏览器代理请手动填写固定代理服务器。",
        )
    return SystemProxyState(
        detected=False,
        source="macOS 系统代理",
        bypassList=bypass_list,
        message="未检测到已启用的固定系统代理。",
    )


def get_system_proxy_state() -> SystemProxyState:
    """Read local system proxy settings without changing them."""

    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["scutil", "--proxy"],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
            if result.returncode == 0:
                return _parse_scutil_proxy(result.stdout)
        except Exception as exc:
            return SystemProxyState(
                detected=False,
                source="macOS 系统代理",
                message=f"读取系统代理失败：{exc}",
            )

    for name, scheme in (("ALL_PROXY", "socks5"), ("HTTPS_PROXY", "http"), ("HTTP_PROXY", "http")):
        value = os.getenv(name) or os.getenv(name.lower())
        if not value:
            continue
        try:
            return SystemProxyState(
                detected=True,
                source=f"环境变量 {name}",
                proxyServer=_normalize_proxy_server(value),
                bypassList=_normalize_proxy_bypass_list(os.getenv("NO_PROXY") or os.getenv("no_proxy")),
                message="已读取环境变量代理，可填入账号浏览器代理。",
            )
        except ValueError:
            continue

    return SystemProxyState(
        detected=False,
        source="system",
        message="未检测到本机固定代理。",
    )


def get_browser_profiles_dir() -> str:
    configured = os.getenv("PUBLISHER_BROWSER_PROFILES_DIR")
    if configured:
        return configured

    ops_data_path = os.getenv("OPS_DATA_PATH")
    if ops_data_path:
        return str(Path(ops_data_path).expanduser().parent / "browser-profiles")

    return str(Path.home() / ".zimeiti-manager" / "browser-profiles")


def resolve_browser_executable() -> str | None:
    configured = os.getenv("PUBLISHER_BROWSER_EXECUTABLE_PATH")
    if configured and Path(configured).exists():
        return configured

    for candidate in MACOS_BROWSER_BINARIES:
        if Path(candidate).exists():
            return candidate

    for command in BROWSER_COMMANDS:
        resolved = shutil.which(command)
        if resolved:
            return resolved

    return None


def _resolve_macos_browser_app() -> str | None:
    configured = os.getenv("PUBLISHER_BROWSER_APP")
    if configured:
        return configured

    for app_name in MACOS_BROWSER_APPS:
        if Path(f"/Applications/{app_name}.app").exists():
            return app_name

    return None


def get_runtime_state() -> RuntimeState:
    mode, blocked_reason = effective_publisher_run_mode()
    return RuntimeState(
        publisherRunMode=mode,
        requestedPublisherRunMode=requested_publisher_run_mode(),
        publisherExecutionEnabled=publisher_execution_enabled(),
        socialAutoUploadEnabled=social_auto_upload_enabled(),
        publisherModeBlockedReason=blocked_reason,
        browserHeadless=os.getenv("PUBLISHER_BROWSER_HEADLESS", "0") == "1",
        browserProfilesDir=get_browser_profiles_dir(),
        browserExecutablePath=resolve_browser_executable(),
        platformEntryUrls=PLATFORM_ENTRY_URLS,
        socialAutoUpload=get_social_auto_upload_state(),
    )


def ensure_account_browser_profile(account: Account) -> str:
    if not account.browserProfileDir:
        profile_name = f"{account.platform}-{_safe_profile_part(account.handle)}-{account.id[:8]}"
        account.browserProfileDir = str(Path(get_browser_profiles_dir()) / profile_name)

    Path(account.browserProfileDir).mkdir(parents=True, exist_ok=True)
    return account.browserProfileDir


def _design_memory(kind: str, updated_at: str) -> AccountMemory:
    if kind == "hospitality":
        return AccountMemory(
            targetAudience=["民宿业主", "酒店投资人", "文旅项目负责人"],
            contentPillars=["改造前后对比", "房型动线优化", "预算与回报边界", "入住体验细节"],
            conversionGoal="评论关键词承接设计方案、预算评估和项目咨询",
            personaTone="专业克制、结果前置、少形容多证据",
            highPerformingPatterns=["首帧展示改造后结果", "平面图/前后对比", "预算边界和设计理由说清楚"],
            lowPerformingPatterns=["只放效果图不讲问题", "过度承诺入住率或收益"],
            avoidTopics=["保证入住率", "无授权客户项目素材", "虚假完工案例", "绝对化投资回报"],
            commentStrategy="用关键词承接方案、预算、房型和改造避坑问题",
            privateDomainStrategy="评论关键词后进入人工项目初诊，不在正文强推站外联系方式",
            updatedAt=updated_at,
        )
    if kind == "office":
        return AccountMemory(
            targetAudience=["企业老板", "行政负责人", "品牌/人力负责人"],
            contentPillars=["办公室动线", "前台与会议区", "企业展厅", "施工落地边界"],
            conversionGoal="公众号案例、项目初诊和设计咨询预约",
            personaTone="稳重可信、适合客户转发、少夸张多依据",
            highPerformingPatterns=["用客户场景开头", "用平面图证明动线", "结尾给项目初诊动作"],
            lowPerformingPatterns=["只讲效果图不讲业务场景", "只展示漂亮空间不讲落地"],
            avoidTopics=["虚假客户背书", "过度营销", "保证成交或融资效果"],
            commentStrategy="评论区承接面积、预算、工期和接待场景问题",
            privateDomainStrategy="引导公众号案例或项目初诊预约，保留人工确认环节",
            updatedAt=updated_at,
        )
    return AccountMemory(
        targetAudience=["准备装修的民宿业主", "企业行政负责人", "品牌主理人"],
        contentPillars=["案例拆解", "材料选择", "预算避坑", "设计灵感"],
        conversionGoal="收藏、评论咨询和私信预约初诊",
        personaTone="审美克制、细节具体、有项目边界",
        highPerformingPatterns=["封面明确前后变化", "正文拆问题、做法、预算边界"],
        lowPerformingPatterns=["只发美图不讲设计逻辑", "案例缺少项目条件"],
        avoidTopics=["盗用未授权项目图", "虚假案例", "绝对化收益承诺"],
        commentStrategy="评论区承接面积、预算、风格和项目阶段问题",
        privateDomainStrategy="私信先确认空间类型、面积、城市和预算，再预约初诊",
        updatedAt=updated_at,
    )


def _replace_design_terms(value: str) -> str:
    replacements = [
        ("周末城市微度假路线", "老民宿改成高入住率房型的 5 个设计动作"),
        ("新店开业三天引流复盘", "办公室前台和会议区这样改，客户第一印象会更稳"),
        ("亲子路线评论承接话术", "民宿改造咨询承接话术"),
        ("city-weekend.mp4", "homestay-design.mp4"),
        ("city-weekend-cover.jpg", "homestay-design-cover.jpg"),
        ("new-store-review.mp4", "office-design-review.mp4"),
        ("new-store-cover.jpg", "office-design-cover.jpg"),
        ("适合两天一晚的民宿酒店改造内容，重点突出路线、预算和真实体验。", "围绕老民宿房型、动线、采光和拍照点做案例拆解，重点突出预算边界、入住体验和设计依据。"),
        ("办公室改造前期如何用短视频做曝光、项目咨询和私域承接，适合商家案例拆解。", "围绕办公室前台、会议区、接待动线和品牌露出做案例拆解，重点突出客户第一印象、员工效率和施工落地。"),
        ("亲子路线", "民宿改造"),
        ("社区亲子家庭", "民宿业主"),
        ("周末出行用户", "酒店投资人"),
        ("首屏给路线和预算", "首屏给改造结果和预算边界"),
        ("路线清单/路线", "设计方案/预算清单"),
        ("路线清单", "设计方案清单"),
        ("路线咨询", "设计咨询"),
        ("路线、预算和真实体验", "房型动线、预算边界和真实案例"),
        ("路线、预算", "设计方案和预算"),
        ("领取路线", "领取设计方案清单"),
        ("评论关键词领取路线", "评论关键词领取设计方案清单"),
        ("出行时间", "项目阶段"),
        ("只拍风景不讲适合谁", "只放效果图不讲适合谁"),
        ("城市周边微度假", "民宿酒店改造"),
        ("城市周边", "民宿酒店"),
        ("周末去哪儿", "民宿设计"),
        ("城市微度假", "酒店设计"),
        ("本地生活", "空间设计"),
        ("门店探访", "设计案例拆解"),
        ("门店开业期", "办公室改造前期"),
        ("门店运营", "办公空间设计"),
        ("短视频获客", "设计咨询"),
        ("开业引流", "企业接待空间"),
        ("到店和私域承接", "项目咨询和私域承接"),
        ("到店动作", "咨询动作"),
        ("价格/交通", "预算/工期"),
        ("价格/时间", "预算/工期"),
        ("本地场景", "项目场景"),
        ("地点场景", "项目场景"),
        ("收藏地址", "项目初诊"),
        ("真实体验", "真实案例"),
        ("亲测不踩雷版", "设计避坑版"),
        ("团购", "咨询预约"),
        ("团购转化", "咨询预约"),
        ("探店", "设计案例"),
        ("小门店", "小空间项目"),
        ("门店小老板", "空间项目负责人"),
        ("客户群运营中", "项目咨询中"),
        ("门店", "空间项目"),
        ("种草笔记小红书号", "设计案例小红书号"),
        ("本地生活抖音号", "民宿酒店设计抖音号"),
        ("私域承接视频号", "办公空间设计视频号"),
    ]
    result = value
    for old, new in replacements:
        result = result.replace(old, new)
    return result


def _replace_design_payload(value: Any) -> Any:
    if isinstance(value, str):
        return _replace_design_terms(value)
    if isinstance(value, list):
        return [_replace_design_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: _replace_design_payload(item) for key, item in value.items()}
    return value


def _replace_design_url(value: str) -> str:
    replacements = [
        ("city-weekend.mp4", "homestay-design.mp4"),
        ("city-weekend-cover.jpg", "homestay-design-cover.jpg"),
        ("new-store-review.mp4", "office-design-review.mp4"),
        ("new-store-cover.jpg", "office-design-cover.jpg"),
    ]
    result = value
    for old, new in replacements:
        result = result.replace(old, new)
    return result


def _replace_design_tags(tags: list[str]) -> list[str]:
    mapping = {
        "周末去哪儿": "民宿设计",
        "本地生活": "空间设计",
        "城市微度假": "酒店设计",
        "开业引流": "企业接待空间",
        "门店运营": "办公空间设计",
        "短视频获客": "设计咨询",
        "亲子路线": "民宿改造",
        "团购": "咨询预约",
        "探店": "设计案例",
        "真实体验": "真实案例",
        "预算": "预算避坑",
        "避坑": "设计避坑",
    }
    return _unique_limited([mapping.get(tag, _replace_design_terms(tag)) for tag in tags], 8)


def _replace_design_memory(memory: AccountMemory) -> AccountMemory:
    memory.targetAudience = _replace_design_payload(memory.targetAudience)
    memory.contentPillars = _replace_design_payload(memory.contentPillars)
    memory.conversionGoal = _replace_design_terms(memory.conversionGoal)
    memory.personaTone = _replace_design_terms(memory.personaTone)
    memory.highPerformingPatterns = _replace_design_payload(memory.highPerformingPatterns)
    memory.lowPerformingPatterns = _replace_design_payload(memory.lowPerformingPatterns)
    memory.avoidTopics = _replace_design_payload(memory.avoidTopics)
    memory.commentStrategy = _replace_design_terms(memory.commentStrategy)
    memory.privateDomainStrategy = _replace_design_terms(memory.privateDomainStrategy)
    return memory


def _text_design_bucket(text: str) -> str:
    if any(word in text for word in ["办公", "办公室", "会议区", "前台", "企业展厅", "行政", "员工效率", "接待"]):
        return "office_design"
    return "hospitality_design"


def _normalize_draft_publish_options(draft: PlatformDraft) -> None:
    text = f"{draft.title} {draft.description} {' '.join(draft.tags)}"
    bucket = _text_design_bucket(text)
    draft.publishOptions = _replace_design_payload(draft.publishOptions)
    if draft.platform == "douyin":
        draft.publishOptions["trafficField"] = bucket
        draft.publishOptions["contentReference"] = "办公空间设计" if bucket == "office_design" else "民宿酒店设计"
    elif draft.platform == "wechat_channels":
        draft.publishOptions["category"] = bucket
        draft.publishOptions["contentReference"] = "办公空间设计" if bucket == "office_design" else "民宿酒店设计"


def _replace_logs(logs: list[ExecutionLog]) -> None:
    for item in logs:
        item.message = _replace_design_terms(item.message)


def migrate_design_ops_domain(db: OperationsDb) -> OperationsDb:
    """Upgrade old generic seed data to the design-company operations domain."""
    now = now_iso()
    for account in db.accounts:
        if account.handle == "@city-life-demo" or account.displayName == "本地生活抖音号":
            account.displayName = "民宿酒店设计抖音号"
            account.handle = "@homestay-design-lab"
            account.profile = "民宿酒店设计、空间改造、投资回报、入住体验"
            account.memory = _design_memory("hospitality", now)
            account.updatedAt = now
        elif account.handle == "xhs-demo" or account.displayName == "种草笔记小红书号":
            account.displayName = "设计案例小红书号"
            account.handle = "design-case-notes"
            account.profile = "民宿酒店与办公空间设计案例、改造避坑、材料灵感"
            if not any(account.memory.contentPillars):
                account.memory = _design_memory("xhs", now)
            account.updatedAt = now
        elif account.handle == "channels-demo" or account.displayName == "私域承接视频号":
            account.displayName = "办公空间设计视频号"
            account.handle = "office-design-channels"
            account.profile = "办公空间设计、企业接待区、会议区动线、品牌形象落地"
            account.memory = _design_memory("office", now)
            account.updatedAt = now
        account.displayName = _replace_design_terms(account.displayName)
        account.profile = _replace_design_terms(account.profile)
        account.memory = _replace_design_memory(account.memory)

    for asset in db.assets:
        if asset.titleBase == "周末城市微度假路线":
            asset.titleBase = "老民宿改成高入住率房型的 5 个设计动作"
            asset.descriptionBase = "从老民宿房型、动线、采光、软装和拍照点切入，展示改造前后对比，并说明预算边界与入住体验提升逻辑。"
            asset.videoUrl = "https://example.com/assets/homestay-design.mp4"
            asset.coverUrl = "https://example.com/assets/homestay-design-cover.jpg"
            asset.tags = ["民宿设计", "酒店设计", "空间改造", "设计案例"]
            asset.owner = "设计运营团队"
            asset.updatedAt = now
        elif asset.titleBase == "新店开业三天引流复盘":
            asset.titleBase = "办公室前台和会议区这样改，客户第一印象会更稳"
            asset.descriptionBase = "围绕办公空间前台、会议区、洽谈动线和品牌露出做案例拆解，说明客户接待、员工效率和施工落地的取舍。"
            asset.videoUrl = "https://example.com/assets/office-design-review.mp4"
            asset.coverUrl = "https://example.com/assets/office-design-cover.jpg"
            asset.tags = ["办公空间设计", "企业展厅", "会议区动线", "设计咨询"]
            asset.owner = "设计运营团队"
            asset.updatedAt = now
        elif "亲子路线" in asset.titleBase:
            asset.titleBase = _replace_design_terms(asset.titleBase)
            asset.descriptionBase = _replace_design_terms(asset.descriptionBase)
            asset.tags = _replace_design_tags(asset.tags)
            asset.owner = _replace_design_terms(asset.owner)
            asset.updatedAt = now
        asset.titleBase = _replace_design_terms(asset.titleBase)
        asset.descriptionBase = _replace_design_terms(asset.descriptionBase)
        asset.videoUrl = _replace_design_url(asset.videoUrl)
        asset.videoLocalPath = _replace_design_url(asset.videoLocalPath)
        asset.coverUrl = _replace_design_url(asset.coverUrl)
        asset.coverLocalPath = _replace_design_url(asset.coverLocalPath)
        asset.tags = _replace_design_tags(asset.tags)
        asset.owner = _replace_design_terms(asset.owner)

    for metric in db.metrics:
        account = next((item for item in db.accounts if item.id == metric.accountId), None)
        if account and account.platform == "douyin":
            if not metric.trafficFieldBreakdown or set(metric.trafficFieldBreakdown) & {"interest", "local", "search", "commerce", "private"}:
                metric.trafficFieldBreakdown = {
                    "hospitality_design": 48.0,
                    "design_search": 26.0,
                    "office_design": 14.0,
                    "lead": 12.0,
                }
            metric.topContentTags = _replace_design_tags(metric.topContentTags) or ["民宿设计", "酒店设计", "空间改造"]
        elif account and account.platform == "wechat_channels":
            metric.topContentTags = _replace_design_tags(metric.topContentTags) or ["办公空间设计", "企业接待", "项目初诊"]
        else:
            metric.topContentTags = _replace_design_tags(metric.topContentTags)

    for draft in db.drafts:
        draft.title = _replace_design_terms(draft.title)
        draft.description = _replace_design_terms(draft.description)
        draft.tags = _replace_design_tags(draft.tags)
        draft.coverUrl = _replace_design_url(draft.coverUrl)
        _normalize_draft_publish_options(draft)

    for task in db.tasks:
        task.errorMessage = _replace_design_terms(task.errorMessage) if task.errorMessage else None
        _replace_logs(task.logs)

    for plan in db.plans:
        plan.objective = _replace_design_terms(plan.objective)
        plan.summary = _replace_design_terms(plan.summary)
    for client in db.agentClients:
        client.name = _replace_design_terms(client.name)
        client.notes = _replace_design_terms(client.notes)
    for item in db.agentToolCallLogs:
        item.clientName = _replace_design_terms(item.clientName)
        item.message = _replace_design_terms(item.message)
        item.arguments = _replace_design_payload(item.arguments)
        item.resultSummary = _replace_design_terms(item.resultSummary)
    for run in db.publishingAgentRuns:
        run.objective = _replace_design_terms(run.objective)
        run.summary = _replace_design_terms(run.summary)
        _replace_logs(run.logs)
    for index, report in enumerate(db.creatorCoachReports):
        db.creatorCoachReports[index] = CreatorCoachReport.model_validate(_replace_design_payload(report.model_dump()))
    for index, item in enumerate(db.viralContentItems):
        db.viralContentItems[index] = ViralContentItem.model_validate(_replace_design_payload(item.model_dump()))
        item = db.viralContentItems[index]
        if item.sourceType == "public_research" and not item.sourceUrl:
            item.sourceUrl = (
                "https://www.oceanengine.com/blog/douyin-lljz.html"
                if item.platform == "douyin"
                else "https://training.tencentads.com/uploads/202108/0rhYyjKh_vk9HWG.pdf"
            )
    for job in db.metricCollectionJobs:
        job.errorMessage = _replace_design_terms(job.errorMessage) if job.errorMessage else None
        _replace_logs(job.logs)
    for monitor in db.directMessageMonitors:
        _replace_logs(monitor.logs)
    for alert in db.directMessageAlerts:
        alert.headline = _replace_design_terms(alert.headline)
    for index, report in enumerate(db.accountDiagnoses):
        db.accountDiagnoses[index] = AccountDiagnosisReport.model_validate(_replace_design_payload(report.model_dump()))
    return db


def normalize_account_memory(db: OperationsDb) -> OperationsDb:
    if _env_flag("OPS_MIGRATE_DESIGN_DEMO", False):
        migrate_design_ops_domain(db)
    if _env_flag("OPS_SEED_DEMO_DATA", False):
        seed_viral_content_library(db, ViralContentSeedRequest(force=False))
    for account in db.accounts:
        ensure_account_browser_profile(account)
        try:
            account.browserProxyServer = _normalize_proxy_server(account.browserProxyServer)
        except ValueError:
            account.browserProxyServer = ""
            account.browserProxyEnabled = False
        account.browserProxyBypassList = _normalize_proxy_bypass_list(account.browserProxyBypassList)
        if account.browserProxyEnabled and not account.browserProxyServer:
            account.browserProxyEnabled = False
        if not account.memory:
            account.memory = AccountMemory()
    sync_direct_message_monitors(db)
    ensure_agent_clients(db)
    return db


def _viral_seed_key(item: ViralContentItem | dict[str, Any]) -> str:
    platform = item["platform"] if isinstance(item, dict) else item.platform
    track = item["track"] if isinstance(item, dict) else item.track
    title = item["title"] if isinstance(item, dict) else item.title
    return f"{platform}:{track}:{title}"


def _build_viral_content_item(payload: dict[str, Any], now: str | None = None) -> ViralContentItem:
    timestamp = now or now_iso()
    source_url = payload.get("sourceUrl", "")
    if not source_url and payload.get("sourceType", "public_research") == "public_research":
        source_url = (
            "https://www.oceanengine.com/blog/douyin-lljz.html"
            if payload["platform"] == "douyin"
            else "https://training.tencentads.com/uploads/202108/0rhYyjKh_vk9HWG.pdf"
        )
    return ViralContentItem(
        id=str(uuid4()),
        platform=payload["platform"],
        track=payload.get("track", "hospitality_design"),
        title=payload["title"],
        creatorName=payload.get("creatorName", ""),
        sourceUrl=source_url,
        sourceType=payload.get("sourceType", "public_research"),
        publishDate=payload.get("publishDate", ""),
        durationSeconds=payload.get("durationSeconds", 45),
        hotScore=payload.get("hotScore", 80),
        playCount=payload.get("playCount", 0),
        likeCount=payload.get("likeCount", 0),
        commentCount=payload.get("commentCount", 0),
        shareCount=payload.get("shareCount", 0),
        saveCount=payload.get("saveCount", 0),
        hook=payload.get("hook", ""),
        structure=payload.get("structure", []),
        visualNotes=payload.get("visualNotes", []),
        commentSignals=payload.get("commentSignals", []),
        reusableAngles=payload.get("reusableAngles", []),
        riskNotes=payload.get("riskNotes", []),
        tags=payload.get("tags", []),
        adaptationTitle=payload.get("adaptationTitle", payload["title"]),
        adaptationScript=payload.get("adaptationScript", payload.get("hook", "")),
        createdAt=timestamp,
        updatedAt=timestamp,
    )


def _sort_viral_content_items(db: OperationsDb) -> None:
    db.viralContentItems.sort(key=lambda item: (item.hotScore, item.updatedAt), reverse=True)


def seed_viral_content_library(db: OperationsDb, req: ViralContentSeedRequest | None = None) -> list[ViralContentItem]:
    request = req or ViralContentSeedRequest()
    if request.force:
        db.viralContentItems = [item for item in db.viralContentItems if item.sourceType != "public_research"]
    existing = {_viral_seed_key(item) for item in db.viralContentItems}
    added: list[ViralContentItem] = []
    now = now_iso()
    for payload in VIRAL_CONTENT_LIBRARY:
        key = _viral_seed_key(payload)
        if key in existing:
            continue
        item = _build_viral_content_item(payload, now)
        db.viralContentItems.append(item)
        existing.add(key)
        added.append(item)
    _sort_viral_content_items(db)
    return added


def create_viral_content_item(db: OperationsDb, req: ViralContentCreateRequest) -> ViralContentItem:
    item = _build_viral_content_item(req.model_dump(), now_iso())
    item.tags = _unique_limited(item.tags, 12)
    item.structure = _unique_limited(item.structure, 8)
    item.visualNotes = _unique_limited(item.visualNotes, 8)
    item.commentSignals = _unique_limited(item.commentSignals, 8)
    item.reusableAngles = _unique_limited(item.reusableAngles, 8)
    item.riskNotes = _unique_limited(item.riskNotes, 8)
    db.viralContentItems.insert(0, item)
    _sort_viral_content_items(db)
    return item


def convert_viral_content_to_asset(db: OperationsDb, req: ViralContentToAssetRequest) -> ViralContentToAssetResponse | str:
    item = next((row for row in db.viralContentItems if row.id == req.itemId), None)
    if not item:
        return "viral_content_not_found"
    now = now_iso()
    title = item.adaptationTitle or item.title
    structure = " -> ".join(item.structure) if item.structure else "爆款结构待补齐"
    description = item.adaptationScript or f"{item.hook}\n\n参考结构：{structure}"
    asset = Asset(
        id=str(uuid4()),
        contentType="video",
        titleBase=title,
        descriptionBase=description,
        videoUrl=item.sourceUrl or f"viral://{item.id}/reference-video",
        coverUrl=f"viral://{item.id}/reference-cover",
        tags=_unique_limited([TRACK_LABELS.get(item.track, item.track), "爆款拆解", *item.tags], 8),
        durationSeconds=item.durationSeconds,
        owner="爆款内容库",
        copyrightStatus="unknown",
        createdAt=now,
        updatedAt=now,
    )
    db.assets.insert(0, asset)
    drafts: list[PlatformDraft] = []
    if req.createDrafts:
        accounts = [account for account in db.accounts if account.platform == item.platform and account.status != "disabled"]
        for account in accounts:
            draft = create_platform_draft(asset, account)
            draft.readiness = "needs_review"
            draft.publishOptions["sourceViralItemId"] = item.id
            db.drafts.insert(0, draft)
            drafts.append(draft)
    return ViralContentToAssetResponse(item=item, asset=asset, drafts=drafts)


def _all_tool_names() -> list[str]:
    return [tool.name for tool in AGENT_TOOL_SCHEMAS]


def _default_external_tools(can_execute_publish: bool = False) -> list[str]:
    blocked = {"ops.execute_task", "ops.run_publishing_agent"}
    tools = [tool.name for tool in AGENT_TOOL_SCHEMAS if tool.name not in blocked]
    if can_execute_publish:
        tools.extend(["ops.execute_task", "ops.run_publishing_agent"])
    return tools


def _normalize_allowed_tools(tools: list[str], can_execute_publish: bool) -> list[str]:
    known = set(_all_tool_names())
    selected = [tool for tool in tools if tool in known]
    if not selected:
        selected = _default_external_tools(can_execute_publish)
    if not can_execute_publish:
        selected = [tool for tool in selected if tool not in {"ops.execute_task", "ops.run_publishing_agent"}]
    return list(dict.fromkeys(selected))


def ensure_agent_clients(db: OperationsDb) -> OperationsDb:
    now = now_iso()
    internal = next((client for client in db.agentClients if client.kind == "internal"), None)
    if internal is None:
        internal = AgentClient(
            id="builtin-publishing-agent",
            name="内置发布 Agent",
            kind="internal",
            status="active",
            allowedTools=_all_tool_names(),
            canExecutePublish=True,
            notes="系统内置 Agent，负责生成排期、创建任务和在安全边界内执行发布。",
            createdAt=now,
            updatedAt=now,
        )
        db.agentClients.insert(0, internal)
    else:
        internal.name = internal.name or "内置发布 Agent"
        internal.allowedTools = _all_tool_names()
        internal.canExecutePublish = True
        internal.updatedAt = now
    return db


def _find_agent_client(db: OperationsDb, client_id: str | None) -> AgentClient | None:
    if not client_id:
        return None
    return next((client for client in db.agentClients if client.id == client_id), None)


def create_agent_client(db: OperationsDb, req: AgentClientCreateRequest) -> AgentClient:
    ensure_agent_clients(db)
    now = now_iso()
    client = AgentClient(
        id=str(uuid4()),
        name=req.name.strip(),
        kind=req.kind,
        status="active",
        allowedTools=_normalize_allowed_tools(req.allowedTools, req.canExecutePublish),
        allowedAccountIds=list(dict.fromkeys(req.allowedAccountIds)),
        canExecutePublish=req.canExecutePublish,
        notes=req.notes.strip(),
        createdAt=now,
        updatedAt=now,
    )
    if client.kind == "internal":
        client.allowedTools = _all_tool_names()
        client.canExecutePublish = True
    db.agentClients.insert(0, client)
    return client


def update_agent_client(db: OperationsDb, client_id: str, req: AgentClientUpdateRequest) -> AgentClient | str:
    ensure_agent_clients(db)
    client = _find_agent_client(db, client_id)
    if not client:
        return "agent_client_not_found"
    if client.kind == "internal":
        return "internal_agent_is_managed"
    if req.status is not None:
        client.status = req.status
    if req.canExecutePublish is not None:
        client.canExecutePublish = req.canExecutePublish
    if req.allowedTools is not None:
        client.allowedTools = _normalize_allowed_tools(req.allowedTools, client.canExecutePublish)
    else:
        client.allowedTools = _normalize_allowed_tools(client.allowedTools, client.canExecutePublish)
    if req.allowedAccountIds is not None:
        client.allowedAccountIds = list(dict.fromkeys(req.allowedAccountIds))
    if req.notes is not None:
        client.notes = req.notes.strip()
    client.updatedAt = now_iso()
    return client


def get_agent_manifest(db: OperationsDb) -> AgentManifest:
    ensure_agent_clients(db)
    return AgentManifest(
        endpoints={
            "manifest": "GET /api/ops/agent/manifest",
            "tools": "GET /api/ops/agent/tools",
            "invoke": "POST /api/ops/agent/invoke",
            "clients": "GET/POST /api/ops/agent/clients",
            "publishingAgent": "POST /api/ops/agent/publishing-runs",
        },
        safetyRules=[
            "所有第三方平台登录态只保存在账号独立浏览器档案内。",
            "匿名 Agent 只能读取 Manifest、工具清单和只读状态；写入或执行类工具必须传已登记 clientId。",
            "外部 Agent 默认不能执行发布任务；需要连接配置显式开启 canExecutePublish。",
            "带 requiresConfirmation 的工具必须传 confirmed=true。",
            "dry-run 不向真实平台提交内容；browser_prepare 只打开工作台并进入人工接管。",
            "私信工具只记录未读数量，不保存联系人或正文。",
        ],
        tools=get_agent_tools(),
        runtime=get_runtime_state(),
    )


def _masked_proxy_server(proxy_server: str) -> str:
    return re.sub(r"://([^/@:]+):([^/@]+)@", r"://***:***@", proxy_server)


def _build_browser_command(
    url: str,
    profile_dir: str,
    proxy_server: str = "",
    proxy_bypass_list: str = "",
) -> tuple[list[str] | None, str | None]:
    bridge_extension_dir = Path(__file__).resolve().parents[3] / "frontend" / "electron" / "extensions" / "zimeiti-bridge"
    browser_args = [
        f"--user-data-dir={profile_dir}",
        "--profile-directory=Default",
        "--new-window",
        "--no-first-run",
        "--disable-default-apps",
    ]
    if bridge_extension_dir.exists():
        browser_args.append(f"--load-extension={bridge_extension_dir}")
    if proxy_server:
        browser_args.append(f"--proxy-server={proxy_server}")
    if proxy_bypass_list:
        browser_args.append(f"--proxy-bypass-list={proxy_bypass_list}")
    browser_args.append(url)

    if sys.platform == "darwin":
        app_name = _resolve_macos_browser_app()
        if app_name:
            return ["open", "-na", app_name, "--args", *browser_args], app_name

    executable = resolve_browser_executable()
    if not executable:
        return None, None

    return [executable, *browser_args], executable


def _workspace_url_with_bridge_context(url: str, account_id: str) -> str:
    parts = urlsplit(url)
    context = urlencode({"zmt_account_id": account_id, "zmt_api_base": "http://127.0.0.1:8002/api"})
    fragment = f"{parts.fragment}&{context}" if parts.fragment else context
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, fragment))


def open_isolated_browser_workspace(account: Account) -> WorkspaceOpenResponse:
    """Open one persistent local browser profile per account.

    The login state is stored by Chrome/Chromium inside browserProfileDir. We do
    not store passwords or cookies in the app database.
    """

    profile_dir = ensure_account_browser_profile(account)
    workspace_url = _workspace_url_with_bridge_context(PLATFORM_ENTRY_URLS[account.platform], account.id)
    try:
        proxy_server = _normalize_proxy_server(account.browserProxyServer) if account.browserProxyEnabled else ""
    except ValueError:
        proxy_server = ""
        account.browserProxyEnabled = False
    proxy_bypass_list = _normalize_proxy_bypass_list(account.browserProxyBypassList)
    logs = [
        log(f"已为 {account.displayName} 绑定独立浏览器档案"),
        log(f"档案目录：{profile_dir}"),
        log(f"平台入口：{workspace_url}"),
    ]
    if proxy_server:
        logs.append(log(f"浏览器代理：{_masked_proxy_server(proxy_server)}"))
        if proxy_bypass_list:
            logs.append(log(f"代理绕过：{proxy_bypass_list}"))
    else:
        logs.append(log("浏览器代理：跟随浏览器/系统默认代理"))
    opened = False
    launch_mode: str = "skipped"
    browser_label: str | None = None

    if _env_flag("PUBLISHER_BROWSER_AUTO_OPEN", True):
        command, browser_label = _build_browser_command(workspace_url, profile_dir, proxy_server, proxy_bypass_list)
        if not command:
            launch_mode = "missing_browser"
            logs.append(log("未找到 Chrome/Chromium，请设置 PUBLISHER_BROWSER_EXECUTABLE_PATH", "warn"))
        else:
            try:
                subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                opened = True
                launch_mode = "opened"
                logs.append(log("已打开独立浏览器窗口；这个窗口只使用当前账号的登录态"))
            except Exception as err:
                launch_mode = "failed"
                logs.append(log(f"独立浏览器启动失败：{err}", "error"))
    else:
        logs.append(log("已跳过自动打开浏览器，仅保存账号浏览器档案", "warn"))

    account.workspaceUrl = PLATFORM_ENTRY_URLS[account.platform]
    account.browserProfileDir = profile_dir
    account.browserProxyServer = proxy_server or account.browserProxyServer
    account.browserProxyBypassList = proxy_bypass_list
    account.workspaceOpenedAt = now_iso()
    account.sessionHealth = "unknown"
    account.updatedAt = now_iso()

    return WorkspaceOpenResponse(
        account=account,
        logs=logs,
        opened=opened,
        launchMode=launch_mode,  # type: ignore[arg-type]
        workspaceUrl=workspace_url,
        browserProfileDir=profile_dir,
        browserExecutable=browser_label,
        proxyEnabled=bool(proxy_server),
        proxyServer=_masked_proxy_server(proxy_server) if proxy_server else "",
    )


def prepare_isolated_browser_workspace(account: Account) -> WorkspaceOpenResponse:
    """Prepare account browser context for the desktop embedded browser.

    This updates the account workspace metadata and proxy normalization without
    launching an external Chrome/Chromium process.
    """

    profile_dir = ensure_account_browser_profile(account)
    workspace_url = PLATFORM_ENTRY_URLS[account.platform]
    try:
        proxy_server = _normalize_proxy_server(account.browserProxyServer) if account.browserProxyEnabled else ""
    except ValueError:
        proxy_server = ""
        account.browserProxyEnabled = False
    proxy_bypass_list = _normalize_proxy_bypass_list(account.browserProxyBypassList)
    logs = [
        log(f"已为 {account.displayName} 准备内置浏览器档案"),
        log(f"档案目录：{profile_dir}"),
        log(f"平台入口：{workspace_url}"),
    ]
    if proxy_server:
        logs.append(log(f"浏览器代理：{_masked_proxy_server(proxy_server)}"))
        if proxy_bypass_list:
            logs.append(log(f"代理绕过：{proxy_bypass_list}"))
    else:
        logs.append(log("浏览器代理：跟随浏览器/系统默认代理"))

    account.workspaceUrl = workspace_url
    account.browserProfileDir = profile_dir
    account.browserProxyServer = proxy_server or account.browserProxyServer
    account.browserProxyBypassList = proxy_bypass_list
    account.workspaceOpenedAt = now_iso()
    account.sessionHealth = "unknown"
    account.updatedAt = now_iso()

    return WorkspaceOpenResponse(
        account=account,
        logs=logs,
        opened=False,
        launchMode="skipped",
        workspaceUrl=workspace_url,
        browserProfileDir=profile_dir,
        browserExecutable="electron",
        proxyEnabled=bool(proxy_server),
        proxyServer=_masked_proxy_server(proxy_server) if proxy_server else "",
    )


def remember_account_session(account: Account) -> Account:
    ensure_account_browser_profile(account)
    account.status = "connected"
    account.sessionHealth = "healthy"
    account.updatedAt = now_iso()
    return account


def _clean_synced_text(value: str, max_length: int = 80) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())[:max_length]


def _is_generic_synced_name(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return True
    generic_terms = [
        "创作者中心",
        "创作者服务平台",
        "创作服务平台",
        "视频号助手",
        "登录",
        "扫码",
        "creator",
        "platform",
    ]
    return any(term in normalized for term in generic_terms)


def sync_account_profile(account: Account, req: AccountProfileSyncRequest) -> Account:
    display_name = _clean_synced_text(req.displayName)
    handle = _clean_synced_text(req.handle, 96)
    profile = _clean_synced_text(req.profile, 160)
    workspace_url = _clean_synced_text(req.workspaceUrl, 500)

    if display_name and not _is_generic_synced_name(display_name):
        account.displayName = display_name
    if handle:
        account.handle = handle
        if not account.sauAccountName:
            account.sauAccountName = handle
    if profile and (
        not account.profile.strip()
        or "扫码接入" in account.profile
        or account.profile.endswith("账号（待扫码）")
    ):
        account.profile = profile
    if workspace_url:
        account.workspaceUrl = workspace_url

    ensure_account_browser_profile(account)
    account.status = "connected"
    account.sessionHealth = "healthy"
    account.updatedAt = now_iso()
    return account


def update_account_browser_settings(
    db: OperationsDb,
    account_id: str,
    req: AccountBrowserUpdateRequest,
) -> Account | str:
    account = _find_account(db, account_id)
    if not account:
        return "account_not_found"

    if req.browserProxyServer is not None:
        try:
            account.browserProxyServer = _normalize_proxy_server(req.browserProxyServer)
        except ValueError as exc:
            return str(exc)
    if req.browserProxyBypassList is not None:
        account.browserProxyBypassList = _normalize_proxy_bypass_list(req.browserProxyBypassList)
    if req.browserProxyEnabled is not None:
        account.browserProxyEnabled = bool(req.browserProxyEnabled)
    if req.sauAccountName is not None:
        account.sauAccountName = req.sauAccountName.strip()

    if account.browserProxyEnabled and not account.browserProxyServer:
        return "proxy_server_required"

    ensure_account_browser_profile(account)
    account.updatedAt = now_iso()
    return account


def update_account_memory(
    db: OperationsDb,
    account_id: str,
    req: AccountMemoryUpdateRequest,
) -> Account | str:
    account = _find_account(db, account_id)
    if not account:
        return "account_not_found"

    now = now_iso()
    account.memory = AccountMemory(
        targetAudience=req.targetAudience[:12],
        contentPillars=req.contentPillars[:12],
        conversionGoal=req.conversionGoal.strip(),
        personaTone=req.personaTone.strip(),
        highPerformingPatterns=req.highPerformingPatterns[:12],
        lowPerformingPatterns=req.lowPerformingPatterns[:12],
        avoidTopics=req.avoidTopics[:12],
        commentStrategy=req.commentStrategy.strip(),
        privateDomainStrategy=req.privateDomainStrategy.strip(),
        updatedAt=now,
    )
    if req.contentPillars and not account.profile.strip():
        account.profile = "、".join(req.contentPillars[:4])
    account.updatedAt = now
    return account


def _direct_message_status(account: Account, monitor: DirectMessageMonitor) -> str:
    if account.platform not in DIRECT_MESSAGE_PLATFORMS:
        return "unsupported"
    if not monitor.enabled:
        return "paused"
    if account.status != "connected":
        return "needs_login"
    return "active"


def _find_account(db: OperationsDb, account_id: str) -> Account | None:
    return next((item for item in db.accounts if item.id == account_id), None)


def _find_direct_message_monitor(db: OperationsDb, account_id: str) -> DirectMessageMonitor | None:
    return next((item for item in db.directMessageMonitors if item.accountId == account_id), None)


def sync_direct_message_monitors(db: OperationsDb) -> OperationsDb:
    now = now_iso()
    supported_accounts = [account for account in db.accounts if account.platform in DIRECT_MESSAGE_PLATFORMS]
    seen_account_ids = {account.id for account in supported_accounts}

    for account in supported_accounts:
        monitor = _find_direct_message_monitor(db, account.id)
        if monitor is None:
            monitor = DirectMessageMonitor(
                id=str(uuid4()),
                accountId=account.id,
                platform=account.platform,
                enabled=True,
                source="browser_session" if account.authType == "browser_session" else "official_api",
                status="active" if account.status == "connected" else "needs_login",
                logs=[log("已创建私信未读监控，不保存私信正文")],
                createdAt=now,
                updatedAt=now,
            )
            db.directMessageMonitors.append(monitor)
        else:
            monitor.platform = account.platform
            monitor.status = _direct_message_status(account, monitor)  # type: ignore[assignment]
            monitor.updatedAt = now

    for monitor in db.directMessageMonitors:
        if monitor.accountId not in seen_account_ids:
            monitor.status = "unsupported"
            monitor.enabled = False
            monitor.updatedAt = now

    return db


def update_direct_message_monitor(
    db: OperationsDb,
    account_id: str,
    req: DirectMessageMonitorUpdateRequest,
) -> DirectMessageMonitor | str:
    sync_direct_message_monitors(db)
    account = _find_account(db, account_id)
    if not account:
        return "account_not_found"
    if account.platform not in DIRECT_MESSAGE_PLATFORMS:
        return "platform_not_supported"

    monitor = _find_direct_message_monitor(db, account_id)
    if not monitor:
        return "monitor_not_found"
    monitor.enabled = req.enabled
    monitor.source = req.source
    monitor.status = _direct_message_status(account, monitor)  # type: ignore[assignment]
    monitor.updatedAt = now_iso()
    monitor.logs.insert(0, log("私信监控已开启" if req.enabled else "私信监控已暂停"))
    monitor.logs = monitor.logs[:20]
    return monitor


def _unread_alert_for_account(db: OperationsDb, account_id: str) -> DirectMessageAlert | None:
    return next(
        (
            item
            for item in db.directMessageAlerts
            if item.accountId == account_id and item.status == "unread"
        ),
        None,
    )


def _write_direct_message_alert(
    db: OperationsDb,
    account: Account,
    unread_count: int,
    source: DirectMessageSource,
) -> DirectMessageAlert:
    now = now_iso()
    existing = _unread_alert_for_account(db, account.id)
    headline = f"{PLATFORM_LABELS[account.platform]}账号收到新的私信"
    if existing:
        existing.unreadCount = max(1, unread_count)
        existing.source = source
        existing.headline = headline
        existing.updatedAt = now
        return existing

    alert = DirectMessageAlert(
        id=str(uuid4()),
        accountId=account.id,
        platform=account.platform,
        source=source,
        unreadCount=max(1, unread_count),
        status="unread",
        headline=headline,
        createdAt=now,
        updatedAt=now,
    )
    db.directMessageAlerts.insert(0, alert)
    return alert


def record_direct_message_event(db: OperationsDb, req: DirectMessageEventRequest) -> DirectMessageCheckResponse | str:
    sync_direct_message_monitors(db)
    account = _find_account(db, req.accountId)
    if not account:
        return "account_not_found"
    if account.platform not in DIRECT_MESSAGE_PLATFORMS:
        return "platform_not_supported"

    monitor = _find_direct_message_monitor(db, account.id)
    if not monitor:
        return "monitor_not_found"
    previous_unread = monitor.unreadCount
    now = now_iso()
    monitor.unreadCount = req.unreadCount
    monitor.unreadDelta = max(0, req.unreadCount - previous_unread)
    monitor.lastEventAt = now
    monitor.lastCheckedAt = now
    monitor.updatedAt = now
    monitor.status = _direct_message_status(account, monitor)  # type: ignore[assignment]
    monitor.logs.insert(0, log(f"收到私信未读数更新：{req.unreadCount} 条"))
    monitor.logs = monitor.logs[:20]

    alerts: list[DirectMessageAlert] = []
    if req.unreadCount > 0:
        monitor.lastNotifiedAt = now
        alerts.append(_write_direct_message_alert(db, account, req.unreadCount, req.source))

    return DirectMessageCheckResponse(
        monitors=[monitor],
        alerts=alerts,
        logs=[log("已写入私信提醒事件")],
    )


def check_direct_messages(db: OperationsDb, req: DirectMessageCheckRequest) -> DirectMessageCheckResponse:
    sync_direct_message_monitors(db)
    selected_ids = set(req.accountIds or [])
    monitors = [
        monitor
        for monitor in db.directMessageMonitors
        if not selected_ids or monitor.accountId in selected_ids
    ]
    logs: list[ExecutionLog] = []
    for monitor in monitors:
        account = _find_account(db, monitor.accountId)
        if not account:
            monitor.status = "unsupported"
            continue
        monitor.status = _direct_message_status(account, monitor)  # type: ignore[assignment]
        monitor.lastCheckedAt = now_iso()
        monitor.updatedAt = monitor.lastCheckedAt
        if monitor.status == "active":
            monitor.logs.insert(0, log("已检测私信未读状态；等待平台适配器写入最新未读数"))
        elif monitor.status == "needs_login":
            monitor.logs.insert(0, log("账号未登录，暂不能检测私信未读", "warn"))
        monitor.logs = monitor.logs[:20]
        logs.append(log(f"{account.displayName} 私信监控状态：{monitor.status}"))

    alerts = [alert for alert in db.directMessageAlerts if alert.status == "unread"]
    return DirectMessageCheckResponse(monitors=monitors, alerts=alerts, logs=logs)


def acknowledge_direct_message_alert(db: OperationsDb, alert_id: str) -> DirectMessageAlert | str:
    alert = next((item for item in db.directMessageAlerts if item.id == alert_id), None)
    if not alert:
        return "alert_not_found"
    now = now_iso()
    alert.status = "acknowledged"
    alert.acknowledgedAt = now
    alert.updatedAt = now
    if not _unread_alert_for_account(db, alert.accountId):
        monitor = _find_direct_message_monitor(db, alert.accountId)
        if monitor:
            monitor.unreadCount = 0
            monitor.unreadDelta = 0
            monitor.updatedAt = now
            monitor.logs.insert(0, log("私信提醒已确认处理"))
            monitor.logs = monitor.logs[:20]
    return alert


def _clean_creator_text(value: str, limit: int = 500) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _creator_post_key(account_id: str, platform_post_id: str, post_url: str, title: str) -> tuple[str, str]:
    if platform_post_id:
        return ("platform_id", f"{account_id}:{platform_post_id}")
    if post_url:
        return ("url", f"{account_id}:{post_url}")
    return ("title", f"{account_id}:{title.lower()[:120]}")


def _creator_comment_key(
    account_id: str,
    platform_comment_id: str,
    platform_post_id: str,
    author_name: str,
    content: str,
) -> tuple[str, str]:
    if platform_comment_id:
        return ("platform_id", f"{account_id}:{platform_comment_id}")
    normalized = "|".join(
        [
            account_id,
            platform_post_id,
            author_name.lower()[:80],
            content.lower()[:240],
        ]
    )
    return ("fallback", normalized)


def _find_creator_post(
    db: OperationsDb,
    account_id: str,
    platform_post_id: str,
    post_url: str,
    title: str,
) -> CreatorPost | None:
    key_kind, key = _creator_post_key(account_id, platform_post_id, post_url, title)
    for post in db.creatorPosts:
        if key_kind == "platform_id" and post.accountId == account_id and post.platformPostId == platform_post_id:
            return post
        if key_kind == "url" and post.accountId == account_id and post.postUrl == post_url:
            return post
        if key_kind == "title" and _creator_post_key(post.accountId, post.platformPostId, post.postUrl, post.title) == (key_kind, key):
            return post
    return None


def _find_creator_comment(
    db: OperationsDb,
    account_id: str,
    platform_comment_id: str,
    platform_post_id: str,
    author_name: str,
    content: str,
) -> CreatorComment | None:
    key_kind, key = _creator_comment_key(account_id, platform_comment_id, platform_post_id, author_name, content)
    for comment in db.creatorComments:
        if key_kind == "platform_id" and comment.accountId == account_id and comment.platformCommentId == platform_comment_id:
            return comment
        if key_kind == "fallback":
            existing_key = _creator_comment_key(
                comment.accountId,
                comment.platformCommentId,
                comment.platformPostId,
                comment.authorName,
                comment.content,
            )
            if existing_key == (key_kind, key):
                return comment
    return None


def _comment_intent_tags(content: str) -> list[str]:
    text = content.lower()
    tags: list[str] = []
    if any(word in text for word in ["多少钱", "价格", "报价", "预算", "怎么收费", "费用"]):
        tags.append("price_intent")
    if any(word in text for word in ["怎么联系", "联系", "私信", "vx", "微信", "电话", "合作"]):
        tags.append("lead_intent")
    if any(word in text for word in ["怎么做", "怎么办", "能不能", "可以吗", "求", "哪里"]):
        tags.append("question")
    if any(word in text for word in ["差", "坑", "骗人", "不行", "假的", "踩雷"]):
        tags.append("risk")
    if any(word in text for word in ["好", "赞", "喜欢", "有用", "收藏", "学到了", "太棒"]):
        tags.append("positive_feedback")
    return tags[:5]


def _comment_sentiment(content: str) -> str:
    tags = _comment_intent_tags(content)
    if "lead_intent" in tags or "price_intent" in tags:
        return "lead"
    if "question" in tags:
        return "question"
    if "risk" in tags:
        return "negative"
    if any(word in content for word in ["好", "赞", "喜欢", "有用", "收藏", "学到了"]):
        return "positive"
    return "neutral"


def _suggest_comment_reply(account: Account, content: str, tags: list[str]) -> str:
    memory = account.memory
    cta = memory.commentStrategy or memory.privateDomainStrategy or "把空间类型、面积、预算和所在城市发我，我按你的情况给一个初步判断"
    audience = memory.targetAudience[0] if memory.targetAudience else "你这个项目"
    pillar = memory.contentPillars[0] if memory.contentPillars else account.profile or PLATFORM_LABELS[account.platform]

    if "risk" in tags:
        return (
            "谢谢提醒，这类情况确实不能只看表面效果。"
            f"如果方便的话，可以补充一下具体空间条件，我会按{pillar}的真实边界来判断，不做夸大承诺。"
        )
    if "price_intent" in tags:
        return (
            "预算要看面积、现状、改造深度和落地标准，不能只按一张图直接估。"
            f"你可以先把{audience}的面积、城市和大概预算发我，我帮你判断优先改哪里。"
        )
    if "lead_intent" in tags:
        return f"可以，我先按项目条件帮你初筛。{cta}。"
    if "question" in tags:
        return (
            "可以，这个问题要先看你的空间条件。"
            f"我建议先确认面积、动线和预算边界，再决定具体做法；{cta}。"
        )
    if "positive_feedback" in tags:
        return f"谢谢认可，这类内容后面我会继续拆真实案例。你也可以留言你最想看的{pillar}问题。"
    return f"收到，这个点很适合继续展开。{cta}。"


def _draft_comment_reply(account: Account, comment: CreatorComment, force: bool = False) -> CreatorComment:
    if comment.suggestedReply and not force:
        return comment
    tags = comment.intentTags or _comment_intent_tags(comment.content)
    comment.intentTags = tags
    comment.sentiment = _comment_sentiment(comment.content)  # type: ignore[assignment]
    comment.suggestedReply = _suggest_comment_reply(account, comment.content, tags)
    if comment.replyStatus in {"unknown", "unreplied"}:
        comment.replyStatus = "drafted"
    comment.updatedAt = now_iso()
    return comment


def sync_creator_data(db: OperationsDb, req: CreatorDataSyncRequest) -> CreatorDataSyncResponse | str:
    account = _find_account(db, req.accountId)
    if not account:
        return "account_not_found"

    now = now_iso()
    captured_at = req.capturedAt or now
    upserted_posts: list[CreatorPost] = []
    upserted_comments: list[CreatorComment] = []

    for item in req.posts[:100]:
        title = _clean_creator_text(item.title, 180)
        description = _clean_creator_text(item.description, 1000)
        platform_post_id = _clean_creator_text(item.platformPostId, 160)
        post_url = _clean_creator_text(item.postUrl, 500)
        if not title and not platform_post_id and not post_url:
            continue
        post = _find_creator_post(db, account.id, platform_post_id, post_url, title)
        if post is None:
            post = CreatorPost(
                id=str(uuid4()),
                accountId=account.id,
                platform=account.platform,
                platformPostId=platform_post_id,
                source=req.source,
                title=title,
                description=description,
                publishTime=_clean_creator_text(item.publishTime, 120),
                postUrl=post_url,
                coverUrl=_clean_creator_text(item.coverUrl, 500),
                metrics=item.metrics,
                raw=item.raw,
                capturedAt=captured_at,
                createdAt=now,
                updatedAt=now,
            )
            db.creatorPosts.insert(0, post)
        else:
            post.platformPostId = post.platformPostId or platform_post_id
            post.source = req.source
            post.title = title or post.title
            post.description = description or post.description
            post.publishTime = _clean_creator_text(item.publishTime, 120) or post.publishTime
            post.postUrl = post_url or post.postUrl
            post.coverUrl = _clean_creator_text(item.coverUrl, 500) or post.coverUrl
            post.metrics = item.metrics
            post.raw = item.raw or post.raw
            post.capturedAt = captured_at
            post.updatedAt = now
        upserted_posts.append(post)

    post_by_platform_id = {
        post.platformPostId: post for post in db.creatorPosts if post.accountId == account.id and post.platformPostId
    }

    for item in req.comments[:300]:
        content = _clean_creator_text(item.content, 2000)
        author_name = _clean_creator_text(item.authorName, 120)
        platform_post_id = _clean_creator_text(item.platformPostId, 160)
        platform_comment_id = _clean_creator_text(item.platformCommentId, 160)
        if not content:
            continue
        comment = _find_creator_comment(
            db,
            account.id,
            platform_comment_id,
            platform_post_id,
            author_name,
            content,
        )
        linked_post = post_by_platform_id.get(platform_post_id)
        if comment is None:
            comment = CreatorComment(
                id=str(uuid4()),
                accountId=account.id,
                platform=account.platform,
                postId=linked_post.id if linked_post else None,
                platformPostId=platform_post_id,
                platformCommentId=platform_comment_id,
                source=req.source,
                authorName=author_name,
                authorHandle=_clean_creator_text(item.authorHandle, 120),
                content=content,
                likeCount=item.likeCount,
                replyCount=item.replyCount,
                postedAt=_clean_creator_text(item.postedAt, 120),
                sentiment=_comment_sentiment(content),  # type: ignore[arg-type]
                intentTags=_comment_intent_tags(content),
                replyStatus=item.replyStatus,
                raw=item.raw,
                capturedAt=captured_at,
                createdAt=now,
                updatedAt=now,
            )
            _draft_comment_reply(account, comment)
            db.creatorComments.insert(0, comment)
        else:
            comment.postId = comment.postId or (linked_post.id if linked_post else None)
            comment.platformPostId = comment.platformPostId or platform_post_id
            comment.platformCommentId = comment.platformCommentId or platform_comment_id
            comment.source = req.source
            comment.authorName = author_name or comment.authorName
            comment.authorHandle = _clean_creator_text(item.authorHandle, 120) or comment.authorHandle
            comment.content = content
            comment.likeCount = item.likeCount
            comment.replyCount = item.replyCount
            comment.postedAt = _clean_creator_text(item.postedAt, 120) or comment.postedAt
            comment.sentiment = _comment_sentiment(content)  # type: ignore[assignment]
            comment.intentTags = _comment_intent_tags(content)
            comment.replyStatus = item.replyStatus if item.replyStatus != "unknown" else comment.replyStatus
            _draft_comment_reply(account, comment)
            comment.raw = item.raw or comment.raw
            comment.capturedAt = captured_at
            comment.updatedAt = now
        upserted_comments.append(comment)

    db.creatorPosts = db.creatorPosts[:1000]
    db.creatorComments = db.creatorComments[:5000]

    logs = [
        log(f"已同步作品 {len(upserted_posts)} 条、评论 {len(upserted_comments)} 条"),
    ]
    return CreatorDataSyncResponse(account=account, posts=upserted_posts, comments=upserted_comments, logs=logs)


def draft_creator_comment_replies(
    db: OperationsDb,
    req: CreatorCommentDraftReplyRequest,
) -> CreatorCommentDraftReplyResponse:
    selected_ids = set(req.commentIds)
    comments = [
        comment
        for comment in db.creatorComments
        if (not req.accountId or comment.accountId == req.accountId)
        and (not selected_ids or comment.id in selected_ids)
    ][: req.limit]
    account_by_id = {account.id: account for account in db.accounts}
    drafted: list[CreatorComment] = []
    for comment in comments:
        account = account_by_id.get(comment.accountId)
        if not account:
            continue
        before = comment.suggestedReply
        _draft_comment_reply(account, comment, force=req.force)
        if req.force or comment.suggestedReply != before or comment.suggestedReply:
            drafted.append(comment)
    return CreatorCommentDraftReplyResponse(
        comments=drafted,
        logs=[log(f"已生成/刷新评论回复草稿 {len(drafted)} 条")],
    )


def apply_creator_comment_reply_action(
    db: OperationsDb,
    comment_id: str,
    req: CreatorCommentReplyActionRequest,
) -> CreatorCommentReplyActionResponse | str:
    comment = next((item for item in db.creatorComments if item.id == comment_id), None)
    if not comment:
        return "comment_not_found"

    now = now_iso()
    reply_text = _clean_creator_text(req.replyText, 2000) or comment.suggestedReply
    raw = dict(comment.raw or {})
    raw["replyAction"] = {
        "action": req.action,
        "replyText": reply_text,
        "at": now,
    }

    if req.action == "approve":
        if reply_text:
            comment.suggestedReply = reply_text
        comment.replyStatus = "approved"
        message = "已确认评论回复草稿，等待执行发送"
    elif req.action == "mark_replied":
        if reply_text:
            comment.suggestedReply = reply_text
        comment.replyStatus = "replied"
        message = "已标记评论为已回复"
    elif req.action == "ignore":
        comment.replyStatus = "ignored"
        message = "已忽略该评论回复任务"
    elif req.action == "reset":
        comment.replyStatus = "unreplied"
        comment.suggestedReply = ""
        raw["replyAction"]["replyText"] = ""
        message = "已重置评论回复状态"
    else:
        return "unsupported_reply_action"

    comment.raw = raw
    comment.updatedAt = now
    return CreatorCommentReplyActionResponse(comment=comment, logs=[log(message)])


def _score_grade(score: int) -> str:
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _latest_metric(db: OperationsDb, account_id: str):
    return next(
        iter(
            sorted(
                [item for item in db.metrics if item.accountId == account_id],
                key=lambda item: item.capturedAt,
                reverse=True,
            )
        ),
        None,
    )


def _optional_rate_bonus(value: float | None, baseline: float, scale: float, cap: float) -> float:
    if value is None:
        return 0
    return max(-cap, min(cap, (value - baseline) * scale))


def _metric_signal_summary(account: Account, metric: MetricSnapshot | None) -> str:
    if not metric:
        return "暂无平台算法快照"
    if account.platform == "douyin":
        fields = [
            ("3秒留存", metric.threeSecondRetentionRate),
            ("完播", metric.completionRate),
            ("复看", metric.replayRate),
            ("转粉", metric.followConversionRate),
            ("搜索流量", metric.searchImpressionRate),
            ("同城流量", metric.localTrafficRate),
        ]
    elif account.platform == "wechat_channels":
        fields = [
            ("好友点赞", metric.friendLikeRate),
            ("社交转发", metric.socialShareRate),
            ("初诊点击", metric.privateDomainClickRate),
            ("公众号点击", metric.officialAccountClickRate),
            ("直播预约", metric.liveReservationRate),
            ("完播", metric.completionRate),
        ]
    else:
        fields = [("完播", metric.completionRate), ("搜索流量", metric.searchImpressionRate)]
    known = [f"{label}{value:g}%" for label, value in fields if value is not None]
    return "，".join(known) if known else "已有通用指标，平台算法字段待补齐"


def _memory_completeness(memory: AccountMemory) -> int:
    score = 0
    if memory.targetAudience:
        score += 18
    if memory.contentPillars:
        score += 18
    if memory.conversionGoal:
        score += 14
    if memory.personaTone:
        score += 10
    if memory.highPerformingPatterns:
        score += 12
    if memory.lowPerformingPatterns:
        score += 8
    if memory.avoidTopics:
        score += 10
    if memory.commentStrategy:
        score += 5
    if memory.privateDomainStrategy:
        score += 5
    return _clamp_score(score)


def _memory_summary(memory: AccountMemory) -> str:
    parts: list[str] = []
    if memory.targetAudience:
        parts.append(f"目标人群：{'、'.join(memory.targetAudience[:3])}")
    if memory.contentPillars:
        parts.append(f"内容支柱：{'、'.join(memory.contentPillars[:3])}")
    if memory.conversionGoal:
        parts.append(f"转化目标：{memory.conversionGoal}")
    return "；".join(parts) if parts else "账号长期画像尚未补齐"


def _latest_metric_or_default(account: Account, latest: MetricSnapshot | None, period_days: int) -> AccountMetricSnapshotRequest:
    if latest:
        return AccountMetricSnapshotRequest(
            accountId=account.id,
            source="simulated",
            periodDays=period_days,
            followers=latest.followers,
            plays=latest.plays,
            likes=latest.likes,
            comments=latest.comments,
            shares=latest.shares,
            avgViewDurationSeconds=latest.avgViewDurationSeconds,
            threeSecondRetentionRate=latest.threeSecondRetentionRate,
            completionRate=latest.completionRate,
            replayRate=latest.replayRate,
            followConversionRate=latest.followConversionRate,
            profileVisitRate=latest.profileVisitRate,
            searchImpressionRate=latest.searchImpressionRate,
            localTrafficRate=latest.localTrafficRate,
            socialShareRate=latest.socialShareRate,
            friendLikeRate=latest.friendLikeRate,
            privateDomainClickRate=latest.privateDomainClickRate,
            officialAccountClickRate=latest.officialAccountClickRate,
            liveReservationRate=latest.liveReservationRate,
            trafficFieldBreakdown=latest.trafficFieldBreakdown,
            topContentTags=latest.topContentTags,
        )
    return AccountMetricSnapshotRequest(
        accountId=account.id,
        source="simulated",
        periodDays=period_days,
        followers=1200 if account.platform == "douyin" else 900,
        plays=18000 if account.platform == "douyin" else 9000,
        likes=980 if account.platform == "douyin" else 420,
        comments=90 if account.platform == "douyin" else 45,
        shares=120 if account.platform == "douyin" else 80,
    )


def _simulate_metric_request(account: Account, latest: MetricSnapshot | None, period_days: int, sequence: int) -> AccountMetricSnapshotRequest:
    base = _latest_metric_or_default(account, latest, period_days)
    lift = 1 + min(0.18, (sequence % 7) * 0.025)
    base.followers = int(base.followers + max(3, base.followers * 0.006 * lift))
    base.plays = int(max(1, base.plays * lift))
    base.likes = int(max(1, base.likes * (lift + 0.015)))
    base.comments = int(max(0, base.comments * (lift + 0.01)))
    base.shares = int(max(0, base.shares * (lift + 0.012)))
    base.avgViewDurationSeconds = round((base.avgViewDurationSeconds or 18.0) + 0.2 * (sequence % 5), 1)
    if account.platform == "douyin":
        base.threeSecondRetentionRate = min(100, round((base.threeSecondRetentionRate or 56) + 1.2 * (sequence % 5), 1))
        base.completionRate = min(100, round((base.completionRate or 36) + 0.8 * (sequence % 4), 1))
        base.replayRate = min(100, round((base.replayRate or 8) + 0.4 * (sequence % 4), 1))
        base.followConversionRate = min(100, round((base.followConversionRate or 1.2) + 0.15 * (sequence % 4), 2))
        base.searchImpressionRate = min(100, round((base.searchImpressionRate or 16) + 0.7 * (sequence % 4), 1))
        base.localTrafficRate = min(100, round((base.localTrafficRate or 18) + 0.6 * (sequence % 4), 1))
        base.trafficFieldBreakdown = {
            "interest": max(0, round(100 - (base.searchImpressionRate or 0) - (base.localTrafficRate or 0), 1)),
            "search": base.searchImpressionRate or 0,
            "local": base.localTrafficRate or 0,
        }
    elif account.platform == "wechat_channels":
        base.completionRate = min(100, round((base.completionRate or 38) + 0.9 * (sequence % 4), 1))
        base.replayRate = min(100, round((base.replayRate or 6) + 0.35 * (sequence % 4), 1))
        base.socialShareRate = min(100, round((base.socialShareRate or 5) + 0.45 * (sequence % 5), 1))
        base.friendLikeRate = min(100, round((base.friendLikeRate or 9) + 0.5 * (sequence % 5), 1))
        base.privateDomainClickRate = min(100, round((base.privateDomainClickRate or 1.6) + 0.18 * (sequence % 4), 2))
        base.officialAccountClickRate = min(100, round((base.officialAccountClickRate or 1) + 0.14 * (sequence % 4), 2))
        base.liveReservationRate = min(100, round((base.liveReservationRate or 0.4) + 0.08 * (sequence % 4), 2))
        base.trafficFieldBreakdown = {
            "social": base.socialShareRate or 0,
            "private_domain": base.privateDomainClickRate or 0,
            "recommend": max(0, round(100 - (base.socialShareRate or 0) - (base.privateDomainClickRate or 0), 1)),
        }
    if not base.topContentTags:
        base.topContentTags = account.memory.contentPillars[:4] or [PLATFORM_LABELS[account.platform], "账号采集"]
    return base


def collect_account_metrics(db: OperationsDb, req: AccountMetricCollectRequest) -> MetricCollectionJob | str:
    account = _find_account(db, req.accountId or "")
    if not account:
        return "account_not_found"
    if req.source != "simulated" and account.platform not in DIRECT_MESSAGE_PLATFORMS:
        return "platform_not_supported"

    now = now_iso()
    job = MetricCollectionJob(
        id=str(uuid4()),
        accountId=account.id,
        platform=account.platform,
        source=req.source,
        status="running",
        periodDays=req.periodDays,
        logs=[log(f"已创建 {PLATFORM_LABELS[account.platform]} 指标采集任务，来源：{req.source}")],
        createdAt=now,
        startedAt=now,
        updatedAt=now,
    )
    db.metricCollectionJobs.insert(0, job)

    if req.source != "simulated":
        session_ok, session_message, _ = check_session(account)
        if not session_ok:
            job.status = "needs_login"
            job.errorMessage = session_message
            job.logs.insert(0, log(session_message, "warn"))
        else:
            job.status = "failed"
            job.errorMessage = "collector_adapter_not_implemented"
            job.logs.insert(0, log("真实平台采集适配器尚未接入；请先使用模拟采集验证任务链路", "warn"))
    else:
        latest = _latest_metric(db, account.id)
        metric_request = _simulate_metric_request(account, latest, req.periodDays, len(db.metricCollectionJobs))
        metric = record_account_metric_snapshot(db, metric_request)
        if isinstance(metric, str):
            job.status = "failed"
            job.errorMessage = metric
            job.logs.insert(0, log(metric, "error"))
        else:
            job.status = "succeeded"
            job.resultMetricId = metric.id
            job.logs.insert(0, log(f"模拟采集完成，已生成指标快照 {metric.id}"))

    job.finishedAt = now_iso()
    job.updatedAt = job.finishedAt
    db.metricCollectionJobs = db.metricCollectionJobs[:100]
    return job


def get_content_patterns() -> list[ContentPattern]:
    return [ContentPattern(**pattern.model_dump()) for pattern in CONTENT_PATTERN_LIBRARY]


def _infer_creator_role(account: Account) -> str:
    text = f"{account.displayName} {account.profile} {' '.join(account.memory.contentPillars)}"
    if any(word in text for word in ["民宿", "酒店", "文旅", "房型", "入住体验"]):
        return "民宿酒店设计增长账号"
    if any(word in text for word in ["办公", "办公室", "企业展厅", "会议区", "前台", "动线"]):
        return "办公空间设计增长账号"
    if any(word in text for word in ["设计", "空间", "案例", "改造", "材料", "施工"]):
        return "空间设计服务型账号"
    if account.platform == "xiaohongshu":
        return "设计案例灵感账号"
    return "设计公司内容运营账号"


def _infer_creator_stage(metric: MetricSnapshot | None) -> str:
    if not metric:
        return "冷启动校准期"
    if metric.followers >= 50000:
        return "放大复制期"
    if metric.followers >= 5000:
        return "稳定增长期"
    return "起号验证期"


def _creator_profile_for_account(account: Account, metric: MetricSnapshot | None) -> CreatorProfile:
    memory = account.memory
    memory_score = _memory_completeness(memory)
    metric_bonus = 0
    if metric:
        metric_bonus += 8 if metric.plays >= 10000 else 2
        metric_bonus += 6 if (metric.comments + metric.shares) >= max(30, metric.likes * 0.08) else 0
        metric_bonus += 5 if (metric.completionRate or 0) >= 35 else 0
        metric_bonus += 4 if (metric.searchImpressionRate or 0) >= 15 else 0

    strengths = [
        *memory.highPerformingPatterns[:3],
        "内容支柱清晰" if memory.contentPillars else "",
        "人群定位可复用" if memory.targetAudience else "",
        "已有平台数据可用于复盘" if metric else "",
    ]
    weaknesses = [
        *memory.lowPerformingPatterns[:3],
        "目标人群仍需补齐" if not memory.targetAudience else "",
        "内容支柱仍需收敛" if not memory.contentPillars else "",
        "缺少近 7 天平台快照" if not metric else "",
        "前 3 秒留存偏弱" if metric and metric.threeSecondRetentionRate is not None and metric.threeSecondRetentionRate < 55 else "",
        "完播率偏弱" if metric and metric.completionRate is not None and metric.completionRate < 30 else "",
    ]
    constraints = [
        *memory.avoidTopics[:3],
        "发布前避免夸大承诺和无授权素材",
        "小红书账号当前以内容建议和草稿优化为主" if account.platform == "xiaohongshu" else "",
    ]
    strengths = _unique_limited(strengths, 5)
    weaknesses = _unique_limited(weaknesses, 5)
    constraints = _unique_limited(constraints, 5)
    role = _infer_creator_role(account)
    stage = _infer_creator_stage(metric)
    readiness = _clamp_score(42 + memory_score * 0.42 + metric_bonus)
    summary = f"{account.displayName} 当前更适合按“{role}”来设计内容，阶段是{stage}；{_memory_summary(memory)}。"
    return CreatorProfile(
        role=role,
        stage=stage,
        strengths=strengths or ["已有账号和发布链路，可开始做选题验证"],
        weaknesses=weaknesses or ["需要通过连续发布复盘找到可复制打法"],
        constraints=constraints,
        summary=summary,
        readinessScore=readiness,
    )


def _score_content_pattern(
    account: Account,
    pattern: ContentPattern,
    metric: MetricSnapshot | None,
    focus_goal: str,
) -> int:
    score = 54
    memory = account.memory
    text = f"{pattern.title} {pattern.bestFor} {pattern.goal}"
    if account.platform in pattern.suitablePlatforms:
        score += 18
    if focus_goal and (focus_goal in pattern.goal or focus_goal in pattern.title or focus_goal in pattern.bestFor):
        score += 12
    if memory.conversionGoal and any(word in pattern.goal for word in ["转化", "信任"]):
        score += 7
    if memory.commentStrategy and any(word in pattern.commentStrategy for word in ["评论", "留言"]):
        score += 5
    if any(pillar and pillar in text for pillar in memory.contentPillars[:4]):
        score += 4
    if metric:
        if (metric.searchImpressionRate or 0) >= 15 and pattern.key == "search_guide":
            score += 8
        if (metric.completionRate or 0) < 32 and pattern.key in {"result_first", "avoid_pitfall"}:
            score += 8
        if (metric.comments + metric.shares) >= max(20, metric.likes * 0.08) and pattern.key == "question_answer":
            score += 6
        if (metric.privateDomainClickRate or 0) >= 1.5 and pattern.key in {"case_breakdown", "comparison"}:
            score += 6
    return _clamp_score(score)


def _recommended_patterns(account: Account, metric: MetricSnapshot | None, focus_goal: str) -> list[ContentPattern]:
    scored = [
        (_score_content_pattern(account, pattern, metric, focus_goal), pattern)
        for pattern in CONTENT_PATTERN_LIBRARY
        if account.platform in pattern.suitablePlatforms
    ]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [ContentPattern(**pattern.model_dump()) for _, pattern in scored[:5]]


def _build_content_idea(
    account: Account,
    pattern: ContentPattern,
    profile: CreatorProfile,
    metric: MetricSnapshot | None,
    index: int,
) -> ContentIdea:
    memory = account.memory
    pillar = (memory.contentPillars or [account.profile or PLATFORM_LABELS[account.platform]])[index % max(1, len(memory.contentPillars or [account.profile]))]
    audience = (memory.targetAudience or ["目标用户"])[index % max(1, len(memory.targetAudience or ["目标用户"]))]
    platform_label = PLATFORM_LABELS[account.platform]
    metric_reason = _metric_signal_summary(account, metric)
    title_map = {
        "result_first": f"{audience}做{pillar}，先看改造后的结果",
        "avoid_pitfall": f"{pillar}最容易花错钱的 3 个坑",
        "comparison": f"{audience}怎么选{pillar}方案，一次讲清",
        "case_breakdown": f"一个真实{pillar}设计案例：问题出在这里",
        "question_answer": f"业主问：{pillar}到底值不值得做？",
        "daily_record": f"今天这个{pillar}细节，适合{audience}参考",
        "search_guide": f"{pillar}攻略：预算、步骤和避坑清单",
    }
    title = _clip_title(title_map.get(pattern.key, f"{pillar}：给{audience}的下一条内容"), account.platform)
    hook = pattern.hookTemplate.replace("{pillar}", pillar).replace("{audience}", audience)
    cta = memory.commentStrategy or ("评论关键词领取设计清单" if account.platform != "wechat_channels" else "评论区留下空间类型和面积，我按情况给建议")
    tags = _unique_limited([platform_label, pillar, audience, pattern.title, *memory.contentPillars[:2]], 6)
    materials = [
        f"{pillar}相关真实空间画面、平面图或前后对比",
        f"{audience}最关心的 1 个项目问题",
        "一条可被复用的项目初诊承接话术",
    ]
    return ContentIdea(
        id=str(uuid4()),
        accountId=account.id,
        platform=account.platform,
        patternKey=pattern.key,
        goal=pattern.goal,
        title=title,
        hook=hook,
        outline=pattern.scriptStructure,
        materialChecklist=materials,
        reason=f"{profile.stage}优先验证“{pattern.title}”；当前信号：{metric_reason}。",
        cta=cta,
        tags=tags,
        score=_clamp_score(profile.readinessScore + 8 - index * 3),
    )


def generate_creator_coach(db: OperationsDb, req: CreatorCoachRequest) -> CreatorCoachReport | str:
    account = _find_account(db, req.accountId or "")
    if not account:
        return "account_not_found"

    metric = _latest_metric(db, account.id)
    profile = _creator_profile_for_account(account, metric)
    patterns = _recommended_patterns(account, metric, req.focusGoal.strip())
    ideas = [
        _build_content_idea(account, pattern, profile, metric, index)
        for index, pattern in enumerate(patterns[: req.ideaCount])
    ]
    next_actions = [
        "先选评分最高的 1 条选题完成标题、前 3 秒钩子和素材清单。",
        "发布后补一条近 7 天数据快照，再让教练复盘打法是否可复制。",
    ]
    if not account.memory.targetAudience or not account.memory.contentPillars:
        next_actions.insert(0, "先补齐账号长期记忆里的目标人群和内容支柱。")
    if profile.weaknesses:
        next_actions.append(f"本轮重点修复：{profile.weaknesses[0]}。")

    report = CreatorCoachReport(
        id=str(uuid4()),
        accountId=account.id,
        platform=account.platform,
        profile=profile,
        recommendedPatterns=patterns,
        ideas=ideas,
        nextActions=_unique_limited(next_actions, 5),
        createdAt=now_iso(),
    )
    db.creatorCoachReports.insert(0, report)
    db.creatorCoachReports = db.creatorCoachReports[:100]
    return report


def _agent_stance(score: int) -> str:
    if score >= 88:
        return "优势明确"
    if score >= 75:
        return "基本成立"
    if score >= 60:
        return "存在短板"
    return "优先修复"


def _unique_limited(items: list[str], limit: int) -> list[str]:
    result: list[str] = []
    for item in items:
        value = item.strip()
        if value and value not in result:
            result.append(value)
        if len(result) >= limit:
            break
    return result


def _build_account_diagnosis_chain(
    account: Account,
    memory: AccountMemory,
    metric: MetricSnapshot | None,
    drafts: list[PlatformDraft],
    tasks: list[PublishTask],
    failed_tasks: list[PublishTask],
    scheduled_tasks: list[PublishTask],
    pending_tasks: list[PublishTask],
    unread_alerts: list[DirectMessageAlert],
    health_score: int,
    profile_score: int,
    memory_score: int,
    engagement_score: int,
    algorithm_score: int,
    operation_score: int,
    response_score: int,
    session_ok: bool,
    session_message: str,
) -> tuple[list[AccountDiagnosisStage], list[AccountDiagnosisAgentOpinion], list[AccountDiagnosisDebateTurn], str]:
    platform_label = PLATFORM_LABELS[account.platform]
    workflow = [
        AccountDiagnosisStage(
            key="snapshot",
            label="读取账号快照",
            status="done" if session_ok else "warn",
            summary=f"读取登录态、账号记忆、近 7 天指标、草稿任务和私信未读计数；{session_message}",
        ),
        AccountDiagnosisStage(
            key="baseline",
            label="账号记忆与平台 baseline 对比",
            status="done" if metric else "warn",
            summary=f"{platform_label}推荐信号：{_metric_signal_summary(account, metric)}；账号记忆完整度 {memory_score} 分",
        ),
        AccountDiagnosisStage(
            key="agents",
            label="专家 Agent 独立诊断",
            status="done",
            summary="账号定位、平台算法、内容管线、互动转化、外部技能、风险控制 6 个 Agent 独立给出结论",
        ),
        AccountDiagnosisStage(
            key="debate",
            label="Agent 互相讨论",
            status="done",
            summary="各 Agent 围绕推荐适配、内容节奏、转化承接和风险点互相补充",
        ),
        AccountDiagnosisStage(
            key="judge",
            label="JudgeAgent 汇总",
            status="done",
            summary="汇总成最终评分、优先级建议和风险提醒",
        ),
    ]

    positioning_evidence = [
        account.profile or "账号定位未填写",
        _memory_summary(memory),
    ]
    if memory.avoidTopics:
        positioning_evidence.append(f"已记录选题禁区：{'、'.join(memory.avoidTopics[:3])}")
    positioning_suggestions = []
    if memory_score < 80:
        positioning_suggestions.append("继续补齐目标业主/企业客户、内容支柱、有效案例规律和低效内容规律。")
    if not memory.conversionGoal:
        positioning_suggestions.append("补齐明确转化目标，让内容建议能落到评论、私信、项目初诊或案例预约动作。")

    algorithm_suggestions = []
    if account.platform == "douyin":
        if not metric or metric.threeSecondRetentionRate is None:
            algorithm_suggestions.append("补齐抖音 3 秒留存数据，判断首帧的前后对比、平面图或空间结果是否能进入二级流量池。")
        if metric and metric.completionRate is not None and metric.completionRate < 40:
            algorithm_suggestions.append("优先按“项目问题 -> 设计动作 -> 结果边界”重排脚本，提升完播和复看。")
    else:
        if not metric or metric.socialShareRate is None:
            algorithm_suggestions.append("补齐视频号社交转发和好友点赞数据，判断熟人关系链扩散能力。")
        if metric and metric.privateDomainClickRate is not None and metric.privateDomainClickRate < 2:
            algorithm_suggestions.append("强化公众号、评论关键词或直播预约承接。")

    content_suggestions = []
    if pending_tasks:
        content_suggestions.append("先处理待审核任务，避免诊断建议停留在草稿层。")
    if not scheduled_tasks:
        content_suggestions.append("建立稳定排期，让民宿酒店设计和办公空间设计两条内容线持续积累账号标签。")
    if drafts and memory.highPerformingPatterns:
        content_suggestions.append("把历史高表现规律写入下一批草稿标题和前 3 秒结构。")

    conversion_suggestions = []
    if unread_alerts:
        conversion_suggestions.append("优先处理未读私信提醒，避免互动承接断层。")
    if not memory.commentStrategy:
        conversion_suggestions.append("补齐评论区关键词、置顶评论和项目问题承接策略。")
    if account.platform == "wechat_channels" and not memory.privateDomainStrategy:
        conversion_suggestions.append("补齐视频号项目初诊承接路径，如公众号案例、项目初诊预约或人工咨询。")

    risk_suggestions = []
    risk_items: list[str] = []
    if not session_ok:
        risk_items.append("登录态失效")
        risk_suggestions.append("先重新登录独立账号窗口，再执行采集和发布动作。")
    if failed_tasks:
        risk_items.append(f"失败任务 {len(failed_tasks)} 个")
        risk_suggestions.append("排查失败任务的素材、登录态或平台限制原因。")
    if not memory.avoidTopics:
        risk_items.append("未记录选题禁区")
        risk_suggestions.append("补齐授权案例、收益承诺、客户隐私和施工边界等禁区，降低多账号内容漂移风险。")

    risk_score = _clamp_score((health_score * 0.45) + (operation_score * 0.25) + (memory_score * 0.2) + (response_score * 0.1))
    external_score = _clamp_score((engagement_score * 0.3) + (algorithm_score * 0.25) + (response_score * 0.25) + (memory_score * 0.2))
    external_skill_names = "、".join(skill["name"] for skill in EXTERNAL_DIAGNOSIS_SKILLS)
    external_evidence = [
        f"参考外部技能：{external_skill_names}",
        f"当前可用数据：{'已有指标快照' if metric else '暂无近 7/30 天指标快照'}，草稿 {len(drafts)} 条，任务 {len(tasks)} 个，评论策略：{memory.commentStrategy or '待补齐'}",
        "诊断范围限定在内容报告、评论情绪、话题趋势和开源运营系统参考，不参与发布执行。",
    ]
    external_suggestions = []
    if not metric:
        external_suggestions.append("先补齐近 7/30 天播放、评论、完播、收藏和转化数据，让外部诊断视角可落到真实数据。")
    if not memory.commentStrategy:
        external_suggestions.append("补齐评论和私信承接策略，便于做情绪与转化闭环诊断。")
    if not drafts and not tasks:
        external_suggestions.append("积累发布任务和内容样本，后续做内容报告和话题复盘。")
    if metric and metric.comments > 0 and memory.commentStrategy:
        external_suggestions.append("把评论关键词、私信线索和高表现选题放到同一张复盘表里，下一轮诊断优先判断内容是否带来有效咨询。")

    opinions = [
        AccountDiagnosisAgentOpinion(
            agentName="账号定位 Agent",
            focus="账号人群、定位、长期记忆",
            score=_clamp_score((profile_score * 0.45) + (memory_score * 0.55)),
            stance=_agent_stance(_clamp_score((profile_score * 0.45) + (memory_score * 0.55))),
            evidence=positioning_evidence,
            suggestions=positioning_suggestions or ["账号定位和长期记忆可继续作为内容生成的主约束。"],
            risks=[] if memory.avoidTopics else ["缺少选题禁区会让多账号内容边界不稳定。"],
        ),
        AccountDiagnosisAgentOpinion(
            agentName=f"{platform_label}算法 Agent",
            focus="推荐池、关键指标、平台分发路径",
            score=algorithm_score,
            stance=_agent_stance(algorithm_score),
            evidence=[_metric_signal_summary(account, metric), f"互动数据评分 {engagement_score} 分"],
            suggestions=algorithm_suggestions or ["当前平台算法信号基本成立，下一步用真实采集数据持续校准。"],
            risks=[] if metric else ["缺少平台关键指标时，算法判断依赖草稿结构和历史记忆。"],
        ),
        AccountDiagnosisAgentOpinion(
            agentName="内容管线 Agent",
            focus="草稿、排期、任务执行节奏",
            score=operation_score,
            stance=_agent_stance(operation_score),
            evidence=[f"草稿 {len(drafts)} 条", f"已排期 {len(scheduled_tasks)} 条", f"待审核 {len(pending_tasks)} 条"],
            suggestions=content_suggestions or ["内容管线基本连贯，建议保持差异化排期和复盘节奏。"],
            risks=[f"存在失败任务 {len(failed_tasks)} 个"] if failed_tasks else [],
        ),
        AccountDiagnosisAgentOpinion(
            agentName="互动转化 Agent",
            focus="评论、私信、项目初诊承接",
            score=response_score,
            stance=_agent_stance(response_score),
            evidence=[f"未读私信提醒 {len(unread_alerts)} 条", memory.commentStrategy or "评论承接未记录", memory.privateDomainStrategy or "项目初诊承接未记录"],
            suggestions=conversion_suggestions or ["互动承接可用，后续重点跟踪评论关键词和私信响应时效。"],
            risks=["私信提醒未处理"] if unread_alerts else [],
        ),
        AccountDiagnosisAgentOpinion(
            agentName="外部技能 Agent",
            focus="内容报告、评论情绪、话题趋势、运营系统参考",
            score=external_score,
            stance=_agent_stance(external_score),
            evidence=external_evidence,
            suggestions=external_suggestions or ["外部诊断视角已有基础数据，建议固定每周做内容报告、评论情绪和话题趋势复盘。"],
            risks=[] if metric and memory.commentStrategy else ["外部技能诊断缺少完整指标或评论承接数据，结论需要继续校准。"],
        ),
        AccountDiagnosisAgentOpinion(
            agentName="风险控制 Agent",
            focus="登录态、禁区、任务异常、平台限制",
            score=risk_score,
            stance=_agent_stance(risk_score),
            evidence=[session_message, *(risk_items or ["暂无明显阻塞风险"])],
            suggestions=risk_suggestions or ["保持禁区、发布频率和账号登录态监控。"],
            risks=risk_items,
        ),
    ]

    weakest = min(opinions, key=lambda item: item.score)
    strongest = max(opinions, key=lambda item: item.score)
    debate = [
        AccountDiagnosisDebateTurn(
            round=1,
            agentName=f"{platform_label}算法 Agent",
            kind="challenge" if algorithm_score < 75 else "agree",
            message=(
                f"推荐适配分 {algorithm_score}，需要优先补强平台关键指标。"
                if algorithm_score < 75
                else f"推荐适配分 {algorithm_score}，平台信号可作为下一轮内容排期依据。"
            ),
        ),
        AccountDiagnosisDebateTurn(
            round=1,
            agentName="账号定位 Agent",
            kind="add",
            message=f"长期记忆完整度 {memory_score} 分，后续草稿必须围绕“{memory.conversionGoal or account.profile or '账号定位'}”生成。",
        ),
        AccountDiagnosisDebateTurn(
            round=2,
            agentName="内容管线 Agent",
            kind="challenge" if pending_tasks or failed_tasks else "agree",
            message=f"当前草稿 {len(drafts)} 条、排期 {len(scheduled_tasks)} 条、失败 {len(failed_tasks)} 条，运营动作需要和诊断建议同步。",
        ),
        AccountDiagnosisDebateTurn(
            round=2,
            agentName="互动转化 Agent",
            kind="add",
            message=f"转化承接要看评论和私信闭环，当前未读提醒 {len(unread_alerts)} 条，评论策略：{memory.commentStrategy or '待补齐'}。",
        ),
        AccountDiagnosisDebateTurn(
            round=3,
            agentName="外部技能 Agent",
            kind="challenge" if not metric or not memory.commentStrategy else "add",
            message=(
                "外部技能适合做账号诊断和内容复盘，但需要先沉淀真实指标、评论和任务样本。"
                if not metric or not memory.commentStrategy
                else "外部技能可以基于当前指标和评论策略，补充内容报告、情绪判断和话题趋势复盘。"
            ),
        ),
        AccountDiagnosisDebateTurn(
            round=3,
            agentName="风险控制 Agent",
            kind="challenge" if risk_items else "agree",
            message="；".join(risk_items) if risk_items else "登录态、禁区和任务状态未发现明显阻塞。",
        ),
    ]
    judge_summary = (
        f"JudgeAgent 汇总：本次账号诊断由 {len(opinions)} 个专家 Agent 完成。"
        f"当前最强项是“{strongest.agentName}”（{strongest.score} 分），"
        f"最需要优先处理的是“{weakest.agentName}”（{weakest.score} 分）。"
        f"下一步应围绕“{memory.conversionGoal or account.profile or '项目线索增长目标'}”把诊断建议转成草稿、排期和复盘数据。"
    )
    debate.append(AccountDiagnosisDebateTurn(round=3, agentName="JudgeAgent", kind="judge", message=judge_summary))
    return workflow, opinions, debate, judge_summary


def _first_or(items: list[str], default: str) -> str:
    return next((item for item in items if item.strip()), default)


def _build_diagnosis_actions(
    account: Account,
    memory: AccountMemory,
    metric: MetricSnapshot | None,
    report_id: str,
) -> list[AccountDiagnosisAction]:
    platform_label = PLATFORM_LABELS[account.platform]
    topic = _first_or(memory.contentPillars, account.profile or "下一条内容")
    audience = _first_or(memory.targetAudience, "目标用户")
    conversion = memory.conversionGoal or memory.commentStrategy or "评论区项目问题承接"
    tone = memory.personaTone or "真实、具体、结果前置"
    high_pattern = _first_or(memory.highPerformingPatterns, "先给结果，再给证据和步骤")
    avoid_text = "、".join(memory.avoidTopics[:3]) if memory.avoidTopics else "夸大承诺、绝对化表达、无授权素材"
    metric_signal = _metric_signal_summary(account, metric)
    tags = list(dict.fromkeys([platform_label, topic, *memory.contentPillars[:3], *(metric.topContentTags[:2] if metric else [])]))[:6]

    if account.platform == "douyin":
        title = _clip_title(f"{topic}别再乱做了，{audience}先看这条", account.platform)
        hook = f"前3秒：直接给改造结果和适合人群，例如“{audience}做{topic}，先看这 3 个设计避坑点”。"
        structure = (
            f"{hook}\n"
            f"正文：按“结果 -> 原始问题 -> 设计动作 -> 前后对比 -> 评论关键词”重排，保留 {tone}。\n"
            f"算法侧：围绕 {metric_signal}，每 5-8 秒设置一个明确的信息点，减少铺垫。\n"
            f"结尾：用“评论区发关键词”承接到 {conversion}。"
        )
        comment = f"置顶评论：想要{topic}设计清单/预算边界的，评论关键词，我按{audience}的情况发你。"
    elif account.platform == "wechat_channels":
        title = _clip_title(f"这条适合转给正在关注{topic}的人", account.platform)
        hook = f"前3秒：先说明“这条适合转给{audience}”，再给一个可验证结果。"
        structure = (
            f"{hook}\n"
            f"正文：按“项目场景 -> 设计证据 -> 转发理由 -> 初诊承接”重排，语气保持 {tone}。\n"
            f"社交侧：围绕 {metric_signal}，强化熟人关系链里的转发理由。\n"
            f"结尾：引导到 {conversion}，保留人工确认动作。"
        )
        comment = f"置顶评论：需要{topic}案例、面积预算判断或预约入口的，可以留言，我按你的情况补充下一步。"
    else:
        title = _clip_title(f"{topic}亲测版：适合{audience}", account.platform)
        hook = f"开头：先给结论和适合谁，避免只发灵感美图。"
        structure = (
            f"{hook}\n"
            f"正文：按“体验 -> 预算 -> 避坑 -> 适合人群”重排，语气保持 {tone}。\n"
            f"结尾：引导收藏、评论咨询和后续对比。"
        )
        comment = f"置顶评论：需要{topic}设计清单的可以评论，我整理成可收藏版本。"

    return [
        AccountDiagnosisAction(
            key="title_hook",
            kind="title_hook",
            priority="high",
            title="生成标题和前 3 秒钩子",
            summary=f"把诊断里的平台算法建议落到首屏表达，优先解决推荐池进入效率。",
            suggestedTitle=title,
            suggestedContent=f"{hook}\n\n{structure}",
            tags=tags,
            applyLabel="导入标题草稿",
        ),
        AccountDiagnosisAction(
            key="script_revision",
            kind="script_revision",
            priority="high",
            title="生成改版脚本草稿",
            summary=f"复用账号高表现规律：{high_pattern}。",
            suggestedTitle=_clip_title(f"{title}｜改版脚本", account.platform),
            suggestedContent=f"{structure}\n\n素材检查：避开 {avoid_text}。\n诊断来源：{report_id}",
            tags=tags,
            applyLabel="导入脚本草稿",
        ),
        AccountDiagnosisAction(
            key="comment_reply",
            kind="comment_reply",
            priority="medium",
            title="生成评论区承接话术",
            summary="把互动转化建议落到置顶评论和关键词承接。",
            suggestedTitle=_clip_title(f"{topic}评论承接话术", account.platform),
            suggestedContent=f"{comment}\n\n回复模板：先确认用户场景，再给 1 个具体建议，最后引导到 {conversion}。",
            tags=list(dict.fromkeys([platform_label, "评论承接", topic]))[:6],
            applyLabel="导入话术草稿",
        ),
        AccountDiagnosisAction(
            key="publish_task",
            kind="publish_task",
            priority="medium",
            title="创建待审核发布任务",
            summary="把本次诊断结论转为待审核任务，进入发布日历和 Agent 发布托管。",
            suggestedTitle=title,
            suggestedContent=f"{structure}\n\n置顶评论：{comment}",
            tags=tags,
            applyLabel="创建任务",
        ),
    ]


def record_account_metric_snapshot(db: OperationsDb, req: AccountMetricSnapshotRequest) -> MetricSnapshot | str:
    account = _find_account(db, req.accountId or "")
    if not account:
        return "account_not_found"

    now = now_iso()
    snapshot = MetricSnapshot(
        id=str(uuid4()),
        accountId=account.id,
        platform=account.platform,
        source=req.source,
        periodDays=req.periodDays,
        followers=req.followers,
        plays=req.plays,
        likes=req.likes,
        comments=req.comments,
        shares=req.shares,
        avgViewDurationSeconds=req.avgViewDurationSeconds,
        threeSecondRetentionRate=req.threeSecondRetentionRate,
        completionRate=req.completionRate,
        replayRate=req.replayRate,
        followConversionRate=req.followConversionRate,
        profileVisitRate=req.profileVisitRate,
        searchImpressionRate=req.searchImpressionRate,
        localTrafficRate=req.localTrafficRate,
        socialShareRate=req.socialShareRate,
        friendLikeRate=req.friendLikeRate,
        privateDomainClickRate=req.privateDomainClickRate,
        officialAccountClickRate=req.officialAccountClickRate,
        liveReservationRate=req.liveReservationRate,
        trafficFieldBreakdown=req.trafficFieldBreakdown,
        topContentTags=req.topContentTags,
        capturedAt=now,
    )
    db.metrics.insert(0, snapshot)
    db.metrics = db.metrics[:300]
    return snapshot


def diagnose_account(db: OperationsDb, req: AccountDiagnoseRequest) -> AccountDiagnosisReport | str:
    sync_direct_message_monitors(db)
    account_id = req.accountId or ""
    account = _find_account(db, account_id)
    if not account:
        return "account_not_found"
    if account.platform not in ACCOUNT_DIAGNOSIS_PLATFORMS:
        return "platform_not_supported"

    ensure_account_browser_profile(account)
    session_ok, session_message, session_mode = check_session(account)
    memory = account.memory
    memory_score = _memory_completeness(memory)
    drafts = [item for item in db.drafts if item.accountId == account.id]
    tasks = [item for item in db.tasks if item.accountId == account.id]
    metric = _latest_metric(db, account.id)
    dm_monitor = _find_direct_message_monitor(db, account.id)
    unread_alerts = [
        item
        for item in db.directMessageAlerts
        if item.accountId == account.id and item.status == "unread"
    ]

    failed_tasks = [item for item in tasks if item.status == "failed"]
    scheduled_tasks = [item for item in tasks if item.status == "scheduled"]
    pending_tasks = [item for item in tasks if item.status == "pending_review"]
    ready_drafts = [item for item in drafts if item.readiness == "ready"]
    review_drafts = [item for item in drafts if item.readiness == "needs_review"]

    health_score = 92 if session_ok else 42
    if account.status == "connected" and account.sessionHealth == "healthy":
        health_score += 4
    if req.readLoggedInWorkspace and account.authType == "browser_session" and account.browserProfileDir:
        health_score += 2
    health_score = _clamp_score(health_score)

    profile_score = 55
    if account.profile.strip():
        profile_score += 18
    if len(account.profile.strip()) >= 12:
        profile_score += 10
    if account.dailyPublishLimit >= 2:
        profile_score += 6
    if account.publishedToday <= account.dailyPublishLimit:
        profile_score += 6
    profile_score += memory_score * 0.12
    profile_score = _clamp_score(profile_score)

    if metric:
        plays = max(metric.plays, 1)
        interaction_rate = (metric.likes + metric.comments * 3 + metric.shares * 4) / plays
        engagement_score = 50 + interaction_rate * 900
        if metric.followers >= 1000:
            engagement_score += 8
        if metric.comments > 0 and metric.shares > 0:
            engagement_score += 8
        if account.platform == "douyin":
            engagement_score += _optional_rate_bonus(metric.threeSecondRetentionRate, 48, 0.35, 10)
            engagement_score += _optional_rate_bonus(metric.completionRate, 32, 0.28, 8)
            engagement_score += _optional_rate_bonus(metric.followConversionRate, 1.2, 2.0, 6)
        elif account.platform == "wechat_channels":
            engagement_score += _optional_rate_bonus(metric.friendLikeRate, 8, 0.55, 8)
            engagement_score += _optional_rate_bonus(metric.socialShareRate, 4, 0.8, 8)
            engagement_score += _optional_rate_bonus(metric.privateDomainClickRate, 1.5, 1.2, 5)
    else:
        engagement_score = 48
    engagement_score = _clamp_score(engagement_score)

    algorithm_score = 50
    if drafts:
        algorithm_score += min(18, len(drafts) * 4)
    if account.platform == "douyin":
        if any("trafficField" in draft.publishOptions for draft in drafts):
            algorithm_score += 14
        if any("前3秒" in draft.description or "hook" in str(draft.publishOptions) for draft in drafts):
            algorithm_score += 8
        if metric:
            algorithm_score += _optional_rate_bonus(metric.threeSecondRetentionRate, 55, 0.45, 9)
            algorithm_score += _optional_rate_bonus(metric.completionRate, 38, 0.35, 8)
            algorithm_score += _optional_rate_bonus(metric.replayRate, 8, 0.5, 5)
            algorithm_score += _optional_rate_bonus(metric.searchImpressionRate, 16, 0.18, 4)
            algorithm_score += _optional_rate_bonus(metric.localTrafficRate, 18, 0.16, 4)
            if metric.trafficFieldBreakdown:
                algorithm_score += 3
    elif account.platform == "wechat_channels":
        if any("category" in draft.publishOptions for draft in drafts):
            algorithm_score += 14
        if any("初诊" in draft.description or "私域" in draft.description or "转发" in draft.description for draft in drafts):
            algorithm_score += 8
        if metric:
            algorithm_score += _optional_rate_bonus(metric.socialShareRate, 5, 0.75, 8)
            algorithm_score += _optional_rate_bonus(metric.friendLikeRate, 10, 0.45, 6)
            algorithm_score += _optional_rate_bonus(metric.privateDomainClickRate, 2, 1.2, 6)
            algorithm_score += _optional_rate_bonus(metric.officialAccountClickRate, 1, 1.0, 4)
            algorithm_score += _optional_rate_bonus(metric.liveReservationRate, 0.5, 1.4, 4)
            if metric.trafficFieldBreakdown:
                algorithm_score += 3
    else:
        if any("noteStyle" in draft.publishOptions or "coverPriority" in draft.publishOptions for draft in drafts):
            algorithm_score += 14
        if any("收藏" in draft.description or "评论" in draft.description or "设计案例" in draft.description for draft in drafts):
            algorithm_score += 8
        if metric:
            algorithm_score += _optional_rate_bonus(metric.completionRate, 35, 0.3, 8)
            algorithm_score += _optional_rate_bonus(metric.searchImpressionRate, 14, 0.18, 5)
            if metric.topContentTags:
                algorithm_score += 3
    if review_drafts:
        algorithm_score -= min(10, len(review_drafts) * 2)
    algorithm_score = _clamp_score(algorithm_score)

    operation_score = 58
    if scheduled_tasks:
        operation_score += 14
    if ready_drafts:
        operation_score += 8
    if pending_tasks:
        operation_score -= min(12, len(pending_tasks) * 3)
    if failed_tasks:
        operation_score -= min(18, len(failed_tasks) * 6)
    if account.publishedToday > account.dailyPublishLimit:
        operation_score -= 20
    operation_score = _clamp_score(operation_score)

    response_score = 65
    if dm_monitor and dm_monitor.status == "active":
        response_score += 10
    if unread_alerts:
        response_score -= min(25, len(unread_alerts) * 8)
    if metric and metric.comments > 0:
        response_score += 8
    response_score = _clamp_score(response_score)

    weights = {
        "health": 0.18,
        "profile": 0.14,
        "memory": 0.12,
        "engagement": 0.19,
        "algorithm": 0.23,
        "operation": 0.09,
        "response": 0.05,
    }
    overall = _clamp_score(
        health_score * weights["health"]
        + profile_score * weights["profile"]
        + memory_score * weights["memory"]
        + engagement_score * weights["engagement"]
        + algorithm_score * weights["algorithm"]
        + operation_score * weights["operation"]
        + response_score * weights["response"]
    )

    dimensions = [
        AccountDiagnosisDimension(key="health", label="账号登录与档案", score=health_score, summary=session_message),
        AccountDiagnosisDimension(key="profile", label="账号定位", score=profile_score, summary=account.profile or "账号定位尚未补齐"),
        AccountDiagnosisDimension(key="memory", label="长期账号记忆", score=memory_score, summary=_memory_summary(memory)),
        AccountDiagnosisDimension(key="engagement", label="互动数据", score=engagement_score, summary="基于互动率和平台转化信号评估" if metric else "暂无账号指标快照"),
        AccountDiagnosisDimension(key="algorithm", label="平台推荐适配", score=algorithm_score, summary=_metric_signal_summary(account, metric)),
        AccountDiagnosisDimension(key="operation", label="运营节奏", score=operation_score, summary=f"草稿 {len(drafts)} 条，排期 {len(scheduled_tasks)} 条，待审核 {len(pending_tasks)} 条"),
        AccountDiagnosisDimension(key="response", label="互动承接", score=response_score, summary=f"未处理私信提醒 {len(unread_alerts)} 条"),
    ]

    findings = [
        f"账号当前通过 {session_mode} 模式读取状态：{session_message}",
        f"长期账号记忆：{_memory_summary(memory)}。",
        f"当前账号已有 {len(drafts)} 条平台草稿、{len(tasks)} 个发布任务。",
        "诊断窗口已接入外部技能视角：内容报告、评论情绪、话题趋势和开源运营系统参考。",
    ]
    if metric:
        findings.append(
            f"最近快照：粉丝 {metric.followers}，播放 {metric.plays}，点赞 {metric.likes}，评论 {metric.comments}，分享 {metric.shares}。"
        )
        findings.append(f"平台算法信号：{_metric_signal_summary(account, metric)}。")
    if dm_monitor:
        findings.append(f"私信监控状态：{dm_monitor.status}，未读 {dm_monitor.unreadCount} 条。")

    suggestions: list[str] = []
    risks: list[str] = []
    if not session_ok:
        suggestions.append("先打开该账号独立窗口完成登录，再重新执行账号诊断。")
        risks.append("登录态失效会导致无法读取平台后台数据，也无法安全执行发布或私信提醒。")
    if not account.profile.strip():
        suggestions.append("补齐账号定位，至少说明空间设计垂类、目标业主/企业客户、转化目标和禁区。")
    if memory_score < 70:
        suggestions.append("补齐账号长期记忆：目标客户、内容支柱、有效案例规律、低效规律和禁区会直接影响诊断质量。")
    if not memory.avoidTopics:
        risks.append("账号禁区未记录，多账号运营时容易出现未授权案例、夸大收益或过度营销风险。")
    if not memory.highPerformingPatterns:
        suggestions.append("沉淀历史高表现内容规律，后续草稿生成会优先复用这些结构。")
    if account.platform == "douyin":
        if not metric or metric.threeSecondRetentionRate is None or metric.completionRate is None:
            suggestions.append("抖音账号诊断需要补齐近 7 天 3 秒留存、完播率、复看率、关注率和设计内容字段分布。")
        if metric and metric.threeSecondRetentionRate is not None and metric.threeSecondRetentionRate < 55:
            suggestions.append("抖音 3 秒留存偏低，优先把改造结果、原始问题、平面图或空间冲突前置。")
        if metric and metric.completionRate is not None and metric.completionRate < 38:
            suggestions.append("抖音完播率偏低，缩短铺垫，按 5-8 秒一个信息点重排脚本。")
        if not any("trafficField" in draft.publishOptions for draft in drafts):
            suggestions.append("为抖音草稿补齐设计内容字段，区分民宿酒店设计、办公空间设计、搜索答疑或线索承接目标。")
    elif account.platform == "wechat_channels":
        if not metric or metric.socialShareRate is None or metric.privateDomainClickRate is None:
            suggestions.append("视频号账号诊断需要补齐好友转发、社交点赞、公众号案例/项目初诊和预约咨询数据。")
        if metric and metric.socialShareRate is not None and metric.socialShareRate < 5:
            suggestions.append("视频号社交转发偏弱，标题和结尾需要增加转发理由、适合人群和关系链触发点。")
        if metric and metric.privateDomainClickRate is not None and metric.privateDomainClickRate < 2:
            suggestions.append("视频号项目初诊承接偏弱，补充评论关键词、公众号案例或项目初诊预约动作。")
        if not any("初诊" in draft.description or "私域" in draft.description for draft in drafts):
            suggestions.append("视频号内容需要增加适合老板/业主转发的理由和项目初诊承接动作。")
    else:
        if not metric:
            suggestions.append("小红书账号诊断先补齐近 7/30 天笔记曝光、收藏、评论、搜索词和主页访问数据。")
        if not any("设计案例" in draft.description or "预算" in draft.description for draft in drafts):
            suggestions.append("小红书草稿需要更明确地拆出设计案例、预算边界、适合人群和收藏理由。")
        if not any("封面" in draft.description or "coverPriority" in str(draft.publishOptions) for draft in drafts):
            suggestions.append("小红书优先补强封面标题、前后对比和首屏信息密度，让用户有收藏和评论理由。")
    if pending_tasks:
        suggestions.append("清理待审核任务，把可发布内容推进排期，避免诊断建议停留在草稿层。")
    if failed_tasks:
        risks.append("存在失败任务，需要先处理素材、登录态或平台限制问题。")
    if unread_alerts:
        suggestions.append("先处理未读私信提醒，避免账号互动承接分下降。")

    workflow_stages, agent_opinions, debate_timeline, judge_summary = _build_account_diagnosis_chain(
        account=account,
        memory=memory,
        metric=metric,
        drafts=drafts,
        tasks=tasks,
        failed_tasks=failed_tasks,
        scheduled_tasks=scheduled_tasks,
        pending_tasks=pending_tasks,
        unread_alerts=unread_alerts,
        health_score=health_score,
        profile_score=profile_score,
        memory_score=memory_score,
        engagement_score=engagement_score,
        algorithm_score=algorithm_score,
        operation_score=operation_score,
        response_score=response_score,
        session_ok=session_ok,
        session_message=session_message,
    )
    for opinion in agent_opinions:
        if opinion.score < 78:
            suggestions.extend(opinion.suggestions[:1])
        risks.extend(opinion.risks[:1])
    suggestions = _unique_limited(suggestions, 8)
    risks = _unique_limited(risks, 6)

    source = "local_snapshot"
    if req.readLoggedInWorkspace:
        source = "official_api" if account.authType == "oauth" else "browser_session"

    logs = [
        log("已读取账号运营台本地快照、账号记忆、任务、草稿和私信未读状态"),
    ]
    if req.readLoggedInWorkspace:
        logs.append(log("已使用该账号绑定的登录档案作为读取来源，不保存密码、私信正文或联系人"))
        if account.authType == "browser_session":
            logs.append(log(f"独立浏览器档案：{account.browserProfileDir}"))
        if not session_ok:
            logs.append(log(session_message, "warn"))

    now = now_iso()
    report_id = str(uuid4())
    actions = _build_diagnosis_actions(account, memory, metric, report_id)
    report = AccountDiagnosisReport(
        id=report_id,
        accountId=account.id,
        platform=account.platform,
        source=source,  # type: ignore[arg-type]
        readLoggedInWorkspace=req.readLoggedInWorkspace,
        overallScore=overall,
        grade=_score_grade(overall),
        summary=f"{PLATFORM_LABELS[account.platform]}账号整体健康度 {overall} 分，当前最需要优先处理的是"
        + ("登录态" if not session_ok else "内容节奏与推荐适配"),
        dimensions=dimensions,
        findings=findings,
        suggestions=suggestions,
        risks=risks,
        workflowStages=workflow_stages,
        agentOpinions=agent_opinions,
        debateTimeline=debate_timeline,
        actions=actions,
        judgeSummary=judge_summary,
        dataPoints={
            "draftCount": len(drafts),
            "readyDraftCount": len(ready_drafts),
            "reviewDraftCount": len(review_drafts),
            "taskCount": len(tasks),
            "scheduledTaskCount": len(scheduled_tasks),
            "pendingTaskCount": len(pending_tasks),
            "failedTaskCount": len(failed_tasks),
            "unreadMessageAlerts": len(unread_alerts),
            "latestMetric": metric.model_dump() if metric else None,
            "algorithmSignals": _metric_signal_summary(account, metric),
            "accountMemory": memory.model_dump(),
            "memoryScore": memory_score,
            "externalDiagnosisSkills": EXTERNAL_DIAGNOSIS_SKILLS,
        },
        logs=logs,
        createdAt=now,
    )
    db.accountDiagnoses.insert(0, report)
    db.accountDiagnoses = db.accountDiagnoses[:50]
    return report


def import_diagnosis_to_account(db: OperationsDb, req: DiagnosisImportRequest) -> DiagnosisImportResponse | str:
    account = next((item for item in db.accounts if item.id == req.accountId), None)
    if not account:
        return "account_not_found"
    if account.status != "connected":
        return "account_not_connected"
    if account.platform not in {"douyin", "wechat_channels"}:
        return "platform_not_supported"

    now = now_iso()
    platform_label = PLATFORM_LABELS[account.platform]
    source_id = req.sourceDiagnosisId or str(uuid4())
    asset = Asset(
        id=str(uuid4()),
        contentType="video",
        titleBase=req.title,
        descriptionBase=req.content or req.title,
        videoUrl=f"diagnosis://{source_id}/video-pending",
        coverUrl=f"diagnosis://{source_id}/cover-pending",
        tags=req.tags,
        durationSeconds=req.durationSeconds,
        owner=account.displayName,
        copyrightStatus="unknown",
        createdAt=now,
        updatedAt=now,
    )
    db.assets.insert(0, asset)

    draft = PlatformDraft(
        id=str(uuid4()),
        assetId=asset.id,
        accountId=account.id,
        platform=account.platform,
        title=_clip_title(req.title, account.platform),
        description=req.content or req.title,
        tags=list(dict.fromkeys([platform_label, *req.tags]))[:6],
        coverUrl=asset.coverUrl,
        publishOptions={
            "source": "diagnosis_import",
            "sourceDiagnosisId": source_id,
            "category": req.category,
            "score": req.score if req.score is not None else 0,
            "diagnoseEndpoint": "/api/douyin/diagnose/stream"
            if account.platform == "douyin"
            else "/api/wechat-channels/diagnose/stream",
        },
        readiness="needs_review",
        createdAt=now,
        updatedAt=now,
    )
    db.drafts.insert(0, draft)

    task = None
    if req.createTask:
        task = create_task_for_draft(draft, account)
        task.status = "pending_review"
        task.logs.insert(0, log("诊断报告已导入账号，等待补充真实素材后审核"))
        db.tasks.insert(0, task)

    return DiagnosisImportResponse(account=account, asset=asset, draft=draft, task=task)


def apply_diagnosis_action(
    db: OperationsDb,
    report_id: str,
    req: DiagnosisActionApplyRequest,
) -> DiagnosisImportResponse | str:
    report = next((item for item in db.accountDiagnoses if item.id == report_id), None)
    if not report:
        return "diagnosis_report_not_found"
    action = next((item for item in report.actions if item.key == req.actionKey), None)
    if not action:
        return "diagnosis_action_not_found"
    if not action.suggestedTitle.strip():
        return "diagnosis_action_missing_title"

    create_task = req.createTask or action.kind == "publish_task"
    return import_diagnosis_to_account(
        db,
        DiagnosisImportRequest(
            accountId=report.accountId,
            title=action.suggestedTitle,
            content=action.suggestedContent,
            tags=action.tags,
            category=str(report.dataPoints.get("algorithmSignals") or ""),
            sourceDiagnosisId=f"{report.id}:{action.key}",
            score=report.overallScore,
            durationSeconds=60,
            createTask=create_task,
        ),
    )


def get_agent_tools() -> list[AgentToolDefinition]:
    return AGENT_TOOL_SCHEMAS


def _require_string(args: dict, key: str) -> str:
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key}_required")
    return value.strip()


def _optional_string(args: dict, key: str, default: str = "") -> str:
    value = args.get(key, default)
    return value if isinstance(value, str) else default


def _optional_int(args: dict, key: str, default: int, min_value: int, max_value: int) -> int:
    value = args.get(key, default)
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(min_value, min(max_value, parsed))


def _optional_float(args: dict, key: str) -> float | None:
    value = args.get(key)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_rate(args: dict, key: str) -> float | None:
    value = _optional_float(args, key)
    if value is None:
        return None
    return max(0, min(100, value))


def _optional_string_list(args: dict, key: str) -> list[str]:
    value = args.get(key)
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _optional_direct_message_source(args: dict, key: str, default: DirectMessageSource) -> DirectMessageSource:
    value = args.get(key, default)
    if value in {"browser_session", "official_api", "webhook", "manual"}:
        return value  # type: ignore[return-value]
    return default


def _optional_metric_source(args: dict, key: str, default: str = "manual") -> str:
    value = args.get(key, default)
    if value in {"manual", "simulated", "browser_session", "official_api", "webhook", "seed"}:
        return value
    return default


def _optional_collector_source(args: dict, key: str, default: str = "simulated") -> str:
    value = args.get(key, default)
    if value in {"simulated", "browser_session", "official_api"}:
        return value
    return default


def _tool_requires_confirmation(tool_name: str) -> bool:
    return any(tool.name == tool_name and tool.requiresConfirmation for tool in AGENT_TOOL_SCHEMAS)


def _tool_is_read_only(tool_name: str) -> bool:
    return any(tool.name == tool_name and tool.readOnly for tool in AGENT_TOOL_SCHEMAS)


def _target_account_ids_for_tool(db: OperationsDb, tool_name: str, args: dict) -> list[str]:
    ids: list[str] = []
    account_id = args.get("accountId")
    if isinstance(account_id, str) and account_id.strip():
        ids.append(account_id.strip())
    account_ids = args.get("accountIds")
    if isinstance(account_ids, list):
        ids.extend(str(item).strip() for item in account_ids if str(item).strip())
    draft_id = args.get("draftId")
    if isinstance(draft_id, str):
        draft = next((item for item in db.drafts if item.id == draft_id), None)
        if draft:
            ids.append(draft.accountId)
    task_id = args.get("taskId")
    if isinstance(task_id, str):
        task = next((item for item in db.tasks if item.id == task_id), None)
        if task:
            ids.append(task.accountId)
    if tool_name in {"ops.create_agent_plan", "ops.run_publishing_agent", "ops.generate_drafts"}:
        if not ids:
            ids.append("*")
    return list(dict.fromkeys(ids))


def _agent_client_block_reason(db: OperationsDb, client: AgentClient | None, tool_name: str, args: dict) -> str | None:
    if client is None:
        return None
    if client.status != "active":
        return "agent_client_paused"
    if tool_name not in client.allowedTools:
        return "tool_not_allowed"
    if client.allowedAccountIds:
        target_ids = _target_account_ids_for_tool(db, tool_name, args)
        if "*" in target_ids:
            return "account_scope_required"
        blocked = [account_id for account_id in target_ids if account_id not in client.allowedAccountIds]
        if blocked:
            return "account_not_allowed"
    return None


def _summarize_tool_result(tool_name: str, result) -> str:
    if isinstance(result, dict):
        if "id" in result:
            return f"{tool_name} -> {result['id']}"
        if "status" in result:
            return f"{tool_name} -> {result['status']}"
        return f"{tool_name} -> object"
    if isinstance(result, list):
        return f"{tool_name} -> {len(result)} items"
    return f"{tool_name} -> {type(result).__name__}"


def _record_agent_tool_call(
    db: OperationsDb,
    client: AgentClient | None,
    tool_name: str,
    args: dict,
    response: AgentToolInvokeResponse,
) -> AgentToolInvokeResponse:
    now = now_iso()
    if client:
        client.lastSeenAt = now
        client.updatedAt = now
    log_item = AgentToolCallLog(
        id=str(uuid4()),
        clientId=client.id if client else None,
        clientName=client.name if client else "unregistered-agent",
        tool=tool_name,
        ok=response.ok,
        message=response.message,
        requiresConfirmation=response.requiresConfirmation,
        arguments=args,
        resultSummary=_summarize_tool_result(tool_name, response.result) if response.ok else response.message,
        createdAt=now,
    )
    db.agentToolCallLogs.insert(0, log_item)
    db.agentToolCallLogs = db.agentToolCallLogs[:200]
    response.callLogId = log_item.id
    return response


def invoke_agent_tool(
    db: OperationsDb,
    tool_name: str,
    args: dict,
    confirmed: bool = False,
    client_id: str | None = None,
    purpose: str = "",
) -> AgentToolInvokeResponse:
    normalize_account_memory(db)
    known_tools = {tool.name for tool in AGENT_TOOL_SCHEMAS}
    if tool_name not in known_tools:
        return _record_agent_tool_call(
            db,
            None,
            tool_name,
            args,
            AgentToolInvokeResponse(ok=False, tool=tool_name, message="unknown_tool"),
        )

    client = _find_agent_client(db, client_id)
    if client_id and not client:
        return _record_agent_tool_call(
            db,
            None,
            tool_name,
            args,
            AgentToolInvokeResponse(ok=False, tool=tool_name, message="agent_client_not_found"),
        )

    if client is None and not _tool_is_read_only(tool_name):
        return _record_agent_tool_call(
            db,
            None,
            tool_name,
            args,
            AgentToolInvokeResponse(ok=False, tool=tool_name, message="agent_client_required"),
        )

    block_reason = _agent_client_block_reason(db, client, tool_name, args)
    if block_reason:
        return _record_agent_tool_call(
            db,
            client,
            tool_name,
            args,
            AgentToolInvokeResponse(ok=False, tool=tool_name, message=block_reason),
        )

    if _tool_requires_confirmation(tool_name) and not confirmed:
        return _record_agent_tool_call(
            db,
            client,
            tool_name,
            args,
            AgentToolInvokeResponse(
                ok=False,
                tool=tool_name,
                message="requires_confirmation",
                requiresConfirmation=True,
            ),
        )

    try:
        result = _invoke_agent_tool_impl(db, tool_name, args)
    except ValueError as err:
        return _record_agent_tool_call(
            db,
            client,
            tool_name,
            args,
            AgentToolInvokeResponse(ok=False, tool=tool_name, message=str(err)),
        )

    message = "ok" if not purpose else f"ok:{purpose[:80]}"
    return _record_agent_tool_call(
        db,
        client,
        tool_name,
        args,
        AgentToolInvokeResponse(ok=True, tool=tool_name, message=message, result=result),
    )


def _invoke_agent_tool_impl(db: OperationsDb, tool_name: str, args: dict):
    if tool_name == "ops.get_state":
        return db.model_dump()

    if tool_name == "ops.get_runtime":
        return get_runtime_state().model_dump()

    if tool_name == "ops.create_account":
        now = now_iso()
        platform = _require_string(args, "platform")
        if platform not in PLATFORM_LABELS:
            raise ValueError("invalid_platform")
        auth_type = _optional_string(args, "authType", "browser_session")
        if auth_type not in {"browser_session", "oauth", "manual"}:
            raise ValueError("invalid_authType")
        account = Account(
            id=str(uuid4()),
            platform=platform,  # type: ignore[arg-type]
            displayName=_require_string(args, "displayName"),
            handle=_require_string(args, "handle"),
            authType=auth_type,  # type: ignore[arg-type]
            profile=_optional_string(args, "profile"),
            dailyPublishLimit=_optional_int(args, "dailyPublishLimit", 3, 1, 20),
            status="connected" if auth_type == "oauth" else "needs_login",
            sessionHealth="healthy" if auth_type == "oauth" else "unknown",
            browserProxyEnabled=bool(args.get("browserProxyEnabled", False)),
            browserProxyServer=_normalize_proxy_server(_optional_string(args, "browserProxyServer")),
            browserProxyBypassList=_normalize_proxy_bypass_list(_optional_string(args, "browserProxyBypassList")),
            createdAt=now,
            updatedAt=now,
        )
        if account.browserProxyEnabled and not account.browserProxyServer:
            raise ValueError("proxy_server_required")
        ensure_account_browser_profile(account)
        db.accounts.insert(0, account)
        return account.model_dump()

    if tool_name == "ops.open_workspace":
        account = next((item for item in db.accounts if item.id == _require_string(args, "accountId")), None)
        if not account:
            raise ValueError("account_not_found")
        return open_isolated_browser_workspace(account).model_dump()

    if tool_name == "ops.remember_session":
        account = next((item for item in db.accounts if item.id == _require_string(args, "accountId")), None)
        if not account:
            raise ValueError("account_not_found")
        return remember_account_session(account).model_dump()

    if tool_name == "ops.update_browser_settings":
        updated = update_account_browser_settings(
            db,
            _require_string(args, "accountId"),
            AccountBrowserUpdateRequest(
                browserProxyEnabled=args.get("browserProxyEnabled") if "browserProxyEnabled" in args else None,
                browserProxyServer=args.get("browserProxyServer") if "browserProxyServer" in args else None,
                browserProxyBypassList=args.get("browserProxyBypassList") if "browserProxyBypassList" in args else None,
            ),
        )
        if isinstance(updated, str):
            raise ValueError(updated)
        return updated.model_dump()

    if tool_name == "ops.update_account_memory":
        updated = update_account_memory(
            db,
            _require_string(args, "accountId"),
            AccountMemoryUpdateRequest(
                targetAudience=_optional_string_list(args, "targetAudience"),
                contentPillars=_optional_string_list(args, "contentPillars"),
                conversionGoal=_optional_string(args, "conversionGoal"),
                personaTone=_optional_string(args, "personaTone"),
                highPerformingPatterns=_optional_string_list(args, "highPerformingPatterns"),
                lowPerformingPatterns=_optional_string_list(args, "lowPerformingPatterns"),
                avoidTopics=_optional_string_list(args, "avoidTopics"),
                commentStrategy=_optional_string(args, "commentStrategy"),
                privateDomainStrategy=_optional_string(args, "privateDomainStrategy"),
            ),
        )
        if isinstance(updated, str):
            raise ValueError(updated)
        return updated.model_dump()

    if tool_name == "ops.create_asset":
        now = now_iso()
        copyright_status = _optional_string(args, "copyrightStatus", "owned")
        if copyright_status not in {"owned", "licensed", "unknown"}:
            raise ValueError("invalid_copyrightStatus")
        content_type = _optional_string(args, "contentType", "video")
        if content_type not in {"video", "article", "dynamic", "story"}:
            raise ValueError("invalid_contentType")
        asset = Asset(
            id=str(uuid4()),
            contentType=content_type,  # type: ignore[arg-type]
            titleBase=_require_string(args, "titleBase"),
            descriptionBase=_require_string(args, "descriptionBase"),
            videoUrl=_require_string(args, "videoUrl"),
            videoLocalPath=_optional_string(args, "videoLocalPath"),
            coverUrl=_require_string(args, "coverUrl"),
            coverLocalPath=_optional_string(args, "coverLocalPath"),
            tags=_optional_string_list(args, "tags"),
            durationSeconds=_optional_int(args, "durationSeconds", 60, 1, 3600),
            owner=_optional_string(args, "owner", "内容团队"),
            copyrightStatus=copyright_status,  # type: ignore[arg-type]
            createdAt=now,
            updatedAt=now,
        )
        db.assets.insert(0, asset)
        return asset.model_dump()

    if tool_name == "ops.generate_drafts":
        asset_id = _require_string(args, "assetId")
        asset = next((item for item in db.assets if item.id == asset_id), None)
        if not asset:
            raise ValueError("asset_not_found")
        requested_ids = _optional_string_list(args, "accountIds")
        accounts = [
            account
            for account in db.accounts
            if (account.id in requested_ids if requested_ids else account.status != "disabled")
        ]
        drafts: list[PlatformDraft] = []
        for account in accounts:
            existing = next((item for item in db.drafts if item.assetId == asset.id and item.accountId == account.id), None)
            if existing:
                drafts.append(existing)
                continue
            draft = create_platform_draft(asset, account)
            db.drafts.insert(0, draft)
            drafts.append(draft)
        return [draft.model_dump() for draft in drafts]

    if tool_name == "ops.create_task":
        draft = next((item for item in db.drafts if item.id == _require_string(args, "draftId")), None)
        account = next((item for item in db.accounts if draft and item.id == draft.accountId), None)
        if not draft or not account:
            raise ValueError("draft_not_found")
        task = create_task_for_draft(draft, account, _optional_string(args, "scheduledAt") or None)
        db.tasks.insert(0, task)
        return task.model_dump()

    if tool_name == "ops.approve_task":
        task = next((item for item in db.tasks if item.id == _require_string(args, "taskId")), None)
        if not task:
            raise ValueError("task_not_found")
        task.status = "scheduled"
        task.logs.insert(0, log("Agent 工具审核通过，进入排期"))
        task.updatedAt = now_iso()
        return task.model_dump()

    if tool_name == "ops.execute_task":
        task = next((item for item in db.tasks if item.id == _require_string(args, "taskId")), None)
        if not task:
            raise ValueError("task_not_found")
        draft = next((item for item in db.drafts if item.id == task.draftId), None)
        account = next((item for item in db.accounts if item.id == task.accountId), None)
        asset = next((item for item in db.assets if draft and item.id == draft.assetId), None)
        if not draft or not account or not asset:
            raise ValueError("task_context_missing")
        return execute_publish_task(task, account, asset, draft).model_dump()

    if tool_name == "ops.create_agent_plan":
        return generate_agent_plan(db, _optional_string(args, "objective", "Agent 控制台生成计划")).model_dump()

    if tool_name == "ops.import_diagnosis":
        score = args.get("score")
        req = DiagnosisImportRequest(
            accountId=_require_string(args, "accountId"),
            title=_require_string(args, "title"),
            content=_optional_string(args, "content"),
            tags=_optional_string_list(args, "tags"),
            category=_optional_string(args, "category"),
            sourceDiagnosisId=_optional_string(args, "sourceDiagnosisId") or None,
            score=int(score) if isinstance(score, int | float | str) and str(score).strip().isdigit() else None,
            durationSeconds=_optional_int(args, "durationSeconds", 60, 1, 3600),
            createTask=bool(args.get("createTask", False)),
        )
        imported = import_diagnosis_to_account(db, req)
        if isinstance(imported, str):
            raise ValueError(imported)
        return imported.model_dump()

    if tool_name == "ops.check_direct_messages":
        return check_direct_messages(
            db,
            DirectMessageCheckRequest(accountIds=_optional_string_list(args, "accountIds") or None),
        ).model_dump()

    if tool_name == "ops.record_direct_message_event":
        imported = record_direct_message_event(
            db,
            DirectMessageEventRequest(
                accountId=_require_string(args, "accountId"),
                unreadCount=_optional_int(args, "unreadCount", 1, 0, 10000),
                source=_optional_direct_message_source(args, "source", "manual"),
            ),
        )
        if isinstance(imported, str):
            raise ValueError(imported)
        return imported.model_dump()

    if tool_name == "ops.record_account_metrics":
        snapshot = record_account_metric_snapshot(
            db,
            AccountMetricSnapshotRequest(
                accountId=_require_string(args, "accountId"),
                source=_optional_metric_source(args, "source"),  # type: ignore[arg-type]
                periodDays=_optional_int(args, "periodDays", 7, 1, 90),
                followers=_optional_int(args, "followers", 0, 0, 1_000_000_000),
                plays=_optional_int(args, "plays", 0, 0, 1_000_000_000),
                likes=_optional_int(args, "likes", 0, 0, 1_000_000_000),
                comments=_optional_int(args, "comments", 0, 0, 1_000_000_000),
                shares=_optional_int(args, "shares", 0, 0, 1_000_000_000),
                avgViewDurationSeconds=_optional_float(args, "avgViewDurationSeconds"),
                threeSecondRetentionRate=_optional_rate(args, "threeSecondRetentionRate"),
                completionRate=_optional_rate(args, "completionRate"),
                replayRate=_optional_rate(args, "replayRate"),
                followConversionRate=_optional_rate(args, "followConversionRate"),
                profileVisitRate=_optional_rate(args, "profileVisitRate"),
                searchImpressionRate=_optional_rate(args, "searchImpressionRate"),
                localTrafficRate=_optional_rate(args, "localTrafficRate"),
                socialShareRate=_optional_rate(args, "socialShareRate"),
                friendLikeRate=_optional_rate(args, "friendLikeRate"),
                privateDomainClickRate=_optional_rate(args, "privateDomainClickRate"),
                officialAccountClickRate=_optional_rate(args, "officialAccountClickRate"),
                liveReservationRate=_optional_rate(args, "liveReservationRate"),
                topContentTags=_optional_string_list(args, "topContentTags"),
            ),
        )
        if isinstance(snapshot, str):
            raise ValueError(snapshot)
        return snapshot.model_dump()

    if tool_name == "ops.collect_account_metrics":
        job = collect_account_metrics(
            db,
            AccountMetricCollectRequest(
                accountId=_require_string(args, "accountId"),
                source=_optional_collector_source(args, "source"),  # type: ignore[arg-type]
                periodDays=_optional_int(args, "periodDays", 7, 1, 90),
            ),
        )
        if isinstance(job, str):
            raise ValueError(job)
        return job.model_dump()

    if tool_name == "ops.generate_creator_coach":
        report = generate_creator_coach(
            db,
            CreatorCoachRequest(
                accountId=_require_string(args, "accountId"),
                focusGoal=_optional_string(args, "focusGoal"),
                ideaCount=_optional_int(args, "ideaCount", 5, 1, 10),
            ),
        )
        if isinstance(report, str):
            raise ValueError(report)
        return report.model_dump()

    if tool_name == "ops.diagnose_account":
        report = diagnose_account(
            db,
            AccountDiagnoseRequest(
                accountId=_require_string(args, "accountId"),
                readLoggedInWorkspace=bool(args.get("readLoggedInWorkspace", True)),
            ),
        )
        if isinstance(report, str):
            raise ValueError(report)
        return report.model_dump()

    if tool_name == "ops.run_publishing_agent":
        mode = _optional_string(args, "mode", "create_tasks")
        if mode not in {"plan_only", "create_tasks", "approve_ready", "execute_ready"}:
            raise ValueError("invalid_publishing_agent_mode")
        run = run_builtin_publishing_agent(
            db,
            PublishingAgentRunRequest(
                objective=_optional_string(args, "objective", "外部 Agent 请求运行内置发布 Agent"),
                accountIds=_optional_string_list(args, "accountIds"),
                assetIds=_optional_string_list(args, "assetIds"),
                mode=mode,  # type: ignore[arg-type]
                confirmed=True,
            ),
        )
        return run.model_dump()

    raise ValueError("unknown_tool")


def infer_douyin_field(asset: Asset) -> str:
    text = f"{asset.titleBase} {asset.descriptionBase} {' '.join(asset.tags)}"
    if any(word in text for word in ["民宿", "酒店", "房型", "入住", "客房", "文旅"]):
        return "hospitality_design"
    if any(word in text for word in ["办公", "办公室", "会议区", "前台", "企业展厅", "行政", "员工效率"]):
        return "office_design"
    if any(word in text for word in ["同城", "本地", "门店", "探店", "路线", "周末", "到店"]):
        return "local"
    if any(word in text for word in ["团购", "商品", "套餐", "下单", "购买"]):
        return "commerce"
    if any(word in text for word in ["教程", "怎么", "流程", "清单", "预算", "避坑"]):
        return "search"
    return "interest"


def infer_wechat_category(asset: Asset) -> str:
    text = f"{asset.titleBase} {asset.descriptionBase} {' '.join(asset.tags)}"
    if any(word in text for word in ["民宿", "酒店", "房型", "入住", "客房", "文旅"]):
        return "hospitality_design"
    if any(word in text for word in ["办公", "办公室", "会议区", "前台", "企业展厅", "行政", "员工效率"]):
        return "office_design"
    if any(word in text for word in ["门店", "客户", "获客", "复购", "开业", "品牌"]):
        return "enterprise"
    if any(word in text for word in ["商品", "带货", "小店", "套餐", "下单"]):
        return "shop"
    if any(word in text for word in ["知识", "科普", "教程", "方法", "怎么"]):
        return "knowledge"
    if any(word in text for word in ["情感", "亲子", "家庭", "婚姻"]):
        return "emotion"
    return "local"


def _clip_title(title: str, platform: Platform) -> str:
    limit = 36 if platform == "xiaohongshu" else 42
    return title[:limit]


def create_platform_draft(asset: Asset, account: Account) -> PlatformDraft:
    platform_tag = PLATFORM_LABELS[account.platform]
    memory = account.memory
    audience_hint = f"重点面向{'、'.join(memory.targetAudience[:2])}。" if memory.targetAudience else ""
    tone_hint = f"语气保持{memory.personaTone}。" if memory.personaTone else ""
    conversion_hint = f"结尾动作围绕{memory.conversionGoal}。" if memory.conversionGoal else ""
    if account.platform == "douyin":
        field = infer_douyin_field(asset)
        profile = get_platform_content_profile("douyin", field)
        formula = (profile.get("content_formulas") or ["改造结果 -> 原始问题 -> 设计动作 -> 评论承接"])[0]
        hook = (profile.get("hook_patterns") or ["前3秒直接给空间改造结果"])[0]
        suffix = "前3秒先给设计结果"
        body = f"{asset.descriptionBase}\n\n抖音版：{hook} 内容结构按“{formula}”，前 3 秒展示结果/平面图/前后对比，结尾用评论关键词承接方案、预算或项目初诊。{audience_hint}{tone_hint}{conversion_hint}"
        options = {
            "trafficField": field,
            "diagnoseEndpoint": "/api/douyin/diagnose/stream",
            "contentReference": profile["category_label"],
        }
    elif account.platform == "wechat_channels":
        category = infer_wechat_category(asset)
        profile = get_platform_content_profile("wechat_channels", category)
        formula = (profile.get("content_formulas") or ["项目场景 -> 设计证据 -> 转发理由 -> 初诊承接"])[0]
        suffix = "适合转给项目决策人"
        body = f"{asset.descriptionBase}\n\n视频号版：标题更稳，按“{formula}”组织口播，强调老板/业主/行政负责人愿意转发讨论的理由，并承接公众号案例或项目初诊。{audience_hint}{tone_hint}{conversion_hint}"
        options = {
            "category": category,
            "diagnoseEndpoint": "/api/wechat-channels/diagnose/stream",
            "contentReference": profile["category_label"],
        }
    else:
        suffix = XHS_REFERENCE["suffix"]
        body = f"{asset.descriptionBase}\n\n小红书版：正文按问题、设计动作、预算边界、前后对比和适合人群拆开写，封面突出真实空间结果。{audience_hint}{tone_hint}{conversion_hint}"
        options = XHS_REFERENCE["options"]
    options = {**options, "contentType": asset.contentType}

    now = now_iso()
    return PlatformDraft(
        id=str(uuid4()),
        assetId=asset.id,
        accountId=account.id,
        platform=account.platform,
        title=_clip_title(f"{asset.titleBase}｜{suffix}", account.platform),
        description=body,
        tags=list(dict.fromkeys([platform_tag, *asset.tags]))[:6],
        coverUrl=asset.coverUrl,
        publishOptions=options,
        readiness="needs_review" if asset.copyrightStatus == "unknown" else "ready",
        createdAt=now,
        updatedAt=now,
    )


def create_task_for_draft(draft: PlatformDraft, account: Account, scheduled_at: str | None = None) -> PublishTask:
    now = now_iso()
    return PublishTask(
        id=str(uuid4()),
        platform=draft.platform,
        accountId=account.id,
        draftId=draft.id,
        scheduledAt=scheduled_at or now,
        status="scheduled" if draft.readiness == "ready" else "pending_review",
        executionMode="api" if account.authType == "oauth" else "browser",
        retryCount=0,
        logs=[log("运营后台创建发布任务，等待执行窗口")],
        createdAt=now,
        updatedAt=now,
    )


def _parse_task_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _task_sort_key(task: PublishTask) -> datetime:
    return _parse_task_datetime(task.scheduledAt) or datetime.min.replace(tzinfo=timezone.utc)


def _task_is_due(task: PublishTask, now: datetime | None = None) -> bool:
    scheduled_at = _parse_task_datetime(task.scheduledAt)
    if not scheduled_at:
        return True
    reference = now or datetime.now(timezone.utc)
    return scheduled_at <= reference + timedelta(minutes=1)


def _remaining_daily_slots(account: Account) -> int:
    return max(0, account.dailyPublishLimit - max(account.publishedToday, 0))


def _task_blocks_new_duplicate(task: PublishTask) -> bool:
    return task.status in {"draft", "pending_review", "scheduled", "publishing", "manual_takeover", "retrying"}


def find_active_task_for_draft(tasks: list[PublishTask], draft_id: str) -> PublishTask | None:
    return next((task for task in tasks if task.draftId == draft_id and _task_blocks_new_duplicate(task)), None)


def _selected_accounts(db: OperationsDb, account_ids: list[str] | None = None) -> list[Account]:
    selected = set(account_ids or [])
    return [
        account
        for account in db.accounts
        if account.status != "disabled" and (account.id in selected if selected else True)
    ]


def _selected_assets(db: OperationsDb, asset_ids: list[str] | None = None) -> list[Asset]:
    selected = set(asset_ids or [])
    if selected:
        return [asset for asset in db.assets if asset.id in selected]
    return db.assets[:3]


def generate_agent_plan(
    db: OperationsDb,
    objective: str,
    account_ids: list[str] | None = None,
    asset_ids: list[str] | None = None,
    create_tasks: bool = True,
) -> AgentPlan:
    active_accounts = _selected_accounts(db, account_ids)
    available_assets = _selected_assets(db, asset_ids)
    draft_ids: list[str] = []
    task_ids: list[str] = []
    offset = 2

    for asset in available_assets:
        for account in active_accounts:
            draft = next(
                (item for item in db.drafts if item.assetId == asset.id and item.accountId == account.id),
                None,
            )
            if draft is None:
                draft = create_platform_draft(asset, account)
                db.drafts.insert(0, draft)
            draft_ids.append(draft.id)

            if not create_tasks:
                continue
            if find_active_task_for_draft(db.tasks, draft.id) is None:
                task = create_task_for_draft(draft, account, add_hours(datetime.now(timezone.utc), offset))
                task.logs.insert(0, log("Agent 已生成发布任务，等待人工审核或执行窗口"))
                db.tasks.insert(0, task)
                task_ids.append(task.id)
                offset += 4

    plan = AgentPlan(
        id=str(uuid4()),
        objective=objective or "多平台内容发布计划",
        summary=f"已为 {len(active_accounts)} 个账号和 {len(available_assets)} 条视频资产生成平台草稿"
        + ("与发布任务。" if create_tasks else "。"),
        accountIds=[account.id for account in active_accounts],
        assetIds=[asset.id for asset in available_assets],
        draftIds=draft_ids,
        taskIds=task_ids,
        createdAt=now_iso(),
    )
    db.plans.insert(0, plan)
    return plan


def _task_context(db: OperationsDb, task: PublishTask) -> tuple[Account | None, Asset | None, PlatformDraft | None]:
    draft = next((item for item in db.drafts if item.id == task.draftId), None)
    account = next((item for item in db.accounts if item.id == task.accountId), None)
    asset = next((item for item in db.assets if draft and item.id == draft.assetId), None)
    return account, asset, draft


def _maybe_approve_task_for_agent(db: OperationsDb, task: PublishTask) -> bool:
    account, asset, draft = _task_context(db, task)
    if not account or not asset or not draft:
        task.logs.insert(0, log("内置发布 Agent 未审核：任务上下文缺失", "warn"))
        task.updatedAt = now_iso()
        return False
    errors = validate_asset(asset, draft)
    if errors:
        task.logs.insert(0, log(f"内置发布 Agent 未审核：{'；'.join(errors)}", "warn"))
        task.updatedAt = now_iso()
        return False
    task.status = "scheduled"
    task.logs.insert(0, log("内置发布 Agent 审核通过，进入排期"))
    task.updatedAt = now_iso()
    return True


def run_builtin_publishing_agent(db: OperationsDb, req: PublishingAgentRunRequest) -> PublishingAgentRun:
    ensure_agent_clients(db)
    now = now_iso()
    logs = [log(f"内置发布 Agent 启动：{req.mode}")]
    if req.mode == "execute_ready" and not req.confirmed:
        run = PublishingAgentRun(
            id=str(uuid4()),
            objective=req.objective,
            mode=req.mode,
            status="blocked",
            accountIds=req.accountIds,
            assetIds=req.assetIds,
            summary="执行发布任务需要 confirmed=true。",
            logs=[log("执行发布任务需要显式确认", "warn"), *logs],
            createdAt=now,
            updatedAt=now,
        )
        db.publishingAgentRuns.insert(0, run)
        return run

    plan = generate_agent_plan(
        db,
        req.objective,
        req.accountIds or None,
        req.assetIds or None,
        create_tasks=req.mode != "plan_only",
    )
    logs.append(log(plan.summary))
    candidate_tasks = sorted(
        [
        task
        for task in db.tasks
        if task.draftId in set(plan.draftIds) and task.status in {"pending_review", "scheduled"}
        ],
        key=_task_sort_key,
    )
    approved_ids: list[str] = []
    executed_ids: list[str] = []
    blocked_ids: list[str] = []

    if req.mode in {"approve_ready", "execute_ready"}:
        for task in candidate_tasks:
            if task.status == "pending_review":
                if _maybe_approve_task_for_agent(db, task):
                    approved_ids.append(task.id)
                else:
                    blocked_ids.append(task.id)

    if req.mode == "execute_ready":
        slot_budget = {account.id: _remaining_daily_slots(account) for account in db.accounts}
        for task in candidate_tasks:
            if task.status != "scheduled":
                if task.id not in blocked_ids:
                    blocked_ids.append(task.id)
                continue
            account, asset, draft = _task_context(db, task)
            if not account or not asset or not draft:
                task.logs.insert(0, log("内置发布 Agent 未执行：任务上下文缺失", "warn"))
                blocked_ids.append(task.id)
                continue
            if not _task_is_due(task):
                task.logs.insert(0, log("内置发布 Agent 未执行：未到排期时间", "warn"))
                task.updatedAt = now_iso()
                blocked_ids.append(task.id)
                continue
            if slot_budget.get(account.id, _remaining_daily_slots(account)) <= 0:
                task.logs.insert(0, log("内置发布 Agent 未执行：该账号今日发布额度已用完", "warn"))
                task.updatedAt = now_iso()
                blocked_ids.append(task.id)
                continue
            session_ok, session_message, _ = check_session(account)
            if not session_ok:
                task.logs.insert(0, log(f"内置发布 Agent 未执行：{session_message}", "warn"))
                task.updatedAt = now_iso()
                blocked_ids.append(task.id)
                continue
            result = execute_publish_task(task, account, asset, draft)
            if result.status in {"published", "manual_takeover"}:
                executed_ids.append(task.id)
                if result.status == "published":
                    slot_budget[account.id] = max(0, slot_budget.get(account.id, 0) - 1)
            else:
                blocked_ids.append(task.id)

    unique_task_ids = list(dict.fromkeys([*plan.taskIds, *[task.id for task in candidate_tasks]]))
    status = "completed"
    if not plan.draftIds:
        status = "blocked"
        logs.append(log("没有可用账号或视频资产，未生成发布计划", "warn"))
    summary_parts = [
        f"计划 {plan.id[:8]}",
        f"草稿 {len(plan.draftIds)} 个",
        f"任务 {len(unique_task_ids)} 个",
    ]
    if approved_ids:
        summary_parts.append(f"审核 {len(approved_ids)} 个")
    if executed_ids:
        summary_parts.append(f"执行 {len(executed_ids)} 个")
    if blocked_ids:
        summary_parts.append(f"阻塞 {len(set(blocked_ids))} 个")
    runtime = get_runtime_state()
    if runtime.publisherModeBlockedReason:
        logs.append(log(runtime.publisherModeBlockedReason, "warn"))
    logs.append(log(f"发布运行模式：{runtime.publisherRunMode}"))
    if runtime.publisherRunMode == "browser_prepare":
        logs.append(log("browser_prepare 只打开工作台，最终提交仍需人工确认", "warn"))
    if runtime.publisherRunMode == "upload_prepare":
        logs.append(log("upload_prepare 会校验本地视频并准备上传/填写，最终提交仍需人工确认", "warn"))
    if runtime.publisherRunMode == "social_auto_upload":
        logs.append(log("social_auto_upload 会优先调用本地 sau CLI；若 SAU 独立 cookie 不可用，将回退项目已登录浏览器档案", "warn"))
        if not runtime.socialAutoUpload.executionReady:
            logs.append(log(runtime.socialAutoUpload.missingReason or "social-auto-upload 不可用", "error"))

    run = PublishingAgentRun(
        id=str(uuid4()),
        objective=req.objective,
        mode=req.mode,
        status=status,  # type: ignore[arg-type]
        accountIds=plan.accountIds,
        assetIds=plan.assetIds,
        planId=plan.id,
        draftIds=plan.draftIds,
        taskIds=unique_task_ids,
        executedTaskIds=list(dict.fromkeys(executed_ids)),
        blockedTaskIds=list(dict.fromkeys(blocked_ids)),
        summary=" · ".join(summary_parts),
        logs=logs,
        createdAt=now,
        updatedAt=now_iso(),
    )
    db.publishingAgentRuns.insert(0, run)
    db.publishingAgentRuns = db.publishingAgentRuns[:100]
    return run


def check_session(account: Account) -> tuple[bool, str, str]:
    if account.status == "disabled":
        return False, "账号已停用", "manual_takeover"
    runtime = get_runtime_state()
    if (
        runtime.publisherRunMode == "social_auto_upload"
        and account.authType != "manual"
        and account.platform in runtime.socialAutoUpload.supportedPlatforms
    ):
        account_name = social_auto_upload_account_name(account)
        if account.status == "connected" and account.sessionHealth != "expired":
            return True, f"读取项目已保存登录态，发布账号={account_name}", "browser"
        return True, f"交由 social-auto-upload 校验本地发布账号，account={account_name}", "browser"
    if account.status == "needs_login" or account.sessionHealth == "expired":
        return False, "登录态失效，需要人工扫码或重新授权", "manual_takeover"
    if account.authType == "oauth":
        return True, "OAuth/API 授权状态正常", "api"
    if account.authType == "browser_session":
        return True, "浏览器会话状态正常", "browser"
    return False, "账号配置为人工模式，需要人工接管", "manual_takeover"


def validate_asset(asset: Asset, draft: PlatformDraft) -> list[str]:
    errors: list[str] = []
    if not asset.videoUrl:
        errors.append("缺少视频文件地址")
    if not draft.title.strip():
        errors.append("缺少平台标题")
    max_duration = {"douyin": 900, "xiaohongshu": 300, "wechat_channels": 600}[draft.platform]
    if asset.durationSeconds > max_duration:
        errors.append(f"{PLATFORM_LABELS[draft.platform]} 当前策略限制视频不超过 {max_duration} 秒")
    if asset.copyrightStatus == "unknown":
        errors.append("素材版权状态未知，需要人工确认")
    return errors


def _asset_video_file_path(asset: Asset) -> Path | None:
    candidates = [asset.videoLocalPath, asset.videoUrl if asset.videoUrl.startswith("/") else ""]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.exists() and path.is_file():
            return path
    return None


def _publish_upload_blockers(account: Account, asset: Asset, draft: PlatformDraft) -> list[str]:
    blockers: list[str] = []
    if draft.platform not in {"douyin", "xiaohongshu", "wechat_channels"}:
        blockers.append("当前扩展桥接准备模式优先支持抖音、小红书和视频号")
    if account.authType != "browser_session":
        blockers.append("自动上传需要账号使用独立浏览器登录")
    if _asset_video_file_path(asset) is None:
        blockers.append("自动上传需要先把视频文件上传到本地素材库")
    if asset.coverUrl and asset.coverLocalPath and not Path(asset.coverLocalPath).expanduser().exists():
        blockers.append("封面本地文件不存在")
    return blockers


def _publish_entry_label(platform: Platform) -> str:
    if platform == "douyin":
        return "抖音创作者中心发布页"
    if platform == "xiaohongshu":
        return "小红书创作服务平台发布页"
    if platform == "wechat_channels":
        return "视频号助手发布页"
    return f"{PLATFORM_LABELS[platform]}发布页"


def _video_source_for_flow(asset: Asset) -> str:
    video_path = _asset_video_file_path(asset)
    if video_path:
        return str(video_path)
    return asset.videoUrl or "未提供视频地址"


def _cover_source_for_flow(asset: Asset, draft: PlatformDraft) -> str:
    if asset.coverLocalPath:
        return asset.coverLocalPath
    if draft.coverUrl:
        return draft.coverUrl
    if asset.coverUrl:
        return asset.coverUrl
    return "使用平台默认截帧"


def _publish_option_summary(draft: PlatformDraft) -> str:
    if draft.platform == "douyin":
        traffic_field = str(draft.publishOptions.get("trafficField") or "interest")
        label = get_platform_content_profile("douyin", traffic_field)["category_label"]
        return f"抖音设计内容字段={label}，允许进入推荐前预检"
    if draft.platform == "wechat_channels":
        category = str(draft.publishOptions.get("category") or "hospitality_design")
        label = get_platform_content_profile("wechat_channels", category)["category_label"]
        return f"视频号设计分类={label}，保留项目初诊承接口径"
    return "使用平台默认发布选项"


def _build_publish_flow_logs(
    account: Account,
    asset: Asset,
    draft: PlatformDraft,
    *,
    final_action: Literal["dry_run", "manual_confirm"],
) -> list[ExecutionLog]:
    tags = "、".join(draft.tags) if draft.tags else "无标签"
    video_source = _video_source_for_flow(asset)
    cover_source = _cover_source_for_flow(asset, draft)
    publish_entry = _publish_entry_label(draft.platform)
    final_message = (
        "流程 10/10：Dry-run 到达发布按钮并模拟提交结果；未向真实平台提交任何内容"
        if final_action == "dry_run"
        else "流程 10/10：已停在最终发布确认前；需要人工确认后才能向平台提交"
    )
    return [
        log(f"流程 01/10：读取发布任务，账号={account.displayName}，平台={PLATFORM_LABELS[draft.platform]}"),
        log(f"流程 02/10：校验账号登录态，使用账号独立浏览器档案 {compact_profile_path(account.browserProfileDir)}"),
        log(f"流程 03/10：加载账号浏览器环境，代理={'账号专属代理' if account.browserProxyEnabled else '电脑系统默认代理'}"),
        log(f"流程 04/10：进入{publish_entry}，准备创建新作品"),
        log(f"流程 05/10：选择待上传视频 {video_source}"),
        log(f"流程 06/10：模拟上传视频并等待平台转码，时长 {asset.durationSeconds}s"),
        log(f"流程 07/10：填写标题《{draft.title}》"),
        log(f"流程 08/10：填写正文、标签和封面；标签={tags}；封面={cover_source}"),
        log(f"流程 09/10：执行平台发布预检；{_publish_option_summary(draft)}"),
        log(final_message, "warn" if final_action == "manual_confirm" else "info"),
    ]


def compact_profile_path(value: str | None) -> str:
    if not value:
        return "未分配"
    parts = [part for part in str(value).split("/") if part]
    return "/".join(parts[-2:])


def _prepend_task_logs(task: PublishTask, rows: list[ExecutionLog]) -> None:
    for row in rows:
        task.logs.insert(0, row)


def _safe_command_for_log(command: list[str]) -> str:
    safe: list[str] = []
    mask_next = False
    for item in command:
        if mask_next:
            safe.append("<正文内容>")
            mask_next = False
            continue
        safe.append(item)
        if item == "--desc":
            mask_next = True
    return shlex.join(safe)


def execute_publish_task(task: PublishTask, account: Account, asset: Asset, draft: PlatformDraft) -> PublishTask:
    if task.status == "published":
        task.errorMessage = "任务已发布，不可重复执行。"
        task.logs.insert(0, log(task.errorMessage, "error"))
        task.updatedAt = now_iso()
        return task
    if task.status in {"publishing", "manual_takeover", "cancelled"}:
        task.errorMessage = "当前任务状态不允许再次执行。"
        task.logs.insert(0, log(task.errorMessage, "error"))
        task.updatedAt = now_iso()
        return task
    if _remaining_daily_slots(account) <= 0:
        task.status = "failed"
        task.errorMessage = f"账号 {account.displayName} 已达到今日发布上限 {account.dailyPublishLimit} 条。"
        task.logs.insert(0, log(task.errorMessage, "error"))
        task.updatedAt = now_iso()
        return task

    ok, message, mode = check_session(account)
    task.executionMode = mode  # type: ignore[assignment]
    if not ok:
        task.status = "failed"
        task.errorMessage = message
        task.logs.insert(0, log(message, "error"))
        task.updatedAt = now_iso()
        return task

    errors = validate_asset(asset, draft)
    if errors:
        task.status = "failed"
        task.errorMessage = "；".join(errors)
        for error in reversed(errors):
            task.logs.insert(0, log(error, "error"))
        task.updatedAt = now_iso()
        return task

    runtime = get_runtime_state()
    task.logs.insert(0, log(f"开始执行 {PLATFORM_LABELS[task.platform]} 发布任务"))
    task.logs.insert(0, log(f"账号：{account.displayName}"))
    task.logs.insert(0, log(f"草稿标题：{draft.title}"))
    if runtime.publisherModeBlockedReason:
        task.logs.insert(0, log(runtime.publisherModeBlockedReason, "warn"))

    if runtime.publisherRunMode != "dry_run" and task.status != "scheduled":
        task.status = "failed"
        task.errorMessage = "发布执行模式需要先人工审核通过，任务状态必须为 scheduled。"
        task.logs.insert(0, log(task.errorMessage, "error"))
        task.updatedAt = now_iso()
        return task

    if runtime.publisherRunMode == "browser_prepare":
        workspace = open_isolated_browser_workspace(account)
        task.status = "manual_takeover"
        task.executionMode = "manual_takeover"
        task.errorMessage = "已生成平台工作台信息，最终提交需要人工接管。"
        for row in reversed(workspace.logs):
            task.logs.insert(0, row)
        task.logs.insert(0, log("浏览器准备模式：不会自动提交作品，需人工确认发布", "warn"))
    elif runtime.publisherRunMode == "upload_prepare":
        blockers = _publish_upload_blockers(account, asset, draft)
        if blockers:
            task.status = "failed"
            task.errorMessage = "；".join(blockers)
            for blocker in reversed(blockers):
                task.logs.insert(0, log(blocker, "error"))
        else:
            workspace = prepare_isolated_browser_workspace(account)
            video_path = _asset_video_file_path(asset)
            task.status = "manual_takeover"
            task.executionMode = "manual_takeover"
            task.errorMessage = "已准备自动上传：下一步由桌面内置浏览器完成上传和字段填写，最终发布需要人工确认。"
            for row in reversed(workspace.logs):
                task.logs.insert(0, row)
            _prepend_task_logs(task, _build_publish_flow_logs(account, asset, draft, final_action="manual_confirm"))
            task.logs.insert(0, log(f"待上传视频：{video_path}"))
            if asset.coverLocalPath:
                task.logs.insert(0, log(f"待上传封面：{asset.coverLocalPath}"))
            task.logs.insert(0, log(f"待填写标题：{draft.title}"))
            task.logs.insert(0, log(f"待填写标签：{'、'.join(draft.tags)}"))
            task.logs.insert(0, log("上传准备模式：不静默点击最终发布按钮，需人工确认", "warn"))
    elif runtime.publisherRunMode == "social_auto_upload":
        if not runtime.socialAutoUpload.executionReady:
            task.status = "failed"
            task.errorMessage = runtime.socialAutoUpload.missingReason or "social-auto-upload 不可用"
            task.logs.insert(0, log(task.errorMessage, "error"))
        elif draft.platform not in runtime.socialAutoUpload.supportedPlatforms:
            message = "social-auto-upload 当前未启用该平台上传入口，已回退为人工接管。"
            task.status = "manual_takeover"
            task.executionMode = "manual_takeover"
            task.errorMessage = message
            task.logs.insert(0, log(message, "warn"))
            task.logs.insert(0, log("可以继续使用 Upload Prepare 或账号独立浏览器完成发布；视频号可设置 SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT=true 试用 sau tencent", "warn"))
        else:
            session_ok, session_message = check_social_auto_upload_session(account)
            task.logs.insert(0, log(session_message, "info" if session_ok else "error"))
            if not session_ok:
                if account.authType == "browser_session" and account.status == "connected" and account.sessionHealth != "expired":
                    blockers = _publish_upload_blockers(account, asset, draft)
                    if blockers:
                        task.status = "failed"
                        task.errorMessage = "；".join(blockers)
                        for blocker in reversed(blockers):
                            task.logs.insert(0, log(blocker, "error"))
                    else:
                        workspace = prepare_isolated_browser_workspace(account)
                        video_path = _asset_video_file_path(asset)
                        task.status = "manual_takeover"
                        task.executionMode = "manual_takeover"
                        task.errorMessage = "已读取项目中保存的登录账号；SAU 独立 cookie 不可用，已回退到账号独立浏览器档案准备上传。"
                        for row in reversed(workspace.logs):
                            task.logs.insert(0, row)
                        _prepend_task_logs(task, _build_publish_flow_logs(account, asset, draft, final_action="manual_confirm"))
                        task.logs.insert(0, log(f"待上传视频：{video_path}"))
                        if asset.coverLocalPath:
                            task.logs.insert(0, log(f"待上传封面：{asset.coverLocalPath}"))
                        task.logs.insert(0, log(f"待填写标题：{draft.title}"))
                        task.logs.insert(0, log(f"待填写标签：{'、'.join(draft.tags)}"))
                        task.logs.insert(0, log("未要求二次登录：使用账号中心已保存的登录态", "warn"))
                else:
                    task.status = "failed"
                    task.errorMessage = session_message
            else:
                try:
                    result = run_social_auto_upload_task(account, asset, draft, task)
                    task.status = "published"
                    task.executionMode = "browser"
                    task.platformItemId = f"sau-{task.platform}-{str(uuid4())[:8]}"
                    task.errorMessage = None
                    task.logs.insert(0, log(f"social-auto-upload 已提交上传，account={result.account_name}"))
                    task.logs.insert(0, log(f"sau cwd：{result.cwd}"))
                    task.logs.insert(0, log(f"sau command：{_safe_command_for_log(result.command)}"))
                    if result.scheduled_for:
                        task.logs.insert(0, log(f"已传递平台定时发布时间：{result.scheduled_for}"))
                    if result.draft_mode:
                        task.logs.insert(0, log("视频号实验模式：已要求 sau 保存草稿，最终发布需人工确认", "warn"))
                    if result.stdout:
                        task.logs.insert(0, log(f"sau stdout：{result.stdout}"))
                    if result.stderr:
                        task.logs.insert(0, log(f"sau stderr：{result.stderr}", "warn"))
                    account.publishedToday += 1
                    account.status = "connected"
                    account.sessionHealth = "healthy"
                    account.updatedAt = now_iso()
                except SocialAutoUploadUnsupported as err:
                    task.status = "manual_takeover"
                    task.executionMode = "manual_takeover"
                    task.errorMessage = str(err)
                    task.logs.insert(0, log(str(err), "warn"))
                    task.logs.insert(0, log("已回退为人工接管：可继续使用账号独立浏览器完成视频号发布", "warn"))
                except (SocialAutoUploadUnavailable, SocialAutoUploadError) as err:
                    task.status = "failed"
                    task.errorMessage = str(err)
                    task.logs.insert(0, log(str(err), "error"))
    else:
        task.status = "published"
        task.platformItemId = f"dryrun-{task.platform}-{str(uuid4())[:8]}"
        task.errorMessage = None
        _prepend_task_logs(task, _build_publish_flow_logs(account, asset, draft, final_action="dry_run"))
        task.logs.insert(0, log(f"Dry-run 模拟发布成功，模拟平台作品 ID：{task.platformItemId}"))
        task.logs.insert(0, log("Dry-run 未向真实平台提交任何内容", "warn"))
        account.publishedToday += 1
        account.updatedAt = now_iso()

    task.updatedAt = now_iso()
    return task
