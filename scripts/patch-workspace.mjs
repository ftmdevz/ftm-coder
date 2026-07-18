// Runs inside Docker builder stage to make pnpm-workspace.yaml compatible.
import { readFileSync, writeFileSync } from "fs";

let c = readFileSync("pnpm-workspace.yaml", "utf8");

// 1. Remove minimumReleaseAge (crashes pnpm on startup)
c = c.replace(/^minimumReleaseAge:.*\n/m, "");

// 2. Remove minimumReleaseAgeExclude block (crashes pnpm on startup)
c = c.replace(/^minimumReleaseAgeExclude:\n([ \t]+.*\n)*/m, "");

// 3. Replace entire packages: block — the !(desktop) glob negation is not
//    supported by pnpm@9 and causes "no projects matched" errors.
const newPackages = [
  'packages:',
  '    - "artifacts/api-server"',
  '    - "artifacts/ftm-coder-ai"',
  '    - "artifacts/mockup-sandbox"',
  '    - "lib/*"',
  '    - "lib/integrations/*"',
  '    - "scripts"',
].join("\n");

c = c.replace(/^packages:.*(?:\n[ \t]+.*)*\n?/m, newPackages + "\n");

writeFileSync("pnpm-workspace.yaml", c);

// Verify
const result = readFileSync("pnpm-workspace.yaml", "utf8");
const pkgSection = result.match(/^packages:.*(?:\n[ \t]+.*)*/m)?.[0] ?? "(not found)";
console.log("pnpm-workspace.yaml patched OK\npackages section:\n" + pkgSection);
