import { Box, Stack, Typography } from "@mui/material";
import type { WorkflowTraceItem } from "../utils/api";

interface Props {
  items: WorkflowTraceItem[];
}

export default function WorkflowTrace({ items }: Props) {
  if (!items.length) return null;

  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#262626" }}>
          NoteRx 会诊链路
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#999", mt: 0.35 }}>
          多专家独立诊断、交叉辩论，再由 JudgeAgent 汇总最终报告
        </Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(7, 1fr)" }, gap: 0.75 }}>
        {items.map((item, index) => (
          <Box
            key={item.stage}
            sx={{
              minWidth: 0,
              p: 1,
              borderRadius: "8px",
              bgcolor: "#fafafa",
              border: "1px solid #f0f0f0",
              position: "relative",
            }}
          >
            <Typography sx={{ fontSize: 10, color: "#ff2442", fontWeight: 800, mb: 0.35 }}>
              {String(index + 1).padStart(2, "0")}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#262626", fontWeight: 700, lineHeight: 1.35 }}>
              {item.label}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#777", lineHeight: 1.45, mt: 0.5 }}>
              {item.description}
            </Typography>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
