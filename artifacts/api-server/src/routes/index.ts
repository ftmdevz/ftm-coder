import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import gitRouter from "./git";
import chatRouter from "./chat";
import workspaceRouter from "./workspace";
import downloadRouter from "./download";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(gitRouter);
router.use(chatRouter);
router.use(workspaceRouter);
router.use(downloadRouter);
router.use(aiRouter);

export default router;
