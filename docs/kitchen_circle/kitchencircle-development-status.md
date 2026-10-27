# KitchenCircle Development Status

> This is the single implementation ledger for KitchenCircle. Update it whenever a phase begins, a meaningful deliverable lands, testing runs, scope changes, or a blocker is discovered.
>
> **Last updated:** 2026-10-27
> **Current milestone:** Phase 4 complete — grocery requirements, dedupe, pantry, and immutable snapshots. Next: Phase 5 household auto-fill.

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
| 0 | Domain contracts, feature boundaries, and guardrails | In progress | 60% |
| 1 | Household, roles, and current-week plan | In progress | 70% |
| 2 | Next-week planning, recurring rules, preferences, attendance | In progress | 40% |
| 3 | Structured recipes and private household recipes | Complete | 100% |
| 4 | Grocery requirements, dedupe, pantry, and cart snapshots | Complete | 100% |
| 5 | Household auto-fill and planning intelligence | Not started | 0% |
| 6 | Shared chat and typed planner actions | Not started | 0% |
| 7 | Instamart matching, pack optimization, owner checkout | Not started | 0% |
| 8 | Cook experience, translations, notifications, post-meal feedback | Not started | 0% |
| 9 | Streamlit Planner Lab, observability, standalone readiness | Not started | 0% |

---

## Phase 0 — Domain contracts, feature boundaries, and guardrails

**Status:** In progress  
**Completion:** 60%

### Objective

Create isolated KitchenCircle API, intelligence, and mobile boundaries with versionable contracts, clear permissions, and feature gating. KitchenCircle must remain portable to a future standalone client.

### Planned deliverables

- [x] NestJS `kitchen-circle` module boundary.
- [ ] Intelligence-service `kitchen_circle` boundary; deferred until planning intelligence in Phase 5.
- [x] Mobile `kitchen-circle` route/feature boundary.
- [x] Public API namespace: `/api/kitchen-circle/*`.
- [x] Initial typed contracts for household, member role, plan, day slot, and activity.
- [ ] Owner/member/cook permission policy encoded in integration tests; service enforcement has started.
- [ ] Feature configuration/flag strategy; required before live grocery work, not needed by the read/write-free Phase 1 foundation.
- [x] Database migration generated and applied locally.

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Phase plan and KitchenCircle product/technical specification created. Phase 0 implementation started. |
| 2026-06-16 | Added isolated NestJS KitchenCircle module, `/api/kitchen-circle/*` namespace, Drizzle schema/migration, calendar helpers, and initial Expo route/API feature boundary. |
| 2026-06-16 | Migration `0005_magenta_colonel_america` generated and applied locally. |

### Blockers / decisions needed

- No current blocker. Intelligence route boundary is intentionally deferred until auto-fill work; an empty endpoint would add no value.

### Verification

- `pnpm db:migrate` — passed.
- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (42 tests).

---

## Phase 1 — Household, roles, and current-week plan

**Status:** In progress  
**Completion:** 70%

### Objective

Allow solo/shared households to create and collaboratively maintain one current-week plan, starting on a selected current date and ending Sunday.

### Planned deliverables

- [x] Household, membership, plan, day-slot, and activity migrations.
- [ ] Invitation and attendance migrations; moved to Phase 2, where their collaboration behavior is implemented.
- [x] Solo household creation and household listing API.
- [x] Initial owner/member/cook role authorization in plan/slot service paths.
- [x] Current-week plan creation/retrieval API.
- [x] Day state, servings, notes, and lock/unlock API actions.
- [x] Initial mobile KitchenCircle route, Home entry, and solo-household plan view.
- [x] Activity trail written for household creation, slot update, lock, and unlock.
- [x] Calendar unit tests and DB-backed API integration coverage.
- [x] Household setup form and interactive mobile slot editing.
- [ ] Shared-household invitation/attendance flows; scheduled for Phase 2.

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Added current-week plan schema/service/controller and a mobile foundation screen. The first mobile entry currently creates a default solo household; richer setup and slot editing are pending. |
| 2026-06-16 | Added and ran a DB-backed API end-to-end test covering solo-household creation, current-week plan generation, slot edit, lock/unlock protection, and activity history. |
| 2026-06-16 | Replaced the temporary mobile foundation with household name/default-serving setup and in-app meal, leftovers, household-out, servings, and lock controls. |

### Blockers / decisions needed

- No hard blocker. Remaining Phase 1 work is UX polish and a mobile smoke test; shared-household collaboration begins in Phase 2.

### Verification

- `pnpm db:migrate` — passed.
- `pnpm --filter @moodfood/api typecheck` — passed.
- `pnpm --filter @moodfood/mobile typecheck` — passed.
- `pnpm --filter @moodfood/api test` — passed (42 tests).

---

## Phase 2 — Next-week planning, recurring rules, preferences, and attendance

**Status:** In progress  
**Completion:** 40%

### Planned deliverables

- [x] Next Monday–Sunday plan creation, idempotency, and mobile entry point.
- [ ] Next-week plan navigation alongside the current-week view.
- [x] Account-bound email invitations for member and cook roles; invitation acceptance requires authentication with the invited email.
- [ ] Phone invitations and owner invitation management (inspect/resend/revoke).
- [x] Per-day self-attendance with an explicit attending/absent state; absence is stored as an override and attendance defaults to present.
- [ ] Recurring household rules.
- [ ] Preference-strength model and reactions.
- [ ] MoodFood profile adapter.

### Progress log

| Date | Update |
| --- | --- |
| 2026-06-16 | Added an owner/member-only next-week creation API. It creates a full Monday–Sunday blank plan using the household default servings, is idempotent per household/week, records activity, and is covered by the KitchenCircle API E2E test. Added a mobile “Plan next week” entry point. |
| 2026-06-16 | Added `household_invites` migration and owner-only account-bound email invitations for member/cook roles. Acceptance is authenticated, email-bound, expiry-checked, auditable, and the cook cannot create plans. |
| 2026-06-16 | Added `slot_attendance` migration and an authenticated self-attendance API. Every member, including a cook, can mark only their own slot attendance; each update is auditable. |

### Verification

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

**Status:** Not started  
**Completion:** 0%

### Planned deliverables

- [ ] Constraint-aware recipe retrieval/ranking.
- [ ] Whole-week proposal generation.
- [ ] Review/apply/swap/regenerate workflow.
- [ ] Explainable household-fit scoring.

### Blockers / decisions needed

- None currently.

---

## Phase 6 — Shared chat and typed planner actions

**Status:** Not started  
**Completion:** 0%

### Planned deliverables

- [ ] Shared chat message/activity model.
- [ ] Typed action parser and validation.
- [ ] Clarification/confirmation rules.
- [ ] Mobile shared-chat surface.

### Blockers / decisions needed

- None currently.

---

## Phase 7 — Instamart matching, pack optimization, and owner checkout

**Status:** Not started  
**Completion:** 0%

### Planned deliverables

- [ ] Grocery-provider adapter.
- [ ] Read-only product matching.
- [ ] Pack-size optimization.
- [ ] Owner-only live cart/checkout behind flags.

### Blockers / decisions needed

- None currently.

---

## Phase 8 — Cook experience, translations, notifications, and feedback

**Status:** Not started  
**Completion:** 0%

### Planned deliverables

- [ ] Cook role and revocable cook links.
- [ ] Supported-language recipe presentation/transliteration.
- [ ] Planner notification types/scheduling.
- [ ] Post-meal feedback loop.

### Blockers / decisions needed

- None currently.

---

## Phase 9 — Streamlit Planner Lab, observability, and standalone readiness

**Status:** Not started  
**Completion:** 0%

### Planned deliverables

- [ ] Internal Planner Lab using safe fixtures by default.
- [ ] Read-only live provider inspection for authorized testers.
- [ ] Metrics, dashboards, and traceability.
- [ ] Standalone extraction checklist.

### Blockers / decisions needed

- None currently.
