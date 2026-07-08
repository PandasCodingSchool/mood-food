import type {
  QuizResults,
  AIRequestContext,
  RecommendationResponse,
  GameData,
} from "../types";
import { BUDGET_TIERS } from "../constants/budget";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * Fetch AI-powered recommendations from backend
 * Falls back to rule-based if AI service fails
 */
export async function fetchRecommendations(
  quizResults: QuizResults,
  gameData: GameData | null = null,
  refresh = false,
  swiggyAddressId?: string,
): Promise<RecommendationResponse> {
  // Use gameData from quizResults if available (GameResult includes gameData)
  const finalGameData =
    gameData ||
    ((quizResults as any).gameData as GameData | undefined) ||
    null;
  const context = buildRequestContext(quizResults, finalGameData, refresh);
  const body: Record<string, unknown> = { ...context };
  if (swiggyAddressId) {
    body.swiggy_address_id = swiggyAddressId;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/ai-recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      throw new Error(
        "You've requested too many recommendations. Please wait a few minutes and try again.",
      );
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as RecommendationResponse;

    return {
      ...data,
      recommendations: (data.recommendations || []).map((rec, i) => ({
        ...rec,
        id: rec.id || `rec_${i}`,
        dish: rec.dish || { name: "", cuisine: "" },
      })),
    };
  } catch (error) {
    console.error("Failed to fetch recommendations:", error);
    throw error;
  }
}

/**
 * Build request context from quiz results
 */
function buildRequestContext(
  quizResults: QuizResults,
  gameData: GameData | null,
  refresh = false,
): AIRequestContext {
  const { mood, craving, budget, preference } = quizResults;

  const budgetMap: Record<
    string,
    { min: number; max: number; currency: string }
  > = Object.fromEntries(
    BUDGET_TIERS.map((t) => [
      t.value,
      { min: t.min, max: t.max, currency: "INR" },
    ]),
  );

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 11
      ? "morning"
      : hour < 15
        ? "afternoon"
        : hour < 19
          ? "evening"
          : "night";

  return {
    userContext: {
      mood: {
        primary: mood,
        energyLevel: estimateEnergyLevel(mood),
        socialContext: "alone",
      },
      preferences: {
        cuisineTypes: [craving],
        dietaryRestrictions:
          preference === "veg"
            ? ["vegetarian"]
            : preference === "non-veg"
              ? ["non_veg"]
              : [],
        spiceTolerance: "medium",
      },
      situational: {
        timeOfDay,
        dayOfWeek: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
          now.getDay()
        ],
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
      includeAlternatives: true,
      ...(refresh && {
        temperature: parseFloat((0.5 + Math.random() * 0.5).toFixed(2)),
      }),
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

export default { fetchRecommendations };
