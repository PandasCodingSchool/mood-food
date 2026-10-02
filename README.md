# MoodFood

> **From "I'm hungry" to eating in 90 seconds.**

MoodFood picks food for how you feel. You do a four-tap mood check-in or a 30-second game, and MoodFood combines that with the time of day and the weather to suggest three dishes, each with a reason. You can order them on Swiggy inside the app, or get the recipe and buy the ingredients on Instamart.

This is **MoodFood 2.0**: a pnpm + Turborepo monorepo with a new design system, a NestJS backend on Postgres and Redis, one Expo app for iOS, Android and the web, and a Next.js marketing site.

---

## What's in the repo

| Path | What it is | Stack | Local port |
| --- | --- | --- | --- |
| `apps/mobile` | The product app: iOS, Android and the web app | Expo SDK 57, expo-router, React Native 0.86, Reanimated 4 | 8081 |
| `apps/api` | Backend API: users and auth, personalisation, Swiggy linking, games, history | NestJS 12 (Fastify), Drizzle + Postgres, Redis | 3001 |
| `apps/intelligence` | Recommender, learning loop, Swiggy MCP client, recipes, moderation | Python 3.12, FastAPI | 8000 |
| `apps/site` | Marketing site: landing, waitlist, about | Next.js 16 (static) | 3002 |
| `packages/tokens` | Design tokens and the "living theme" (time × weather × mood) | TypeScript | — |
| `packages/ui` | Component kit used by the app and the web app | React Native + web | — |
| `apps/backend` | v1 Express API. **Superseded by `apps/api`**; remove after the beta cutover | Express | — |
| `apps/frontend` | v1 Vite web app. **Superseded by the Expo web build + `apps/site`** | React + Vite | — |
| `docs/` | Architecture notes and the 2.0 design handoff (`docs/design/moodfood-2.0`) | | |

```
           ┌──────────────┐      ┌──────────────┐
           │  apps/site   │      │ apps/mobile  │  iOS · Android · web
           │  (Next.js)   │      │   (Expo)     │
           └──────┬───────┘      └──────┬───────┘
          waitlist│                     │ /api/* (Bearer session)
                  ▼                     ▼
               ┌──────────────────────────┐        ┌──────────┐
               │        apps/api          │───────▶│ Postgres │
               │   NestJS · Fastify       │───────▶│  Redis   │
               └────────────┬─────────────┘        └──────────┘
                            │ private network
                            ▼
               ┌──────────────────────────┐        ┌──────────────────────┐
               │   apps/intelligence      │───────▶│ OpenAI · Swiggy MCP  │
               │   FastAPI                │        │ Open-Meteo           │
               └──────────────────────────┘        └──────────────────────┘
```

---

## Quick start

Requirements: Node 22+, pnpm (through corepack), Docker, and Python 3.12 if you run the intelligence service.

```bash
corepack enable
pnpm install

pnpm db:up              # Postgres 17 + Redis 7.4 in Docker (docker-compose.yml)
pnpm api                # API on :3001 — applies DB migrations on boot
pnpm mobile             # Expo dev server; press w for the web app
pnpm site               # marketing site on :3002
```

`pnpm dev` starts the API and the site together.

The intelligence service is needed for real recommendations, Swiggy and recipes. Without it the API falls back to rule-based picks.

```bash
cd apps/intelligence
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # OpenAI key, Swiggy token, SYNC_KEY
uvicorn app.main:app --port 8000 --reload
```

Or run it and the API in containers: `docker compose --profile app up -d --build`.

### Environment files

All of them are optional for local development unless noted.

| File | Copy from | Notes |
| --- | --- | --- |
| `apps/api/.env` | `apps/api/.env.example` | Every value has a local default. OTP codes are printed in the API log. |
| `apps/intelligence/.env` | `apps/intelligence/.env.example` | **Required:** `OPENAI_API_KEY`. Swiggy needs the bootstrap token. |
| `apps/mobile/.env` | — | `EXPO_PUBLIC_API_URL=http://localhost:3001/api` |
| `apps/site/.env.local` | `apps/site/.env.example` | API and web-app URLs for the waitlist form and links |

The shared secret `INTELLIGENCE_SYNC_KEY` (API) must equal `SYNC_KEY` (intelligence).

### Handy extras

- `docker compose --profile tools up -d` starts Adminer at http://localhost:8081 (server `postgres`, user and password `moodfood`) and Redis Insight at http://localhost:5540.
- The admin panel is at http://localhost:3001/admin, using `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
- `/design-system` in the app is a gallery of every UI component.

---

## Scripts

| Command | Does |
| --- | --- |
| `pnpm db:up` · `db:down` · `db:reset` | Start, stop, or wipe and restart local Postgres and Redis |
| `pnpm db:migrate` | Build the API and apply migrations without starting it |
| `pnpm typecheck` · `pnpm build` · `pnpm test` | Turborepo across all packages |
| `pnpm --filter @moodfood/api test:e2e` | API end-to-end suite against a running API (`API_URL=…`) |
| `pnpm --filter @moodfood/api db:generate` | New SQL migration after editing `apps/api/src/db/schema.ts` |
| `pnpm --filter @moodfood/mobile exec expo export --platform web` | Static web-app build |

---

## Features

- **Mood check-in and living theme.** The app's colours follow the time of day, the weather and your mood.
- **Decision games:** Snack Match, Meal Roulette, Mood Scoop, This or That, Craving Radar, Story mode, Bracket and Pantry mode. Every result feeds the learning loop.
- **Recommendations** come with reasons, healthier and budget swaps, live Swiggy restaurant matches, and a post-meal "how do you feel now?" step that calibrates future picks.
- **Ordering in the app:** link your Swiggy account to get menus, cart, coupons, checkout and live order tracking.
- **DIY:** turn any pick into a recipe, see what's missing from your pantry, and buy it on Instamart.
- **Accounts:** phone OTP or password login, guest mode that upgrades in place, device sessions, account deletion.
- **Retention:** mood streaks, taste quests and notifications.

API reference and auth details: [apps/api/README.md](apps/api/README.md). Site details: [apps/site/README.md](apps/site/README.md).

---

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the beta launch plan: hosting, domains, environments, mobile release tracks, rollout phases and the go/no-go checklist.

---

## License

MIT
