import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Copy, Check } from "lucide-react";
import { useColors } from "@/App";

export default function SetupPage() {
  const C = useColors();
  const [step, setStep] = useState<"pin" | "connect">("pin");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();
  const { user, setupMutation } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const handleSetPin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pin.length < 4 || pin.length > 6) {
      setError("PIN must be 4-6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match");
      return;
    }

    setupMutation.mutate({ pin }, {
      onSuccess: (data: any) => {
        setApiKey(data.apiKey);
        setMcpToken(data.mcpToken);
        setStep("connect");
      },
      onError: (err: any) => setError(err.message),
    });
  };

  const mcpUrl = mcpToken ? `${window.location.origin}/mcp/${mcpToken}` : "";

  const copyMcpUrl = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === "connect") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)" }}>
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-lg font-semibold mb-1" style={{ color: C.text }}>Connect Your AI Agent</h1>
          <p className="text-sm mb-6" style={{ color: C.muted }}>Your CRM is ready. Connect an AI agent to manage it.</p>

          {/* MCP URL */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>MCP URL</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 text-[11px] font-mono rounded-lg px-3 py-2 break-all" style={{ backgroundColor: C.accentLight, color: C.text }}>
                {mcpUrl}
              </code>
              <button onClick={copyMcpUrl} className="flex-shrink-0 p-2 rounded-lg hover:opacity-70" style={{ color: C.accentDark }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Agent instructions */}
          <div className="space-y-4 text-sm" style={{ color: C.text }}>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#f8f9fa" }}>
              <p className="font-semibold mb-1">Claude (Web / Desktop / Mobile)</p>
              <p className="text-xs" style={{ color: C.muted }}>Settings → Custom Connectors → Add → paste MCP URL → leave OAuth blank → Add</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#f8f9fa" }}>
              <p className="font-semibold mb-1">Claude Code</p>
              <p className="text-xs font-mono" style={{ color: C.muted }}>Add to ~/.claude/settings.json mcpServers</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#f8f9fa" }}>
              <p className="font-semibold mb-1">OpenClaw</p>
              <p className="text-xs" style={{ color: C.muted }}>Add the MCP URL to your openclaw config under mcp.servers</p>
            </div>
          </div>

          <button
            onClick={() => navigate("/")}
            className="w-full mt-6 text-white py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: C.accentDark }}
          >
            I've connected my agent →
          </button>

          <button
            onClick={() => navigate("/")}
            className="w-full mt-2 py-2 text-xs"
            style={{ color: C.muted }}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #2bbcb3, #30bfb7, #3cc8c0)" }}>
      <div className="w-full max-w-sm p-8 text-center">
        <h1 className="text-xl font-semibold tracking-[0.15em] text-white uppercase mb-1">Claw CRM</h1>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.7)" }}>Welcome. Set your PIN to get started.</p>

        <form onSubmit={handleSetPin} className="space-y-4">
          <div>
            <label className="text-xs text-white/70 block mb-1 text-left">Choose a PIN (4-6 digits)</label>
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
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "10px" }}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs text-white/70 block mb-1 text-left">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              placeholder="____"
              className="w-full text-center text-2xl tracking-[0.5em] py-3 outline-none font-mono text-white placeholder:text-white/40"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "10px" }}
              autoComplete="off"
            />
          </div>

          {error && <p className="text-white/90 text-sm bg-white/20 rounded-lg py-1.5 px-3">{error}</p>}

          <button
            type="submit"
            disabled={setupMutation.isPending || pin.length < 4 || confirmPin.length < 4}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.95)", color: C.accentDark }}
          >
            {setupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set PIN & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
