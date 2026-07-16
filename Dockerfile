# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 - Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

ENV PNPM_CONFIG_SUPPORTED_ARCHITECTURES_OS=linux
ENV PNPM_CONFIG_SUPPORTED_ARCHITECTURES_CPU=x64,arm64

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

# Copy the entire workspace
COPY . .

# Debug (remove later)
RUN node -v
RUN pnpm -v

# Install dependencies
RUN pnpm install --frozen-lockfile

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
        zstd && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/public
ENV AI_BASE_URL=http://localhost:11434/v1
ENV AI_MODEL=glm4

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/ftm-coder-ai/dist ./public

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/root/.ollama"]

EXPOSE 3000 11434

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
