# Planner — Product Requirements and Technical Specification

> **Working name:** Planner  
> **Positioning:** A shared household meal-planning, recipe, and grocery-intelligence product inside MoodFood, designed so it can later operate as a standalone product.
>
> **Status:** Product specification from discovery workshop. It records agreed direction, not implemented capability.

---

## 1. Product thesis

Planner solves a common household problem: **“What are we making this week, who is eating it, what do we need to buy, and how do we make sure the person cooking can execute it?”**

It is not a diet tracker, calorie product, or generic recipe feed. Its primary value is reducing household coordination work:

1. Create one shared home-cooked meal plan per day.
2. Let every relevant household member contribute, while keeping the plan understandable and editable.
3. Turn the selected recipes into one intelligent, deduplicated grocery requirement.
4. Convert those requirements into the real pack sizes and products a grocery provider can sell.
5. Give the cook clear, translated, scaled instructions without exposing private household information.
6. Learn which meals are practical and liked by this specific household.

The product is especially relevant to Indian and diaspora households, where meal decisions can combine family preferences, dietary and religious customs, cook/house-help workflows, grocery shopping, language diversity, and last-minute coordination.

---

## 2. Scope and non-goals

### 2.1 V1 scope

- One **shared home-cooked meal per household per day**.
- Current remaining week and next Monday–Sunday week.
- Solo households and shared households use the same model.
- Manual planning, recipe browse/search, AI-assisted suggestions, and weekly auto-fill.
- Shared visible household chat for planning actions.
- Recipes, private household recipes, ingredient aggregation, pantry assumptions, grocery-cart snapshots, and Instamart integration.
- English, Hindi, Hinglish, Marathi, Tamil, Telugu, Bengali, and Kannada support.
- Owner/member/cook roles plus revocable read-only cook links.
- Mobile application first, with internal Streamlit testing tools and responsive cook links.

### 2.2 Explicit non-goals for V1

- Multiple independent meals per person per day.
- Calorie counting, clinical nutrition, or wellness claims.
- Automatic pantry inventory, expiry tracking, or assumed leftover quantities.
- Full per-person meal plans.
- Automatically placing a grocery order.
- Automated WhatsApp/SMS messaging to cooks.
- A complete owner/member web dashboard.
- Voice input; the domain should remain voice-ready, but typed chat launches first.
- Automatically publishing household recipes to a global public catalogue.

---

## 3. Product shell and standalone portability

Planner is a first-class product mode—not a feature buried under DIY recipes.

```text
Shared MoodFood application shell
├── MoodFood
│   ├── mood-aware quick decisions
│   ├── recommendations and games
│   └── delivery/discovery
│
└── Planner
    ├── households and member roles
    ├── current and next-week plans
    ├── planning chat
    ├── recipes and household recipes
    ├── grocery intelligence and cart snapshots
    ├── cook views and translations
    └── planner notifications
```

The mobile product should expose **MoodFood | Planner** as top-level navigation/routes. Planner must have its own domain model, API surface, UI feature module, state/query layer, and tests.

### Portability principles

- Planner owns plans, household membership, recipes, grocery snapshots, collaboration, and cook-access data.
- Planner may consume MoodFood preference/history through an explicit adapter; it must not scatter direct reads of MoodFood-specific data throughout planner logic.
- Shared platform services may remain common: authentication, identity, design tokens, push delivery, and provider authentication.
- A future standalone Planner client must work with Planner APIs alone, even if no MoodFood preference history exists.
- Instamart/Swiggy integrations must sit behind provider interfaces rather than becoming UI-specific assumptions.

---

## 4. Core calendar model

### 4.1 Plan periods

A household may have one plan for each Monday–Sunday calendar week.

- **Current plan:** can be created on any day and starts on the date it is created/selected, ending Sunday.
- **Next plan:** can be created and edited in advance for the next Monday–Sunday period.
- At most one active plan exists for a household per calendar week.
- Past slots become historical/read-only by default.
- A prior plan may be duplicated into a new proposal, but never silently becomes a committed plan.

### 4.2 Daily slots

Each eligible day has at most one shared meal slot. A slot has one of these states:

| State | Meaning | Grocery effect |
|---|---|---|
| Blank | No choice yet; eligible for auto-fill. | None. |
| Planned | A structured recipe is selected. | Included when cart is generated. |
| Locked | Meal is finalized; changes require explicit unlock/change confirmation. | Included when cart is generated. |
| Partial attendance | Meal remains planned, but one or more members are absent. | V1 does not silently alter quantities/carts. |
| Household out/cancelled | No shared home-cooked meal expected. | Excluded. |
| Leftovers | Covered by prior cooking. | Excluded from new ingredient calculation. |
| No-cook/pantry meal | Simple non-recipe or pantry meal. | Excluded unless manual groceries are added. |

### 4.3 Servings

Planner uses a hybrid serving model:

- Household setup includes a default serving count.
- Attending active members can suggest a count.
- Any member can override servings per day for guests, packed lunches, or intentional leftovers.
- Recipes scale from the selected day’s effective servings.
- A grocery cart is a snapshot: later serving/attendance edits never silently change a created or ordered cart.

---

## 5. Household model, roles, and permissions

### 5.1 Household

A household can contain one person or many. It has shared planning rules, a default grocery address, pantry defaults, recurring constraints, and shared plans.

### 5.2 Roles

| Capability | Owner | Member | Cook |
|---|---:|---:|---:|
| View shared plan/recipes | Yes | Yes | Cooking-only view |
| Edit day slots and chat | Yes | Yes | No |
| Lock/unlock slot | Yes | Yes | No |
| Create cart proposal | Yes | Yes | No |
| Change grocery address/rules | Yes | No | No |
| Manage household/invites | Yes | No | No |
| Place Instamart order | Yes | No | No |
| View payment/cart/order details | Yes | Limited list review | No |
| View household chat/preferences | Yes | Yes | No |
| View full remaining weekly cooking plan | Yes | Yes | Yes, cooking data only |

### 5.3 Invitations

- Owner can invite a **Member** or **Cook** by phone number or email.
- Invite acceptance requires authentication for account roles.
- Owner can inspect, resend, revoke, or remove invitations/members.
- Cook share links are different from invitations: recipients need no account and receive no household membership.

### 5.4 Cook role and secure cook link

A Cook-role account can see the remaining week’s cooking-relevant plan only:

- meal/date/status;
- servings;
- ingredient quantities;
- recipe steps, timing, and notes;
- language and transliteration controls.

It never exposes household chat, preferences, attendance, cart price, delivery address, payment, orders, or settings.

An authorized owner/member can also generate a **signed, revocable, read-only cook link** for a specific planned meal/day. It opens in responsive web and supports native sharing. It should support expiry options and explicit revocation.

---

## 6. Preferences, safety, fairness, and recurring rules

### 6.1 Member food-preference levels

Each person has four preference strengths:

1. **Cannot eat:** allergy, medical, religious, or other non-negotiable restriction. Absolute hard block.
2. **Never plan for me:** strong exclusion. Hard block whenever the member is attending.
3. **Prefer less often:** soft negative; avoid by default but may appear if the household fit is otherwise strong.
4. **Like/favourite:** positive ranking signal.

Hard constraints must be met for every member attending the shared meal. One member may mark themselves absent; Planner must never simply recommend a meal that violates that member’s declared hard constraint.

### 6.2 MoodFood profile import

When a member already uses MoodFood, Planner can import eligible preference signals through a profile adapter. It must not expose a person’s private MoodFood history to other household members. Every member still reviews planner-specific diet/allergy preferences on joining.

### 6.3 Fairness

Planner should avoid optimizing for the most active member. It should rotate soft-preference priority across people and learn from reactions, swaps, and completed meals. Hard constraints always override fairness.

### 6.4 Recurring household rules

Households can define day-of-week constraints, with explicit strength:

- **Hard rule:** vegetarian Tuesday, no onion/garlic Friday, cook unavailable Sunday.
- **Preference:** dal-rice once a week, more elaborate weekend meal.
- **Contextual suggestion:** use vegetables by Friday, budget-friendly weekdays.

Rule categories include dietary/religious rules, cuisine/dish patterns, cooking time/effort, cook availability, recurring attendance, budget, and ingredient preferences. Chat must clarify whether a new request applies **this week only** or **every week going forward**. One-week overrides never delete recurring rules.

---

## 7. Plan creation and meal selection

### 7.1 Manual meal selection

Each editable slot supports three paths:

1. **Browse/search structured recipes.** Search dish, cuisine, ingredient, diet, effort, or time. These are cart-ready.
2. **Ask Planner for suggestions.** Examples: “What should we make Thursday?” or “Suggest a quick vegetarian recipe using paneer.”
3. **Enter any meal idea.** If unavailable, Planner creates/fetches a clearly marked recipe draft. It must be reviewed before it contributes to a grocery calculation.

### 7.2 Auto-fill

Auto-fill applies only to blank/unlocked/eligible days and produces a reviewable weekly proposal.

It considers, in order:

1. hard household/member constraints;
2. recurring day rules and locked slots;
3. structured recipe availability;
4. effective servings and attendance;
5. budget/effort/freshness context;
6. household and individual preferences/fairness;
7. variety, repeat avoidance, and sensible ingredient reuse.

It must show a full proposed week before applying. Per-day swap/regenerate, whole-week regenerate, clear, serving edit, and lock actions are available. Grocery ordering is always separate and explicit.

### 7.3 Shared meal constraint

V1 plans one meal safe and acceptable for all attending people. It does not generate entirely separate meals per person. A structured recipe may optionally support a non-essential variation/add-on only if the base remains suitable for everyone.

---

## 8. Shared planner chat

Planner chat is shared and visible to household members by default. The calendar/plan is the source of truth; chat is a natural-language layer that produces typed planner actions.

### 8.1 Examples

```text
"Put chicken biryani on Saturday"
→ SET_MEAL(day=saturday, recipe=chicken_biryani)

"We are going out Friday"
→ Solo household: SET_DAY_STATUS(friday, household_out)
→ Shared household: clarify whether all members are out or only the speaker.

"Make Tuesday vegetarian"
→ APPLY_DAY_CONSTRAINT(tuesday, vegetarian=true) + proposed replacement.

"Plan easy meals for the rest of the week"
→ generate multi-day proposal; review required.
```

### 8.2 Risk-based action policy

- Apply clear, low-risk updates to unlocked slots immediately and log them.
- Clarify ambiguous requests, attendance changes, and shared “we” statements.
- Require confirmation for locked-day overrides, household-wide cancellation, bulk changes, or any grocery-cart creation/update.
- Render applied actions as structured activity cards, not only chat prose.
- Record actor, timestamp, prior value, new value, and plan version for material edits.

### 8.3 Reactions

Members can react to proposed/unlocked meals:

- Looks good;
- Not for me, with optional reason;
- Suggest another;
- I am not eating this day.

Reactions are signals, not blocking votes. Locking is the finalization mechanism.

---

## 9. Recipes and private household recipes

### 9.1 Recipe strategy

Planner is hybrid:

- Auto-fill prioritizes structured, reviewed recipes.
- AI can explain, adapt, substitute, or draft a recipe.
- AI-generated/materially modified recipes are visible as drafts/customized recipes until accepted.
- Only recipes with structured, usable ingredient quantities may participate in grocery aggregation.

### 9.2 Required structured recipe fields

```text
recipe
- id, source, visibility, version
- title and canonical dish identity where known
- default_servings
- ingredients[]: canonical_ingredient_id, display name, quantity, unit,
  optional flag, preparation form, substitution group, freshness class
- steps[]: order, structured timing/heat fields, source instruction
- prep/cook/total time
- diet/allergen confidence/provenance
- cuisine, effort, skill level, equipment needs
- supported variations/add-ons
- translations/transliteration metadata
```

### 9.3 Private household recipes

Members can create or adapt a recipe and save it privately to the household library. It is reusable in future plans and can enter auto-fill for that household once structured. It is never publicly discoverable by default.

---

## 10. Language, translation, and transliteration

### 10.1 V1 languages

- English
- Hindi
- Hinglish
- Marathi
- Tamil
- Telugu
- Bengali
- Kannada

### 10.2 Implementation rule

Planner data is language-neutral: canonical recipe IDs, ingredient IDs, quantities, units, statuses, and actions are structured. Translations are presentation layers.

- Supported Indian languages render in native script by default.
- A **Show in English letters** transliteration toggle is available.
- Hinglish is a conversational style, typically Roman-script mixed Hindi/English; it is not an independent canonical recipe copy.
- Exact units/quantities must never be silently changed by translation.

---

## 11. Grocery intelligence

### 11.1 Core principle

The grocery engine calculates requirements from the **entire cart coverage scope**, not recipe by recipe in isolation. It answers:

> What does this household need for all selected meals, what products can actually be bought at its address, and what pack combination best covers the requirement?

### 11.2 Ingredient aggregation pipeline

1. Select eligible planned recipes in covered days.
2. Scale ingredients to the day’s effective servings.
3. Normalize each ingredient to a canonical ingredient identity.
4. Preserve important distinctions: spring onion ≠ onion; bone-in chicken ≠ boneless chicken; basmati ≠ sona masoori unless a declared substitution rule permits it.
5. Convert compatible measures into base units where reliable.
6. Sum quantities by canonical ingredient/quality/substitution constraints.
7. Exclude household pantry assumptions unless explicitly added back.
8. Keep a trace back to day, recipe, recipe version, and ingredient line.

Example:

```text
Weekly recipe requirement: chicken = 1.65 kg
- Monday Butter Chicken: 500 g
- Wednesday Chicken Biryani: 750 g
- Saturday Chicken Curry: 400 g
```

### 11.3 Pack-size optimization

The system must optimize against products/pack sizes actually available through Instamart for the household address.

Example:

```text
Required: 1.65 kg chicken
Available: 300 g packs only
Recommendation: 6 × 300 g packs = 1.8 kg
Surplus: 150 g
```

It must not first round to an arbitrary “2 kg” quantity. It should evaluate feasible product combinations using this priority order:

1. sufficient quantity;
2. location-specific availability;
3. compatibility with dietary/quality/brand constraints;
4. lowest practical surplus/waste;
5. household product preferences;
6. price; and
7. fewer packages where otherwise equivalent.

The cart must explain the chain: total need, recipe allocation, products selected, total purchased, and expected surplus.

### 11.4 Pantry defaults

Households get an editable default staple list. Recipes always display every ingredient, but pantry staples are excluded from the cart by default. A user can re-add a staple to a particular cart.

V1 does not assume true inventory quantities or expiry.

### 11.5 Manual grocery control

Users may:

- mark ingredient as already available/skip purchase;
- adjust purchase quantities;
- choose product/brand/pack substitutions;
- add non-recipe grocery items;
- remove optional items;
- buy extra.

The UI distinguishes recipe-required, pantry-assumed, manually added, and manually changed/skipped items. It warns—but does not block—when a required ingredient is omitted.

### 11.6 Freshness-aware carts

Ingredients have broad freshness classes: stable/pantry, refrigerated, fresh, and highly perishable. Planner can propose:

- **Buy now:** stable and near-term items;
- **Buy later:** ingredients intended for later meals that may perish.

A one-week cart remains valid as the default. Split carts are optional and preserve coverage/deduplication rules.

### 11.7 Budgets

Households can set an optional weekly grocery budget and each plan can override it. After provider matching, Planner shows the estimated total and, if necessary, transparent options: cheaper recipe swaps, comparable products, optional-ingredient removal, or acceptance of overage. It never silently changes meals or quantities to meet budget.

---

## 12. Cart snapshots, coverage, and checkout

### 12.1 Cart snapshot

A cart is a reviewable snapshot, not a live mutable projection of the plan. It records:

- household/plan;
- covered day slots;
- recipe versions and serving counts;
- aggregated requirements;
- product/pack choices;
- manual edits;
- provider/address context;
- status, creator, timestamps, and order reference.

A plan can remain editable after a snapshot/order exists. Planner displays that the cart is out of date and offers explicit review/regeneration; it never silently changes an existing cart/order.

### 12.2 Duplicate prevention

Before a new weekly/day cart is created, Planner checks covered day slots and recipe versions. If Friday is already covered by a Wednesday–Sunday purchase, it should explain this and offer a deliberate override only for situations like missing delivery, replacement, or extra quantities.

### 12.3 Provider and checkout ownership

- A household has one owner-managed default grocery delivery address.
- Owner’s connected Instamart account is the grocery provider in V1.
- Owner is the only person who can place the order.
- Members may create/review cart proposals but do not place orders.
- Cook cannot view cart, price, address, payment, or order details.
- Planner still produces a useful deduplicated list without a provider connection.

---

## 13. Post-meal feedback

After a planned date passes, show an optional in-app check-in:

- Yes, loved it;
- Yes, but change something;
- Skipped it;
- Move it to another day.

Useful reasons include too much effort, too spicy, too expensive, insufficient/excess food, difficult ingredient, unavailable ingredient, or changed plans. This improves household ranking, recipe practicality, future servings, and auto-fill, but never mutates historical cart/order data.

---

## 14. Notifications

Notifications remain a backend/API responsibility. The intelligence service may provide decision support but must not send pushes directly.

Planner notification types:

- `planner_weekend_nudge`
- `planner_incomplete`
- `planner_grocery_ready`
- `planner_today_meal`
- `planner_day_changed`
- `planner_locked_changed`
- `planner_cart_outdated`
- `planner_invite`

V1 uses the existing in-app notification plus Expo push pattern. Initial priority:

1. Weekend planning nudge.
2. Grocery review reminder.
3. Important locked/shared-plan change notifications.
4. Opt-in today’s-meal reminder.

Recipients control routine reminders. Important shared-plan changes can notify affected members. Cook-link recipients do not receive app push unless they are Cook-role account holders.

---

## 15. Internal Planner Lab

Planner remains mobile-first publicly. Add a Planner section to the existing intelligence-side Streamlit Lab for internal development, product review, and safety testing.

Capabilities:

- test households, members, roles, rules, attendance, preferences, and languages;
- current/next plan creation and auto-fill;
- visible scoring/selection explanations;
- simulated chat actions and locking conflicts;
- recipe scaling/private recipes;
- ingredient aggregation trace and package optimization;
- pantry/freshness/budget/covered-day scenarios;
- translated cook-view rendering;
- post-meal feedback simulation;
- notification preview without sending pushes.

Default to fixtures. Authorized testers may use clearly labeled live **read-only** Swiggy/Instamart discovery with test credentials. Cart writes, orders, invitations, destructive actions, and real notifications stay disabled unless separately environment-gated.

---

## 16. Suggested domain model

```text
households
- id, owner_user_id, name, timezone, default_servings
- grocery_address_id, grocery_provider, settings_json

household_members
- household_id, user_id, role (owner|member|cook), status
- food_profile_ref, language_preference, joined_at

household_invites
- id, household_id, role, email_or_phone, token_hash, expires_at, status

household_rules
- id, household_id, weekday, scope, strength (hard|preference|contextual)
- rule_type, payload_json, active_from, active_to

meal_plans
- id, household_id, week_start, starts_on, week_end, status, version

meal_slots
- id, plan_id, date, slot_state, recipe_id, recipe_version_id
- servings, locked_at, locked_by, notes, version

slot_attendance
- slot_id, member_id, status (attending|absent|unknown)

slot_reactions
- slot_id, member_id, reaction, reason, created_at

recipes
- id, visibility (catalog|household), household_id nullable, source, status

recipe_versions
- id, recipe_id, default_servings, ingredients_json, steps_json, metadata_json

planner_messages
- id, household_id, user_id nullable, body, language, action_json, created_at

planner_activities
- id, household_id, plan_id, slot_id nullable, actor_user_id nullable
- event_type, before_json, after_json, created_at

grocery_snapshots
- id, household_id, plan_id, provider, address_id, coverage_json
- requirements_json, cart_json, status, created_by, ordered_at

grocery_snapshot_lines
- snapshot_id, canonical_ingredient_id nullable, source_breakdown_json
- product_id nullable, product_variant_json, required_quantity, purchased_quantity
- manual_state, freshness_group

cook_links
- id, household_id, slot_id, token_hash, expires_at, revoked_at, created_by
```

This is illustrative. Exact database normalization should be decided during technical design; recipe versions, snapshot immutability, activity auditing, and provider identifiers are non-negotiable concepts.

---

## 17. API and service boundaries

### Planner API owns

- household/member/invite CRUD;
- plans, slots, locks, attendance, reactions, activities;
- planning chat orchestration and typed action validation;
- private recipe lifecycle;
- grocery requirements/snapshots/coverage;
- cook-link creation/revocation;
- planner notification scheduling and preferences.

### Planning intelligence owns

- candidate recipe retrieval/ranking;
- auto-fill proposal generation;
- explanation generation grounded in typed inputs;
- structured parser from chat text to proposed planner actions;
- household preference/fairness learning;
- ingredient normalization and pack optimization logic, ideally deterministic once inputs are structured.

### MoodFood adapter owns

- permissioned import of eligible individual taste/preferences/history;
- no direct cross-domain database reads in recommendation logic.

### Grocery-provider adapter owns

- address/catalogue/product lookup;
- availability, price, pack size, product/variant identifiers;
- cart generation and order handoff;
- provider-specific constraints and reconciliation.

---

## 18. Phased implementation

### Phase A — Planner foundation

- Planner top-level mobile route and feature boundary.
- Household, membership, owner/member/cook roles, invitations.
- Current/next plan, daily slots, manual structured recipe selection.
- Activity log, locks, recurring rules, attendance/statuses.
- Structured recipe contracts and private household recipes.

### Phase B — Collaboration and planning intelligence

- Shared typed chat and action confirmation flow.
- Auto-fill proposal/review/apply flow.
- Preference strength, reactions, fair ranking, Planner adapter to MoodFood profile.
- Translations/transliteration and cook account/link views.
- Post-meal feedback.

### Phase C — Grocery intelligence

- Ingredient canonicalization/scaling/aggregation.
- Pantry assumptions, manual grocery controls, budget, freshness groups.
- Immutable cart snapshots and coverage tracking.
- Instamart product lookup, pack optimization, cart proposal, owner-only checkout.

### Phase D — Quality and expansion

- Notification scheduler/preferences.
- Streamlit Planner Lab and fixtures.
- Provider robustness, provider/account portability, observability, metrics.
- Future voice, messaging integrations, automatic leftover inventory, multi-location households, and standalone client extraction.

---

## 19. Success measures and guardrails

### Product outcomes

- Share of eligible days with a finalized meal.
- Time from opening Planner to an accepted weekly proposal.
- Auto-fill proposal acceptance, swap, and rejection rates.
- Percentage of recipe-derived grocery requirement correctly covered by selected packs.
- Manual grocery corrections per cart; stock/substitution failures.
- Meal completion and post-meal satisfaction.
- Household member/cook link usage and repeat weekly planning.

### Guardrails

- Zero known hard dietary/allergy-rule violations.
- No silent mutation of a created/ordered grocery cart.
- No undisclosed sharing of one member’s private history/preferences.
- No checkout without explicit owner confirmation.
- No cook-link exposure of private household/payment/address data.
- Translation must preserve structured quantities and safety information.
- Low duplicate grocery-purchase rate across overlapping carts.

---

## 20. Naming direction (after product definition)

“Planner” is a functional working name. The eventual name should communicate shared home meals, coordination, and readiness—not dieting or corporate task management. Possible directions to evaluate after user research and trademark/domain review:

- **MealHouse** — shared household food coordination.
- **GharKaKhaana / Ghar Ka Plan** — culturally resonant, though language/market fit must be tested.
- **TablePlan** — shared meal organization.
- **WeekBite** — weekly meal rhythm.
- **KitchenCircle** — collaboration and cook inclusion.
- **MealMates** — shared/household friendly.
- **HomePlate** — home meal focus.
- **SwaadPlan** — flavour-led planning, with localization considerations.

Do not choose a name until we test clarity with solo users, shared Indian households, diaspora users, and cooks/house-help, then conduct trademark/domain checks.

---

## 21. Final product statement

Planner turns the recurring household question—**“What are we making?”**—into a collaborative, practical plan that reaches the kitchen.

It gives a household one shared daily meal plan, lets people contribute in a way that respects real dietary and cultural constraints, translates the plan into recipes and an intelligent weekly grocery purchase, and makes execution easy for the person cooking. It should feel less like project management and more like a calm, trusted household rhythm.
