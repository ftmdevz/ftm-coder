import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useWorkspace } from "@/lib/workspace-context";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";

export function TerminalPanel({ onClose }: { onClose?: () => void }) {
  const { workspacePath, terminalSendRef } = useWorkspace();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: "#f59e0b",
        selectionBackground: "#264f78",
        black: "#000000",
        brightBlack: "#808080",
        red: "#f44747",
        brightRed: "#f44747",
        green: "#4ec9b0",
        brightGreen: "#4ec9b0",
        yellow: "#dcdcaa",
        brightYellow: "#dcdcaa",
        blue: "#569cd6",
        brightBlue: "#569cd6",
        magenta: "#c586c0",
        brightMagenta: "#c586c0",
        cyan: "#9cdcfe",
        brightCyan: "#9cdcfe",
        white: "#d4d4d4",
        brightWhite: "#ffffff",
      },
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
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
        const msg = JSON.parse(event.data as string);
        if (msg.type === "data" && msg.data) {
          term.write(msg.data as string);
        }
      } catch {
        term.write(event.data as string);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Register sendCommand into the shared context ref
    terminalSendRef.current = (cmd: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data: cmd }));
      }
    };

    const handleResize = () => { fitAddon.fit(); };
    window.addEventListener("resize", handleResize);
    const interval = setInterval(handleResize, 500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(interval);
      terminalSendRef.current = null;
      term.dispose();
      ws.close();
    };
  }, [workspacePath, terminalSendRef]);

  return (
    <div className="h-full w-full bg-[#0d0d0d] flex flex-col" data-testid="container-terminal">
      <div className="h-8 flex items-center justify-between px-4 border-b border-[#1e1e1e] shrink-0">
        <span className="text-xs text-[#858585] uppercase tracking-wider font-semibold">Terminal</span>
        {onClose && (
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors" data-testid="button-close-terminal">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 p-2 overflow-hidden" ref={terminalRef} />
    </div>
  );
}
