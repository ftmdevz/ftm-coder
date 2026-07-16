# ── Stage 1: Build everything ─────────────────────────────────────────────────
FROM node:24-slim AS builder

ENV PNPM_CONFIG_SUPPORTED_ARCHITECTURES_OS=linux
ENV PNPM_CONFIG_SUPPORTED_ARCHITECTURES_CPU=x64,arm64

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml./
COPY lib/api-zod/package.json./lib/api-zod/package.json
COPY lib/api-spec/package.json./lib/api-spec/package.json
COPY lib/api-client-react/package.json./lib/api-client-react/package.json
COPY lib/db/package.json./lib/db/package.json
COPY artifacts/api-server/package.json./artifacts/api-server/package.json
COPY artifacts/ftm-coder-ai/package.json./artifacts/ftm-coder-ai/package.json

RUN pnpm install --frozen-lockfile

COPY..

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/ftm-coder-ai run build
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production image with Ollama ────────────────────────────────────
FROM node:24-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      zstd \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

COPY --from=builder /app/artifacts/api-server/dist./dist
COPY --from=builder /app/artifacts/ftm-coder-ai/dist./public
COPY --from=builder /app/node_modules./node_modules
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/root/.ollama"]

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/public
ENV AI_BASE_URL=http://localhost:11434/v1
ENV AI_MODEL=glm4

EXPOSE 3000 11434

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
