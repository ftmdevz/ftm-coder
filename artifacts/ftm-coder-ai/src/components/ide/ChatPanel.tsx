import React, { useState, useRef, useEffect, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useApplyChanges, useListFiles, getListFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Check, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PendingChange = {
  path: string;
  content: string;
  originalContent: string;
  type: "create" | "modify" | "delete";
  diff: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  pendingChanges?: PendingChange[];
  toolCallsUsed?: number;
};

type AgentConfig = { apiKey: string; baseURL: string; model: string } | null;

const EXAMPLE_PROMPTS = [
  "Explain the structure of this project",
  "Read package.json and summarize the dependencies",
  "Find all TODO comments in the codebase",
  "What files are in the src directory?",
];

const MAX_TOOL_CALLS = 20;
const MAX_FILE_CHARS = 6000;

function simpleDiff(oldContent: string, newContent: string, filePath: string): string {
  const old = oldContent.split("\n");
  const next = newContent.split("\n");
  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`, "@@ changes @@"];
  let changed = false;
  const len = Math.max(old.length, next.length);
  for (let i = 0; i < len; i++) {
    const o = i < old.length ? old[i] : null;
    const n = i < next.length ? next[i] : null;
    if (o !== n) {
      changed = true;
      if (o !== null) lines.push(`-${o}`);
      if (n !== null) lines.push(`+${n}`);
    }
  }
  return changed ? lines.join("\n") : "";
}

function DiffBlock({ diff, filePath }: { diff: string; filePath: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1 rounded border border-border overflow-hidden text-xs font-mono">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 text-left transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-muted-foreground truncate">{filePath}</span>
      </button>
      {expanded && (
        <div className="overflow-x-auto max-h-56 bg-black/80">
          {diff.split("\n").map((line, i) => {
            let cls = "text-gray-300";
            if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-green-400 bg-green-950/40";
            else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400 bg-red-950/40";
            else if (line.startsWith("@@")) cls = "text-blue-400";
            return <div key={i} className={`px-3 py-px whitespace-pre ${cls}`}>{line || " "}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function ChangeCard({ change, onAccept, onReject }: { change: PendingChange; onAccept: () => void; onReject: () => void }) {
  const colors: Record<string, string> = { create: "text-green-400", modify: "text-amber-400", delete: "text-red-400" };
  return (
    <div className="rounded border border-border bg-card/50 p-2 mb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${colors[change.type] || ""}`}>{change.type}</span>
        <div className="flex gap-1">
          <button onClick={onAccept} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 transition-colors">
            <Check className="h-3 w-3" /> Accept
          </button>
          <button onClick={onReject} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-900/20 text-red-400 border border-red-900 hover:bg-red-900/40 transition-colors">
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      </div>
      <DiffBlock diff={change.diff || change.content} filePath={change.path} />
    </div>
  );
}

function MessageBubble({ msg, onApplyChanges }: { msg: ChatMessage; onApplyChanges: (c: PendingChange[]) => void }) {
  const isUser = msg.role === "user";
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const changes = msg.pendingChanges || [];
  const remaining = changes.filter((_, i) => !dismissed.has(i) && !accepted.has(i));

  const accept = (idx: number) => {
    const c = changes[idx];
    if (c) { onApplyChanges([c]); setAccepted(p => new Set([...p, idx])); }
  };
  const acceptAll = () => {
    const idxs = remaining.map((r) => changes.indexOf(r));
    onApplyChanges(remaining);
    setAccepted(p => new Set([...p, ...idxs]));
  };
  const reject = (idx: number) => setDismissed(p => new Set([...p, idx]));

  return (
    <div className={`flex flex-col mb-4 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-full rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${isUser ? "bg-primary/20 text-foreground border border-primary/30 ml-4" : "bg-muted text-foreground border border-border mr-4"}`}>
        {msg.content}
      </div>
      {msg.toolCallsUsed !== undefined && msg.toolCallsUsed > 0 && (
        <span className="text-xs text-muted-foreground mt-1 px-1">{msg.toolCallsUsed} tool call{msg.toolCallsUsed !== 1 ? "s" : ""}</span>
      )}
      {changes.length > 0 && (
        <div className="w-full mt-2 px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{remaining.length} pending change{remaining.length !== 1 ? "s" : ""}</span>
            {remaining.length > 1 && (
              <button onClick={acceptAll} className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 transition-colors">Accept all</button>
            )}
          </div>
          {changes.map((change, idx) => {
            if (dismissed.has(idx)) return null;
            if (accepted.has(idx)) return <div key={idx} className="text-xs text-green-400 px-2 py-1 mb-1 opacity-60">Applied: {change.path}</div>;
            return <ChangeCard key={idx} change={change} onAccept={() => accept(idx)} onReject={() => reject(idx)} />;
          })}
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const { workspacePath, activeFile, chatHistory, addChatMessage, setChatHistory } = useWorkspace();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const applyChanges = useApplyChanges();

  // Fetch AgentRouter config once from the backend (key is stored server-side)
  useEffect(() => {
    fetch("/api/chat/config")
      .then(r => r.json())
      .then((c: AgentConfig) => setConfig(c))
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isThinking]);

  const callAgentRouter = useCallback(async (messages: unknown[], tools: unknown[]): Promise<{ message: unknown; finish_reason: string }> => {
    if (!config?.apiKey) throw new Error("AgentRouter API key not configured");
    const resp = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`AgentRouter error ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json() as { choices?: Array<{ message: unknown; finish_reason: string }> };
    if (!data.choices || data.choices.length === 0) {
      throw new Error(`AgentRouter returned no choices. Model "${config.model}" may not be supported.`);
    }
    return data.choices[0]!;
  }, [config]);

  const executeTool = useCallback(async (name: string, args: Record<string, string>): Promise<string> => {
    const ws = workspacePath;
    switch (name) {
      case "listFiles": {
        const dir = args["directory"] ? `&path=${encodeURIComponent(args["directory"])}` : "";
        const r = await fetch(`/api/files?workspace=${encodeURIComponent(ws)}${dir}`);
        const d = await r.json() as { files?: Array<{ path: string; type: string }> };
        if (!d.files) return "(empty)";
        const flat = (nodes: Array<{ path: string; type: string; children?: Array<{ path: string; type: string }> }>, depth = 0): string[] =>
          nodes.flatMap(n => [
            "  ".repeat(depth) + (n.type === "directory" ? `${n.path}/` : n.path),
            ...(n.type === "directory" && (n as any).children ? flat((n as any).children, depth + 1) : [])
          ]);
        return flat(d.files).slice(0, 300).join("\n") || "(empty)";
      }
      case "readFile": {
        const r = await fetch(`/api/files/content?path=${encodeURIComponent(args["path"]!)}&workspace=${encodeURIComponent(ws)}`);
        if (!r.ok) return `Error: File not found: ${args["path"]}`;
        const d = await r.json() as { content: string };
        const c = d.content || "";
        if (c.length <= MAX_FILE_CHARS) return c;
        return `[TRUNCATED - showing first ${MAX_FILE_CHARS} of ${c.length} chars]\n` + c.slice(0, MAX_FILE_CHARS);
      }
      case "runCommand": {
        const r = await fetch("/api/workspace/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: args["command"], workspace: ws }),
        });
        if (!r.ok) { const e = await r.json() as { error?: string }; return `Error: ${e.error}`; }
        const d = await r.json() as { stdout: string; stderr: string; exitCode: number };
        const out = (d.stdout + (d.stderr ? "\nSTDERR:\n" + d.stderr : "")).trim();
        return `Exit: ${d.exitCode}\n${(out || "(no output)").slice(0, 2000)}`;
      }
      case "getGitDiff": {
        const file = args["file"] ? `&file=${encodeURIComponent(args["file"])}` : "";
        const r = await fetch(`/api/git/diff?workspace=${encodeURIComponent(ws)}${file}`);
        const d = await r.json() as { diff: string };
        return (d.diff || "(no changes)").slice(0, 4000);
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }, [workspacePath]);

  const TOOLS = [
    { type: "function", function: { name: "listFiles", description: "List files and directories in the workspace.", parameters: { type: "object", properties: { directory: { type: "string", description: "Subdirectory to list (optional)" } } } } },
    { type: "function", function: { name: "readFile", description: "Read file content. Always read before editing.", parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } } } },
    { type: "function", function: { name: "writeFile", description: "Stage a new file for user review and approval.", parameters: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } } },
    { type: "function", function: { name: "editFile", description: "Edit a file by replacing specific text. Prefer over writeFile.", parameters: { type: "object", required: ["path", "oldText", "newText"], properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } } } } },
    { type: "function", function: { name: "runCommand", description: "Run a shell command.", parameters: { type: "object", required: ["command"], properties: { command: { type: "string" } } } } },
    { type: "function", function: { name: "getGitDiff", description: "Get the current git diff.", parameters: { type: "object", properties: { file: { type: "string" } } } } },
  ];

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isThinking) return;
    setInput("");
    if (!config) { addChatMessage({ role: "assistant", content: "Error: Could not load AI config from server." }); return; }

    const userMsg: ChatMessage = { role: "user", content: msg };
    addChatMessage(userMsg);
    setIsThinking(true);

    const pendingChanges: PendingChange[] = [];
    let toolCallsUsed = 0;

    // Build messages array for AgentRouter
    const apiHistory = chatHistory.map(m => ({ role: m.role, content: m.content }));
    const systemPrompt = `You are FTM-CODER-AI, an expert autonomous coding agent. Workspace: ${workspacePath}${activeFile ? `. Active file: ${activeFile}` : ""}.\n\nAlways read a file before editing it. Use editFile for targeted changes, writeFile for new files. Changes are staged for user review — nothing applies without approval. Be concise.`;
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      ...apiHistory,
      { role: "user", content: msg },
    ];

    try {
      while (toolCallsUsed < MAX_TOOL_CALLS) {
        const { message, finish_reason } = await callAgentRouter(messages, TOOLS);
        const assistantMsg = message as { role: string; content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> };
        messages.push(assistantMsg);

        if (finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) break;

        const toolResults: Array<Record<string, unknown>> = [];
        for (const tc of assistantMsg.tool_calls) {
          if (toolCallsUsed >= MAX_TOOL_CALLS) {
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: `[ABORTED] Max ${MAX_TOOL_CALLS} tool calls reached.` });
            break;
          }
          toolCallsUsed++;
          let result = "";
          try {
            const args = JSON.parse(tc.function.arguments || "{}") as Record<string, string>;

            if (tc.function.name === "writeFile") {
              // Stage locally — never auto-apply
              const { path: fp, content } = args;
              let originalContent = "";
              let changeType: "create" | "modify" = "create";
              try {
                const r = await fetch(`/api/files/content?path=${encodeURIComponent(fp!)}&workspace=${encodeURIComponent(workspacePath)}`);
                if (r.ok) { const d = await r.json() as { content: string }; originalContent = d.content; changeType = "modify"; }
              } catch { /* new file */ }
              const diff = simpleDiff(originalContent, content!, fp!);
              const existing = pendingChanges.findIndex(c => c.path === fp);
              if (existing >= 0) { pendingChanges[existing]!.content = content!; pendingChanges[existing]!.diff = diff; }
              else pendingChanges.push({ path: fp!, content: content!, originalContent, type: changeType, diff });
              result = `Staged ${changeType} for ${fp} — awaiting user approval`;

            } else if (tc.function.name === "editFile") {
              const { path: fp, oldText, newText } = args;
              const r = await fetch(`/api/files/content?path=${encodeURIComponent(fp!)}&workspace=${encodeURIComponent(workspacePath)}`);
              if (!r.ok) { result = `Error: File not found: ${fp}`; }
              else {
                const d = await r.json() as { content: string };
                const original = d.content;
                if (!original.includes(oldText!)) { result = `Error: oldText not found in ${fp}. The text must match exactly.`; }
                else {
                  const newContent = original.replace(oldText!, newText!);
                  const diff = simpleDiff(original, newContent, fp!);
                  const existing = pendingChanges.findIndex(c => c.path === fp);
                  if (existing >= 0) { pendingChanges[existing]!.content = newContent; pendingChanges[existing]!.diff = diff; }
                  else pendingChanges.push({ path: fp!, content: newContent, originalContent: original, type: "modify", diff });
                  result = `Staged edit to ${fp} — awaiting user approval`;
                }
              }
            } else {
              result = await executeTool(tc.function.name, args);
            }
          } catch (err) {
            result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          }
          toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        messages.push(...toolResults);
      }

      // Extract final text response
      const lastAssistant = [...messages].reverse().find(m => m.role === "assistant" && typeof m.content === "string" && m.content) as { content: string } | undefined;
      const finalText = lastAssistant?.content || (pendingChanges.length > 0 ? `Prepared ${pendingChanges.length} file change(s). Review and accept above.` : "Done.");

      addChatMessage({ role: "assistant", content: finalText, pendingChanges, toolCallsUsed } as any);
    } catch (err) {
      addChatMessage({ role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsThinking(false);
    }
  };

  const handleApplyChanges = (changes: PendingChange[]) => {
    applyChanges.mutate(
      { data: { changes: changes as any[], workspace: workspacePath } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ workspace: workspacePath }) }) }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const configReady = config && config.apiKey;

  return (
    <div className="h-full flex flex-col bg-sidebar border-l border-border" data-testid="container-chat">
      <div className="h-9 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent</span>
          {config && <span className="text-xs text-muted-foreground opacity-60">({config.model})</span>}
        </div>
        <button onClick={() => setChatHistory([])} className="text-muted-foreground hover:text-foreground transition-colors" title="Clear chat" data-testid="button-clear-chat">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3" data-testid="chat-messages">
        {chatHistory.length === 0 && (
          <div className="flex flex-col gap-3 mt-4">
            {!configReady && (
              <div className="text-xs text-destructive text-center px-2">
                AgentRouter key not configured. Check AGENTROUTER_API_KEY secret.
              </div>
            )}
            {configReady && <p className="text-xs text-muted-foreground text-center">Ask the agent to explore, edit, and build in your workspace.</p>}
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map(p => (
                <button key={p} onClick={() => setInput(p)} className="text-left px-3 py-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-colors">{p}</button>
              ))}
            </div>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <MessageBubble key={i} msg={msg as ChatMessage} onApplyChanges={handleApplyChanges} />
        ))}
        {isThinking && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Agent is thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3 shrink-0">
        {activeFile && <div className="text-xs text-muted-foreground mb-2 truncate">Context: <span className="text-primary">{activeFile.split("/").pop()}</span></div>}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={configReady ? "Ask the agent anything... (Enter to send)" : "Loading config..."}
            className="flex-1 resize-none text-sm min-h-[72px] max-h-[160px] bg-background border-border"
            data-testid="input-chat"
            disabled={isThinking || !configReady}
          />
          <Button size="sm" onClick={handleSend} disabled={!input.trim() || isThinking || !configReady} className="h-9 w-9 p-0 shrink-0" data-testid="button-send-chat">
            {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
