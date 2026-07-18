import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// POST /api/log/client-error
// Receives browser JS errors forwarded by the inline script in index.html.
// They appear in the Node process stdout → visible in Render logs.
router.post("/client-error", (req, res) => {
  const payload = req.body ?? {};
  logger.error({ clientError: payload }, "[BROWSER ERROR]");
  res.status(204).end();
});

export default router;
