import { Router, type IRouter, type Request, type Response } from "express";
import { createConnection } from "net";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Port scanner endpoint ───────────────────────────────────────────────────
// GET /api/preview/scan  →  { ports: number[] }
// Checks a set of common dev ports and returns which ones are open.

const SCAN_PORTS = [3000, 3001, 4000, 4200, 5000, 5173, 5174, 7860, 8000, 8080, 8088, 8888];

function isPortOpen(port: number, timeout = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const client = createConnection({ port, host: "127.0.0.1" });
    client.setTimeout(timeout);
    client.once("connect", () => { client.destroy(); resolve(true); });
    client.once("error", () => { client.destroy(); resolve(false); });
    client.once("timeout", () => { client.destroy(); resolve(false); });
  });
}

router.get("/preview/scan", async (_req: Request, res: Response) => {
  try {
    const results = await Promise.all(SCAN_PORTS.map(async (p) => ({ port: p, open: await isPortOpen(p) })));
    const open = results.filter(r => r.open).map(r => r.port);
    res.json({ ports: open });
  } catch (err) {
    logger.error({ err }, "Port scan error");
    res.json({ ports: [] });
  }
});

// ── Preview proxy ─────────────────────────────────────────────────────────────
/**
 * Transparent HTTP proxy: /api/preview/:port/...rest...
 *
 * Forwards any GET/POST/etc. request to http://127.0.0.1:<port>/<rest>.
 * Only localhost ports in the range 1024-65534 are allowed.
 *
 * For HTML responses we inject a <base> tag so that root-relative URLs
 * (e.g. /main.css) resolve through the proxy path and not the app root.
 * Relative URLs (e.g. ./main.css) already work correctly because the
 * iframe's origin is the proxy URL itself.
 */
router.all(/^\/preview\/(\d+)(\/.*)?$/, async (req: Request, res: Response) => {
  const portStr = (req.params as Record<string, string>)[0] ?? "";
  const restPath = (req.params as Record<string, string>)[1] ?? "/";

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1024 || port > 65534) {
    res.status(400).json({ error: `Invalid port: ${portStr}. Use 1024–65534.` });
    return;
  }

  // Preserve query string
  const qs = req.url.includes("?") ? "?" + req.url.split("?").slice(1).join("?") : "";
  const targetUrl = `http://127.0.0.1:${port}${restPath}${qs}`;

  // Forward safe headers (drop host, connection, encoding — we handle those)
  const forwardHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (["host", "connection", "accept-encoding", "transfer-encoding"].includes(lk)) continue;
    if (typeof v === "string") forwardHeaders[k] = v;
    else if (Array.isArray(v)) forwardHeaders[k] = v[0] ?? "";
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      // Pass body for POST/PUT/PATCH
      body: ["GET", "HEAD", "DELETE", "OPTIONS"].includes(req.method.toUpperCase())
        ? undefined
        : await streamBody(req),
      signal: AbortSignal.timeout(30_000),
      redirect: "manual",
    });

    // Handle redirects — rewrite Location header to go through the proxy
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location") ?? "";
      const rewritten = rewriteLocation(location, port, req);
      res.setHeader("Location", rewritten);
      res.status(upstream.status).end();
      return;
    }

    // Copy status + safe response headers
    res.status(upstream.status);
    for (const [k, v] of upstream.headers.entries()) {
      const lk = k.toLowerCase();
      if (["transfer-encoding", "connection", "content-encoding"].includes(lk)) continue;
      res.setHeader(k, v);
    }

    const contentType = upstream.headers.get("content-type") ?? "";

    if (contentType.includes("text/html")) {
      // Inject <base> so root-relative URLs resolve through the proxy
      let html = await upstream.text();
      const baseHref = `/api/preview/${port}${restPath.endsWith("/") ? restPath : restPath + "/"}`;
      const baseTag = `<base href="${baseHref}">`;

      // Insert after <head> if present, otherwise prepend
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
      } else {
        html = baseTag + html;
      }

      res.removeHeader("content-length"); // length changed after injection
      res.send(html);
    } else {
      // Stream everything else (JS, CSS, images, JSON …)
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    if (isRefused) {
      res.status(502).send(offlinePage(port));
    } else {
      logger.error({ err, targetUrl }, "Preview proxy error");
      res.status(502).json({ error: `Proxy error: ${msg}` });
    }
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function streamBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function rewriteLocation(location: string, port: number, req: Request): string {
  try {
    const url = new URL(location, `http://127.0.0.1:${port}`);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return `/api/preview/${port}${url.pathname}${url.search}`;
    }
  } catch { /* not a valid URL — return as-is */ }
  return location;
}

function offlinePage(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview — waiting for server</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f0f17; color: #ccc;
           display: flex; flex-direction: column; align-items: center; justify-content: center;
           height: 100vh; gap: 16px; }
    .icon { font-size: 48px; }
    h2 { margin: 0; font-size: 18px; color: #fff; }
    p { margin: 0; font-size: 13px; color: #888; }
    code { background: #1e1e2e; padding: 2px 8px; border-radius: 4px; color: #e2b96f; font-size: 13px; }
    button { margin-top: 8px; padding: 8px 20px; border-radius: 6px; border: 1px solid #444;
             background: #1e1e2e; color: #ccc; cursor: pointer; font-size: 13px; }
    button:hover { background: #2a2a3e; color: #fff; }
  </style>
</head>
<body>
  <div class="icon">⏳</div>
  <h2>Waiting for your server on port ${port}</h2>
  <p>Start a server in the terminal, then click Reload.</p>
  <p>Example: <code>python -m http.server ${port}</code>&nbsp;&nbsp;or&nbsp;&nbsp;<code>node app.js</code></p>
  <button onclick="location.reload()">↻ Reload</button>
  <script>
    // Auto-retry every 3 seconds
    setTimeout(() => location.reload(), 3000);
  </script>
</body>
</html>`;
}

export default router;
