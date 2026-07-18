import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { logger } from "../lib/logger";
import { getUserDir } from "../lib/auth-db";

const router: IRouter = Router();

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".cache", "coverage", ".nyc_output", "vendor", ".turbo", ".parcel-cache",
]);

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  py: "python", rs: "rust", go: "go", java: "java", cpp: "cpp", c: "c",
  cs: "csharp", php: "php", rb: "ruby", swift: "swift", kt: "kotlin",
  html: "html", css: "css", scss: "scss", less: "less", json: "json",
  yaml: "yaml", yml: "yaml", toml: "toml", md: "markdown", sh: "shell",
  bash: "shell", sql: "sql", xml: "xml", vue: "vue", svelte: "svelte",
  dockerfile: "dockerfile", tf: "terraform", graphql: "graphql",
};

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  if (basename === "dockerfile") return "dockerfile";
  return LANGUAGE_MAP[ext] || "plaintext";
}

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
  extension?: string;
};

/**
 * Resolve `target` to an absolute path and verify it is at or below `root`.
 * Throws a plain Error (caught by route handlers → 403) if it escapes.
 */
function assertInWorkspace(target: string, root: string): string {
  const resolved = path.resolve(target);
  const safeRoot = path.resolve(root);
  if (resolved !== safeRoot && !resolved.startsWith(safeRoot + path.sep)) {
    throw Object.assign(new Error("Access denied: path is outside your workspace"), { code: "EPERM" });
  }
  return resolved;
}

async function buildFileTree(dirPath: string, relativeTo: string, depth = 0): Promise<FileNode[]> {
  if (depth > 8) return [];
  let entries: string[];
  let stats: Map<string, { isDirectory: boolean; size: number }> = new Map();
  try {
    entries = await fs.readdir(dirPath, { encoding: "utf8" });
    for (const name of entries) {
      try {
        const st = await fs.stat(path.join(dirPath, name));
        stats.set(name, { isDirectory: st.isDirectory(), size: st.size });
      } catch { /* skip */ }
    }
  } catch {
    return [];
  }
  const nodes: FileNode[] = [];
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".env.example") continue;
    if (IGNORED_DIRS.has(name)) continue;
    const fullPath = path.join(dirPath, name);
    const relPath = path.relative(relativeTo, fullPath);
    const info = stats.get(name);
    if (!info) continue;
    if (info.isDirectory) {
      const children = await buildFileTree(fullPath, relativeTo, depth + 1);
      nodes.push({ name, path: relPath, type: "directory", children });
    } else {
      nodes.push({
        name,
        path: relPath,
        type: "file",
        size: info.size,
        extension: path.extname(name).slice(1),
      });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

router.get("/files", async (req, res) => {
  const userRoot = getUserDir(req.user!.username);
  const rawWorkspace = (req.query.workspace as string) || userRoot;
  const subPath = (req.query.path as string) || "";

  let workspace: string;
  let targetDir: string;
  try {
    workspace = assertInWorkspace(rawWorkspace, userRoot);
    targetDir = subPath ? assertInWorkspace(path.join(workspace, subPath), userRoot) : workspace;
  } catch {
    res.status(403).json({ error: "Access denied: path is outside your workspace" });
    return;
  }

  try {
    const files = await buildFileTree(targetDir, workspace);
    res.json({ files, workspace });
  } catch (err) {
    req.log.error({ err }, "Error listing files");
    res.status(400).json({ error: "Failed to list files" });
  }
});

router.get("/files/content", async (req, res) => {
  const userRoot = getUserDir(req.user!.username);
  const rawWorkspace = (req.query.workspace as string) || userRoot;
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path query param required" });
    return;
  }

  let workspace: string;
  let fullPath: string;
  try {
    workspace = assertInWorkspace(rawWorkspace, userRoot);
    const candidate = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);
    fullPath = assertInWorkspace(candidate, userRoot);
  } catch {
    res.status(403).json({ error: "Access denied: path is outside your workspace" });
    return;
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      res.status(400).json({ error: "Path is not a file" });
      return;
    }
    const MAX_SIZE = 1024 * 1024;
    if (stat.size > MAX_SIZE) {
      res.status(400).json({ error: "File too large to read in editor (>1MB)" });
      return;
    }
    const content = await fs.readFile(fullPath, "utf-8");
    const lines = content.split("\n").length;
    res.json({
      content,
      path: filePath,
      language: getLanguage(fullPath),
      size: stat.size,
      lines,
    });
  } catch (err) {
    req.log.error({ err, filePath }, "Error reading file");
    res.status(404).json({ error: "File not found" });
  }
});

router.post("/files/content", async (req, res) => {
  const { path: filePath, content, workspace: rawWorkspace } = req.body as {
    path: string;
    content: string;
    workspace?: string;
  };
  if (!filePath || content === undefined) {
    res.status(400).json({ error: "path and content are required" });
    return;
  }

  const userRoot = getUserDir(req.user!.username);

  let workspace: string;
  let fullPath: string;
  try {
    workspace = assertInWorkspace(rawWorkspace || userRoot, userRoot);
    const candidate = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);
    fullPath = assertInWorkspace(candidate, userRoot);
  } catch {
    res.status(403).json({ error: "Access denied: path is outside your workspace" });
    return;
  }

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    logger.info({ filePath }, "File saved");
    res.json({ success: true, message: "File saved" });
  } catch (err) {
    req.log.error({ err, filePath }, "Error writing file");
    res.status(500).json({ error: "Failed to write file" });
  }
});

export default router;
