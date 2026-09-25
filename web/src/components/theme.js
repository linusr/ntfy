import { alpha } from "@mui/material";

const fontFamily = [
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI Variable Text"',
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
].join(",");

// Background colors are mirrored in index.html so the splash screen hands off without a flash
const colors = {
  light: {
    primary: "#2563eb",
    background: "#f5f6f8",
    paper: "#ffffff",
    text: "#0f172a",
    textSecondary: "#5b6474",
    divider: "rgba(15, 23, 42, 0.08)",
    error: "#dc2626",
  },
  dark: {
    primary: "#60a5fa",
    background: "#0b0f14",
    paper: "#131920",
    text: "#e6edf3",
    textSecondary: "#8b98a8",
    divider: "rgba(255, 255, 255, 0.08)",
    error: "#f87171",
  },
};

/** @returns {import("@mui/material").ThemeOptions} */
const themeOptions = (mode) => {
  const c = colors[mode];
  return {
    palette: {
      mode,
      primary: { main: c.primary },
      secondary: { main: mode === "light" ? "#3b82f6" : "#93c5fd" },
      error: { main: c.error },
      background: { default: c.background, paper: c.paper },
      text: { primary: c.text, secondary: c.textSecondary },
      divider: c.divider,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily,
      h5: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.35 },
      h6: { fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "inherit" },
        styleOverrides: {
          root: {
            backgroundColor: alpha(c.paper, 0.78),
            backdropFilter: "saturate(180%) blur(16px)",
            borderBottom: `1px solid ${c.divider}`,
            color: c.text,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: c.paper, borderRight: `1px solid ${c.divider}`, backgroundImage: "none" },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${c.divider}`,
            transition: "border-color 120ms ease, box-shadow 120ms ease",
            "&:hover": {
              boxShadow: mode === "light" ? "0 4px 16px rgba(15, 23, 42, 0.06)" : "0 4px 16px rgba(0, 0, 0, 0.35)",
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: 20,
            ":last-child": { paddingBottom: 20 },
          },
        },
      },
      MuiCardActions: {
        styleOverrides: {
          root: { overflowX: "auto", padding: "0 16px 16px", gap: 4 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { minWidth: 40, color: "inherit" } },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            margin: "1px 8px",
            paddingTop: 7,
            paddingBottom: 7,
            "&.Mui-selected": {
              backgroundColor: alpha(c.primary, mode === "light" ? 0.1 : 0.16),
              color: c.primary,
              "&:hover": { backgroundColor: alpha(c.primary, mode === "light" ? 0.14 : 0.22) },
            },
          },
        },
      },
      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: "transparent",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            lineHeight: "36px",
            color: c.textSecondary,
            paddingLeft: 24,
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 20, border: `1px solid ${c.divider}` },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: 8, fontSize: 12 } },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
    },
  };
};

export const lightTheme = themeOptions("light");
export const darkTheme = themeOptions("dark");
