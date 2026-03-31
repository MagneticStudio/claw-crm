import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Copy, RefreshCw, Check } from "lucide-react";
import { Link } from "wouter";

const C = {
  text: "#1a2f2f", muted: "#5a7a7a", border: "#d4e8e8",
  accent: "#2bbcb3", accentDark: "#1a9e96", accentLight: "#e6f7f6",
};

export default function SettingsPage() {
  const { data: settings } = useQuery<{ orgName: string; apiKey: string; mcpToken: string }>({
    queryKey: ["/api/settings"],
  });

  const [orgName, setOrgName] = useState("");
  const [orgNameDirty, setOrgNameDirty] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Initialize orgName from settings
  if (settings && !orgNameDirty && orgName !== settings.orgName) {
    setOrgName(settings.orgName);
  }

  const updateOrgName = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("PUT", "/api/settings", { orgName: name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      setOrgNameDirty(false);
    },
  });

  const regenApiKey = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/regenerate-api-key");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const regenMcpToken = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/regenerate-mcp-token");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const changePin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/change-pin", { currentPin, newPin });
      if (!res.ok) { const body = await res.json(); throw new Error(body.message); }
      return res.json();
    },
    onSuccess: () => { setPinMessage("PIN changed"); setCurrentPin(""); setNewPin(""); },
    onError: (err: Error) => setPinMessage(err.message),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const mcpUrl = settings?.mcpToken
    ? `${window.location.origin}/mcp/${settings.mcpToken}`
    : "";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="transition-colors hover:opacity-70" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: C.text }}>Settings</h1>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5 space-y-4">
        {/* Org Name */}
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Organization Name</label>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: C.muted }}>Displayed in header, login screen, and PWA.</p>
          <div className="flex gap-2">
            <input
              value={orgName}
              onChange={(e) => { setOrgName(e.target.value); setOrgNameDirty(true); }}
              className="flex-1 text-sm rounded-lg px-3 py-1.5 outline-none"
              style={{ border: `1px solid ${C.border}`, color: C.text }}
            />
            <button
              onClick={() => updateOrgName.mutate(orgName)}
              disabled={!orgNameDirty}
              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ backgroundColor: C.accentDark }}
            >Save</button>
          </div>
        </div>

        {/* MCP Connection */}
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>MCP Connection</label>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: C.muted }}>Use this URL in Claude's custom connectors to connect AI agents.</p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-[11px] font-mono bg-stone-50 rounded px-2 py-1.5 break-all" style={{ color: C.text }}>
              {mcpUrl || "Loading..."}
            </code>
            <button onClick={() => copyToClipboard(mcpUrl, "mcp")} className="flex-shrink-0 p-1.5 rounded hover:opacity-70" style={{ color: C.accentDark }}>
              {copied === "mcp" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={() => regenMcpToken.mutate()} className="text-[11px] flex items-center gap-1 hover:opacity-70" style={{ color: C.muted }}>
            <RefreshCw className="h-3 w-3" /> Regenerate token
          </button>
        </div>

        {/* API Key */}
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>API Key</label>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: C.muted }}>For direct REST API access via X-API-Key header.</p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-[11px] font-mono bg-stone-50 rounded px-2 py-1.5 break-all" style={{ color: C.text }}>
              {settings?.apiKey || "Loading..."}
            </code>
            <button onClick={() => copyToClipboard(settings?.apiKey || "", "api")} className="flex-shrink-0 p-1.5 rounded hover:opacity-70" style={{ color: C.accentDark }}>
              {copied === "api" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={() => regenApiKey.mutate()} className="text-[11px] flex items-center gap-1 hover:opacity-70" style={{ color: C.muted }}>
            <RefreshCw className="h-3 w-3" /> Regenerate key
          </button>
        </div>

        {/* Change PIN */}
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Change PIN</label>
          <div className="flex gap-2 mt-2">
            <input
              type="password" inputMode="numeric" maxLength={6} placeholder="Current"
              value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              className="w-24 text-sm text-center rounded-lg px-2 py-1.5 outline-none font-mono"
              style={{ border: `1px solid ${C.border}`, color: C.text }}
            />
            <input
              type="password" inputMode="numeric" maxLength={6} placeholder="New"
              value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              className="w-24 text-sm text-center rounded-lg px-2 py-1.5 outline-none font-mono"
              style={{ border: `1px solid ${C.border}`, color: C.text }}
            />
            <button
              onClick={() => changePin.mutate()}
              disabled={currentPin.length < 4 || newPin.length < 4}
              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ backgroundColor: C.accentDark }}
            >Change</button>
          </div>
          {pinMessage && <p className="text-xs mt-1" style={{ color: pinMessage === "PIN changed" ? C.accentDark : "#c0392b" }}>{pinMessage}</p>}
        </div>

      </main>
    </div>
  );
}
