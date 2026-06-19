import { Router, type IRouter } from "express";
import simpleGit from "simple-git";
import path from "path";

const router: IRouter = Router();

function getGit(workspace: string) {
  return simpleGit(workspace);
}

router.get("/git/status", async (req, res) => {
  const workspace = (req.query.workspace as string) || process.cwd();
  try {
    const git = getGit(workspace);
    const status = await git.status();
    const branch = status.current;
    const files = [
      ...status.modified.map((f) => ({ path: f, status: "M", staged: false })),
      ...status.created.map((f) => ({ path: f, status: "A", staged: false })),
      ...status.deleted.map((f) => ({ path: f, status: "D", staged: false })),
      ...status.renamed.map((f) => ({ path: f.to, status: "R", staged: false })),
      ...status.staged.map((f) => ({ path: f, status: "S", staged: true })),
      ...status.conflicted.map((f) => ({ path: f, status: "C", staged: false })),
    ];
    res.json({
      files,
      isClean: status.isClean(),
      branch: branch || "main",
      ahead: status.ahead,
      behind: status.behind,
    });
  } catch (err) {
    req.log.warn({ err }, "Git status failed (not a git repo?)");
    res.json({ files: [], isClean: true, branch: "main", ahead: 0, behind: 0 });
  }
});

router.get("/git/diff", async (req, res) => {
  const workspace = (req.query.workspace as string) || process.cwd();
  const file = req.query.file as string | undefined;
  try {
    const git = getGit(workspace);
    const args: string[] = ["--stat"];
    let diff: string;
    if (file) {
      diff = await git.diff([file]);
    } else {
      diff = await git.diff();
    }
    const stagedDiff = await git.diff(["--cached"]);
    const fullDiff = diff + (stagedDiff ? "\n" + stagedDiff : "");
    const changedFiles = (await git.status()).files.map((f) =>
      path.relative(workspace, path.join(workspace, f.path))
    );
    res.json({ diff: fullDiff, files: changedFiles });
  } catch (err) {
    req.log.warn({ err }, "Git diff failed");
    res.json({ diff: "", files: [] });
  }
});

router.post("/git/commit", async (req, res) => {
  const { message, workspace } = req.body as { message: string; workspace: string };
  if (!message) {
    res.status(400).json({ error: "Commit message is required" });
    return;
  }
  const ws = workspace || process.cwd();
  try {
    const git = getGit(ws);
    await git.add(".");
    await git.commit(message);
    res.json({ success: true, message: `Committed: ${message}` });
  } catch (err: unknown) {
    req.log.error({ err }, "Git commit failed");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

export default router;
