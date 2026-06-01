# PRD: FoodMood AI Recommendations API

**Status:** needs-triage  
**Date:** 2026-06-01

---

## Problem Statement

Users struggle to decide what to eat when their choice depends on how they feel — not just what they're hungry for. Existing food apps filter by cuisine or dietary tags but ignore emotional state, energy level, social context, weather, and subconscious signals from interactive games. The result is decision paralysis and low-quality food choices that don't satisfy the user's actual psychological need in the moment.

---

## Solution

A single REST API endpoint that accepts a rich user-context payload — capturing mood, energy level, situational data (weather, time of day, budget), dietary constraints, and game-derived signals (emoji selections, swipe reaction times, sliders) — and returns a ranked, psychology-informed list of food recommendations. Each recommendation comes from a curated static dish catalogue so responses are fast, consistent, and always include a dish image. GPT-4o reasons over the dish catalogue's structured attributes to match each dish against the user's exact payload dimensions, and explains *why* each dish fits the user's emotional state.

---

## User Stories

1. As a hungry user, I want to submit my current mood so that I receive dish recommendations that match how I feel, not just what I usually order.
2. As a stressed user with low energy, I want delivery-friendly comfort food suggested, so that I don't have to expend effort deciding.
3. As a vegetarian user with nut allergies, I want hard dietary and allergen filters applied before any ranking, so that I never see dishes I can't eat.
4. As a user on a tight budget, I want recommendations filtered to my maximum spend, so that I don't get tempted by dishes I can't afford.
5. As a user on a date, I want socially appropriate dishes suggested, so that the recommendation fits the romantic context.
6. As a user in rainy weather, I want warm comfort dishes surfaced, so that the recommendation matches my environmental mood.
7. As a health-conscious user, I want my health slider value to influence ranking, so that higher-scoring dishes appear first when I'm feeling virtuous.
8. As an adventurous user, I want my adventurousness slider to push exotic dishes to the top, so that I discover new cuisines when I'm in the mood.
9. As a user in the morning, I want breakfast-appropriate dishes only, so that dinner-only options don't appear at 8am.
10. As a user with limited time, I want dishes whose prep time fits within my available window, so that I don't order something that arrives too late.
11. As an API consumer, I want a minimal payload (just mood) to return valid recommendations, so that I can integrate without requiring all fields up front.
12. As an API consumer, I want a full payload to return exactly the requested number of recommendations, so that I can control how many cards to render in the UI.
13. As an API consumer, I want each recommendation to include an image URL, so that I can display the dish visually without a separate lookup.
14. As an API consumer, I want each recommendation to include structured AI reasoning (mood match, psychological hook, context fit), so that I can surface the "why" to the user.
15. As an API consumer, I want alternative dish suggestions (healthier swap, budget swap) per recommendation, so that I can show secondary options without a second API call.
16. As an API consumer, I want pairing suggestions (drink, dessert, side) per recommendation, so that I can upsell complementary items.
17. As an API consumer, I want a made-up restaurant name, rating, distance, and delivery time per recommendation, so that the UI feels complete while real delivery deep links are pending.
18. As an API consumer, I want token usage and response time in the metadata, so that I can monitor AI costs and latency.
19. As an API consumer, I want the API to return a graceful fallback (top-rated dishes by health score) when the AI provider is unavailable, so that the UI never shows an empty state.
20. As an API consumer, I want `success: false` with an error message on fallback, so that I can display an appropriate degraded-mode notice.
21. As an API consumer, I want invalid payloads to return HTTP 422 with field-level validation errors, so that I can surface clear feedback during development.
22. As a developer, I want the temperature parameter to control recommendation creativity, so that I can tune between safe picks and adventurous suggestions per use case.
23. As a developer, I want a `diversity` config field, so that I can request novel dish combinations vs. familiar comfort zone picks.
24. As a developer, I want the entire service runnable via `docker compose up`, so that I can onboard new engineers without local Python setup.
25. As a developer, I want all tests to run without a real OpenAI API key, so that CI passes without secret management overhead.
26. As a developer, I want the dish catalogue importable as a standalone Python module, so that I can query it independently for data seeding or UI previews.

---

## Implementation Decisions

### Modules

**Request Schema (`UserContext` + `RecommendationConfig`)**  
Pydantic v2 models covering all payload dimensions. All fields outside `mood.primary` are optional to support gradual enrichment. Validates ranges (energy_level 1–10, temperature 0–1, sliders 1–10) at the boundary. Social context and spice tolerance use string enumerations.

**Static Dish Catalogue**  
A Python module exporting 80 `DishRecord` dataclasses across 8 cuisines (Indian, Italian, Mexican, Japanese, American, Mediterranean, Chinese, Thai — 10 dishes each). Each dish carries structured attributes that directly mirror every filterable/rankable payload field: `mood_tags`, `dietary_tags`, `allergens`, `spice_level`, `energy_requirement`, `social_context_tags`, `weather_tags`, `meal_time`, `delivery_friendly`, `adventurousness_score`, `health_score`, `price_inr`, `prep_time_min`. A helper function serialises the catalogue into compact per-dish strings for token-efficient prompt injection.

**Recommender Service**  
Accepts a `RecommendationRequest` and an injectable OpenAI client. Builds a structured prompt (system + user) containing the serialised user payload and the full dish catalogue. Instructs GPT-4o to hard-exclude dishes that fail allergen, dietary, or budget constraints, then rank by mood match, spice alignment, energy level, weather, and adventurousness. Parses the JSON response, resolves dish IDs against the catalogue, enriches each recommendation with full dish metadata, and constructs the typed response. On any failure (network, JSON parse, unknown dish ID), returns a fallback response using the top-N dishes by health score.

**Response Schema**  
Pydantic models for the full recommendation payload: per-dish reasoning fields (`mood_match`, `context_fit`, `psychological_hook`, `nostalgia_factor`), practical details, a made-up restaurant object, alternatives list, and pairing suggestions. AI metadata and mood insights are top-level fields.

**API Route**  
Single `POST /api/ai-recommendations` endpoint. Thin layer — receives the request, delegates to the recommender service, returns the response. Also exposes `GET /health`.

### Key Architectural Decisions

- **Static dish catalogue over dynamic generation** — eliminates hallucinated dish names, enables deterministic image mapping, and dramatically reduces token usage.
- **Payload attributes mirrored in dish records** — dish attributes are named to match payload fields exactly, making the AI's ranking instructions unambiguous and verifiable.
- **Injectable OpenAI client** — the recommender accepts an optional client parameter, making tests trivially mockable without monkeypatching globals.
- **Hard-exclude rules in the prompt** — allergen and dietary conflicts are listed as explicit HARD EXCLUDE rules rather than soft ranking penalties, ensuring safety constraints are never overridden by confidence scores.
- **Fallback returns top-N by health score** — neutral, defensible fallback that doesn't require any AI inference.
- **Restaurant metadata is fabricated** — placeholder names, ratings, distances, and delivery times are generated by GPT-4o. Real delivery deep links are a future milestone.

---

## Testing Decisions

**What makes a good test here:**  
Test external behaviour — what comes in, what comes out — not internal implementation steps. Never assert on prompt string internals beyond key payload fields. Don't test that a specific private function was called; test that the response has the correct structure and values.

**Modules to test:**

- *Request schemas* — validation of required fields, range enforcement, enum validation, default values, and graceful handling of missing optional fields.
- *Dish catalogue* — correct count (80), uniqueness of IDs, presence of all 8 cuisines, image URL format, valid attribute values on every record.
- *Prompt building* — user message contains mood, allergies, budget; all 80 dish IDs appear in the serialised catalogue string; `None` optional fields don't raise.
- *Recommender service* — with a mocked OpenAI client: correct count returned, image URLs present, ranks are sequential, AI reasoning fields populated, metadata present, fallback triggered on API exception, fallback triggered on invalid JSON, unknown dish IDs are skipped gracefully.
- *Fallback logic* — returns top-N by health score in descending order, `success` is `False`, error message is populated.
- *Route layer* — minimal payload returns 200 with valid schema, full payload returns 200, missing mood returns 422, invalid energy_level returns 422, invalid temperature returns 422, empty body returns 422, fallback response still returns HTTP 200.

All tests use `pytest`. OpenAI is mocked via injected client — no real API calls, no API key required in CI.

---

## Out of Scope

- Real restaurant data or food delivery deep links (future milestone)
- User authentication or session management
- Persistent storage of mood history, preference evolution, or recommendation acceptance/rejection
- Response caching keyed by user context hash
- Multiple AI provider adapters (Claude, Gemini) — GPT-4o only for now
- A/B testing between providers
- Frontend or mobile client
- Rate limiting or API key management
- Analytics pipeline

---

## Further Notes

- **Prompt quality is the core differentiator.** The `psychological_hook` and `mood_match` reasoning fields are what make FoodMood distinct from calorie-matching apps. Invest in prompt iteration as real user data arrives.
- **Dish catalogue expansion** — the 80-dish list is a seed. Future PRDs should cover adding dishes, tagging edge cases (e.g. late-night-only street food), and managing catalogue versioning.
- **Deep link integration** — the `restaurant` object is currently fabricated. A future milestone will replace it with real delivery app URLs, requiring a restaurant lookup service or aggregator API integration.
- **Image URLs** — currently Unsplash static URLs. If Unsplash changes URLs or removes images, the catalogue will need updating. A future improvement is to host images in a CDN keyed by dish ID.
