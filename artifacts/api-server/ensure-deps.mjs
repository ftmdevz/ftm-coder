/**
 * ensure-deps.mjs
 *
 * Installs packages that can't be resolved through the pnpm workspace store
 * (store path mismatch in Replit dev environment) into a persistent local
 * directory: artifacts/api-server/.local-deps/node_modules
 *
 * Packages installed here:
 *  - jsonwebtoken + bcryptjs  → bundled by esbuild via nodePaths
 *  - better-sqlite3           → kept external; linked into dist/node_modules
 *
 * Run automatically before every build via the `build` npm script.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const depsDir = path.join(dir, ".local-deps");
const nodeModules = path.join(depsDir, "node_modules");

const PACKAGES = ["jsonwebtoken", "bcryptjs", "better-sqlite3"];

// Check which packages are missing
const missing = PACKAGES.filter(pkg => !existsSync(path.join(nodeModules, pkg)));

if (missing.length === 0) {
  console.log("✔ All local deps present — skipping install");
  process.exit(0);
}

console.log(`📦 Installing missing local deps: ${missing.join(", ")} …`);

mkdirSync(depsDir, { recursive: true });

// Write a minimal package.json so npm doesn't complain
writeFileSync(
  path.join(depsDir, "package.json"),
  JSON.stringify({ name: "ftm-api-local-deps", version: "1.0.0", private: true }),
);

try {
  execSync(
    `npm install ${missing.join(" ")} --prefix "${depsDir}" --no-save --no-audit --no-fund --prefer-offline`,
    { stdio: "inherit", cwd: depsDir },
  );
  console.log("✅ Local deps installed");
} catch (err) {
  console.error("❌ Failed to install local deps:", err.message);
  process.exit(1);
}
