import { useEffect, useRef, useState } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { getDimensionConfig, type PlatformKey } from "../config/platforms";

interface Props {
  data: Record<string, number>;
  platform?: PlatformKey;
}

function scoreLabel(score: number): string {
  if (score >= 90) return "优秀";
  if (score >= 75) return "良好";
  if (score >= 60) return "一般";
  if (score >= 40) return "较差";
  return "很差";
}

export default function DimensionBars({ data, platform }: Props) {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dimensions = getDimensionConfig(platform);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Stack ref={ref} spacing={2}>
      {dimensions.map((dim) => {
        const score = Math.round(data[dim.key] ?? 0);
        return (
          <Box key={dim.key}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#505050" }}>
                {dim.label}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: dim.color, fontVariantNumeric: "tabular-nums" }}>
                  {score}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "#bbb" }}>
                  {scoreLabel(score)}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ height: 7, bgcolor: "rgba(0,0,0,0.04)", borderRadius: 4, overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  bgcolor: dim.color,
                  borderRadius: 4,
                  width: animated ? `${score}%` : "0%",
                  transition: "width 1.2s cubic-bezier(0.2,0,0.2,1)",
                  boxShadow: animated ? `0 0 8px ${dim.color}30` : "none",
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
