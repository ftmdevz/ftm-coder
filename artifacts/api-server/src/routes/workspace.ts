import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import simpleGit from "simple-git";
import { getUserDir } from "../lib/auth-db";

const router: IRouter = Router();

/**
 * Resolve `target` to an absolute path and verify it is at or below `root`.
 * Returns the resolved path, or throws if it escapes.
 */
function assertInWorkspace(target: string, root: string): string {
  const resolved = path.resolve(target);
  const safeRoot = path.resolve(root);
  if (resolved !== safeRoot && !resolved.startsWith(safeRoot + path.sep)) {
    throw new Error("Access denied: path is outside your workspace");
  }
  return resolved;
}

router.post("/workspace/open", async (req, res) => {
  const { path: wsPath } = req.body as { path: string };
  if (!wsPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  // Sandbox: requested path must be within the authenticated user's root
  const userRoot = getUserDir(req.user!.username);
  let safePath: string;
  try {
    safePath = assertInWorkspace(wsPath, userRoot);
  } catch {
    res.status(403).json({ error: "Access denied: you can only open directories within your own workspace" });
    return;
  }

  try {
    const stat = await fs.stat(safePath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Path is not a directory" });
      return;
    }
    const name = path.basename(safePath);
    let hasGit = false;
    let hasPackageJson = false;
    try {
      await fs.access(path.join(safePath, ".git"));
      hasGit = true;
    } catch { /* not a git repo */ }
    try {
      await fs.access(path.join(safePath, "package.json"));
      hasPackageJson = true;
    } catch { /* no package.json */ }
    res.json({ path: safePath, name, hasGit, hasPackageJson });
  } catch (err) {
    req.log.error({ err, wsPath: safePath }, "Failed to open workspace");
    res.status(400).json({ error: "Path does not exist or is not accessible" });
  }
});

const DANGEROUS = [/rm\s+-rf\s+\//, /sudo\s+rm/i, /mkfs/i, /dd\s+if=/i, />\s*\/dev\/sd/, /rm.*\.git/];

router.post("/workspace/exec", async (req, res) => {
  const { command, workspace: rawWorkspace } = req.body as { command: string; workspace?: string };
  if (!command) { res.status(400).json({ error: "command is required" }); return; }
  if (DANGEROUS.some(p => p.test(command))) {
    res.status(400).json({ error: `Blocked: "${command}" matches a dangerous pattern` });
    return;
  }

  // Sandbox: cwd must be within the user's workspace
  const userRoot = getUserDir(req.user!.username);
  let cwd: string;
  try {
    cwd = assertInWorkspace(rawWorkspace || userRoot, userRoot);
  } catch {
    res.status(403).json({ error: "Access denied: workspace is outside your sandbox" });
    return;
  }

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
