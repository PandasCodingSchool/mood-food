import express from "express";
import { getRecommendations } from "../utils/recommendationEngine.js";

const router = express.Router();

// External AI Service configuration
const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const AI_TIMEOUT = 10000; // 10 seconds

/**
 * POST /api/ai-recommendations
 *
 * Calls external AI service for recommendations
 * Falls back to rule-based engine on failure
 */
router.post("/", async (req, res) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract basic quiz data for fallback
  const { mood, craving, budget, preference } = extractQuizData(body);

  // Try external AI service first
  if (AI_SERVICE_URL) {
    try {
      const aiResponse = await fetchAIService(body);
      const responseTime = Date.now() - startTime;

      return res.json({
        success: true,
        source: "ai-service",
        responseTime,
        recommendations: aiResponse.recommendations || [],
        insights: aiResponse.insights || null,
        serviceMeta: aiResponse.meta || null,
      });
    } catch (error) {
      console.log("AI service failed, using fallback:", error.message);
    }
  }

  // Fallback to rule-based
  const fallbackRecs = getRecommendations(mood, craving, budget, preference);

  return res.json({
    success: true,
    source: "fallback",
    recommendations: fallbackRecs.map((rec, index) => ({
      id: `fb_${index}`,
      rank: index + 1,
      confidence: 0.75,
      dish: {
        name: rec.name,
        cuisine: rec.cuisine,
        category: rec.category || "general",
        tags: rec.tags || [],
      },
      aiReasoning: {
        moodMatch: `Matches ${mood} mood`,
        contextFit: `Fits ${budget} budget and ${craving} craving`,
        psychologicalHook: rec.reason || "Satisfies your craving",
      },
      practicalDetails: {
        estimatedPrice: rec.price || 0,
        preparationTime: rec.prepTime || 20,
        healthScore: rec.healthScore || 5,
      },
    })),
    insights: null,
  });
});

/**
 * Call external AI service
 * Simply passes through the request body to the service
 */
async function fetchAIService(context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  const headers = {
    "Content-Type": "application/json",
  };

  if (AI_SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
  }

  const response = await fetch(AI_SERVICE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(context),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`AI service error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Extract basic data for fallback engine
 */
function extractQuizData(body) {
  const ctx = body?.userContext || {};
  const game = ctx?.gameData || {};

  return {
    mood: ctx?.mood?.primary || game?.mood || "happy",
    craving: game?.craving || ctx?.preferences?.cuisineTypes?.[0] || "comfort",
    budget: ctx?.situational?.budget?.max > 500 ? "splurge" : "budget",
    preference: ctx?.preferences?.dietaryRestrictions?.[0] || "no-preference",
  };
}

export default router;
