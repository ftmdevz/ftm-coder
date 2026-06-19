import { createServer } from "http";
import { WebSocketServer } from "ws";
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

const httpServer = createServer(app);

// WebSocket server for terminal — shares the same HTTP server
const wss = new WebSocketServer({ server: httpServer, path: "/api/ws/terminal" });
setupTerminalWebSocket(wss);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
