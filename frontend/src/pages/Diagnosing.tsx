import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { Box, Typography, useTheme, useMediaQuery, Alert, Button } from "@mui/material";

import { preScore, diagnoseStream, diagnoseNote, DIAGNOSE_CLIENT_MAX_MS } from "../utils/api";
import type { DiagnoseParams, PreScoreResult, StreamEvent } from "../utils/api";
import { getDimensionConfig, getPlatformConfig, type PlatformKey } from "../config/platforms";

const EVENT_STEP_MAP: Record<string, number> = {
  parse_start: 1,
  parse_done: 2,
  baseline_start: 3,
  baseline_done: 3,
  round1_start: 4,
  round1_content_done: 4,
  round1_visual_done: 5,
  round1_growth_done: 6,
  round1_user_done: 7,
  round1_done: 8,
  debate_start: 8,
  debate_agent_0: 8,
  debate_agent_1: 8,
  debate_agent_2: 8,
  debate_agent_3: 9,
  debate_done: 9,
  judge_start: 9,
  judge_done: 10,
  finalizing: 10,
};

function getMappedStep(stepKey: string, defaultStep: number, maxStep: number) {
  const map: Record<string, number> = {
    ...EVENT_STEP_MAP,
    received: 1,
    parse: 2,
    baseline: 3,
    agents: 4,
    debate: Math.max(0, maxStep - 3),
    judge: Math.max(0, maxStep - 2),
    result: maxStep,
  };
  const mapped = map[stepKey] ?? defaultStep;
  return Math.min(mapped, maxStep);
}

type DiagnoseRouteParams = {
  platform?: PlatformKey;
  diagnosisMode?: string;
  operationGoal?: string;
  operationGoalKey?: string;
  title: string;
  content: string;
  tags: string;
  category: string;
  script?: string;
  openingHook?: string;
  publishTime?: string;
  plays?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  favorites?: string;
  followersGained?: string;
  completionRate?: string;
  audience?: string;
  trafficField?: string;
  goal?: string;
  duration?: string;
  hook?: string;
  opsData?: string;
  baselineRows?: string;
  sourceAccountId?: string;
  coverFile: File | null;
  coverImages?: File[];
  videoFile?: File | null;
};

function buildDiagnosePayload(params: DiagnoseRouteParams): DiagnoseParams {
  return {
    platform: params.platform,
    diagnosisMode: params.diagnosisMode,
    operationGoal: params.operationGoal,
    operationGoalKey: params.operationGoalKey,
    title: params.title,
    content: params.content,
    category: params.category,
    tags: params.tags,
    script: params.script,
    openingHook: params.openingHook,
    publishTime: params.publishTime,
    plays: params.plays,
    likes: params.likes,
    comments: params.comments,
    shares: params.shares,
    favorites: params.favorites,
    followersGained: params.followersGained,
    completionRate: params.completionRate,
    audience: params.audience,
    trafficField: params.trafficField,
    goal: params.goal,
    duration: params.duration,
    hook: params.hook,
    opsData: params.opsData,
    baselineRows: params.baselineRows,
    coverImage: params.coverFile ?? undefined,
    coverImages: params.coverImages ?? undefined,
    videoFile: params.videoFile ?? undefined,
  };
}

function readDiagnoseParams(locationState: unknown): DiagnoseRouteParams | null {
  return locationState as DiagnoseRouteParams | null;
}

const DIAGNOSIS_MODE_LABELS: Record<string, string> = {
  pre_publish: "发布前诊断",
  post_publish: "发布后复盘",
  account_audit: "账号体检",
};


/* (CATEGORY_LABEL removed — category shown via preScoreData.category_cn) */



/* ── Score ring component ── */
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 85 ? "#0F766E" : score >= 70 ? "#D97706" : "#DC2626";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={6} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.28} fontWeight="800"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

export default function Diagnosing() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const params = readDiagnoseParams(location.state);
  const platform = params?.platform || "wechat_channels";
  const platformConfig = getPlatformConfig(platform);
  const diagnosisModeLabel = params?.diagnosisMode ? DIAGNOSIS_MODE_LABELS[params.diagnosisMode] || params.diagnosisMode : "";
  const operationContext = [diagnosisModeLabel, params?.operationGoal].filter(Boolean).join(" · ");
  const steps = platformConfig.steps;
  const tips = (params ? platformConfig.tips[params.category] : null) || platformConfig.tips._default;
  const funFacts = platformConfig.funFacts;
  const dimensionConfig = getDimensionConfig(platform);
  const dimLabels = Object.fromEntries(dimensionConfig.map((d) => [d.key, d.label]));
  const dimColors = Object.fromEntries(dimensionConfig.map((d) => [d.key, d.color]));
  const debateStepIndex = steps.findIndex((s) => s.label.includes("辩论"));
  const judgeStepIndex = steps.findIndex((s) => s.label.includes("裁判") || s.label.includes("Judge"));

  const [step, setStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [factIdx, setFactIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [preScoreData, setPreScoreData] = useState<PreScoreResult | null>(null);
  const [streamMsg, setStreamMsg] = useState<string>("");
  const [debateMsgs, setDebateMsgs] = useState<string[]>([]);
  const apiDone = useRef(false);
  const hasRealtimeProgress = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);
  /** 任意 SSE 事件刷新，用于检测「长时间无推送」卡死 */
  const lastSseActivityRef = useRef<number>(0);
  const stallTriggeredRef = useRef(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "诊断中... - 设计运营管家";
    if (!params) { navigate("/"); return; }
    lastSseActivityRef.current = Date.now();
    stallTriggeredRef.current = false;
    let cancelled = false;
    const abortController = new AbortController();
    let initialStepFrame = 0;

    // Phase 1: Instant pre-score（当前只对视频号启用；抖音走后端策略评分）
    if (platform === "wechat_channels") {
      preScore({
        title: params.title, content: params.content,
        category: params.category, tags: params.tags,
        image_count: params.coverImages?.length ?? (params.coverFile ? 1 : 0),
      }).then((ps) => {
        if (!cancelled) {
          setPreScoreData(ps);
          setStep(1); // Move past "数据预评分"
        }
      }).catch(() => {});
    } else {
      initialStepFrame = requestAnimationFrame(() => {
        if (!cancelled) setStep(1);
      });
    }

    /** 流式诊断结束后若仍为 false，再尝试 POST /diagnose */
    let streamEndedWithServerError = false;

    const touchSse = () => {
      lastSseActivityRef.current = Date.now();
    };

    // Phase 2: Full diagnosis via SSE stream (fallback to normal POST)
    (async () => {
      try {
        const payload = buildDiagnosePayload(params);
        await diagnoseStream(
          payload,
          (event: StreamEvent) => {
            if (cancelled) return;
            touchSse();
            if (event.type === "pre_score") {
              setPreScoreData(event.data as unknown as PreScoreResult);
              setStep(1);
            } else if (event.type === "progress") {
              hasRealtimeProgress.current = true;
              setStreamMsg(event.data.message);
              const mapped = getMappedStep(event.data.step, step, steps.length - 1);
              setStep((prev) => Math.max(prev, mapped));
              if (event.data.step?.startsWith("debate_agent_")) {
                setDebateMsgs((prev) => [...prev, event.data.message]);
              }
            } else if (event.type === "result") {
              resultRef.current = { report: event.data, isFallback: false };
              apiDone.current = true;
              setStep(steps.length - 1);
            } else if (event.type === "error") {
              streamEndedWithServerError = true;
              const msg =
                typeof event.data?.message === "string"
                  ? event.data.message
                  : "服务端诊断失败";
              setTerminalError(msg);
              apiDone.current = true;
            }
          },
          abortController.signal,
        );
        if (streamEndedWithServerError) {
          return;
        }
        if (platform === "wechat_channels" && !resultRef.current) {
          const result = await diagnoseNote(payload);
          resultRef.current = { report: result, isFallback: false };
        }
      } catch (err) {
        console.warn("SSE 不可用，降级到普通请求", err);
        try {
          const result = await diagnoseNote(buildDiagnosePayload(params));
          resultRef.current = { report: result, isFallback: false };
        } catch (e2: unknown) {
          let msg = "诊断请求失败，请检查网络与后端是否已启动";
          if (axios.isAxiosError(e2)) {
            const d = e2.response?.data;
            if (d && typeof d === "object" && "detail" in d) {
              const det = (d as { detail: unknown }).detail;
              msg = typeof det === "string" ? det : JSON.stringify(det);
            } else if (e2.message) {
              msg = e2.message;
            }
          } else if (e2 instanceof Error && e2.message) {
            msg = e2.message;
          }
          setTerminalError(msg);
        }
      }
      apiDone.current = true;
    })();

    // Step timer (fills gaps between real events)
    const stepTimer = setInterval(() => {
      setStep((prev) => {
        if (apiDone.current && prev >= steps.length - 2) {
          clearInterval(stepTimer);
          setTimeout(() => {
            if (!cancelled && resultRef.current)
              navigate("/report", { state: { report: resultRef.current.report, params, isFallback: resultRef.current.isFallback } });
          }, 600);
          return steps.length - 1;
        }
        if (hasRealtimeProgress.current) return prev;
        if (prev >= steps.length - 1) return prev;
        if (!apiDone.current && prev >= steps.length - 2) return prev;
        return prev + 1;
      });
    }, 3500);

    const tipTimer = setInterval(() => setTipIdx((p) => (p + 1) % tips.length), 4500);
    const clockTimer = setInterval(() => setElapsed((p) => p + 1), 1000);
    const factTimer = setInterval(() => { setFactIdx((p) => (p + 1) % funFacts.length); setShowAnswer(false); }, 8000);

    /**
     * 整单最长等待；超时不再用演示数据，改为明确错误 + 重试。
     */
    const timeoutTimer = setTimeout(() => {
      if (!apiDone.current && !cancelled) {
        setTerminalError(
          `诊断超过 ${DIAGNOSE_CLIENT_MAX_MS / 1000}s 仍未结束。可在 frontend/.env 增大 VITE_DIAGNOSE_MAX_WAIT_MS，或检查后端/模型是否卡住。`,
        );
        apiDone.current = true;
      }
    }, DIAGNOSE_CLIENT_MAX_MS);

    /** 长时间无任何 SSE 推送则判定连接卡死（默认 120s，每 10s 检查） */
    const stallCheckMs = 120_000;
    const stallIv = setInterval(() => {
      if (cancelled || apiDone.current || stallTriggeredRef.current) return;
      if (Date.now() - lastSseActivityRef.current > stallCheckMs) {
        stallTriggeredRef.current = true;
        setTerminalError(
          "诊断流长时间无数据（可能后端或模型无响应）。请查看后端日志或稍后重试。",
        );
        apiDone.current = true;
      }
    }, 10_000);

    return () => {
      cancelled = true;
      abortController.abort(); // 取消 SSE / fetch，与离开页卸载一致
      clearInterval(stepTimer);
      clearInterval(tipTimer);
      clearInterval(clockTimer);
      clearInterval(factTimer);
      clearInterval(stallIv);
      clearTimeout(timeoutTimer);
      cancelAnimationFrame(initialStepFrame);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) return null;

  if (terminalError) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#F8FAFC",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          gap: 2,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 440, width: "100%", borderRadius: "12px" }}>
          {terminalError}
        </Alert>
        <Button
          variant="contained"
          onClick={() => navigate("/diagnose/new", { replace: true })}
          sx={{
            bgcolor: "primary.main",
            textTransform: "none",
            fontWeight: 700,
            px: 3,
            borderRadius: "10px",
            "&:hover": { bgcolor: "primary.dark" },
          }}
        >
          返回首页重试
        </Button>
      </Box>
    );
  }

  const progress = ((step + 1) / steps.length) * 100;
  const activeStepLabel = steps[Math.min(step, steps.length - 1)]?.label || "AI 会诊准备中";
  const liveHeadline = streamMsg || (preScoreData
    ? `已完成 ${preScoreData.level} 初判，等待专家会诊继续展开。`
    : "AI 正在读取素材并建立诊断上下文。"
  );
  const latestDebate = debateMsgs[debateMsgs.length - 1] || "";

  return (
    <Box sx={{ position: "fixed", inset: 0, bgcolor: "#F8FAFC", display: "flex", flexDirection: "column" }}>

      {/* ═══ Top bar ═══ */}
      <Box sx={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        px: { xs: 1.5, md: 3 }, height: 56,
        borderBottom: "1px solid #E2E8F0",
        bgcolor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ flexShrink: 0, display: "flex" }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#1E40AF", boxShadow: "0 0 0 5px rgba(30,64,175,0.12)" }} />
          </motion.div>
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {params.title || "诊断中"}
            </Typography>
            {operationContext && (
              <Typography sx={{ fontSize: 10.5, color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", mt: 0.1 }}>
                {operationContext}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0, ml: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: "#64748B", display: { xs: "none", sm: "block" } }}>
            {streamMsg || "预计 30-60s"}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#1E40AF", fontVariantNumeric: "tabular-nums", bgcolor: "#EFF6FF", px: 1, py: 0.35, borderRadius: "8px", border: "1px solid #BFDBFE" }}>
            {elapsed}s
          </Typography>
        </Box>
      </Box>

      {/* ═══ Content ═══ */}
      <Box sx={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <Box sx={{
          width: "100%", maxWidth: 1080,
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, md: 2.5 },
          px: { xs: 2, md: 3 },
          py: { xs: 2.5, md: 3.5 },
        }}>
          <Box sx={{
            bgcolor: "linear-gradient(135deg, rgba(239,246,255,0.96), rgba(240,253,250,0.92))",
            border: "1px solid rgba(147,197,253,0.55)",
            borderRadius: "20px",
            boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
            p: { xs: 2, md: 2.5 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.35fr 0.9fr" },
            gap: 2,
          }}>
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#1E40AF", letterSpacing: "0.04em", mb: 0.75 }}>
                AI 专家会诊室 · {platformConfig.shortLabel}
              </Typography>
              <Typography sx={{ fontSize: { xs: 21, md: 28 }, fontWeight: 950, color: "#0F172A", lineHeight: 1.2, mb: 1 }}>
                {activeStepLabel}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                {liveHeadline}
              </Typography>
              {latestDebate && (
                <Box sx={{ mt: 1.5, px: 1.5, py: 1.1, borderRadius: "14px", bgcolor: "rgba(255,255,255,0.76)", border: "1px solid rgba(226,232,240,0.9)" }}>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 900, color: "#64748B", mb: 0.4 }}>
                    最新专家分歧
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: "#0F172A", lineHeight: 1.65 }}>
                    {latestDebate}
                  </Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
              {[
                { label: "即时预判", value: preScoreData ? `${Math.round(preScoreData.total_score)} 分` : "生成中", tone: "#1E40AF" },
                { label: "会诊进度", value: `${step + 1}/${steps.length}`, tone: "#0F766E" },
                { label: "已用时间", value: `${elapsed}s`, tone: "#D97706" },
                { label: "辩论摘录", value: `${debateMsgs.length} 条`, tone: "#7C3AED" },
              ].map((item) => (
                <Box key={item.label} sx={{ p: 1.25, borderRadius: "15px", bgcolor: "rgba(255,255,255,0.82)", border: "1px solid rgba(226,232,240,0.9)" }}>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 900, color: "#64748B", mb: 0.5 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 950, color: item.tone }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "320px 1fr" },
            gap: { xs: 2.5, md: 4 },
            alignContent: "start",
            alignItems: "start",
          }}>

          {/* ═══ Left column: Score ═══ */}
          <Box sx={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            bgcolor: "rgba(255,255,255,0.92)", border: "1px solid #E2E8F0", borderRadius: "18px",
            boxShadow: "0 18px 45px rgba(15,23,42,0.08)", p: { xs: 2, md: 3 },
          }}>
            {/* Score ring or placeholder — no mode="wait" to avoid flash */}
            {preScoreData ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <ScoreRing score={preScoreData.total_score} size={isDesktop ? 140 : 110} />
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", mb: 0.25,
                    maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {params.title || platformConfig.shortLabel + "作品"}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#999" }}>
                      {preScoreData.category_cn}
                    </Typography>
                    <Box sx={{
                      px: 0.5, py: 0.1, borderRadius: "4px",
                      bgcolor: preScoreData.total_score >= 85 ? "#dcfce7" : preScoreData.total_score >= 70 ? "#fef3c7" : "#fee2e2",
                    }}>
                      <Typography sx={{
                        fontSize: 10, fontWeight: 700,
                        color: preScoreData.total_score >= 85 ? "#16a34a" : preScoreData.total_score >= 70 ? "#d97706" : "#dc2626",
                      }}>
                        {preScoreData.level}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Box sx={{
                    width: isDesktop ? 140 : 110, height: isDesktop ? 140 : 110,
                    borderRadius: "50%", border: "3px solid #f0f0f0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Typography sx={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>评分中</Typography>
                  </Box>
                </motion.div>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#999",
                  maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                  {params.title || "正在分析..."}
                </Typography>
              </Box>
            )}

            {/* Dimension bars — desktop: always show; mobile: only when data ready */}
            {preScoreData && (
              <Box sx={{ width: "100%", maxWidth: 280 }}>
                {Object.entries(preScoreData.dimensions).map(([key, val]) => (
                  <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.6, "&:last-child": { mb: 0 } }}>
                    <Typography sx={{ fontSize: 11, color: "#999", minWidth: 44, textAlign: "right" }}>
                      {dimLabels[key] || key}
                    </Typography>
                    <Box sx={{ flex: 1, height: 5, bgcolor: "#f5f5f5", borderRadius: 3, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        style={{ height: "100%", borderRadius: 3, background: dimColors[key] || "#10b981" }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#666", minWidth: 24, textAlign: "right" }}>
                      {Math.round(val)}
                    </Typography>
                  </Box>
                ))}
                <Typography sx={{ fontSize: 10, color: "#94A3B8", mt: 1, textAlign: "center", lineHeight: 1.5 }}>
                  即时预判先给方向，最终结论以多 Agent 会诊报告为准
                </Typography>
              </Box>
            )}
          </Box>


          {/* ═══ Right column: Step Timeline ═══ */}
          <Box sx={{
            display: "flex", flexDirection: "column", gap: 0,
            bgcolor: "rgba(255,255,255,0.92)", border: "1px solid #E2E8F0", borderRadius: "18px",
            boxShadow: "0 18px 45px rgba(15,23,42,0.08)", p: { xs: 2, md: 3 },
          }}>

            {/* Progress bar at top */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ height: 4, bgcolor: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{
                  height: "100%", borderRadius: 2, bgcolor: "#1E40AF",
                  width: `${progress}%`,
                  transition: "width 0.5s ease",
                }} />
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                <Typography sx={{ fontSize: 11, color: "#999" }}>{step + 1}/{steps.length}</Typography>
                <Typography sx={{ fontSize: 11, color: "#bbb" }}>{elapsed}s</Typography>
              </Box>
            </Box>

            {/* Vertical step timeline */}
            {steps.map((s, i) => {
              const isDone = i < step;
              const isActive = i === step;
              
              const isDebatePhase = i === debateStepIndex;
              const isJudgePhase = i === judgeStepIndex;

              return (
                <Box key={i} sx={{ display: "flex", gap: 1.5, pb: i < steps.length - 1 ? 0 : 0 }}>
                  {/* Timeline line + dot */}
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
                    <Box sx={{
                      width: isDone ? 16 : isActive ? 18 : 12,
                      height: isDone ? 16 : isActive ? 18 : 12,
                      borderRadius: "50%",
                      bgcolor: isDone ? "#0F766E" : isActive ? "#1E40AF" : "#E2E8F0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.3s",
                      boxShadow: isActive ? "0 0 0 5px rgba(30,64,175,0.12)" : "none",
                    }}>
                      {isDone && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                      {isActive && (
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff" }} />
                      )}
                    </Box>
                    {i < steps.length - 1 && (
                      <Box sx={{
                        width: 2, flex: 1, minHeight: 16,
                        bgcolor: isDone ? "#0F766E" : "#E2E8F0",
                        transition: "background-color 0.3s",
                      }} />
                    )}
                  </Box>

                  {/* Step content */}
                  <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
                    <Typography sx={{
                      fontSize: isActive ? 14 : 13,
                      fontWeight: isActive ? 700 : isDone ? 500 : 400,
                      color: isDone ? "#0F766E" : isActive ? "#0F172A" : "#94A3B8",
                      lineHeight: 1.3,
                      transition: "all 0.3s",
                    }}>
                      {s.label}
                    </Typography>
                    {isActive && (
                      <Typography sx={{ fontSize: 11, color: "#999", mt: 0.25 }}>
                        {s.desc}
                      </Typography>
                    )}

                    {/* Debate phase: show live messages */}
                    {isDebatePhase && (isDone || isActive) && debateMsgs.length > 0 && (
                      <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                        {debateMsgs.map((msg, j) => {
                          const colors = ["#ff2442", "#8b5cf6", "#f59e0b", "#3b82f6"];
                          const bgColors = ["#fff5f6", "#faf5ff", "#fffbeb", "#eff6ff"];
                          return (
                            <Box key={j} sx={{
                              px: 1.25, py: 0.75, borderRadius: "8px",
                              bgcolor: bgColors[j % 4],
                              borderLeft: `2px solid ${colors[j % 4]}`,
                            }}>
                              <Typography sx={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                                {msg}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    )}

                    {/* Judge phase: show status */}
                    {isJudgePhase && isActive && (
                      <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                          <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#10b981" }} />
                        </motion.div>
                        <Typography sx={{ fontSize: 11, color: "#10b981" }}>
                          综合裁判正在评定最终报告...
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}

            {/* Tips / Quiz below timeline */}
            <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #f0f0f0" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#10b981", mb: 0.5, letterSpacing: "0.04em" }}>
                数据洞察
              </Typography>
              <AnimatePresence mode="wait">
                <motion.div key={tipIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <Typography sx={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                    {tips[tipIdx]}
                  </Typography>
                </motion.div>
              </AnimatePresence>
            </Box>

            <Box
              onClick={() => setShowAnswer(true)}
              sx={{
                mt: 1.5, p: 1.5, borderRadius: "10px", cursor: "pointer",
                bgcolor: showAnswer ? "#fff5f6" : "#f9f9f9",
                border: showAnswer ? "1px solid #fecaca" : "1px solid transparent",
                transition: "all 0.3s",
              }}
            >
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: showAnswer ? "#ff2442" : "#bbb", mb: 0.25 }}>
                {showAnswer ? "答案" : "猜一猜"}
              </Typography>
              <AnimatePresence mode="wait">
                <motion.div key={`${factIdx}-${showAnswer}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: showAnswer ? 700 : 500,
                    color: showAnswer ? "#ff2442" : "#1a1a1a", lineHeight: 1.5 }}>
                    {showAnswer ? funFacts[factIdx].a : funFacts[factIdx].q}
                  </Typography>
                </motion.div>
              </AnimatePresence>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
  );
}
