import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
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

const DANGEROUS = [/rm\s+-rf\s+\//, /sudo\s+rm/i, /mkfs/i, /dd\s+if=/i, />\s*\/dev\/sd/, /rm.*\.git/];

router.post("/workspace/exec", async (req, res) => {
  const { command, workspace } = req.body as { command: string; workspace?: string };
  if (!command) { res.status(400).json({ error: "command is required" }); return; }
  if (DANGEROUS.some(p => p.test(command))) {
    res.status(400).json({ error: `Blocked: "${command}" matches a dangerous pattern` });
    return;
  }
  const cwd = workspace || process.cwd();
  let stdout = "", stderr = "";
  const proc = spawn("bash", ["-c", command], { cwd, env: process.env });
  const timer = setTimeout(() => { proc.kill(); }, 30000);
  proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
  proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
  proc.on("close", (code) => {
    clearTimeout(timer);
    res.json({ stdout, stderr, exitCode: code ?? 1 });
  });
  proc.on("error", (err) => {
    clearTimeout(timer);
    res.status(500).json({ error: err.message });
  });
});

export default router;
