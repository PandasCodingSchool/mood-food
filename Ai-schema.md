I'll design a comprehensive API schema for AI-powered recommendations. Since I'm in **Ask mode**, I'll provide the complete specification for you to implement (or switch to Code mode and I'll build it).

---

## 🧠 AI Recommendation API Schema

### POST `/api/ai-recommendations`

#### Request Body

```json
{
  "userContext": {
    "mood": {
      "primary": "stressed",
      "energyLevel": 3,
      "socialContext": "alone"
    },
    "preferences": {
      "cuisineTypes": ["italian", "asian", "comfort"],
      "dietaryRestrictions": ["vegetarian"],
      "allergies": ["nuts"],
      "spiceTolerance": "medium"
    },
    "situational": {
      "timeOfDay": "evening",
      "dayOfWeek": "friday",
      "weather": "rainy",
      "location": {
        "city": "Bangalore",
        "lat": 12.9716,
        "lng": 77.5946
      },
      "budget": {
        "min": 200,
        "max": 800,
        "currency": "INR"
      },
      "timeAvailable": 45,
      "deliveryPreferred": true
    },
    "gameData": {
      "type": "emoji_mixer",
      "selections": ["😴", "🌧️", "🍜"],
      "swipes": [
        { "item": "pizza", "liked": true, "reactionTime": 450 },
        { "item": "salad", "liked": false, "reactionTime": 200 }
      ],
      "sliderValues": {
        "adventurous": 3,
        "healthConscious": 7,
        "spicy": 5
      }
    },
    "history": {
      "recentOrders": [
        { "dish": "Butter Chicken", "rating": 5, "date": "2024-05-25" }
      ],
      "avoidThese": ["sushi", "extremely spicy"]
    }
  },
  "recommendationConfig": {
    "count": 3,
    "diversity": "high",
    "includeExplanations": true,
    "includeAlternatives": true,
    "temperature": 0.7
  }
}
```

#### Response Body

```json
{
  "success": true,
  "recommendations": [
    {
      "id": "rec_001",
      "rank": 1,
      "confidence": 0.89,
      "dish": {
        "name": "Creamy Truffle Mushroom Risotto",
        "cuisine": "Italian",
        "category": "comfort_food",
        "tags": ["vegetarian", "warm", "indulgent", "slow_cooked"]
      },
      "aiReasoning": {
        "moodMatch": "Your rainy evening + low energy combo screams warm comfort food",
        "contextFit": "45-min cooking time fits your schedule, vegetarian aligns with restrictions",
        "psychologicalHook": "Truffle provides luxury 'treat yourself' dopamine hit after a stressful week",
        "nostalgiaFactor": "Risotto texture mimics childhood rice dishes"
      },
      "practicalDetails": {
        "estimatedPrice": 450,
        "preparationTime": 35,
        "calories": 520,
        "protein": 12,
        "healthScore": 6.5
      },
      "restaurant": {
        "name": "La Pizzeria",
        "rating": 4.5,
        "distance": 2.3,
        "deliveryTime": 30,
        "isOpen": true
      },
      "alternatives": [
        {
          "type": "healthier_swap",
          "name": "Quinoa Mushroom Bowl",
          "reason": "Same flavors, 40% fewer calories"
        },
        {
          "type": "budget_swap",
          "name": "Mushroom Alfredo Pasta",
          "reason": "₹150 less, similar comfort profile"
        }
      ],
      "pairingSuggestions": [
        {
          "type": "drink",
          "name": "Hot Chocolate",
          "reason": "Amplifies cozy factor"
        },
        {
          "type": "dessert",
          "name": "Tiramisu",
          "reason": "Italian theme continuity"
        }
      ]
    }
  ],
  "aiMetadata": {
    "modelUsed": "gpt-4o",
    "tokensUsed": 1247,
    "responseTime": 1.2,
    "cacheHit": false
  },
  "insights": {
    "detectedMoodProfile": "Comfort-seeking, mildly stressed, needs dopamine boost",
    "preferenceEvolution": "Trending toward indulgent but guilt-conscious choices",
    "nextMealPrediction": "Likely light/healthy lunch tomorrow (balance pattern)"
  }
}
```

---

## 🔄 Error Response Schema

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CONTEXT",
    "message": "Not enough data to generate personalized recommendation",
    "fallbackProvided": true,
    "fallbackRecommendations": [...]
  }
}
```

---

## 📊 Key Schema Design Decisions

| Field                           | Purpose                                           |
| ------------------------------- | ------------------------------------------------- |
| `mood.energyLevel` (1-10)       | Maps to cooking complexity vs delivery            |
| `gameData.reactionTime`         | Faster = stronger subconscious preference         |
| `diversity`                     | High = surprise them; Low = stick to comfort zone |
| `temperature`                   | 0.1 = safe picks; 0.9 = adventurous suggestions   |
| `aiReasoning.psychologicalHook` | Explains _why_ this hits their emotional need     |
| `alternatives.healthier_swap`   | Addresses guilt before they abandon               |

---

## 🔌 Provider-Agnostic Architecture

```javascript
// /backend/services/aiProviders/openaiAdapter.js
// /backend/services/aiProviders/claudeAdapter.js
// /backend/services/aiProviders/geminiAdapter.js

const getRecommendation = async (context, config, provider = "openai") => {
  const adapter = providers[provider];
  const prompt = buildPrompt(context);
  const raw = await adapter.generate(prompt, config.temperature);
  return normalizeResponse(raw); // Always returns same schema
};
```

---

## 🎯 Prompt Template Structure

```javascript
const buildPrompt = (context) => ({
  system: `You are a food psychologist AI. Analyze mood, context, and implicit preferences to recommend dishes that satisfy emotional needs, not just hunger.`,

  user: {
    mood_analysis: context.mood,
    situational_constraints: context.situational,
    psychological_profile: deriveProfile(context.gameData),
    output_format: "JSON following schema v1.2",
    constraints: `Budget: ${context.situational.budget.max}. Time: ${context.situational.timeAvailable}min`,
  },
});
```
