import type { QuizResults, AIRequestContext, RecommendationResponse, GameData } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * Fetch AI-powered recommendations from backend
 * Falls back to rule-based if AI service fails
 */
export async function fetchRecommendations(
  quizResults: QuizResults,
  gameData: GameData | null = null
): Promise<RecommendationResponse> {
  const context = buildRequestContext(quizResults, gameData);

  try {
    const response = await fetch(`${API_BASE_URL}/ai-recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as RecommendationResponse;

    return {
      success: true,
      source: data.source,
      recommendations: normalizeRecommendations(data.recommendations),
      insights: data.insights || null,
      responseTime: data.responseTime,
    };
  } catch (error) {
    console.error("Failed to fetch recommendations:", error);
    throw error;
  }
}

/**
 * Build request context from quiz results
 */
function buildRequestContext(quizResults: QuizResults, gameData: GameData | null): AIRequestContext {
  const { mood, craving, budget, preference } = quizResults;

  const budgetMap: Record<string, { min: number; max: number; currency: string }> = {
    budget: { min: 0, max: 300, currency: "INR" },
    moderate: { min: 300, max: 800, currency: "INR" },
    splurge: { min: 800, max: 2000, currency: "INR" },
  };

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 11 ? "morning" : hour < 15 ? "afternoon" : hour < 19 ? "evening" : "night";

  return {
    userContext: {
      mood: {
        primary: mood,
        energyLevel: estimateEnergyLevel(mood),
        socialContext: "alone",
      },
      preferences: {
        cuisineTypes: [craving],
        dietaryRestrictions: preference === "veg" ? ["vegetarian"] : [],
        spiceTolerance: "medium",
      },
      situational: {
        timeOfDay,
        dayOfWeek: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()],
        budget: budgetMap[budget] || budgetMap.moderate,
        timeAvailable: 30,
        deliveryPreferred: true,
      },
      gameData: gameData || {
        type: "quiz",
        mood,
        craving,
        budget,
        preference,
      },
    },
    recommendationConfig: {
      count: 3,
      diversity: "medium",
      includeExplanations: true,
      includeAlternatives: false,
    },
  };
}

/**
 * Estimate energy level based on mood
 */
function estimateEnergyLevel(mood: string): number {
  const energyMap: Record<string, number> = {
    happy: 7,
    tired: 2,
    stressed: 3,
    celebrating: 8,
    relaxed: 6,
    adventurous: 9,
  };
  return energyMap[mood] || 5;
}

interface APIRecommendation {
  id?: string;
  name?: string;
  dish?: {
    name: string;
    cuisine: string;
    category?: string;
    tags?: string[];
  };
  cuisine?: string;
  category?: string;
  tags?: string[];
  aiReasoning?: {
    moodMatch?: string;
    contextFit?: string;
    psychologicalHook?: string;
  } | null;
  reason?: string;
  practicalDetails?: {
    estimatedPrice?: number;
    preparationTime?: number;
    healthScore?: number;
  };
  price?: number;
  prepTime?: number;
  healthScore?: number;
  budgetType?: string;
  confidence?: number;
}

/**
 * Normalize recommendations to consistent format
 */
function normalizeRecommendations(recommendations: APIRecommendation[]) {
  return recommendations.map((rec, index) => ({
    id: rec.id || `rec_${index}`,
    name: rec.dish?.name || rec.name || '',
    cuisine: rec.dish?.cuisine || rec.cuisine || "Mixed",
    category: rec.dish?.category || rec.category || "general",
    tags: rec.dish?.tags || rec.tags || [],
    why:
      rec.aiReasoning?.psychologicalHook ||
      rec.aiReasoning?.moodMatch ||
      rec.reason ||
      "Perfect for your mood",
    price: rec.practicalDetails?.estimatedPrice || rec.price || 0,
    prepTime: rec.practicalDetails?.preparationTime || rec.prepTime || 20,
    healthScore: rec.practicalDetails?.healthScore || rec.healthScore || 5,
    budgetType: rec.budgetType || "Casual Dining",
    aiReasoning: rec.aiReasoning || null,
    confidence: rec.confidence || 0.8,
  }));
}

export default { fetchRecommendations };
