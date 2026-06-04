import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  Box, Typography, TextField, Button, Chip,
  CircularProgress, useTheme,
  useMediaQuery, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, FormControlLabel, Switch,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import {
  quickRecognize,
  quickRecognizeVideo,
  getApiHealth,
  getModelConfig,
  saveModelConfig,
  type ModelConfig,
  type ModelConfigPayload,
} from "../utils/api";
import {
  diagnoseOpsAccount,
  getOpsState,
  isOpsFrontendEnabled,
  openOpsWorkspace,
  type AccountDiagnosisAgentOpinion,
  type AccountDiagnosisDebateTurn,
  type AccountDiagnosisReport,
  type AccountDiagnosisStage,
  type OpsAccount,
  type OpsPlatform,
  type OpsState,
} from "../utils/opsApi";
import {
  DOUYIN_GOALS,
  PLATFORM_CONFIGS,
  getPlatformConfig,
  type PlatformKey,
} from "../config/platforms";
import type { QuickRecognizeResult } from "../utils/api";

const pageBg = "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 48%, #F8FAFC 100%)";
const textPrimary = "#0F172A";
const textSecondary = "#475569";
const textMuted = "#64748B";
const brandBlue = "#1E40AF";
const brandBlueDark = "#1E3A8A";
const cardSx = {
  bgcolor: "rgba(255,255,255,0.94)",
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: "16px",
  boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
  backdropFilter: "blur(18px)",
};
const softButtonSx = {
  color: "#1E3A8A",
  fontSize: 12,
  fontWeight: 800,
  borderRadius: "999px",
  bgcolor: "rgba(239,246,255,0.88)",
  border: "1px solid rgba(147,197,253,0.58)",
  cursor: "pointer",
  "&:hover": { bgcolor: "#DBEAFE", borderColor: "#93C5FD" },
};
const primaryButtonSx = {
  bgcolor: brandBlue,
  borderRadius: "12px",
  fontWeight: 900,
  boxShadow: "0 14px 28px rgba(30,64,175,0.22)",
  "&:hover": { bgcolor: brandBlueDark, boxShadow: "0 16px 34px rgba(30,64,175,0.28)" },
  "&:active": { transform: "translateY(0)" },
  "&.Mui-disabled": { bgcolor: "#E2E8F0", boxShadow: "none", color: "#94A3B8" },
};

const opsPlatformLabels: Record<OpsPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechat_channels: "视频号",
};

const opsStatusLabels: Record<string, string> = {
  connected: "已连接",
  needs_login: "需登录",
  disabled: "已停用",
  healthy: "正常",
  expired: "已过期",
  unknown: "待确认",
  browser_session: "独立浏览器档案",
  oauth: "官方授权",
  manual: "手动记录",
};

const ACCOUNT_DIAGNOSIS_FLOW: AccountDiagnosisStage[] = [
  {
    key: "snapshot",
    label: "读取账号快照",
    status: "done",
    summary: "读取登录态、账号记忆、指标快照、草稿任务和私信提醒。",
  },
  {
    key: "baseline",
    label: "账号记忆与平台 baseline 对比",
    status: "done",
    summary: "把账号历史、平台关键指标和内容支柱放到同一张诊断底稿里。",
  },
  {
    key: "agents",
    label: "专家 Agent 独立诊断",
    status: "done",
    summary: "账号定位、平台算法、内容管线、互动转化、外部技能和风险控制分别出结论。",
  },
  {
    key: "debate",
    label: "Agent 互相讨论",
    status: "done",
    summary: "围绕推荐适配、内容节奏、转化承接和风险点互相补充。",
  },
  {
    key: "judge",
    label: "JudgeAgent 汇总",
    status: "done",
    summary: "汇总评分、优先级建议、风险提醒和下一步可执行动作。",
  },
];

function formatOpsTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOpsErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail) return JSON.stringify(detail);
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "操作失败，请稍后重试";
}

function getStageTone(status: AccountDiagnosisStage["status"] | "active" | "pending") {
  if (status === "active") {
    return { bg: "#EFF6FF", border: "#93C5FD", text: brandBlue, dot: brandBlue, label: "进行中" };
  }
  if (status === "done") {
    return { bg: "#ECFDF5", border: "#BBF7D0", text: "#047857", dot: "#10B981", label: "完成" };
  }
  if (status === "warn") {
    return { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C", dot: "#F97316", label: "需补充" };
  }
  if (status === "blocked") {
    return { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C", dot: "#EF4444", label: "阻塞" };
  }
  return { bg: "#F8FAFC", border: "#E2E8F0", text: textMuted, dot: "#CBD5E1", label: "等待" };
}

function AccountDiagnosisFlowPanel({
  stages,
  loading,
  currentIndex,
}: {
  stages: AccountDiagnosisStage[];
  loading: boolean;
  currentIndex: number;
}) {
  const safeStages = stages.length ? stages : ACCOUNT_DIAGNOSIS_FLOW;

  return (
    <Box
      aria-live="polite"
      sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.25 }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 950, color: textPrimary }}>
            一键诊断流程
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: textMuted, mt: 0.25 }}>
            {loading ? "正在按薯医式会诊链路逐步推进" : "已完成全部账号会诊阶段"}
          </Typography>
        </Box>
        {loading && <CircularProgress size={16} thickness={5} sx={{ color: brandBlue, flexShrink: 0 }} />}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${Math.min(safeStages.length, 5)}, 1fr)` }, gap: 0.8 }}>
        {safeStages.map((stage, index) => {
          const visualStatus =
            loading
              ? index < currentIndex ? "done" : index === currentIndex ? "active" : "pending"
              : stage.status;
          const tone = getStageTone(visualStatus);
          return (
            <Box
              key={stage.key}
              sx={{
                minWidth: 0,
                p: 1,
                borderRadius: "8px",
                bgcolor: tone.bg,
                border: `1px solid ${tone.border}`,
                transition: "background-color 0.2s ease, border-color 0.2s ease",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 0.75, mb: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.55, minWidth: 0 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tone.dot, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 950, color: tone.text }}>
                    {String(index + 1).padStart(2, "0")}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 10, fontWeight: 900, color: tone.text, flexShrink: 0 }}>
                  {tone.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, lineHeight: 1.35 }}>
                {stage.label}
              </Typography>
              <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.45, mt: 0.45 }}>
                {stage.summary}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function AccountAgentSummary({ opinions }: { opinions: AccountDiagnosisAgentOpinion[] }) {
  if (!opinions.length) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 950, mb: 0.8 }}>Agent 会诊</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1 }}>
        {opinions.slice(0, 6).map((item) => (
          <Box key={item.agentName} sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 950, color: textPrimary }}>{item.agentName}</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 950, color: item.score >= 75 ? "#047857" : item.score >= 60 ? "#C2410C" : "#B91C1C" }}>
                {item.score}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.45 }}>
              {item.suggestions[0] || item.evidence[0] || item.focus}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function AccountDebateSummary({
  turns,
  judgeSummary,
}: {
  turns: AccountDiagnosisDebateTurn[];
  judgeSummary: string;
}) {
  const visibleTurns = turns.filter((item) => item.kind !== "judge").slice(0, 3);
  if (!visibleTurns.length && !judgeSummary) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 950, mb: 0.8 }}>辩论与裁判</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
        {visibleTurns.map((item, index) => (
          <Box key={`${item.round}-${item.agentName}-${index}`} sx={{ borderLeft: `3px solid ${item.kind === "challenge" ? "#F97316" : "#1E40AF"}`, pl: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: textMuted }}>
              Round {item.round} · {item.agentName}
            </Typography>
            <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>
              {item.message}
            </Typography>
          </Box>
        ))}
        {judgeSummary && (
          <Box sx={{ bgcolor: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", p: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 950, color: brandBlue, mb: 0.35 }}>JudgeAgent</Typography>
            <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>
              {judgeSummary}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

const emptyModelConfigForm: ModelConfigPayload = {
  provider: "openai",
  base_url: "",
  wire_api: "chat",
  api_key: "",
  model: "",
  review_model: "",
  model_reasoning_effort: "",
  model_fast: "",
  model_pro: "",
  model_omni: "",
  openai_compat: "",
  skip_json_response_format: false,
};

function toModelConfigForm(config: ModelConfig | null): ModelConfigPayload {
  if (!config) return emptyModelConfigForm;
  return {
    provider: config.provider || "openai",
    base_url: config.base_url || "",
    wire_api: config.wire_api || "chat",
    api_key: "",
    model: config.model || "",
    review_model: config.review_model || config.model || "",
    model_reasoning_effort: config.model_reasoning_effort || "",
    model_fast: config.model_fast || config.model || "",
    model_pro: config.model_pro || config.model || "",
    model_omni: config.model_omni || config.model || "",
    openai_compat: config.openai_compat || "",
    skip_json_response_format: !!config.skip_json_response_format,
  };
}

function ModelConfigDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [form, setForm] = useState<ModelConfigPayload>(emptyModelConfigForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const setField = <K extends keyof ModelConfigPayload>(key: K, value: ModelConfigPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage("");
    setError("");
    void getModelConfig()
      .then((next) => {
        setConfig(next);
        setForm(toModelConfigForm(next));
      })
      .catch((err: unknown) => setError(getOpsErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const next = await saveModelConfig(form);
      setConfig(next);
      setForm(toModelConfigForm(next));
      setMessage("模型接口已保存，后续诊断会使用这组配置。");
    } catch (err: unknown) {
      setError(getOpsErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 950, pb: 1 }}>
        模型接口
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "#F8FAFC" }}>
        <Typography sx={{ fontSize: 12.5, color: textMuted, lineHeight: 1.7, mb: 1.5 }}>
          这里配置 OpenAI-compatible 或 Responses API 网关。API Key 只写入本机配置文件，不会在界面回显完整内容。
        </Typography>
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 3 }}>
            <CircularProgress size={18} />
            <Typography sx={{ fontSize: 13, color: textMuted }}>正在读取模型配置...</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
            <TextField
              select
              label="模型提供商"
              size="small"
              value={form.provider}
              onChange={(e) => setField("provider", e.target.value)}
            >
              <MenuItem value="openai">OpenAI-compatible</MenuItem>
            </TextField>
            <TextField
              select
              label="接口协议"
              size="small"
              value={form.wire_api}
              onChange={(e) => setField("wire_api", e.target.value)}
            >
              <MenuItem value="chat">Chat Completions</MenuItem>
              <MenuItem value="responses">Responses</MenuItem>
            </TextField>
            <TextField
              label="API 接口地址"
              size="small"
              value={form.base_url}
              onChange={(e) => setField("base_url", e.target.value)}
              placeholder="https://api.example.com/v1"
              sx={{ gridColumn: { md: "1 / -1" } }}
            />
            <TextField
              label={config?.has_api_key ? `API Key（已配置：${config.api_key_preview}）` : "API Key"}
              size="small"
              type="password"
              value={form.api_key || ""}
              onChange={(e) => setField("api_key", e.target.value)}
              placeholder={config?.has_api_key ? "留空则继续使用已保存的 Key" : "粘贴外部模型 API Key"}
              sx={{ gridColumn: { md: "1 / -1" } }}
            />
            <TextField
              label="默认模型"
              size="small"
              value={form.model}
              onChange={(e) => setField("model", e.target.value)}
              placeholder="gpt-5.5"
            />
            <TextField
              label="评审模型"
              size="small"
              value={form.review_model}
              onChange={(e) => setField("review_model", e.target.value)}
              placeholder="gpt-5.5"
            />
            <TextField
              label="快速模型"
              size="small"
              value={form.model_fast}
              onChange={(e) => setField("model_fast", e.target.value)}
              placeholder="gpt-5.5"
            />
            <TextField
              label="专业模型"
              size="small"
              value={form.model_pro}
              onChange={(e) => setField("model_pro", e.target.value)}
              placeholder="gpt-5.5"
            />
            <TextField
              label="多模态模型"
              size="small"
              value={form.model_omni}
              onChange={(e) => setField("model_omni", e.target.value)}
              placeholder="gpt-5.5"
            />
            <TextField
              label="推理强度"
              size="small"
              value={form.model_reasoning_effort}
              onChange={(e) => setField("model_reasoning_effort", e.target.value)}
              placeholder="xhigh"
            />
            <TextField
              label="兼容标记"
              size="small"
              value={form.openai_compat}
              onChange={(e) => setField("openai_compat", e.target.value)}
              placeholder="mimo，可留空"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.skip_json_response_format}
                  onChange={(e) => setField("skip_json_response_format", e.target.checked)}
                />
              }
              label="跳过 JSON response_format"
              sx={{ alignSelf: "center", m: 0 }}
            />
          </Box>
        )}
        {config?.config_path && (
          <Typography sx={{ fontSize: 11, color: textMuted, mt: 1.25 }}>
            本机配置文件：{config.config_path}
          </Typography>
        )}
        {message && <Alert severity="success" sx={{ mt: 1.5, borderRadius: "8px", fontSize: 12 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 1.5, borderRadius: "8px", fontSize: 12 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>关闭</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading || saving} sx={{ ...primaryButtonSx, minWidth: 96 }}>
          {saving ? "保存中..." : "保存接口"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** @returns A stable key for a File object */
function fkey(f: File) {
  return `${f.name}_${f.size}_${f.lastModified}`;
}

/** 中文垂类 -> 视频号设计场景 key 映射 */
const CAT_MAP: Record<string, string> = {
  "民宿酒店设计": "hospitality_design", "民宿设计": "hospitality_design", "酒店设计": "hospitality_design", "民宿": "hospitality_design", "酒店": "hospitality_design", "文旅": "hospitality_design", "房型": "hospitality_design",
  "办公空间设计": "office_design", "办公室设计": "office_design", "办公空间": "office_design", "前台": "office_design", "会议区": "office_design", "企业展厅": "office_design",
  "设计案例复盘": "case_study", "案例复盘": "case_study", "设计案例": "case_study", "空间改造": "case_study",
  "业主避坑": "owner_education", "设计科普": "owner_education", "预算避坑": "owner_education", "材料": "owner_education", "工期": "owner_education",
  "本地生活": "hospitality_design", "同城": "hospitality_design", "门店": "case_study", "餐饮": "hospitality_design", "美食": "hospitality_design", "探店": "case_study",
  "知识科普": "owner_education", "科普": "owner_education", "教育": "owner_education", "科技": "owner_education", "数码": "owner_education",
  "情感口播": "case_study", "情感": "case_study", "亲子": "hospitality_design", "家庭": "hospitality_design", "婚姻": "case_study",
  "企业号": "office_design", "企业": "office_design", "品牌": "office_design", "获客": "office_design", "客户案例": "case_study",
  "带货": "owner_education", "小店": "owner_education", "商品": "owner_education", "直播": "case_study", "团购": "owner_education",
  "个人IP": "case_study", "个人 IP": "case_study", "IP": "case_study", "职场": "office_design", "创业": "office_design",
  // English keys pass through
  "hospitality_design": "hospitality_design", "office_design": "office_design", "case_study": "case_study", "owner_education": "owner_education",
  "local": "hospitality_design", "knowledge": "owner_education", "emotion": "case_study",
  "enterprise": "office_design", "shop": "owner_education", "ip": "case_study",
  "food": "hospitality_design", "lifestyle": "hospitality_design", "tech": "owner_education",
};

/** 快识并行路数 */
const QUICK_RECOGNIZE_CONCURRENCY = 10;

/** 分析中轮播文案 */
const ANALYSIS_MESSAGES = [
  "正在全面分析平台素材...",
  "正在评估开头3秒留存力...",
  "正在识别封面与首帧元素...",
  "正在提取标题、文案和口播重点...",
  "正在比对账号场景基线...",
  "正在评估互动、转化与承接潜力...",
];

type DiagnosisMode = "pre_publish" | "post_publish" | "account_audit";

type OperationGoalItem = {
  key: string;
  label: string;
  description: string;
  douyinGoal?: string;
};

const DIAGNOSIS_MODE_ORDER: DiagnosisMode[] = ["pre_publish", "post_publish", "account_audit"];

const DIAGNOSIS_MODE_META: Record<DiagnosisMode, {
  label: string;
  subtitle: string;
  cta: string;
  outputs: string[];
}> = {
  pre_publish: {
    label: "发布前诊断",
    subtitle: "素材是否值得发",
    cta: "开始发布前诊断",
    outputs: ["标题/封面/首帧短板", "前3秒与脚本节奏", "平台分发匹配", "发布动作建议"],
  },
  post_publish: {
    label: "发布后复盘",
    subtitle: "为什么没跑起来",
    cta: "开始发布后复盘",
    outputs: ["数据异常归因", "最大掉点定位", "下一条改法", "补投/停发判断"],
  },
  account_audit: {
    label: "账号体检",
    subtitle: "定位、数据、承接一起看",
    cta: "开始账号体检",
    outputs: ["账号定位风险", "内容支柱缺口", "指标基线判断", "承接链路问题"],
  },
};

const OPERATION_GOALS: Record<PlatformKey, Record<DiagnosisMode, OperationGoalItem[]>> = {
  wechat_channels: {
    pre_publish: [
      { key: "share", label: "决策转发", description: "判断业主、老板或行政是否愿意转给合伙人/团队讨论。" },
      { key: "private", label: "项目初诊", description: "检查评论、公众号案例、企微或人工咨询的承接动作是否清楚。" },
      { key: "trust", label: "专业信任", description: "强化真实案例、平面图、设计判断和项目边界。" },
      { key: "consult", label: "咨询预约", description: "让用户看完知道下一步如何预约、私信或提交项目条件。" },
    ],
    post_publish: [
      { key: "attribution", label: "数据归因", description: "从播放、转发、评论和完播里找出主掉点。" },
      { key: "interaction", label: "评论互动", description: "复盘评论问题、情绪反馈和可追问话题。" },
      { key: "share", label: "转发复盘", description: "判断内容有没有真实的熟人转发理由。" },
      { key: "conversion", label: "线索转化", description: "检查曝光之后是否自然导向案例、初诊或设计咨询。" },
    ],
    account_audit: [
      { key: "positioning", label: "账号定位", description: "看账号是否让用户一眼知道你是谁、帮谁、解决什么。" },
      { key: "pillars", label: "内容支柱", description: "检查选题是否覆盖民宿酒店设计、办公空间设计、案例、教育和线索。" },
      { key: "trust", label: "信任资产", description: "评估内容是否持续积累专业感和真实感。" },
      { key: "response", label: "承接效率", description: "检查评论、私信、案例资料或项目初诊的响应链路。" },
    ],
  },
  douyin: {
    pre_publish: [
      { key: "follow", label: "关注转化", description: "判断素材能否给出明确关注和继续看案例的理由。", douyinGoal: "follow" },
      { key: "comment", label: "评论互动", description: "检查话题冲突、评论钩子和可讨论性。", douyinGoal: "comment" },
      { key: "save", label: "收藏复看", description: "强化教程、清单、避坑和可复用价值。", douyinGoal: "save" },
      { key: "lead", label: "私信留资", description: "检查私信关键词、线索承接和信任证据。", douyinGoal: "lead" },
      { key: "deal", label: "咨询预约", description: "评估预算边界、项目条件、案例证据和预约路径。", douyinGoal: "deal" },
    ],
    post_publish: [
      { key: "retention", label: "完播修复", description: "定位前3秒、节奏和信息密度的掉点。", douyinGoal: "save" },
      { key: "comment", label: "互动修复", description: "复盘评论触发点和用户争议点。", douyinGoal: "comment" },
      { key: "search", label: "搜索长尾", description: "检查标题、口播和字幕里的关键词资产。", douyinGoal: "save" },
      { key: "lead", label: "私信留资", description: "复盘私信转化、线索质量和承接话术。", douyinGoal: "lead" },
      { key: "deal", label: "咨询预约", description: "判断评论、私信、案例和项目初诊路径是否顺畅。", douyinGoal: "deal" },
    ],
    account_audit: [
      { key: "follow", label: "账号关注", description: "看账号主页、系列感和关注理由是否成立。", douyinGoal: "follow" },
      { key: "search", label: "搜索资产", description: "检查民宿设计、办公空间设计、预算、平面图等关键词是否能带来持续搜索流量。", douyinGoal: "save" },
      { key: "lead", label: "私信承接", description: "评估私信入口、线索筛选和响应效率。", douyinGoal: "lead" },
      { key: "deal", label: "咨询预约", description: "看内容能否自然导向方案咨询、预算判断或项目初诊。", douyinGoal: "deal" },
    ],
  },
};

const PLATFORM_STRATEGY_HINTS: Record<PlatformKey, Record<DiagnosisMode, string>> = {
  wechat_channels: {
    pre_publish: "视频号发布前先看决策关系链：封面能不能被老板/业主看懂，标题能不能被转发讨论，结尾有没有项目初诊承接。",
    post_publish: "视频号复盘要把播放、转发、评论和初诊动作拆开看，避免只用播放量判断内容好坏。",
    account_audit: "视频号账号体检重点看设计信任资产和项目初诊闭环，单条爆款不是唯一目标。",
  },
  douyin: {
    pre_publish: "抖音发布前先过首帧、前3秒和设计需求字段，目标动作越具体，系统和客户越容易理解。",
    post_publish: "抖音复盘要优先定位秒停留、完播、互动和项目线索中的主掉点，再决定重剪、补发或停发。",
    account_audit: "抖音账号体检重点看设计内容支柱、账号基线和需求字段分布，避免每条视频都重新试错。",
  },
};

const WECHAT_METRIC_LABELS: Record<DiagnosisMode, string> = {
  pre_publish: "历史/预估数据（可选）",
  post_publish: "发布后数据（建议填写）",
  account_audit: "近7/30天账号数据（可选）",
};

const DOUYIN_OPS_LABELS: Record<DiagnosisMode, string> = {
  pre_publish: "运营数据（可选）",
  post_publish: "发布后数据（建议粘贴）",
  account_audit: "账号近7/30天数据（可选）",
};

const DOUYIN_OPS_PLACEHOLDERS: Record<DiagnosisMode, string> = {
  pre_publish: "例如：预计发民宿设计案例，历史同类完播 35%，评论常问预算和房型",
  post_publish: "例如：播放 2.3w，3秒留存 62%，完播 38%，评论 86，私信 18，搜索来源 25%",
  account_audit: "例如：近30天均播 8000，爆款 2 条，民宿设计搜索流 18%，项目私信 42，主要掉点是完播",
};

const BASELINE_LABELS: Record<DiagnosisMode, string> = {
  pre_publish: "账号基线数据（可选 JSON/CSV）",
  post_publish: "账号基线数据（建议 JSON/CSV）",
  account_audit: "账号基线数据（建议 JSON/CSV）",
};

function getOperationGoals(platform: PlatformKey, mode: DiagnosisMode) {
  return OPERATION_GOALS[platform]?.[mode] ?? OPERATION_GOALS.wechat_channels.pre_publish;
}

function getDefaultOperationGoal(platform: PlatformKey, mode: DiagnosisMode) {
  return getOperationGoals(platform, mode)[0]?.key ?? "";
}

function getOperationGoalMeta(platform: PlatformKey, mode: DiagnosisMode, goalKey: string) {
  const goals = getOperationGoals(platform, mode);
  return goals.find((item) => item.key === goalKey) ?? goals[0];
}

function getDouyinGoalForOperation(platform: PlatformKey, mode: DiagnosisMode, goalKey: string) {
  const meta = getOperationGoalMeta(platform, mode, goalKey);
  if (meta?.douyinGoal) return meta.douyinGoal;
  return DOUYIN_GOALS.some((item) => item.key === goalKey) ? goalKey : "follow";
}

/** 平滑进度条：匀速前进到90%，每完成一张跳到真实进度，全部完成到100% */
function SmoothProgressBar({ done, total }: { done: number; total: number }) {
  const [smooth, setSmooth] = useState(0);
  const realPct = total === 0 ? 0 : (done / total) * 100;
  const targetRef = useRef(realPct);

  useEffect(() => {
    targetRef.current = realPct;
  }, [realPct]);

  useEffect(() => {
    // Tick every 200ms, creep toward 90% slowly, jump to real when real > smooth
    const timer = setInterval(() => {
      setSmooth((prev) => {
        const target = targetRef.current;
        if (target >= 100) return 100;
        if (target > prev) return target; // real progress jumped ahead, snap to it
        if (prev >= 90) return prev; // cap fake progress at 90%
        return prev + 0.8; // creep ~4%/sec
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Snap to 100 when all done
  useEffect(() => {
    if (realPct < 100) return;
    const frame = requestAnimationFrame(() => setSmooth(100));
    return () => cancelAnimationFrame(frame);
  }, [realPct]);

  return (
    <Box sx={{ height: 4, bgcolor: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
      <Box sx={{
        height: "100%", borderRadius: 2,
        background: "linear-gradient(90deg, #1E40AF, #0891B2)",
        width: `${Math.min(smooth, 100)}%`,
        transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
        position: "relative",
        "&::after": {
          content: '""', position: "absolute", inset: 0,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
          animation: "shimmer 1.5s infinite",
        },
      }} />
    </Box>
  );
}

function AnalysisStatusText() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ANALYSIS_MESSAGES.length), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.div key={idx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
        <Typography sx={{ fontSize: 11, color: textMuted, fontWeight: 700 }}>
          {ANALYSIS_MESSAGES[idx]}
        </Typography>
      </motion.div>
    </AnimatePresence>
  );
}

/** 首页：桌面端双栏布局，移动端单页布局 */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialPlatform = routeQuery.get("platform") === "douyin" ? "douyin" : "wechat_channels";
  const sourceAccountId = routeQuery.get("accountId") || "";
  const opsEnabled = isOpsFrontendEnabled();

  const [platform, setPlatform] = useState<PlatformKey>(initialPlatform);
  const [manualDiagnosisVisible, setManualDiagnosisVisible] = useState(() => !opsEnabled || routeQuery.get("manual") === "1");
  const [opsState, setOpsState] = useState<OpsState | null>(null);
  const [opsStateLoading, setOpsStateLoading] = useState(false);
  const [opsError, setOpsError] = useState("");
  const [selectedOpsAccountId, setSelectedOpsAccountId] = useState(sourceAccountId);
  const [accountDiagnosisLoading, setAccountDiagnosisLoading] = useState(false);
  const [accountDiagnosisStageIndex, setAccountDiagnosisStageIndex] = useState(-1);
  const [accountDiagnosisReport, setAccountDiagnosisReport] = useState<AccountDiagnosisReport | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [script, setScript] = useState("");
  const [openingHook, setOpeningHook] = useState("");
  const [publishTime, setPublishTime] = useState("");
  const [plays, setPlays] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [favorites, setFavorites] = useState("");
  const [followersGained, setFollowersGained] = useState("");
  const [completionRate, setCompletionRate] = useState("");
  const [audience, setAudience] = useState("");
  const [trafficField, setTrafficField] = useState(getPlatformConfig("douyin").defaultCategory);
  const [goal, setGoal] = useState("follow");
  const [diagnosisMode, setDiagnosisMode] = useState<DiagnosisMode>("pre_publish");
  const [operationGoal, setOperationGoal] = useState(() => getDefaultOperationGoal(initialPlatform, "pre_publish"));
  const [duration, setDuration] = useState("35");
  const [hook, setHook] = useState("");
  const [opsData, setOpsData] = useState("");
  const [baselineRows, setBaselineRows] = useState("[]");
  const [category, setCategory] = useState(getPlatformConfig("wechat_channels").defaultCategory);
  const platformConfig = getPlatformConfig(platform);
  const isDouyin = platform === "douyin";
  const categoryLabel = isDouyin ? "抖音设计字段" : "视频号设计场景";
  const diagnosisModeMeta = DIAGNOSIS_MODE_META[diagnosisMode];
  const operationGoals = getOperationGoals(platform, diagnosisMode);
  const selectedOperationGoal = getOperationGoalMeta(platform, diagnosisMode, operationGoal);
  const selectedOperationGoalLabel = selectedOperationGoal?.label ?? "";
  const strategyHint = PLATFORM_STRATEGY_HINTS[platform][diagnosisMode];
  const metricLabel = isDouyin ? DOUYIN_OPS_LABELS[diagnosisMode] : WECHAT_METRIC_LABELS[diagnosisMode];
  const douyinOpsPlaceholder = DOUYIN_OPS_PLACEHOLDERS[diagnosisMode];
  const baselineLabel = BASELINE_LABELS[diagnosisMode];
  const ctaLabel = diagnosisModeMeta.cta;

  const [aiRecogs, setAiRecogs] = useState<Record<string, QuickRecognizeResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [uploadingPulse, setUploadingPulse] = useState(false);
  const [analyzingPulse, setAnalyzingPulse] = useState(false);

  const [userEdited, setUserEdited] = useState({ title: false, content: false, category: false });
  /** null=探测中；false=连不上本机 API（多为未启动或 Vite 代理端口不对） */
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [modelConfigOpen, setModelConfigOpen] = useState(false);

  const uploadPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognizeInFlightRef = useRef<Set<string>>(new Set());
  const prevPendingRecognitionRef = useRef(false);

  useEffect(() => { document.title = manualDiagnosisVisible ? "手动诊断 - 自媒体管家" : "账号诊断 - 自媒体管家"; }, [manualDiagnosisVisible]);

  const loadOpsState = useCallback(async () => {
    if (!opsEnabled) return;
    setOpsStateLoading(true);
    setOpsError("");
    try {
      const state = await getOpsState();
      setOpsState(state);
    } catch (error: unknown) {
      setOpsError(getOpsErrorMessage(error));
    } finally {
      setOpsStateLoading(false);
    }
  }, [opsEnabled]);

  useEffect(() => {
    if (!opsEnabled || manualDiagnosisVisible) return;
    void loadOpsState();
  }, [opsEnabled, manualDiagnosisVisible, loadOpsState]);

  const opsAccounts = useMemo(() => opsState?.accounts ?? [], [opsState]);
  const selectedOpsAccount = useMemo(
    () => opsAccounts.find((account) => account.id === selectedOpsAccountId) ?? null,
    [opsAccounts, selectedOpsAccountId],
  );
  const latestOpsReport = useMemo(() => {
    if (!selectedOpsAccount) return accountDiagnosisReport;
    const savedReports = (opsState?.accountDiagnoses ?? [])
      .filter((report) => report.accountId === selectedOpsAccount.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return accountDiagnosisReport?.accountId === selectedOpsAccount.id ? accountDiagnosisReport : (savedReports[0] ?? null);
  }, [accountDiagnosisReport, opsState, selectedOpsAccount]);
  const displayedOpsReport = accountDiagnosisLoading ? null : latestOpsReport;
  const visibleAccountDiagnosisStages = useMemo(() => {
    if (accountDiagnosisLoading) return ACCOUNT_DIAGNOSIS_FLOW;
    return displayedOpsReport?.workflowStages?.length ? displayedOpsReport.workflowStages : ACCOUNT_DIAGNOSIS_FLOW;
  }, [accountDiagnosisLoading, displayedOpsReport]);
  const currentAccountDiagnosisStage = visibleAccountDiagnosisStages[
    Math.min(Math.max(accountDiagnosisStageIndex, 0), visibleAccountDiagnosisStages.length - 1)
  ];

  useEffect(() => {
    if (!accountDiagnosisLoading) return;
    setAccountDiagnosisStageIndex(0);
    const timer = window.setInterval(() => {
      setAccountDiagnosisStageIndex((prev) => Math.min(prev + 1, ACCOUNT_DIAGNOSIS_FLOW.length - 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [accountDiagnosisLoading]);

  useEffect(() => {
    if (opsAccounts.length === 0) return;
    const queryAccount = sourceAccountId ? opsAccounts.find((account) => account.id === sourceAccountId) : null;
    const currentStillExists = selectedOpsAccountId
      ? opsAccounts.some((account) => account.id === selectedOpsAccountId)
      : false;
    if (currentStillExists) return;
    const preferred =
      queryAccount ||
      opsAccounts.find((account) => account.status === "connected" && account.sessionHealth === "healthy") ||
      opsAccounts.find((account) => account.status === "connected") ||
      opsAccounts[0];
    setSelectedOpsAccountId(preferred.id);
  }, [opsAccounts, selectedOpsAccountId, sourceAccountId]);

  const startAccountDiagnosis = useCallback(async (account?: OpsAccount | null) => {
    const target = account || selectedOpsAccount;
    if (!target) return;
    const startedAt = Date.now();
    setAccountDiagnosisLoading(true);
    setAccountDiagnosisStageIndex(0);
    setAccountDiagnosisReport(null);
    setOpsError("");
    try {
      const report = await diagnoseOpsAccount(target.id, { readLoggedInWorkspace: true });
      const minVisualMs = ACCOUNT_DIAGNOSIS_FLOW.length * 900;
      const remainingMs = Math.max(0, minVisualMs - (Date.now() - startedAt));
      if (remainingMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
      }
      setAccountDiagnosisReport(report);
      setAccountDiagnosisStageIndex(Math.max((report.workflowStages?.length || ACCOUNT_DIAGNOSIS_FLOW.length) - 1, 0));
      const refreshed = await getOpsState();
      setOpsState(refreshed);
    } catch (error: unknown) {
      setOpsError(getOpsErrorMessage(error));
      setAccountDiagnosisStageIndex(-1);
    } finally {
      setAccountDiagnosisLoading(false);
    }
  }, [selectedOpsAccount]);

  const openAccountWorkspace = useCallback(async (account: OpsAccount) => {
    setOpsError("");
    try {
      await openOpsWorkspace(account.id);
      await loadOpsState();
    } catch (error: unknown) {
      setOpsError(getOpsErrorMessage(error));
    }
  }, [loadOpsState]);

  useEffect(() => {
    const cfg = getPlatformConfig(platform);
    setCategory(cfg.defaultCategory);
    if (platform === "douyin") {
      setTrafficField(cfg.defaultCategory);
      setGoal("follow");
      setDuration((prev) => prev || "35");
    }
    setUserEdited((p) => ({ ...p, category: false }));
  }, [platform]);

  useEffect(() => {
    const nextGoal = getDefaultOperationGoal(platform, diagnosisMode);
    setOperationGoal(nextGoal);
    if (platform === "douyin") {
      setGoal(getDouyinGoalForOperation(platform, diagnosisMode, nextGoal));
    }
  }, [platform, diagnosisMode]);

  useEffect(() => {
    void getApiHealth().then(setApiReachable);
  }, []);

  useEffect(() => {
    return () => {
      if (uploadPulseTimerRef.current) clearTimeout(uploadPulseTimerRef.current);
      if (analyzePulseTimerRef.current) clearTimeout(analyzePulseTimerRef.current);
    };
  }, []);

  const triggerUploadPulse = useCallback(() => {
    if (uploadPulseTimerRef.current) clearTimeout(uploadPulseTimerRef.current);
    setUploadingPulse(true);
    uploadPulseTimerRef.current = setTimeout(() => {
      setUploadingPulse(false);
      uploadPulseTimerRef.current = null;
    }, 500);
  }, []);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles.slice(0, 9));
      if (newFiles.length > 0) triggerUploadPulse();
    },
    [triggerUploadPulse],
  );

  const appendFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      setFiles((prev) => [...prev, ...incoming].slice(0, 9));
      triggerUploadPulse();
    },
    [triggerUploadPulse],
  );

  /** Ctrl+V paste images */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      appendFiles(pasted);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [appendFiles]);

  const anyLoading = useMemo(() => Object.values(aiLoading).some(Boolean), [aiLoading]);
  const allResults = useMemo(() => Object.values(aiRecogs), [aiRecogs]);
  const successRecogEntries = useMemo(
    () => Object.entries(aiRecogs).filter(([, r]) => r.success),
    [aiRecogs],
  );
  const successResults = useMemo(
    () => successRecogEntries.map(([, r]) => r),
    [successRecogEntries],
  );

  const aggregated = useMemo(() => {
    let bestTitle = "";
    const contentParts: string[] = [];  // 合并多张图的正文
    let bestCategory = "";
    let bestSummary = "";
    let engLikes = 0, engCollects = 0, engComments = 0;

    // Pass 1: content 类型 — 标题取第一个, 正文全部合并
    for (const [, r] of successRecogEntries) {
      if ((r.slot_type || "").toLowerCase() === "content") {
        if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
        if (r.content_text?.trim()) contentParts.push(r.content_text.trim());
      }
      if (!bestCategory && r.category?.trim()) bestCategory = r.category.trim();
      if (!bestSummary && r.summary?.trim()) bestSummary = r.summary.trim();
      // 提取互动数据（取最大值）
      const eng = r.engagement_signal;
      if (eng) {
        engLikes = Math.max(engLikes, eng.likes_visible || 0);
        engCollects = Math.max(engCollects, eng.collects_visible || 0);
        engComments = Math.max(engComments, eng.comments_visible || 0);
      }
    }

    // Pass 2: fallback — 非 content 类型补充
    if (!bestTitle) {
      for (const [, r] of successRecogEntries) {
        if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
      }
    }
    if (contentParts.length === 0) {
      for (const [, r] of successRecogEntries) {
        if (r.content_text?.trim()) contentParts.push(r.content_text.trim());
      }
    }

    // 合并正文（去重：如果两段内容有50%以上重叠就跳过）
    const mergedParts: string[] = [];
    for (const part of contentParts) {
      const isDuplicate = mergedParts.some((existing) => {
        const shorter = part.length < existing.length ? part : existing;
        return existing.includes(shorter.slice(0, 30)) || part.includes(existing.slice(0, 30));
      });
      if (!isDuplicate) mergedParts.push(part);
    }
    let bestContent = mergedParts.join("\n");

    /**
     * 封面图 slot 模型常按要求不返 title/content_text，只返 summary。
     * 若不回填，会出现「场景已识别、分析完成」但标题正文全空。
     */
    /** 仅视频时 summary 多为画面概括，不能冒充视频号标题（标题需另传封面/标题截图） */
    const videoOnlySuccess =
      successRecogEntries.length > 0 &&
      successRecogEntries.every(([, r]) => r.success && r.media_source === "video");

    if (!bestTitle && bestSummary && !videoOnlySuccess) {
      const s = bestSummary.replace(/\s+/g, " ").trim();
      if (s) {
        const firstPhrase = (s.split(/[。！？\n]/)[0] || s).trim();
        bestTitle = (firstPhrase || s).slice(0, 100);
      }
    }
    if (!bestContent.trim() && bestSummary.trim()) {
      bestContent = bestSummary.trim();
    }

    return {
      bestTitle, bestContent, bestCategory, bestSummary,
      engagementData: { likes: engLikes, collects: engCollects, comments: engComments },
    };
  }, [successRecogEntries]);

  const imageFileKeys = useMemo(
    () => new Set(files.filter((f) => f.type.startsWith("image/")).map(fkey)),
    [files],
  );

  /** 待快识的视频（与 UploadZone 一致，至多一个视频位） */
  const videoFileKeys = useMemo(
    () => new Set(files.filter((f) => f.type.startsWith("video/")).map(fkey)),
    [files],
  );

  /** 图片 + 视频均需完成快识后解锁表单 */
  const recognizeFileKeys = useMemo(() => {
    const s = new Set<string>();
    imageFileKeys.forEach((k) => s.add(k));
    videoFileKeys.forEach((k) => s.add(k));
    return s;
  }, [imageFileKeys, videoFileKeys]);

  const pendingRecognition = useMemo(() => {
    if (recognizeFileKeys.size === 0) return false;
    for (const key of recognizeFileKeys) {
      if (aiLoading[key] || !aiRecogs[key]) return true;
    }
    return false;
  }, [recognizeFileKeys, aiLoading, aiRecogs]);

  const allRecognitionDone = useMemo(() => {
    if (recognizeFileKeys.size === 0) return true;
    for (const k of recognizeFileKeys) {
      if (!aiRecogs[k] && !aiLoading[k]) return false;
      if (aiLoading[k]) return false;
    }
    return true;
  }, [recognizeFileKeys, aiRecogs, aiLoading]);

  useEffect(() => {
    const { bestTitle, bestContent, bestCategory } = aggregated;

    if (!userEdited.title && bestTitle) {
      setTitle(bestTitle.slice(0, 100));
    }
    if (!userEdited.content && bestContent) {
      setContent(bestContent);
    }
    if (!userEdited.category && bestCategory && !isDouyin) {
      const mapped = CAT_MAP[bestCategory];
      if (mapped) setCategory(mapped);
    }
  }, [aggregated, userEdited, isDouyin]);

  const allFailed = allRecognitionDone && successResults.length === 0 && allResults.length > 0;

  /** 全部失败时展示后端/模型返回的首条原因，便于区分「连不上 API」与「Key/模型报错」 */
  const firstRecognizeError = useMemo(() => {
    for (const r of Object.values(aiRecogs)) {
      if (!r.success && r.error?.trim()) return r.error.trim();
    }
    return null;
  }, [aiRecogs]);

  const showWarnings = allRecognitionDone && files.length > 0 && !allFailed;
  const warnings = useMemo(() => {
    if (!showWarnings) return { title: false, content: false, category: false };
    const { bestTitle, bestContent, bestCategory, bestSummary } = aggregated;
    return {
      title: !bestTitle && !bestSummary,
      content: !bestContent,
      category: !bestCategory,
    };
  }, [showWarnings, aggregated]);

  const autoFilled = useMemo(() => {
    const { bestTitle, bestContent, bestCategory } = aggregated;
    return {
      /** 仅当有可写入标题的识别字段时标「已填」；仅有 summary 不会写入标题，避免空框却显示已填 */
      title: !userEdited.title && !!bestTitle,
      content: !userEdited.content && !!bestContent,
      category: !isDouyin && !userEdited.category && !!bestCategory && !!CAT_MAP[bestCategory],
    };
  }, [aggregated, userEdited, isDouyin]);

  /** 仅有视频、无截图：视频号标题通常不在视频画面里 */
  const videoWithoutImage = videoFileKeys.size > 0 && imageFileKeys.size === 0;

  const runRecognition = useCallback(async (file: File, slotHint?: "cover" | "content" | "profile" | "comments") => {
    const key = fkey(file);
    if (recognizeInFlightRef.current.has(key)) return;
    recognizeInFlightRef.current.add(key);
    setAiLoading((p) => {
      if (p[key]) return p;
      return { ...p, [key]: true };
    });
    try {
      const res = file.type.startsWith("video/")
        ? await quickRecognizeVideo(file)
        : await quickRecognize(file, slotHint);
      const merged =
        !res.success && !res.error?.trim()
          ? {
              ...res,
              error: "识别未返回有效内容，请检查 OPENAI_API_KEY、OPENAI_BASE_URL 与 LLM_MODEL_OMNI",
            }
          : res;
      setAiRecogs((p) => ({ ...p, [key]: merged }));
    } catch (e: unknown) {
      let errMsg = "识别失败";
      if (axios.isAxiosError(e)) {
        const d = e.response?.data;
        if (d && typeof d === "object" && "detail" in d) {
          const det = (d as { detail: unknown }).detail;
          errMsg = typeof det === "string" ? det : JSON.stringify(det);
        } else if (e.code === "ERR_NETWORK" || e.message === "Network Error") {
          errMsg = "无法连接后端：请确认已启动 API，且端口与 Vite 代理一致（默认 8000，可用 VITE_API_PROXY_TARGET 覆盖）";
        } else if (e.message) {
          errMsg = e.message;
        }
      } else if (e instanceof Error && e.message) {
        errMsg = e.message;
      }
      setAiRecogs((p) => ({
        ...p,
        [key]: {
          success: false,
          slot_type: "unknown",
          extra_slots: [],
          category: "",
          summary: "",
          error: errMsg,
        },
      }));
    } finally {
      recognizeInFlightRef.current.delete(key);
      setAiLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  useEffect(() => {
    const validKeys = new Set(files.map(fkey));
    setAiRecogs((prev) => {
      let changed = false;
      const next: Record<string, QuickRecognizeResult> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
        else changed = true;
      });
      return changed ? next : prev;
    });
    setAiLoading((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
        else changed = true;
      });
      return changed ? next : prev;
    });
    recognizeInFlightRef.current.forEach((key) => {
      if (!validKeys.has(key)) recognizeInFlightRef.current.delete(key);
    });
  }, [files]);

  useEffect(() => {
    const mediaFiles = files.filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    const inFlight = mediaFiles.filter((f) => aiLoading[fkey(f)]).length;
    const freeSlots = Math.max(0, QUICK_RECOGNIZE_CONCURRENCY - inFlight);
    const need = mediaFiles.filter((f) => {
      const k = fkey(f);
      return !aiRecogs[k] && !aiLoading[k];
    });
    need.slice(0, freeSlots).forEach((file) => {
      void runRecognition(file);
    });
  }, [files, aiRecogs, aiLoading, runRecognition]);

  useEffect(() => {
    if (!prevPendingRecognitionRef.current && pendingRecognition && analyzePulseTimerRef.current) {
      clearTimeout(analyzePulseTimerRef.current);
      analyzePulseTimerRef.current = null;
      setAnalyzingPulse(false);
    }
    if (prevPendingRecognitionRef.current && !pendingRecognition && recognizeFileKeys.size > 0) {
      if (analyzePulseTimerRef.current) clearTimeout(analyzePulseTimerRef.current);
      setAnalyzingPulse(true);
      analyzePulseTimerRef.current = setTimeout(() => {
        setAnalyzingPulse(false);
        analyzePulseTimerRef.current = null;
      }, 700);
    }
    prevPendingRecognitionRef.current = pendingRecognition;
  }, [pendingRecognition, recognizeFileKeys.size]);

  useEffect(() => {
    if (files.length === 0) {
      setAiRecogs({});
      setAiLoading({});
      recognizeInFlightRef.current.clear();
      setUserEdited({ title: false, content: false, category: false });
      setTitle("");
      setContent("");
      setScript("");
      setOpeningHook("");
      setPublishTime("");
      setPlays("");
      setLikes("");
      setComments("");
      setShares("");
      setFavorites("");
      setFollowersGained("");
      setCompletionRate("");
      setAudience("");
      setTrafficField(platformConfig.defaultCategory);
      setGoal("follow");
      setDuration(platform === "douyin" ? "35" : "");
      setHook("");
      setOpsData("");
      setBaselineRows("[]");
      setCategory(platformConfig.defaultCategory);
      setUploadingPulse(false);
      setAnalyzingPulse(false);
      if (uploadPulseTimerRef.current) {
        clearTimeout(uploadPulseTimerRef.current);
        uploadPulseTimerRef.current = null;
      }
      if (analyzePulseTimerRef.current) {
        clearTimeout(analyzePulseTimerRef.current);
        analyzePulseTimerRef.current = null;
      }
    }
  }, [files.length, platform, platformConfig.defaultCategory]);

  const processingStatus = useMemo(() => {
    if (files.length === 0) return null;
    if (uploadingPulse) {
      return { label: "上传中", tone: "info" as const, text: "素材已接收，正在准备识别..." };
    }
    if (pendingRecognition) {
      const videoPending = [...videoFileKeys].some((k) => aiLoading[k] || !aiRecogs[k]);
      const imagePending = [...imageFileKeys].some((k) => aiLoading[k] || !aiRecogs[k]);
      if (videoPending && !imagePending && imageFileKeys.size === 0) {
        return { label: "识别中", tone: "info" as const, text: "AI 正在识别视频内容（含画面与字幕），请稍候..." };
      }
      return { label: "识别中", tone: "info" as const, text: "AI 正在自动识别图片与视频..." };
    }
    if (analyzingPulse) {
      return { label: "分析中", tone: "info" as const, text: "正在汇总识别结果并回填表单..." };
    }
    if (allRecognitionDone) {
      return { label: "已就绪", tone: "success" as const, text: "识别完成，可以继续发起诊断。" };
    }
    return null;
  }, [
    files.length,
    uploadingPulse,
    pendingRecognition,
    analyzingPulse,
    allRecognitionDone,
    videoFileKeys,
    imageFileKeys,
    aiLoading,
    aiRecogs,
  ]);

  const lockInputs = !!processingStatus && processingStatus.label !== "已就绪";
  const isFormBlocked = files.length > 0 && !allRecognitionDone;

  const [submitError, setSubmitError] = useState("");
  // Auto-clear error when user fixes the condition
  useEffect(() => { if (submitError) setSubmitError(""); }, [files.length, title]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    if (files.length === 0) { setSubmitError(platformConfig.materialRequiredMessage); return; }
    if (!title.trim()) { setSubmitError(platformConfig.titleRequiredMessage); return; }
    if (lockInputs || isFormBlocked) { setSubmitError("AI 识别中，请稍等"); return; }
    setSubmitError("");
    // Check if any recognition result shows high engagement
    const hasHighEngagement = successResults.some(r => r.engagement_signal?.is_high_engagement);
    const selectedCategory = isDouyin ? trafficField : category;
    navigate("/diagnosing", {
      state: {
        platform,
        diagnosisMode,
        operationGoal: selectedOperationGoalLabel,
        operationGoalKey: operationGoal,
        title,
        content,
        tags: "",
        category: selectedCategory,
        script,
        openingHook,
        publishTime,
        plays,
        likes,
        comments,
        shares,
        favorites,
        followersGained,
        completionRate,
        audience,
        trafficField,
        goal,
        duration,
        hook,
        opsData,
        baselineRows,
        sourceAccountId,
        coverFile: files.find((f) => f.type.startsWith("image/")) ?? null,
        coverImages: files.filter((f) => f.type.startsWith("image/")),
        videoFile: files.find((f) => f.type.startsWith("video/")) ?? null,
        hasHighEngagement,
      },
    });
  };

  const recognizedSlots = useMemo(
    () => new Set(
      successRecogEntries
        .map(([, r]) => (typeof r.slot_type === "string" ? r.slot_type.toLowerCase() : ""))
        .filter(Boolean),
    ),
    [successRecogEntries],
  );
  const hasDetailScreenshot = recognizedSlots.has("content");
  const canSubmit = files.length > 0 && title.trim().length > 0 && !lockInputs && !isFormBlocked;
  const consultantSteps = [
    {
      label: "1 选平台与目标",
      done: Boolean(platform && operationGoal),
      text: `${platformConfig.shortLabel} · ${selectedOperationGoalLabel || diagnosisModeMeta.label}`,
    },
    {
      label: "2 上传素材快识",
      done: files.length > 0 && allRecognitionDone,
      text: files.length > 0 ? `${files.length} 个素材，${successResults.length} 个识别成功` : "先上传截图或视频",
    },
    {
      label: "3 补充内容信息",
      done: Boolean(title.trim() && (content.trim() || script.trim() || hook.trim() || openingHook.trim())),
      text: title.trim() ? "标题已准备，建议补充脚本/钩子" : "等待标题与正文",
    },
    {
      label: "4 确认会诊",
      done: canSubmit,
      text: canSubmit ? "可以进入 AI 会诊室" : lockInputs || isFormBlocked ? "等待 AI 快识完成" : "完成必填项后开始",
    },
  ];
  const nextConsultantSuggestion = pendingRecognition
    ? "AI 正在读取素材，请先等自动回填完成。"
    : files.length === 0
      ? "先上传封面、详情页或视频素材，AI 会自动识别标题、正文和场景。"
      : !title.trim()
        ? "素材已接收，下一步补一个能代表作品核心利益点的标题。"
        : canSubmit
          ? "信息已够用，可以发起多 Agent 会诊，后续报告会给出第一行动和复用文案。"
          : "再补充脚本、前 3 秒钩子或运营数据，会让诊断更像真实顾问复盘。";
  /* aiSuggestion removed — detail screenshot warning shown inline below CTA */
  const slotLabelMap: Record<string, string> = {
    content: "详情",
    cover: "封面",
    profile: "主页",
    comments: "评论区",
  };

  /** 所有素材的快识请求已结束（含全部失败） */
  const isReady = files.length > 0 && allRecognitionDone;
  /** 至少有一条快识成功，才显示「分析完成」绿条，避免与「全部失败」红条同时出现 */
  const hasRecogSuccess = successResults.length > 0;
  const [leaving, setLeaving] = useState(false);

  // Reset leaving on mount (browser back button fix)
  useEffect(() => { setLeaving(false); }, []);

  if (opsEnabled && !manualDiagnosisVisible) {
    const selectedNeedsLogin =
      selectedOpsAccount?.status !== "connected" || selectedOpsAccount?.sessionHealth === "expired";
    const selectedStatusText = selectedOpsAccount
      ? `${opsStatusLabels[selectedOpsAccount.status]} · ${opsStatusLabels[selectedOpsAccount.sessionHealth]} · ${opsStatusLabels[selectedOpsAccount.authType]}`
      : "未选择账号";

    return (
      <Box sx={{
        minHeight: "100dvh",
        bgcolor: "#F8FAFC",
        color: textPrimary,
        display: "flex",
        flexDirection: "column",
      }}>
        <Box component="header" sx={{
          flexShrink: 0,
          height: 60,
          px: { xs: 1.5, md: 3 },
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "#fff",
          borderBottom: "1px solid #E2E8F0",
        }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 950, color: textPrimary }}>
              自媒体管家
            </Typography>
            <Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 700 }}>
              账号诊断
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Button
              size="small"
              startIcon={<SettingsOutlinedIcon sx={{ fontSize: 14 }} />}
              onClick={() => setModelConfigOpen(true)}
              sx={{ ...softButtonSx, bgcolor: "#fff" }}
            >
              模型接口
            </Button>
            <Button size="small" onClick={() => navigate("/ops")} sx={{ ...softButtonSx, bgcolor: "#fff" }}>
              返回管家
            </Button>
            <Button size="small" onClick={() => setManualDiagnosisVisible(true)} sx={{ ...softButtonSx, bgcolor: "#fff" }}>
              手动诊断
            </Button>
          </Box>
        </Box>

        <Box sx={{
          width: "100%",
          maxWidth: 1120,
          mx: "auto",
          px: { xs: 1.5, md: 3 },
          py: { xs: 1.5, md: 2.5 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "340px 1fr" },
          gap: 2,
          alignItems: "start",
        }}>
          <Box sx={{
            bgcolor: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: "8px",
            overflow: "hidden",
          }}>
            <Box sx={{
              px: 1.5,
              py: 1.25,
              borderBottom: "1px solid #E2E8F0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
            }}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 950 }}>已登录账号</Typography>
                <Typography sx={{ fontSize: 12, color: textMuted }}>
                  读取管家共享账号数据
                </Typography>
              </Box>
              <Button size="small" onClick={loadOpsState} disabled={opsStateLoading} sx={{ ...softButtonSx, px: 1 }}>
                刷新
              </Button>
            </Box>

            {opsStateLoading && !opsState && (
              <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={16} />
                <Typography sx={{ fontSize: 13, color: textMuted }}>正在读取账号...</Typography>
              </Box>
            )}

            {!opsStateLoading && opsAccounts.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>
                  还没有账号。先回到管家添加抖音、小红书或视频号账号，再打开独立后台完成登录。
                </Typography>
              </Box>
            )}

            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {opsAccounts.map((account) => {
                const selected = account.id === selectedOpsAccountId;
                const healthy = account.status === "connected" && account.sessionHealth === "healthy";
                return (
                  <Box
                    key={account.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      setSelectedOpsAccountId(account.id);
                      setAccountDiagnosisReport(null);
                      setAccountDiagnosisStageIndex(-1);
                      setOpsError("");
                    }}
                    sx={{
                      appearance: "none",
                      border: 0,
                      borderBottom: "1px solid #F1F5F9",
                      bgcolor: selected ? "#EFF6FF" : "#fff",
                      textAlign: "left",
                      px: 1.5,
                      py: 1.25,
                      cursor: "pointer",
                      "&:hover": { bgcolor: selected ? "#EFF6FF" : "#F8FAFC" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 900, color: textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {account.displayName}
                      </Typography>
                      <Chip
                        size="small"
                        label={opsPlatformLabels[account.platform]}
                        sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: "#F8FAFC", border: "1px solid #E2E8F0" }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.4 }}>
                      {account.handle || "未填写账号标识"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.8 }}>
                      <Chip
                        size="small"
                        label={opsStatusLabels[account.status]}
                        sx={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 800,
                          bgcolor: healthy ? "#ECFDF5" : "#FFF7ED",
                          color: healthy ? "#047857" : "#C2410C",
                        }}
                      />
                      <Chip
                        size="small"
                        label={opsStatusLabels[account.sessionHealth]}
                        sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: "#F8FAFC", color: textMuted }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{
              bgcolor: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              p: { xs: 1.5, md: 2 },
            }}>
              <Typography sx={{ fontSize: 14, fontWeight: 950, mb: 0.5 }}>
                {selectedOpsAccount ? selectedOpsAccount.displayName : "选择一个账号"}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: textMuted, lineHeight: 1.7, mb: 1.5 }}>
                {selectedOpsAccount
                  ? `${opsPlatformLabels[selectedOpsAccount.platform]} · ${selectedOpsAccount.handle || "未填写账号标识"} · ${selectedStatusText}`
                  : "诊断会直接使用管家里的账号和独立浏览器档案，不需要上传作品、封面或文案。"}
              </Typography>

              {selectedOpsAccount?.profile && (
                <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", px: 1.25, py: 1, mb: 1.5 }}>
                  <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.65 }}>
                    {selectedOpsAccount.profile}
                  </Typography>
                </Box>
              )}

              {selectedNeedsLogin && (
                <Alert severity="warning" sx={{ fontSize: 12, borderRadius: "8px", mb: 1.5 }}>
                  这个账号登录态可能不可用。先打开账号后台登录，诊断会更准确。
                </Alert>
              )}

              {opsError && (
                <Alert severity="error" sx={{ fontSize: 12, borderRadius: "8px", mb: 1.5 }}>
                  {opsError === "platform_not_supported" ? "这个平台的账号诊断暂未接入。" : opsError}
                </Alert>
              )}

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Button
                  variant="contained"
                  disabled={!selectedOpsAccount || accountDiagnosisLoading}
                  onClick={() => void startAccountDiagnosis()}
                  sx={{ ...primaryButtonSx, minHeight: 40, px: 2 }}
                >
                  {accountDiagnosisLoading ? "一键诊断中..." : "一键诊断"}
                </Button>
                {selectedOpsAccount && (
                  <Button
                    variant="outlined"
                    onClick={() => void openAccountWorkspace(selectedOpsAccount)}
                    sx={{ borderRadius: "8px", fontWeight: 900 }}
                  >
                    打开账号后台
                  </Button>
                )}
              </Box>

              <Typography sx={{ fontSize: 11.5, color: textMuted, lineHeight: 1.7, mt: 1.5 }}>
                诊断会优先读取已保存登录状态、账号记忆、任务、草稿和最新数据快照；平台后台能读取到的数据会作为账号诊断来源。
              </Typography>
            </Box>

            <Box sx={{
              bgcolor: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              p: { xs: 1.5, md: 2 },
              minHeight: 220,
            }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.25 }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 950 }}>
                    诊断结果
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: textMuted }}>
                    {displayedOpsReport ? `生成于 ${formatOpsTime(displayedOpsReport.createdAt)}` : "还没有结果"}
                  </Typography>
                </Box>
                {displayedOpsReport && (
                  <Chip
                    label={`${displayedOpsReport.grade} · ${displayedOpsReport.overallScore}分`}
                    sx={{ height: 28, fontSize: 12, fontWeight: 900, bgcolor: "#ECFDF5", color: "#047857" }}
                  />
                )}
              </Box>

              {(accountDiagnosisLoading || displayedOpsReport) && (
                <Box sx={{ mb: 1.5 }}>
                  <AccountDiagnosisFlowPanel
                    stages={visibleAccountDiagnosisStages}
                    loading={accountDiagnosisLoading}
                    currentIndex={Math.max(accountDiagnosisStageIndex, 0)}
                  />
                </Box>
              )}

              {accountDiagnosisLoading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 3 }}>
                  <CircularProgress size={18} />
                  <Typography aria-live="polite" sx={{ fontSize: 13, color: textMuted }}>
                    正在执行当前流程：{currentAccountDiagnosisStage?.label || "账号会诊"}
                  </Typography>
                </Box>
              )}

              {!accountDiagnosisLoading && !displayedOpsReport && (
                <Box sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1.5 }}>
                  <Typography sx={{ fontSize: 13, color: textSecondary, lineHeight: 1.8 }}>
                    这里会显示账号健康分、主要问题、下一步建议和风险提醒。默认诊断的是账号整体，不再要求你上传单条作品。
                  </Typography>
                </Box>
              )}

              {!accountDiagnosisLoading && displayedOpsReport && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Typography sx={{ fontSize: 13, color: textSecondary, lineHeight: 1.75 }}>
                    {displayedOpsReport.summary}
                  </Typography>

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1 }}>
                    {displayedOpsReport.dimensions.slice(0, 6).map((item) => (
                      <Box key={item.key} sx={{ bgcolor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", p: 1 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{item.label}</Typography>
                        <Typography sx={{ fontSize: 18, fontWeight: 950, color: brandBlue, my: 0.25 }}>{item.score}</Typography>
                        <Typography sx={{ fontSize: 11, color: textMuted, lineHeight: 1.45 }}>{item.summary}</Typography>
                      </Box>
                    ))}
                  </Box>

                  <AccountAgentSummary opinions={displayedOpsReport.agentOpinions || []} />
                  <AccountDebateSummary turns={displayedOpsReport.debateTimeline || []} judgeSummary={displayedOpsReport.judgeSummary || ""} />

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 950, mb: 0.8 }}>主要发现</Typography>
                      {(displayedOpsReport.findings.length ? displayedOpsReport.findings : ["暂无明显异常"]).slice(0, 4).map((item) => (
                        <Typography key={item} sx={{ fontSize: 12.5, color: textSecondary, lineHeight: 1.7, mb: 0.5 }}>
                          {item}
                        </Typography>
                      ))}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 950, mb: 0.8 }}>下一步</Typography>
                      {(displayedOpsReport.suggestions.length ? displayedOpsReport.suggestions : ["继续保持当前账号节奏。"]).slice(0, 4).map((item) => (
                        <Typography key={item} sx={{ fontSize: 12.5, color: textSecondary, lineHeight: 1.7, mb: 0.5 }}>
                          {item}
                        </Typography>
                      ))}
                    </Box>
                  </Box>

                  {displayedOpsReport.risks.length > 0 && (
                    <Alert severity="warning" sx={{ fontSize: 12, borderRadius: "8px" }}>
                      {displayedOpsReport.risks[0]}
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
        <ModelConfigDialog open={modelConfigOpen} onClose={() => setModelConfigOpen(false)} />
      </Box>
    );
  }

  return (
    <Box sx={{
      height: { md: "100dvh" },
      minHeight: { xs: "100dvh" },
      display: "flex",
      flexDirection: "column",
      bgcolor: pageBg,
      color: textPrimary,
      overflow: { xs: "auto", md: "hidden" },
      transition: "transform 0.35s ease, opacity 0.3s ease",
      transform: leaving ? "translateY(-40px)" : "none",
      opacity: leaving ? 0 : 1,
    }}>

      {/* ═══ Header — 所有信息压在一行 ═══ */}
      <Box component="header" sx={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        px: { xs: 1.5, md: 3 }, height: 60,
        bgcolor: "rgba(255,255,255,0.82)", borderBottom: "1px solid rgba(148,163,184,0.22)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, md: 1.5 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            <Box sx={{
              width: 34, height: 34, borderRadius: "12px",
              background: "linear-gradient(135deg, #1E40AF 0%, #0F766E 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 12px 24px rgba(30,64,175,0.22)",
            }}>
              <Typography sx={{ color: "#fff", fontSize: 11, fontWeight: 900, fontFamily: "Inter" }}>Rx</Typography>
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 950, color: textPrimary }}>
              设计运营管家
            </Typography>
          </Box>
          {/* Desktop: inline description */}
          <Typography sx={{
            display: { xs: "none", md: "block" },
            fontSize: 12, color: textMuted, fontWeight: 700,
          }}>
            设计公司内容会诊工作台：民宿酒店 / 办公空间的留存、分发和线索承接
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button startIcon={<SettingsOutlinedIcon sx={{ fontSize: 14 }} />}
            onClick={() => setModelConfigOpen(true)} size="small"
            sx={{ ...softButtonSx, minWidth: "auto", px: 1, bgcolor: "#fff" }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>模型接口</Box>
          </Button>
          <Button
            onClick={() => { setLeaving(true); setTimeout(() => { window.location.href = "/"; }, 350); }}
            size="small"
            sx={{ ...softButtonSx, minWidth: "auto", px: 1 }}
          >
            白皮书
          </Button>
          <Button startIcon={<HistoryOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate("/history")} size="small"
            sx={{ ...softButtonSx, minWidth: "auto", px: 1, bgcolor: "#fff" }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>历史</Box>
          </Button>
          {isOpsFrontendEnabled() && (
            <Button startIcon={<DashboardCustomizeOutlinedIcon sx={{ fontSize: 14 }} />}
              onClick={() => navigate("/ops")} size="small"
              sx={{ ...softButtonSx, minWidth: "auto", px: 1, bgcolor: "#fff" }}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>设计运营</Box>
            </Button>
          )}
          <Button startIcon={<EmailOutlinedIcon sx={{ fontSize: 14 }} />}
            component="a" href="mailto:jmr@jiangmuran.com" size="small"
            sx={{ ...softButtonSx, minWidth: "auto", px: 1, bgcolor: "#fff", textDecoration: "none" }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>联系</Box>
          </Button>
        </Box>
      </Box>
      <ModelConfigDialog open={modelConfigOpen} onClose={() => setModelConfigOpen(false)} />

      {/* ═══ Work area — 填满剩余空间，桌面不滚动 ═══ */}
      <Box sx={{
        flex: 1,
        display: "flex", justifyContent: "center", alignItems: "stretch",
        px: { xs: 0, md: 3 },
        py: { xs: 0, md: 2 },
        pb: { xs: "100px", md: 2 },
        overflow: { xs: "auto", md: "hidden" },
        minHeight: 0,
      }}>
        <Box sx={{
          width: "100%", maxWidth: 1180,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minHeight: 0,
        }}>
          <Box sx={{
            ...cardSx,
            borderRadius: { xs: 0, md: "18px" },
            borderLeft: { xs: 0, md: cardSx.border },
            borderRight: { xs: 0, md: cardSx.border },
            borderTop: { xs: 0, md: cardSx.border },
            p: { xs: 2, md: 2.25 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.35fr 1fr" },
            gap: 1.5,
          }}>
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: textMuted, letterSpacing: "0.02em", mb: 0.5 }}>
                AI 顾问工作台
              </Typography>
              <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 950, color: textPrimary, lineHeight: 1.25, mb: 0.8 }}>
                {nextConsultantSuggestion}
              </Typography>
              <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.7 }}>
                先完成素材识别，再补齐标题、脚本和运营数据；系统会把输入整理成一份可执行的 AI 会诊报告。
              </Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1 }}>
              {consultantSteps.map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    p: 1.25,
                    borderRadius: "14px",
                    bgcolor: item.done ? "rgba(236,253,245,0.9)" : "rgba(248,250,252,0.9)",
                    border: item.done ? "1px solid #BBF7D0" : "1px solid #E2E8F0",
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: item.done ? "#0F766E" : textMuted, mb: 0.35 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: textPrimary, lineHeight: 1.55, fontWeight: 600 }}>
                    {item.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.18fr 1fr" },
            gap: { xs: 0, md: 2.5 },
            alignItems: "stretch",
            minHeight: 0,
          }}>

          {/* ═══ Left: Upload ═══ */}
          <Box sx={{
            ...cardSx,
            borderRadius: { xs: 0, md: "18px" },
            borderLeft: { xs: 0, md: cardSx.border },
            borderRight: { xs: 0, md: cardSx.border },
            borderTop: { xs: 0, md: cardSx.border },
            p: { xs: 2, md: 2.5 },
            display: "flex", flexDirection: "column",
            gap: 1.5,
            minHeight: 0,
            overflow: "hidden",
          }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 950, color: textPrimary }}>
                  {platformConfig.uploadTitle}
                </Typography>
                <Typography sx={{ fontSize: 12, color: textMuted, mt: 0.25 }}>
                  {platformConfig.uploadHint}
                </Typography>
              </Box>
              {files.length > 0 && (
                <Chip size="small" label={`${files.length}/9`} sx={{
                  height: 22, fontSize: 10, fontWeight: 700,
                  bgcolor: isReady && hasRecogSuccess ? "#f0fdf4" : isReady ? "#fff7ed" : "#eff6ff",
                  color: isReady && hasRecogSuccess ? "#16a34a" : isReady ? "#c2410c" : "#2563eb",
                  border: isReady && hasRecogSuccess ? "1px solid #bbf7d0" : isReady ? "1px solid #fed7aa" : "1px solid #bfdbfe",
                }} />
              )}
            </Box>

            {apiReachable === false && (
              <Alert severity="warning" sx={{ fontSize: 12, py: 0.5, borderRadius: "8px" }}>
                无法连接本机诊断 API（/api/health）。请启动后端，并确认 Vite 代理端口与之一致（默认 8000，可在 frontend/.env 设置
                VITE_API_PROXY_TARGET）。
              </Alert>
            )}

            <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact={isDesktop} />
            </Box>

            {/* Slot chips */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  style={{ flexShrink: 0 }}>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
                    {Object.entries(slotLabelMap).map(([slot, label]) => (
                      <Chip key={slot} size="small" label={label}
                        color={recognizedSlots.has(slot) ? "success" : "default"}
                        variant={recognizedSlots.has(slot) ? "filled" : "outlined"}
                        sx={{ fontSize: 10, height: 20 }} />
                    ))}
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI analysis progress bar — smooth */}
            <AnimatePresence>
              {(anyLoading || pendingRecognition) && files.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}
                  style={{ flexShrink: 0 }}>
                  <Box sx={{ px: 0.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                      <AnalysisStatusText />
                      <Typography sx={{ fontSize: 10, color: "#ccc", fontVariantNumeric: "tabular-nums" }}>
                        {Object.keys(aiRecogs).length}/{Math.max(recognizeFileKeys.size, 1)}
                      </Typography>
                    </Box>
                    <SmoothProgressBar
                      done={Object.keys(aiRecogs).length}
                      total={Math.max(recognizeFileKeys.size, 1)}
                    />
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ready state：仅在有成功识别时显示完成提示；全部失败只显示下方红字 */}
            {isReady && files.length > 0 && hasRecogSuccess && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
                <CheckCircleIcon sx={{ fontSize: 13, color: "#16a34a" }} />
                <Typography sx={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>分析完成，可以开始诊断</Typography>
              </Box>
            )}
            {allFailed && (
              <Typography sx={{ fontSize: 11, color: "#dc2626", px: 0.5, lineHeight: 1.5 }}>
                {firstRecognizeError
                  ? `识别失败：${firstRecognizeError}`
                  : "识别失败，请检查网络或手动输入"}
              </Typography>
            )}

          </Box>

          {/* ═══ Right: Form ═══ */}
          <Box sx={{
            ...cardSx,
            borderRadius: { xs: 0, md: "18px" },
            borderLeft: { xs: 0, md: cardSx.border },
            borderRight: { xs: 0, md: cardSx.border },
            borderTop: { xs: 0, md: cardSx.border },
            p: { xs: 2, md: 2.5 },
            display: "flex", flexDirection: "column",
            gap: 1.75,
            minHeight: 0,
            overflow: { xs: "visible", md: "auto" },
          }}>
            <Typography sx={{ fontSize: 14, fontWeight: 950, color: textPrimary, flexShrink: 0 }}>
              {platformConfig.formTitle}
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.1, flexShrink: 0 }}>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.75 }}>
                  运营任务
                </Typography>
                <Box sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  overflow: "hidden",
                  bgcolor: "#F8FAFC",
                }}>
                  {DIAGNOSIS_MODE_ORDER.map((mode) => {
                    const item = DIAGNOSIS_MODE_META[mode];
                    const selected = diagnosisMode === mode;
                    return (
                      <Box
                        key={mode}
                        component="button"
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDiagnosisMode(mode)}
                        onPointerDown={() => setDiagnosisMode(mode)}
                        sx={{
                          appearance: "none",
                          border: 0,
                          font: "inherit",
                          outline: "none",
                          textAlign: "left",
                          px: 1,
                          py: 0.9,
                          minHeight: 56,
                          cursor: "pointer",
                          bgcolor: selected ? brandBlue : "#F8FAFC",
                          borderRight: { sm: mode === "account_audit" ? "none" : "1px solid #E2E8F0" },
                          borderBottom: { xs: mode === "account_audit" ? "none" : "1px solid #E2E8F0", sm: "none" },
                          transition: "background-color 0.2s ease, color 0.2s ease",
                          "&:hover": { bgcolor: selected ? brandBlueDark : "#EFF6FF" },
                          "&:focus-visible": { boxShadow: "inset 0 0 0 2px rgba(30,64,175,0.28)" },
                        }}
                      >
                        <Typography component="span" sx={{ display: "block", fontSize: 12.5, fontWeight: 950, color: selected ? "#fff" : textPrimary }}>
                          {item.label}
                        </Typography>
                        <Typography component="span" sx={{ display: "block", fontSize: 10.5, color: selected ? "#DBEAFE" : textMuted, mt: 0.25, lineHeight: 1.35 }}>
                          {item.subtitle}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: textPrimary, mb: 0.75 }}>
                  运营目标
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {operationGoals.map((item) => {
                    const selected = operationGoal === item.key;
                    return (
                      <Chip
                        key={item.key}
                        label={item.label}
                        onClick={() => {
                          setOperationGoal(item.key);
                          if (isDouyin) setGoal(item.douyinGoal || getDouyinGoalForOperation(platform, diagnosisMode, item.key));
                        }}
                        sx={{
                          height: 28,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                          bgcolor: selected ? "#DBEAFE" : "#F8FAFC",
                          color: selected ? brandBlue : textSecondary,
                          border: selected ? "1px solid #93C5FD" : "1px solid #E2E8F0",
                          "&:hover": { bgcolor: selected ? "#DBEAFE" : "#EFF6FF", borderColor: "#BFDBFE" },
                        }}
                      />
                    );
                  })}
                </Box>
                {selectedOperationGoal && (
                  <Typography sx={{ fontSize: 11, color: textMuted, mt: 0.75, lineHeight: 1.5 }}>
                    {selectedOperationGoal.description}
                  </Typography>
                )}
              </Box>

              <Box sx={{
                px: 1.25,
                py: 1,
                borderRadius: "14px",
                bgcolor: "linear-gradient(135deg, rgba(239,246,255,0.92), rgba(240,253,250,0.72))",
                border: "1px solid rgba(147,197,253,0.45)",
              }}>
                <Typography sx={{ fontSize: 10.5, color: textMuted, fontWeight: 900, mb: 0.55 }}>
                  本次诊断会输出
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 0.6 }}>
                  {diagnosisModeMeta.outputs.map((item) => (
                    <Box key={item} sx={{ display: "flex", alignItems: "center", gap: 0.4, minWidth: 0 }}>
                      <CheckCircleIcon sx={{ fontSize: 12, color: "#10b981", flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 10.5, color: textSecondary, fontWeight: 700, lineHeight: 1.25 }}>
                        {item}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Typography sx={{ fontSize: 10.5, color: textMuted, mt: 0.7, lineHeight: 1.5 }}>
                  {strategyHint}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, flexShrink: 0 }}>
              {Object.values(PLATFORM_CONFIGS).map((cfg) => {
                const selected = platform === cfg.key;
                return (
                  <Box
                    key={cfg.key}
                    component="button"
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPlatform(cfg.key)}
                    onPointerDown={() => setPlatform(cfg.key)}
                    sx={{
                      appearance: "none",
                      font: "inherit",
                      outline: "none",
                      textAlign: "left",
                      p: 1.1,
                      borderRadius: "8px",
                      cursor: "pointer",
                      border: selected ? "1px solid #1E40AF" : "1px solid #E2E8F0",
                      bgcolor: selected ? "#EFF6FF" : "#F8FAFC",
                      transition: "all 0.2s ease",
                      "&:hover": { borderColor: selected ? "#1E40AF" : "#93C5FD", bgcolor: selected ? "#EFF6FF" : "#fff" },
                      "&:focus-visible": { boxShadow: "0 0 0 2px rgba(30,64,175,0.18)" },
                    }}
                  >
                    <Typography component="span" sx={{ display: "block", fontSize: 13, fontWeight: 900, color: selected ? brandBlue : textPrimary }}>
                      {cfg.label}
                    </Typography>
                    <Typography component="span" sx={{ display: "block", fontSize: 10.5, color: textMuted, mt: 0.25, lineHeight: 1.4 }}>
                      {cfg.description}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {videoWithoutImage && allRecognitionDone && !allFailed && (
              <Alert severity="info" sx={{ fontSize: 12, py: 0.75, borderRadius: "8px", flexShrink: 0 }}>
                仅上传视频时，{platformConfig.shortLabel}标题一般在发布页或信息流封面，很少出现在画面里。请再传一张含标题或封面大字的截图，系统会从截图填标题；视频里的步骤与画面说明会写在发布文案。
              </Alert>
            )}

            {isFormBlocked && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1, py: 0.5, borderRadius: "8px", bgcolor: "#eff6ff", flexShrink: 0 }}>
                <CircularProgress size={12} thickness={5} sx={{ color: "#3b82f6" }} />
                <Typography sx={{ fontSize: 12, color: "#3b82f6", fontWeight: 500 }}>AI 识别中，完成后自动填入</Typography>
              </Box>
            )}

            <Box sx={{
              flex: 1, minHeight: 0,
              opacity: isFormBlocked ? 0.4 : 1,
              pointerEvents: isFormBlocked ? "none" : "auto",
              transition: "opacity 0.3s",
              display: "flex", flexDirection: "column", gap: 1.75,
            }}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary }}>{platformConfig.titleLabel}</Typography>
                  {autoFilled.title && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已填</Typography>}
                </Box>
                <TextField required fullWidth size="small" disabled={lockInputs} value={title}
                  onChange={(e) => { setTitle(e.target.value); setUserEdited((p) => ({ ...p, title: true })); }}
                  placeholder={platformConfig.titlePlaceholder} slotProps={{ htmlInput: { maxLength: 100 } }} />
                {showWarnings && warnings.title && !title.trim() && !userEdited.title && (
                  <Typography sx={{ fontSize: 11, color: "#d97706", mt: 0.5 }}>请手动输入标题</Typography>
                )}
              </Box>

              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary }}>{platformConfig.contentLabel}</Typography>
                  {autoFilled.content && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已填</Typography>}
                </Box>
                <TextField fullWidth multiline rows={isDesktop ? 3 : 3} size="small" disabled={lockInputs} value={content}
                  onChange={(e) => { setContent(e.target.value); setUserEdited((p) => ({ ...p, content: true })); }}
                  placeholder={platformConfig.contentPlaceholder} />
              </Box>

              {isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>目标人群</Typography>
                  <TextField fullWidth size="small" disabled={lockInputs} value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="例如：准备改造民宿的业主 / 负责办公室改造的行政负责人" />
                </Box>
              )}

              {isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>视频时长（秒）</Typography>
                  <TextField fullWidth size="small" disabled={lockInputs} value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="例如：35" type="number" />
                </Box>
              )}

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>
                  {isDouyin ? "前 3 秒钩子" : "开头3秒"}
                </Typography>
                <TextField fullWidth size="small" disabled={lockInputs} value={isDouyin ? hook : openingHook}
                  onChange={(e) => isDouyin ? setHook(e.target.value) : setOpeningHook(e.target.value)}
                  placeholder={isDouyin ? "例如：老民宿别先买软装，先把这 3 个空间问题改对" : "例如：办公室前台不好用，通常不是风格问题"} />
              </Box>

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>脚本/口播稿</Typography>
                <TextField fullWidth multiline rows={isDesktop ? 4 : 3} size="small" disabled={lockInputs} value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder={isDouyin ? "粘贴抖音口播脚本、分镜或内容大纲，用于判断完播和项目线索路径" : "粘贴视频脚本、口播稿或内容大纲，用于判断完播率、转发理由和项目初诊"} />
              </Box>

              {!isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>发布时间</Typography>
                  <TextField fullWidth size="small" disabled={lockInputs} value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    placeholder="例如：周六 18:30，或已发布 2026-04-25 20:00" />
                </Box>
              )}

              {!isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.75 }}>{metricLabel}</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 1 }}>
                    <TextField size="small" disabled={lockInputs} value={plays} onChange={(e) => setPlays(e.target.value)} label="播放" type="number" />
                    <TextField size="small" disabled={lockInputs} value={likes} onChange={(e) => setLikes(e.target.value)} label="点赞" type="number" />
                    <TextField size="small" disabled={lockInputs} value={comments} onChange={(e) => setComments(e.target.value)} label="评论" type="number" />
                    <TextField size="small" disabled={lockInputs} value={shares} onChange={(e) => setShares(e.target.value)} label="转发" type="number" />
                    <TextField size="small" disabled={lockInputs} value={favorites} onChange={(e) => setFavorites(e.target.value)} label="收藏" type="number" />
                    <TextField size="small" disabled={lockInputs} value={followersGained} onChange={(e) => setFollowersGained(e.target.value)} label="新增关注" type="number" />
                  </Box>
                  <TextField fullWidth sx={{ mt: 1 }} size="small" disabled={lockInputs} value={completionRate}
                    onChange={(e) => setCompletionRate(e.target.value)} label="完播率（%）" type="number" />
                </Box>
              )}

              {isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>{metricLabel}</Typography>
                  <TextField fullWidth multiline rows={3} size="small" disabled={lockInputs} value={opsData}
                    onChange={(e) => setOpsData(e.target.value)}
                    placeholder={douyinOpsPlaceholder} />
                </Box>
              )}

              {isDouyin && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary, mb: 0.5 }}>{baselineLabel}</Typography>
                  <TextField fullWidth multiline rows={3} size="small" disabled={lockInputs} value={baselineRows}
                    onChange={(e) => setBaselineRows(e.target.value)}
                    placeholder={`粘贴你自己的历史作品 JSON 或 CSV，例如：
plays,completion,likes,comments,shares
10000,45,600,50,20`} />
                </Box>
              )}

              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 750, color: textPrimary }}>{categoryLabel}</Typography>
                  {autoFilled.category && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已识别</Typography>}
                </Box>
                <CategoryPicker
                  value={isDouyin ? trafficField : category}
                  options={platformConfig.categories}
                  onChange={(v) => {
                    if (isDouyin) {
                      setTrafficField(v);
                    } else {
                      setCategory(v);
                    }
                    setUserEdited((p) => ({ ...p, category: true }));
                  }}
                />
              </Box>
            </Box>

            {/* Desktop CTA */}
            <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: 1, flexShrink: 0, pt: 0.5 }}>
              <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}
                sx={{
                  ...primaryButtonSx,
                  py: 1.1,
                  fontSize: 14,
                  minHeight: 42,
                }}
              >
                {ctaLabel}
              </Button>
              {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
                <Typography sx={{ fontSize: 10, color: "#d97706", textAlign: "center" }}>建议补充详情页截图</Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      </Box>

      {/* ═══ Mobile fixed CTA ═══ */}
      <Box sx={{
        display: { xs: "block", md: "none" },
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        px: 1.5, pt: 1,
        pb: "max(8px, env(safe-area-inset-bottom))",
        bgcolor: "rgba(248,250,252,0.96)", borderTop: "1px solid #E2E8F0",
        backdropFilter: "blur(12px)",
      }}>
        <Button variant="contained" fullWidth onClick={handleSubmit}
          sx={{
            ...primaryButtonSx,
            py: 1.1,
            fontSize: 15,
            minHeight: 46,
            bgcolor: canSubmit ? brandBlue : "#E2E8F0",
            boxShadow: canSubmit ? "0 8px 18px rgba(30,64,175,0.18)" : "none",
            color: canSubmit ? "#fff" : "#94A3B8",
            "&:hover": { bgcolor: canSubmit ? brandBlueDark : "#E2E8F0" },
          }}
        >
          {ctaLabel}
        </Button>
        {submitError && (
          <Typography sx={{ fontSize: 11, color: "#dc2626", textAlign: "center", mt: 0.5 }}>
            {submitError}
          </Typography>
        )}
      </Box>

      {/* ═══ Footer — legal links ═══ */}
      <Box sx={{
        display: { xs: "none", md: "flex" },
        justifyContent: "center", alignItems: "center", gap: 1.5,
        py: 0.8, flexShrink: 0,
        borderTop: "1px solid #E2E8F0", bgcolor: "#fff",
      }}>
        <Typography
          component="a" href="/terms"
          sx={{ fontSize: 11, color: "#94A3B8", textDecoration: "none", "&:hover": { color: brandBlue } }}
        >
          服务条款
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#CBD5E1" }}>|</Typography>
        <Typography
          component="a" href="/privacy"
          sx={{ fontSize: 11, color: "#94A3B8", textDecoration: "none", "&:hover": { color: brandBlue } }}
        >
          隐私政策
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#CBD5E1" }}>|</Typography>
        <Typography
          component="a" href="https://github.com/jiangmuran/noterx" target="_blank"
          sx={{ fontSize: 11, color: "#94A3B8", textDecoration: "none", "&:hover": { color: brandBlue } }}
        >
          GitHub
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#CBD5E1" }}>|</Typography>
        <Typography
          component="a" href="mailto:jmr@jiangmuran.com"
          sx={{ fontSize: 11, color: "#94A3B8", textDecoration: "none", "&:hover": { color: brandBlue } }}
        >
          合作联系 jmr@jiangmuran.com
        </Typography>
      </Box>

    </Box>
  );
}
