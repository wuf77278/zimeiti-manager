import { Box, Typography } from "@mui/material";
import { WECHAT_CATEGORIES, type OptionItem } from "../config/platforms";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options?: OptionItem[];
}

export default function CategoryPicker({ value, onChange, options = WECHAT_CATEGORIES }: Props) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {options.map((cat) => {
        const selected = value === cat.key;
        return (
          <Box
            key={cat.key}
            onClick={() => onChange(cat.key)}
            sx={{
              px: 1.75,
              py: 0.7,
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 600,
              transition: "all 0.25s cubic-bezier(0.2,0,0.2,1)",
              userSelect: "none",
              border: "1px solid transparent",
              ...(selected
                ? {
                    bgcolor: "#DBEAFE",
                    color: "#1E40AF",
                    boxShadow: "0 4px 12px rgba(30,64,175,0.12)",
                    borderColor: "#93C5FD",
                  }
                : {
                    bgcolor: "#F8FAFC",
                    color: "#475569",
                    borderColor: "#E2E8F0",
                    "&:hover": {
                      bgcolor: "#EFF6FF",
                      color: "#0F172A",
                      borderColor: "#BFDBFE",
                      transform: "translateY(-1px)",
                      boxShadow: "0 2px 8px rgba(30,64,175,0.08)",
                    },
                    "&:active": {
                      transform: "scale(0.97)",
                    },
                  }),
            }}
          >
            <Typography sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: 1.5 }}>
              {cat.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
