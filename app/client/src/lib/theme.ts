export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "claw-theme";

// Derive accent variants from the primary hex. In light mode the "dark"
// variant darkens (for text-on-light) and "light" lightens (chip background).
// In dark mode that flips: "dark" brightens for text-on-dark, "light" becomes
// a muted dark-tinted surface for chips.
function deriveAccent(hex: string, theme: ResolvedTheme) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  const mix = (cs: number[]) => `#${cs.map(toHex).join("")}`;

  if (theme === "dark") {
    const accentText = mix([r, g, b].map((c) => c + (255 - c) * 0.25));
    const bgR = 0x0e,
      bgG = 0x18,
      bgB = 0x18;
    const surface = mix([bgR + (r - bgR) * 0.18, bgG + (g - bgG) * 0.18, bgB + (b - bgB) * 0.18]);
    return { accent: hex, accentDark: accentText, accentLight: surface, bg: "#0e1818" };
  }

  const accentDark = mix([r, g, b].map((c) => c * 0.85));
  const accentLight = mix([r, g, b].map((c) => c + (255 - c) * 0.9));
  const bg = mix([r, g, b].map((c) => c + (255 - c) * 0.95));
  return { accent: hex, accentDark, accentLight, bg };
}

export interface Palette {
  // Base
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  // Accent (theme-aware variants of brand color)
  accent: string;
  accentDark: string;
  accentLight: string;
  // Semantic states
  stale: string;
  staleBg: string;
  red: string;
  redBg: string;
  // App-specific surfaces
  hover: string; // subtle hover bg for menu items (was hover:bg-gray-50)
  highlight: string; // accent-tinted hover bg (was hover:bg-[#e6f7f6])
  codeBg: string; // mono code blocks (was bg-stone-50)
  // Diff colors (journal revision view)
  diffAddBg: string;
  diffAddText: string;
  diffRemoveBg: string;
  diffRemoveText: string;
  diffPaneBg: string; // <pre> background
  // Warning banner (stale briefing)
  warnBg: string;
  warnText: string;
  warnBorder: string;
  // Error banner
  errorBg: string;
  errorText: string;
  errorBorder: string;
  // Misc neutrals
  offBadgeBg: string; // "OFF" badge on disabled rules
  offBadgeText: string;
  toggleOffBg: string; // disabled-toggle pill bg
  faintText: string; // "Last evaluated: ..." color
}

export function paletteFor(theme: ResolvedTheme, primaryColor: string): Palette {
  const accent = deriveAccent(primaryColor, theme);
  if (theme === "dark") {
    return {
      bg: accent.bg,
      card: "#172626",
      text: "#e5edec",
      muted: "#8aa3a3",
      border: "#2a3838",
      accent: accent.accent,
      accentDark: accent.accentDark,
      accentLight: accent.accentLight,
      stale: "#e6a93a",
      staleBg: "#3a2e10",
      red: "#ef6f5a",
      redBg: "#3a1a18",
      hover: "#1f2c2c",
      highlight: accent.accentLight,
      codeBg: "#0f1818",
      diffAddBg: "#0f3a1a",
      diffAddText: "#6ce070",
      diffRemoveBg: "#3a1418",
      diffRemoveText: "#ff8a92",
      diffPaneBg: "#0f1818",
      warnBg: "#3a2e10",
      warnText: "#f5d36a",
      warnBorder: "#806010",
      errorBg: "#3a1a18",
      errorText: "#ffb3b3",
      errorBorder: "#80303a",
      offBadgeBg: "#1f2a2a",
      offBadgeText: "#7a8888",
      toggleOffBg: "#2a3838",
      faintText: "#556666",
    };
  }
  // Light — preserve existing brand palette.
  return {
    bg: accent.bg,
    card: "#ffffff",
    text: "#1a2f2f",
    muted: "#5a7a7a",
    border: "#d4e8e8",
    accent: accent.accent,
    accentDark: accent.accentDark,
    accentLight: accent.accentLight,
    stale: "#d4880f",
    staleBg: "#fef7ec",
    red: "#c0392b",
    redBg: "#fde8e8",
    hover: "#f9fafb",
    highlight: "#e6f7f6",
    codeBg: "#fafafa",
    diffAddBg: "#e6ffed",
    diffAddText: "#22863a",
    diffRemoveBg: "#ffeef0",
    diffRemoveText: "#b31d28",
    diffPaneBg: "#fafcfc",
    warnBg: "#fef3c7",
    warnText: "#854d0e",
    warnBorder: "#fbbf24",
    errorBg: "#fee2e2",
    errorText: "#991b1b",
    errorBorder: "#fecaca",
    offBadgeBg: "#f5f5f5",
    offBadgeText: "#999999",
    toggleOffBg: "#d1d5db",
    faintText: "#bbbbbb",
  };
}

// Constant light palette used by surfaces pinned to the branded light gradient
// (Auth, Setup, PrivacyScreen) regardless of the user's theme choice.
export const LIGHT_PALETTE_DEFAULT = paletteFor("light", "#2bbcb3");
