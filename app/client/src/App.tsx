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
import NotFound from "@/pages/not-found";

// App config context — org name from DB
const ConfigContext = createContext<{ orgName: string }>({ orgName: "Claw CRM" });
export function useConfig() { return useContext(ConfigContext); }

function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<{ orgName: string }>({
    queryKey: ["/api/config"],
    staleTime: 60_000,
  });
  return (
    <ConfigContext.Provider value={{ orgName: data?.orgName || "Claw CRM" }}>
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
      <Route path="/auth" component={AuthPage} />
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
