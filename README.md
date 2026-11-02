# P.R.I.M.E.

**Personal Reasoning and Intelligent Machine Engine**: a personal AI assistant, starting as a web chatbot.

## Structure

```
prime/
  apps/
    frontend/   React + TypeScript + Vite chat UI
    backend/    NestJS REST API (Gemini integration)
  packages/
    shared/     Type-only request/response contracts
```

## Requirements

- Node.js 24+
- pnpm 12 (via Corepack)

## Commands

```bash
pnpm install      # install all workspace dependencies
pnpm dev          # run frontend and backend in parallel
pnpm build        # build all packages
pnpm typecheck    # type-check all packages
```

## Configuration

The Gemini API key lives only in `apps/backend/.env` (never committed).
See `apps/backend/.env.example` once the backend is set up.
