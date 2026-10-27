# KitchenCircle — Phase-Wise Development Plan

> **Public product name:** KitchenCircle  
> **Internal domain:** `kitchen_circle` / `planner`  
> **Purpose:** Build KitchenCircle as a first-class shared-household meal planning product inside the MoodFood app, while keeping its API, UI, intelligence, and provider boundaries portable to a future standalone product.

## Guiding architecture

KitchenCircle must not be implemented as a feature buried inside DIY recipes, recommendations, or temporary group sessions. It needs an independently coherent domain.

```text
Shared platform
├── Authentication / identity
├── Design tokens and shared UI primitives
├── Notification delivery
├── Swiggy / Instamart account infrastructure
│
├── MoodFood
│   └── solve: “What should I eat right now?”
│
└── KitchenCircle
    └── solve: “What are we making this week, what should we buy, and how do we cook it together?”
```

Suggested boundaries:

```text
apps/api/src/kitchen-circle/
apps/intelligence/app/kitchen_circle/
apps/intelligence/app/routes/kitchen_circle.py
apps/mobile/app/kitchen-circle/
apps/mobile/src/features/kitchen-circle/
```

The public API should use `/api/kitchen-circle/*`. Planner should consume MoodFood preferences/history through an explicit adapter, rather than scattered direct database reads.

## Existing foundations to reuse

- **API:** NestJS, Postgres/Drizzle migrations, authentication, notifications, Swiggy and Instamart services.
- **Intelligence:** recipe generation, dish data, food graph, recommendation components, Instamart discovery, Streamlit Lab.
- **Mobile:** Expo Router, shared UI/tokens, authenticated API calls, native share sheet patterns, push notification registration.
- **Do not reuse as the Planner model:** DIY sessions, temporary Social Groups, or a raw generative recipe response.

---

## Phase 0 — Domain contracts and implementation guardrails

### Goal

Define KitchenCircle’s boundaries before creating user-facing functionality.

### Build

- Create isolated API, intelligence, and mobile feature module scaffolding.
- Define versioned request/response schemas for:
  - household;
  - member and role;
  - plan and day slot;
  - structured recipe/version;
  - grocery requirement;
  - cart snapshot;
  - planner activity;
  - typed planner chat action.
- Add feature flags:

```text
KITCHEN_CIRCLE_ENABLED
KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED
KITCHEN_CIRCLE_LIVE_WRITES_ENABLED
```

- Establish permission rules for owner, member, and cook.
- Establish contract-testing conventions between API, intelligence, and mobile.

### Acceptance criteria

- KitchenCircle can be disabled without breaking MoodFood.
- Planner modules do not directly depend on a MoodFood UI route.
- User-facing name is KitchenCircle, while internal data models remain neutral.
- No external side effect occurs in this phase.

---

## Phase 1 — Household, roles, and current-week plan

### Goal

A solo or shared household can manually create and manage the current remaining week through Sunday.

### Database

Add tables/migrations conceptually equivalent to:

```text
households
household_members
household_invites
meal_plans
meal_slots
slot_attendance
planner_activities
```

### API

Implement initial endpoints:

```text
POST   /api/kitchen-circle/households
GET    /api/kitchen-circle/households/current
PATCH  /api/kitchen-circle/households/:id
POST   /api/kitchen-circle/households/:id/invites
POST   /api/kitchen-circle/invites/:token/accept
GET    /api/kitchen-circle/plans/current
POST   /api/kitchen-circle/plans/current
PATCH  /api/kitchen-circle/slots/:id
POST   /api/kitchen-circle/slots/:id/lock
POST   /api/kitchen-circle/slots/:id/unlock
```

### Mobile

- Add KitchenCircle as a first-class top-level application destination.
- Household setup supports a solo household first.
- Create a current-week calendar with one shared day slot.
- Support blank, planned, locked, leftovers, no-cook, household-out, and partial-attendance states.
- Add default household servings and per-day serving overrides.
- Add simple auditable activity history.

### Tests

- Owner/member/cook authorization.
- One plan per household per calendar week.
- Current plan ends Sunday.
- Locked slot cannot be changed without explicit confirmation/unlock.
- Solo household works without invitations.

### Exit criteria

A household can create, edit, lock, and inspect a current-week plan without recipes, AI, or grocery integration.

---

## Phase 2 — Next-week planning, recurring rules, and household preferences

### Goal

Represent the actual cultural, dietary, and scheduling constraints of households.

### Build

Add models for:

```text
household_rules
member_food_preferences
slot_reactions
```

Support:

- next Monday–Sunday planning;
- phone/email member and cook invitations;
- recurring weekday rules;
- per-day attendance;
- reactions to planned meals;
- preference levels:
  1. cannot eat;
  2. never plan for me;
  3. prefer less often;
  4. like/favourite.

### Recurring-rule support

Rules must support hard, preference, and contextual strength:

- vegetarian Tuesday;
- no onion/garlic Friday;
- quick Wednesday;
- cook unavailable Sunday;
- weekday budget preference;
- elaborate meal allowed Saturday;
- recurring member absence.

Chat will later clarify whether a rule applies this week only or recurs; Phase 2 must store both kinds of rules correctly.

### MoodFood adapter

Create a permissioned `PlannerProfileAdapter` to import eligible taste/preferences from MoodFood. It must not expose a member’s private MoodFood history to other household members.

### Exit criteria

The system can define a valid meal-planning universe for the current and next week before it tries to recommend meals.

---

## Phase 3 — Structured recipe catalogue and private household recipes

### Goal

Every meal eligible for grocery planning has reliable, versioned structured ingredients and steps.

### Build

Create concepts/tables for:

```text
recipes
recipe_versions
household_recipes
```

A grocery-eligible recipe version requires:

- default servings;
- canonical ingredient identities;
- quantities and compatible units;
- optional/required flags;
- instructions and timing;
- dietary/allergen confidence/provenance;
- cuisine, effort, freshness class, and substitutions;
- version identity for immutable grocery snapshots.

### Recipe lifecycle

```text
Catalog recipe → directly usable
AI recipe draft → structured validation → household review → usable household recipe
Household recipe → private by default → reusable within the household
```

### Mobile

- Recipe search and browse.
- Add recipe to a day slot.
- Build/edit private household recipe.
- Clearly label catalog recipe, household recipe, and unaccepted AI draft.

### Tests

- Incomplete/ambiguous ingredient data cannot enter grocery aggregation.
- Household recipe cannot become globally visible by accident.
- Grocery snapshot retains original recipe version after future recipe edits.

### Exit criteria

A household can reliably select or create recipes that are ready for scaling and grocery computation.

---

## Phase 4 — Grocery requirements, deduplication, pantry, and snapshots

### Goal

Convert several recipes into one accurate, explainable household grocery requirement before any live provider/cart call.

### Build

Create:

```text
household_pantry_defaults
grocery_snapshots
grocery_snapshot_lines
grocery_coverage
```

### Aggregation pipeline

```text
selected meal slots
→ scale recipe ingredients by servings
→ canonicalize ingredient identity
→ preserve meaningful distinctions
→ convert compatible units
→ sum quantities across recipes
→ exclude pantry defaults
→ record day/recipe source trace
→ create immutable snapshot
```

Examples:

```text
2 onions + 1 onion = 3 onions
500 g + 750 g + 400 g chicken = 1.65 kg chicken
spring onion != regular onion
bone-in chicken != boneless chicken unless a declared substitution permits it
```

### V1 grocery behavior

- Whole remaining-plan and single-day cart scope.
- Pantry staples excluded by default but shown in recipes.
- Manual add/skip/already-have/product/quantity controls.
- Required ingredient warning when skipped.
- Recipe-required vs pantry vs manually added/changed labelling.
- Covered-day tracking and duplicate-purchase prevention.
- Optional grocery budget.
- Freshness groups: buy now, buy later, or order all anyway.

### Critical tests

- Correct aggregation and unit conversion.
- No duplicate day coverage without an explicit override.
- Existing cart/order never changes after a plan edit.
- Source trace explains every aggregate ingredient line.

### Exit criteria

KitchenCircle can provide a complete weekly grocery list with correct dedupe and clear provenance, without Instamart writes.

---

## Phase 5 — Household auto-fill and planning intelligence

### Goal

Generate a reviewable week proposal based on household constraints and preferences.

### Intelligence pipeline

```text
household context
→ hard constraints
→ structured recipe retrieval
→ household-fit scoring
→ fairness and repeat handling
→ cuisine/protein/effort diversification
→ light ingredient-overlap optimization
→ explainable weekly proposal
```

Inputs:

- hard dietary/allergy/religious restrictions;
- member attendance;
- recurring rules;
- locked slots;
- recipe availability;
- servings;
- budget and effort preferences;
- leftovers/no-cook/going-out days;
- household/member tastes and fairness;
- existing plan meals.

### API and mobile

```text
POST /api/kitchen-circle/plans/:id/autofill
POST /api/kitchen-circle/plans/:id/proposals/:proposalId/apply
POST /api/kitchen-circle/slots/:id/swap
```

- Auto-fill only blank/unlocked eligible days.
- Show all proposed days before applying.
- Support apply all, apply selected, swap one day, regenerate unlocked days, serving edits, and clear actions.
- Grocery creation remains a separate explicit action.

### Exit criteria

Auto-fill reduces planning effort but never silently changes a household’s week.

---

## Phase 6 — Shared chat and typed planner actions

### Goal

Allow natural-language planning without letting an LLM mutate household data freely.

### Build

Create:

```text
planner_messages
planner_action_proposals
```

Supported action types include:

```text
SET_MEAL
CLEAR_DAY
SET_DAY_STATUS
SET_SERVINGS
SET_ATTENDANCE
LOCK_SLOT
UNLOCK_SLOT
CREATE_RECURRING_RULE
UPDATE_RECURRING_RULE
REQUEST_AUTOFILL
CREATE_GROCERY_SNAPSHOT
```

### Policy

- Clear low-risk edit to an unlocked day: apply and log.
- Ambiguous shared/attendance instruction: ask clarification.
- Locked-day change: confirmation required.
- Bulk week changes: proposal/review required.
- Any cart/order action: explicit confirmation required.

### Example

```text
“We are going out Friday”
→ Solo household: mark household out.
→ Multi-member household: ask whether everyone is out or only the sender.
```

### Exit criteria

The chat is visible to members, produces auditable action cards, and never bypasses permissions or confirmation rules.

---

## Phase 7 — Instamart matching, pack optimization, and owner checkout

### Goal

Map grocery requirements to actual local products and pack combinations.

### Provider boundary

Use a new provider adapter, not direct DIY coupling:

```text
KitchenCircleGroceryProvider
InstamartKitchenCircleAdapter
```

### Pack optimization

Inputs:

- aggregated requirement;
- household address;
- provider availability;
- product pack sizes and prices;
- dietary/quality/brand constraints;
- freshness group;
- household preferences.

Output:

- selected products and pack quantities;
- total purchased quantity;
- required quantity;
- expected surplus;
- estimated cost;
- explanation.

Example:

```text
Required: 1.65 kg chicken
Available: 300 g packs only
Recommended: 6 × 300 g = 1.8 kg
Expected surplus: 150 g
```

The engine must optimize actual purchasable combinations, not an arbitrary rounded quantity.

### Permissions

- Owner’s linked Instamart account and owner-managed household address are used in V1.
- Members can generate/review a cart proposal.
- Owner alone can create/update/place the live cart/order.
- No automatic checkout.

### Rollout safety

1. Fixture catalogue and optimizer tests.
2. Read-only product matching/cart preview.
3. Feature-flagged live cart writes.
4. Explicit owner checkout.

### Exit criteria

The owner can inspect a live, pack-optimized, explainable cart that covers the plan and choose to place it.

---

## Phase 8 — Cook experience, translations, notifications, and post-meal feedback

### Goal

Make the plan executable in the kitchen and useful over time.

### Cook experience

- Cook-role account sees entire remaining cooking week, read-only.
- Signed/revocable day-specific cook links work in responsive web.
- Native share sheet supports WhatsApp/SMS/copy link.
- Cook views never show chat, household preferences, addresses, prices, payments, or order data.

### Translation

Support:

- English;
- Hindi;
- Hinglish;
- Marathi;
- Tamil;
- Telugu;
- Bengali;
- Kannada.

Rules:

- Native script by default for supported languages.
- “Show in English letters” transliteration toggle.
- Canonical ingredient/quantity data remains stable underneath translated output.
- Translation failure falls back safely rather than changing quantities.

### Notifications

Reuse the API’s existing in-app + Expo push system. Add:

```text
planner_weekend_nudge
planner_grocery_ready
planner_today_meal
planner_locked_changed
planner_day_changed
planner_cart_outdated
planner_invite
```

Launch priority:

1. weekend plan nudge;
2. grocery-review reminder;
3. locked/shared-plan change alerts;
4. opt-in daily meal reminder.

### Feedback loop

Offer an optional in-app post-meal check-in: loved it, change something, skipped, or move it. Use feedback to improve future recipe fit/servings/effort estimates, never to mutate historical cart snapshots.

### Exit criteria

A cook can understand the meal in their chosen language and the household can learn whether its plan was actually practical.

---

## Phase 9 — Streamlit Planner Lab, observability, and standalone readiness

### Goal

Make KitchenCircle reliable, testable, measurable, and ready for eventual independent extraction.

### Streamlit Planner Lab

Add internal pages for:

- synthetic household setup;
- weekly proposal inspection;
- constraint and conflict simulation;
- chat action simulation;
- recipe scaling;
- ingredient aggregation trace;
- pack optimizer fixture scenarios;
- translated cook preview;
- notification preview;
- post-meal feedback simulation.

Default to fixtures. Permit authorized, clearly labelled **read-only** provider discovery only. Do not allow live cart/order/invitation/push writes by default.

### Observability

Track:

- autofill acceptance/swap/rejection;
- planned-day completion;
- cart creation and coverage;
- manual grocery corrections;
- product matching/stock failures;
- pack surplus;
- duplicate-purchase overrides;
- recipe satisfaction/skips;
- translation failure;
- notification delivery;
- attempted hard-rule violations.

### Extraction checklist

- Planner APIs work without MoodFood routes.
- MoodFood profile adapter can be disabled.
- Provider interfaces are explicit.
- Environment/configuration are isolated.
- Planner database ownership/migration strategy is documented.
- Mobile KitchenCircle feature can become a separate app client with minimal rewrite.

---

## Recommended implementation order

Do not begin with LLM chat or live grocery checkout. Build structured household/planning data first.

```text
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9
```

## First implementation milestone

Start with **Phases 0 and 1** in the first PR:

1. Create KitchenCircle API/mobile/intelligence feature boundaries.
2. Add household, member, plan, slot, attendance, and activity migrations.
3. Build current-week APIs and authorization.
4. Add a simple solo-household KitchenCircle mobile calendar.
5. Support manual day state, servings, and locking.
6. Add database/API tests before recipes, recommendations, chat, or Instamart work.

This creates a stable core that every later phase can build upon safely.
