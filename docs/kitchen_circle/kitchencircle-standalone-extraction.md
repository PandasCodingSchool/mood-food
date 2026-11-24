# KitchenCircle — standalone extraction checklist

> Phase 9 deliverable. Records what KitchenCircle depends on today (audited from the code on 2026-10-28) and what an independent KitchenCircle app would need. Update it whenever a KitchenCircle module gains a dependency outside its boundary.

## Boundaries today

| Layer | KitchenCircle code | Depends on (outside the boundary) |
| --- | --- | --- |
| API (NestJS) | `apps/api/src/kitchen-circle/*` — one module, routes under `/api/kitchen-circle/*` | `core/tokens` (DB, Redis, Env), `db/schema` (shared Drizzle schema file), `common/http`, `common/rate-limit`, `auth/auth.guard` + `auth.types` (session auth, `@Public`, `@AdminOnly`), `intelligence/intelligence.service` (HTTP client to the Python service), `notifications` (in-app + Expo push), `swiggy/swiggy-tokens.service` (owner's Instamart token for live carts) |
| Intelligence (FastAPI) | `apps/intelligence/app/kitchen_circle/*`, `app/routes/kitchen_circle.py`, lab routes `/api/lab/kitchen-circle/*` | `app.config`, `app.llm` (OpenAI client), `app.lab.trace`, `app.services.diet` (allergen/diet normalisation), Instamart/Swiggy MCP client + order service (cart adapter only) |
| Mobile (Expo) | `app/kitchen-circle/*`, `app/cook/[token].tsx`, `src/features/kitchen-circle/*`, `assets/kitchen-circle/*` | `@moodfood/ui` + `@moodfood/tokens` (re-skinned by `ThemeOverride`), `src/components/v2` (`ErrorBlock`, `TopBar`), `src/services/apiBase` (base URL + auth headers), `src/services/secureStorage` (intro-seen flag) |
| Database | Tables `households`, `household_*`, `meal_*`, `recipe*`, `grocery_*`, `planner_*`, `cook_*`, `meal_feedback`, `slot_*`, `member_food_preferences` (migrations `0005`–`0018`) | `users` (FKs on every member/actor column) |

## Checklist

- [x] **Planner APIs work without MoodFood routes.** No KitchenCircle API file imports a MoodFood feature module (recommendations, signals, brain, games, DIY, social, profile). The only MoodFood-owned data it reads is the optional profile adapter below.
- [x] **MoodFood profile adapter can be disabled.** `KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED=false` makes `PlannerProfileAdapter` refuse (409) before any read; everything else is unaffected. It is a one-way, permissioned read of the member's own opted-in preference labels — never orders or history.
- [x] **Provider interfaces are explicit.** Groceries go through `KitchenCircleGroceryProvider` (`grocery_provider.py`) with `FixtureGroceryProvider` and `InstamartKitchenCircleAdapter`; the API selects the provider and gates writes. Planning, chat interpretation and translation are HTTP contracts (`/api/kitchen-circle/autofill`, `/chat/interpret`, `/cook/translate`, `/cart/*`) with versioned Pydantic schemas.
- [x] **Environment/configuration are isolated.** KitchenCircle-only switches: `KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED`, `KITCHEN_CIRCLE_LIVE_WRITES_ENABLED`, `KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED` (API); cook links use `FRONTEND_ORIGIN`. Shared infrastructure settings (DB, Redis, auth, AI service URL/key, Swiggy OAuth) are inherited, not duplicated.
- [x] **Planner database ownership / migration strategy documented** (below).
- [x] **Mobile feature can become a separate client with minimal rewrite.** All screens live under `app/kitchen-circle/` + `app/cook/` and all data access under `src/features/kitchen-circle/api.ts`. The brand is applied by one layout (`ThemeOverride` + `kitchenCircleTheme`), so a standalone app would use the same theme as its root theme.

## Database ownership and migration strategy

1. **Today:** KitchenCircle tables live in the MoodFood Postgres database and are created by the shared Drizzle migration sequence (`apps/api/drizzle`). They reference `users(id)` and nothing else outside KitchenCircle.
2. **Ownership rule:** only `apps/api/src/kitchen-circle/*` writes KitchenCircle tables; other modules must not read or write them. Keep KitchenCircle tables in their own section of `schema.ts`.
3. **Extraction path:**
   - Move KitchenCircle table definitions to their own schema file and Drizzle config (own `drizzle/` folder), generating a baseline migration from the current state.
   - Replace the `users` FK with an identity mapping table (`kc_accounts`) if the standalone app uses a separate identity provider; otherwise keep sharing the user table through the auth service.
   - Copy data with `INSERT … SELECT` per table in dependency order (households → members → plans → slots → recipes → grocery → planner/cook/feedback), then switch the API module's `DB` token to the new database.
4. **Cache tables** (`cook_translations`) can be dropped and rebuilt; they hold no source-of-truth data.

## Remaining work for a real standalone app

- Auth: either keep MoodFood accounts (shared auth service) or add KitchenCircle sign-up; cook links already work without any account.
- Notifications: `NotificationsService` and the users' push tokens are shared; a standalone app needs its own push credentials (`EXPO_ACCESS_TOKEN`) and token registration.
- UI kit: KitchenCircle renders through `@moodfood/ui`; a standalone app can keep the package (re-themed) or fork the handful of components it uses (`Screen`, `Surface`, `Text`, `Icon`, `Chip`, `FilterChip`, `SegmentedControl`, `Toggle`, `IconButton`).
- Live grocery: the Instamart adapter reuses MoodFood's Swiggy OAuth token store; a standalone app needs its own Swiggy client registration and token store.
