import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Alert, Stack, IconButton, Tooltip,
  Skeleton,
  TextField,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { motion } from "framer-motion";
import type { DiagnoseResult, OptimizePlan } from "../utils/api";
import { preScore, optimizeDiagnosis } from "../utils/api";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import StarIcon from "@mui/icons-material/Star";
import CircularProgress from "@mui/material/CircularProgress";
import {
  migrateLegacyLocalStorage,
  createLocalDiagnosisId,
  putLocalDiagnosis,
} from "../utils/localMemory";
import ScoreCard from "../components/ScoreCard";
import DimensionBars from "../components/DimensionBars";
import RadarChart from "../components/RadarChart";
import BaselineComparison from "../components/BaselineComparison";
import AgentDebate from "../components/AgentDebate";
import SimulatedComments from "../components/SimulatedComments";
import SuggestionList from "../components/SuggestionList";
import DiagnoseCard from "../components/DiagnoseCard";
import AlgorithmChain from "../components/AlgorithmChain";
import WorkflowTrace from "../components/WorkflowTrace";
import ContentReferencePanel from "../components/ContentReferencePanel";
import { showToast } from "../components/toastStore";
import { getPlatformConfig, type PlatformKey } from "../config/platforms";
import { getOpsState, importDiagnosisToOps, isOpsFrontendEnabled, type OpsAccount, type OpsState } from "../utils/opsApi";

const card = {
  bgcolor: "rgba(255,255,255,0.94)",
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: "18px",
  boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
  backdropFilter: "blur(18px)",
  p: { xs: 2.5, md: 3 },
};

const sectionGap = 2.5;

const DIAGNOSIS_MODE_LABELS: Record<string, string> = {
  pre_publish: "发布前诊断",
  post_publish: "发布后复盘",
  account_audit: "账号体检",
};

type ReportRouteState = {
  report: DiagnoseResult;
  params: {
    title: string;
    category: string;
    content?: string;
    tags?: string;
    platform?: PlatformKey;
    duration?: string;
    sourceAccountId?: string;
    diagnosisMode?: string;
    operationGoal?: string;
  };
  isFallback?: boolean;
};

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ReportRouteState | null;

  useEffect(() => {
    document.title = `诊断报告 - 设计运营管家`;
    if (!state || state.isFallback) return;
    const { report, params } = state;
    const platform = report.platform || params.platform || "wechat_channels";
    void (async () => {
      await migrateLegacyLocalStorage();
      const id = createLocalDiagnosisId();
      await putLocalDiagnosis({
        id,
        serverId: null,
        title: params.title,
        category: params.category,
        platform,
        overall_score: report.overall_score,
        grade: report.grade,
        createdAt: Date.now(),
        report,
        params: params as Record<string, unknown>,
      });
      // 不再上传到服务端（修复 #58），仅保留本地
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ color: "#64748B", fontSize: 14, mb: 2 }}>暂无诊断数据</Typography>
          <Button onClick={() => navigate("/")} sx={{ color: "primary.main", fontWeight: 700 }}>返回诊断工作台</Button>
        </Box>
      </Box>
    );
  }

  return <ReportContent state={state} />;
}

function ReportContent({ state }: { state: ReportRouteState }) {
  const navigate = useNavigate();
  const { report, params, isFallback } = state;
  const platform = (report.platform || params.platform || "wechat_channels") as PlatformKey;
  const opsEnabled = isOpsFrontendEnabled();
  const platformConfig = getPlatformConfig(platform);
  const isDouyin = platform === "douyin";
  const methodLabel = report.diagnosis_method === "noterx_rule_fallback" ? "规则兜底诊断" : "多 Agent 会诊";
  const diagnosisModeLabel = params.diagnosisMode ? DIAGNOSIS_MODE_LABELS[params.diagnosisMode] || params.diagnosisMode : "内容诊断";
  const operationContext = [diagnosisModeLabel, params.operationGoal].filter(Boolean).join(" · ");
  const topSuggestion = [...(report.suggestions || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
  const topIssue = (report.issues || [])[0];
  const weakestChainItem = [...(report.algorithm_chain || [])].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
  const firstAction = report.first_action || topSuggestion?.description || "先补标题、首帧和结尾承接动作，再进入下一轮诊断。";
  const biggestWeakness = report.biggest_weakness || weakestChainItem?.reason || topIssue?.description || "当前素材需要补充更明确的平台识别信号。";
  const summaryConclusion = report.summary_conclusion || `综合 ${Math.round(report.overall_score)} 分，先处理“${weakestChainItem?.label || topIssue?.from_agent || "内容主短板"}”。`;
  const commentPrompts = (report.comment_prompts || []).filter(Boolean);
  const publishChecklist = (report.publish_checklist || []).filter(Boolean);
  const reuseActions = (report.reuse_actions || [
    report.optimized_title ? { label: "复制标题", text: report.optimized_title } : null,
    report.optimized_content ? { label: "复制文案", text: report.optimized_content } : null,
    commentPrompts.length ? { label: "复制评论引导", text: commentPrompts.join("\n") } : null,
    publishChecklist.length ? { label: "复制发布检查清单", text: publishChecklist.map((item) => `- ${item}`).join("\n") } : null,
  ]).filter((item): item is { label: string; text: string } => Boolean(item?.text));
  const actionPrescription = [
    firstAction,
    ...publishChecklist,
    ...commentPrompts,
    ...(report.suggestions || []).map((item) => item.description),
  ].filter((item, index, arr): item is string => Boolean(item?.trim()) && arr.indexOf(item) === index).slice(0, 3);
  const userTags = typeof params.tags === "string"
    ? params.tags.split(",").filter(Boolean)
    : Array.isArray(params.tags) ? params.tags : [];

  // Re-score: both original and optimized with SAME preScore model for fair comparison
  const [originalPreScore, setOriginalPreScore] = useState<number | null>(null);
  const [optimizedPreScore, setOptimizedPreScore] = useState<number | null>(null);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    if (isDouyin) return;
    if (!report.optimized_title && !report.optimized_content) return;
    setRescoring(true);
    const baseParams = { category: params.category, tags: params.tags || "", image_count: 0 };
    Promise.all([
      preScore({ title: params.title, content: params.content || "", ...baseParams }),
      preScore({ title: report.optimized_title || params.title, content: report.optimized_content || params.content || "", ...baseParams }),
    ]).then(([orig, opt]) => {
      setOriginalPreScore(orig.total_score);
      setOptimizedPreScore(opt.total_score);
    }).catch(() => {}).finally(() => setRescoring(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only show comparison if optimized is actually higher
  const scoreDelta = (originalPreScore != null && optimizedPreScore != null) ? Math.round(optimizedPreScore - originalPreScore) : null;
  const showScoreComparison = scoreDelta != null && scoreDelta > 0;

  // Staggered section reveal
  const [visibleSections, setVisibleSections] = useState(0);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisibleSections(i);
      if (i >= 6) clearInterval(timer);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  // Optimization engine state
  const [optimizing, setOptimizing] = useState(false);
  const [optimizePlans, setOptimizePlans] = useState<OptimizePlan[]>([]);
  const [showOptPanel, setShowOptPanel] = useState(false);
  const [opsState, setOpsState] = useState<OpsState | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(params.sourceAccountId || "");
  const [createTaskFromImport, setCreateTaskFromImport] = useState(true);
  const [importingToOps, setImportingToOps] = useState(false);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    if (!opsEnabled) return;
    getOpsState().then((nextState) => {
      setOpsState(nextState);
      const matched = nextState.accounts.filter((account) => account.platform === platform && account.status === "connected");
      if (!selectedAccountId && matched[0]) {
        setSelectedAccountId(matched[0].id);
      }
    }).catch(() => {});
  }, [opsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedAccounts: OpsAccount[] = (opsState?.accounts || []).filter(
    (account) => account.platform === platform && account.status === "connected",
  );

  const handleImportToOps = async () => {
    if (!selectedAccountId) {
      setImportError("请先选择一个已登录账号");
      return;
    }
    setImportingToOps(true);
    setImportError("");
    try {
      await importDiagnosisToOps({
        accountId: selectedAccountId,
        title: report.optimized_title || params.title,
        content: report.optimized_content || params.content || "",
        tags: userTags,
        category: params.category,
        sourceDiagnosisId: `${Date.now()}-${params.title}`,
        score: Math.round(report.overall_score),
        durationSeconds: Number(params.duration || 60) || 60,
        createTask: createTaskFromImport,
      });
      showToast(createTaskFromImport ? "已加入账号运营任务" : "已加入账号草稿");
      navigate("/ops", { state: { tab: "tasks" } });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImportingToOps(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setShowOptPanel(true);
    try {
      const result = await optimizeDiagnosis({
        title: params.title,
        content: params.content || "",
        category: params.category,
        issues: JSON.stringify(report.issues?.slice(0, 5) || []),
        suggestions: JSON.stringify(report.suggestions?.slice(0, 5) || []),
        overall_score: report.overall_score,
      });
      setOptimizePlans(result.plans);
    } catch (e) {
      console.warn("优化失败", e);
    } finally {
      setOptimizing(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label}已复制`);
  };

  const sectionAnim = (index: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: visibleSections >= index ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    transition: { duration: 0.4, ease: "easeOut" as const },
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F8FAFC", backgroundImage: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 48%, #F8FAFC 100%)", pb: 6 }}>
      {/* Top bar */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 50, bgcolor: "rgba(255,255,255,0.86)", borderBottom: "1px solid rgba(148,163,184,0.22)", backdropFilter: "blur(18px)", boxShadow: "0 10px 30px rgba(15,23,42,0.05)" }}>
        <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, md: 3 }, py: 1.25, display: "flex", alignItems: "center" }}>
          <Button
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate(opsEnabled ? "/ops" : "/")}
            sx={{ color: "#64748B", fontWeight: 700, fontSize: 13, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}
          >
            {opsEnabled ? "运营台" : "工作台"}
          </Button>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>诊断报告</Typography>
          <Button
            startIcon={<ReplayIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/diagnose/new")}
            sx={{ color: "#64748B", fontWeight: 700, fontSize: 13, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}
          >
            新诊断
          </Button>
        </Box>
      </Box>

      {isFallback && (
        <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, md: 3 }, mt: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: "12px" }}>当前展示的是演示数据</Alert>
        </Box>
      )}

      <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, md: 3 }, mt: 2.5 }}>

          <motion.div {...sectionAnim(1)}>
          <Box sx={{ ...card, mb: sectionGap, borderColor: report.diagnosis_method === "noterx_rule_fallback" ? "#FDBA74" : "rgba(59,130,246,0.28)", backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.72))" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: { xs: "flex-start", md: "center" }, mb: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, color: "#64748B", fontWeight: 800, mb: 0.5 }}>
                  {operationContext || platformConfig.shortLabel}
                </Typography>
                <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 900, color: "#0F172A", lineHeight: 1.25 }}>
                  {summaryConclusion}
                </Typography>
              </Box>
              <Box sx={{
                px: 1,
                py: 0.45,
                borderRadius: "999px",
                bgcolor: report.diagnosis_method === "noterx_rule_fallback" ? "#FFF7ED" : "#EFF6FF",
                border: report.diagnosis_method === "noterx_rule_fallback" ? "1px solid #FDBA74" : "1px solid #BFDBFE",
                flexShrink: 0,
              }}>
                <Typography sx={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: report.diagnosis_method === "noterx_rule_fallback" ? "#C2410C" : "#1E40AF",
                }}>
                  {methodLabel}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.35fr 1fr 1fr" }, gap: 1.25 }}>
              <Box sx={{ borderLeft: "3px solid #1E40AF", pl: 1.25 }}>
                <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 800, mb: 0.45 }}>第一行动</Typography>
                <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.65, fontWeight: 600 }}>
                  {firstAction}
                </Typography>
              </Box>
              <Box sx={{ borderLeft: "3px solid #D97706", pl: 1.25 }}>
                <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 800, mb: 0.45 }}>最大短板</Typography>
                <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.65 }}>
                  {biggestWeakness}
                </Typography>
              </Box>
              <Box sx={{ borderLeft: "3px solid #0F766E", pl: 1.25 }}>
                <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 800, mb: 0.45 }}>判断口径</Typography>
                <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.65 }}>
                  {platformConfig.shortLabel} · {methodLabel} · 综合 {Math.round(report.overall_score)} 分
                </Typography>
              </Box>
            </Box>
          </Box>
          </motion.div>

          <motion.div {...sectionAnim(1)}>
            <Box sx={{ ...card, mb: sectionGap, p: { xs: 2, md: 2.5 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: { xs: "flex-start", md: "center" }, mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 900, fontSize: 16, color: "#0F172A", mb: 0.35 }}>先做这 3 件事</Typography>
                  <Typography sx={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
                    把报告结论拆成今天可以直接执行的处方，完成后再看评分证据和专家辩论。
                  </Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />}
                  onClick={handleOptimize}
                  sx={{ color: "#0F766E", fontSize: 12, fontWeight: 900, bgcolor: "#ECFDF5", borderRadius: "999px", px: 1.25, flexShrink: 0, "&:hover": { bgcolor: "#D1FAE5" } }}
                >
                  继续优化
                </Button>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
                {actionPrescription.map((item, index) => (
                  <Box key={`${index}-${item}`} sx={{ p: 1.5, borderRadius: "15px", bgcolor: index === 0 ? "rgba(239,246,255,0.82)" : "rgba(248,250,252,0.92)", border: index === 0 ? "1px solid #BFDBFE" : "1px solid #E2E8F0" }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 950, color: index === 0 ? "#1E40AF" : "#64748B", mb: 0.65 }}>
                      STEP {index + 1}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.65, fontWeight: index === 0 ? 700 : 500 }}>
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </motion.div>

          {reuseActions.length > 0 && (
            <motion.div {...sectionAnim(1)}>
              <Box sx={{ ...card, mb: sectionGap }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: { xs: "flex-start", md: "center" }, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 15, color: "#0F172A", mb: 0.4 }}>可直接复用</Typography>
                    <Typography sx={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
                      先复制可发布内容，再按检查清单确认标题、封面、前 3 秒和承接动作。
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                    onClick={() => copyText(reuseActions.map((item) => `${item.label}\n${item.text}`).join("\n\n"), "完整优化方案")}
                    sx={{ color: "#1E40AF", fontSize: 12, fontWeight: 800, bgcolor: "#EFF6FF", borderRadius: "999px", px: 1.25, "&:hover": { bgcolor: "#DBEAFE" } }}
                  >
                    复制完整方案
                  </Button>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1 }}>
                  {reuseActions.map((item) => (
                    <Button
                      key={item.label}
                      variant="outlined"
                      startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                      onClick={() => copyText(item.text, item.label.replace(/^复制/, ""))}
                      sx={{
                        justifyContent: "flex-start",
                        minHeight: 42,
                        borderRadius: "12px",
                        borderColor: "#BFDBFE",
                        color: "#1E40AF",
                        bgcolor: "rgba(239,246,255,0.52)",
                        fontSize: 12,
                        fontWeight: 800,
                        "&:hover": { borderColor: "#93C5FD", bgcolor: "#EFF6FF" },
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Box>
                {(commentPrompts.length > 0 || publishChecklist.length > 0) && (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25, mt: 1.5 }}>
                    {commentPrompts.length > 0 && (
                      <Box sx={{ p: 1.5, borderRadius: "14px", bgcolor: "rgba(248,250,252,0.86)", border: "1px solid #E2E8F0" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#0F766E", mb: 0.75 }}>评论区引导</Typography>
                        <Stack spacing={0.55}>
                          {commentPrompts.map((item) => (
                            <Typography key={item} sx={{ fontSize: 12.5, color: "#334155", lineHeight: 1.55 }}>· {item}</Typography>
                          ))}
                        </Stack>
                      </Box>
                    )}
                    {publishChecklist.length > 0 && (
                      <Box sx={{ p: 1.5, borderRadius: "14px", bgcolor: "rgba(248,250,252,0.86)", border: "1px solid #E2E8F0" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#D97706", mb: 0.75 }}>发布检查清单</Typography>
                        <Stack spacing={0.55}>
                          {publishChecklist.map((item) => (
                            <Typography key={item} sx={{ fontSize: 12.5, color: "#334155", lineHeight: 1.55 }}>· {item}</Typography>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </motion.div>
          )}

          {opsEnabled && (
          <motion.div {...sectionAnim(1)}>
          <Box sx={{ ...card, mb: sectionGap }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: { xs: "stretch", md: "center" }, flexDirection: { xs: "column", md: "row" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 0.5 }}>加入账号运营</Typography>
                <Typography sx={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
                  将优化后的标题和文案加入已登录账号，生成该账号下的素材、平台草稿和待审核任务。
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { md: 360 } }}>
                <TextField
                  select
                  size="small"
                  label="已登录账号"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  sx={{ minWidth: { xs: "100%", sm: 210 } }}
                  disabled={!connectedAccounts.length}
                >
                  {connectedAccounts.map((account) => (
                    <MenuItem key={account.id} value={account.id}>{account.displayName}</MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  sx={{ m: 0, minWidth: { sm: 148 }, "& .MuiFormControlLabel-label": { fontSize: 12, color: "#64748B", fontWeight: 700 } }}
                  control={
                    <Checkbox
                      size="small"
                      checked={createTaskFromImport}
                      onChange={(e) => setCreateTaskFromImport(e.target.checked)}
                      sx={{ p: 0.5, color: "#94A3B8", "&.Mui-checked": { color: "#1E40AF" } }}
                    />
                  }
                  label="同时建任务"
                />
                <Button
                  variant="contained"
                  onClick={handleImportToOps}
                  disabled={importingToOps || !connectedAccounts.length}
                  sx={{ bgcolor: "#1E40AF", borderRadius: "10px", fontWeight: 800, boxShadow: "0 10px 22px rgba(30,64,175,0.18)", "&:hover": { bgcolor: "#1E3A8A", boxShadow: "0 12px 26px rgba(30,64,175,0.24)" } }}
                >
                  {importingToOps ? "加入中..." : "加入运营"}
                </Button>
              </Stack>
            </Box>
            {!connectedAccounts.length && (
              <Alert severity="warning" sx={{ mt: 1.5, borderRadius: "8px" }}>
                当前没有同平台已登录账号，请先回运营台打开独立窗口并完成登录。
              </Alert>
            )}
            {importError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: "8px" }}>{importError}</Alert>}
          </Box>
          </motion.div>
          )}

          {/* Row 1: Score + Dimension + Radar */}
          <motion.div {...sectionAnim(1)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: sectionGap, mb: sectionGap }}>
            <Box sx={card}>
              <ScoreCard score={report.overall_score} grade={report.grade} title={params.title} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>维度评分</Typography>
              <DimensionBars data={report.radar_data} platform={platform} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 1 }}>{isDouyin ? "抖音诊断雷达" : "五维雷达"}</Typography>
              <RadarChart data={report.radar_data} platform={platform} />
            </Box>
          </Box>

          </motion.div>

          {report.workflow_trace?.length ? (
            <motion.div {...sectionAnim(2)}>
              <Box sx={{ ...card, mb: sectionGap }}>
                <WorkflowTrace items={report.workflow_trace} />
              </Box>
            </motion.div>
          ) : null}

          {report.algorithm_chain?.length ? (
            <motion.div {...sectionAnim(2)}>
              <Box sx={{ ...card, mb: sectionGap }}>
                <AlgorithmChain items={report.algorithm_chain} platformLabel={platformConfig.shortLabel} />
              </Box>
            </motion.div>
          ) : null}

          {report.content_profile ? (
            <motion.div {...sectionAnim(2)}>
              <Box sx={{ ...card, mb: sectionGap }}>
                <ContentReferencePanel profile={report.content_profile} platformLabel={platformConfig.shortLabel} />
              </Box>
            </motion.div>
          ) : null}

          {/* Row 2: Baseline + Suggestions */}
          <motion.div {...sectionAnim(2)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" }, gap: sectionGap, mb: sectionGap }}>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>基线对比</Typography>
              <BaselineComparison category={params.category} userTitle={params.title} userTags={userTags} />
              <Typography sx={{ fontSize: 11, color: "#94A3B8", mt: 2 }}>
                与{platformConfig.shortLabel}同场景内容基线对比
              </Typography>
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>优化建议</Typography>
              <SuggestionList suggestions={report.suggestions || []} />
            </Box>
          </Box>

          </motion.div>

          {/* Row 3: Optimized content + score comparison */}
          <motion.div {...sectionAnim(3)}>
          {(report.optimized_title || report.optimized_content || report.cover_direction) && (
            <Box sx={{ ...card, mb: sectionGap }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>AI 优化方案</Typography>
                {report.optimized_title && report.optimized_content && (
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                    onClick={() => {
                      const all = `标题：${report.optimized_title}\n\n${report.optimized_content}`;
                      navigator.clipboard.writeText(all);
                      showToast("已复制标题和发布文案");
                    }}
                    sx={{ color: "#64748B", fontSize: 12, fontWeight: 700, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}
                  >
                    复制全部
                  </Button>
                )}
              </Box>
              {/* Score comparison — only show if optimized is actually higher */}
              {(showScoreComparison || rescoring) && (
                <Box sx={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 1.5, mb: 2, py: 1.5, px: 2,
                  borderRadius: "12px", bgcolor: "#ECFDF5", border: "1px solid #A7F3D0",
                }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#64748B", mb: 0.25 }}>当前</Typography>
                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#475569" }}>
                      {originalPreScore != null ? Math.round(originalPreScore) : Math.round(report.overall_score)}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon sx={{ fontSize: 18, color: "#0F766E" }} />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#0F766E", mb: 0.25, fontWeight: 700 }}>优化后预估</Typography>
                    {rescoring ? (
                      <Skeleton variant="text" width={40} height={32} sx={{ mx: "auto" }} />
                    ) : optimizedPreScore != null ? (
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#0F766E" }}>
                        {Math.round(optimizedPreScore)}
                      </Typography>
                    ) : null}
                  </Box>
                  {scoreDelta != null && scoreDelta > 0 && (
                    <Box sx={{ px: 1, py: 0.4, borderRadius: "8px", bgcolor: "#D1FAE5" }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#0F766E" }}>
                        +{scoreDelta}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
                {report.optimized_title && (
                  <Box sx={{ p: 2, borderRadius: "14px", bgcolor: "rgba(248,250,252,0.86)", border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", mb: 0.5 }}>建议标题</Typography>
                      <Typography sx={{ fontSize: 14, color: "#0F172A", lineHeight: 1.6 }}>{report.optimized_title}</Typography>
                    </Box>
                    <Tooltip title="复制">
                      <IconButton size="small" onClick={() => copyText(report.optimized_title || "", "标题")} sx={{ color: "#94A3B8", flexShrink: 0, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}>
                        <ContentCopyIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {report.optimized_content && (
                  <Box sx={{ p: 2, borderRadius: "14px", bgcolor: "rgba(248,250,252,0.86)", border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", mb: 0.5 }}>优化发布文案/口播稿</Typography>
                      <Typography sx={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{report.optimized_content}</Typography>
                    </Box>
                    <Tooltip title="复制">
                      <IconButton size="small" onClick={() => copyText(report.optimized_content || "", "发布文案")} sx={{ color: "#94A3B8", flexShrink: 0, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}>
                        <ContentCopyIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
              {report.cover_direction && (
                <Box sx={{ mt: 1.5, p: 2, borderRadius: "14px", bgcolor: "rgba(248,250,252,0.86)", border: "1px solid #E2E8F0" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#64748B", mb: 1 }}>封面方向</Typography>
                  <Stack spacing={0.5}>
                    {report.cover_direction.layout && <Typography sx={{ fontSize: 13, color: "#334155" }}><strong>构图：</strong>{report.cover_direction.layout}</Typography>}
                    {report.cover_direction.color_scheme && <Typography sx={{ fontSize: 13, color: "#334155" }}><strong>配色：</strong>{report.cover_direction.color_scheme}</Typography>}
                    {report.cover_direction.text_style && <Typography sx={{ fontSize: 13, color: "#334155" }}><strong>文字：</strong>{report.cover_direction.text_style}</Typography>}
                    {report.cover_direction.tips?.map((tip: string, i: number) => (
                      <Typography key={i} sx={{ fontSize: 13, color: "#334155" }}>· {tip}</Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )}

          {/* 继续优化 — 紧跟在AI优化方案下方 */}
          {!showOptPanel ? (
            <Button
              variant="contained" fullWidth
              startIcon={<AutoFixHighIcon />}
              onClick={handleOptimize}
              sx={{
                py: 1.25, fontSize: 14, fontWeight: 800, borderRadius: "14px", mb: sectionGap,
                background: "linear-gradient(135deg, #1E40AF, #0F766E)",
                boxShadow: "0 14px 30px rgba(30,64,175,0.22)",
                "&:hover": { boxShadow: "0 18px 38px rgba(30,64,175,0.28)", transform: "translateY(-1px)" },
              }}
            >
              继续优化 — AI 生成高分方案
            </Button>
          ) : (
            <Box sx={{ ...card, mb: sectionGap }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>
                AI 优化方案
              </Typography>
              {optimizing && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, py: 3 }}>
                  <CircularProgress size={18} sx={{ color: "#1E40AF" }} />
                  <Typography sx={{ fontSize: 13, color: "#475569" }}>正在生成优化方案...</Typography>
                </Box>
              )}
              {optimizePlans.length > 0 && (
                <Stack spacing={1.5}>
                  {optimizePlans.map((plan, i) => (
                    <Box key={i} sx={{
                      p: 2, borderRadius: "14px",
                      bgcolor: plan.recommended ? "rgba(239,246,255,0.92)" : "rgba(248,250,252,0.86)",
                      border: plan.recommended ? "1.5px solid #BFDBFE" : "1px solid #E2E8F0",
                      position: "relative",
                    }}>
                      {plan.recommended && (
                        <Box sx={{ position: "absolute", top: -1, right: 12, px: 1, py: 0.25, borderRadius: "0 0 8px 8px", bgcolor: "#1E40AF" }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 0.3 }}>
                            <StarIcon sx={{ fontSize: 10 }} /> 推荐
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{plan.strategy}</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <Typography sx={{ fontSize: 18, fontWeight: 800, color: plan.score_delta > 0 ? "#0F766E" : "#475569" }}>{plan.score}</Typography>
                          {plan.score_delta > 0 && (
                            <Box sx={{ px: 0.5, py: 0.15, borderRadius: "6px", bgcolor: "#D1FAE5" }}>
                              <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#0F766E" }}>+{plan.score_delta}</Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", mb: 0.5 }}>{plan.optimized_title}</Typography>
                      <Typography sx={{ fontSize: 12, color: "#475569", lineHeight: 1.6, mb: 1,
                        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {plan.optimized_content}
                      </Typography>
                      <Button size="small" onClick={() => copyText(`${plan.optimized_title}\n\n${plan.optimized_content}`, "方案")}
                        startIcon={<ContentCopyIcon sx={{ fontSize: 13 }} />}
                        sx={{ fontSize: 11, color: "#64748B", fontWeight: 700, "&:hover": { color: "#1E40AF", bgcolor: "#EFF6FF" } }}>
                        复制
                      </Button>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          </motion.div>

          {/* Row 4: Agent debate + Comments */}
          <motion.div {...sectionAnim(4)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" }, gap: sectionGap, mb: sectionGap }}>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>Agent 诊断详情</Typography>
              <AgentDebate opinions={report.agent_opinions || []} summary={report.debate_summary || ""} timeline={report.debate_timeline || []} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#0F172A", mb: 2 }}>模拟评论区</Typography>
              <SimulatedComments
                comments={report.simulated_comments || []}
                noteTitle={params.title}
                noteContent={params.content || ""}
                noteCategory={params.category}
              />
            </Box>
          </Box>

          </motion.div>

          {/* Row 5: Export */}
          <motion.div {...sectionAnim(5)}>
          <Box sx={card}>
            <DiagnoseCard report={report} title={params.title} />
          </Box>

          </motion.div>

          <motion.div {...sectionAnim(6)}>
          <Typography sx={{ textAlign: "center", fontSize: 12, color: "#94A3B8", mt: 3 }}>
            本报告由 AI 多 Agent 协作生成，仅供参考
          </Typography>
          <Typography sx={{ textAlign: "center", fontSize: 11, color: "#94A3B8", mt: 1 }}>
            设计运营管家融合视频号与抖音设计素材会诊能力 · 合作联系{" "}
            <Typography component="a" href="mailto:jmr@jiangmuran.com"
              sx={{ fontSize: 11, color: "#64748B", textDecoration: "none", fontWeight: 700, "&:hover": { color: "#1E40AF" } }}>
              jmr@jiangmuran.com
            </Typography>
            {" · "}
            <Typography component="a" href="https://github.com/jiangmuran/noterx" target="_blank"
              sx={{ fontSize: 11, color: "#64748B", textDecoration: "none", fontWeight: 700, "&:hover": { color: "#1E40AF" } }}>
              上游 GitHub
            </Typography>
          </Typography>
          </motion.div>
        </Box>
    </Box>
  );
}
