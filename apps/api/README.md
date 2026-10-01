# @moodfood/api

The MoodFood 2.0 backend: NestJS 12 on Fastify, Postgres via Drizzle, and Redis. It replaces the Express app in `apps/backend` and keeps the same `/api/*` paths and response shapes, so the mobile app works against it unchanged.

## Run it locally

```bash
pnpm db:up                            # Postgres 17 + Redis 7 (docker-compose.yml at the repo root)
cp apps/api/.env.example apps/api/.env   # optional — every value has a local default
pnpm api                              # nest start --watch on :3001, applies migrations on boot
```

- OTP codes print in the API log (`SMS_PROVIDER=console`).
- `docker compose --profile tools up -d` adds Adminer (http://localhost:8081, server `postgres`, user/password `moodfood`) and Redis Insight (http://localhost:5540).
- `docker compose --profile app up -d --build` also runs the API and the intelligence service in containers. That needs `apps/intelligence/.env`.
- The admin panel is at http://localhost:3001/admin and uses `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

| Script | What it does |
| --- | --- |
| `pnpm --filter @moodfood/api test` | Unit tests (`src/**/*.test.ts`, node:test via tsx) |
| `pnpm --filter @moodfood/api test:e2e` | End-to-end suite against a running API: `API_URL=http://localhost:3001 SYNC_KEY=<INTELLIGENCE_SYNC_KEY>` |
| `pnpm --filter @moodfood/api db:generate` | Generate a SQL migration in `drizzle/` after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations without starting the server (when `DB_MIGRATE_ON_BOOT=false`) |
| `pnpm --filter @moodfood/api db:studio` | Drizzle Studio |

## Layout

```
src/
  main.ts                 Fastify adapter, JSON parser, CORS, global prefix /api, migrations on boot
  app.module.ts           Global guards (rate limit → auth) and the { error } exception filter
  config/env.ts           Every env var, validated with zod at boot (production refuses default secrets)
  core/                   Postgres pool + Drizzle, Redis, injection tokens
  db/schema.ts            All tables; migrations in ../drizzle
  common/                 Error shape, fetch timeout, Redis rate limiter
  auth/                   Sessions, OTP, password, phone normalisation, guard + decorators
  profile/                /user/me, /user/preferences, /user/history
  notifications/          /user/notifications + Expo push
  signals/                /signals (personalisation log), /predictions (calibration loop)
  recommendations/        /ai-recommendations (+ rule-based fallback)
  swiggy/                 Swiggy OAuth linking, encrypted tokens, /swiggy /instamart /recipe proxies
  social/                 /quests, /groups
  diy/                    /diy cooking sessions
  misc/                   /health, /weather, /game-assist, waitlist, analytics, admin
```

## Auth and user management

Sessions use opaque bearer tokens (`mfs_…`, 256-bit random). Postgres keeps only their SHA-256 hash in `auth_sessions`, one row per device. Redis caches lookups for 5 minutes, so revoking a session takes effect immediately.

- Send the token as `Authorization: Bearer <token>`. The v1 header `X-Session-Id: <token>` also works, and auth responses still return it as `user.sessionId`, so the existing app code didn't need to change.
- Every route needs a session by default. `@Public()` makes the session optional, `@AdminOnly()` accepts an admin-role session or HTTP Basic auth, and `@InternalOnly()` requires `x-sync-key`.
- Phone numbers are normalised to E.164 (`DEFAULT_PHONE_REGION=IN`). `9876543210`, `+91 98765 43210` and `098765-43210` all map to the same account; v1 created duplicates for these.
- OTPs live in Redis: hashed, valid for 5 minutes, 5 attempts. Rate limits allow 5 sends and 10 verifies per phone every 15 minutes.

| Endpoint | |
| --- | --- |
| `POST /api/auth/guest` | Anonymous account + session. Signing up later with that session upgrades the same user and keeps its data. |
| `POST /api/auth/signup` · `login` | Phone + password |
| `POST /api/auth/otp/send` · `otp/verify` | OTP login. An unknown number without `name` returns 404 `{ needsName: true }`. |
| `POST /api/auth/password/reset` | Forgot password: phone + OTP + new password. Signs out all devices. |
| `POST /api/auth/password` | Change password (needs `currentPassword` if one is set). Signs out other devices. |
| `POST /api/auth/logout` · `logout-all` | Revoke this session, or every other session |
| `GET /api/auth/sessions` · `DELETE /api/auth/sessions/:id` | List devices, revoke one |
| `GET /api/user/me` · `PUT /api/user/me` | Profile (name, email) and Swiggy link status |
| `POST /api/user/me/phone` | Change phone: OTP to the new number first |
| `DELETE /api/user/me` | Delete the account and all its data (app-store requirement) |

To make someone an admin: `UPDATE users SET role = 'admin' WHERE phone = '+91…';`

## Differences from v1 (`apps/backend`)

- Postgres only (no SQLite). Typed schema, real migrations, `jsonb` and `timestamptz` columns.
- No auto-created user per unknown session. v1 made a throwaway user for every request without a session; v2 has explicit guest accounts.
- **Redis holds the shared state**, so the API can run several replicas: rate limits, OTPs, Swiggy OAuth PKCE state (v1 kept this in memory, which broke with more than one instance), Swiggy client registration, and the weather cache.
- Rate limits count per session token (300 per 15 minutes), plus a per-IP ceiling (2000). v1's 100 per IP throttled order tracking and users behind a shared carrier IP. `/health` isn't rate-limited.
- `POST /api/user/notifications` can only notify yourself. In v1 any caller could target any `userId`.
- `PUT /api/user/me` no longer changes the phone number. That now needs an OTP, otherwise someone could claim a number they don't own.
- Re-linking the same Swiggy account updates the stored token. In v1 a unique-constraint error broke re-linking.
- Signal context uses IST for `time_of_day` / `day_of_week`; v1 used the server's clock.
- `GET /api/signals/understand-me` exists: the app called it but v1 never implemented it. It returns `{ questions: [] }` for now.
- Wall-photo upload is still locked until `WALL_PHOTO_BUCKET` is set, as in v1.
