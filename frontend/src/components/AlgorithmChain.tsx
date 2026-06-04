import { Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import type { AlgorithmChainItem } from "../utils/api";

interface Props {
  items: AlgorithmChainItem[];
  platformLabel: string;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  strong: { label: "强项", color: "#16a34a", bg: "#f0fdf4" },
  watch: { label: "观察", color: "#d97706", bg: "#fff7ed" },
  risk: { label: "短板", color: "#dc2626", bg: "#fef2f2" },
};

export default function AlgorithmChain({ items, platformLabel }: Props) {
  if (!items.length) return null;

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#262626" }}>
            平台推送链路诊断
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#999", mt: 0.35 }}>
            基于{platformLabel}公开可观察信号构建的代理模型，不代表平台内部权重
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: "#bbb", flexShrink: 0 }}>
          {items.length} 个环节
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
        {items.map((item) => {
          const meta = STATUS_META[item.status] || STATUS_META.watch;
          const score = Math.round(item.score);
          return (
            <Box
              key={item.stage}
              sx={{
                p: 1.4,
                borderRadius: "8px",
                bgcolor: "#fafafa",
                border: "1px solid #f0f0f0",
                minWidth: 0,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#262626", minWidth: 0 }}>
                  {item.label}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: meta.color, fontVariantNumeric: "tabular-nums" }}>
                    {score}
                  </Typography>
                  <Chip
                    label={meta.label}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      color: meta.color,
                      bgcolor: meta.bg,
                      border: `1px solid ${meta.color}22`,
                    }}
                  />
                </Box>
              </Box>
              <LinearProgress
                variant="determinate"
                value={score}
                sx={{
                  height: 5,
                  borderRadius: 999,
                  my: 1,
                  bgcolor: "rgba(0,0,0,0.05)",
                  "& .MuiLinearProgress-bar": { bgcolor: meta.color, borderRadius: 999 },
                }}
              />
              <Typography sx={{ fontSize: 12, color: "#666", lineHeight: 1.55 }}>
                {item.reason}
              </Typography>
              <Typography sx={{ fontSize: 12, color: meta.color, lineHeight: 1.55, mt: 0.55, fontWeight: 600 }}>
                {item.suggestion}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
