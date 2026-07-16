# ── Stage 1: Build everything ─────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy manifests first so Docker can cache the install layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/api-zod/package.json            ./lib/api-zod/package.json
COPY lib/api-spec/package.json           ./lib/api-spec/package.json
COPY lib/api-client-react/package.json   ./lib/api-client-react/package.json
COPY lib/db/package.json                 ./lib/db/package.json
COPY artifacts/api-server/package.json   ./artifacts/api-server/package.json
COPY artifacts/ftm-coder-ai/package.json ./artifacts/ftm-coder-ai/package.json

RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# Build React frontend → artifacts/ftm-coder-ai/dist/
RUN pnpm --filter @workspace/ftm-coder-ai run build

# Build Express backend (esbuild bundles everything) → artifacts/api-server/dist/
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production image with Ollama ────────────────────────────────────
FROM node:24-slim AS runner

# Install curl (needed by Ollama installer + health check) and zstd (needed to extract Ollama)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      zstd \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama binary
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

# Copy bundled server
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Copy built frontend — served as static files by Express
COPY --from=builder /app/artifacts/ftm-coder-ai/dist ./public

# Copy only runtime node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy startup script
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ollama models volume mount point
VOLUME ["/root/.ollama"]

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/public
ENV AI_BASE_URL=http://localhost:11434/v1
ENV AI_MODEL=glm4

EXPOSE 3000 11434

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
