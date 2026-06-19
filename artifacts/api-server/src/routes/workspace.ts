import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";

const router: IRouter = Router();

router.post("/workspace/open", async (req, res) => {
  const { path: wsPath } = req.body as { path: string };
  if (!wsPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  try {
    const stat = await fs.stat(wsPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Path is not a directory" });
      return;
    }
    const name = path.basename(wsPath);
    let hasGit = false;
    let hasPackageJson = false;
    try {
      await fs.access(path.join(wsPath, ".git"));
      hasGit = true;
    } catch { /* not a git repo */ }
    try {
      await fs.access(path.join(wsPath, "package.json"));
      hasPackageJson = true;
    } catch { /* no package.json */ }
    res.json({ path: wsPath, name, hasGit, hasPackageJson });
  } catch (err) {
    req.log.error({ err, wsPath }, "Failed to open workspace");
    res.status(400).json({ error: "Path does not exist or is not accessible" });
  }
});

export default router;
