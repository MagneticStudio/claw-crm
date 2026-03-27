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
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-stone-50">
        <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border p-8 text-center">
          <h1 className="text-xl font-semibold text-stone-800 mb-2">Setup Complete</h1>
          <p className="text-sm text-stone-500 mb-4">Save your API key for agent access:</p>
          <code className="block bg-stone-100 p-3 rounded text-xs break-all font-mono mb-4">{apiKey}</code>
          <p className="text-xs text-stone-400 mb-6">This won't be shown again.</p>
          <button onClick={() => navigate("/")} className="w-full bg-stone-900 text-white py-2 rounded-md text-sm hover:bg-stone-800">
            Continue to CRM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-stone-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border p-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-stone-800 tracking-tight">MAGNETIC ADVISORS</h1>
          <p className="text-sm text-stone-400 mt-1">{needsSetup ? "Set your PIN" : "Enter PIN"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="____"
            className="w-full text-center text-2xl tracking-[0.5em] py-3 border-b-2 border-stone-200 focus:border-stone-900 outline-none bg-transparent font-mono"
            autoComplete="off"
          />

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={isPending || pin.length < 4}
            className="w-full bg-stone-900 text-white py-2.5 rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : needsSetup ? "Set PIN" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
