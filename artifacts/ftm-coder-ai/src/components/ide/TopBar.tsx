import React, { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useGetGitStatus, useGitCommit, getGetGitStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play, Square, GitBranch, Settings, Terminal,
  Github, Download, PanelRight, PanelRightClose,
  Loader2, Bot, Cpu,
} from "lucide-react";
import { AISettingsDialog, loadAIConfig, type AIConfig } from "./AISettings";
import { GitHubPushDialog } from "./GitHubPushDialog";

type Props = {
  showTerminal: boolean;
  showChat: boolean;
  onToggleTerminal: () => void;
  onToggleChat: () => void;
};

export function TopBar({ showTerminal, showChat, onToggleTerminal, onToggleChat }: Props) {
  const { workspacePath, setWorkspacePath, sendToTerminal, killTerminal } = useWorkspace();
  const [pathInput, setPathInput] = useState(workspacePath);
  const [commitMsg, setCommitMsg] = useState("");
  const [showCommit, setShowCommit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [serverConfig, setServerConfig] = useState<AIConfig | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "ok" | "offline">("checking");
  const [installingOllama, setInstallingOllama] = useState(false);

  useEffect(() => {
    fetch("/api/chat/config")
      .then(r => r.json())
      .then((c: AIConfig) => setServerConfig(c))
      .catch(() => {});
  }, []);

  // Poll Ollama status every 8 seconds
  const checkOllama = useCallback(() => {
    fetch("/api/ai/status")
      .then(r => r.json())
      .then((d: { ok: boolean }) => setOllamaStatus(d.ok ? "ok" : "offline"))
      .catch(() => setOllamaStatus("offline"));
  }, []);

  useEffect(() => {
    checkOllama();
    const id = setInterval(checkOllama, 8000);
    return () => clearInterval(id);
  }, [checkOllama]);

  const handleInstallOllama = () => {
    if (!showTerminal) onToggleTerminal();
    setInstallingOllama(true);
    // Send environment-aware install + pull command to terminal
    const model = "glm4";
    const installCmd = `
if command -v ollama > /dev/null 2>&1; then
  echo "✅ Ollama already installed: $(ollama --version)"
elif command -v nix-env > /dev/null 2>&1; then
  echo "📦 Installing Ollama via Nix..."
  nix-env -iA nixpkgs.ollama
elif command -v brew > /dev/null 2>&1; then
  echo "📦 Installing Ollama via Homebrew..."
  brew install ollama
else
  echo "📦 Installing Ollama via installer script..."
  curl -fsSL https://ollama.com/install.sh | sh
fi && echo "📥 Starting Ollama and pulling ${model}..." && ollama serve &>/dev/null & sleep 2 && ollama pull ${model} && echo "✅ Done! Ollama + ${model} ready."
`.trim();
    sendToTerminal(installCmd + "\n");
    // Re-check status after a delay
    setTimeout(() => { checkOllama(); setInstallingOllama(false); }, 5000);
  };

  const { data: gitStatus } = useGetGitStatus({ workspace: workspacePath }, {
    query: { enabled: !!workspacePath, queryKey: getGetGitStatusQueryKey({ workspace: workspacePath }) }
  });

  const commit = useGitCommit();

  const handleOpen = () => setWorkspacePath(pathInput);

  const handleCommit = () => {
    if (!commitMsg) return;
    commit.mutate({ data: { message: commitMsg, workspace: workspacePath } }, {
      onSuccess: () => { setShowCommit(false); setCommitMsg(""); }
    });
  };

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);

    // Show terminal if hidden
    if (!showTerminal) onToggleTerminal();

    // Detect run command from workspace
    try {
      const r = await fetch(`/api/files/content?path=package.json&workspace=${encodeURIComponent(workspacePath)}`);
      if (r.ok) {
        const d = await r.json() as { content: string };
        const pkg = JSON.parse(d.content) as { scripts?: Record<string, string> };
        const scripts = pkg.scripts || {};
        const cmd = scripts["dev"] ? "npm run dev" : scripts["start"] ? "npm start" : "npm run dev";
        sendToTerminal(cmd + "\n");
        return;
      }
    } catch { /* not a node project */ }

    // Try python
    try {
      const r = await fetch(`/api/files?workspace=${encodeURIComponent(workspacePath)}`);
      if (r.ok) {
        const d = await r.json() as { files: Array<{ name: string }> };
        const hasPy = d.files.some(f => f.name.endsWith(".py") || f.name === "main.py");
        if (hasPy) {
          const mainPy = d.files.find(f => f.name === "main.py") ? "main.py" :
            d.files.find(f => f.name.endsWith(".py"))?.name || "main.py";
          sendToTerminal(`python3 ${mainPy}\n`);
          return;
        }
      }
    } catch { /* ignore */ }

    // Default: open shell
    sendToTerminal("\n");
  };

  const handleStop = () => {
    killTerminal();
    setIsRunning(false);
  };

  const handleDownloadZip = () => {
    const url = `/api/workspace/download?workspace=${encodeURIComponent(workspacePath)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const dirtyFiles = gitStatus?.files?.length || 0;

  return (
    <>
      <div className="flex items-center h-11 border-b border-border bg-card px-3 shrink-0 justify-between select-none">
        {/* Left: Logo + workspace */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-primary/20 border border-primary/30">
              <Terminal className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-bold text-primary tracking-tight text-xs whitespace-nowrap">FTM-CODER-AI</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="w-56 h-6 text-xs bg-background/60 border-border/60 font-mono"
              onKeyDown={e => e.key === "Enter" && handleOpen()}
              data-testid="input-workspace"
            />
            <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" onClick={handleOpen} data-testid="button-open-workspace">
              Open
            </Button>
          </div>
        </div>

        {/* Center: Run controls + Ollama AI button */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRun}
            title="Run project"
            className="flex items-center gap-1.5 px-2.5 h-6 rounded text-xs font-medium bg-green-600/20 text-green-400 border border-green-700/40 hover:bg-green-600/30 transition-colors"
          >
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
            Run
          </button>
          <button
            onClick={handleStop}
            title="Stop (Ctrl+C)"
            className="flex items-center gap-1.5 px-2 h-6 rounded text-xs font-medium bg-red-600/10 text-red-400 border border-red-700/30 hover:bg-red-600/20 transition-colors"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          {/* Ollama / AI status indicator + one-click installer */}
          {ollamaStatus === "ok" ? (
            <button
              onClick={checkOllama}
              title="Ollama AI is running ✅ — click to refresh status"
              className="flex items-center gap-1.5 px-2.5 h-6 rounded text-xs font-medium bg-violet-600/15 text-violet-300 border border-violet-700/30 hover:bg-violet-600/25 transition-colors"
            >
              <Cpu className="h-3 w-3" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              AI
            </button>
          ) : ollamaStatus === "checking" ? (
            <button
              disabled
              className="flex items-center gap-1.5 px-2.5 h-6 rounded text-xs font-medium bg-muted/40 text-muted-foreground border border-border/40 cursor-wait"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              AI
            </button>
          ) : (
            <button
              onClick={handleInstallOllama}
              disabled={installingOllama}
              title="Ollama not detected — click to install Ollama + pull glm4 in terminal"
              className="flex items-center gap-1.5 px-2.5 h-6 rounded text-xs font-medium bg-amber-600/15 text-amber-300 border border-amber-700/30 hover:bg-amber-600/25 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {installingOllama
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Bot className="h-3 w-3" />}
              {installingOllama ? "Installing…" : "Install AI"}
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5">
          {/* Git commit inline */}
          {showCommit ? (
            <div className="flex items-center gap-1.5 mr-1">
              <Input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                className="h-6 text-xs w-40"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCommit()}
              />
              <Button size="sm" variant="default" className="h-6 text-[11px] px-2" onClick={handleCommit}
                disabled={commit.isPending}>
                {commit.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Commit"}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[11px] px-1.5" onClick={() => setShowCommit(false)}>✕</Button>
            </div>
          ) : (
            <button
              className="relative flex items-center h-7 w-7 justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={() => setShowCommit(true)}
              title="Git commit"
              data-testid="button-git"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {dirtyFiles > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </button>
          )}

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          <button
            onClick={handleDownloadZip}
            title="Download workspace as ZIP"
            className="flex items-center h-7 w-7 justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setShowGitHub(true)}
            title="Push to GitHub"
            className="flex items-center h-7 w-7 justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          <button
            onClick={onToggleChat}
            title={showChat ? "Hide AI panel" : "Show AI panel"}
            className={`flex items-center h-7 w-7 justify-center rounded transition-colors ${showChat ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
          >
            {showChat ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            title="AI Provider Settings"
            className="flex items-center h-7 w-7 justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <AISettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} serverConfig={serverConfig} />
      <GitHubPushDialog isOpen={showGitHub} onClose={() => setShowGitHub(false)} workspace={workspacePath} />
    </>
  );
}
