import { Router, type IRouter } from "express";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import simpleGit from "simple-git";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function makeOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OMNIROUTE_API_KEY || process.env.AGENTROUTER_API_KEY || "placeholder",
    baseURL: process.env.OMNIROUTE_BASE_URL || "https://agentrouter.org/v1",
  });
}

const MODEL = process.env.AGENT_MODEL || "gpt-4o";
const MAX_TOOL_CALLS = 25;
const MAX_FILE_SIZE_CHARS = 8000;
const SUMMARY_LINES = 100;

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s+rm/i,
  /mkfs/i,
  /dd\s+if=/i,
  /chmod\s+-R\s+777\s+\//,
  /rm.*\.git/,
  />\s*\/dev\/sd/,
  /format\s+c:/i,
];

function isDangerous(cmd: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(cmd));
}

function summarizeContent(content: string): string {
  if (content.length <= MAX_FILE_SIZE_CHARS) return content;
  const lines = content.split("\n");
  const head = lines.slice(0, SUMMARY_LINES).join("\n");
  const tail = lines.slice(-20).join("\n");
  return (
    `[FILE TRUNCATED - ${lines.length} lines total, showing first ${SUMMARY_LINES} and last 20]\n\n` +
    head +
    `\n\n... [${lines.length - SUMMARY_LINES - 20} lines omitted] ...\n\n` +
    tail
  );
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".cache", "coverage", ".turbo",
]);

async function listFilesRecursive(dirPath: string, relativeTo: string, depth = 0): Promise<string[]> {
  if (depth > 5) return [];
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath, { encoding: "utf8" });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const name of entries) {
    if (IGNORED_DIRS.has(name) || name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, name);
    const rel = path.relative(relativeTo, fullPath);
    try {
      const st = await fs.stat(fullPath);
      if (st.isDirectory()) {
        result.push(rel + "/");
        const children = await listFilesRecursive(fullPath, relativeTo, depth + 1);
        result.push(...children);
      } else {
        result.push(rel);
      }
    } catch { /* skip */ }
  }
  return result;
}

function runShellCommand(cmd: string, cwd: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("bash", ["-c", cmd], { cwd, env: process.env });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr: stderr + "\n[TIMEOUT]", exitCode: 124 });
    }, timeoutMs);
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List files and directories in the workspace. Use to understand project structure before coding.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Subdirectory to list (relative to workspace root). Leave empty for root." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the content of a file. Large files will be summarized. Always read before editing.",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "File path relative to workspace root." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write or create a file with the given content. The change is staged for user review and approval.",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", description: "File path relative to workspace root." },
          content: { type: "string", description: "Full new content of the file." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editFile",
      description: "Edit a file by replacing specific text. Prefer this over writeFile for targeted changes.",
      parameters: {
        type: "object",
        required: ["path", "oldText", "newText"],
        properties: {
          path: { type: "string", description: "File path relative to workspace root." },
          oldText: { type: "string", description: "The exact text to replace (must match exactly including whitespace)." },
          newText: { type: "string", description: "The replacement text." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runCommand",
      description: "Run a shell command in the workspace and return stdout/stderr. Use for installing packages, running tests, build commands.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "Shell command to execute." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGitDiff",
      description: "Get the current git diff to see what has changed since last commit.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Optional specific file to diff." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "applyPatch",
      description: "Stage a patch for a file for user review. The patch content is the new file content.",
      parameters: {
        type: "object",
        required: ["path", "patch"],
        properties: {
          path: { type: "string", description: "File path relative to workspace root." },
          patch: { type: "string", description: "New file content to apply." },
        },
      },
    },
  },
];

function simpleDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`, "@@ changes @@"];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hasChanges = false;
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;
    if (oldLine !== newLine) {
      hasChanges = true;
      if (oldLine !== null) lines.push(`-${oldLine}`);
      if (newLine !== null) lines.push(`+${newLine}`);
    }
  }
  if (!hasChanges) return "";
  return lines.join("\n");
}

type PendingChange = {
  path: string;
  content: string;
  originalContent: string;
  type: "create" | "modify" | "delete";
  diff: string;
};

router.get("/chat/config", (_req, res) => {
  res.json({
    apiKey: process.env.OMNIROUTE_API_KEY || process.env.AGENTROUTER_API_KEY || "",
    baseURL: process.env.OMNIROUTE_BASE_URL || "https://agentrouter.org/v1",
    model: process.env.AGENT_MODEL || "gpt-4o",
  });
});

router.post("/chat/message", async (req, res) => {
  const { message, workspace, history = [], activeFile } = req.body as {
    message: string;
    workspace: string;
    history: Array<{ role: string; content: string }>;
    activeFile?: string;
  };

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const ws = workspace || process.cwd();
  const pendingChanges: PendingChange[] = [];
  const commandsRun: string[] = [];
  let toolCallsUsed = 0;

  const systemPrompt = `You are FTM-CODER-AI, an expert autonomous coding agent similar to Cursor or GitHub Copilot Workspace.

Current workspace: ${ws}
${activeFile ? `Currently open file: ${activeFile}` : ""}

You have tools to explore, read, write, and edit files, run commands, and check git state.

RULES:
1. Before making file edits, briefly state your plan (1-3 sentences) as your message text.
2. Always read a file before editing it — never guess at its content.
3. Prefer editFile over writeFile for targeted changes to existing files.
4. writeFile and editFile stage changes for user review — they don't apply immediately.
5. runCommand executes immediately — use only for safe operations (npm install, tests, etc).
6. Maximum ${MAX_TOOL_CALLS} tool calls per response to save API credits.
7. For whole-project refactors, ask the user to confirm before making broad changes.
8. Only read files relevant to the current task.
9. If FTM_AGENT.md exists in the workspace root, read it first for project-specific rules.

Be concise and professional. Focus on the task.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  let planText = "";

  const openai = makeOpenAIClient();

  try {
    while (toolCallsUsed < MAX_TOOL_CALLS) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
      });

      if (!response.choices || response.choices.length === 0) {
        logger.error({ model: MODEL, responseKeys: Object.keys(response) }, "AI returned empty choices array");
        throw new Error(`AI returned no choices. Model "${MODEL}" may not be supported by AgentRouter.`);
      }

      const choice = response.choices[0]!;
      const assistantMsg = choice.message;
      messages.push(assistantMsg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      if (assistantMsg.content && !planText) {
        planText = assistantMsg.content;
      }

      if (choice.finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) {
        break;
      }

      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const rawToolCall of assistantMsg.tool_calls) {
        if (toolCallsUsed >= MAX_TOOL_CALLS) {
          toolResults.push({
            role: "tool",
            tool_call_id: rawToolCall.id,
            content: `[ABORTED] Max tool calls (${MAX_TOOL_CALLS}) reached to save API credits.`,
          });
          break;
        }

        toolCallsUsed++;
        let result = "";

        // Cast to the standard tool call shape
        const toolCall = rawToolCall as {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        };

        const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, string>;

        try {
          switch (toolCall.function.name) {
            case "listFiles": {
              const dir = args["directory"] ? path.join(ws, args["directory"]) : ws;
              const files = await listFilesRecursive(dir, ws);
              result = files.slice(0, 500).join("\n") || "(empty directory)";
              break;
            }

            case "readFile": {
              const fullPath = path.join(ws, args["path"]!);
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                result = summarizeContent(content);
              } catch {
                result = `Error: File not found: ${args["path"]}`;
              }
              break;
            }

            case "writeFile": {
              const filePath = args["path"]!;
              const content = args["content"]!;
              const fullPath = path.join(ws, filePath);
              let originalContent = "";
              let changeType: "create" | "modify" = "create";
              try {
                originalContent = await fs.readFile(fullPath, "utf-8");
                changeType = "modify";
              } catch { /* new file */ }
              const diff = simpleDiff(originalContent, content, filePath);
              const existingIdx = pendingChanges.findIndex((c) => c.path === filePath);
              if (existingIdx >= 0) {
                pendingChanges[existingIdx]!.content = content;
                pendingChanges[existingIdx]!.diff = diff;
              } else {
                pendingChanges.push({ path: filePath, content, originalContent, type: changeType, diff });
              }
              result = `Staged ${changeType} for ${filePath} — awaiting user approval`;
              break;
            }

            case "editFile": {
              const filePath = args["path"]!;
              const oldText = args["oldText"]!;
              const newText = args["newText"]!;
              const fullPath = path.join(ws, filePath);
              let originalContent = "";
              try {
                originalContent = await fs.readFile(fullPath, "utf-8");
              } catch {
                result = `Error: File not found: ${filePath}`;
                break;
              }
              if (!originalContent.includes(oldText)) {
                result = `Error: oldText not found in ${filePath}. Verify it matches exactly (including whitespace).`;
                break;
              }
              const newContent = originalContent.replace(oldText, newText);
              const diff = simpleDiff(originalContent, newContent, filePath);
              const existingIdx = pendingChanges.findIndex((c) => c.path === filePath);
              if (existingIdx >= 0) {
                pendingChanges[existingIdx]!.content = newContent;
                pendingChanges[existingIdx]!.diff = diff;
              } else {
                pendingChanges.push({ path: filePath, content: newContent, originalContent, type: "modify", diff });
              }
              result = `Staged edit to ${filePath} — awaiting user approval`;
              break;
            }

            case "runCommand": {
              const cmd = args["command"]!;
              if (isDangerous(cmd)) {
                result = `Blocked: "${cmd}" matches a dangerous command pattern and cannot be executed.`;
                break;
              }
              commandsRun.push(cmd);
              const { stdout, stderr, exitCode } = await runShellCommand(cmd, ws);
              const output = (stdout + (stderr ? "\nSTDERR:\n" + stderr : "")).trim();
              result = `Exit code: ${exitCode}\n${output || "(no output)"}`;
              if (result.length > 3000) result = result.slice(0, 3000) + "\n...[truncated]";
              break;
            }

            case "getGitDiff": {
              try {
                const git = simpleGit(ws);
                const diff = args["file"] ? await git.diff([args["file"]]) : await git.diff();
                result = diff || "(no changes)";
                if (result.length > 5000) result = result.slice(0, 5000) + "\n...[truncated]";
              } catch (err) {
                result = `Git diff error: ${err instanceof Error ? err.message : String(err)}`;
              }
              break;
            }

            case "applyPatch": {
              const filePath = args["path"]!;
              const patch = args["patch"]!;
              const fullPath = path.join(ws, filePath);
              let originalContent = "";
              try {
                originalContent = await fs.readFile(fullPath, "utf-8");
              } catch { /* new file */ }
              pendingChanges.push({ path: filePath, content: patch, originalContent, type: "modify", diff: patch });
              result = `Patch staged for ${filePath} — awaiting user approval`;
              break;
            }

            default:
              result = `Unknown tool: ${toolCall.function.name}`;
          }
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          logger.error({ err, tool: toolCall.function.name }, "Tool call error");
        }

        toolResults.push({ role: "tool", tool_call_id: rawToolCall.id, content: result });
      }

      messages.push(...(toolResults as OpenAI.Chat.Completions.ChatCompletionMessageParam[]));
    }

    const assistantMessages = messages.filter(
      (m): m is OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =>
        m.role === "assistant" && typeof m.content === "string" && !!m.content
    );
    const finalMessage = assistantMessages[assistantMessages.length - 1]?.content as string ?? "";

    res.json({
      message: finalMessage || (pendingChanges.length > 0
        ? `Prepared ${pendingChanges.length} file change(s) for review. Click Accept to apply.`
        : "Done."),
      plan: planText !== finalMessage ? planText : undefined,
      pendingChanges,
      toolCallsUsed,
      commandsRun,
    });
  } catch (err) {
    req.log.error({ err }, "Chat error");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `AI error: ${msg}` });
  }
});

router.post("/chat/apply", async (req, res) => {
  const { changes, workspace } = req.body as {
    changes: PendingChange[];
    workspace?: string;
  };
  const ws = workspace || process.cwd();
  const applied: string[] = [];
  const errors: string[] = [];

  for (const change of changes || []) {
    const fullPath = path.join(ws, change.path);
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, change.content, "utf-8");
      applied.push(change.path);
    } catch (err) {
      errors.push(`${change.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({ applied, errors });
});

export default router;
