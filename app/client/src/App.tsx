import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route } from "wouter";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import CrmPage from "@/pages/crm-page";
import RulesPage from "@/pages/rules-page";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={CrmPage} />
      <ProtectedRoute path="/rules" component={RulesPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PrivacyScreen() {
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
        Magnetic Advisors
      </h1>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <PrivacyScreen />
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
