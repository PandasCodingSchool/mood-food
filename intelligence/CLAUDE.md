# CLAUDE.md

## Project Overview

**FoodMood** is an AI-powered food recommendation API. It accepts a rich user-context payload (mood, preferences, situational data, game signals) and returns psychologically-informed dish recommendations ranked by OpenAI GPT-4o.

Recommendations are drawn from a **static curated dish list** of 80 dishes across 8 cuisines. The AI ranks dishes from this list — it never hallucates dish names. Each dish has a `image_url` from Unsplash.

---

## Stack

- **Python 3.12 + FastAPI** — API framework
- **Pydantic v2** — request/response schema validation
- **OpenAI GPT-4o** — recommendation ranking and reasoning
- **Docker** — containerised deployment
- **pytest** — tests (OpenAI always mocked)

---

## Architecture

```
app/
  main.py                  # FastAPI app entry point
  routes/recommendations.py # POST /api/ai-recommendations
  schemas/
    request.py             # UserContext, Mood, Preferences, Situational, GameData...
    response.py            # RecommendationResponse, Recommendation, AiReasoning...
  data/dishes.py           # 80 DishRecord objects with payload-aligned attributes
  services/recommender.py  # Prompt building → GPT-4o → response enrichment
tests/
  conftest.py              # Fixtures and mock OpenAI responses
  test_schemas.py          # Pydantic validation tests
  test_recommender.py      # Prompt-building and service logic tests
  test_routes.py           # Endpoint integration tests
```

### Key Design: Payload-Aligned Dish Attributes

Each `DishRecord` has attributes that directly mirror payload fields so GPT-4o can match precisely:

| Dish attribute | Payload field |
|---|---|
| `mood_tags` | `mood.primary` |
| `energy_requirement` | `mood.energy_level` |
| `social_context_tags` | `mood.social_context` |
| `dietary_tags` | `preferences.dietary_restrictions` |
| `allergens` | `preferences.allergies` |
| `spice_level` | `preferences.spice_tolerance` |
| `weather_tags` | `situational.weather` |
| `meal_time` | `situational.time_of_day` |
| `price_inr` | `situational.budget.max` |
| `prep_time_min` | `situational.time_available` |
| `delivery_friendly` | `situational.delivery_preferred` |
| `adventurousness_score` | `game_data.slider_values.adventurous` |
| `health_score` | `game_data.slider_values.health_conscious` |

---

## API Endpoint

**POST `/api/ai-recommendations`**

Minimal payload:
```json
{
  "user_context": {
    "mood": { "primary": "stressed", "energy_level": 3 }
  }
}
```

Full payload fields: see `app/schemas/request.py`.

---

## Commands

```bash
# Setup
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add your OPENAI_API_KEY

# Run locally
uvicorn app.main:app --reload

# Run tests (no API key needed — OpenAI is mocked)
pytest

# Docker
docker compose up --build
```

---

## Reference Documents

- `ref_docs/Ai-schema.md` — original schema spec (superseded by Pydantic models)
