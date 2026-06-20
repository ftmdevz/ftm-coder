import React, { useState, useEffect } from "react";
import { Settings, X, Eye, EyeOff, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

const LS_KEY = "ftm-ai-config";

export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as AIConfig;
  } catch { /* ignore */ }
  return null;
}

export function saveAIConfig(cfg: AIConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

const PROVIDERS = [
  { label: "OmniRoute (local)", baseURL: "http://localhost:20128/v1", hint: "Run: npm install -g omniroute && omniroute" },
  { label: "OmniRoute (cloud)", baseURL: "https://omniroute.online/v1", hint: "Sign in at omniroute.online for a dashboard key" },
  { label: "AgentRouter", baseURL: "https://agentrouter.org/v1", hint: "Get key at agentrouter.org" },
  { label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", hint: "Get free key at openrouter.ai" },
  { label: "OpenAI", baseURL: "https://api.openai.com/v1", hint: "Get key at platform.openai.com" },
];

const SUGGESTED_MODELS = [
  "nex-agi/nex-n2-pro:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "mistralai/devstral-small:free",
  "microsoft/phi-4-reasoning:free",
];

type Status = "idle" | "testing" | "ok" | "error";

export function AISettingsDialog({
  isOpen,
  onClose,
  serverConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  serverConfig: AIConfig | null;
}) {
  const [cfg, setCfg] = useState<AIConfig>({ apiKey: "", baseURL: "http://localhost:20128/v1", model: "gpt-4o" });
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const activeProvider = PROVIDERS.find(p => p.baseURL === cfg.baseURL);

  useEffect(() => {
    if (!isOpen) return;
    const stored = loadAIConfig();
    if (stored) { setCfg(stored); return; }
    if (serverConfig) setCfg({ ...serverConfig, apiKey: serverConfig.apiKey ? "••••••••••••" : "" });
  }, [isOpen, serverConfig]);

  const handleSave = () => {
    saveAIConfig(cfg);
    onClose();
    window.location.reload();
  };

  const handleTest = async () => {
    setStatus("testing");
    setStatusMsg("");
    try {
      const key = cfg.apiKey.startsWith("••") ? serverConfig?.apiKey || "" : cfg.apiKey;
      const resp = await fetch(`${cfg.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
          "x-api-key": key,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "user", content: "say ok" }],
          max_tokens: 5,
        }),
      });
      const text = await resp.text();
      if (resp.ok) {
        const data = JSON.parse(text) as { choices?: unknown[] };
        if (data.choices && data.choices.length > 0) {
          setStatus("ok");
          setStatusMsg("Connection successful!");
        } else {
          setStatus("error");
          setStatusMsg("Connected but got empty response. Try a different model.");
        }
      } else {
        let errMsg = text.slice(0, 200);
        try { const e = JSON.parse(text) as { error?: { message?: string }; message?: string }; errMsg = e?.error?.message || e?.message || errMsg; } catch { /* keep raw */ }
        setStatus("error");
        setStatusMsg(`Error ${resp.status}: ${errMsg}`);
      }
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-[500px] max-w-[95vw] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">AI Provider Settings</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* OmniRoute banner */}
        <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-pink-950/40 to-purple-950/40 border border-pink-900/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-pink-300 mb-0.5">Recommended: OmniRoute</p>
              <p className="text-xs text-muted-foreground">Free AI gateway with 160+ providers. Run locally in 6 seconds:</p>
              <code className="text-xs text-pink-200 mt-1 block font-mono">npm install -g omniroute &amp;&amp; omniroute</code>
            </div>
            <a href="https://github.com/diegosouzapw/OmniRoute" target="_blank" rel="noopener noreferrer" className="shrink-0 text-pink-400 hover:text-pink-300">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="space-y-4">
          {/* Provider quick-select */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Provider</label>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map(p => (
                <button
                  key={p.baseURL}
                  onClick={() => setCfg(prev => ({ ...prev, baseURL: p.baseURL }))}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${cfg.baseURL === p.baseURL ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {activeProvider && (
              <p className="text-xs text-muted-foreground mt-1.5 opacity-60">{activeProvider.hint}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Base URL</label>
            <Input
              value={cfg.baseURL}
              onChange={e => setCfg(p => ({ ...p, baseURL: e.target.value }))}
              placeholder="http://localhost:20128/v1"
              className="text-xs h-8"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">API Key / Dashboard Key</label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={cfg.apiKey}
                onChange={e => setCfg(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="Leave blank if not required..."
                className="text-xs h-8 pr-9"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 opacity-60">
              {cfg.baseURL.includes("localhost") ? "OmniRoute local: find your key in the dashboard at localhost:20128/dashboard" : serverConfig?.apiKey ? "Server has a key configured. Paste here to override." : "Paste your API key here."}
            </p>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Model</label>
            <Input
              value={cfg.model}
              onChange={e => setCfg(p => ({ ...p, model: e.target.value }))}
              placeholder="e.g. gpt-4o"
              className="text-xs h-8"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SUGGESTED_MODELS.map(m => (
                <button
                  key={m}
                  onClick={() => setCfg(p => ({ ...p, model: m }))}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${cfg.model === m ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {status !== "idle" && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded ${status === "ok" ? "bg-green-950/40 text-green-400 border border-green-900" : status === "error" ? "bg-red-950/30 text-red-400 border border-red-900" : "bg-muted text-muted-foreground border border-border"}`}>
              {status === "testing" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
              {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              <span className="break-all">{status === "testing" ? "Testing connection..." : statusMsg}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={handleTest} disabled={status === "testing"}>
            {status === "testing" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing...</> : "Test Connection"}
          </Button>
          <Button size="sm" className="h-8 text-xs flex-1" onClick={handleSave}>
            Save & Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
