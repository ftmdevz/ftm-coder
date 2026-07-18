/**
 * install-dev-deps.mjs
 *
 * Installs dev dependencies for ftm-coder-ai and mockup-sandbox directly via npm,
 * bypassing pnpm workspace root (which is root-owned in Replit and can't be updated).
 *
 * It resolves:
 *   - "catalog:" versions  → actual semver from pnpm-workspace.yaml catalog section
 *   - "workspace:*" refs   → "file:<relative-path>" pointing to lib/ packages
 *
 * Usage:  node scripts/install-dev-deps.mjs [artifact-dir]
 *         node scripts/install-dev-deps.mjs artifacts/ftm-coder-ai
 *         node scripts/install-dev-deps.mjs   # installs both
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import { execSync } from "child_process";
import { resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Parse catalog from pnpm-workspace.yaml ───────────────────────────────────

function parseCatalog(workspaceYaml) {
  const catalog = {};
  const match = workspaceYaml.match(/^catalog:\n((?:[ \t]+.+\n?)*)/m);
  if (!match) return catalog;
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s+'?([^':\s]+)'?:\s*(.+)$/);
    if (m) catalog[m[1].trim()] = m[2].trim();
  }
  return catalog;
}

// ── Resolve workspace: package names → lib directory paths ───────────────────

function resolveWorkspacePkgPath(pkgName, artifactDir) {
  // @workspace/api-client-react → lib/api-client-react
  const shortName = pkgName.replace(/^@workspace\//, "");
  const libPath = resolve(ROOT, "lib", shortName);
  if (existsSync(libPath)) {
    return relative(artifactDir, libPath);
  }
  // fallback: try lib/integrations/
  const integPath = resolve(ROOT, "lib", "integrations", shortName);
  if (existsSync(integPath)) {
    return relative(artifactDir, integPath);
  }
  return null;
}

// ── Resolve deps for a package.json deps object ───────────────────────────────

function resolveDeps(deps, catalog, artifactDir) {
  if (!deps) return undefined;
  const out = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (ver === "catalog:") {
      out[name] = catalog[name] ?? "*";
    } else if (ver.startsWith("workspace:")) {
      const rel = resolveWorkspacePkgPath(name, artifactDir);
      out[name] = rel ? `file:${rel}` : "*";
    } else {
      out[name] = ver;
    }
  }
  return out;
}

// ── Ensure lib packages resolve their catalog: deps too ───────────────────────
// npm will traverse file: references and try to install their deps;
// if those deps contain "catalog:" npm won't understand them.
// We temporarily patch each lib package's package.json as well.

const patchedLibs = [];

function patchLibPackage(libDir, catalog) {
  const pkgPath = resolve(libDir, "package.json");
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  let needsPatch = false;
  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!pkg[section]) continue;
    for (const ver of Object.values(pkg[section])) {
      if (ver === "catalog:" || ver.startsWith("workspace:")) {
        needsPatch = true;
        break;
      }
    }
    if (needsPatch) break;
  }
  if (!needsPatch) return;

  const bakPath = pkgPath + ".orig";
  writeFileSync(bakPath, readFileSync(pkgPath)); // backup
  patchedLibs.push({ pkgPath, bakPath });

  const resolved = {
    ...pkg,
    dependencies: resolveDeps(pkg.dependencies, catalog, libDir),
    devDependencies: resolveDeps(pkg.devDependencies, catalog, libDir),
    peerDependencies: resolveDeps(pkg.peerDependencies, catalog, libDir),
  };
  writeFileSync(pkgPath, JSON.stringify(resolved, null, 2));
  console.log(`  ✓ patched lib package: ${relative(ROOT, libDir)}`);
}

function restoreLibPackages() {
  for (const { pkgPath, bakPath } of patchedLibs) {
    renameSync(bakPath, pkgPath);
  }
  patchedLibs.length = 0;
}

// ── Install one artifact ───────────────────────────────────────────────────────

function installArtifact(artifactDir, catalog) {
  const absDir = resolve(ROOT, artifactDir);
  const pkgPath = resolve(absDir, "package.json");
  const bakPath = resolve(absDir, "package.json.orig");

  console.log(`\n📦 Installing deps for ${artifactDir}...`);

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  // Patch any lib packages that this artifact references via workspace:
  for (const [name, ver] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (ver.startsWith("workspace:")) {
      const shortName = name.replace(/^@workspace\//, "");
      const libDir = resolve(ROOT, "lib", shortName);
      if (existsSync(libDir)) patchLibPackage(libDir, catalog);
    }
  }

  // Build resolved pkg
  const resolved = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: pkg.type,
    dependencies: resolveDeps(pkg.dependencies, catalog, absDir),
    devDependencies: resolveDeps(pkg.devDependencies, catalog, absDir),
  };

  // Backup and replace package.json
  writeFileSync(bakPath, readFileSync(pkgPath));
  writeFileSync(pkgPath, JSON.stringify(resolved, null, 2));

  try {
    console.log("  Running npm install (this may take a minute)...");
    execSync("npm install --legacy-peer-deps --no-audit --no-fund", {
      cwd: absDir,
      stdio: "inherit",
    });
    console.log(`  ✅ Done: ${artifactDir}`);
  } finally {
    // Always restore original package.json
    renameSync(bakPath, pkgPath);
    restoreLibPackages();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const workspaceYaml = readFileSync(resolve(ROOT, "pnpm-workspace.yaml"), "utf-8");
const catalog = parseCatalog(workspaceYaml);
console.log(`Resolved ${Object.keys(catalog).length} catalog entries.`);

const targets = process.argv[2]
  ? [process.argv[2]]
  : ["artifacts/ftm-coder-ai", "artifacts/mockup-sandbox"];

for (const target of targets) {
  installArtifact(target, catalog);
}

console.log("\n🎉 All done.");
