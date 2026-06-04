export type PlatformKey = "wechat_channels" | "douyin";

export interface OptionItem {
  key: string;
  label: string;
  description?: string;
}

export interface DimensionItem extends OptionItem {
  color: string;
}

export interface DiagnoseStep {
  label: string;
  desc: string;
}

export interface PlatformConfig {
  key: PlatformKey;
  label: string;
  shortLabel: string;
  description: string;
  uploadTitle: string;
  uploadHint: string;
  formTitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  contentLabel: string;
  contentPlaceholder: string;
  materialRequiredMessage: string;
  titleRequiredMessage: string;
  categories: OptionItem[];
  defaultCategory: string;
  dimensions: DimensionItem[];
  steps: DiagnoseStep[];
  tips: Record<string, string[]>;
  funFacts: Array<{ q: string; a: string }>;
}

export const WECHAT_DIMENSIONS: DimensionItem[] = [
  { key: "title_hook", label: "标题钩子", color: "#ff2442" },
  { key: "cover_click", label: "封面点击力", color: "#8b5cf6" },
  { key: "script_retention", label: "脚本留存力", color: "#f59e0b" },
  { key: "interaction_share", label: "互动转发力", color: "#3b82f6" },
  { key: "positioning_fit", label: "账号定位匹配", color: "#10b981" },
  { key: "overall", label: "综合评分", color: "#262626" },
];

export const DOUYIN_DIMENSIONS: DimensionItem[] = [
  { key: "hook", label: "前3秒/秒停留", color: "#ff2442" },
  { key: "completion", label: "完播结构", color: "#f59e0b" },
  { key: "recognition", label: "设计需求识别", color: "#3b82f6" },
  { key: "conversion", label: "项目线索承接", color: "#10b981" },
  { key: "baseline_fit", label: "账号/案例基线", color: "#8b5cf6" },
  { key: "overall", label: "综合评分", color: "#262626" },
];

export const WECHAT_CATEGORIES: OptionItem[] = [
  { key: "hospitality_design", label: "民宿酒店设计", description: "民宿、酒店、文旅空间的案例、房型和改造内容" },
  { key: "office_design", label: "办公空间设计", description: "办公室、前台、会议区、企业展厅和品牌空间" },
  { key: "case_study", label: "设计案例复盘", description: "从项目问题、设计动作到落地结果的案例拆解" },
  { key: "owner_education", label: "业主避坑/设计科普", description: "预算、工期、材料、动线和施工边界科普" },
];

export const DOUYIN_TRAFFIC_FIELDS: OptionItem[] = [
  { key: "hospitality_design", label: "民宿酒店设计", description: "民宿业主、酒店投资人、文旅项目需求" },
  { key: "office_design", label: "办公空间设计", description: "老板、行政、人力、品牌负责人需求" },
  { key: "search", label: "设计需求搜索", description: "预算、流程、平面图、改造避坑等长尾搜索" },
  { key: "interest", label: "设计案例推荐", description: "前后对比、实景案例、空间结果破圈" },
  { key: "private", label: "项目线索承接", description: "评论关键词、私信初诊、案例资料和预约咨询" },
];

export const DOUYIN_GOALS: OptionItem[] = [
  { key: "follow", label: "转粉" },
  { key: "comment", label: "评论互动" },
  { key: "save", label: "收藏复看" },
  { key: "lead", label: "私信留资" },
  { key: "deal", label: "咨询预约" },
];

const wechatSteps: DiagnoseStep[] = [
  { label: "数据预评分", desc: "基于视频号场景快速预估内容潜力" },
  { label: "解析视频号素材", desc: "提取标题、简介、脚本与运营数据" },
  { label: "分析封面首帧", desc: "评估信息流、朋友圈和群聊预览点击力" },
  { label: "对比场景基线", desc: "与同类视频号内容的表现基线对比" },
  { label: "标题脚本专家诊断", desc: "评估钩子、开头3秒和口播节奏" },
  { label: "封面视觉专家诊断", desc: "分析封面大字、主体和转发卡片辨识度" },
  { label: "视频号增长专家诊断", desc: "评估互动、转发、发布时间与项目初诊承接" },
  { label: "观众模拟器运行", desc: "模拟信息流、朋友圈和微信群用户反应" },
  { label: "Agent 辩论交锋", desc: "4 位专家互相质疑与补充" },
  { label: "综合裁判评定", desc: "汇总意见，给出视频号优化处方" },
  { label: "生成诊断报告", desc: "整合评分、建议与下一条选题方向" },
];

const douyinSteps: DiagnoseStep[] = [
  { label: "素材预评分", desc: "先用抖音设计内容字段快速判断发布风险" },
  { label: "前端打包 FormData", desc: "整理标题、人群、目标动作、脚本和上传素材" },
  { label: "解析抖音素材", desc: "解析文本、图片、视频和运营数据" },
  { label: "本地 baseline 对比", desc: "对比账号历史和同类爆款代理样本" },
  { label: "秒停留 Agent", desc: "判断首帧、标题和前 3 秒能否拿到冷启动停留" },
  { label: "完播 Agent", desc: "检查时长、节奏、信息密度和结构兑现" },
  { label: "设计字段 Agent", desc: "判断民宿酒店、办公空间、搜索或线索承接的分发匹配度" },
  { label: "线索承接 Agent", desc: "评估评论、收藏、转粉、私信、预约和项目初诊路径" },
  { label: "Agent 辩论补充", desc: "围绕最大短板互相质疑和补充" },
  { label: "JudgeAgent 汇总", desc: "输出抖音素材会诊报告和拍摄处方" },
  { label: "生成诊断报告", desc: "整合评分、雷达图、建议和模拟评论" },
];

const wechatTips: Record<string, string[]> = {
  hospitality_design: [
    "民宿酒店设计内容要让业主一眼看到项目问题、设计动作和改造结果",
    "封面优先用前后对比、平面图、房型动线或完工实景",
    "转发理由通常来自合伙人讨论、预算避坑、房型优化和入住体验",
    "结尾适合引导留言面积、房型、预算或评论关键词领取设计清单",
  ],
  office_design: [
    "办公空间内容要把审美转成客户接待、会议效率、品牌形象和施工落地",
    "封面建议突出前台、会议区、企业展厅、动线图或完工实景",
    "视频号转发动力来自老板、行政、人力和品牌负责人共同决策",
    "结尾适合承接面积、人数、预算、工期和项目初诊",
  ],
  case_study: [
    "案例复盘要从原始问题讲起，不要只展示漂亮完工图",
    "中段用设计动作、预算边界、施工限制和取舍理由建立专业感",
    "每条案例都要讲清项目条件，避免让用户误以为所有项目都适用",
    "结尾引导用户提交同类空间问题做下一期拆解",
  ],
  owner_education: [
    "业主避坑内容要先给判断标准，再讲为什么和怎么做",
    "预算、材料、工期、动线、采光和授权边界都适合做系列",
    "标题里的适用人群越明确，老板/合伙人转发理由越强",
    "避免保证入住率、营收、成交率等绝对化承诺",
  ],
  _default: [
    "设计公司视频号的关键不是单点爆款，而是专业信任、转发理由和项目初诊一起成立",
    "开头 3 秒决定是否停留，结尾动作决定是否留言面积、预算或项目阶段",
    "熟人社交里，用户愿意转发的内容通常要能帮助老板、业主或合伙人做决策",
    "封面在信息流、朋友圈和群聊卡片里都要看得懂空间类型和问题",
  ],
};

const douyinTips: Record<string, string[]> = {
  hospitality_design: [
    "民宿酒店设计内容前 3 秒最好直接给改造后结果、平面图或房型问题",
    "口播不要只讲风格，要讲清业主痛点、设计动作、预算边界和适用条件",
    "标题、字幕和标签要出现民宿设计、酒店设计、房型优化、改造预算等关键词",
  ],
  office_design: [
    "办公空间内容要把前台、会议区、企业展厅和动线问题拍清楚",
    "第一句用客户接待、会议效率、员工协作或品牌形象切入",
    "评论承接围绕面积、人数、预算、工期和项目阶段，不要泛泛求私信",
  ],
  interest: [
    "设计案例推荐流先看秒停留，第一帧和第一句必须给结果、空间冲突或强痛点",
    "推荐流不要只堆信息，要每 4-6 秒给一个新刺激点",
    "标题、字幕、画面主题越一致，系统越容易识别初始人群",
  ],
  search: [
    "设计搜索流要保证关键词、答案密度和步骤完整度，不能只靠情绪钩子",
    "预算、流程、平面图、动线、材料、避坑类内容更容易形成长尾复看",
    "标题和口播里最好重复同一个核心关键词，但不要机械堆词",
  ],
  local: [
    "设计内容要讲清空间类型、项目条件、预算边界和咨询预约路径",
    "封面要能一眼识别空间问题，别只放抽象大字",
    "评论区适合承接面积、预算、工期、房型或办公人数等真实问题",
  ],
  commerce: [
    "商业视频要先讲使用场景和信任证据，再给价格或套餐",
    "设计服务内容要降低决策成本：适合谁、不适合谁、怎么预约初诊",
    "强营销会伤停留，先证明价值再引导交易动作",
  ],
  private: [
    "项目线索承接要强化系列感和专业信任，别只追单条播放",
    "老粉互动更适合案例复盘、图纸问答、预算投票和项目幕后",
    "项目初诊承接要自然说明评论关键词能得到什么：案例、清单、初诊表或预算边界",
  ],
  _default: [
    "抖音素材先过前 3 秒，再谈完播和项目线索",
    "民宿酒店设计、办公空间设计、搜索答疑和线索承接的诊断重点不同，先选准内容字段",
    "承接动作越具体，用户看完后的下一步越容易发生",
    "账号基线不足时，先用同结构连发 3 条建立对照",
  ],
};

export const PLATFORM_CONFIGS: Record<PlatformKey, PlatformConfig> = {
  wechat_channels: {
    key: "wechat_channels",
    label: "微信视频号",
    shortLabel: "视频号",
    description: "诊断设计案例的标题、封面、脚本留存、熟人转发和项目初诊承接",
    uploadTitle: "上传视频号素材",
    uploadHint: "上传封面、发布页截图或视频，AI 自动识别标题、正文、空间画面与设计分类",
    formTitle: "视频号设计作品信息",
    titleLabel: "视频标题",
    titlePlaceholder: "例如：办公室前台这样改，客户第一印象会更稳",
    contentLabel: "简介/发布文案",
    contentPlaceholder: "视频号发布文案，可写项目问题、设计动作、预算边界或引导评论的话术",
    materialRequiredMessage: "请先上传视频号封面、截图或视频素材",
    titleRequiredMessage: "请输入视频号标题",
    categories: WECHAT_CATEGORIES,
    defaultCategory: "hospitality_design",
    dimensions: WECHAT_DIMENSIONS,
    steps: wechatSteps,
    tips: wechatTips,
    funFacts: [
      { q: "视频号为什么要重视转发理由？", a: "因为很多曝光来自朋友圈、微信群和私域关系链" },
      { q: "开头 3 秒最该解决什么？", a: "让用户立刻知道这条视频和自己有什么关系" },
      { q: "设计公司内容最常见的问题是什么？", a: "只展示漂亮画面，不讲客户场景、设计动作和项目边界" },
      { q: "民宿酒店封面最重要的信息是什么？", a: "空间类型、改造前后、房型/预算问题，最好一眼能判断是否相关" },
      { q: "办公空间内容为什么要讲动线？", a: "老板和行政更关心客户接待、会议效率和员工使用是否真的变好" },
      { q: "评论区问题怎么设计？", a: "越像真实业主会顺手回答的问题，线索越自然" },
      { q: "项目初诊承接是什么意思？", a: "让公开内容自然导向评论、案例、预算判断和人工咨询" },
      { q: "视频号标题要不要很网感？", a: "不一定。可信、清楚、适合老板/业主转发，往往比夸张更重要" },
    ],
  },
  douyin: {
    key: "douyin",
    label: "抖音号",
    shortLabel: "抖音",
    description: "诊断设计案例的前 3 秒、完播结构、需求识别和项目线索承接",
    uploadTitle: "上传抖音素材",
    uploadHint: "上传首帧、封面、数据截图或视频，AI 辅助识别空间画面和脚本线索",
    formTitle: "抖音设计素材信息",
    titleLabel: "抖音标题",
    titlePlaceholder: "例如：老民宿改造前，先看这 5 个设计动作",
    contentLabel: "发布文案/Caption",
    contentPlaceholder: "抖音发布文案，可写设计关键词、项目条件、行动引导或补充说明",
    materialRequiredMessage: "请先上传抖音封面、截图或视频素材",
    titleRequiredMessage: "请输入抖音标题",
    categories: DOUYIN_TRAFFIC_FIELDS,
    defaultCategory: "hospitality_design",
    dimensions: DOUYIN_DIMENSIONS,
    steps: douyinSteps,
    tips: douyinTips,
    funFacts: [
      { q: "抖音冷启动最先看什么？", a: "先看用户是否停留，首帧、标题和第一句要立刻给理由" },
      { q: "搜索流和推荐流有什么差别？", a: "搜索流更看设计关键词和答案完整度，推荐流更看前后对比带来的停留" },
      { q: "设计视频为什么要讲预算边界？", a: "业主看完要判断是否适合自己，缺少决策信息会流失" },
      { q: "完播低通常怎么改？", a: "删背景铺垫，把内容压成结果、冲突、步骤、证明几个节点" },
      { q: "线索承接最怕什么？", a: "用户看完不知道下一步做什么，评论/私信/初诊动作必须明确" },
    ],
  },
};

export function getPlatformConfig(platform?: string): PlatformConfig {
  return PLATFORM_CONFIGS[(platform as PlatformKey) || "wechat_channels"] || PLATFORM_CONFIGS.wechat_channels;
}

export function getDimensionConfig(platform?: string): DimensionItem[] {
  return getPlatformConfig(platform).dimensions;
}
