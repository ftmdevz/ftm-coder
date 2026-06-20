import React, { useState, useRef, useEffect, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useApplyChanges, getListFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Check, X, ChevronDown, ChevronRight, Trash2, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadAIConfig, type AIConfig } from "./AISettings";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";

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

type AgentConfig = AIConfig | null;

const EXAMPLE_PROMPTS = [
  "List all files in this workspace",
  "Read package.json and summarize the project",
  "Create a simple Python hello world script",
  "Find all TODO comments in the codebase",
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

// ─── Copy button ────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-1 rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
      title="Copy"
    >
      {copied
        ? <CheckCheck className="h-3.5 w-3.5 text-green-400" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Code block (defined outside components object to avoid babel JSX issues)
function CodeBlock({ lang, code }: { lang: string | null; code: string }) {
  return (
    <div className="relative my-2 rounded-lg overflow-hidden border border-white/10 text-xs">
      <div className="flex items-center justify-between px-3 py-1 bg-white/5 border-b border-white/10">
        <span className="text-gray-400 font-mono">{lang ?? "code"}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={lang ?? "text"}
        PreTag="div"
        customStyle={{ margin: 0, background: "transparent", padding: "10px 14px", fontSize: "12px" }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono, monospace)" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-white/10 text-pink-300 text-xs font-mono">
      {children}
    </code>
  );
}

// ─── Markdown components map ─────────────────────────────────────────────────
const mdComponents: Components = {
  code({ className, children }) {
    const lang = /language-(\w+)/.exec(className || "")?.[1] ?? null;
    const code = String(children).replace(/\n$/, "");
    if (code.includes("\n") || lang) {
      return <CodeBlock lang={lang} code={code} />;
    }
    return <InlineCode>{children}</InlineCode>;
  },
  h1({ children }) { return <h1 className="text-base font-bold mt-4 mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-sm font-bold mt-3 mb-1.5">{children}</h2>; },
  h3({ children }) { return <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>; },
  p({ children }) { return <p className="mb-2 last:mb-0 text-foreground/90 leading-relaxed">{children}</p>; },
  ul({ children }) { return <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>; },
  li({ children }) { return <li className="text-foreground/90">{children}</li>; },
  strong({ children }) { return <strong className="font-semibold text-foreground">{children}</strong>; },
  em({ children }) { return <em className="italic text-foreground/80">{children}</em>; },
  blockquote({ children }) {
    return <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>;
  },
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">{children}</a>;
  },
  hr() { return <hr className="border-border my-3" />; },
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown components={mdComponents}>{content}</ReactMarkdown>
    </div>
  );
}

// ─── Diff block ──────────────────────────────────────────────────────────────
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

// ─── Change card ─────────────────────────────────────────────────────────────
function ChangeCard({ change, onAccept, onReject }: { change: PendingChange; onAccept: () => void; onReject: () => void }) {
  const colors: Record<string, string> = { create: "text-green-400", modify: "text-amber-400", delete: "text-red-400" };
  return (
    <div className="rounded border border-border bg-card/50 p-2 mb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${colors[change.type] ?? ""}`}>{change.type}</span>
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

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, onApplyChanges }: { msg: ChatMessage; onApplyChanges: (c: PendingChange[]) => void }) {
  const isUser = msg.role === "user";
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const changes = msg.pendingChanges ?? [];
  const remaining = changes.filter((_, i) => !dismissed.has(i) && !accepted.has(i));

  const accept = (idx: number) => {
    const c = changes[idx];
    if (c) { onApplyChanges([c]); setAccepted(p => new Set([...p, idx])); }
  };
  const acceptAll = () => {
    const idxs = remaining.map(r => changes.indexOf(r));
    onApplyChanges(remaining);
    setAccepted(p => new Set([...p, ...idxs]));
  };
  const reject = (idx: number) => setDismissed(p => new Set([...p, idx]));

  return (
    <div className={`flex flex-col mb-3 ${isUser ? "items-end" : "items-start"}`}>
      {!isUser && (
        <span className="text-[10px] text-primary/60 font-semibold uppercase tracking-wider mb-1 ml-1">AI Agent</span>
      )}
      <div className={`max-w-full rounded-lg px-3 py-2 break-words ${
        isUser
          ? "bg-primary/15 text-foreground border border-primary/25 ml-8 text-sm whitespace-pre-wrap"
          : "bg-[#1e1e2e] text-foreground border border-white/8 mr-2 w-full"
      }`}>
        {isUser ? msg.content : <MarkdownMessage content={msg.content} />}
      </div>
      {msg.toolCallsUsed !== undefined && msg.toolCallsUsed > 0 && (
        <span className="text-[10px] text-muted-foreground mt-1 px-1 opacity-60">
          {msg.toolCallsUsed} tool call{msg.toolCallsUsed !== 1 ? "s" : ""}
        </span>
      )}
      {changes.length > 0 && (
        <div className="w-full mt-2 px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {remaining.length} pending change{remaining.length !== 1 ? "s" : ""}
            </span>
            {remaining.length > 1 && (
              <button onClick={acceptAll} className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 transition-colors">
                Accept all
              </button>
            )}
          </div>
          {changes.map((change, idx) => {
            if (dismissed.has(idx)) return null;
            if (accepted.has(idx)) return <div key={idx} className="text-xs text-green-400 px-2 py-1 mb-1 opacity-60">✓ Applied: {change.path}</div>;
            return <ChangeCard key={idx} change={change} onAccept={() => accept(idx)} onReject={() => reject(idx)} />;
          })}
        </div>
      )}
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3 ml-1">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-muted-foreground/60">Agent is thinking...</span>
    </div>
  );
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────
export function ChatPanel() {
  const { workspacePath, activeFile, chatHistory, addChatMessage, setChatHistory, sendToTerminal } = useWorkspace();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const applyChanges = useApplyChanges();

  useEffect(() => {
    const stored = loadAIConfig();
    if (stored?.apiKey && stored.baseURL && stored.model) {
      setConfig(stored);
      return;
    }
    fetch("/api/chat/config")
      .then(r => r.json())
      .then((c: AIConfig) => setConfig({ ...c, ...(stored ?? {}) }))
      .catch(() => setConfig(stored));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isThinking]);

  const callAI = useCallback(async (
    messages: unknown[],
    tools: unknown[]
  ): Promise<{ message: unknown; finish_reason: string }> => {
    if (!config?.apiKey) throw new Error("No API key configured. Open ⚙ Settings to add your provider key.");
    const resp = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
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
      throw new Error(`API error ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json() as { choices?: Array<{ message: unknown; finish_reason: string }> };
    if (!data.choices?.length) {
      throw new Error(`No response from model "${config.model}". Try another model in ⚙ Settings.`);
    }
    return data.choices[0]!;
  }, [config]);

  const executeTool = useCallback(async (name: string, args: Record<string, string>): Promise<string> => {
    const ws = workspacePath;
    switch (name) {
      case "listFiles": {
        const dir = args["directory"] ? `&path=${encodeURIComponent(args["directory"])}` : "";
        const r = await fetch(`/api/files?workspace=${encodeURIComponent(ws)}${dir}`);
        const d = await r.json() as { files?: Array<{ path: string; type: string; children?: unknown[] }> };
        if (!d.files) return "(empty)";
        type Node = { path: string; type: string; children?: Node[] };
        const flat = (nodes: Node[], depth = 0): string[] =>
          nodes.flatMap(n => [
            "  ".repeat(depth) + (n.type === "directory" ? `📁 ${n.path}/` : `📄 ${n.path}`),
            ...(n.type === "directory" && n.children ? flat(n.children as Node[], depth + 1) : [])
          ]);
        return flat(d.files).slice(0, 300).join("\n") || "(empty)";
      }
      case "readFile": {
        const r = await fetch(`/api/files/content?path=${encodeURIComponent(args["path"]!)}&workspace=${encodeURIComponent(ws)}`);
        if (!r.ok) return `Error: File not found: ${args["path"]}`;
        const d = await r.json() as { content: string };
        const c = d.content || "";
        return c.length <= MAX_FILE_CHARS ? c : `[TRUNCATED to ${MAX_FILE_CHARS} chars]\n` + c.slice(0, MAX_FILE_CHARS);
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
        return `Exit: ${d.exitCode}\n${(out || "(no output)").slice(0, 3000)}`;
      }
      case "runInTerminal": {
        // Send command to the live interactive terminal (good for servers, long-running processes)
        const cmd = (args["command"] ?? "").trim();
        sendToTerminal(cmd + "\n");
        return `Sent to terminal: ${cmd}`;
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
  }, [workspacePath, sendToTerminal]);

  const TOOLS = [
    {
      type: "function",
      function: {
        name: "listFiles",
        description: "List files and directories in the workspace.",
        parameters: { type: "object", properties: { directory: { type: "string", description: "Subdirectory to list (optional)" } } }
      }
    },
    {
      type: "function",
      function: {
        name: "readFile",
        description: "Read a file's content. Always read before editing.",
        parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } }
      }
    },
    {
      type: "function",
      function: {
        name: "writeFile",
        description: "Stage a new or updated file for user review. Never auto-applies.",
        parameters: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } }
      }
    },
    {
      type: "function",
      function: {
        name: "editFile",
        description: "Edit a file by replacing specific text. Prefer over writeFile for targeted changes.",
        parameters: {
          type: "object",
          required: ["path", "oldText", "newText"],
          properties: { path: { type: "string" }, oldText: { type: "string", description: "Exact text to find" }, newText: { type: "string" } }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "runCommand",
        description: "Run a short shell command (build, test, install). Has 30s timeout. Do NOT use for long-running servers — use runInTerminal instead.",
        parameters: { type: "object", required: ["command"], properties: { command: { type: "string" } } }
      }
    },
    {
      type: "function",
      function: {
        name: "runInTerminal",
        description: "Send a command to the live interactive terminal. Use this for servers, dev servers, or any long-running process. The user can see and interact with it.",
        parameters: { type: "object", required: ["command"], properties: { command: { type: "string", description: "Command to run in the terminal (without trailing newline)" } } }
      }
    },
    {
      type: "function",
      function: {
        name: "getGitDiff",
        description: "Get the current git diff.",
        parameters: { type: "object", properties: { file: { type: "string" } } }
      }
    },
  ];

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isThinking) return;
    setInput("");
    if (!config) { addChatMessage({ role: "assistant", content: "⚠️ Could not load AI config." }); return; }

    addChatMessage({ role: "user", content: msg });
    setIsThinking(true);

    const pendingChanges: PendingChange[] = [];
    let toolCallsUsed = 0;

    const systemPrompt = `You are FTM-CODER-AI, a professional autonomous coding agent — like Cursor or GitHub Copilot.\n\nWorkspace: ${workspacePath}${activeFile ? `\nActive file: ${activeFile}` : ""}\n\nRules:\n- Always listFiles or readFile before editing anything\n- Use editFile for targeted changes (preferred), writeFile for new files\n- Use runCommand for quick commands (build, install, compile) — 30s timeout\n- Use runInTerminal for servers, dev servers, or long-running processes\n- File changes are STAGED for user review — never auto-applied\n- Be direct and concise; show code, not just instructions`;

    const apiHistory = chatHistory.map(m => ({ role: m.role, content: m.content }));
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      ...apiHistory,
      { role: "user", content: msg },
    ];

    try {
      while (toolCallsUsed < MAX_TOOL_CALLS) {
        const { message, finish_reason } = await callAI(messages, TOOLS);
        const assistantMsg = message as {
          role: string;
          content: string | null;
          tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        };
        messages.push(assistantMsg);

        if (finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) break;

        const toolResults: Array<Record<string, unknown>> = [];
        for (const tc of assistantMsg.tool_calls) {
          if (toolCallsUsed >= MAX_TOOL_CALLS) {
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: `[ABORTED] Max tool calls reached.` });
            break;
          }
          toolCallsUsed++;
          let result = "";
          try {
            const args = JSON.parse(tc.function.arguments || "{}") as Record<string, string>;

            if (tc.function.name === "writeFile") {
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
                if (!original.includes(oldText!)) { result = `Error: oldText not found in ${fp}. Text must match exactly.`; }
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

      const lastAssistant = [...messages].reverse().find(
        m => m.role === "assistant" && typeof m.content === "string" && m.content
      ) as { content: string } | undefined;
      const finalText = lastAssistant?.content
        ?? (pendingChanges.length > 0 ? `Prepared ${pendingChanges.length} file change(s). Review and accept above.` : "Done.");

      addChatMessage({ role: "assistant", content: finalText, pendingChanges, toolCallsUsed } as ChatMessage);
    } catch (err) {
      addChatMessage({ role: "assistant", content: `❌ ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsThinking(false);
    }
  };

  const handleApplyChanges = (changes: PendingChange[]) => {
    applyChanges.mutate(
      { data: { changes: changes as never[], workspace: workspacePath } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ workspace: workspacePath }) }) }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const configReady = !!(config?.apiKey);

  return (
    <div className="h-full flex flex-col bg-[#13131a] border-l border-border" data-testid="container-chat">
      {/* Header */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-border/60 shrink-0 bg-card/30">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary/70 animate-pulse" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent</span>
          {config && (
            <span className="text-[10px] text-muted-foreground/50 font-mono">({config.model})</span>
          )}
        </div>
        <button
          onClick={() => setChatHistory([])}
          className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded"
          title="Clear chat"
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1" data-testid="chat-messages">
        {chatHistory.length === 0 && (
          <div className="flex flex-col gap-3 mt-2">
            {!configReady && (
              <div className="text-xs text-destructive/80 text-center px-3 py-2 rounded border border-destructive/20 bg-destructive/5">
                No AI provider configured — click ⚙ Settings in the top bar to set up OpenRouter or OmniRoute.
              </div>
            )}
            {configReady && (
              <p className="text-xs text-muted-foreground/60 text-center py-2">
                Ask the agent to build, edit, or run anything in your workspace.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-left px-3 py-2 rounded-lg border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <MessageBubble key={i} msg={msg as ChatMessage} onApplyChanges={handleApplyChanges} />
        ))}
        {isThinking && <ThinkingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/60 p-2.5 shrink-0 bg-card/20">
        {activeFile && (
          <div className="text-[10px] text-muted-foreground/50 mb-1.5 truncate">
            Context: <span className="text-primary/70">{activeFile.split("/").pop()}</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={configReady ? "Ask the agent to build, run, or edit... (Enter to send)" : "Configure AI provider in ⚙ Settings..."}
            className="flex-1 resize-none text-sm min-h-[64px] max-h-[140px] bg-background/60 border-border/60 placeholder:text-muted-foreground/40"
            data-testid="input-chat"
            disabled={isThinking || !configReady}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isThinking || !configReady}
            className="h-9 w-9 p-0 shrink-0"
            data-testid="button-send-chat"
          >
            {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
