# ── Stage 1: Build everything ─────────────────────────────────────────────────
FROM node:24-alpine AS builder

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

# ── Stage 2: Minimal production image ─────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Copy bundled server (esbuild already inlined all workspace deps)
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Copy built frontend — served as static files by Express
COPY --from=builder /app/artifacts/ftm-coder-ai/dist ./public

# Copy only runtime node_modules (pino transports, pg, ws optional deps, etc.)
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/public

EXPOSE 3000

CMD ["node", "--enable-source-maps", "/app/dist/index.mjs"]
