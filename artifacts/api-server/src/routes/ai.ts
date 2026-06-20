import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Configurable via env vars ────────────────────────────────────────────────
// AI_BASE_URL  → upstream AI endpoint (default: Ollama local)
// AI_API_KEY   → API key for upstream (default: "ollama" — Ollama ignores it)
// AI_MODEL     → default model name (default: glm4 via Ollama)
const AI_BASE_URL = (process.env["AI_BASE_URL"] ?? "http://localhost:11434/v1").replace(/\/$/, "");
const AI_API_KEY  = process.env["AI_API_KEY"]  ?? "ollama";
const AI_MODEL    = process.env["AI_MODEL"]    ?? "glm4";

// ── Health check — lets the frontend know the proxy is up ────────────────────
router.get("/ai/status", async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${AI_API_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json() as { models?: unknown[]; data?: unknown[] };
    const models = data.models ?? data.data ?? [];
    res.json({ ok: true, model: AI_MODEL, baseURL: AI_BASE_URL, models });
  } catch {
    res.json({ ok: false, model: AI_MODEL, baseURL: AI_BASE_URL, models: [] });
  }
});

// ── Streaming proxy → /api/ai/chat/completions ───────────────────────────────
// Mirrors the OpenAI API shape so the frontend can point its baseURL to /api/ai
router.post("/ai/chat/completions", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const model  = (body["model"] as string | undefined) || AI_MODEL;
  const stream = body["stream"] !== false;

  const upstream = `${AI_BASE_URL}/chat/completions`;

  try {
    const upstreamResp = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({ ...body, model, stream }),
    });

    if (!upstreamResp.ok) {
      const text = await upstreamResp.text();
      logger.error({ status: upstreamResp.status, upstream, text }, "AI upstream error");
      res.status(upstreamResp.status).json({
        error: { message: text || `Upstream returned ${upstreamResp.status}`, type: "upstream_error" }
      });
      return;
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const reader = upstreamResp.body?.getReader();
      if (!reader) { res.end(); return; }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
      res.end();
    } else {
      const data = await upstreamResp.json();
      res.json(data);
    }
  } catch (err) {
    logger.error({ err, upstream }, "AI proxy error");
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: {
          message: `AI backend unreachable (${AI_BASE_URL}): ${msg}. Make sure Ollama is running: ollama serve`,
          type: "proxy_error",
        }
      });
    }
  }
});

export default router;
