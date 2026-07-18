---
name: Docker build timing
description: Why the Docker build takes a long time and how to fix it
---

## Problem
`pnpm install --no-frozen-lockfile` in the builder stage takes 3-5+ minutes on a cold cache because the pnpm virtual store must be rebuilt from scratch.

## Optimized Dockerfile structure (already applied)
Split COPY into two layers so source changes don't invalidate the install layer:
1. Copy only manifest files (pnpm-workspace.yaml, pnpm-lock.yaml, all package.json) → pnpm install (cached)
2. Copy full source → build (invalidated on source change, install is not)

**Why:** Standard Docker layer-cache trick. The install layer is only invalidated when package.json/pnpm-lock.yaml change, not when source files change.

## How to push to GHCR reliably
Use a CI/CD pipeline (GitHub Actions) rather than doing it interactively in Replit. The interactive shell has a 5-minute timeout which the cold install can exceed.

Alternatively, run on a local machine with Docker installed:
```bash
docker build -t ghcr.io/ftmdevz/ftm-coder-ai:latest .
docker push ghcr.io/ftmdevz/ftm-coder-ai:latest
```

## Key image details
- Registry: `ghcr.io/ftmdevz/ftm-coder-ai`
- Login: `echo $GHCR_TOKEN | docker login ghcr.io -u ftmdevz --password-stdin`
