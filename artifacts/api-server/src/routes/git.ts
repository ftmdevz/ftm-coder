import { Router, type IRouter } from "express";
import simpleGit from "simple-git";
import { existsSync } from "fs";
import path from "path";

const router: IRouter = Router();

/** Resolve a workspace path — fall back to /app (Docker) or cwd if it doesn't exist */
const DEFAULT_WORKSPACE = existsSync("/app") ? "/app" : process.cwd();

function resolveWorkspace(requested?: string): string {
  if (requested && existsSync(requested)) return requested;
  return DEFAULT_WORKSPACE;
}

function getGit(workspace: string) {
  return simpleGit(workspace);
}

router.get("/git/status", async (req, res) => {
  const workspace = resolveWorkspace(req.query.workspace as string | undefined);
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
  const workspace = resolveWorkspace(req.query.workspace as string | undefined);
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
  const ws = resolveWorkspace(workspace);
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

router.post("/git/push", async (req, res) => {
  const { workspace, repoUrl, token, branch = "main" } = req.body as {
    workspace: string;
    repoUrl: string;
    token: string;
    branch?: string;
  };

  if (!repoUrl || !token) {
    res.status(400).json({ error: "repoUrl and token are required" });
    return;
  }

  const ws = resolveWorkspace(workspace);

  try {
    // Build authenticated URL: https://token@github.com/user/repo.git
    const url = new URL(repoUrl.trim());
    url.username = token;
    const authUrl = url.toString();

    const git = getGit(ws);

    // Make sure we have a git repo
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await git.init();
      await git.add(".");
      await git.commit("Initial commit");
    }

    // Set/update origin remote
    const remotes = await git.getRemotes();
    if (remotes.find(r => r.name === "origin")) {
      await git.remote(["set-url", "origin", authUrl]);
    } else {
      await git.addRemote("origin", authUrl);
    }

    // Ensure branch name matches
    await git.checkout(["-B", branch]).catch(() => {});

    // Push
    const result = await git.push(["origin", branch, "--force-with-lease"]).catch(async () => {
      // First push may need --force if remote is empty
      return git.push(["origin", branch, "-u", "--force"]);
    });

    res.json({ success: true, message: `Pushed to ${url.hostname}/${url.pathname.replace(/^\//, "")} on branch ${branch}` });
  } catch (err: unknown) {
    req.log.error({ err }, "Git push failed");
    const msg = err instanceof Error ? err.message : String(err);
    // Strip token from error message before sending
    res.status(400).json({ error: msg.replace(token, "***") });
  }
});

export default router;
