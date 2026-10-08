# CLAUDE.md — MoodFood intelligence service

FastAPI service that owns all recommendation intelligence: the food graph,
user model, decision engine, adaptive games and copy. `apps/api` (NestJS) is
the only caller: a thin proxy and the durable store (signals log, orders).
Never put AI logic in the API.

## Request flow (`POST /api/ai-recommendations`)

1. `learning/live_state` — mind-reader/SOS use today's check-in, cravings, occasion.
2. `services/shortlist.build_scored_shortlist` — hard filters (`services/diet`:
   diet + allergens, budget, meal window, avoids), then `score_breakdown`
   (named parts: mood, energy, cuisine, sensory, history, taste, …), diversify.
3. Ranking, by `RANKER_PROVIDER` (default `jev`):
   - `decisions/engine.rank` — deterministic score blended with JEV fit
     (`JEV_WEIGHT`), MMR diversity; `engine.commit` → commit confidence.
   - JEV unavailable → GPT (`services/recommender.get_recommendations`) →
     deterministic order if GPT fails. `shadow` = GPT serves, JEV logged.
4. Swiggy enrichment (`services/swiggy_discovery`) — borderline matches are
   verified by `services/menu_scout` (JEV, GPT fallback) and the food graph cache.
5. Cards (`recommender._make_recommendation`), grounded copy
   (`services/explain`), optional hero polish (`services/polish`), refresh
   paging (`learning/paging`), telemetry (`learning/runs` → `recommendation_runs`).

## Modules

| Path | What |
|---|---|
| `data/dishes.json` | Catalog v2 (456 dishes) — built by `scripts/build_catalog.py` from `scripts/catalog/*`; edit those, not the JSON |
| `services/sensory.py` | Situation → sensory pulls; dish fit; copy words |
| `decisions/` | `jev.py` client (breaker, timeouts), `questions.py`, `engine.py`, `ranker.py` (shadow) |
| `food_graph/mapping.py` | Swiggy item → dish (exact, guarded candidates, JEV Choice), cached in `menu_item_map` |
| `games/` | Adaptive games: info-gain question choice, early stop, signals |
| `learning/` | Store (SQLite or Postgres), learner (signal folds), user model, embeddings, orchestrator, persona, … |
| `llm.py` | Shared async OpenAI client (`JsonChat`, `parse_structured`) — models from config |
| `security.py` / `observability.py` | Service auth, sync key; request ids, JSON logs, call timing |
| `history/` | Swiggy food history (`ingest`, `normalise`, `profile` — JEV item profiles for off-catalog items) and the separate Instamart grocery stream (`grocery`, `grocery_profile`, `grocery_facts`: top items, cooking index, restock, pantry, co-purchase). Swiggy shows only a recent window, so history is accumulated (`known_order_ids`) |
| `brain/` | Preference brain (rebuildable fold): `orders` (per-user food orders), `facts` (time-decayed habits, fact ids), `relations` (P(choice \| slot/daytype/occasion) with shrinkage, lift), `scoring` (the `brain` shortlist part), `occasions` (JEV order labels), `houses` (6 houses: gated sorting, hysteresis, journey), `insights` (LLM cards validated against facts), `notes` (habits lines for JEV — server-filled `UserContext.habits`) |
| `routes/history.py` / `routes/brain.py` | `POST /api/history/import`, `/api/history/groceries/import` (the API calls these and stores orders); `GET /api/brain/{user}/groceries` |
| `lab/trace.py` + `routes/lab.py` | Decision tracing: `trace.emit()` at each decision point (no-op unless a lab request is collecting); `/api/lab/*` returns results with their trace — dev only (`LAB_ENABLED`, never in production) |
| `../lab/` | Intelligence Lab UI (Streamlit): games control centre, pipeline, food graph, JEV playground, evals |

Other endpoints: `/api/games/*`, `/api/food-graph/*`, `/api/learn/*`,
`/api/profile/{id}`, `/api/swiggy/*`, `/api/instamart/*`, `/api/recipe/*`.

## Rules

- Hard constraints live in code (`services/diet`), never only in prompts.
- JEV (docs.typesafe.ai): keep numbers/time math in code, pass named buckets;
  shuffle Choice options (`jev.shuffled_choice`); every JEV call site needs a
  non-JEV path.
- Swiggy MCP: verify tools/params against mcp.swiggy.com/builders before use — and against the live
  server's own tool schema (`list_tools`), which can be ahead of the docs (e.g. `orderCount` on
  `get_food_orders`). History payloads: never keep delivery address, phone or payment fields.
- New decision logic should `trace.emit(...)` what it decided and why (JSON-safe, never secrets), so the
  lab can show it; guard costly diagnostics with `trace.enabled()`.
- Store SQL must be portable (SQLite + Postgres): `?` placeholders,
  `ON CONFLICT … excluded.`; Postgres DDL goes in `app/db/migrations/NNNN_*.sql`.

## Commands

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
uvicorn app.main:app --reload
pytest                                   # OpenAI/JEV always mocked; keys blanked in conftest
TEST_DATABASE_URL=postgresql://… pytest  # same suite on Postgres + pgvector
pytest -m eval                           # golden scenarios + brain backtest; python -m evals.harness --live adds JEV
python -m evals.backtest                 # brain vs baselines: predict each order from earlier ones
python scripts/jev_smoke.py              # live JEV check
python scripts/openai_smoke.py           # verify configured OpenAI models
python scripts/build_catalog.py          # rebuild catalog v2; then scripts/export_fallback.py
uv pip install --python .venv/bin/python -r requirements-lab.txt   # lab UI deps (local only)
scripts/lab.sh                           # Intelligence Lab: service :8010 (lab on) + UI http://localhost:8510
```
