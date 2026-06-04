import { createTheme, type ThemeOptions } from "@mui/material/styles";

/**
 * 设计运营管家主题：Data-Dense Dashboard，偏专业运营后台。
 */

const themeOptions: ThemeOptions = {
  palette: {
    primary: {
      main: "#1E40AF",
      light: "#3B82F6",
      dark: "#1E3A8A",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#0F766E",
      light: "#14B8A6",
      dark: "#115E59",
      contrastText: "#ffffff",
    },
    error: {
      main: "#ef4444",
      light: "#fca5a5",
      dark: "#dc2626",
    },
    warning: {
      main: "#f59e0b",
      light: "#fcd34d",
      dark: "#d97706",
    },
    info: {
      main: "#3b82f6",
      light: "#93c5fd",
      dark: "#2563eb",
    },
    success: {
      main: "#10b981",
      light: "#6ee7b7",
      dark: "#059669",
    },
    background: {
      default: "#F8FAFC",
      paper: "#ffffff",
    },
    text: {
      primary: "#0F172A",
      secondary: "#475569",
    },
    divider: "#E2E8F0",
  },

  typography: {
    fontFamily: [
      "Fira Sans",
      "Noto Sans SC",
      "PingFang SC",
      "-apple-system",
      "BlinkMacSystemFont",
      "sans-serif",
    ].join(","),
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontWeight: 800, fontSize: "2rem", lineHeight: 1.3, letterSpacing: 0 },
    h2: { fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.35, letterSpacing: 0 },
    h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.4 },
    h4: { fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: "1.1rem", lineHeight: 1.5 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    subtitle1: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.6 },
    subtitle2: { fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.6 },
    body1: { fontWeight: 400, fontSize: "1rem", lineHeight: 1.7 },
    body2: { fontWeight: 400, fontSize: "0.875rem", lineHeight: 1.7 },
    button: { fontWeight: 700, fontSize: "0.875rem", letterSpacing: 0 },
    caption: { fontWeight: 400, fontSize: "0.75rem", lineHeight: 1.5, color: "#64748b" },
  },

  shape: {
    borderRadius: 8,
  },

  shadows: [
    "none",
    "0 1px 2px rgba(15, 23, 42, 0.04)",
    "0 2px 8px rgba(15, 23, 42, 0.06)",
    "0 4px 16px rgba(15, 23, 42, 0.06)",
    "0 8px 24px rgba(15, 23, 42, 0.08)",
    "0 12px 32px rgba(15, 23, 42, 0.08)",
    "0 16px 40px rgba(15, 23, 42, 0.09)",
    "0 4px 16px rgba(0,0,0,0.05)",
    "0 4px 16px rgba(0,0,0,0.05)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#F8FAFC",
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 700,
          borderRadius: 8,
          padding: "10px 28px",
          transition: "background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
        },
        sizeLarge: {
          padding: "14px 32px",
          fontSize: "1rem",
          borderRadius: 8,
        },
        sizeSmall: {
          padding: "6px 18px",
          fontSize: "0.8rem",
          borderRadius: 8,
        },
      },
      variants: [
        {
          props: { variant: "contained" as const, color: "primary" as const },
          style: {
            background: "#1E40AF",
            boxShadow: "0 6px 14px rgba(30, 64, 175, 0.18)",
            "&:hover": {
              background: "#1E3A8A",
              boxShadow: "0 8px 18px rgba(30, 64, 175, 0.24)",
            },
            "&:active": {
              background: "#172554",
            },
            "&.Mui-disabled": {
              background: "#ececec",
              boxShadow: "none",
              color: "#b0b0b0",
            },
          },
        },
        {
          props: { variant: "outlined" as const, color: "primary" as const },
          style: {
            borderWidth: 1.5,
            borderColor: "rgba(30, 64, 175, 0.45)",
            "&:hover": {
              borderWidth: 1.5,
              backgroundColor: "rgba(30, 64, 175, 0.06)",
              borderColor: "#1E40AF",
            },
          },
        },
      ],
    },

    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.05)",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 8,
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
          height: 30,
        },
        colorPrimary: {
          background: "rgba(30, 64, 175, 0.1)",
          color: "#1E40AF",
          border: "1px solid rgba(30, 64, 175, 0.16)",
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "#CBD5E1",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#94A3B8",
            },
            "&.Mui-focused": {
              boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.16)",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#2563EB",
              borderWidth: 2,
            },
          },
        },
      },
    },

    MuiStepper: {
      styleOverrides: {
        root: {
          paddingLeft: 0,
          paddingRight: 0,
        },
      },
    },

    MuiStepConnector: {
      styleOverrides: {
        line: {
          borderColor: "rgba(0, 0, 0, 0.08)",
        },
      },
    },

    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: "rgba(0, 0, 0, 0.12)",
          "&.Mui-active": {
            color: "#1E40AF",
            filter: "drop-shadow(0 2px 6px rgba(30, 64, 175, 0.24))",
          },
          "&.Mui-completed": {
            color: "#3B82F6",
          },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          alignItems: "center",
        },
        colorWarning: {
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          color: "#92400e",
          border: "1px solid rgba(245, 158, 11, 0.2)",
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.14)",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          fontSize: "0.8rem",
          fontWeight: 500,
          backgroundColor: "rgba(31, 31, 31, 0.92)",
          padding: "8px 14px",
          backdropFilter: "blur(8px)",
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 6,
          backgroundColor: "rgba(30, 64, 175, 0.1)",
        },
        bar: {
          borderRadius: 8,
          backgroundColor: "#1E40AF",
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color 0.18s ease",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.05)",
          },
        },
      },
    },
  },
};

const theme = createTheme(themeOptions);

export default theme;
