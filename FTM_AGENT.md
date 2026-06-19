# FTM_AGENT.md — Project Rules for FTM-CODER-AI

This file is read by the AI agent before starting any task. Place it in your project root to customize agent behavior.

## Project Overview

_Describe your project here so the AI understands the context._

## Tech Stack

_List the frameworks, languages, and libraries used._

## Coding Conventions

- Use TypeScript strict mode
- Follow existing file structure and naming conventions
- Write tests for new features when applicable
- Keep functions small and focused

## Agent Behavior Rules

- Always read existing files before modifying them
- Prefer editing specific sections over rewriting entire files
- Run type-checking after TypeScript changes
- Ask before performing large refactors (>5 files)
- Do not commit directly — stage changes for user review

## Off-Limits

_List files or directories the agent should never touch:_
- `.env` — never read or write
- `secrets/` — never touch

## Preferred Commands

_List the commands the agent should use for common tasks:_
- Install deps: `pnpm install`
- Run dev: `pnpm dev`
- Type-check: `pnpm typecheck`
- Test: `pnpm test`
- Build: `pnpm build`
