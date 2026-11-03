# KitchenCircle Development Status

> This is the single implementation ledger for KitchenCircle. Update it whenever a phase begins, a meaningful deliverable lands, testing runs, scope changes, or a blocker is discovered.
>
> **Last updated:** 2026-10-29
> **Current milestone:** Phases 0–6 and 9 complete; Phases 7–8 code complete. Pending: visual check of the brand/cook/household UI in the app, Phase 7 live Instamart verification.

## Status key

| Status | Meaning |
| --- | --- |
| Not started | No implementation work has begun. |
| In progress | Implementation/design work is underway. |
| Complete | Phase exit criteria are met and verification is recorded. |
| Blocked | Work cannot proceed until the recorded blocker is resolved. |
| Deferred | Intentionally moved to a later phase. |

## Phase summary

| Phase | Scope | Status | Completion |
| --- | --- | --- | ---: |
| 0 | Domain contracts, feature boundaries, and guardrails | Complete | 100% |
| 1 | Household, roles, and current-week plan | Complete | 100% |
| 2 | Next-week planning, recurring rules, preferences, attendance | Complete | 100% |
| 3 | Structured recipes and private household recipes | Complete | 100% |
| 4 | Grocery requirements, dedupe, pantry, and cart snapshots | Complete | 100% |
| 5 | Household auto-fill and planning intelligence | Complete | 100% |
| 6 | Shared chat and typed planner actions | Complete | 100% |
| 7 | Instamart matching, pack optimization, owner checkout | Code complete — live verification pending | 90% |
| 8 | Cook experience, translations, notifications, post-meal feedback | Code complete — visual check pending | 95% |
| 9 | Streamlit Planner Lab, observability, standalone readiness | Complete | 100% |

---

## Phase 0 — Domain contracts, feature boundaries, and guardrails

**Status:** Complete  
**Completion:** 100%

### Objective

Create isolated KitchenCircle API, intelligence, and mobile boundaries with versionable contracts, clear permissions, and feature gating. KitchenCircle must remain portable to a future standalone client.

### Planned deliverables

- [x] NestJS `kitchen-circle` module boundary.
- [x] Intelligence-service `kitchen_circle` boundary: `apps/intelligence/app/kitchen_circle/` + `app/routes/kitchen_circle.py` (added in Phase 5).
- [x] Mobile `kitchen-circle` route/feature boundary.
- [x] Public API namespace: `/api/kitchen-circle/*`.
- [x] Initial typed contracts for household, member role, plan, day slot, and activity.
- [x] Owner/member/cook permission policy encoded in integration tests: E2E `enforces the owner / member / cook / outsider permission matrix` checks 15 endpoint classes (plan read/edit, members, settings, invites, rules, attendance, chat, cook links, cook week, recipes, carts, proposals, locking) for all four roles.
- [x] Feature flags: `KITCHEN_CIRCLE_ENABLED` (master switch — every KitchenCircle route answers 404 via `KitchenCircleEnabledGuard`, `GET /api/kitchen-circle/status` tells the app, the Home switch hides, the notifier idles), `KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED`, `KITCHEN_CIRCLE_LIVE_WRITES_ENABLED`, `KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED`. Verified with an instance started disabled: KitchenCircle routes and cook links 404, status `enabled: false`, MoodFood `/user/me` and `/health` 200.
- [x] Database migration generated and applied locally.

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Phase plan and KitchenCircle product/technical specification created. Phase 0 implementation started. |
| 2026-06-16 | Added isolated NestJS KitchenCircle module, `/api/kitchen-circle/*` namespace, Drizzle schema/migration, calendar helpers, and initial Expo route/API feature boundary. |
| 2026-06-16 | Migration `0005_magenta_colonel_america` generated and applied locally. |
| 2026-10-28 | Completed: permission-matrix E2E and the `KITCHEN_CIRCLE_ENABLED` master switch (guard, status route, mobile gating). |

### Blockers / decisions needed

- No current blocker. Intelligence route boundary is intentionally deferred until auto-fill work; an empty endpoint would add no value.

### Verification

- `pnpm db:migrate` — passed.
- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (42 tests).

---

## Phase 1 — Household, roles, and current-week plan

**Status:** Complete  
**Completion:** 100%

### Objective

Allow solo/shared households to create and collaboratively maintain one current-week plan, starting on a selected current date and ending Sunday.

### Planned deliverables

- [x] Household, membership, plan, day-slot, and activity migrations.
- [x] Invitation and attendance migrations (`0006`, `0007`; phone invites `0019`).
- [x] Solo household creation and household listing API.
- [x] Initial owner/member/cook role authorization in plan/slot service paths.
- [x] Current-week plan creation/retrieval API.
- [x] Day state, servings, notes, and lock/unlock API actions.
- [x] Initial mobile KitchenCircle route, Home entry, and solo-household plan view.
- [x] Activity trail written for household creation, slot update, lock, and unlock.
- [x] Calendar unit tests and DB-backed API integration coverage.
- [x] Household setup form and interactive mobile slot editing.
- [x] Shared-household invitation and attendance flows end to end: household screen (invites, members, activity), per-day “I'm eating / I'm out” and “N of M eating” on the plan, `PATCH /households/:id` settings, member list/leave/remove, and the auditable activity history in the app.

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Added current-week plan schema/service/controller and a mobile foundation screen. The first mobile entry currently creates a default solo household; richer setup and slot editing are pending. |
| 2026-06-16 | Added and ran a DB-backed API end-to-end test covering solo-household creation, current-week plan generation, slot edit, lock/unlock protection, and activity history. |
| 2026-06-16 | Replaced the temporary mobile foundation with household name/default-serving setup and in-app meal, leftovers, household-out, servings, and lock controls. |

### Blockers / decisions needed

- None. The in-app visual check of the new household screen is pending (see Phase 8 note).

### Verification

- `pnpm db:migrate` — passed.
- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (42 tests).

---

## Phase 2 — Next-week planning, recurring rules, preferences, and attendance

**Status:** Complete  
**Completion:** 100%

### Planned deliverables

- [x] Next Monday–Sunday plan creation, idempotency, and mobile entry point.
- [x] Next-week plan navigation: This week / Next week switch on the plan, with a “Start next week” empty state.
- [x] Account-bound email invitations for member and cook roles; invitation acceptance requires authentication with the invited email.
- [x] Phone invitations (normalised like sign-up phones; accepted only by the account with that phone) and owner invitation management: list with status (pending/accepted/revoked/expired, tokens never listed), resend (new token, old link stops working, fresh 7 days), revoke; duplicate-pending and already-a-member checks; invites shared as a `/kitchen-circle/join/:token` link through the share sheet; existing users also get an in-app invite notification.
- [x] Per-day self-attendance with an explicit attending/absent state; absence is stored as an override and attendance defaults to present.
- [x] Recurring household rules with the plan's examples as presets: vegetarian day, no onion/garlic, quick day (≤30 min), elaborate meal welcome, cook unavailable (planner favours easy ≤35-min dishes), weekday budget (saved; not scored until recipes carry prices — reported in `ignoredRules`), recurring member absence (applied as attendance for that weekday unless the member says otherwise). Rules are stored as every-week or **just this week** (`applies_to_week_start`); the chat's “Just this week” answer now creates a week-scoped rule.
- [x] Preference-strength model (can't eat / never plan / prefer less / favourite × diet, allergy, ingredient, cuisine, protein, dish) with a private “what I eat” screen (only the author can list or delete their preferences), and Looks good / Not for me reactions with counts on upcoming planned days.
- [x] MoodFood profile adapter: “Import from MoodFood” imports only the member's own diets, allergies and favourite cuisines (never orders or history); can be switched off with `KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED=false`. Imported allergies are enforced by the planner (category alias fix, Phase 8).

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Added an owner/member-only next-week creation API. It creates a full Monday–Sunday blank plan using the household default servings, is idempotent per household/week, records activity, and is covered by the KitchenCircle API E2E test. Added a mobile “Plan next week” entry point. |
| 2026-06-16 | Added `household_invites` migration and owner-only account-bound email invitations for member/cook roles. Acceptance is authenticated, email-bound, expiry-checked, auditable, and the cook cannot create plans. |
| 2026-10-28 | Completed Phase 2: phone invites and invite management, members, household settings, private preferences UI, reactions, attendance summary (`GET /plans/:id/people`), recurring/this-week rules with presets, next-week navigation, MoodFood import button. Migration `0019_kitchen_circle_invites_rules`. |
| 2026-06-16 | Added `slot_attendance` migration and an authenticated self-attendance API. Every member, including a cook, can mark only their own slot attendance; each update is auditable. |

### Verification

- 2026-10-28: E2E `manages invitations by phone, members, private preferences, attendance and week-scoped rules` (phone invite accepted with different formatting, wrong account 403, duplicate 409, resend invalidates the old link, revoke, member list keys only `joinedAt,name,role,userId,you`, preferences private, attendance + recurring absence + reactions summary, owner can't leave, member leaves, this-week Thai rule leaves this Monday unfilled but next Monday filled, chat “Just this week” creates a week-scoped rule). Full suite 34/34; intelligence 989 passed.

- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (42 tests).
- `API_URL=http://localhost:3001 SYNC_KEY=dev-sync-key pnpm --filter @moodfood/api test:e2e` — passed (26 tests) using test-friendly local rate limits.
- `pnpm db:migrate` — passed (including `0006_stormy_echo` and `0007_flimsy_vision`).

### Blockers / decisions needed

- None currently.

---

## Phase 3 — Structured recipes and private household recipes

**Status:** Complete  
**Completion:** 100%

### Objective

Every meal eligible for grocery planning has reliable, versioned structured ingredients and steps. A household can select or create recipes that are ready for scaling and grocery computation.

### Planned deliverables

- [x] Recipe/version model: `recipes` (stable identity + source `catalog` / `household` / `ai_draft`), immutable `recipe_versions`, and `household_recipes` (private by default).
- [x] Version metadata: default servings, canonical ingredient identities, quantities/units, optional flags, steps, prep/cook minutes, cuisine, effort, freshness class, dietary tags, allergens, dietary provenance (`catalog` / `household` / `ai`), substitutions, author, and approver.
- [x] Grocery-eligibility validation (`recipe-structure.ts`): canonical units (g, kg, ml, l, tsp, tbsp, cup, piece, clove, bunch, sprig + aliases), positive quantities, no duplicate ingredient identities, at least one step. Unmeasurable quantities (“to taste”, “pinch”, “handful”…) are rejected unless the ingredient is optional.
- [x] Curated catalog seed (8 Indian staples) via idempotent migration `0013_kitchen_circle_catalog_seed`.
- [x] Recipe browse/search API: `GET /households/:id/recipes?q=&source=` returns catalog + this household's private recipes only, summarised by the newest approved version with grocery-readiness and review state.
- [x] Recipe detail API: `GET /households/:id/recipes/:recipeId` with all versions and per-version structure issues. Another household's private recipe returns 404 (no existence leak).
- [x] Private household recipe lifecycle: create (validated, usable immediately) → edit appends an immutable new version → plan slots keep the version they were planned with. Catalog recipes cannot be versioned by households.
- [x] AI draft lifecycle: `draft: true` stores an unreviewed `ai_draft` (may be incomplete, unusable for planning); fixes append draft versions; approval re-validates, records the approver, and promotes the recipe to `household`.
- [x] Slot binding: selecting a recipe binds a specific approved, structurally complete version; locked days, cooks, and other households' recipes are rejected. Typing a different meal or marking leftovers/eating out clears a stale recipe binding. Plan reads include each slot's recipe source and version.
- [x] Mobile recipe browse/search/filter (All / Catalog / Household / AI drafts) with clear catalog / household / unaccepted-AI-draft labels, Private and Grocery-ready badges, expandable ingredients/method/allergens.
- [x] Mobile add-recipe-to-day flow (“Choose a recipe” from the day editor) and recipe source/version label on each planned day.
- [x] Mobile build/edit private household recipe (ingredient rows with unit picker and optional flag, method steps, servings/timing), client-side checks mirroring the server rules, and server validation issues shown inline. Draft review/approve from the recipe list.

### Progress log

| Date | Update |
| --- | --- |
| Before 2026-10-27 | Backend foundation: recipe/version/household-recipe tables (`0008`–`0011`), private recipe creation, versioning, approval, slot binding, and grocery-eligibility endpoint; E2E 26/26. |
| 2026-10-27 | Added structured-recipe validator + unit tests, recipe metadata migration `0012_kitchen_circle_recipe_metadata`, catalog seed `0013_kitchen_circle_catalog_seed`, catalog+household browse/search and detail APIs, AI-draft review lifecycle, stale-binding protection on manual slot edits, and slot recipe labels in plan reads. |
| 2026-10-27 | Added mobile `kitchen-circle/recipes` (browse/search/select/approve) and `kitchen-circle/recipe-editor` (create / new version) screens, wired into the plan screen. Verified in Expo web against the local API. |
| 2026-10-27 | Phase 3 exit criteria met and verified. |

### Exit-criteria tests

| Requirement | Coverage |
| --- | --- |
| Incomplete/ambiguous ingredient data cannot enter grocery aggregation | `recipe-structure.test.ts`; E2E: “to taste” recipe → 422 with issues; draft with “handful” cannot be selected or approved; manual retitle drops binding → not eligible. |
| Household recipe cannot become globally visible by accident | E2E: other household's search returns nothing, detail → 404, selecting it onto their slot → 404, non-member listing → 403. |
| Grocery snapshot retains original recipe version after future recipe edits | E2E: slot bound to v1 stays on v1 (servings 2) after v2 is created; detail lists v2, v1. |

### Verification

- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (45 tests, including 3 new recipe-structure tests).
- `pnpm db:migrate` — passed (`0012`, `0013`).
- `API_URL=http://localhost:3011 SYNC_KEY=<test key> pnpm --filter @moodfood/api test:e2e` — passed (27/27), against a separate local test API instance started with high rate limits and a test sync key (the regular dev server's sign-up rate limit makes the suite fail with 429s).
- Expo web manual check (`mobile-web` preview): browse/filter catalog, pick Dal Tadka for a day (day shows “Catalog recipe · v1”), create a household recipe (missing quantity caught inline; saved as Private + Grocery-ready), edit it as v2 with prefilled fields.
- GitNexus `detect-changes --scope all` — risk low, 0 affected processes (tracked files only; KitchenCircle sources are still untracked).

### Notes / gotchas

- The API dev server runs migrations on boot (`DB_MIGRATE_ON_BOOT`). `drizzle-kit generate --custom` creates an empty file first, so a watching dev server can record a custom migration as applied before its SQL is written. This happened locally with `0013`; the seed SQL was applied by hand (it is idempotent). Fresh environments run the full file normally. Stop the dev server, or write the SQL before it restarts, when adding custom migrations.
- Expo typed routes (`.expo/types/router.d.ts`) are stale until the next `expo start`; new KitchenCircle routes use the project's existing `as never` cast pattern.

### Blockers / decisions needed

- None. Deferred by design: AI recipe generation itself (Phase 5 produces drafts through the existing `draft` path); household copies of catalog recipes (not required by the exit criteria); unit conversion and scaling (Phase 4).

---

## Phase 4 — Grocery requirements, dedupe, pantry, and cart snapshots

**Status:** Complete  
**Completion:** 100%

### Objective

Convert several recipes into one accurate, explainable household grocery requirement before any live provider/cart call. Nothing in this phase writes to Instamart.

### Planned deliverables

- [x] Ingredient canonicalization (`grocery.ts` `ingredientKey`): lowercase/space normalization, final-word singularization (onions → onion, tomatoes → tomato), and a small alias map (chillies → chilli, jeera → cumin seed, haldi → turmeric powder…). Meaningful distinctions are preserved: “spring onion” ≠ “onion”, “bone-in chicken” ≠ “boneless chicken”.
- [x] Unit conversion: mass to grams, volume to millilitres (tsp 5, tbsp 15, cup 240), counts kept per kind (piece, clove, bunch, sprig). Dry staples measured by volume (rice, dals, flours, semolina, sugar, poha, peanuts…) convert to grams via a density table, so “1 cup rice + 200 g rice” is one line. Incompatible units for the same ingredient stay on separate lines flagged `unitConflict`. Display uses g/kg, ml/l, and whole counts.
- [x] Recipe scaling by slot servings ÷ recipe default servings, then summed across days.
- [x] Pantry defaults: a built-in staple list (salt, sugar, oil, common spices…) plus per-household overrides in `household_pantry_defaults`. Pantry items appear on the list as “Already have” but are excluded from buying by default.
- [x] Source trace on every line: day, slot, recipe, recipe version, ingredient as written, recipe quantity/unit, scale, and the scaled base quantity. Source quantities sum exactly to the line total.
- [x] Immutable snapshots (`grocery_snapshots`, `grocery_snapshot_lines`): computed once from bound recipe versions. Plan edits never rewrite them; a read compares coverage with the live plan and reports `planChanges` (recipe/meal changed, servings changed). Drafts accept manual edits, finalized lists are fully frozen, and discarded drafts are kept for audit.
- [x] Covered-day tracking (`grocery_coverage`): a partial unique index allows only one active, non-override coverage per day. A second list for a covered day returns 409 with the conflicting days unless `override: true`. Discarding a draft releases its days.
- [x] Scopes: whole remaining plan from the household's “today” (`week`), or a single day (`day`). Leftovers, eating-out, no-cook, blank, and non-grocery-ready days are excluded and reported with reasons.
- [x] Manual controls: buy / already have / skip, quantity and unit change (keeps the original and is marked “Changed”), product note, manual price estimate, and manually added items. Skipping a required recipe ingredient returns a warning naming the recipes and days that need it.
- [x] Labelling: Recipe vs Pantry vs Optional vs Added, plus a “Changed” badge. Optional unmeasured extras (“salt to taste”) are listed but skipped.
- [x] Optional budget in paise, compared with the sum of entered price estimates (`overBudget`). Live prices arrive in Phase 7.
- [x] Freshness grouping: perishables (meat, fish, eggs, dairy, leafy herbs, tomato, green chilli…) first needed 3+ days after the reference date go to “Buy later”. The list-level `freshnessMode` is “Buy fresh later” (split) or “Order all now”.
- [x] Permissions: cooks can read lists but cannot change them or the pantry; only the owner can finalize (mirrors owner-only checkout in Phase 7); non-members get 403.
- [x] Mobile `kitchen-circle/groceries` screen: build the week or a single day, a conflict prompt with “Build anyway”, grouped sections (Buy now / Buy later / Added by you / Already have / Skipped), expandable source trace and line controls, budget, freshness toggle, add item, finalize/discard, plan-change banner, and pantry staple management. Entry points: “Grocery list” on the plan header and “Groceries for this day” in the day editor.

### APIs

| Method | Path | Purpose |
| --- | --- | --- |
| GET / PUT | `/api/kitchen-circle/households/:id/pantry` | Effective pantry; add/remove a staple. |
| GET / POST | `/api/kitchen-circle/households/:id/grocery-lists` | List snapshots for a plan; build a week/day snapshot. |
| GET / PATCH | `/api/kitchen-circle/grocery-lists/:id` | Snapshot with lines, coverage, plan changes, totals; set budget or freshness mode. |
| POST | `/api/kitchen-circle/grocery-lists/:id/lines` | Add a manual item. |
| PATCH | `/api/kitchen-circle/grocery-lists/:id/lines/:lineId` | Status/quantity/unit/note/price controls. |
| POST | `/api/kitchen-circle/grocery-lists/:id/finalize` · `/discard` | Freeze (owner) or abandon a draft and release its days. |

### Progress log

| Date | Update |
| --- | --- |
| 2026-10-27 | Added the pure aggregation engine (`grocery.ts`) with unit tests, migration `0014_kitchen_circle_grocery` (pantry defaults, snapshots, lines, coverage with a partial unique index), `GroceryService` / `GroceryController`, and a DB-backed E2E test. |
| 2026-10-27 | Added the mobile grocery screen and plan entry points. A web check showed dry dal listed in ml, so dry-staple density conversion was added; it now shows in grams. |
| 2026-10-27 | Phase 4 exit criteria met and verified. |

### Critical tests

| Requirement | Coverage |
| --- | --- |
| Correct aggregation and unit conversion | `grocery.test.ts`: 2 + 1 onions = 3; 500 g + 0.75 kg + 400 g chicken = 1.65 kg; serving scaling; cup/tbsp → ml; cup → g for dry staples; spring onion and bone-in/boneless kept distinct. E2E: the same totals through the API with three recipes on three days. |
| No duplicate day coverage without an explicit override | E2E: a second week list → 409 with 3 conflicts; a single covered day → 409; with `override` → 201 and an override coverage row; after discard, a new list succeeds. |
| Existing cart/order never changes after a plan edit | E2E: changing Monday's servings leaves the existing list at 1.65 kg and reports a plan change; a newly built list reflects the edit (2.65 kg); finalized lists reject line edits and discard (409). |
| Source trace explains every aggregate line | E2E: the chicken line lists all three day/recipe sources and their base quantities sum to the line total. Unit test checks scale and trace per source. |

### Verification

- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (51 tests; 6 new grocery-engine tests).
- `pnpm db:migrate` — passed (`0014_kitchen_circle_grocery`).
- `API_URL=http://localhost:3011 SYNC_KEY=<test key> pnpm --filter @moodfood/api test:e2e` — passed (28/28), against a separate local test API instance with high rate limits.
- Expo web manual check: built the week list from the plan (Dal Tadka scaled 4 → 2 servings; pantry spices under “Already have”), confirmed toor dal in grams after the density change, discarded and rebuilt (released coverage), skipped a required ingredient (warning and skipped-required count shown).
- GitNexus `detect-changes --scope all` — risk low, 0 affected processes (tracked files only; KitchenCircle sources are still untracked).

### Notes / decisions

- Servings come from the slot's explicit `servings`; attendance does not reduce quantities yet. Revisit with Phase 5 auto-fill, where servings suggestions can use attendance.
- The density table and perishables list are deliberately small and approximate. Phase 7 pack matching may refine them per product.
- Substitution-based merging (e.g. allowing boneless for bone-in) is not applied; distinct ingredients always stay separate lines.
- An override coverage row does not become the primary coverage if the original list is later discarded, so that day reads as uncovered for future lists. This is acceptable for V1.

### Blockers / decisions needed

- None.

---

## Phase 5 — Household auto-fill and planning intelligence

**Status:** Complete  
**Completion:** 100%

### Objective

Generate a reviewable week proposal from household constraints and preferences. Auto-fill reduces planning effort but never silently changes a household's week.

### Architecture

- **Intelligence** (`apps/intelligence/app/kitchen_circle/`): `schemas.py` (contract), `planner.py` (deterministic, explainable planner `kc-autofill-1`), and route `POST /api/kitchen-circle/autofill` (service-key protected like every other route). It is pure: no storage, and no LLM/JEV calls, so results are reproducible for a seed and need no cache. Decisions are emitted via `trace.emit("kitchen_circle.autofill.*")` for the Intelligence Lab.
- **API** (`planner.service.ts`, `planner.controller.ts`): gathers household context, calls the planner via `IntelligenceService`, stores proposals for review (`meal_plan_proposals`, `meal_plan_proposal_items`; migration `0015_kitchen_circle_autofill`), and applies only what a member accepts. It contains no ranking logic. If intelligence is unavailable it returns 503 and the plan is unchanged.
- **Privacy:** member preferences go to the planner but are never echoed back; reasons are aggregate (“A favourite for 2 of 3 eating”) and never name a member.

### Planned deliverables

- [x] Hard constraints in code: diets (vegetarian = no meat or eggs; eggetarian; vegan; jain = also no onion/garlic/root vegetables), allergens (normalized through `services/diet`), and `cannot_eat` for ingredient/cuisine/dish/protein apply to the members **eating that day**; `never_plan` applies household-wide; hard household rules per weekday. Meat and egg are inferred from ingredients too, so a missing tag cannot bypass a diet.
- [x] Attendance-aware: absent members don't restrict that day and suggested servings drop by the number away; cooks count as eaters only when they mark themselves attending.
- [x] Recurring rules (`weekday` 0 = Monday): `diet`, `exclude_ingredients`, `exclude_cuisines`, `cuisine`, `effort`, `max_total_minutes`. Hard rules filter; preference/contextual rules score ±0.15/±0.08. Unknown keys are reported as `ignoredRules` instead of silently ignored.
- [x] Recipe availability: catalog plus household recipes at their newest approved, grocery-ready version; unreviewed AI drafts are never proposed.
- [x] Household-fit scoring with named parts (`breakdown`): favourites (preferences and past “looks good” reactions), dislikes (“prefer less” and “not for me”), soft rules, weeknight effort/time, repeats (−0.25 within 14 days, −0.10 within 28, no within-week repeat unless nothing else fits), cuisine/protein diversity against neighbouring days, light ingredient-overlap bonus (non-staples, capped), and fairness (favourites of members served least this week get a boost).
- [x] Explainable proposal: up to 4 reasons per day plus ranked alternatives; days that can't be filled are listed with a reason, never guessed.
- [x] Only blank, unlocked days are filled; locked, planned, leftovers/no-cook/eating-out days are never touched, and existing meals count towards variety and repeats.
- [x] APIs: `POST /plans/:id/autofill` (`slotIds`, `regenerate`), `GET /plans/:id/proposals/latest`, `POST /plans/:id/proposals/:proposalId/apply` (`itemIds`, per-item `servings`), `POST /plans/:id/proposals/:proposalId/discard`, `POST /slots/:id/swap` (with `proposalId`: replace the proposed pick, never returning to swapped-away recipes; without: read-only alternatives for any day).
- [x] Never silent: proposing changes nothing; regenerating supersedes the previous proposal (which then can't be applied); apply re-checks each day under a row lock and marks a day **stale** instead of overwriting it if it was edited, filled, or locked since the proposal, or if its recipe is no longer grocery-ready/accessible. Every applied day writes an `autofill_applied` activity with before/after.
- [x] Cooks cannot auto-fill, apply, swap, or discard; non-members get 403.
- [x] Mobile `kitchen-circle/autofill`: “Auto-fill open days” on the plan (shown when there are blank days and the user isn't a cook), proposal summary, unfilled reasons, per-day select, reasons, source label, servings stepper, Swap, “Add N selected days”, “Add all days”, Regenerate, Clear (discard), and a stale-day notice. Grocery creation remains a separate action.

### Progress log

| Date | Update |
| --- | --- |
| 2026-10-27 | Built the intelligence-side planner, schemas, and route with 10 unit/route tests; API proposal storage and apply/swap/regenerate/discard with migration `0015`; mobile review screen. |
| 2026-10-27 | Web check: the first pick of a household with no tastes or history had no reasons, so a plain fallback reason was added (effort · cuisine · time); fixed fallback casing and duplicated minutes; kept a deselected day deselected after a partial apply. |
| 2026-10-27 | Phase 5 exit criteria met and verified. |

### Exit-criteria tests

| Requirement | Coverage |
| --- | --- |
| Auto-fill only blank/unlocked days | Planner test (locked/leftover days skipped, the locked day's recipe not repeated); E2E proposes exactly the 5 open days around a locked and a leftovers day. |
| Hard constraints are never violated | Planner tests: attending vegetarian + dairy allergy, absent member lifted for that day only, weekday vegan rule, never-plan, cook attendance; E2E: a vegetarian household gets no chicken/egg dishes. |
| Proposals are reviewed before anything changes | E2E: plan unchanged after proposing; superseded proposal can't be applied (409); discard leaves the plan unchanged. |
| Never overwrite a day edited after the proposal | E2E: a day changed to “Pizza night” after proposing is reported stale and keeps its meal; the other 4 apply with a servings edit (5). |
| Swap, regenerate, alternatives | Planner tests (exclusion, seed determinism); E2E swap changes the pick and remembers the old one; read-only alternatives exclude the current recipe. |

### Verification

- `apps/intelligence`: `.venv/bin/python -m pytest` — passed (954 passed, 1 skipped; 10 new KitchenCircle planner tests).
- `pnpm --filter @moodfood/api typecheck` and `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (51).
- `pnpm db:migrate` — passed (`0015_kitchen_circle_autofill`).
- `E2E_REQUIRE_INTELLIGENCE=1 API_URL=http://localhost:3011 SYNC_KEY=<test key> pnpm --filter @moodfood/api test:e2e` — passed (29/29). The test API pointed at a separate intelligence instance on :8011 started with OpenAI/JEV keys blanked and a scratch model store. Without `E2E_REQUIRE_INTELLIGENCE=1` the auto-fill test skips when intelligence is offline.
- Expo web check (temporary launch config pointing at the test API): suggested 6 of 6 open days for a fresh household, regenerated (every day changed), swapped Tuesday, deselected Sunday, added 5 days; the plan showed exactly those 5 with “Catalog recipe · v1” and Sunday still open.
- GitNexus `detect-changes --scope all` — risk low, 0 affected processes (tracked files only).

### Notes / decisions

- **Restart needed:** the local intelligence server on :8000 (started without `--reload`) must be restarted to serve `/api/kitchen-circle/autofill`; until then the dev app's auto-fill returns 503 (“Auto-fill is unavailable right now”).
- Planner V1 is deterministic by design. A JEV/LLM blend (e.g. for reason copy or taste fit) can be added behind the existing breakdown later; per the service rules it would need a non-JEV path and, on read paths, an evidence-fingerprint cache.
- Rule `constraint` JSON had no defined schema in Phase 2; the supported keys above are now the contract (documented in `PlannerRule`). A rules UI should write only these keys.
- Budget preference is not yet an auto-fill input: there are no prices until Instamart matching in Phase 7.

### Blockers / decisions needed

- None.

---

## Phase 6 — Shared chat and typed planner actions

**Status:** Complete  
**Completion:** 100%

### Objective

Allow natural-language planning without letting an LLM mutate household data freely. The chat is visible to members, produces auditable action cards, and never bypasses permissions or confirmation rules.

### Architecture

- **Intelligence** (`app/kitchen_circle/chat.py`, `chat_schemas.py`, route `POST /api/kitchen-circle/chat/interpret`): interpretation only, never writes.
  1. A deterministic phrase parser (the non-LLM path) handles the common requests: meals (recipe match or free text), days out, leftovers/no-cook, clear, servings, lock/unlock, own attendance, recurring rules (create / turn off), auto-fill, and grocery lists. Day expressions: weekday names and plurals, today/tonight/tomorrow, weekend, all/rest of the week, and day-of-month (“the 6th”, “28 Oct”).
  2. Only when that finds nothing does it call the LLM (`parse_structured`, mini model). Every LLM action is re-validated: days must be days of this plan, recipes must come from the household's list, servings 1–30, attendance always the sender, and unknown types are dropped. If both fail, it returns help text and no actions.
  - Ambiguity is resolved by asking, with concrete answer options (each a typed action set): “We're going out Friday” in a multi-member household → “Everyone is out” / “Only me”; a missing day → one option per plan day; a diet on a single weekday without “every” → “Every week” / “Just this week”.
- **API** (`chat-policy.ts`, `chat.service.ts`, `chat.controller.ts`, migration `0016_kitchen_circle_chat`): stores `planner_messages` and one `planner_action_proposals` row per action card, decides each card with a pure policy, and executes accepted actions **through the existing services** (`KitchenCircleService`, `PlannerService`, `GroceryService`) as the acting member, so locks, roles, and validation apply exactly as in the app.

### Policy (`chat-policy.ts`)

| Action | Outcome |
| --- | --- |
| Clear low-risk edit to an unlocked day (meal, clear, status, servings, lock) | Applied and logged |
| Own attendance | Applied (always the sender) |
| Any change to a locked day (including unlock) | Confirmation; on confirm the day is unlocked, changed, and — for meal/servings — re-locked. A failed change always restores the lock. |
| 3+ day edits in one message | Every card needs confirmation (reviewed as a set) |
| Recurring rule create/turn-off | Confirmation |
| Grocery list | Explicit confirmation |
| Auto-fill request | Applied — it only creates a Phase 5 proposal for review |

- Pending cards expire if the day changes before confirmation, or after 24 hours.
- Clarifications can be answered only by the person who sent the message; the chosen option's actions go through the same policy.
- Cooks cannot read or post in the chat (403), matching “cook views never show chat”.
- Every confirm/dismiss posts an assistant line naming the member, so the history shows who decided what.

### Planned deliverables

- [x] Shared chat message/activity model (`planner_messages`, `planner_action_proposals`).
- [x] Typed action parser and validation for all 11 plan action types (`SET_MEAL`, `CLEAR_DAY`, `SET_DAY_STATUS`, `SET_SERVINGS`, `SET_ATTENDANCE`, `LOCK_SLOT`, `UNLOCK_SLOT`, `CREATE_RECURRING_RULE`, `UPDATE_RECURRING_RULE`, `REQUEST_AUTOFILL`, `CREATE_GROCERY_SNAPSHOT`).
- [x] Clarification/confirmation rules as above. Added `PATCH /households/:id/rules/:ruleId` (`KitchenCircleService.updateRule`) so rules can be turned off.
- [x] Mobile `kitchen-circle/chat`: message thread with author/time, action cards with status chips (Done / Needs confirmation / Question / Confirmed / Dismissed / Couldn't apply / Expired) and policy notes, Confirm/Dismiss, answer buttons, “Review suggestions” and “Open grocery list” links, suggestion chips, a pending-decision count, and 15-second polling while open. Entry: “Household chat” on the plan (not for cooks).

### APIs

| Method | Path |
| --- | --- |
| GET / POST | `/api/kitchen-circle/households/:id/chat` (`planId`; POST body `{ planId, body }`, rate-limited with the `signals` budget) |
| POST | `/api/kitchen-circle/chat/actions/:id/confirm` · `/reject` · `/clarify` (`{ optionIndex }`) |
| PATCH | `/api/kitchen-circle/households/:id/rules/:ruleId` |

### Progress log

| Date | Update |
| --- | --- |
| 2026-10-27 | Built the intelligence interpreter (rules + validated LLM fallback) with 11 tests; API policy (3 unit tests), chat storage/execution, and E2E; mobile chat screen. |
| 2026-10-27 | Review fixes before testing: re-locking after a confirmed status change on a locked day would have hidden the new status, so only meal/servings changes re-lock; a failed change now always restores the lock. |
| 2026-10-27 | Phase 6 exit criteria met and verified. |

### Exit-criteria tests

| Requirement | Coverage |
| --- | --- |
| Visible to members, never to cooks | E2E: a member reads the full history with author names and cards; a cook gets 403 on read and send. |
| Auditable action cards | E2E: every outcome (applied, clarification, confirmed, expired, rejected) is stored with its policy and note; confirmations post “Confirmed: … — <member>”. |
| Ambiguous shared instruction asks first | Interpreter tests + E2E: “We are going out Friday” → solo applies; multi-member asks “Everyone is out / Only me”; only the sender may answer (403 for others). |
| Locked day needs confirmation | E2E: “make poha on wednesday” on a locked day waits; after a member confirms, Wednesday is Poha and still locked; confirming twice → 409. |
| Bulk changes reviewed | E2E: “no cooking all week” → all cards wait (bulk_change), plan unchanged. |
| Rules and grocery need confirmation | E2E: weekly rule created only after confirm; grocery list card waits and no list exists. |
| Never bypasses permissions or stale state | E2E: a pending card expires when its day changes first; execution goes through the same services (locks, roles, validation). Interpreter test: invalid LLM actions (unknown day/recipe/type, out-of-range servings) are dropped. |

### Verification

- `apps/intelligence`: `.venv/bin/python -m pytest` — passed (965 passed, 1 skipped; 11 new chat tests, LLM mocked).
- `pnpm --filter @moodfood/api typecheck` and `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (54; 3 new policy tests).
- `pnpm db:migrate` — passed (`0016_kitchen_circle_chat`).
- `E2E_REQUIRE_INTELLIGENCE=1 API_URL=http://localhost:3011 … pnpm --filter @moodfood/api test:e2e` — passed (30/30), with a test intelligence instance on :8011 (OpenAI/JEV keys blanked, so only the rules path ran).
- Expo web check: “We are going out Friday” in a solo household applied (Friday = Eating out); “lock saturday” applied; “make poha on saturday” produced a locked-day confirmation card; Confirm → Saturday = Poha, still locked, with a “Confirmed … — <name>” line. No console errors.
- GitNexus `detect-changes --scope all` — **reported CRITICAL (561 flows), confirmed false positive** (after a fresh reindex during Phase 7 the same tracked changes report risk low, 0 affected processes): it is entirely attributed to the new `mealPlanProposals` table, linked to unrelated flows (Swiggy OAuth, brain, games, a design-doc `support.js`, Python embeddings). A text search finds `mealPlanProposals` only in `schema.ts` and `planner.service.ts`; the `schema.ts` diff is 81 insertions, 0 deletions; migrations `0015`/`0016` only create tables, enums, indexes, and FKs on new tables. Re-check after the index is rebuilt from a clean commit.

### Notes / decisions

- The LLM fallback has not been exercised against the live model in this phase (keys were blanked in tests); its output is validated either way. Recommended: a manual check with keys before release.
- The chat send endpoint uses the `signals` rate budget (120/window) because the `ai` budget (10) is too tight for conversation. A dedicated `chat` limit may be worth adding.
- “Just this week” for a single-day diet creates nothing; there is no per-day diet constraint yet.
- Restart the local intelligence server (:8000) so the dev app gets `/api/kitchen-circle/chat/interpret` (and the Phase 5 auto-fill route). Until then chat replies “I couldn't work that out right now, so nothing was changed.”

### Blockers / decisions needed

- None.

---

## Phase 7 — Instamart matching, pack optimization, and owner checkout

**Status:** Code complete — live verification pending  
**Completion:** 90%

### Objective

Map grocery requirements to real local products and pack combinations. The owner can inspect a live, pack-optimized, explainable cart that covers the plan and choose to place it. There is no automatic checkout.

### Architecture

- **Intelligence** (`app/kitchen_circle/`):
  - `packs.py` parses provider pack labels (“500 g”, “2 x 200 g”, “1 l”, “6 pcs”, “1 dozen”, “1 pc (approx. 400-600 g)”, “1 bunch”).
  - It converts requirement and pack into one unit: exact where possible, and approximate, flagged, via typical piece/bunch/sprig/clove weights or ml≈g.
  - `optimize` searches **real purchasable combinations** for the cheapest cover, then the least surplus, then the fewest packs, respecting per-pack caps. It never rounds to an arbitrary quantity.
  - `grocery_provider.py` holds the provider boundary from the plan: `KitchenCircleGroceryProvider` (protocol), `FixtureGroceryProvider` (deterministic sample catalogue, the default), and `InstamartKitchenCircleAdapter`.
  - The adapter is verified against the Swiggy Builders docs: `search_products` variations `{spinId, skuId, quantityDescription, price.offerPrice/mrp, isInStockAndAvailable, maxQuantity}`; `get_addresses` (phone numbers are dropped and never leave the adapter); `update_cart {selectedAddressId, items[{spinId, skuId, quantity}]}`, which replaces the whole cart and surfaces `removedOutOfStockItems` / `reducedQuantityItems`; checkout and payment status are delegated unchanged to the existing `InstamartOrderService` (confirmation required, ₹99 minimum, ₹1000 cap). It is not coupled to DIY.
  - `cart.py` matches each “buy” line (confidence threshold, top 3 products, preferred/avoided brands), plans packs per product, picks the most confident match (cheaper within 1 point), and writes an explanation and alternatives.
  - Routes: `POST /api/kitchen-circle/cart/preview` (read-only), `GET …/cart/addresses`, `POST …/cart/write`, `POST …/cart/checkout`, `POST …/cart/payment-status`.
- **API** (`cart.service.ts`, `cart.controller.ts`, migration `0017_kitchen_circle_cart`): `household_delivery_settings` (owner-set address) and `grocery_cart_proposals` (preview → cart_written → ordered / payment_pending / failed; superseded on rebuild). The API owns the permissions and the rollout gates; it forwards the **owner's** Swiggy token (V1) and drops the link if Swiggy rejects it.

### Rollout safety (as planned)

| Step | Gate | State |
| --- | --- | --- |
| 1. Fixture catalogue + optimizer tests | always | Done and verified |
| 2. Read-only product matching / cart preview | `KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED` + owner linked + address set; otherwise sample catalogue (labelled “Sample prices”) | Code done; **live not exercised** |
| 3. Live cart writes | `…_LIVE_WRITES_ENABLED` (and LIVE_GROCERY), owner only, live preview of a **finalized** list | Code done; **not exercised** |
| 4. Explicit owner checkout | Same gates + `confirm: true` + `expectedTotal` must match the written cart (±₹0.50), else 409 “refresh and confirm again” | Code done; **not exercised** |

Both flags default to `false` (`apps/api/src/config/env.ts`, `.env.example`).

### Permissions

- Owners and members can build and review previews; cooks get 403 (they never see carts or prices).
- Only the owner can list Instamart addresses, set the delivery address, write the live cart, check out, or refresh payment status.
- Every preview, address change, cart write, and order attempt is written to planner activity.

### Planned deliverables

- [x] Grocery-provider adapter (`KitchenCircleGroceryProvider`, `InstamartKitchenCircleAdapter`, fixture provider).
- [x] Read-only product matching with pack conversion, brand preferences (member `brand` preferences: favourite → prefer, never-plan/cannot-eat → avoid), stock handling, alternatives, and explanations.
- [x] Pack-size optimization over real combinations (the plan's example: 1.65 kg chicken with only 300 g packs → 6 × 300 g = 1.8 kg, 150 g extra).
- [x] Owner-only live cart/checkout behind flags, with explicit confirmation and a total check.
- [x] Mobile `kitchen-circle/cart` (from “Build Instamart cart” on the grocery list): Buy now / Whole list scope, a provider badge (Sample prices / Instamart live), estimated total, a “Needs a look” section, per-item packs/cost/need, expandable explanation and alternatives, approximate-size notes, warnings (₹1000 cap, sample data), the owner's address picker, “Send to my Instamart cart”, and a confirm panel (total, address, Pay on delivery / Swiggy Money, an “I've checked…” checkbox) before “Place order”. Members see review-only text.
- [ ] **Live verification** with a linked owner account: read-only matching, then a cart write, then an owner-confirmed order (exit criterion).

### Progress log

| Date | Update |
| --- | --- |
| 2026-10-27 | Checked Instamart tool contracts in the Swiggy Builders docs (`search_products`, `update_cart`, `checkout`, `get_addresses`). Built the pack parser/optimizer, provider boundary, cart builder and routes (9 tests, Instamart MCP mocked); API flags, tables, cart service/controller, and E2E; mobile cart screen. |
| 2026-10-27 | Web check fixes: curry leaves (sprigs vs bunches) couldn't be compared, so a sprig↔bunch/mass conversion was added; scaled count needs read “4.67 pieces”, so they now round up to whole items with extra measured against that. |

### Exit-criteria tests

| Requirement | Coverage |
| --- | --- |
| Optimize actual purchasable combinations | `test_plan_example_1_65_kg_chicken_with_300_g_packs`; cheapest-mix test (1 kg + 500 g beats 3 × 500 g); unpriced and per-pack-cap cases; E2E reproduces 6 × 300 g = 1.8 kg, 150 g extra, with an explanation. |
| Explainable cart | Every line has required / purchased / extra / cost / explanation; approximate conversions flagged (unit + web check). |
| Members review, owner alone writes/places | E2E: member preview 201; member write 403; cook read/build 403; member address change 403; owner address set 200. |
| No live writes unless enabled, no automatic checkout | E2E with flags off: owner write 409, checkout 409, addresses 409, preview stays on the sample catalogue even with an address; checkout without `confirm: true` → 400; no `cart_written` / `order_placed` activity. |
| Correct Instamart contracts | Adapter tests assert the exact `search_products` / `update_cart` arguments, documented-field parsing (offer price, stock, maxQuantity), reduced-quantity reporting, and that phone numbers are dropped. |

### Verification

- `apps/intelligence`: `.venv/bin/python -m pytest` — passed (974 passed, 1 skipped; 9 new cart tests).
- `pnpm --filter @moodfood/api typecheck` and `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (54).
- `pnpm db:migrate` — passed (`0017_kitchen_circle_cart`).
- `E2E_REQUIRE_INTELLIGENCE=1 … pnpm --filter @moodfood/api test:e2e` — passed (31/31), flags off, test intelligence on :8011 with Swiggy/OpenAI/JEV keys blanked.
- Expo web check (sample catalogue): built a list and then a cart for the preview household — 11 of 11 items matched, ₹650 estimate, approximate sizes flagged, owner sees “Sending carts to Instamart is switched off for now. Nothing has been ordered.” No console errors.
- GitNexus `detect-changes --scope all` — risk low, 0 affected processes.
- **Not verified:** any call to the live Instamart MCP (search, address list, cart write, checkout). That needs the flags on, a linked owner account, and, for checkout, a real order.

### Notes / decisions

- **₹1000 cap:** the shared Instamart order service blocks orders of ₹1000 or more (beta safety cap). Weekly carts often exceed it; the cart shows a warning and suggests ordering “Buy now” separately. Raising or lifting the cap is a product decision outside KitchenCircle.
- **UPI not offered in KitchenCircle checkout yet:** the shared checkout response has no UPI intent/bridge URL fields, so V1 offers Pay on delivery and Swiggy Money only. `payment-status` is wired for when UPI is added.
- The shared `InstamartDiscoveryService` normalizer reads stock from a `stock` key that the documented response doesn't have (it uses `isInStockAndAvailable`) and drops `maxQuantity`. The KitchenCircle adapter parses the documented fields itself; the DIY normalizer was not changed (HIGH impact) — worth a separate fix.
- The fixture catalogue is a small sample with illustrative prices, clearly labelled wherever it is shown.
- Typical-weight tables (pieces, bunches, sprigs, cloves) are approximate; those lines are flagged for the owner to check.

### Blockers / decisions needed

- Live verification needs the owner's go-ahead: turn on `KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED` with a linked Swiggy account (read-only), then `KITCHEN_CIRCLE_LIVE_WRITES_ENABLED` for a supervised cart write and an owner-confirmed order.

---

## Brand integration — KitchenCircle Direction A (2026-10-28)

**Status:** Code complete — visual check pending (the browser pane was blocked by an open Swiggy sign-in popup)

- Brand: Direction A “Fresh & independent” from `KitchenCircle Brand Kit.html` — Curry Leaf `#2F6B4F`, Haldi `#E8A317` (one highlight per screen, kadhai text on it), Kadhai `#1C2620`, Steel `#D9DEDC`, Chawal `#F7F3EA`, Leaf/Haldi tints, Muted ink `#56625B`, Mirchi `#A3291B` (allergy and errors only); Bricolage Grotesque display + Figtree body; circles, pill buttons, 16–24px cards with a steel border and no shadows, plus a light glass finish on the chawal ground. Tagline “One meal. Everyone in.”
- `apps/mobile/src/features/kitchen-circle/brand.ts` (tokens + `kitchenCircleTheme`), `app/kitchen-circle/_layout.tsx` applies it to every KitchenCircle screen via the new kit `ThemeOverride`; `Theme.fonts` (optional) lets `Text` swap Geist→Figtree inside KitchenCircle only.
- `components.tsx`: `ModeSwitch` (MoodFood ⇄ KitchenCircle, “NOW · PLANNED”, from the provided mock; selected KitchenCircle chip uses Curry Leaf instead of the mock's lime `#81C05B`, which isn't in the brand kit), `KcWordmark`, `KcLoader` (provided loader GIF), `KcIntro` (provided intro GIF, once per device, tap to skip), `DayRings` (filled = cooked, haldi = today, outline = planned, dashed = blank), `KcButton` (flat brand pills, same props as the kit `Button`).
- Home: the switch sits above the greeting; the KitchenCircle quick chip was removed.
- New packages: `expo-image` (GIF playback on Android/iOS/web; adds a config plugin — native dev builds need a rebuild) and `@expo-google-fonts/figtree`.
- Impact: `Text`, `Theme`, `MoodThemeProvider` are CRITICAL in GitNexus; changes are additive (new export, optional field, a remap that only applies when a theme sets `fonts`).

---

## Phase 8 — Cook experience, translations, notifications, and feedback

**Status:** Code complete — visual check pending  
**Completion:** 95%

### Objective

Make the plan executable in the kitchen and useful over time: a cook can understand the meal in their chosen language, and the household can learn whether its plan was practical.

### Planned deliverables

- [x] **Cook role** sees the entire remaining cooking week, read-only (`GET /households/:id/cook-week`); the KitchenCircle home shows the cook view instead of the planner for cooks.
- [x] **Signed, revocable cook links** (`cook_links`): random 24-byte token shown once, only its SHA-256 stored; day or remaining-week scope; expire with the week (+1 day, max 14 days); revoke anytime; public `GET /api/kitchen-circle/cook/:token` (no account) rendered by the responsive web route `app/cook/[token].tsx`. Cooks cannot create links.
- [x] **Native share sheet**: “Share with cook” (brand-kit copy) in the day editor picks a language and opens `Share.share` (WhatsApp/SMS/copy); on web without Web Share, the link is copied and shown as selectable text.
- [x] **Sanitised cook payload by construction**: only date, weekday, meal title, people, scaled ingredients, method and timings. E2E proves slot notes, member names, emails, preferences, prices, addresses and chat never appear.
- [x] **Translation** (intelligence `translate.py`, `POST /api/kitchen-circle/cook/translate`): English, Hindi, Hinglish, Marathi, Tamil, Telugu, Bengali, Kannada; native script by default with a “Show in English letters” toggle. The model translates words only; quantities are rendered from canonical recipe data; output is checked (same item counts, each step keeps its digits) with per-item and whole-call English fallback. Results are cached per meal content + language + script in `cook_translations` (repeat views make no model call); failures are logged as `translation_failed`.
- [x] **Notifications** (`PlannerNotifierService`, existing in-app + Expo push): `planner_day_changed`, `planner_locked_changed`, `planner_grocery_ready`, `planner_cart_outdated`, `planner_invite` derived from the activity log (no planner write path changed), plus scheduled `planner_weekend_nudge` (Saturday 10:00–20:00 local, once per household per week, when ≥4 days of next week are open) and opt-in `planner_today_meal` (09:00–12:00 local, once a day). Actors are never notified of their own changes; cooks only get day changes; member settings (`household_member_settings`) are respected; one Redis-locked instance per minute; delivery is logged as `notifications_sent`.
- [x] **Post-meal feedback** (`meal_feedback`): loved it / change something / skipped / moved it, per member per day, only once the day has come. Fed to auto-fill as recipe + weekday + outcome (no identities): loved ranks up (“Your household loved it last time”), skipped/change rank down, and two or more weeknight skips of slow recipes teach the planner to avoid slow dishes on weeknights. Historical plans, lists and carts are never changed.
- [x] Mobile: cook view panel (brand “COOK VIEW” card, language chips, Haldi transliteration switch), feedback chips on past/today days, “Notify me” settings card.
- [ ] Visual check of the brand, cook page and feedback UI in the app (blocked this session by an open Swiggy popup in the browser pane).

### Fix found while building

- **Allergy safety bug (from Phase 5):** the MoodFood profile adapter imports allergies as category `allergy`, but the planner only recognised `allergen`, so imported allergies were not enforced by auto-fill. The planner now accepts both; covered by `test_moodfood_imported_allergy_category_is_enforced`.

### Verification

- Intelligence: 988 passed (new: 5 translation, 2 planner feedback/allergy, lab route + lab UI tests).
- API: typecheck clean; unit 54/54; migration `0018_kitchen_circle_cook_feedback` applied; E2E 32/32 including the new cook/notification/feedback/metrics test (public link, sanitisation, revoke → 404, cook week, feedback date rule, notifications to others incl. cook, opt-out respected, weekend nudge, today's meal, admin metrics, lab hooks).
- Mobile, UI kit, tokens: typecheck clean.

### Notes

- Indic text uses system fonts; the brand kit names the Noto Sans family (weight-matched). Bundling Noto Sans Devanagari/Tamil/Telugu/Bengali/Kannada is a follow-up.
- Cook links point at `FRONTEND_ORIGIN` (`https://moodfood.fun` by default), i.e. the deployed web app.

---

## Phase 9 — Streamlit Planner Lab, observability, and standalone readiness

**Status:** Complete  
**Completion:** 100%

### Planned deliverables

- [x] **Planner Lab** (`apps/intelligence/lab/pages/9_KitchenCircle.py`, fixtures in `lab/kitchen_circle_fixtures.py`): synthetic household setup with editable members/rules → weekly proposal with reasons, score parts and trace; constraint/conflict simulation; chat action simulation with the API's real policy decisions; recipe scaling and source-traced aggregation (API grocery engine); pack-optimizer fixture scenarios; translated cook preview (model optional); notification copy preview; feedback before/after simulation. Lab routes `/api/lab/kitchen-circle/*` are mounted only with `LAB_ENABLED` (which also forces Swiggy read-only); Node-backed tabs call dev-only API routes (`/api/kitchen-circle/lab/*`, 404 in production) and show a notice when the API isn't running. Nothing writes carts, orders, invitations or pushes.
- [x] **Observability** (`GET /api/kitchen-circle/admin/metrics?days=N`, admin only, counts only): auto-fill acceptance/swap/stale/discard and unfilled days; planned-day completion and satisfaction from check-ins; grocery lists, covered days, duplicate-purchase overrides, manual corrections; cart status counts, match and stock failures, average pack surplus (`surplus_ratio` added to cart lines); cook links/views and translation failures; notification delivery; refused chat actions.
- [x] **Standalone readiness**: `docs/kitchen_circle/kitchencircle-standalone-extraction.md` (audited dependency map, checklist, DB ownership and migration path); `KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED` switch for the MoodFood profile adapter.

### Verification

- Lab: `test_kitchen_circle_planner_lab` (every tab runs headless against the in-process lab router; Node tabs degrade to a notice) and `test_kitchen_circle_lab_routes_return_results_with_trace`.
- Metrics and lab hooks: covered by the Phase 8 E2E test (admin 200, non-admin 401).
- GitNexus `detect-changes`: CRITICAL, attributable to the design-system `Text`/`Theme` change (additive) and the new lab routes.

---

## AI-assisted recipes, dish impact, chat follow-ups, and catalog v2 (2026-10-28)

**Status:** Code complete, tested; not yet checked in the app with a live model key  
**Trigger:** in-app chat testing showed the question appearing twice, follow-ups losing context, "Monday isn't an available day", and no way to plan a dish outside the catalog.

### Chat fixes

- [x] **No duplicate question**: the assistant's message asks the question once; the card shows only the answers ("Choose an answer"). LLM questions with no valid options become a plain reply instead of an empty card.
- [x] **Follow-ups keep context**: the API sends the last 10 turns (`{role, text}`) and the open question (`pending`) to `/chat/interpret`; short replies (≤ 6 words) to an open question go to the LLM with that context. The open question is read *before* the new message is stored, and answering in chat closes that member's open question card.
- [x] **Days**: weekday names resolve to the nearest upcoming date across this week's and next week's plans (never both weeks); "all week" means the first upcoming week; replacements say "(instead of X)".
- [x] **Unknown dish** → one question: "Write a recipe for X (AI)", close catalog matches ("Use …"), or "Just write “X”" (free-text meal).

### AI-assisted recipe flow (intelligence owns the model call)

- [x] `apps/intelligence/app/kitchen_circle/recipe_ai.py`: structured recipe (`AiRecipe`, units limited to KitchenCircle units). `harden()` re-derives allergens and diet tags from the ingredients, without trusting the model (plant milks like coconut milk are not dairy). `fit_warnings()` uses the auto-fill hard-constraint rules and phrases warnings anonymously. Routes: `POST /api/kitchen-circle/recipes/generate` (returns a clean error without a model key) and `POST /api/kitchen-circle/check-fit`.
- [x] API `recipe-assist.service.ts` / `.controller.ts`: `POST /kitchen-circle/households/:id/recipes/generate` saves an **AI draft** (never auto-approved; 503 when the model is unavailable; `alreadyHave` checks the catalog only, never other households). `POST /kitchen-circle/slots/:id/impact` returns **DishImpact**: safety warnings, what it replaces, ingredients added, needing more, reused, no longer needed, pantry staples, and whether an existing grocery list or cart covers the day.
- [x] Chat: new `CREATE_RECIPE` action (policy `ai_recipe_draft`, applies). When written for a day, a follow-up `SET_MEAL` card (`ai_recipe_review`) waits for a member to "Approve & plan". Confirming approves the draft, then plans it. Choosing a dish that breaks a hard constraint via chat now needs confirmation (`hard_constraint`) with an anonymous warning, and applied meal cards carry the grocery impact summary.
- [x] Mobile: Recipes has "Not in the catalog? Let AI write it" (draft opens with warnings, a note if the catalog already has the dish, and an "AI-written" banner). The day picker shows "If you plan this for <day>" (impact + warnings) and "Approve & use for <day>" for drafts. Chat cards get "Review recipe" (opens the recipe) and "Approve & plan".

### Catalog v2

- [x] 67 new structured Indian home recipes (75 total): North Indian/Punjabi, South Indian, Gujarati, Maharashtrian, Bengali, Kerala, Goan, Indo-Chinese, egg, chicken, mutton, fish/prawn. All use measured ingredients in canonical units, with diet tags, allergens, substitutions, effort and freshness class.
- [x] Source of truth: `apps/api/src/kitchen-circle/catalog/catalog-recipes.json`; seed migration `0020_kitchen_circle_catalog_v2.sql` (stable uuid5 ids, `ON CONFLICT DO NOTHING`; the original 8 ids are unchanged).
- [x] `catalog.test.ts` checks every recipe is grocery-ready, uses canonical units, and is in the migration, and that allergens and diet tags match the ingredients (it caught a missing peanut allergen and the coconut-milk false positive).

### Verification

- Python: 998 passed, 1 skipped (new: recipe AI ×4, chat follow-ups/days/unknown dish).
- API unit: 58 passed (catalog ×3, `CREATE_RECIPE` policy). Typecheck clean for API, mobile, ui and tokens.
- E2E: 35/35 on isolated instances (:3011/:8011, keys blanked). New test: catalog ≥ 70 and searchable; Dal Tadka → Rajma Chawal impact (adds rajma/basmati, drops toor dal); peanut allergy makes Lemon Rice unsafe without naming anyone; generate returns 503 without a key and leaves no draft; unknown dish in chat → AI/plain options, the message asks the question once, the AI option fails gracefully on its card. Two older assertions were updated for intended changes ("(instead of Dal Tadka)", catalog now matching "khichdi").
- Dev: migration 0020 applied (75 catalog recipes); intelligence on :8000 restarted (still `SWIGGY_READ_ONLY=true`) so the new routes are live.

### Open

- Live check with an OpenAI key: write a recipe from Recipes and from chat ("write a recipe for thalipeeth on thursday"), review it, then approve & plan it.
- Visual check of the new Recipes/chat UI (the in-app browser is still blocked by the Swiggy popup tab).

---

### Follow-up: dish matching, AI by default, brand loader (2026-10-28)

**Status:** Complete; tried live with the OpenAI key on the dev stack  
**Trigger:** "Can we do chicken tacos on wednesday?" planned Chicken 65.

- [x] **Root cause:** the rule matcher only compared title words of 3+ letters, so "Chicken 65" reduced to "chicken" and caught any chicken message. The OpenAI key was already configured.
- [x] **Matching** (`chat.py` `same_dish`): a recipe matches only if every word of the requested dish fuzzy-matches its title. Spelling slips ("rajmah" → Rajma Chawal) and a few Hindi words ("anda curry" → Egg Curry) still match; "chicken tacos" ≠ Chicken 65 and "paneer tikka masala" ≠ Paneer Tikka. Several fits ("chicken on friday") → "Which chicken?" with those recipes plus "Write a new … recipe (AI)". Also understands "can we do / try / eat X on <day>".
- [x] **Unknown dish with AI on:** the model gets a "same dish only" instruction and resolves the dish or returns `CREATE_RECIPE`. A code check (`_keep_dish`) replaces any lookalike recipe the model picks with "write the dish they asked for". Without AI, or if the model fails, it falls back to the clarification options.
- [x] **AI recipe quality:** the API sends the catalog's ingredient vocabulary (`known_ingredients`, catalog only). `tidy_ingredients` drops prep notes, singularises, maps common aliases (ground cumin → cumin powder) and merges duplicates, so AI recipes merge on grocery lists. The prompt keeps the title true to the request and Indian-home-friendly.
- [x] **Chat reply:** "I wrote a recipe for X. Check the ingredients and steps, then tap Approve & plan to put it on Wednesday."
- [x] **Brand loader** (`KcLoader`) whenever AI works: chat (the member's message shows immediately, then "KitchenCircle is thinking…" or "Writing the recipe…"), the Recipes AI writer, the impact check, and auto-fill suggest/regenerate.
- [x] **Impact amounts** read like a shopping list (`friendlyAmount`): spoons under 100 ml, weights and volumes rounded (1½ tbsp, 300 g).
- [x] Config: `OPENAI_SUPPORTS_TEMPERATURE=false` in the local intelligence `.env` (the model rejects a custom temperature; `llm.py` already retried without it).

**Verification**
- Live (dev :3001/:8000, real model, throwaway local account): pav bhaji → catalog Pav Bhaji instantly. Chicken tacos → AI draft "Chicken Tacos with Roti Shells" in about 20 s, with clean catalog ingredient names. Approve & plan → Wednesday planned, the recipe is a grocery-ready household recipe, and Wednesday's grocery list includes its ingredients.
- Python 1002 passed (new: same-dish matching, lookalike guard, ingredient tidying). API unit 59 passed (`friendlyAmount`). E2E 35/35 (new: chicken tacos is never planned as Chicken 65). Typecheck clean for API and mobile.
- Note: the Streamlit lab UI tests can time out if two pytest runs overlap; they pass when run alone.

**Decision kept:** AI recipes go to the household's own recipes (private, approved by a member), not the shared catalog, because they are adapted to that household's limits. Promoting reviewed AI recipes to the shared catalog would be a separate step.

---

## KitchenCircle kitchen agent — AI-first chat with tools (2026-10-28)

**Status:** Complete; tried live on the dev stack with the real models  
**Direction (product owner):** the chat is AI-first. The model decides, including mapping a dish to a recipe; every planner action is a tool the agent uses; replies are written by the cheapest OpenAI model; static text only where it fits (audit lines, fallbacks).

### What changed

- [x] **`apps/intelligence/app/kitchen_circle/agent.py` — tool-calling agent** (OpenAI Chat Completions function tools, up to 5 rounds).
  - Read tools: `find_recipes` (fuzzy search over title, ingredients, cuisine and diet, with a `same_dish_as_query` flag) and `check_dish` (the auto-fill hard-constraint rules, phrased anonymously).
  - Action tools, one per planner action: `plan_meal`, `write_recipe`, `clear_day`, `set_day_status`, `set_servings`, `set_my_attendance` (sender only), `lock_day`, `unlock_day`, `add_rule` (incl. this week only), `turn_off_rule`, `suggest_meals`, `make_grocery_list`, `ask_member` (question + answers carrying their actions).
  - Every tool call is re-validated against the real plan. Invalid calls go back to the model as tool errors so it corrects itself.
  - Code guard: a recipe planned for a dish the member named must be that dish; a lookalike (chicken tacos → Chicken 65) becomes `write_recipe`.
  - Context: this and next week's days, rules, the recipe book with tags, anonymous household limits, the conversation, and any open question. It acts only on the latest message.
  - Every tool call is recorded in `steps` and `trace.emit`.
- [x] **Rule parser is now only the fallback** (`chat.interpret`: agent → rules → help). It's used when there's no key, the model errors, or `allow_llm=false`. The old single-shot structured-output path was removed.
- [x] **Replies:** `POST /api/kitchen-circle/chat/reply` (`compose_reply`). The reply model (see the speed-up section below for the final choice) writes the message from the API's actual outcomes (applied / needs confirmation / failed + notes). It sees outcomes only, never earlier turns, never names whose limit it is, and its output is checked; the API's static summary is the fallback. Used after chat messages and after a clarification answer. Confirm/dismiss audit lines stay static.
- [x] **API** (`chat.service.ts`): sends full recipe detail (`candidateRecipes`) and members' food limits (opaque ids) to the agent, then calls the reply composer. Response `source` can be `agent`.
- [x] **Config:** `KITCHEN_CIRCLE_AGENT_MODEL` (default gpt-6-luna, $0.10/$0.50), `KITCHEN_CIRCLE_AGENT_REASONING` (default `none`: the API rejects function tools with reasoning on Chat Completions for gpt-6-luna), `KITCHEN_CIRCLE_REPLY_MODEL` (default gpt-5-nano). Documented in `.env.example`.

### Live run (dev :3001/:8000, throwaway local account, household with a peanut allergy)

| Message | What the agent did | Reply (gpt-5-nano) |
|---|---|---|
| Can we do pav bhaji on thursday? | find → check → plan Pav Bhaji | "Pav Bhaji is on Thursday." |
| Can we do chicken tacos on wednesday? | write_recipe → AI draft + Approve & plan card | "…awaiting household confirmation before it can be planned." |
| We'll be 6 on Saturday, and I'm not eating at home on Friday | set_servings + set_my_attendance | "Saturday is set for 6 servings, and I've marked you as not eating at home Friday." |
| Make Tuesdays vegetarian from now on | add_rule (needs confirmation) | asks for the confirm |
| Plan lemon rice for Monday | check_dish → unsafe → wrote a **peanut-free lemon rice** for review | explains it waits for approval |
| Lock Thursday and make a grocery list for the week | lock_day + make_grocery_list (confirm) | "Thursday is locked … Please confirm the grocery list." |
| Fill in the rest of the week for us | suggest_meals | "Suggestions are created for review; nothing on the plan changes yet." |
| What can I make with paneer? | find_recipes → answer | lists the paneer recipes in the book |
| Actually make it rajmah on saturday instead | plan Rajma Chawal | "Rajma Chawal on Saturday is confirmed." |

Latency: 4–10 s per turn, about 35 s when it writes a recipe (the brand loader shows meanwhile).

Fixed during the live run: the reply model mixed in earlier turns (it now sees outcomes only); the guard misread "make **it** rajmah" (pronouns are filler now, and the guard only acts on true lookalikes); the agent repeated an earlier turn's action (now told to act on the latest message only).

### Verification

- Python 1009 passed (new `test_kitchen_circle_agent.py`, 12 tests: look-up-then-act with tool results fed back, lookalikes never "same dish", anonymous fit check, invalid calls corrected, every planner action is a tool, code guard, guard leaves correct mappings alone, questions need real answers, conversation and open question reach the model, model down → rules and no key → no call, replies from the cheapest model with fallback, reply route).
- API unit 59 passed; typecheck clean; E2E 35/35 (keys blanked, so this covers the fallback path).

### Open

- Latency: the agent averages about 3 model round-trips. Possible next steps: run find + check in one round, or move to the Responses API so reasoning can stay on with tools.
- Promoting reviewed AI recipes to the shared catalog is still a separate decision.

---

### Speed-up and reply quality (2026-10-28)

Measured on the dev stack with the real models; times are end to end through the API, including the reply.

| Request | Before | After |
|---|---|---|
| Can we do pav bhaji on thursday? | 8–21 s (4 model rounds) | 3.5–4.9 s (1 round) |
| Servings + own attendance in one message | 4.8 s (calls spread over rounds) | 3.0 s (both in one round) |
| Lock Thursday + grocery list | ~5 s | 2.7–4.1 s |
| Fill in the rest of the week | 5–10 s | 2.4–2.8 s |
| Chicken tacos (agent + AI recipe + impact) | ~35 s | 10.8–11.9 s |

- [x] **Look-ups before the first model call** (`KitchenAgent.lookups`): the dish they named, its recipe matches with the same-dish flag, recipes named in the message, the named days, and the safety check for each match × day. A clear request is decided in the first round.
- [x] **No closing round:** the loop stops once a round only made actions that were all accepted, because the reply is written separately. A multi-part message ("…, and …") that got one action gets one more turn.
- [x] **One turn for all tool calls** (prompt), and the context sends recipe ids and titles only (details come from `find_recipes`).
- [x] **Recipe writing with reasoning off** (`KITCHEN_CIRCLE_RECIPE_REASONING=none`; `parse_structured` gained an optional `reasoning_effort`, which is dropped and retried if a model rejects it). Measured 11.4 s → 7.7 s for the same structured recipe. GitNexus rated `parse_structured` HIGH (9 dependents); the change is additive and existing callers send identical requests.
- [x] **Reply model, measured on the same outcomes:**
  - `gpt-5-nano` ($0.05/$0.40) invented facts at minimal reasoning and came back empty at low.
  - `gpt-4.1-nano` is deprecated (404).
  - `gpt-6-luna` with reasoning off ($0.10/$0.50) was about 1.3 s and correct every time.
  - Default is now `KITCHEN_CIRCLE_REPLY_MODEL=gpt-6-luna`, `KITCHEN_CIRCLE_REPLY_REASONING=none`: the cheapest model that writes correct replies, roughly $0.00003 more per reply than nano.
- [x] **Reply checks:** each outcome is labelled plainly (DONE / WAITING with the card's real button, "Confirm" or "Approve & plan" from the card's policy / DID NOT HAPPEN). Style templates use placeholders, because real names in examples were copied into replies. A faithfulness check replaces any reply that hides a failure or a pending confirmation with the API summary (a slow OpenAI response once failed a recipe, and nano's reply claimed success).
- [x] **No duplicate cards:** the API drops an action that's already waiting on a card (the agent once re-requested a pending grocery list).

Verification: Python 1014 passed (agent tests now 17). The Streamlit lab UI tests are timing-sensitive and occasionally fail in a full run; they pass alone and on rerun. API unit 59; typecheck clean; E2E 35/35 (new: a repeated request doesn't add a second waiting card).

Still open: the AI recipe step is about 8 s of the 11–12 s tacos turn. Writing the recipe in the background (card shows "writing…", then updates) would make the chat reply immediate; that needs the mobile chat to poll or refresh.

---

## In-app feedback round: live progress, View plan, bottom bar, vector loader (2026-10-28)

**Status:** Code complete; API and E2E verified, progress tried live; visual check pending (the browser pane is blocked by the Swiggy sign-in popup tab)

| # | Feedback | What changed |
|---|---|---|
| 1 | My message shows twice while the agent works | The optimistic bubble hides as soon as the stored message arrives (`chat.tsx`). |
| 2 | Loader has a white background | `KcSpinner`: vector loader (react-native-svg ring with an opening that rotates, dark centre, six haldi katoris lighting in turn; still when reduced motion is on). `KcLoader` uses it everywhere; the loader GIF is no longer used. |
| 3 | See the week's plan from chat | Floating "View plan" island above the input (shows a count of days just changed). It opens a sheet with this week and next; days changed in the last 10 minutes are highlighted "Just updated", and the sheet refreshes after each message. Chat now gets `weekStart`. |
| 4 | Navigation like MoodFood's home | KitchenCircle home uses the shared `TabBar`: Groceries, Recipes · **Chat** (raised centre button) · Household, Food & rules. Cooks keep a small Recipes / Household / Food & rules row, since chat is for planners. |
| 5 | "Notify me" is unclear | Now "Your notifications": push notifications on this phone, just for you. "Someone else changes this week's meals", "Saturday nudge to plan next week", "Morning reminder of what's cooking today". |
| 6 | Show what's happening while it works | Live progress (below). |
| 7 | Every dish forced Indian-style | The recipe prompt keeps dishes true to their own cuisine (tacos stay Mexican, BBQ stays BBQ), using ingredients available in Indian cities, with substitutions for hard-to-find ones. Live: "BBQ Chicken", not an Indianised version. |

### Live progress

- **Intelligence:** `KitchenAgent.say()` emits plain-language steps: "Reading your message", "Found Pav Bhaji in your recipes" / "BBQ Chicken isn't in your recipes yet", unsafe-dish notice, "Deciding what to do", then one line per tool call ("Putting Pav Bhaji on Thursday", "Setting 6 servings for Saturday", …). New `POST /api/kitchen-circle/chat/interpret/stream` streams NDJSON (`{"progress"}` lines, then `{"result"}`).
- **API:** `IntelligenceService.ndjson()` reads the stream (falls back to `/chat/interpret` on 404). `progress.ts` uses AsyncLocalStorage, so recipe writing ("Writing a recipe for …", "Curating the ingredient list for …"), impact ("Checking allergies, diets and the grocery list"), auto-fill, grocery builds and "Writing the reply" report without threading callbacks. Steps go to Redis `kc:chat:progress:{household}:{user}:{clientId}` (5 min TTL), with `__done__` at the end. `GET /kitchen-circle/households/:id/chat/progress/:clientId?after=n` is members only.
- **App:** `sendChat(…, clientId)` and polling `getChatProgress` every 0.6 s. The waiting bubble shows the current step with the spinner and the previous steps ticked.
- **Live timeline (dev, real models):** pav bhaji: steps at 0.2 s, "Putting Pav Bhaji on Thursday" at 4.0 s, reply at 5.7 s. BBQ chicken: "isn't in your recipes yet" at 0.0 s, "Writing a recipe…" at 2.7 s, "Curating the ingredient list…" at 8.4 s, reply at 10.6 s.

### Verification

- Python 1016 passed (new: progress lines in plain words, streamed endpoint sends progress then the result). API unit 59; typecheck clean for API and mobile.
- E2E 35/35 (new: progress for a message is readable by members, ends `done`, includes the allergy-check step; cooks get 403).
- Not yet checked visually: chat waiting bubble, View plan sheet, bottom bar, vector loader. Needs the Swiggy popup tab closed so the in-app browser can navigate.

---

## Day popup and automatic menu to the cook (2026-10-28)

**Status:** Code complete; API and E2E verified; not yet checked visually (the in-app browser is blocked by the Swiggy sign-in popup tab)

- [x] **Day editor as a popup:** tapping a day (rings or list) opens a bottom sheet over the week (meal, servings, choose a recipe, cook language, send/share, groceries for the day, leftovers/eating out). It used to be a panel after the whole week.
- [x] **Automatic menu to the cook:**
  - Schema: `households.cook_auto_send` (default true) and `households.designated_cook_user_id` (nullable, on delete set null). Migration `0021_kitchen_circle_cook_auto_send` (generated by drizzle-kit; applied to dev).
  - `cookFor()`: the designated cook if they still have the Cook role, else the first cook to join; nobody when auto-send is off (except "send now").
  - Notifier (`planner_cook_menu`): **evening before** (18:00–22:00 local) "Tomorrow: Rajma Chawal" / "Friday: Rajma Chawal for 4. The recipe is ready in your language — tap to open."; **morning of** (07:00–11:00) "Today: …", once a day each. **Changes** to today or tomorrow go straight to the cook as "Change for Friday — Now: …"; for those days the cook doesn't also get the generic "X updated the plan" alert (other days still do). The tap opens their in-app cook view, which shows the recipe in their language. The cook is left out of the members' "today's meal" reminder so they don't get two.
  - `POST /kitchen-circle/households/:id/cook/send-menu {date}`: a member or owner pushes a day's menu to the cook now (works with auto-send off; 409 if there's no cook; cooks get 403).
  - Owner settings via `PATCH /kitchen-circle/households/:id` (`cookAutoSend`, `designatedCookUserId`; must be a Cook in this household, otherwise 422).
- [x] **App:** Household → "Your cook": auto-send toggle (owner), cook picker when there's more than one, what gets sent and when, "Send tomorrow's menu to <cook> now". With no cook yet, it explains how to invite one. Day popup: "Send to our cook now" (plus "Share a link instead" for cooks without the app).

**Verification:** API unit 61 (new `cook-menu.test.ts`: who gets it, message copy). E2E 36/36 (new "KitchenCircle cook menu": no cook → 409; designated cook must be a Cook → 422; members can't change it → 403; send-now with auto-send off reaches the cook's notifications with "Dal Tadka for 4. The recipe is ready in your language"; cooks can't send → 403). Two existing assertions updated for intended changes: the cook hears today's change as the menu itself, and the preview count is now 8. Mobile typecheck clean.

**Open:** cooks without the app (link-only) can't receive automatic pushes. Sending to them automatically would need a WhatsApp or SMS provider, which isn't set up.

---

## Voice in the household chat (2026-10-28)

**Status:** Code complete; tried live end to end with a real voice clip; not yet tried on a device (iOS needs a native rebuild for the new microphone permission text)

- [x] **Intelligence:** `app/kitchen_circle/voice.py` + `POST /api/kitchen-circle/chat/transcribe` (`{audio_base64, mime_type, hints}` → `{success, text, model}`). Model `KITCHEN_CIRCLE_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`, the cheapest on OpenAI's pricing page (2026-10-28: $0.003/min, vs $0.0045–0.006 for the others). The household's recipe titles go in as a prompt hint, so dish names come back spelled as the recipe book spells them. Hindi/English mixing is left to the model. Max 8 MB; plain-language errors with no key or on failure.
- [x] **API:** `POST /kitchen-circle/households/:id/chat/voice` (`{planId, audio (base64), mimeType: audio/*, clientId?}`, signals rate limit, members only). Steps: progress "Listening to your message" → transcribe (recipe titles as hints) → "Heard: “…”" → the **same** agent loop as a typed message (lookups, tools, AI recipe writing, reply). The stored message is the transcript. Returns the chat result plus `transcript`. 503 if voice is unavailable, 422 if nothing was heard.
- [x] **App:** with the message box empty, the send button becomes a mic (SVG `KcMicIcon`; the shared icon font has no mic). Tap to talk: a recording bar shows "Listening… say the days and dishes", a timer to 1:30 (auto-stop), cancel, and send. `useVoiceNote` (expo-audio `useAudioRecorder(RecordingPresets.HIGH_QUALITY)`, permission prompt, iOS `allowsRecording`) reads the clip as base64 on web (WebM) and native (m4a) with no extra native module. The bubble shows "Voice message · 7s", then switches to the words heard, and the live steps follow. `app.json`: expo-audio `microphonePermission` text (iOS; needs a native rebuild).

**Live run** (dev :3001/:8000, real models, clip made with macOS `say`): "I want rajma chawal on monday, tuesday pav bhaji, and thursday chicken tacos" →
0.0 s Listening · 2.8 s Heard: "I want Rajma Chawal on Monday, Tuesday Pav Bhaji, and Thursday Chicken Tacos." · 7.1 s Putting Rajma Chawal on Monday / Pav Bhaji on Tuesday · 9.5 s Chicken Tacos isn't in your recipes — I'll write one · 16.5 s Curating the ingredient list · reply at 19 s: "Rajma Chawal is on Monday, and Pav Bhaji is on Tuesday. I've written a recipe for Chicken Tacos; have a look, then tap Approve & plan to put it on Thursday." Monday and Tuesday planned; Thursday waits for approval.

**Verification:** Python 1019 passed (new `test_kitchen_circle_voice.py`: hints on the configured model, web WebM naming, oversized/empty audio rejected before any call, clear route errors). API unit 61; typecheck clean for API and mobile. E2E 36/36 (voice: non-audio type 400, cook 403, no key → 503/422 with progress starting "Listening to your message" and finishing `done`).

---

## Read-aloud in the cook's language, and local cook links (2026-10-28)

**Status:** Code complete; tried live through the dev API (Hindi); not yet tried on a device

- [x] **Intelligence:** `voice.speak()` + `POST /api/kitchen-circle/speak` (`{text ≤1500, language}` → `{success, audio_base64, mime: audio/mpeg}`), `KITCHEN_CIRCLE_TTS_MODEL=gpt-4o-mini-tts`, `KITCHEN_CIRCLE_TTS_VOICE=coral`. The instruction says to speak <language> warmly and unhurried for someone cooking, reading quantities and unit abbreviations naturally. Covers en (Indian accent), hi, Hinglish, mr, ta, te, bn, kn. Stores nothing.
- [x] **API:** `speech.ts` builds the words from the (already translated) cook view: "<dish>, <for N>. <Ingredients>: …" or "<Step n>. …", with the small labels localised for all 8 languages (unit words for en/hi/Hinglish). Endpoints:
  - `POST /kitchen-circle/cook/:token/speech` (public, the link's own view only; a revoked link → 404)
  - `POST /kitchen-circle/households/:id/cook-week/speech` (members/cooks)
  - `GET /kitchen-circle/speech/:key` (public mp3; the key is the sha256 of version + language + exact words)

  Audio is cached in Redis for 30 days by that fingerprint, so a repeat listen makes no model call. 404 when there's nothing to read; 503 when unavailable.
- [x] **App:** `CookViewPanel` gains read-aloud (both the public cook link and the in-app cook week). Each day has "Listen: ingredients" and "Read the steps" (reads straight through, preparing the next step while the current one plays, so there's no gap). Tap any step to hear just that one; the step being read is highlighted. Changing language stops playback. `useReadAloud` uses an expo-audio player on a plain URL (works on web and native). SVG speaker/stop icons (not in the shared icon font).
- [x] **Live (dev, Hindi cook link, Dal Tadka for 4):** ingredients 14.2 s first time (includes the first Hindi translation of that day), step 1 2.9 s; repeats 10–13 ms from cache. Transcribing the audio back gives the same Hindi text, with "0.5 छोटा चम्मच" spoken as "आधा छोटा चम्मच".
- [x] **Local cook links:** `FRONTEND_ORIGIN=http://localhost:8091` in the local `apps/api/.env` only (gitignored; production default unchanged). Cook and invite links now open the local web app.
- [x] **Share fixes:** the cook link was going into the share message twice, and share targets glued the text onto the URL. Now web shares only the URL (with the meal as the title), iOS sends the message and URL separately, and Android sends one message ending with the URL. The cook page keeps only the leading token and shows plain errors ("This link looks incomplete / has expired — ask for a fresh one").

**Verification:** Python 1021 passed (read-aloud: model, voice and language instruction; route errors). API unit 63 (`speech.test.ts`: localised labels, spoken units, numbered steps, nothing to read → null). E2E 36/36 (speech: bad part 400, no such day/step 404, link and cook-week 201/503, bad key 400, missing key 404, revoked link 404). Typecheck clean for API and mobile.

---


## KitchenCircle's own Swiggy connection (2026-10-29)

**Status:** Code complete. The screen and address list were checked live in the dev web app. Linking from scratch through Swiggy's sign-in was not tried.

**Why:** Someone who only uses KitchenCircle had no way to link Swiggy. The only entry was MoodFood's `/swiggy-connect`, which talks about taste and returns to the MoodFood check-in. On 2026-10-29 the dev app was signed in as a guest who owns a KitchenCircle with no Swiggy link, so carts fell back to sample prices.

- [x] **One link, two front doors.** KitchenCircle uses the same per-user Swiggy OAuth token as MoodFood. There is no second token store, and carts still use the household owner's token.
- [x] **API:** `POST /swiggy/oauth/initiate` takes an optional `{ app: 'moodfood' | 'kitchen-circle' }`. Anything else, including no body, means MoodFood, so the website and MoodFood screens are unchanged. The app is kept in the PKCE state in Redis. Swiggy's return page then says "return to KitchenCircle", and its `postMessage` carries `app`.
- [x] **App:** new `app/kitchen-circle/swiggy.tsx` in the KitchenCircle brand. It has:
  - Status and expiry, with reconnect in the last day.
  - What the link is used for: live Instamart products and prices, saved addresses, and orders only after the member taps.
  - Connect, plus "I've signed in — check again". It also re-checks when the app comes back to the front, and on a web `swiggy-oauth` message.
  - The Instamart delivery address picker (owner only).
  - Disconnect, with a note that it disconnects MoodFood too.
  - A note for non-owners that carts use the owner's account.
- [x] **Entry points:**
  - Household → "Swiggy & Instamart" (owner only).
  - The cart's "not linked" line becomes a "Connect Swiggy for live products" button for the owner; other members still see the text.

**Verification:**
- Typecheck is clean for the API and mobile.
- API unit tests: 63/63 pass.
- Live against the dev API: `initiate` with `{app:"kitchen-circle"}` and with no body both return a Swiggy auth URL, and the Redis state holds `kitchen-circle` and `moodfood` respectively.
- The callback with a bad state still shows "Invalid or expired state".
- In the web app, the screen shows a linked account's expiry, and the address picker lists the live Swiggy addresses. No address was chosen.

**Open:**
- Signing in with an account that only uses KitchenCircle still goes through MoodFood's onboarding (`login.tsx` → `/swiggy-connect?onboarding=1`).

---

## The agent has a name: Haldi (2026-10-29)

**Status:** Done. Checked live (agent, replies) and in the dev web app (chat screen).

**Why Haldi:**
- Turmeric is in every Indian kitchen, and it's already the brand colour `kc.haldi`.
- The word is the same in most Indian languages.
- It's gender-neutral.
- It can't be confused with the household's real Cook role. That's why Maharaj, Didi and Masi were rejected.

**Changes:**
- [x] **Intelligence, agent prompt:** "You are Haldi, KitchenCircle's kitchen agent…". Members may call it by name, and that's never a dish. "haldi" anywhere else in a message means turmeric.
- [x] **Intelligence, reply prompt:** speaks as Haldi in the first person and never signs its name.
- [x] **Intelligence, `chat.strip_address()`:** before the agent or the rule parser runs, it drops a leading "Haldi,", "hey haldi:" or "haldi can/make/put…". The ingredient is kept: "no haldi on Monday" and "haldi milk on Sunday" are unchanged.
- [x] **API:** "Haldi" is the first transcription hint for voice messages.
- [x] **App:**
  - Chat header: "Haldi · Your kitchen agent · the whole household sees this chat".
  - Message author: "Haldi", with a haldi-yellow dot.
  - Loader: "Haldi is thinking… / writing the recipe…".
  - Empty state: "Hi, I'm Haldi. Tell me what's changing."
  - Input placeholder: "Ask Haldi — e.g. …".
  - Bottom bar centre button: "Ask Haldi", filled `kc.haldi` with a `kc.kadhai` icon (white on haldi is too faint). The shared `TabBar` gained optional `centerColor` / `centerIconColor` props; MoodFood's home and the design-system page keep the accent default.

**Verification:**
- Python: 1005 passed. The flaky lab UI tests were left out. New tests check the address stripping and the ingredient being kept; a message addressed to Haldi still sets the meal, and "no haldi on tuesdays" still makes a rule.
- API unit tests: 63 pass.
- Typecheck is clean for the API and mobile.

**Live runs (dev :8000):**

| Message | Result | Time |
|---|---|---|
| "Haldi, put pav bhaji on thursday" | SET_MEAL Pav Bhaji, Thursday | 9.4 s |
| "no haldi on tuesdays please" | every Tuesday, exclude turmeric | 1.9 s |
| "Haldi what's your name?" | "I'm Haldi, your KitchenCircle kitchen agent." | 2.7 s |
| Reply for an applied meal | "Pav Bhaji is on Thursday." | 1.5 s |

**Open (pre-existing):** opening `/kitchen-circle/chat` by URL without `planId` stays on "Loading chat". From the app it always has a `planId`.

---

## Swiggy status on the household card; the loader keeps spinning (2026-10-29)

**Status:** Done. Checked in the dev web app.

- [x] **Household → Swiggy & Instamart card** (owner only):
  - Connected: a check mark, "Swiggy is connected", "Connected until <date>", and a "Manage Swiggy connection" button.
  - In the last day before the 5-day Swiggy token expires: a haldi clock icon, "Swiggy connection ends soon", and a "Reconnect Swiggy" button.
  - Not linked: the explanation text and a "Connect Swiggy" button.
  - The status comes from `/user/me` (`swiggyLinked`, `swiggyExpiresAt`).
- [x] **`KcSpinner` keeps turning:**
  - Cause: on web, `Animated.loop` with the native driver ran one turn and stopped. In the chat, the loader then looked frozen while Haldi was still working through its live steps.
  - Fix: each turn now starts the next one until the spinner unmounts. The native driver stays on for iOS and Android; web uses the JS driver.
  - All KitchenCircle loaders use this spinner (chat, cook page, recipes, cart and the others).
- [x] **The chat waiting bubble** already stays until the reply is saved and the message list reloads. The progress steps run through to "Writing the reply". Only the spinner needed fixing.

**Verification:**
- Typecheck is clean for mobile.
- With the browser pane visible, the ring was sampled every 0.5 s and turned continuously through several turns: 66° → 166° → 266° → 6° → 108° → …
- The household card showed "Swiggy is connected · Connected until Sun, 1 Nov, 7:26 pm" for the linked owner.
- Note: a hidden browser pane runs 0 animation frames, so spinner checks need the pane visible.

---

## Voice that doesn't invent a week; live steps at full width on Android; honest bulk notes (2026-10-29)

**Status:** Done. Live-steps bubble checked on the Android emulator (debug build). Voice fixes tested live against the transcription model with recorded clips, not by speaking into a phone.

**What went wrong (Android emulator, 12:38–12:39):**
- The member said "pav bhaji on Friday". The chat showed "Kal kal kya banayenge? Aaj to poha bana diya tha na…".
- The earlier clip became a menu made only of hint names: Dal Tadka, Jeera Rice, Aloo Gobi, Poha, Paneer Bhurji, Egg Curry and Biryani.
- Haldi then queued 7 meals for Friday and Saturday, each noted "This changes 7 days".
- Cause: the transcriber is prompted with up to 300 recipe titles. On near-silence it "transcribes" the prompt.
- The emulator's virtual microphone records near-silence unless *Extended controls → Microphone → "Virtual microphone uses host audio input"* is on.

**Measured (gpt-4o-mini-transcribe):**

| Clip | With the dish-list prompt | Without a prompt |
|---|---|---|
| 4 s of near-silence | An invented week, confidence 0.67–0.84 | Empty |
| "Pav bhaji on Friday" (spoken) | Correct, 0.99 | "Have Punjabi on Friday", 0.37 |
| Hinglish speech, clean and noisy | Correct, 0.80–0.95, but in Devanagari | — |

**Changes:**
- [x] **App (`voice.ts`):**
  - The recorder meters loudness (`isMeteringEnabled`).
  - If the loudest moment stays below −50 dB, the clip is not sent. The member sees "I couldn't hear anything. Check the microphone…".
  - With no level readings, the server decides.
  - The clip length (`seconds`) is sent with the audio.
- [x] **Intelligence (`voice.transcribe`):**
  - One call with the hint prompt, `include=["logprobs"]`.
  - The transcript counts as doubtful if confidence is below 0.9, or if it has more words than the clip could hold (3.5 words/s + 4).
  - A doubtful transcript is transcribed again without the hint (`settle`). An empty or 1-word plain pass means nothing was said, so the text is empty and the API answers "I didn't catch anything".
  - Otherwise the hinted spelling is kept, unless the hint more than doubled the words.
  - The prompt asks for Hindi in Latin letters, so Hinglish arrives the way people type it and "Haldi, …" handling works.
  - Hints are capped at 60 titles (600 characters).
  - `trace.emit` records the confidence and whether the re-check ran.
- [x] **Live-steps bubble:** a fixed `width: '88%'` instead of `maxWidth`. On Android the shrink-wrapped bubble squeezed the `flex: 1` step text to one letter per line.
- [x] **Chat policy (`messageShape`):**
  - The bulk rule counts **distinct days**, not actions. The note now reads "This message changes N days…".
  - Several `SET_MEAL`s for the same day in one message always need a confirmation: "3 meals were suggested for this day. Confirm the one you want."
  - The chat and the lab policy endpoint share the helper.

**Verification:**
- Python: 1008 passed (lab UI deselected). New tests cover `doubtful`/`settle`, hinted silence re-checked and coming back empty, and clear speech trusted in one call.
- API unit: 64 pass, including distinct days and same-day meals.
- E2E: 36/36.
- Typecheck is clean for the API and mobile.

**Live runs:**
- Dev :8000: the silent clip comes back `""` (checked); "Pav bhaji on Friday please" is right in one call (0.991).
- Hinglish clips now read "Haldi, kal paav bhaji banana hai, aur Saturday ko rajma chawal."
- Emulator: the bubble shows "Deciding what to do… ✓ Reading your message" at full width. "What is on Friday" was answered with no plan change.

**Not done:** the 6 cards created by the 12:39 voice message are still waiting, and they keep the old note text. A member can dismiss them.

**Follow-up (same day):** on the emulator every clip then hit "I couldn't hear anything".
- The emulator's host microphone was off, so it recorded pure silence. The check was right; before it, that silence became an invented menu.
- Fix: `adb emu avd hostmicon`. It resets when the emulator restarts; to keep it, use *Extended controls → Microphone → "Virtual microphone uses host audio input"*.
- The app check is now also safer. expo-audio's Android `getAudioRecorderLevels()` returns exactly −160 when `maxAmplitude` is 0 or throws, which is also how a device with broken metering would look. −160 readings are now ignored. Only clips with real level readings that stay below −50 dB are stopped on the phone; everything else goes to the server's re-check.
- Still no voice after `hostmicon`. I pulled the four latest clips from the app's cache (`run-as … cache/Audio`) and measured them:
  - Two were digital silence: −91 dB mean.
  - Two had faint noise only: −59 to −65 dB mean, −29 to −31 dB peaks.
  - The transcriber found no words in any of them, even after loudness normalisation.
- So the app and server answers ("didn't catch anything", 422) were correct. The Mac's microphone audio isn't reaching the emulator.
- macOS logged microphone permission requests at 13:00:45. The emulator was started from a shell inside Claude.app, so macOS attributes the request to that app.
- Next: allow the microphone for the app that launched the emulator, or relaunch it from Android Studio's Device Manager. Or test voice in the web app in a browser.
