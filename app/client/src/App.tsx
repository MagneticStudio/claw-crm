import { useState, useEffect, createContext, useContext } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route } from "wouter";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import { ThemeContext, useTheme as _useTheme } from "@/lib/theme";
import type { ThemePref } from "@/lib/theme";

import CrmPage from "@/pages/crm-page";
import RulesPage from "@/pages/rules-page";
import SettingsPage from "@/pages/settings-page";
import AuthPage from "@/pages/auth-page";
import BriefingPage from "@/pages/briefing-page";
import JournalPage from "@/pages/journal-page";
import SetupPage from "@/pages/setup-page";
import NotFound from "@/pages/not-found";

// App config context — org name from DB
// Derive color variants from a hex primary color
function deriveColors(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  const darken = (amt: number) =>
    `#${[r, g, b]
      .map((c) =>
        Math.max(0, Math.round(c * (1 - amt)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  const lighten = (amt: number) =>
    `#${[r, g, b]
      .map((c) =>
        Math.min(255, Math.round(c + (255 - c) * amt))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  return {
    accent: hex,
    accentDark: darken(0.15),
    accentLight: lighten(0.9),
    bg: lighten(0.95),
  };
}

interface AppConfig {
  orgName: string;
  primaryColor: string;
  upcomingDays: number;
  colors: ReturnType<typeof deriveColors>;
}

const defaultColors = deriveColors("#2bbcb3");
const ConfigContext = createContext<AppConfig>({
  orgName: "Claw CRM",
  primaryColor: "#2bbcb3",
  upcomingDays: 7,
  colors: defaultColors,
});
export function useConfig() {
  return useContext(ConfigContext);
}

// Mode-specific neutral palette. Accent (teal) stays the same across modes so
// brand identity carries over. Page + card backgrounds and text colors flip.
// `pageBg` is what surrounds cards; `cardBg` is the card surface itself.
const LIGHT_STATIC = {
  text: "#1a2f2f",
  muted: "#5a7a7a",
  border: "#d4e8e8",
  stale: "#d4880f",
  staleBg: "#fef7ec",
  red: "#c0392b",
  redBg: "#fde8e8",
  pageBg: "#f0f8f8",
  cardBg: "#ffffff",
  inputBg: "#fafafa",
} as const;

const DARK_STATIC = {
  text: "#e6f0ef",
  muted: "#7a9a9a",
  border: "#22312f",
  stale: "#f0a544",
  staleBg: "#2a1f12",
  red: "#e0594a",
  redBg: "#3a1f1f",
  pageBg: "#0c1414",
  cardBg: "#152020",
  inputBg: "#1c2828",
} as const;

// Re-export useTheme so the existing `import { useTheme } from "@/App"`
// call sites keep working. ThemeContext + useTheme live in @/lib/theme to
// avoid Vite's react-refresh splitting them across two module instances.
export const useTheme = _useTheme;

/** Dynamic accent colors + mode-specific static palette. */
export function useColors() {
  const { colors } = useContext(ConfigContext);
  const { resolved } = _useTheme();
  const palette = resolved === "dark" ? DARK_STATIC : LIGHT_STATIC;
  return { ...palette, ...colors };
}

function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<{ orgName: string; primaryColor: string; upcomingDays: number }>({
    queryKey: ["/api/config"],
    staleTime: 60_000,
  });
  const primaryColor = data?.primaryColor || "#2bbcb3";
  const colors = deriveColors(primaryColor);

  // Set CSS custom properties on document root
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-dark", colors.accentDark);
    root.style.setProperty("--accent-light", colors.accentLight);
    root.style.setProperty("--bg", colors.bg);
  }, [colors]);

  return (
    <ConfigContext.Provider
      value={{ orgName: data?.orgName || "Claw CRM", primaryColor, upcomingDays: data?.upcomingDays ?? 7, colors }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={CrmPage} />
      <ProtectedRoute path="/rules" component={RulesPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/briefings/:contactId" component={BriefingPage} />
      <ProtectedRoute path="/journal/:contactId" component={JournalPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/setup" component={SetupPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PrivacyScreen() {
  const { orgName } = useConfig();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handleBlur = () => setHidden(true);
    const handleFocus = () => setHidden(false);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  if (!hidden) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1
        style={{
          color: "white",
          fontSize: "18px",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        {orgName}
      </h1>
    </div>
  );
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem("claw-theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });

  // System-preference media query, recalculated on change.
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Apply class to <html> so Tailwind `dark:` variants work for the few
  // class-literal surfaces that don't go through useColors().
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [resolved]);

  const setTheme = (t: ThemePref) => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      if (t === "system") window.localStorage.removeItem("claw-theme");
      else window.localStorage.setItem("claw-theme", t);
    }
  };

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfigProvider>
          <AuthProvider>
            <Toaster />
            <PrivacyScreen />
            <Router />
          </AuthProvider>
        </ConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
