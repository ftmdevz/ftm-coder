import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import authRouter from "./auth";
import healthRouter from "./health";
import filesRouter from "./files";
import gitRouter from "./git";
import chatRouter from "./chat";
import workspaceRouter from "./workspace";
import downloadRouter from "./download";
import aiRouter from "./ai";
import previewRouter from "./preview";
import logRouter from "./log";

const router: IRouter = Router();

// ── Public routes (no auth) ───────────────────────────────────────────────────
router.use("/log", logRouter); // /api/log/client-error  ← no auth, receives browser errors
router.use(authRouter);        // /api/auth/login, /api/auth/signup, /api/auth/me
router.use(healthRouter);      // /api/health

// ── Protected routes (JWT required) ──────────────────────────────────────────
router.use(requireAuth);
router.use(filesRouter);
router.use(gitRouter);
router.use(chatRouter);
router.use(workspaceRouter);
router.use(downloadRouter);
router.use(aiRouter);
router.use(previewRouter); // /api/preview/:port/...

export default router;
