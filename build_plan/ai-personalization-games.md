# MoodFood — AI Personalization & Game Strategies

**Purpose:** A catalogue of in-app games and interaction strategies, each backed by AI and persona understanding, designed to learn who the user is and kill decision fatigue around ordering food.

**Core thesis:** Every interaction should harvest one of four signal types and feed a single evolving user model. The end state is fewer questions, not more — games are heavy early to bootstrap the model, then fade into optional fun as AI confidence rises.

---

## How to read this document

The 22 strategies are grouped by the **signal type** they capture:

1. **STATE** — mood, energy, hunger, stress (the *why now*)
2. **SENSATION & TASTE** — texture, flavor, cuisine, the taste graph (the *what*)
3. **CONTEXT** — time, weather, occasion, budget-vibe, social (the *when/where/with whom*)
4. **CALIBRATION** — did we get it right; closing the prediction loop (the *was that good*)
5. **ENGAGEMENT & RETENTION** — streaks, quests, social, anti-rut (the *keep coming back*)

Each entry has: **What it is**, **Signal captured**, **Why it's sticky**, and a concrete **Implementation** tied to the existing stack (React 18 + Vite frontend, Node/Express + SQLite backend, Python FastAPI intelligence service) and the `userContext` schema in `Ai-schema.md`.

### The unified user model

All strategies write to one persisted profile. Suggested SQLite tables (backend) plus a derived embedding held in the intelligence service:

```
users(id, created_at, persona_archetype, question_budget, automation_pref)
signals(id, user_id, type, payload_json, context_json, created_at)   -- append-only event log
taste_vector(user_id, embedding BLOB, updated_at)                    -- learned taste embedding
predictions(id, user_id, rec_id, predicted_score, actual_score, created_at)  -- calibration loop
mood_food_map(user_id, mood_key, food_archetype, weight, updated_at) -- personal mood->food mapping
```

The `signals` table is the spine: every game writes an append-only event. The intelligence service replays/streams these to update `taste_vector`, `mood_food_map`, and persona. This keeps games decoupled — adding a new game just means a new `signal.type`.

---

# 1. STATE — capturing mood, energy, and hunger

## 1.1 — Mood-first emoji check-in

**What it is:** A 3-second opener. Tap emoji sliders for energy, stress, hunger intensity, and social-vs-solo before anything else happens.

**Signal captured:** *State*, not taste. State is what actually drives food choice — "I'm fried" → comfort carbs; "I'm wired" → light/fresh. Maps to `userContext.mood` (`primary`, `energyLevel`, `socialContext`).

**Why it's sticky:** Frictionless, becomes a daily ritual like a mood journal that happens to feed you.

**Implementation:**
- *Frontend:* A `<MoodCheckIn>` React component — 4 horizontal emoji sliders (Lucide icons / emoji), values 1–10, single screen, auto-advances on last tap. ~3s interaction.
- *Backend:* `POST /api/signals` with `{type: "mood_checkin", payload: {energy, stress, hunger, social}}`. Writes to `signals`.
- *Intelligence:* Over time, correlate logged mood vectors against post-meal satisfaction (`predictions.actual_score`) to learn a *personal* `mood_food_map` rather than a generic one. Cold start uses a population-level prior, then shrinks toward the individual as data accrues (empirical-Bayes shrinkage).
- *AI method:* Lightweight gradient update on `mood_food_map` weights per confirmed meal. No LLM call needed — this is a cheap learned lookup that pre-conditions the LLM prompt.

## 1.2 — Hunger-level dial → portion/format intelligence

**What it is:** A single "how hungry, 1–10" dial before recommending.

**Signal captured:** *Quantity* — almost universally ignored by food apps. Combined with time-since-last-meal, it predicts snack vs. feast and prevents over/under-order regret. Feeds a new `userContext.mood.hungerLevel`.

**Why it's sticky:** Low friction, and it visibly prevents the "ordered too much / still hungry" failure most people feel weekly.

**Implementation:**
- *Frontend:* Reuse the slider primitive from 1.1; add a derived "time since last logged meal" read from `signals`.
- *Backend:* Store hunger + compute `hours_since_last_meal` server-side.
- *Intelligence:* Learn per-user portion-format mapping (single dish / combo / shareable) via a small regression on `hunger × time_gap → portion_class`. Inject `portion_class` as a constraint into the LLM prompt so recommendations match appetite, not just taste.

## 1.3 — Memory / nostalgia prompts ("comfort food map")

**What it is:** Occasional emotional prompts — "What did you eat as a kid when sick?", "Your go-to celebration meal?"

**Signal captured:** *Emotional anchor foods* that behavioral data never surfaces. Stored as a `comfort_anchors` list in the profile.

**Why it's sticky:** High emotional payoff — deploying a comfort anchor on a detected low-mood day feels uncannily caring.

**Implementation:**
- *Frontend:* A periodic single-question card (max ~1/week) framed warmly, free-text or chip selection.
- *Backend:* Store anchors with their emotional trigger tag (sick, celebration, sad, homesick).
- *Intelligence:* When `mood_checkin` shows low energy + high stress, the prompt builder elevates a matching comfort anchor and sets `recommendationConfig.diversity: "low"` (stick to comfort zone, per the schema's diversity field). Use the schema's `aiReasoning.nostalgiaFactor` to surface *why*.

---

# 2. SENSATION & TASTE — building the taste graph

## 2.1 — Swipe-to-train taste graph (Tinder for food)

**What it is:** Rapid-fire swipe on dish photos. Each swipe is a labeled datapoint (cuisine, texture, spice, price, vibe).

**Signal captured:** A taste embedding — and critically the **negative space** (what you reliably reject). Maps to `gameData.swipes` with `reactionTime`, where faster swipes = stronger subconscious preference (already in the schema).

**Why it's sticky:** Speed + dopamine; resurfaces as a quick "tune your taste" session.

**Implementation:**
- *Frontend:* `<SwipeVibe>` card stack (framer-motion or a lightweight gesture lib), captures `liked` + `reactionTime` per card.
- *Backend:* Batch-post swipes to `signals`.
- *Intelligence:* Each dish has a feature vector (cuisine, texture tags, spice, price band). Update the user's `taste_vector` via online learning — e.g. logistic regression / a small two-tower model where like/dislike pulls the user vector toward/away from dish vectors. Weight updates by `1/reactionTime` so snap judgments count more. Recommendations then rank candidates by cosine similarity to the user vector, filtered by hard constraints (allergies, diet).
- *AI method:* Two-tower retrieval (user-tower / item-tower) for candidate generation, LLM for final ranking + reasoning.

## 2.2 — "Craving radar" word/image cloud

**What it is:** A fast-moving cloud of sensory words/images (crunchy, melty, spicy, brothy, fresh, cheesy) — tap what's pulling you.

**Signal captured:** *Texture and sensation* cravings, which predict better than cuisine labels. "Crunchy and warm" routes better than "Thai." New `gameData.cravingTags`.

**Why it's sticky:** Genuinely novel — no major app collects sensation-level signal — and it's tactile/fun.

**Implementation:**
- *Frontend:* Animated tag cloud (CSS/transform animation), multi-select, ~5s.
- *Backend:* Store selected sensation tags per session.
- *Intelligence:* Maintain a sensation→dish index (each menu item tagged with texture/temperature/richness). Craving tags become a high-weight retrieval filter for the session, overriding the long-term taste vector when present (acute craving beats baseline preference). Feed tags into the LLM prompt as `craving_constraints`.

## 2.3 — Fridge / pantry "cook vs. order" game

**What it is:** User taps (or photographs) what's already in the kitchen; AI guesses the rest from history and proposes cook-vs-order.

**Signal captured:** The **cook-vs-delivery boundary** — a strong proxy for budget, effort tolerance, and time. New `signal.type: "pantry"`.

**Why it's sticky:** Occasionally saves money / a trip, which builds trust fast and differentiates from pure delivery apps.

**Implementation:**
- *Frontend:* Chip-based pantry input + optional photo upload.
- *Intelligence:* If photo, run an ingredient-detection vision model (or LLM vision) → ingredient list. Cross-reference with simple recipes; estimate "effort to cook" vs. "time to deliver." Learn the user's effort threshold from how often they pick cook vs. order. Feed `effort_tolerance` into the situational context.

## 2.4 — "Blind taste bet" — predict your own rating

**What it is:** Before ordering, the user bets how much they'll like a pick (1–5 stars). After eating, compare to actual.

**Signal captured:** *Self-knowledge calibration* — how well the user predicts their own enjoyment, by cuisine. (Bridges taste and calibration buckets.)

**Why it's sticky:** Meta-game — "you're better at predicting Italian than sushi" is a delightful, shareable insight.

**Implementation:**
- *Frontend:* A one-tap star bet on the recommendation screen; store alongside the eventual post-meal rating.
- *Backend:* Extend `predictions` with `user_predicted_score`.
- *Intelligence:* Track per-cuisine prediction error for both the user and the AI. Where the *user* is poorly calibrated, the AI can lean in harder (they don't know what they'll like → more discovery). Where the user is well-calibrated, defer to their bets.

---

# 3. CONTEXT — time, weather, occasion, budget, social

## 3.1 — "This or That" preference duels

**What it is:** Forced binary choices — "ramen vs. burrito when it's raining?", "cheap & fast vs. worth the wait?"

**Signal captured:** *Trade-off weights* (price vs. health vs. craving vs. speed) per context — things users can't articulate when asked directly.

**Why it's sticky:** Playful; questions can be witty and personality-driven.

**Implementation:**
- *Frontend:* `<ThisOrThat>` two-card tap, 5–8 rounds, each tagged with the dimension it probes.
- *Intelligence:* Treat as pairwise comparisons → fit a preference model (Bradley–Terry / simple ranking) to estimate each user's weight on price, health, speed, adventure. These weights become the `recommendationConfig` knobs (`diversity`, `temperature`) and re-rank candidates. Context-conditioned: store weights *per context bucket* (rainy-evening weights differ from sunny-lunch).

## 3.2 — Context-aware recommendation from passive signals

**What it is:** Infer context automatically — time of day, weather, weekday, payday cycle, recent orders — without asking.

**Signal captured:** Behavioral *patterns*: "Friday night = treat order," "Monday = reset/healthy." Maps directly to `userContext.situational`.

**Why it's sticky (indirectly):** This is the engine that lets the app *stop asking questions* — the core fatigue win.

**Implementation:**
- *Frontend:* Pull device time, geolocation (with consent) → weather via API.
- *Backend:* Enrich every recommendation request with situational fields automatically; store the resolved context on each `signal`.
- *Intelligence:* Mine the `signals` log for recurring context→choice patterns (e.g. day-of-week × time → cuisine frequency). Surface high-confidence patterns as priors so the model needs fewer explicit inputs. This is what powers the schema's `insights.nextMealPrediction`.

## 3.3 — Budget-vibe game ("treat vs. fuel vs. reward")

**What it is:** A quick framing tap: is tonight a *treat*, *fuel*, or *reward*?

**Signal captured:** *Spend-elasticity by emotional occasion* — people spend by occasion, not hunger. Feeds `userContext.situational.budget` dynamically.

**Why it's sticky:** Prevents sticker-shock abandonment (no $40 suggestions on a "fuel" night) → better conversion, which users feel as "this app gets my wallet."

**Implementation:**
- *Frontend:* Three-button selector, optionally pre-filled by the AI's guess from context (payday + Friday → likely "treat").
- *Intelligence:* Learn each occasion's typical spend band per user; set `budget.min/max` accordingly before retrieval. Track whether budget-appropriate recs convert better (they will) as a KPI.

## 3.4 — Story / scenario mini-game ("Day Story")

**What it is:** A short choose-your-adventure: "You just finished a brutal workday and it's raining…" → pick your vibe → branch.

**Signal captured:** Emotional + contextual preference that direct questions miss. Narrative lowers the guard. Maps branches to mood-food profiles (`gameData.type: "day_story"`).

**Why it's sticky:** Genuinely fun; already partly on the roadmap. Deepen it as a fresh daily story.

**Implementation:**
- *Frontend:* Branching narrative component; 2–3 choices per node, 3 nodes deep.
- *Intelligence:* Pre-author story branches each mapped to a mood-food archetype vector; the chosen path resolves to a state estimate that seeds the recommendation. Optionally use the LLM to *generate* fresh daily scenarios from a template + the user's known context, keeping it novel.

## 3.5 — Seasonal / event-driven mini-games

**What it is:** Limited-time themed games — summer cravings bracket, "comfort food March Madness," holiday feast planner.

**Signal captured:** Preference *drift* across seasons; re-engagement hook.

**Why it's sticky:** Bracket/tournament formats are addictive and shareable; scarcity (limited-time) drives return visits.

**Implementation:**
- *Frontend:* Reusable bracket/tournament component seeded with seasonal dishes.
- *Backend:* Campaign config table; schedule via the existing event system.
- *Intelligence:* Compare a user's seasonal picks against their baseline taste vector to detect drift; update weights with a recency decay so summer preferences don't pollute winter recommendations.

## 3.6 — Social / group decision games

**What it is:** Multiplayer mode — everyone swipes, AI finds the overlap and proposes a consensus order, or runs a "group roulette."

**Signal captured:** *Social* preferences — who compromises, group taste clusters. The worst decision-fatigue scenario, solved.

**Why it's sticky:** Inherently viral — pulls in new users; recurring group occasions (family dinner, office lunch).

**Implementation:**
- *Frontend:* Shareable room link; each member runs a lightweight swipe; live lobby.
- *Backend:* Ephemeral group sessions; aggregate member `taste_vector`s.
- *Intelligence:* Compute a consensus objective — maximize minimum satisfaction across members (maximin) rather than average, so nobody is miserable. Surface 2–3 group options with per-person match scores. New users who join a room get a cold-start profile seeded from their first swipes.

## 3.7 — "Twin taste" matching (social discovery)

**What it is:** Show users their "taste twins" and what those people are loving now.

**Signal captured:** Aspirational/discovery signal; powers cold-start for new dishes via collaborative filtering.

**Why it's sticky:** Light social proof without forcing a social graph.

**Implementation:**
- *Intelligence:* Nearest-neighbour search over `taste_vector`s (ANN index, e.g. FAISS in the FastAPI service). Recommend dishes loved by neighbours but unseen by the user (classic item-based CF). Privacy: surface aggregates ("people like you"), never named individuals.

---

# 4. CALIBRATION — closing the prediction loop

## 4.1 — Post-meal feedback loop ("Did we read your mind?")

**What it is:** One-tap post-eating feedback (😍 nailed it / 😐 meh / 🤢 wrong call), framed as the AI's accuracy score.

**Signal captured:** The single most valuable signal — whether the mood→food *prediction was correct*, not just whether they ordered. Writes `predictions.actual_score`.

**Why it's sticky:** The AI-vs-you accuracy meter is a compelling meta-game ("87% mind-read accuracy this month").

**Implementation:**
- *Frontend:* A push/notification or next-open prompt referencing the specific dish; one tap.
- *Backend:* Close the loop on the `predictions` row created at recommendation time.
- *Intelligence:* This is **the backbone — without ground truth the other games are input with no error signal.** Use the predicted-vs-actual gap to update every upstream model: `mood_food_map` weights, taste vector, trade-off weights. Track rolling accuracy as the north-star model-quality metric.

## 4.2 — Two-tap "veto + why"

**What it is:** When a user rejects a recommendation, one extra tap on the reason (too heavy / had it recently / too pricey / not feeling it).

**Signal captured:** *Disambiguated rejection* — turns a useless "no" into a precise model update. Maps to `history.avoidThese` with reasons.

**Why it's sticky:** Tiny friction; users feel heard and recs visibly improve.

**Implementation:**
- *Frontend:* Reason chips appear on dismiss.
- *Intelligence:* Route each reason to the right model: "too heavy" → adjust richness/portion features; "had it recently" → boost recency penalty (don't down-weight the dish permanently); "too pricey" → tighten budget band; "not feeling it" → mood-mismatch signal. This prevents the common bug where a temporary "no" wrongly kills a dish forever.

## 4.3 — "Mind-reader" mode — AI commits, then reveals

**What it is:** Instead of options, the AI states "I think you want ___ tonight" with one confident pick + reasoning. User confirms or nudges.

**Signal captured:** Each accept/reject sharpens the model; surfaces model confidence calibration.

**Why it's sticky:** When it's right, it feels magical — the boldest fatigue-killer (zero browsing).

**Implementation:**
- *Frontend:* Single hero card with `aiReasoning` (mood/context/history) shown for transparency; "Yes" / "Not quite" buttons.
- *Backend:* Only triggers when model confidence exceeds a threshold (see 5.5); otherwise fall back to a short game.
- *Intelligence:* Use the schema's `confidence` field; reserve mind-reader mode for `confidence > 0.8`. Display reasoning from `aiReasoning` to build trust and make the model legible. Log the accept rate at each confidence band to keep confidence honest (calibration of the calibrator).

---

# 5. ENGAGEMENT & RETENTION — keeping the model fed

## 5.1 — Adaptive persona archetypes ("your food character")

**What it is:** Cluster users into evolving personas — "The Comfort Seeker," "The Adventurer," "The Healthy-ish Realist," "The 9pm Snacker" — and show the user theirs, evolving over time.

**Signal captured:** A human-legible summary of the taste/trade-off model; also a trust and shareability hook.

**Why it's sticky:** Identity + social shareability; watching your character evolve is a return reason.

**Implementation:**
- *Backend:* Store `persona_archetype` on the user.
- *Intelligence:* Cluster `taste_vector` + trade-off weights (k-means or assign to hand-curated archetype centroids for nameable results). Recompute periodically; show the shift ("you've drifted 20% more adventurous this month"). Use the LLM to write a fun, personalized character blurb. Feeds the schema's `insights.detectedMoodProfile` / `preferenceEvolution`.

## 5.2 — Streaks & taste-discovery quests

**What it is:** Gamified missions — "Try 3 new cuisines," "7-day mood streak," "Beat your adventurousness score."

**Signal captured:** Deliberately injects *exploration* data, fighting the recommender's collapse into the same 5 dishes.

**Why it's sticky:** Streak loss-aversion + novelty.

**Implementation:**
- *Backend:* Quest definitions + per-user progress; tie into the existing analytics events.
- *Intelligence:* Quests are an explicit explore/exploit lever — when the model is over-confident/under-diverse, issue exploration quests whose rewards are dishes at the edge of the taste vector (adjacent but novel). Captures adventurousness tolerance as a byproduct.

## 5.3 — Anti-rut detector

**What it is:** AI watches for the boredom loop (same 3 orders) and triggers a playful "shake it up?" wildcard.

**Signal captured:** Adventurousness tolerance; prevents the engagement death-spiral every recommender hits.

**Why it's sticky:** Rescues users from their own ruts before they churn.

**Implementation:**
- *Intelligence:* Monitor order entropy over a rolling window; when it drops below a threshold, surface a wildcard that is high-similarity to the taste vector but in an unexplored region (so it's safe-but-fresh). Measure whether the wildcard is accepted to tune how far to push.

## 5.4 — Decision-fatigue SOS button ("just decide for me")

**What it is:** A one-tap mode: no questions, AI commits immediately.

**Signal captured:** *Usage frequency is itself the signal* — heavy SOS use = high fatigue/trust → more automation; light use = wants control. Feeds `automation_pref`.

**Why it's sticky:** It's the ultimate fatigue relief, and it self-segments the UX per user.

**Implementation:**
- *Frontend:* Persistent SOS button; on tap, skip straight to mind-reader mode (4.3) using the best available context.
- *Intelligence:* Track SOS frequency → set each user's default `question_budget` and automation level. Frequent SOS users get progressively fewer questions everywhere.

## 5.5 — Adaptive question budget (the meta-game)

**What it is:** The AI dynamically decides how many questions to ask based on its confidence, and *shows* it: "I only need 1 question today."

**Signal captured:** This is the orchestration layer over all other games — it decides which game (if any) to run.

**Why it's sticky:** Makes the AI's learning visible and rewards the user for training it; *is* the decision-fatigue solution made tangible.

**Implementation:**
- *Backend:* A `question_budget` per user/session driven by model confidence and `automation_pref`.
- *Intelligence:* Compute expected information gain of each available game given current uncertainty; run a game only if its expected gain exceeds the friction cost. High confidence → 0 questions (mind-reader mode). Low confidence / new context → run the single highest-value game. This ties every strategy above into one coherent loop: **games fill uncertainty, calibration measures success, and the question budget shrinks as the model learns.**

---

# Roadmap framing — phasing the build

The arc matches the core mission (fewer questions over time):

**Phase 1 — Bootstrap the model (heavy input).** Mood check-in (1.1), swipe-to-train (2.1), this-or-that (3.1), post-meal loop (4.1), veto+why (4.2). Goal: a usable taste vector + mood map + the calibration backbone.

**Phase 2 — Make it feel smart (reduce friction).** Context-aware passive signals (3.2), craving radar (2.2), budget-vibe (3.3), mind-reader mode (4.3), adaptive question budget (5.5), persona reveal (5.1).

**Phase 3 — Retain & spread (stickiness + virality).** Streaks/quests (5.2), anti-rut (5.3), SOS (5.4), Day Story (3.4), seasonal games (3.5), group mode (3.6), twin taste (3.7), nostalgia (1.3), hunger dial (1.2), pantry (2.3), blind bet (2.4).

# Cross-cutting principles

- **Calibration is foundational.** 4.1 must ship in Phase 1, or every other game collects input with no ground truth.
- **The tension is the design.** Games add friction; the mission removes it. Resolve it explicitly via the adaptive question budget (5.5): heavy early, optional later.
- **Transparency is a feature, not just ethics.** Showing *why* (4.3, 5.1) builds trust and is itself a retention hook. Keep all reasoning legible.
- **One model, many doors.** Every game is just another `signal.type` feeding the same profile. This keeps the system extensible — new games are cheap, and the intelligence service stays the single source of truth.
- **Privacy by design.** Location and social features are consent-gated; social discovery surfaces aggregates ("people like you"), never named individuals.
