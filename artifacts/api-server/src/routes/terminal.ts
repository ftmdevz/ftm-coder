import { spawn, execFileSync } from "child_process";
import { existsSync } from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "../lib/logger";
import { verifyToken } from "../middleware/requireAuth";
import { initUserDir, USERS_ROOT } from "../lib/auth-db";

/** Default workspace: /app (Docker) if it exists, else cwd */
const DEFAULT_WORKSPACE = existsSync("/app") ? "/app" : process.cwd();

/** Check once at startup whether `script` PTY wrapper is available */
function hasScript(): boolean {
  try { execFileSync("which", ["script"], { stdio: "ignore" }); return true; } catch { return false; }
}
const SCRIPT_AVAILABLE = hasScript();

export function setupTerminalWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", "http://localhost");

    // ── Auth ──────────────────────────────────────────────────────────────────
    // Token can come from query param (WebSocket can't set headers from browser)
    const token = url.searchParams.get("token") ?? "";
    const authUser = verifyToken(token);

    if (!authUser) {
      ws.send(JSON.stringify({ type: "data", data: "\r\n\x1b[31mUnauthorized — please log in.\x1b[0m\r\n" }));
      ws.close(1008, "Unauthorized");
      return;
    }

    // ── Workspace: always the user's own sandboxed directory ──────────────────
    const userDir = initUserDir(authUser.username); // creates dir + .bashrc if needed
    const workspace = existsSync(userDir) ? userDir : DEFAULT_WORKSPACE;

    logger.info({ workspace, username: authUser.username }, "Terminal WebSocket connected");

    let proc: ReturnType<typeof spawn> | null = null;

    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: workspace,
        HOME_JAIL: workspace,
        USERS_ROOT,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "1",
        // Do NOT set PS1 here — let .bashrc handle it so the override shows username
      };

      const bashrcPath = `${workspace}/.bashrc`;
      const initFlag = existsSync(bashrcPath) ? `--init-file ${bashrcPath}` : "";

      if (SCRIPT_AVAILABLE) {
        // `script` allocates a real PTY → colours, readline, job control
        proc = spawn(
          "script",
          ["-q", "-c", `/bin/bash ${initFlag} -i`, "/dev/null"],
          { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"] },
        );
      } else {
        // Fallback: direct bash (no PTY — still functional)
        proc = spawn(
          "/bin/bash",
          initFlag ? ["--init-file", bashrcPath, "-i"] : ["-i"],
          { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"] },
        );
      }

      proc.stdout?.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "data", data: data.toString() }));
      });

      proc.stderr?.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "data", data: data.toString() }));
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
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "data", data: `\r\nError: ${err.message}\r\n` }));
      });

    } catch (err) {
      logger.error({ err }, "Failed to spawn terminal process");
      ws.send(JSON.stringify({ type: "data", data: "Failed to start terminal\r\n" }));
      ws.close();
      return;
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string };
        if (msg.type === "input" && proc?.stdin && msg.data) {
          proc.stdin.write(msg.data);
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.on("close", () => {
      logger.info("Terminal WebSocket disconnected");
      if (proc && !proc.killed) proc.kill("SIGTERM");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Terminal WebSocket error");
      if (proc && !proc.killed) proc.kill("SIGTERM");
    });
  });
}
