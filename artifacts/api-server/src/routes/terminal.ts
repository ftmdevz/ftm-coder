import { spawn } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "../lib/logger";

export function setupTerminalWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", "http://localhost");
    const workspace = url.searchParams.get("workspace") || process.cwd();
    const shell = process.env.SHELL || "/bin/bash";

    logger.info({ workspace, shell }, "Terminal WebSocket connected");

    let proc: ReturnType<typeof spawn> | null = null;

    try {
      proc = spawn(shell, [], {
        cwd: workspace,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          FORCE_COLOR: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout?.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data: data.toString() }));
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data: data.toString() }));
        }
      });

      proc.on("exit", (code, signal) => {
        logger.info({ code, signal }, "Terminal process exited");
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "exit", code: code ?? 0 }));
          ws.close();
        }
      });

      proc.on("error", (err) => {
        logger.error({ err }, "Terminal process error");
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data: `\r\nError: ${err.message}\r\n` }));
          ws.close();
        }
      });

      // Send initial prompt signal
      ws.send(JSON.stringify({ type: "ready" }));
    } catch (err) {
      logger.error({ err }, "Failed to spawn terminal process");
      ws.send(JSON.stringify({ type: "data", data: "Failed to start terminal\r\n" }));
      ws.close();
      return;
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === "input" && proc && proc.stdin && msg.data) {
          proc.stdin.write(msg.data);
        } else if (msg.type === "resize") {
          // Resize not supported without PTY, but we acknowledge it
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.on("close", () => {
      logger.info("Terminal WebSocket disconnected");
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Terminal WebSocket error");
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
      }
    });
  });
}
