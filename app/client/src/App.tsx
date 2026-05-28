import { useState, useEffect, createContext, useContext } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route } from "wouter";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { ThemeProvider, useTheme } from "./hooks/use-theme";
import { paletteFor, LIGHT_PALETTE_DEFAULT, type Palette } from "./lib/theme";

import CrmPage from "@/pages/crm-page";
import RulesPage from "@/pages/rules-page";
import SettingsPage from "@/pages/settings-page";
import AuthPage from "@/pages/auth-page";
import BriefingPage from "@/pages/briefing-page";
import JournalPage from "@/pages/journal-page";
import SetupPage from "@/pages/setup-page";
import NotFound from "@/pages/not-found";

interface AppConfig {
  orgName: string;
  primaryColor: string;
  upcomingDays: number;
}

const ConfigContext = createContext<AppConfig>({
  orgName: "Claw CRM",
  primaryColor: "#2bbcb3",
  upcomingDays: 7,
});
export function useConfig() {
  return useContext(ConfigContext);
}

/** Theme-aware palette: brand accent + semantic surfaces (text/muted/border/bg/...). */
export function useColors(): Palette {
  const { primaryColor } = useContext(ConfigContext);
  const { resolved } = useTheme();
  return paletteFor(resolved, primaryColor);
}

/** Always-light palette — for surfaces pinned to the branded gradient
 *  (Auth, Setup, PrivacyScreen) regardless of theme. */
export const lightColors = LIGHT_PALETTE_DEFAULT;

function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<{ orgName: string; primaryColor: string; upcomingDays: number }>({
    queryKey: ["/api/config"],
    staleTime: 60_000,
  });
  const primaryColor = data?.primaryColor || "#2bbcb3";
  const { resolved } = useTheme();

  // Expose accent CSS custom properties so any consumer using
  // `var(--accent)` keeps working. Values are theme-aware.
  useEffect(() => {
    const root = document.documentElement;
    const p = paletteFor(resolved, primaryColor);
    root.style.setProperty("--accent-color", p.accent);
    root.style.setProperty("--accent-dark", p.accentDark);
    root.style.setProperty("--accent-light", p.accentLight);
    root.style.setProperty("--bg-color", p.bg);
    root.style.setProperty("--app-highlight", p.highlight);
  }, [primaryColor, resolved]);

  return (
    <ConfigContext.Provider
      value={{ orgName: data?.orgName || "Claw CRM", primaryColor, upcomingDays: data?.upcomingDays ?? 7 }}
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
