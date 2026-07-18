import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      // archiver uses createRequire at runtime — keep as external so it resolves from node_modules
      "archiver",
      "sharp",
      "better-sqlite3",
      // auth packages — native or CJS with dynamic requires; keep external
      // jsonwebtoken and bcryptjs are pure-JS; bundled directly (see nodePaths below)
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    // Allow esbuild to find packages installed by ensure-deps.mjs into the
    // persistent .local-deps directory (avoids pnpm store mismatch in Replit).
    nodePaths: [path.resolve(artifactDir, ".local-deps", "node_modules")],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll()
  .then(linkExternals)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/**
 * After bundling, create dist/node_modules/ symlinks for every externalized
 * native/CJS package. This lets Node resolve them via the normal directory
 * traversal without relying on NODE_PATH (which ESM doesn't honour reliably
 * for packages that have no `exports` field).
 *
 * Resolution order: dist/node_modules/<pkg> → artifacts/api-server/node_modules/<pkg>
 *                                           → workspace root node_modules/<pkg>
 *                                           → /home/runner/extra_modules/node_modules/<pkg>
 */
async function linkExternals() {
  const { mkdirSync, symlinkSync, existsSync, readdirSync } = await import("node:fs");
  const distNodeModules = path.resolve(artifactDir, "dist", "node_modules");
  mkdirSync(distNodeModules, { recursive: true });

  // Candidate lookup roots (highest to lowest priority)
  const roots = [
    path.resolve(artifactDir, "node_modules"),              // api-server local (pnpm)
    path.resolve(artifactDir, ".local-deps", "node_modules"), // ensure-deps.mjs persistent install
    path.resolve(artifactDir, "../..", "node_modules"),     // workspace root
  ];

  // Names of externalized packages that need runtime resolution
  const externals = [
    "better-sqlite3",
    "archiver",
  ];

  for (const pkg of externals) {
    const dest = path.join(distNodeModules, pkg);
    if (existsSync(dest)) continue; // already linked

    for (const root of roots) {
      const src = path.join(root, pkg);
      if (existsSync(src)) {
        symlinkSync(src, dest);
        console.log(`  → linked ${pkg} → ${src}`);
        break;
      }
    }
  }
}
