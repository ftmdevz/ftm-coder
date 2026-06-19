import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useWorkspace } from "@/lib/workspace-context";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";

export function TerminalPanel({ onClose }: { onClose?: () => void }) {
  const { workspacePath } = useWorkspace();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#f59e0b",
      },
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const wsUrl = new URL(location.origin.replace(/^http/, "ws"));
    wsUrl.pathname = "/api/ws/terminal";
    wsUrl.searchParams.set("workspace", workspacePath);

    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ready" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "data" && msg.data) {
          term.write(msg.data);
        }
      } catch (e) {
        // Fallback
        term.write(event.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener("resize", handleResize);
    
    // Fit periodically for panel resizes
    const interval = setInterval(handleResize, 500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(interval);
      term.dispose();
      ws.close();
    };
  }, [workspacePath]);

  return (
    <div className="h-full w-full bg-black flex flex-col" data-testid="container-terminal">
      <div className="h-8 flex items-center justify-between px-4 border-b border-[#222]">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Terminal</span>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white" data-testid="button-close-terminal">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 p-2 overflow-hidden" ref={terminalRef} />
    </div>
  );
}
