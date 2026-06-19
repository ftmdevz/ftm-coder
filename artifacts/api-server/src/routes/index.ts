import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import gitRouter from "./git";
import chatRouter from "./chat";
import workspaceRouter from "./workspace";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(gitRouter);
router.use(chatRouter);
router.use(workspaceRouter);

export default router;
