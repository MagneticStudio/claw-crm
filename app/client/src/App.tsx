import { useState, useEffect, createContext, useContext } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route } from "wouter";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import CrmPage from "@/pages/crm-page";
import RulesPage from "@/pages/rules-page";
import SettingsPage from "@/pages/settings-page";
import AuthPage from "@/pages/auth-page";
import BriefingPage from "@/pages/briefing-page";
import SetupPage from "@/pages/setup-page";
import NotFound from "@/pages/not-found";

// App config context — org name from DB
export interface PluginBadge {
  dataKey: string;
  icon: string;
  route: string;
  tooltip?: string;
}

// Derive color variants from a hex primary color
function deriveColors(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const darken = (amt: number) => `#${[r,g,b].map(c => Math.max(0, Math.round(c * (1 - amt))).toString(16).padStart(2, "0")).join("")}`;
  const lighten = (amt: number) => `#${[r,g,b].map(c => Math.min(255, Math.round(c + (255 - c) * amt)).toString(16).padStart(2, "0")).join("")}`;
  return {
    accent: hex,
    accentDark: darken(0.15),
    accentLight: lighten(0.9),
    bg: lighten(0.95),
  };
}

interface AppConfig { orgName: string; primaryColor: string; badges: PluginBadge[]; colors: ReturnType<typeof deriveColors> }

const defaultColors = deriveColors("#2bbcb3");
const ConfigContext = createContext<AppConfig>({ orgName: "Claw CRM", primaryColor: "#2bbcb3", badges: [], colors: defaultColors });
export function useConfig() { return useContext(ConfigContext); }

// Static palette colors that don't change with the primary color
const STATIC_COLORS = {
  text: "#1a2f2f", muted: "#5a7a7a", border: "#d4e8e8",
  stale: "#d4880f", staleBg: "#fef7ec", red: "#c0392b", redBg: "#fde8e8",
} as const;

/** Dynamic accent colors + static palette. Use instead of hardcoded C = {...} objects. */
export function useColors() {
  const { colors } = useContext(ConfigContext);
  return { ...STATIC_COLORS, ...colors };
}

function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<{ orgName: string; primaryColor: string; badges: PluginBadge[] }>({
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
    <ConfigContext.Provider value={{ orgName: data?.orgName || "Claw CRM", primaryColor, badges: data?.badges || [], colors }}>
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
    return () => { window.removeEventListener("blur", handleBlur); window.removeEventListener("focus", handleFocus); };
  }, []);

  if (!hidden) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ color: "white", fontSize: "18px", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif" }}>
        {orgName}
      </h1>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AuthProvider>
          <Toaster />
          <PrivacyScreen />
          <Router />
        </AuthProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
