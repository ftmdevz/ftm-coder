# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 - Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

# Build tools needed to compile native modules (e.g. better-sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

WORKDIR /app

# ── Layer 1: workspace manifest files (cached unless deps change) ─────────────
# Copy only the files that affect pnpm install so the layer is reused on
# source-only changes (which is the common case).
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY scripts/patch-workspace.mjs scripts/
# Copy manifest files only (so this layer is cached on source-only changes)
COPY package.json ./
COPY artifacts/api-server/package.json   artifacts/api-server/
COPY artifacts/ftm-coder-ai/package.json artifacts/ftm-coder-ai/
# lib packages (mockup-sandbox is excluded by .dockerignore)
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json         lib/api-spec/
COPY lib/api-zod/package.json          lib/api-zod/
COPY lib/db/package.json               lib/db/
# Copy lib source needed at install time (tsconfig references etc.)
COPY lib ./lib

# Patch workspace yaml for pnpm@9 compatibility, then install deps
RUN node scripts/patch-workspace.mjs && \
    pnpm install --no-frozen-lockfile

# ── Layer 2: source (invalidated on every commit, but install is cached) ──────
COPY . .

# Re-patch in case the copy overwrote the patched file
RUN node scripts/patch-workspace.mjs

# Build packages
RUN pnpm --filter @workspace/ftm-coder-ai build
RUN pnpm --filter @workspace/api-server build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 - Runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runner

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        zstd \
        git && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/public
ENV AI_BASE_URL=http://localhost:11434/v1
# Best local coding model: fast, accurate, 4.7 GB on disk
# Override with AI_MODEL env var to use a different Ollama model
ENV AI_MODEL=qwen2.5-coder:7b
# Single persistent disk — mount at /data on Render.
# Ollama models → /data/ollama/models   User workspaces → /data/users
ENV DATA_DIR=/data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/ftm-coder-ai/dist/public ./public

# Native externalized packages — install so Node can resolve them at runtime.
# (jsonwebtoken + bcryptjs are bundled into dist by esbuild; no install needed)
RUN npm install archiver better-sqlite3 --no-save --prefix /app

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/root/.ollama"]

EXPOSE 3000 11434

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
