import express from "express";
import { getRecommendations } from "../utils/recommendationEngine.js";

const router = express.Router();

// External AI Service configuration
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS || "30000"); // 30s default, handles cold starts
const AI_MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || "2");
const AI_RETRY_BASE_DELAY_MS = parseInt(
  process.env.AI_RETRY_BASE_DELAY_MS || "400",
);

/**
 * POST /api/ai-recommendations
 *
 * Calls external AI service for recommendations
 * Falls back to rule-based engine on failure
 */
router.post("/", async (req, res) => {
  const body = req.body;
  const userContext = body?.userContext || {};
  const gameData = userContext?.gameData || {};

  // Extract basic quiz data for fallback
  const { mood, craving, budget, preference } = extractQuizData(body);

  // Build contract-compliant snake_case request for AI service
  // Character context is included in gameData for AI to reason about
  const aiRequest = buildAiRequest(body);

  if (gameData.type === "character_match" && gameData.character?.id) {
    console.log(
      `Character Match detected: ${gameData.character.name} - AI will prioritize their favorite dishes`
    );
  }
  console.log(aiRequest);

  // Try external AI service first
  if (AI_SERVICE_URL) {
    try {
      const aiResponse = await fetchAIService(aiRequest);
      // AI service returns contract-compliant snake_case response — pass through
      return res.json(aiResponse);
    } catch (error) {
      console.log("AI service failed, using fallback:", error.message);
    }
  }

  // Fallback to rule-based — shaped to match contract
  const fallbackRecs = getRecommendations(mood, craving, budget, preference);

  return res.json({
    success: false,
    recommendations: fallbackRecs.map((rec, index) => ({
      id: `fb_${index}`,
      rank: index + 1,
      confidence: 0.75,
      dish: {
        id: rec.id || `fb_dish_${index}`,
        name: rec.name,
        cuisine: rec.cuisine,
        category: rec.category || "general",
        tags: rec.tags || [],
      },
      image_url: rec.image_url || null,
      ai_reasoning: {
        mood_match: `Matches ${mood} mood`,
        context_fit: `Fits ${budget} budget and ${craving} craving`,
        psychological_hook: rec.reason || "Satisfies your craving",
      },
      practical_details: {
        estimated_price: rec.price || 0,
        preparation_time: rec.prepTime || 20,
        calories: rec.calories || 0,
        health_score: rec.healthScore || 5,
      },
      restaurant: null,
      alternatives: [],
      pairing_suggestions: [],
    })),
    insights: null,
    error: "AI unavailable — showing top-rated fallbacks.",
  });
});

/**
 * Call external AI service
 * Simply passes through the request body to the service
 */
async function fetchAIService(context) {
  let lastError;

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      return await fetchAIServiceOnce(context, attempt + 1);
    } catch (error) {
      lastError = error;

      if (!isRetryableAIError(error) || attempt === AI_MAX_RETRIES) {
        throw error;
      }

      const delayMs = getRetryDelay(attempt);
      console.warn(
        `AI service attempt ${attempt + 1} failed (${error.message}). Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function fetchAIServiceOnce(context, attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  const headers = {
    "Content-Type": "application/json",
  };

  if (AI_SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
  }

  console.log(
    `Calling AI service (attempt ${attempt}/${AI_MAX_RETRIES + 1}):`,
    AI_SERVICE_URL + "/api/ai-recommendations",
  );

  let response;
  try {
    response = await fetch(AI_SERVICE_URL + "/api/ai-recommendations", {
      method: "POST",
      headers,
      body: JSON.stringify(context),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(`AI service error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

function isRetryableAIError(error) {
  if (error?.name === "AbortError") {
    return true;
  }

  if (error?.status) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  return true;
}

function getRetryDelay(attempt) {
  const exponentialDelay = AI_RETRY_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 150);
  return exponentialDelay + jitter;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build contract-compliant snake_case request body for AI service.
 * Maps frontend camelCase fields to the FE-API-CONTRACT schema.
 */
function buildAiRequest(body) {
  const ctx = body?.userContext || {};
  const game = ctx?.gameData || {};
  const prefs = ctx?.preferences || {};
  const sit = ctx?.situational || {};
  const cfg = body?.recommendationConfig || {};

  const user_context = {
    mood: {
      primary: ctx?.mood?.primary || game?.mood || "happy",
      ...(ctx?.mood?.energyLevel != null && {
        energy_level: ctx.mood.energyLevel,
      }),
      ...(ctx?.mood?.socialContext && {
        social_context:
          ctx.mood.socialContext === "alone" ? "solo" : ctx.mood.socialContext,
      }),
    },
    ...(Object.keys(prefs).length && {
      preferences: {
        cuisine_types: prefs.cuisineTypes || [],
        dietary_restrictions: prefs.dietaryRestrictions || [],
        allergies: prefs.allergies || [],
        ...(prefs.spiceTolerance && { spice_tolerance: prefs.spiceTolerance }),
      },
    }),
    ...(Object.keys(sit).length && {
      situational: {
        ...(sit.timeOfDay && {
          time_of_day: mapTimeOfDay(sit.timeOfDay),
        }),
        ...(sit.dayOfWeek && { day_of_week: sit.dayOfWeek }),
        ...(sit.weather && { weather: sit.weather }),
        ...(sit.budget && {
          budget: {
            max: sit.budget.max,
            min: sit.budget.min,
            currency: sit.budget.currency,
          },
        }),
        ...(sit.timeAvailable != null && { time_available: sit.timeAvailable }),
        ...(sit.deliveryPreferred != null && {
          delivery_preferred: sit.deliveryPreferred,
        }),
      },
    }),
    ...(Object.keys(game).length && {
      game_data: {
        ...(game.type && { type: game.type }),
        liked: game.liked || [],
        disliked: game.disliked || [],
        cravings: game.cravings || [],
        cuisines: game.cuisines || [],
        ...(game.budgetTier && { budget_tier: game.budgetTier }),
        ...(game.dietPreference && { diet_preference: game.dietPreference }),
        ...(game.moodVector && {
          mood_vector: {
            energy: game.moodVector.energy,
            valence: game.moodVector.valence,
            social: game.moodVector.social,
          },
        }),
        swipes: game.raw?.swipes || game.swipes || [],
        ...(game.sliderValues && {
          slider_values: {
            adventurous: game.sliderValues.adventurous,
            health_conscious: game.sliderValues.healthConscious,
            spicy: game.sliderValues.spicy,
          },
        }),
        // Pass character context for character_match games
        ...(game.character && {
          character: {
            id: game.character.id,
            name: game.character.name,
            show: game.character.show,
            emoji: game.character.emoji,
            match_percentage:
              game.character.matchPercentage ?? game.matchPercentage,
            traits: game.character.traits,
            runner_ups: game.character.runnerUps || [],
          },
        }),
        ...(game.raw && { raw: game.raw }),
      },
    }),
  };

  const recommendation_config = {
    count: cfg.count ?? 3,
    diversity: cfg.diversity ?? "medium",
    include_explanations: cfg.includeExplanations ?? true,
    include_alternatives: cfg.includeAlternatives ?? true,
    ...(cfg.temperature != null && { temperature: cfg.temperature }),
  };

  return {
    user_context,
    recommendation_config,
    ...(body?.swiggy_address_id && { swiggy_address_id: body.swiggy_address_id }),
  };
}

function mapTimeOfDay(timeOfDay) {
  const normalized = String(timeOfDay).toLowerCase();
  const map = {
    morning: "breakfast",
    breakfast: "breakfast",
    afternoon: "lunch",
    lunch: "lunch",
    evening: "dinner",
    dinner: "dinner",
    night: "late_night",
    late_night: "late_night",
  };
  return map[normalized] || "dinner";
}

/**
 * Extract basic data for fallback engine
 */
function extractQuizData(body) {
  const ctx = body?.userContext || {};
  const game = ctx?.gameData || {};

  return {
    mood: ctx?.mood?.primary || game?.mood || "happy",
    craving:
      game?.cravings?.[0] ||
      game?.craving ||
      ctx?.preferences?.cuisineTypes?.[0] ||
      "comfort",
    budget:
      game?.budgetTier ||
      (ctx?.situational?.budget?.max > 800
        ? "splurge"
        : ctx?.situational?.budget?.max > 300
          ? "moderate"
          : "budget"),
    preference: ctx?.preferences?.dietaryRestrictions?.[0] || "no-preference",
  };
}

export default router;
