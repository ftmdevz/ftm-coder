import { Router, type IRouter } from "express";
import { createRequire } from "module";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require("archiver") as (format: string, opts?: object) => import("archiver").Archiver;

const router: IRouter = Router();

router.get("/workspace/download", async (req, res) => {
  const workspace = (req.query.workspace as string) || process.cwd();

  if (!fs.existsSync(workspace)) {
    res.status(404).json({ error: "Workspace path not found" });
    return;
  }

  const folderName = path.basename(workspace);
  const zipName = `${folderName}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err: Error) => {
    req.log.error({ err }, "Archive error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create archive" });
    }
  });

  archive.pipe(res);

  // Add workspace directory, skip node_modules, .git, dist, .cache
  const SKIP = new Set(["node_modules", ".git", "dist", ".cache", ".next", "build", ".turbo"]);

  archive.glob("**/*", {
    cwd: workspace,
    ignore: [
      "node_modules/**",
      ".git/**",
      "dist/**",
      ".cache/**",
      ".next/**",
      "build/**",
      ".turbo/**",
      "**/.DS_Store",
    ],
    dot: true,
  });

  await archive.finalize();
});

export default router;
