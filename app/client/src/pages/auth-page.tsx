import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [, navigate] = useLocation();
  const { user, needsSetup, loginMutation, setupMutation } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pin.length < 4 || pin.length > 6) {
      setError("PIN must be 4-6 digits");
      return;
    }

    if (needsSetup) {
      setupMutation.mutate({ pin }, {
        onSuccess: (data) => setApiKey(data.apiKey),
        onError: (err) => setError(err.message),
      });
    } else {
      loginMutation.mutate({ pin }, {
        onError: (err) => setError(err.message),
      });
    }
  };

  const isPending = loginMutation.isPending || setupMutation.isPending;

  if (apiKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4"
        style={{ background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)" }}>
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-lg font-semibold" style={{ color: "#1a2f2f" }}>Setup Complete</h1>
          <p className="text-sm mt-1" style={{ color: "#5a7a7a" }}>Save your API key for agent access:</p>
          <code className="block p-3 rounded-lg text-xs break-all font-mono mt-4 mb-4"
            style={{ backgroundColor: "#e6f7f6", color: "#1a9e96" }}>{apiKey}</code>
          <p className="text-xs mb-6" style={{ color: "#5a7a7a" }}>This won't be shown again.</p>
          <button onClick={() => navigate("/")}
            className="w-full text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "#2bbcb3" }}>
            Continue to CRM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4"
      style={{ background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)" }}>
      <div className="w-full max-w-sm p-8 text-center">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-[0.2em] text-white uppercase">Magnetic Advisors</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>
            {needsSetup ? "Set your PIN" : "Enter PIN"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="____"
            className="w-full text-center text-2xl tracking-[0.5em] py-3 outline-none font-mono text-white placeholder:text-white/40"
            style={{
              backgroundColor: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: "10px",
            }}
            autoComplete="off"
          />

          {error && <p className="text-white/90 text-sm bg-white/20 rounded-lg py-1.5 px-3">{error}</p>}

          <button
            type="submit"
            disabled={isPending || pin.length < 4}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.95)", color: "#1a9e96" }}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : needsSetup ? "Set PIN" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
