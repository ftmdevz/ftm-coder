import React, { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useGetGitStatus, useGitCommit, getGetGitStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Square, GitBranch, Settings, LayoutPanelLeft, Terminal } from "lucide-react";

export function TopBar() {
  const { workspacePath, setWorkspacePath } = useWorkspace();
  const [pathInput, setPathInput] = useState(workspacePath);
  const [commitMsg, setCommitMsg] = useState("");
  const [showCommit, setShowCommit] = useState(false);

  const { data: gitStatus } = useGetGitStatus({ workspace: workspacePath }, {
    query: { enabled: !!workspacePath, queryKey: getGetGitStatusQueryKey({ workspace: workspacePath }) }
  });

  const commit = useGitCommit();

  const handleOpen = () => {
    setWorkspacePath(pathInput);
  };

  const handleCommit = () => {
    if (!commitMsg) return;
    commit.mutate({ data: { message: commitMsg, workspace: workspacePath } }, {
      onSuccess: () => {
        setShowCommit(false);
        setCommitMsg("");
      }
    });
  };

  const dirtyFiles = gitStatus?.files?.length || 0;

  return (
    <div className="flex items-center h-12 border-b border-border bg-card px-4 shrink-0 justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-primary/20 border border-primary/30">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <h1 className="font-bold text-primary tracking-tight text-sm">FTM-CODER-AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            value={pathInput} 
            onChange={(e) => setPathInput(e.target.value)} 
            className="w-64 h-7 text-xs bg-background border-border"
            data-testid="input-workspace"
          />
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleOpen} data-testid="button-open-workspace">
            Open
          </Button>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <Play className="h-4 w-4 text-green-500" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <Square className="h-4 w-4 text-red-500" />
        </Button>
        
        <div className="h-4 w-px bg-border mx-2" />

        {showCommit ? (
          <div className="flex items-center gap-2">
            <Input 
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              className="h-7 text-xs w-48"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
            />
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleCommit}>
              Commit
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCommit(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-2 relative"
            onClick={() => setShowCommit(true)}
            data-testid="button-git"
          >
            <GitBranch className="h-4 w-4" />
            {dirtyFiles > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        )}

        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <LayoutPanelLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
