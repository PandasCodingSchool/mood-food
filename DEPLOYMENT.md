# MoodFood 2.0 — Beta Deployment Plan

This plan takes MoodFood 2.0 from the monorepo to a closed beta and then an open beta. It favours managed services and little ops work over infrastructure we'd have to run ourselves. Everything ships as Docker images or static files configured by environment variables, so moving to AWS later is a re-hosting job, not a rewrite.

## TL;DR

| Piece | Where | Domain |
| --- | --- | --- |
| Marketing site (`apps/site`) | **Vercel** (static Next.js) | `moodfood.fun` |
| Web app (Expo web export of `apps/mobile`) | **Vercel** (static SPA) | `app.moodfood.fun` |
| API (`apps/api`) | **Railway**, Docker, Singapore region | `api.moodfood.fun` |
| Intelligence (`apps/intelligence`) | **Railway**, Docker, **private network only** | none (internal) |
| Postgres 17 + Redis 7 | **Railway** managed databases, same region | internal |
| iOS / Android | **EAS Build + Submit**, **TestFlight** and **Play closed testing**, **EAS Update** for JS fixes | — |

**Releases go through the `production` branch:** merge work into `main`, then merge `main` into `production`. That push deploys everything: Railway (after CI passes) and Vercel. Only `production` builds; other branches don't deploy. A `staging` environment is planned for later; only production exists today.

### Why this setup

- **Railway is already in use.** It runs Dockerfiles, has managed Postgres and Redis, private networking between services, a pre-deploy migration command, per-environment variables and one-click rollback.
- **Singapore is the closest Railway region to India.** Users, Swiggy and the database all sit within about 60–80 ms. If latency becomes a problem, AWS `ap-south-1` (Mumbai) is the move-up path.
- **Vercel suits the two static front ends.** Both are static builds with instant rollback and preview URLs.
- **Not Kubernetes or self-managed AWS for beta.** Before product-market fit, the ops cost outweighs the control.

---

## 1. Architecture in production

```
 Browsers ─▶ moodfood.fun (Vercel: site)            ─┐
 Browsers ─▶ app.moodfood.fun (Vercel: web app)     ─┤ HTTPS, CORS-allowed
 iOS/Android app (EAS builds) ───────────────────────┤
                                                      ▼
                                  api.moodfood.fun (Railway: api, 1–2 replicas)
                                     │            │             │
                       private ▼     ▼ private    ▼ private
                    intelligence   Postgres     Redis
                    (+ volume)        │
                        │          daily backups
                        ▼
                OpenAI · Swiggy MCP · Open-Meteo
```

**The intelligence service must never get a public domain.** It doesn't check the `AI_SERVICE_KEY` header the API sends, and it holds the Swiggy bootstrap token. Only the API reaches it, over Railway's private network.

---

## 2. Domains and URLs

| Setting | Value |
| --- | --- |
| Site | `https://moodfood.fun` (and `www` redirect) |
| Web app | `https://app.moodfood.fun` |
| API base | `https://api.moodfood.fun/api` |
| Swiggy OAuth redirect | `https://api.moodfood.fun/api/swiggy/oauth/callback` |
| Staging | `staging.moodfood.fun`, `app.staging.moodfood.fun`, `api.staging.moodfood.fun` |

**Repo changes:**
- Done: `apps/mobile/eas.json` points `preview` and `production` at `https://api.moodfood.fun/api` and `development` at the staging API. (v1 builds pointed at `https://moodfood.fun/api`, which becomes the marketing site.)
- If Swiggy's MCP approval lists allowed redirect URIs, add the new callback before launch. The API registers its OAuth client at runtime with whatever `SWIGGY_OAUTH_REDIRECT_URI` says.
- The redirect URI is whitelisted on the Swiggy MCP gateway as an exact match. `SWIGGY_OAUTH_REDIRECT_URI` must equal it character for character. Email builders@swiggy.in *before* shipping any new or changed URI.

**Swiggy token lifecycle** (`apps/api/src/swiggy/`):
- Tokens are AES-256-GCM encrypted with `SWIGGY_TOKEN_ENCRYPTION_KEY` and bound to the user id. They never reach the client. Back up the key: losing or changing it forces every user to re-link.
- Swiggy v1 tokens last 5 days and there is no refresh token. An hourly sweep deletes expired tokens and sends a "reconnect" notification about 12 hours before expiry.
- When Swiggy rejects a user's token (401/403/419), the intelligence service sets `X-Swiggy-Token-Rejected: 1`. The API then deletes the link and notifies the user.
- Disconnecting, or deleting the account, calls Swiggy's `/auth/logout` and deletes the stored token.

---

## 3. Railway setup (do it for staging first, then production)

One Railway project, `moodfood`, with environments `staging` and `production`. Services:

### 3.1 Postgres and Redis

- Add the **Postgres** and **Redis** databases from Railway's catalogue in the Singapore region.
- Turn on **Postgres backups** (daily, 7+ days kept) in production. Before inviting testers, restore a backup into staging once.
- Redis holds OTPs, Swiggy OAuth state, rate-limit windows and caches. Losing it logs nobody out, because sessions live in Postgres.

### 3.2 `api`

| Setting | Value |
| --- | --- |
| Source | `PandasCodingSchool/mood-food`, branch **`production`**; **wait for CI** on; watch patterns `apps/api/**` + root lockfiles (intelligence: root `apps/intelligence`, watches `apps/intelligence/**`) |
| Builder | Dockerfile at `apps/api/Dockerfile`, build context = repo root |
| Pre-deploy command | `node dist/db/migrate.js` |
| Start command | (from Dockerfile) `node dist/main.js` |
| Health check | `/api/health` (returns 503 if Postgres or Redis is down) |
| Replicas | 1 in staging; 2 in production for zero-downtime deploys |
| Public domain | `api.moodfood.fun` |

API variables (see `apps/api/.env.example` for all of them):

```env
NODE_ENV=production
PORT=3001
TRUST_PROXY=true
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
DB_MIGRATE_ON_BOOT=false            # the pre-deploy command migrates once per release
CORS_ORIGINS=https://moodfood.fun,https://app.moodfood.fun
AI_SERVICE_URL=http://intelligence.railway.internal:8000
INTELLIGENCE_SYNC_KEY=<random 32+ chars, same as intelligence SYNC_KEY>
SWIGGY_TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>   # never rotate without a re-link plan
SWIGGY_OAUTH_REDIRECT_URI=https://api.moodfood.fun/api/swiggy/oauth/callback
FRONTEND_ORIGIN=https://app.moodfood.fun
ADMIN_USERNAME=<not "admin">
ADMIN_PASSWORD=<strong; the API refuses to boot with "changeme">
SMS_PROVIDER=twilio            # or leave unset: the app then hides SMS OTP and offers email + password
TWILIO_ACCOUNT_SID=…  TWILIO_AUTH_TOKEN=…  TWILIO_PHONE_NUMBER=…
EMAIL_PROVIDER=resend          # verification + password reset codes
RESEND_API_KEY=re_…            # the API refuses to boot without it when EMAIL_PROVIDER=resend
EMAIL_FROM=MoodFood <no-reply@moodfood.fun>
RATE_LIMIT_SIGNUP=20           # sign-ups per IP per 15 min (email sign-up has no OTP gate)
EXPO_ACCESS_TOKEN=<for push>
```

Notes:
- **Migrations are forward-only.** For a breaking schema change, use expand → deploy → contract across two releases, so old and new replicas can run side by side.
- **Private networking:** if the API can't reach `intelligence.railway.internal`, the environment's private network may be IPv6-only. Make uvicorn listen on `::` (and the API too if anything calls it privately).
- **Email (Resend):** add `moodfood.fun` as a domain in Resend and create its DNS records in Vercel (team pank1999s-projects). Resend's SPF/MX records sit on the `send.` subdomain and DKIM is a `resend._domainkey` TXT, so the Hostinger mail records on the apex stay untouched. Sending only works once Resend shows the domain as verified; until then a sign-up still succeeds, but its verification email fails and is logged. Without `EMAIL_PROVIDER=resend`, codes are only printed in the API log, so forgot password can't work in production.
- **OTP SMS in India:** sending SMS to Indian numbers needs DLT registration (sender ID and template). Start this early; it can take days. Until then, use password login, or keep `SMS_PROVIDER=console` in staging only.

### 3.3 `intelligence`

| Setting | Value |
| --- | --- |
| Builder | Dockerfile at `apps/intelligence/Dockerfile` (context `apps/intelligence`) |
| Public domain | **none** |
| Volume | mount at `/data` |
| Health check | `/health` |

```env
OPENAI_API_KEY=…                       # also set a monthly spend limit in the OpenAI dashboard
SWIGGY_BOOTSTRAP_TOKEN=…
SWIGGY_TOKEN_FILE=/data/swiggy_token.json
MODEL_STORE_PATH=/data/model_store.db   # rebuildable cache; replays from the API if lost
SYNC_KEY=<same as INTELLIGENCE_SYNC_KEY>
NODE_BASE_URL=http://api.railway.internal:3001
```

**Swiggy bootstrap token:** it lasts about 5 days and doesn't refresh itself (see `apps/intelligence/.env.example`).
- Discovery breaks when it expires.
- For beta, put a recurring calendar reminder to run `python -m scripts.swiggy_auth --save` against the volume every 4 days.
- Automate this before open beta.

### 3.4 Old v1 services

`apps/backend` and `apps/frontend` aren't deployed in 2.0.
- Once production is verified, point `moodfood.fun` at the new site and shut the old Railway/Vercel services down.
- Then delete both folders from the repo in a separate commit.

---

## 4. Vercel setup

Two projects from the same repo. Vercel's Hobby plan is for non-commercial use only, so use **Pro** (or Cloudflare Pages) for a public beta.

| Project | Root directory | Build | Output | Env |
| --- | --- | --- | --- | --- |
| `moodfood-site` | `apps/site` | `pnpm --filter @moodfood/site build` (framework: Next.js) | default | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |
| `moodfood-web` | `apps/mobile` | `pnpm --filter @moodfood/mobile exec expo export --platform web` | `dist` | `EXPO_PUBLIC_API_URL=https://api.moodfood.fun/api` |

The web app is a single-page app, so every path must serve `index.html`. `apps/mobile/vercel.json` already sets that up: the build command, `dist` output, a rewrite of every path to `index.html`, and long cache headers for hashed assets.

Both projects get preview deployments per PR. To test a preview against staging, point its env vars at the staging API.

---

## 5. Mobile releases (EAS)

| Track | Who | How |
| --- | --- | --- |
| Internal | Team (≤ 25) | `eas build --profile preview` (APK / ad-hoc), or the Play **internal testing** track and **TestFlight internal** |
| Closed beta | Invited testers | Play **closed testing** track + **TestFlight external** (public link with a tester cap; needs Beta App Review, usually about a day) |
| Open beta | Anyone with the link | Play **open testing** + TestFlight public link |

```bash
pnpm --filter @moodfood/mobile exec eas build --platform all --profile production
pnpm --filter @moodfood/mobile exec eas submit --platform all --profile production
# JS-only fixes, no store review:
pnpm --filter @moodfood/mobile exec eas update --channel production --message "fix: …"
```

- **EAS Update:** set it up before the first beta build (`eas update:configure`, then a `channel` per build profile and a `runtimeVersion` policy). Without it, every JS fix needs a new store build.
- **Google Play:** new personal developer accounts must run a closed test with at least 12 testers for 14 days before production access. Start the closed test early.
- **Store listing requirements:** a privacy policy URL, an in-app account-deletion path, and the Data safety / App Privacy forms (phone number, approximate location for weather, mood data, push token).
  - Settings → **Delete account** (with a confirm step) calls `DELETE /api/user/me`.
- **Version:** release 2.0.0 on the existing listing (`com.pank1999.moodfood`), as planned.

To reinstall a test build on an Android device:

```bash
adb uninstall com.pank1999.moodfood
pnpm --filter @moodfood/mobile exec eas build --platform android --profile preview
```

---

## 6. CI/CD flow

```
feature PR ─▶ main ── GitHub Actions (typecheck · build · tests)
release PR ─▶ main → production
                 ├─▶ GitHub Actions on production ─▶ Railway api + intelligence (wait for CI, pre-deploy migrate)
                 └─▶ Vercel moodfood-site + moodfood-web (builds only on `production`)
mobile: tag v2.x.y ─▶ eas build + submit   ·   JS hotfix ─▶ eas update
```

- `.github/workflows/ci.yml` runs `turbo typecheck build`, the JS tests (`turbo test`; the API and tokens packages) and pytest.
- **Add a post-deploy step** that runs the API end-to-end suite against staging:
  ```bash
  API_URL=https://api.staging.moodfood.fun SYNC_KEY=… ADMIN_BASIC=user:pass \
    pnpm --filter @moodfood/api test:e2e
  ```
  - Staging only: the suite creates test users and waitlist rows.
  - It also expects the default rate limits, and in staging it can't complete OTP login without `SMS_PROVIDER=console`.

---

## 7. Rollout phases

| Phase | Audience | Entry criteria | Watch |
| --- | --- | --- | --- |
| **0. Staging dry run** (week 0) | Team | Everything in §8 under "Before anyone outside the team" | Full flow on a real Android, iPhone and desktop browser: login → check-in → game → recs → link Swiggy → real order → tracking → post-meal |
| **1. Internal alpha** (1 week) | Team + friends, ≤ 25 | Phase 0 clean for 3 days | Crashes, API 5xx, recommendation latency, Swiggy order success |
| **2. Closed beta** (2–4 weeks) | Waitlist invites in batches of 50–100 | Crash-free sessions ≥ 99%, order success ≥ 95%, no P1 bugs open | OpenAI cost per active user, OTP delivery rate, D1/D7 retention, games played → order conversion |
| **3. Open beta** | Public links + site CTA | Two clean weeks of closed beta; Swiggy token refresh automated; on-call rota | Same, plus API p95 latency and Postgres/Redis load. Add a third API replica if p95 > 1.5 s |

- **Inviting from the waitlist:** export it from the admin panel (`/admin`, or `GET /api/admin/waitlist`) and email the store test links in batches.
- **Batch size:** keep batches small, so a Swiggy or OpenAI rate-limit problem only hits a few people.

---

## 8. Go/no-go checklist

### Before anyone outside the team

- [ ] Production and staging deployed; `GET https://api.moodfood.fun/api/health` → `{"status":"ok"}`
- [ ] Intelligence has **no** public domain; the API reaches it privately (`/api/ai-recommendations` returns `live_status` other than `offline`)
- [ ] Secrets set: strong `ADMIN_PASSWORD`, unique `SWIGGY_TOKEN_ENCRYPTION_KEY` (stored in a password manager), `INTELLIGENCE_SYNC_KEY` matches `SYNC_KEY`
- [ ] Postgres backups on and one restore tested
- [x] `eas.json` points to `https://api.moodfood.fun/api`
- [ ] Swiggy OAuth redirect updated, and a link → order → track run done on a real device
- [ ] SMS: Twilio (or an Indian provider) with DLT registration done, **or** OTP disabled in the UI in favour of password login
- [ ] OpenAI monthly spend limit set; Railway usage alerts on
- [ ] Uptime monitor (Better Stack / UptimeRobot) on `/api/health`, `moodfood.fun` and `app.moodfood.fun`, alerting to phone

### Before closed beta (external testers)

- [ ] **Privacy policy and terms published** on the site (the app's login screen refers to both; stores require the policy URL). Needs real legal text.
- [ ] **Error tracking:** add Sentry (or similar) to `apps/mobile`, `apps/api` and `apps/intelligence`. None is wired yet.
- [ ] EAS Update configured, with one test update done end to end
- [ ] Swiggy bootstrap token refresh owner and schedule agreed
- [x] "Delete account" in the app's Settings, calling `DELETE /api/user/me` (both stores require it)
- [ ] Store listings: screenshots, Data safety / App Privacy forms, test account for reviewers (password login)
- [ ] Old v1 services off; `moodfood.fun` serves the new site

### Before open beta

- [ ] Swiggy token refresh automated (a Railway cron service or a scheduled job)
- [ ] Web session hardening reviewed: the web app keeps its session token in `localStorage`. Consider moving to an HttpOnly cookie.
- [ ] Load test of recommendations → cart (k6) against staging with 2 API replicas
- [ ] Runbook for: rollback, Swiggy token expiry, OpenAI outage (the API falls back to rule-based picks), Redis flush

---

## 9. Rollback

| What | How |
| --- | --- |
| API / intelligence | Railway → service → Deployments → **Rollback** to the previous image. Migrations are forward-only, so only roll back across releases whose migrations were additive. |
| Site / web app | Vercel → Deployments → **Promote** the previous deployment (instant). |
| Mobile JS | `eas update:republish` a previous update to the channel, or roll back from the EAS dashboard. |
| Mobile native | Halt the staged rollout in Play Console; expire the build in TestFlight. |
| Data | Restore the Postgres backup into a new database, point `DATABASE_URL` at it, redeploy. |

---

## 10. Rough monthly cost (beta)

These are estimates for planning only. Check current pricing before committing.

| Item | Estimate |
| --- | --- |
| Railway (plan + api ×2, intelligence, Postgres, Redis) | ~$30–60 |
| Vercel Pro | $20 per seat |
| EAS (free tier to start; Starter if builds queue too long) | $0–19 |
| Apple Developer Program | $99 / year |
| Google Play developer account | $25 one-time |
| Twilio / SMS (per OTP, DLT for India) | usage |
| OpenAI | usage. Watch cost per active user; recommendations are the main driver. |

---

## 11. Later: scaling past beta

When usage outgrows Railway, or latency to India matters more:
- **AWS Mumbai (`ap-south-1`):**
  - ECS Fargate for `api` and `intelligence`, using the same Docker images.
  - RDS Postgres and ElastiCache Redis.
  - CloudFront in front of the static web app.
- **What's already ready for it:**
  - The API is stateless; sessions, OTPs, OAuth state and rate limits are all in Postgres or Redis. It scales horizontally as-is.
  - `output: 'standalone'` on the site and the API's Docker image allow self-hosting on AWS.
- **Still to build:**
  - A job queue (BullMQ on the same Redis) for push notifications and learning signals.
  - OpenTelemetry tracing across api → intelligence. Request ids already flow through as `x-request-id`.
