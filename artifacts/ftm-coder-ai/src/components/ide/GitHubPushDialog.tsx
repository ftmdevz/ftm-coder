import React, { useState } from "react";
import { Github, X, Loader2, CheckCircle2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGitPush } from "@workspace/api-client-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspace: string;
};

export function GitHubPushDialog({ isOpen, onClose, workspace }: Props) {
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const push = useGitPush();

  const handlePush = () => {
    if (!repoUrl || !token) return;
    setResult(null);
    push.mutate(
      { data: { workspace, repoUrl, token, branch } },
      {
        onSuccess: (data) => setResult({ ok: true, msg: data.message || "Pushed successfully!" }),
        onError: (err) => setResult({ ok: false, msg: err instanceof Error ? err.message : String(err) }),
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-[460px] max-w-[95vw] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Push to GitHub</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
          <p>Need a token? Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">GitHub → Settings → Tokens <ExternalLink className="h-3 w-3" /></a></p>
          <p>Select <strong className="text-foreground">repo</strong> scope, generate, and paste below.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">Repository URL</label>
            <Input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/yourname/your-repo"
              className="text-xs h-8"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">Personal Access Token</label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="text-xs h-8 pr-9"
              />
              <button
                onClick={() => setShowToken(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">Branch</label>
            <Input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="main"
              className="text-xs h-8 w-32"
            />
          </div>

          {result && (
            <div className={`flex items-start gap-2 text-xs p-2.5 rounded border ${result.ok ? "bg-green-950/40 text-green-400 border-green-900" : "bg-red-950/30 text-red-400 border-red-900"}`}>
              {result.ok && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <span className="break-all">{result.msg}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs flex-1 gap-1.5"
            onClick={handlePush}
            disabled={push.isPending || !repoUrl || !token}
          >
            {push.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pushing...</>
            ) : (
              <><Github className="h-3.5 w-3.5" /> Push to GitHub</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
