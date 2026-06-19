import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useSendChatMessage, useApplyChanges, useListFiles, getListFilesQueryKey } from "@workspace/api-client-react";
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

const EXAMPLE_PROMPTS = [
  "Explain the structure of this project",
  "Read package.json and summarize the dependencies",
  "Find all TODO comments in the codebase",
  "What files are in the src directory?",
];

function DiffBlock({ diff, filePath }: { diff: string; filePath: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = diff.split("\n");

  return (
    <div className="mt-1 rounded border border-border overflow-hidden text-xs font-mono">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 text-left transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-muted-foreground truncate">{filePath}</span>
      </button>
      {expanded && (
        <div className="overflow-x-auto max-h-64 bg-black/80">
          {lines.map((line, i) => {
            let cls = "text-gray-300";
            if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-green-400 bg-green-950/40";
            else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400 bg-red-950/40";
            else if (line.startsWith("@@")) cls = "text-blue-400";
            else if (line.startsWith("---") || line.startsWith("+++")) cls = "text-muted-foreground";
            return (
              <div key={i} className={`px-3 py-px whitespace-pre ${cls}`}>
                {line || " "}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  onAccept,
  onReject,
}: {
  change: PendingChange;
  onAccept: () => void;
  onReject: () => void;
}) {
  const typeColors: Record<string, string> = {
    create: "text-green-400",
    modify: "text-amber-400",
    delete: "text-red-400",
  };

  return (
    <div className="rounded border border-border bg-card/50 p-2 mb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${typeColors[change.type] || ""}`}>
          {change.type}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onAccept}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 transition-colors"
            data-testid={`button-accept-${change.path}`}
          >
            <Check className="h-3 w-3" /> Accept
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-900/20 text-red-400 border border-red-900 hover:bg-red-900/40 transition-colors"
            data-testid={`button-reject-${change.path}`}
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      </div>
      <DiffBlock diff={change.diff || change.content} filePath={change.path} />
    </div>
  );
}

function MessageBubble({ msg, onApplyChanges }: { msg: ChatMessage; onApplyChanges: (changes: PendingChange[]) => void }) {
  const isUser = msg.role === "user";
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const remaining = (msg.pendingChanges || []).filter((_, i) => !dismissed.has(i) && !accepted.has(i));
  const acceptedChanges = (msg.pendingChanges || []).filter((_, i) => accepted.has(i));

  const handleAccept = (idx: number) => {
    const change = msg.pendingChanges![idx];
    if (change) {
      onApplyChanges([change]);
      setAccepted((prev) => new Set([...prev, idx]));
    }
  };

  const handleAcceptAll = () => {
    onApplyChanges(remaining);
    const allIdx = remaining.map((_, i) =>
      (msg.pendingChanges || []).findIndex((c) => c === remaining[i])
    );
    setAccepted((prev) => new Set([...prev, ...allIdx]));
  };

  const handleReject = (idx: number) => {
    setDismissed((prev) => new Set([...prev, idx]));
  };

  return (
    <div className={`flex flex-col mb-4 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-full rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-primary/20 text-foreground border border-primary/30 ml-4"
            : "bg-muted text-foreground border border-border mr-4"
        }`}
      >
        {msg.content}
      </div>

      {msg.toolCallsUsed !== undefined && msg.toolCallsUsed > 0 && (
        <span className="text-xs text-muted-foreground mt-1 px-1">
          {msg.toolCallsUsed} tool call{msg.toolCallsUsed !== 1 ? "s" : ""}
        </span>
      )}

      {(msg.pendingChanges || []).length > 0 && (
        <div className="w-full mt-2 px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {remaining.length} pending change{remaining.length !== 1 ? "s" : ""}
            </span>
            {remaining.length > 1 && (
              <button
                onClick={handleAcceptAll}
                className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 transition-colors"
                data-testid="button-accept-all"
              >
                Accept all
              </button>
            )}
          </div>
          {(msg.pendingChanges || []).map((change, idx) => {
            if (dismissed.has(idx)) return null;
            if (accepted.has(idx)) {
              return (
                <div key={idx} className="text-xs text-green-400 px-2 py-1 mb-1 opacity-60">
                  Applied: {change.path}
                </div>
              );
            }
            return (
              <ChangeCard
                key={idx}
                change={change}
                onAccept={() => handleAccept(idx)}
                onReject={() => handleReject(idx)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const { workspacePath, activeFile, chatHistory, addChatMessage, setChatHistory } = useWorkspace();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const sendMessage = useSendChatMessage();
  const applyChanges = useApplyChanges();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMessage.isPending) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: msg };
    addChatMessage(userMsg);

    const apiHistory = chatHistory.map((m) => ({ role: m.role, content: m.content }));

    sendMessage.mutate(
      {
        data: {
          message: msg,
          workspace: workspacePath,
          history: apiHistory,
          activeFile: activeFile || undefined,
        },
      },
      {
        onSuccess: (data: any) => {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: data.message || "",
            pendingChanges: data.pendingChanges || [],
            toolCallsUsed: data.toolCallsUsed || 0,
          };
          addChatMessage(assistantMsg);
        },
        onError: (err: any) => {
          addChatMessage({
            role: "assistant",
            content: `Error: ${err?.message || "Something went wrong. Please try again."}`,
          });
        },
      }
    );
  };

  const handleApplyChanges = (changes: PendingChange[]) => {
    applyChanges.mutate(
      { data: { changes: changes as any[], workspace: workspacePath } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListFilesQueryKey({ workspace: workspacePath }),
          });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-sidebar border-l border-border" data-testid="container-chat">
      <div className="h-9 flex items-center justify-between px-4 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent</span>
        <button
          onClick={() => setChatHistory([])}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Clear chat"
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3" data-testid="chat-messages">
        {chatHistory.length === 0 && (
          <div className="flex flex-col gap-3 mt-4">
            <p className="text-xs text-muted-foreground text-center">
              Ask the agent to explore, edit, and build in your workspace.
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-left px-3 py-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-colors"
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

        {sendMessage.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Agent is thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3 shrink-0">
        {activeFile && (
          <div className="text-xs text-muted-foreground mb-2 truncate">
            Context: <span className="text-primary">{activeFile.split("/").pop()}</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent anything... (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none text-sm min-h-[72px] max-h-[160px] bg-background border-border"
            data-testid="input-chat"
            disabled={sendMessage.isPending}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className="h-9 w-9 p-0 shrink-0"
            data-testid="button-send-chat"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
