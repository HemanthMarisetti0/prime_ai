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

## Environments

Each app has one settings file per environment. Real files are git-ignored; copy the matching `.example`.

| Environment | Backend | Frontend | Used by |
|---|---|---|---|
| Local (development) | `apps/backend/.env.development` | `apps/frontend/.env.development` | `pnpm dev` |
| Production | `apps/backend/.env.production` (or host env vars) | `apps/frontend/.env.production` | `pnpm build`, `pnpm --filter @prime/backend start` |

- Secrets (Gemini key) live only in the backend files. Frontend `VITE_*` values are embedded in the public bundle.
- Production refuses to start unless `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`, `ALLOWED_EMAILS` and `CORS_ORIGIN` are set.
- `SYSTEM_MONITOR` defaults to `false` in production (a cloud server would report its own hardware).

## Sign-in (Firebase, Google)

1. In the [Firebase console](https://console.firebase.google.com), create a project (optionally separate ones for development and production).
2. **Authentication → Sign-in method**: enable **Google**.
3. **Project settings → Your apps**: add a **Web app** and copy its config into the frontend file (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`).
4. In the backend file set `FIREBASE_PROJECT_ID` to the same project ID and `ALLOWED_EMAILS` to your Google address.
5. For production, add your site's domain under **Authentication → Settings → Authorized domains**.

The backend verifies Firebase ID tokens against Google's public keys, so no service-account secret is needed.
Leaving the Firebase values empty in development runs P.R.I.M.E. without sign-in.
