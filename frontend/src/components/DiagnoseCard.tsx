import { useRef, useState } from "react";
import { Box, Button } from "@mui/material";
import ShareIcon from "@mui/icons-material/Share";
import { getDimensionConfig, getPlatformConfig, type PlatformKey } from "../config/platforms";
import type { DiagnoseResult } from "../utils/api";

interface Props {
  report: DiagnoseResult;
  title: string;
}

export default function DiagnoseCard({ report, title }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const platform = (report.platform || "wechat_channels") as PlatformKey;
  const platformConfig = getPlatformConfig(platform);
  const dimensions = getDimensionConfig(platform);
  const defaultTitle = platform === "douyin" ? "抖音素材" : "视频号作品";
  const safeTitle = (title || defaultTitle).slice(0, 10);

  const generateImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(cardRef.current, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await generateImage();
      if (!blob) return;
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], "card.png", { type: "image/png" })] })) {
        const file = new File([blob], `设计运营管家诊断-${safeTitle}.png`, { type: "image/png" });
        await navigator.share({ files: [file], title: "设计运营管家诊断卡片" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `设计运营管家诊断-${safeTitle}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("分享失败", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box>
      <Button
        variant="outlined" fullWidth startIcon={<ShareIcon />}
        disabled={exporting} onClick={handleExport}
        sx={{
          py: 1.25, borderRadius: "12px", fontWeight: 700, fontSize: 14,
          color: "#262626", borderColor: "#e0e0e0",
          "&:hover": { borderColor: "#262626", bgcolor: "#fafafa" },
        }}
      >
        {exporting ? "生成中..." : "分享诊断卡片"}
      </Button>

      {/*
        html2canvas 兼容卡片 — 避免 flexbox/gap/backdrop-filter
        全部用 padding + text-align 布局
      */}
      <div
        ref={cardRef}
        style={{
          marginTop: 16, borderRadius: 16, overflow: "hidden",
          border: "1px solid #f0f0f0", backgroundColor: "#fff",
          width: "100%", maxWidth: 340, marginLeft: "auto", marginRight: "auto",
        }}
      >
        {/* Header — no absolute positioning for html2canvas compat */}
        <div style={{
          background: "linear-gradient(135deg, #ff3d5c, #e61e3d)",
          padding: "20px 24px 16px",
          color: "#fff",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>
            设计运营管家诊断 · {platformConfig.shortLabel}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
            <td style={{ verticalAlign: "top", paddingRight: 12 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, lineHeight: 1.5,
                wordBreak: "break-all" as const,
              }}>
                {title || defaultTitle}
              </div>
            </td>
            <td style={{ verticalAlign: "top", textAlign: "right" as const, whiteSpace: "nowrap" as const, width: 70 }}>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>
                {Math.round(report.overall_score)}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700,
                backgroundColor: "rgba(255,255,255,0.2)",
                padding: "2px 8px", borderRadius: 6, marginTop: 4, display: "inline-block",
              }}>
                {report.grade}
              </div>
            </td>
          </tr></tbody></table>
        </div>

        {/* Bars */}
        <div style={{ padding: "16px 24px" }}>
          {dimensions.map((dim) => {
            const val = report.radar_data?.[dim.key] ?? 0;
            const shortLabel = dim.label
              .replace("前3秒/", "")
              .replace("账号/", "")
              .slice(0, 4);
            return (
              <div key={dim.key} style={{ marginBottom: 6, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#999", width: 36, textAlign: "right" as const, marginRight: 8 }}>
                  {shortLabel}
                </span>
                <div style={{ flex: 1, height: 4, backgroundColor: "#f5f5f5", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", backgroundColor: dim.color, borderRadius: 2, width: `${val}%` }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#666", width: 22, textAlign: "right" as const, marginLeft: 6 }}>
                  {Math.round(val)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Issues or Suggestions */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#999", marginBottom: 6 }}>主要发现</div>
          {(() => {
            // Try issues first, fallback to suggestions
            const items = (report.issues || [])
              .map(it => typeof it === "string" ? it : (it.description || ""))
              .filter(Boolean);
            const fallback = items.length === 0
              ? (report.suggestions || []).map(s => typeof s === "string" ? s : (s.description || "")).filter(Boolean)
              : items;
            return fallback.slice(0, 3).map((text, i) => (
              <div key={i} style={{ fontSize: 11, color: "#555", lineHeight: 1.5, marginBottom: 3 }}>
                {i + 1}. {text}
              </div>
            ));
          })()}
          {(report.issues || []).length === 0 && (report.suggestions || []).length === 0 && (
            <div style={{ fontSize: 11, color: "#bbb" }}>暂无详细诊断数据</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 24px", backgroundColor: "#fafafa",
          borderTop: "1px solid #f0f0f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              background: "linear-gradient(135deg, #ff5c6f, #e61e3d)",
              display: "inline-block", marginRight: 4, verticalAlign: "middle",
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#262626" }}>设计运营管家</span>
          </div>
          <span style={{ fontSize: 9, color: "#bbb" }}>media-assistant.local</span>
        </div>
      </div>
    </Box>
  );
}
