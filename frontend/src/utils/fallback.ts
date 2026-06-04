/**
 * 离线 fallback 数据，当后端不可用时展示
 */
import type { DiagnoseResult } from "./api";

export const FALLBACK_REPORT: DiagnoseResult = {
  overall_score: 68,
  grade: "B",
  radar_data: {
    title_hook: 72,
    cover_click: 60,
    script_retention: 66,
    interaction_share: 62,
    positioning_fit: 74,
    overall: 68,
  },
  agent_opinions: [
    {
      agent_name: "标题脚本专家",
      dimension: "标题与脚本留存",
      score: 72,
      issues: [
        "标题有场景感，但缺少明确利益点和冲突钩子",
        "开头3秒没有先给结论，用户需要等待太久才知道价值",
      ],
      suggestions: [
        "把标题改成“人群 + 痛点 + 结果”的结构，例如先点出适合谁",
        "开头3秒先说结论，再用一个真实案例展开",
      ],
      reasoning:
        "当前标题能看出方向，但在视频号信息流里不够快。视频号用户更需要一眼知道这条内容和自己、家人或客户有什么关系。",
      debate_comments: [],
    },
    {
      agent_name: "封面视觉专家",
      dimension: "封面点击力",
      score: 60,
      issues: [
        "封面主体不够突出，群聊和朋友圈转发卡片里识别度偏弱",
        "封面文字信息不足，用户不容易判断点开后能得到什么",
      ],
      suggestions: [
        "封面保留一个清晰主体，配 8-12 字大标题",
        "首帧文字直接写用户痛点，不要只放氛围图",
      ],
      reasoning:
        "视频号封面既出现在信息流，也可能被转发到聊天场景，必须在小尺寸预览里仍然读得懂。",
      debate_comments: [],
    },
    {
      agent_name: "视频号增长专家",
      dimension: "互动转发力",
      score: 62,
      issues: [
        "内容有信息价值，但缺少熟人转发理由",
        "结尾互动偏弱，没有自然引导评论或项目初诊承接",
      ],
      suggestions: [
        "增加一句适合转给老板、业主、行政或合伙人的理由",
        "结尾用具体项目问题引导评论，例如“你现在卡在面积、预算还是动线？”",
      ],
      reasoning:
        "视频号增长更依赖朋友圈、微信群和项目决策关系链扩散，单纯追求点击不够。",
      debate_comments: [],
    },
    {
      agent_name: "观众模拟专家",
      dimension: "观众反应",
      score: 66,
      issues: [
        "信息流用户可能觉得内容有用，但不一定愿意看完",
        "朋友圈接收者需要更明确的共鸣点或转发理由",
      ],
      suggestions: [
        "前半段减少铺垫，用真实场景快速建立代入感",
        "增加一句“适合谁/不适合谁”，降低用户判断成本",
      ],
      reasoning: "模拟用户反应：目标用户会停留，但非强需求用户可能在前5秒划走。",
      debate_comments: [],
    },
  ],
  issues: [
    {
      severity: "high",
      description: "开头3秒价值点不够直接，影响完播和停留",
      from_agent: "标题脚本专家",
    },
    {
      severity: "high",
      description: "封面在朋友圈和群聊预览里的信息传达偏弱",
      from_agent: "封面视觉专家",
    },
    {
      severity: "medium",
      description: "缺少清晰的熟人转发理由，互动转发潜力不足",
      from_agent: "视频号增长专家",
    },
  ],
  suggestions: [
    {
      priority: 1,
      description: "重写开头3秒：先给结论，再补充场景和案例",
      expected_impact: "预计提升停留与完播率",
    },
    {
      priority: 2,
      description: "封面增加 8-12 字大标题，突出痛点和适用人群",
      expected_impact: "预计提升信息流点击和转发卡片打开率",
    },
    {
      priority: 3,
      description: "结尾加入自然互动问题和项目初诊承接动作",
      expected_impact: "预计提升评论、转发和咨询转化",
    },
  ],
  debate_summary:
    "4位专家一致认为，当前内容不是单纯标题问题，而是“开头留存 + 封面表达 + 转发理由”没有形成闭环。最终建议先改开头3秒和封面，再补充适合微信关系链传播的互动话术。",
  simulated_comments: [
    {
      username: "家有二宝",
      avatar_emoji: "👩",
      comment: "这个我家也遇到过，能不能讲讲具体怎么做？",
      sentiment: "positive",
    },
    {
      username: "老王同城生活",
      avatar_emoji: "👨",
      comment: "标题说得有点绕，点进来才知道重点。",
      sentiment: "neutral",
    },
    {
      username: "客户群运营中",
      avatar_emoji: "💬",
      comment: "这条适合转群里，但是最好再说清楚适合哪类人。",
      sentiment: "positive",
    },
    {
      username: "认真看完了",
      avatar_emoji: "📌",
      comment: "前面铺垫有点长，后面的案例其实挺有用。",
      sentiment: "neutral",
    },
    {
      username: "民宿业主阿杰",
      avatar_emoji: "🏪",
      comment: "如果能加一个真实案例，我会更愿意相信。",
      sentiment: "neutral",
    },
  ],
  optimized_title: "很多人发视频号没转发，不是内容没用，是少了这句话",
  optimized_content:
    "先说结论：设计类视频想被转发，不能只讲“空间很好看”，要讲清楚“老板、业主或合伙人为什么要一起看”。\n\n开头3秒可以这样说：\n“如果你的民宿或办公室准备改造，先别急着看效果图，先看这条动线。”\n\n正文节奏：\n1. 先点出常见项目问题：预算花了，但体验没有变好。\n2. 再给一个例子：用平面图或前后对比说明设计动作。\n3. 最后给自然互动：你现在最卡的是面积、预算还是动线？评论区告诉我。",
  cover_direction: {
    layout: "人物或产品主体占画面60%左右，左侧/上方留出大字标题区",
    color_scheme: "背景简洁，主色不超过3种，保证群聊小图里仍能看清",
    text_style: "封面大字写“没人转发的原因”，副标题写“视频号先改这句话”",
    tips: [
      "不要把信息都压在封面上，保留一个最强痛点",
      "首帧和封面标题保持一致，避免点开后落差太大",
      "如果面向项目客户，加入真实空间、平面图或前后对比增强可信度",
    ],
  },
  debate_timeline: [
    {
      round: 2,
      agent_name: "标题脚本专家",
      kind: "agree" as const,
      text: "同意增长专家的判断：标题能吸引点击还不够，开头必须马上给出转发价值。",
    },
    {
      round: 2,
      agent_name: "封面视觉专家",
      kind: "rebuttal" as const,
      text: "需要补充一点，当前封面在小尺寸预览里弱，即使标题优化也可能损失第一波点击。",
    },
    {
      round: 2,
      agent_name: "视频号增长专家",
      kind: "add" as const,
      text: "建议把结尾动作从泛泛的点赞关注，改成具体评论问题或适合转发的人群提示。",
    },
    {
      round: 2,
      agent_name: "观众模拟专家",
      kind: "agree" as const,
      text: "同意。普通用户愿意看完的前提，是开头就知道这条内容和自己有什么关系。",
    },
  ],
};
