import { Box, Chip, Stack, Typography } from "@mui/material";
import type { ContentProfile } from "../utils/api";

interface Props {
  profile?: ContentProfile;
  platformLabel: string;
}

const sectionTitles: Array<{ key: keyof ContentProfile; label: string }> = [
  { key: "sample_titles", label: "高频标题结构" },
  { key: "hook_patterns", label: "前3秒钩子" },
  { key: "content_formulas", label: "内容公式" },
  { key: "comment_patterns", label: "评论语境" },
  { key: "metric_focus", label: "指标关注" },
];

function limit(items?: string[], count = 4) {
  return (items || []).filter(Boolean).slice(0, count);
}

function ReferenceBlock({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <Box
      sx={{
        p: 1.4,
        borderRadius: "8px",
        bgcolor: "#fafafa",
        border: "1px solid #f0f0f0",
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#262626", mb: 0.8 }}>
        {label}
      </Typography>
      <Stack spacing={0.6}>
        {items.map((item, index) => (
          <Typography key={`${label}-${index}`} sx={{ fontSize: 12, color: "#666", lineHeight: 1.55 }}>
            {item}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export default function ContentReferencePanel({ profile, platformLabel }: Props) {
  if (!profile) return null;

  const keywordGroups = profile.keyword_packs || [];
  const riskNotes = limit(profile.risk_notes, 2);

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#262626" }}>
            平台内容数据参考
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#999", mt: 0.35 }}>
            {profile.data_scope}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          <Chip
            label={profile.category_label || platformLabel}
            size="small"
            sx={{ height: 22, fontSize: 10, fontWeight: 700, bgcolor: "#fff5f6", color: "#ff2442" }}
          />
          <Chip
            label={`${profile.reference_count || 0} 项`}
            size="small"
            sx={{ height: 22, fontSize: 10, fontWeight: 700, bgcolor: "#f5f7fb", color: "#475569" }}
          />
        </Stack>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
        {sectionTitles.map(({ key, label }) => (
          <ReferenceBlock key={key} label={label} items={limit(profile[key] as string[])} />
        ))}
      </Box>

      {keywordGroups.length ? (
        <Box sx={{ p: 1.4, borderRadius: "8px", bgcolor: "#f8fafc", border: "1px solid #eef2f7" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#262626", mb: 0.9 }}>
            关键词包
          </Typography>
          <Stack spacing={0.8}>
            {keywordGroups.slice(0, 3).map((group) => (
              <Box key={group.label} sx={{ display: "flex", alignItems: "center", gap: 0.8, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 11, color: "#64748b", fontWeight: 700, minWidth: 68 }}>
                  {group.label}
                </Typography>
                {group.items.slice(0, 7).map((item) => (
                  <Chip
                    key={`${group.label}-${item}`}
                    label={item}
                    size="small"
                    sx={{ height: 22, fontSize: 10, color: "#334155", bgcolor: "#fff", border: "1px solid #e2e8f0" }}
                  />
                ))}
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}

      {riskNotes.length ? (
        <Typography sx={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
          {riskNotes.join(" ")}
        </Typography>
      ) : null}
    </Stack>
  );
}
