import { createServer } from "http";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import app from "./app";
import { logger } from "./lib/logger";
import { setupTerminalWebSocket } from "./routes/terminal";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Auto-start Ollama if configured and not already running ──────────────────

async function isOllamaRunning(): Promise<boolean> {
  const ollamaBase = (process.env["AI_BASE_URL"] ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
  try {
    const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaRunning()) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function ensureOllama() {
  // Only auto-start when using a local Ollama endpoint
  const baseURL = process.env["AI_BASE_URL"] ?? "http://localhost:11434/v1";
  const isLocal = baseURL.includes("localhost") || baseURL.includes("127.0.0.1");
  if (!isLocal) return; // cloud provider — skip

  if (await isOllamaRunning()) {
    logger.info("Ollama already running");
    return;
  }

  logger.info("Ollama not detected — attempting auto-start...");

  const proc = spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  proc.unref(); // don't block Node exit

  proc.on("error", (err) => {
    // ollama not in PATH — not fatal, server still starts
    logger.warn({ err: err.message }, "Could not auto-start Ollama (not installed or not in PATH). Run: ollama serve");
  });

  const ready = await waitForOllama(15000);
  if (ready) {
    logger.info("Ollama started successfully");
    // Pull default model in background (non-blocking)
    const model = process.env["AI_MODEL"] ?? "glm4";
    const pull = spawn("ollama", ["pull", model], { stdio: "ignore", env: process.env });
    pull.on("error", () => { /* ollama not available — ignore */ });
    pull.unref();
  } else {
    logger.warn("Ollama did not start within 15s — AI proxy will return 502 until Ollama is running");
  }
}

// ── Start HTTP server ─────────────────────────────────────────────────────────

const httpServer = createServer(app);

// WebSocket server for terminal — shares the same HTTP server
const wss = new WebSocketServer({ server: httpServer, path: "/api/ws/terminal" });
setupTerminalWebSocket(wss);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
  // Kick off Ollama auto-start after server is accepting requests
  ensureOllama().catch((err: unknown) => {
    logger.warn({ err }, "ensureOllama failed");
  });
});
