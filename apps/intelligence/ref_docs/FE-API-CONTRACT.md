# FoodMood — Frontend API Contract

**Base URL (local):** `http://localhost:8000`  
**Base URL (docker):** `http://localhost:8000`  
**Content-Type:** `application/json`

---

## Overview

Two endpoints power the FE:

| # | Endpoint | When to call |
|---|---|---|
| 1 | `POST /api/ai-recommendations` | User completes mood/game flow → fetch recommendation cards |
| 2 | `GET /api/dish/{dish_id}` | User taps an alternative chip on a card → fetch that dish's detail card |

---

## 1. POST `/api/ai-recommendations`

### Request

Only `user_context.mood.primary` is required. Everything else is optional — send what you have.

```ts
type Request = {
  user_context: {
    mood: {
      primary: string           // REQUIRED — "stressed" | "happy" | "sad" | "anxious"
                                //            | "celebratory" | "romantic" | "comfort"
      energy_level?: number     // 1–10, default 5. Low = want delivery, High = cook-from-scratch ok
      social_context?: "solo" | "date" | "friends" | "family"
    }
    preferences?: {
      cuisine_types?: string[]              // ["indian", "italian", ...]
      dietary_restrictions?: string[]       // ["vegetarian", "vegan", "gluten_free", "dairy_free"]
      allergies?: string[]                  // ["nuts", "dairy", "gluten", "shellfish", "eggs"]
      spice_tolerance?: "mild" | "medium" | "hot" | "very_hot"
    }
    situational?: {
      time_of_day?: "breakfast" | "lunch" | "dinner" | "late_night"
      weather?: "rainy" | "cold" | "hot" | "sunny" | "any"
      budget?: {
        max: number             // e.g. 500
        min?: number
        currency?: string       // default "INR"
      }
      time_available?: number   // minutes available to eat/cook
      delivery_preferred?: boolean
    }
    game_data?: {
      selections?: string[]     // emoji or keyword picks, e.g. ["😴", "🌧️", "🍜"]
      swipes?: Array<{
        item: string
        liked: boolean
        reaction_time?: number  // ms — faster = stronger subconscious preference
      }>
      slider_values?: {
        adventurous?: number    // 1–10
        health_conscious?: number
        spicy?: number
      }
    }
    history?: {
      recent_orders?: Array<{
        dish: string
        rating?: number         // 1–5
        date?: string           // "YYYY-MM-DD"
      }>
      avoid_these?: string[]    // dish names or categories to exclude
    }
  }
  recommendation_config?: {
    count?: number              // 1–10, default 3
    diversity?: "low" | "medium" | "high"   // default "medium"
    include_explanations?: boolean           // default true — controls ai_reasoning fields
    include_alternatives?: boolean           // default true — controls alternatives array
    temperature?: number        // 0.0–1.0, default 0.7 (higher = more adventurous picks)
  }
}
```

### Response

```ts
type RecommendationsResponse = {
  success: boolean
  recommendations: Recommendation[]
  ai_metadata?: {
    model_used: string          // "gpt-4o"
    tokens_used?: number
    response_time_s?: number
    cache_hit: boolean          // true = served from cache, LLM was not called
  }
  insights?: {
    detected_mood_profile: string       // e.g. "Comfort-seeking, mildly stressed"
    preference_evolution?: string       // e.g. "Trending toward lighter choices"
  }
  error?: string                // present when success=false (fallback mode)
}

type Recommendation = {
  id: string                    // e.g. "rec_a1b2c3d4" — unique per response
  rank: number                  // 1-indexed, ascending
  confidence: number            // 0.0–1.0
  dish: {
    id: string                  // e.g. "in_002" — use this for GET /api/dish/{id}
    name: string
    cuisine: string
    category: string
    tags: string[]
  }
  image_url: string             // Unsplash CDN URL, ready to use in <img src>
  ai_reasoning: {
    mood_match: string          // why this dish fits the user's emotional state
    context_fit: string         // why it fits the situational constraints
    psychological_hook: string  // the deeper emotional pull of this dish
    nostalgia_factor?: string   // optional nostalgic connection
  }
  practical_details: {
    estimated_price: number     // INR
    preparation_time: number    // minutes
    calories: number
    health_score: number        // 0–10
  }
  restaurant: {
    name: string                // fabricated for now — delivery deep links coming later
    rating: number              // 0–5
    distance_km: number
    delivery_time_min: number
    is_open: boolean
  }
  alternatives: Alternative[]   // [] when include_alternatives=false
  pairing_suggestions: Pairing[]
}

type Alternative = {
  dish_id: string   // pass directly to GET /api/dish/{dish_id}
  type: "healthier_swap" | "budget_swap"
  name: string
  reason: string
}

type Pairing = {
  type: "drink" | "dessert" | "side"
  name: string
  reason: string
}
```

### Example — minimal request

```json
POST /api/ai-recommendations
{
  "user_context": {
    "mood": { "primary": "stressed", "energy_level": 3 }
  }
}
```

### Example — response

```json
{
  "success": true,
  "recommendations": [
    {
      "id": "rec_a1b2c3d4",
      "rank": 1,
      "confidence": 0.91,
      "dish": {
        "id": "in_002",
        "name": "Dal Makhani",
        "cuisine": "indian",
        "category": "comfort_food",
        "tags": ["vegetarian", "stressed", "comfort", "sad"]
      },
      "image_url": "https://images.unsplash.com/photo-1668236534990-73c4ed23043c?w=600",
      "ai_reasoning": {
        "mood_match": "Dal Makhani is ultimate comfort for a stressed mind",
        "context_fit": "Vegetarian, within budget, delivery-ready",
        "psychological_hook": "Creamy warmth triggers serotonin release",
        "nostalgia_factor": "Reminds of home-cooked meals"
      },
      "practical_details": {
        "estimated_price": 250,
        "preparation_time": 25,
        "calories": 420,
        "health_score": 6.5
      },
      "restaurant": {
        "name": "Spice Garden",
        "rating": 4.4,
        "distance_km": 1.2,
        "delivery_time_min": 25,
        "is_open": true
      },
      "alternatives": [
        {
          "dish_id": "in_008",
          "type": "healthier_swap",
          "name": "Daal Rice",
          "reason": "Lower calories, similar comfort profile"
        },
        {
          "dish_id": "in_009",
          "type": "budget_swap",
          "name": "Khichdi",
          "reason": "More wallet-friendly, same cuisine"
        }
      ],
      "pairing_suggestions": [
        {
          "type": "drink",
          "name": "Mango Lassi",
          "reason": "Cools the palate and complements bold spices"
        }
      ]
    }
  ],
  "ai_metadata": {
    "model_used": "gpt-4o",
    "tokens_used": 1247,
    "response_time_s": 1.8,
    "cache_hit": false
  },
  "insights": {
    "detected_mood_profile": "Comfort-seeking, mildly stressed, craving warmth",
    "preference_evolution": "Trending toward lighter, health-conscious choices"
  }
}
```

### Error / Fallback response

When the AI is unavailable the endpoint still returns **HTTP 200** but `success: false`. The `recommendations` array is populated with top-rated fallback dishes so the UI never shows empty.

```json
{
  "success": false,
  "recommendations": [ /* top 3 dishes by health_score */ ],
  "error": "AI unavailable — showing top-rated fallbacks. (API timeout)"
}
```

### Validation errors — HTTP 422

Sent when required fields are missing or values are out of range.

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "user_context", "mood"],
      "msg": "Field required"
    }
  ]
}
```

---

## 2. GET `/api/dish/{dish_id}`

Fetches the full card for any dish by its `id`. Use `dish_id` from `alternatives[].dish_id` in the recommendations response.

### URL parameter

| Param | Type | Example |
|---|---|---|
| `dish_id` | `string` | `in_002`, `it_001`, `jp_003` |

### Response

```ts
type DishDetailResponse = {
  success: boolean
  dish?: {
    id: string
    name: string
    cuisine: string
    category: string
    tags: string[]
  }
  image_url?: string
  practical_details?: {
    estimated_price: number
    preparation_time: number
    calories: number
    health_score: number
  }
  restaurant?: {
    name: string
    rating: number
    distance_km: number
    delivery_time_min: number
    is_open: boolean
  }
  alternatives: Alternative[]
  pairing_suggestions: Pairing[]
  error?: string              // present when success=false (dish not found)
}
```

### Example

```
GET /api/dish/in_002
```

```json
{
  "success": true,
  "dish": {
    "id": "in_002",
    "name": "Dal Makhani",
    "cuisine": "indian",
    "category": "comfort_food",
    "tags": ["vegetarian", "stressed", "comfort", "sad"]
  },
  "image_url": "https://images.unsplash.com/photo-1668236534990-73c4ed23043c?w=600",
  "practical_details": {
    "estimated_price": 250,
    "preparation_time": 25,
    "calories": 420,
    "health_score": 6.5
  },
  "restaurant": {
    "name": "Popular Eats",
    "rating": 4.2,
    "distance_km": 1.5,
    "delivery_time_min": 25,
    "is_open": true
  },
  "alternatives": [
    {
      "dish_id": "in_008",
      "type": "healthier_swap",
      "name": "Daal Rice",
      "reason": "Lower calories, similar comfort profile"
    },
    {
      "dish_id": "in_009",
      "type": "budget_swap",
      "name": "Khichdi",
      "reason": "More wallet-friendly, same cuisine"
    }
  ],
  "pairing_suggestions": [
    {
      "type": "drink",
      "name": "Mango Lassi",
      "reason": "Cools the palate and complements bold spices"
    }
  ]
}
```

### Not found

Returns HTTP 200 with `success: false` (not a 404) so the FE can handle it uniformly:

```json
{
  "success": false,
  "alternatives": [],
  "pairing_suggestions": [],
  "error": "Dish 'xyz_999' not found."
}
```

---

## Integration Flow

```
User completes mood/game screen
        │
        ▼
POST /api/ai-recommendations
        │
        ├─ success=true  → render recommendation cards (rank 1, 2, 3)
        │                   each card shows: image, name, ai_reasoning,
        │                   price, calories, restaurant, alternatives chips
        │
        └─ success=false → render fallback cards with banner "Showing popular picks"

User taps an alternative chip (healthier_swap / budget_swap)
        │
        ▼
GET /api/dish/{alternative.dish_id}
        │
        └─ render dish detail sheet/modal with full card data
```

---

## Field Reference

### Dish IDs

Format: `{cuisine_prefix}_{3-digit number}` — e.g. `in_002`, `it_007`, `mx_003`

| Prefix | Cuisine |
|---|---|
| `in_` | Indian |
| `it_` | Italian |
| `mx_` | Mexican |
| `jp_` | Japanese |
| `am_` | American |
| `md_` | Mediterranean |
| `cn_` | Chinese |
| `th_` | Thai |

### Mood values (not an enum — send any string, these are recommended)

`stressed` · `happy` · `sad` · `anxious` · `celebratory` · `romantic` · `comfort` · `energetic` · `nostalgic` · `sick`

### Cache behaviour

`ai_metadata.cache_hit: true` means the response was served from in-memory cache — identical payloads within the same server session skip the LLM entirely. The FE can optionally display a subtle "instant" indicator vs a loading state based on this field.

---

## Interactive Docs

FastAPI auto-generates a full interactive UI at:

```
http://localhost:8000/docs
```

Try both endpoints directly in the browser — no client needed.
