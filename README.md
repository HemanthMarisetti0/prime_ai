# P.R.I.M.E.

**Personal Reasoning and Intelligent Machine Engine**: a personal AI assistant with a JARVIS-style HUD, voice control, live information tools and (when run on your own Windows PC) read-only diagnostics plus a small, fixed set of PC controls.

## Features

| Area | What it does |
|---|---|
| **Conversation** | Gemini-powered chat with conversation context and a courteous persona that addresses you as "Sir". Basic markdown in replies. |
| **Voice** | Dictation (mic button), spoken replies with selectable voice and speed, hands-free voice link (tap the core), and a **"Hey Prime"** wake word. |
| **HUD** | Animated reactor core reflecting state (standing by, listening, processing, responding, offline), live clock and link status, boot-up sequence, side panels that appear only when relevant. |
| **Images** | Attach, paste (`Win+Shift+S` then `Ctrl+V`), drag-and-drop or capture a screen/window, then ask about it. |
| **Weather** | Current conditions and 3-day forecast for your location or any city (Open-Meteo). |
| **News** | Top headlines or any topic (Google News RSS). |
| **YouTube** | Search and play in an embedded player; instant "pause / resume / next / stop / volume" commands. |
| **Places & directions** | "Cafés near me", "where is X", routes by car, bike or on foot with turn-by-turn steps and a Google Maps navigation link; transit hands off to Google Maps (OpenStreetMap services). |
| **Travel** | Trip itineraries with itemised budgets (estimates) and live currency conversion (Frankfurter / ECB rates). |
| **PC diagnostics** | CPU, memory, disks, GPU, battery and uptime; the assistant can answer questions about them. Read-only. |
| **PC control** | Windows system volume, screen brightness, opening apps from a fixed list, lock and sleep. Windows only, off in production. |
| **Security** | Firebase Google sign-in, backend token verification and an owner email allowlist. |

## Structure

```
prime/
  apps/
    frontend/   React + TypeScript + Vite HUD
      src/api/        HTTP clients (chat, health, system, PC control)
      src/auth/       Firebase sign-in
      src/components/ HUD, panels, input, boot sequence
      src/hooks/      chat, voice, wake word, hands-free, geolocation, stats
      src/media/      YouTube player, playback commands, images, chime
      src/pc/         instant PC command parsing
    backend/    NestJS REST API
      src/ai/         Gemini chat, persona, tool calling
      src/auth/       Firebase token guard, @Public()
      src/config/     validated environment settings
      src/pc/         volume, brightness, apps, lock/sleep (PowerShell)
      src/system/     hardware telemetry
      src/tools/      weather, news, YouTube, places, directions, currency
  packages/
    shared/     Type-only request/response contracts
```

## Requirements

- Node.js 24+
- pnpm 12 (via Corepack)
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey), free tier works)
- Chrome or Edge for voice input, hands-free mode and the wake word
- Windows for PC diagnostics/control (everything else is cross-platform)

## Getting started

```bash
pnpm install
cp apps/backend/.env.development.example apps/backend/.env.development    # add GEMINI_API_KEY
cp apps/frontend/.env.development.example apps/frontend/.env.development  # optional: Firebase values
pnpm dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port 3000.

## Commands

```bash
pnpm dev                              # frontend + backend with reload (development settings)
pnpm build                            # build all packages (frontend uses production settings)
pnpm typecheck                        # type-check all packages
pnpm --filter @prime/backend start    # run the built backend with .env.production
pnpm --filter @prime/frontend preview # serve the built frontend locally
```

## Environments

Each app has one settings file per environment. Real files are git-ignored; copy the matching `.example`.

| Environment | Backend | Frontend | Used by |
|---|---|---|---|
| Local (development) | `apps/backend/.env.development` | `apps/frontend/.env.development` | `pnpm dev` |
| Production | `apps/backend/.env.production` (or host env vars) | `apps/frontend/.env.production` | `pnpm build`, backend `start` |

### Backend settings

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | | `development` | `production` enables strict validation and production defaults |
| `GEMINI_API_KEY` | prod | | Gemini API key (secret) |
| `GEMINI_MODEL` | | `gemini-2.5-flash` | Any Gemini model; quotas are per model |
| `PORT` | | `3000` | HTTP port |
| `FIREBASE_PROJECT_ID` | prod | | Enables sign-in; empty disables it (development only) |
| `ALLOWED_EMAILS` | prod | | Comma-separated Google accounts allowed in |
| `CORS_ORIGIN` | prod | | Deployed frontend origin(s), comma-separated |
| `SYSTEM_MONITOR` | | dev `true`, prod `false` | Hardware telemetry for the AI and diagnostics panel |
| `PC_CONTROL` | | dev `true`, prod `false` | Volume, brightness, apps, lock/sleep (Windows only) |
| `NEWS_REGION` | | `IN` | Top-stories edition: `IN`, `US` or `GB` |
| `YOUTUBE_API_KEY` | | | YouTube Data API key; without it only a search link is shown |

Production refuses to start if a "prod" variable is missing.

### Frontend settings

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend URL when hosted separately; empty in development (proxy) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase web config; empty runs without sign-in |

`VITE_*` values are embedded in the public bundle: never put secrets there.

## Sign-in (Firebase, Google)

1. In the [Firebase console](https://console.firebase.google.com), create a project (optionally separate ones for development and production).
2. **Authentication → Get started**, then **Sign-in method**: enable **Google**.
3. **Project settings → Your apps**: add a **Web app** and copy its config into the frontend settings.
4. In the backend settings set `FIREBASE_PROJECT_ID` to the same project ID and `ALLOWED_EMAILS` to your Google address.
5. For production, add your site's domain under **Authentication → Settings → Authorized domains**.

The backend verifies Firebase ID tokens against Google's public keys, so no service-account secret is needed. `/api/health` is the only public route.

## Optional: YouTube playback

1. In the Google Cloud console for your project, enable **YouTube Data API v3**.
2. **APIs & Services → Credentials → Create credentials → API key**, restricted to YouTube Data API v3.
3. Set `YOUTUBE_API_KEY` in the backend settings. The free quota allows about 100 searches a day.

## Deploying to Render

`render.yaml` is a Render Blueprint that creates two services from the repository:

| Service | Type | Notes |
|---|---|---|
| `prime-backend` | Node web service (free) | Health check `/api/health`; PC telemetry and control are off |
| `prime-frontend` | Static site | `apps/frontend/dist`, SPA rewrite to `index.html` |

1. Push the repository, then in Render choose **New → Blueprint** and select it.
2. Enter the `sync: false` values when prompted:
   - `GEMINI_API_KEY`: your Gemini key.
   - `ALLOWED_EMAILS`: your Google address.
   - `YOUTUBE_API_KEY`: optional; use a separate key restricted to YouTube Data API v3.
   - `CORS_ORIGIN` and `VITE_API_URL`: enter placeholders if the URLs aren't known yet.
3. After the first deploy, copy the real URLs from the dashboard:
   - backend `CORS_ORIGIN` = the frontend URL (e.g. `https://prime-frontend.onrender.com`)
   - frontend `VITE_API_URL` = the backend URL (e.g. `https://prime-backend.onrender.com`)

   Then redeploy the **frontend** (Vite bakes `VITE_*` values in at build time); the backend restarts on its own after env changes.
4. In Firebase, add the frontend's domain under **Authentication → Settings → Authorized domains**.
5. Recommended: in Google Cloud → Credentials, restrict the Firebase browser key to your frontend domain.

Notes:

- Free web services sleep after ~15 minutes idle; the first request then takes about a minute (the HUD shows "Offline" until the backend wakes).
- The build uses `pnpm install --prod=false` because `NODE_ENV=production` also applies at build time.
- `.node-version` pins Node 24.

## Hosting the frontend on Vercel

`vercel.json` (at the repo root and in `apps/frontend`, whichever is the Vercel project's Root Directory) proxies `/api/*` to the Render backend and serves `index.html` for other paths. With the proxy, `VITE_API_URL` can stay empty and the browser never makes cross-origin calls. If you change the backend URL, update the `destination` in `vercel.json`.

Add the Vercel domain (e.g. `primeai1.vercel.app`) to Firebase **Authorized domains**.

## Things to say

| Category | Examples |
|---|---|
| Wake word | "Hey Prime" · "Hey Prime, what's the weather?" (ear icon turns it on) |
| Weather | "What's the weather?" · "Will it rain in Mumbai tomorrow?" |
| News | "What's the news?" · "News about cricket" |
| YouTube | "Play Believer by Imagine Dragons" · "Suggest videos about React" · "pause" · "next" · "turn it up" · "stop the music" |
| Places | "Find cafés near me" · "Where is Charminar?" |
| Directions | "Directions to the airport" · "How far is Golconda Fort?" · "Walk to the station" |
| Travel | "Plan a 3-day trip to Goa for 2 under ₹20,000" · "Convert 500 dollars to rupees" |
| Diagnostics | "How's my system doing?" · "Am I low on disk space?" · "Run a full system diagnostic" |
| PC control | "Set system volume to 40" · "Mute the computer" · "Set brightness to 60" · "Dim the screen" · "Open VS Code" · "Lock the computer" · "Put the laptop to sleep" |
| Images | Attach or paste a screenshot, then "What does this error mean?" |

Short, explicit playback and PC commands run instantly in the browser/backend without using Gemini quota. Vaguer requests ("it's too loud in here") go to the AI, which has the same tools.

## PC control safety

- Only fixed actions exist: volume (get/set/up/down/mute/unmute), brightness (get/set/up/down), opening apps from the list in `apps/backend/src/pc/apps.ts`, lock and sleep. No user text is ever executed.
- Lock and sleep run after a 3-second delay so the spoken confirmation can finish.
- All PC routes require the signed-in owner and are disabled in production or when `PC_CONTROL=false`.

## Limitations

- **Gemini free tier**: about 5 requests per minute and a small daily cap per model. Weather, news, YouTube, directions and trip questions use 2–3 requests each. Switch `GEMINI_MODEL` if one model's daily quota runs out.
- **Browser speech**: voice input and the wake word need Chrome or Edge, send audio to the browser's speech service and only work while the tab is open. iPhone Safari is unreliable for hands-free use.
- **HTTPS**: microphone and location need `localhost` or HTTPS, so other devices need an HTTPS address.
- **Phones**: the web app cannot change a phone's system volume or read its CPU/RAM/storage; PC diagnostics and control always refer to the machine running the backend.
- **Data quality**: travel times exclude live traffic; trip costs are AI estimates; CPU temperature needs administrator rights; brightness works on built-in laptop displays only.
- **Google News RSS** is licensed for personal, non-commercial use.
