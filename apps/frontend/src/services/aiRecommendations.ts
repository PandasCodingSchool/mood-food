import type {
  QuizResults,
  AIRequestContext,
  RecommendationResponse,
  GameData,
} from "../types";
import { BUDGET_TIERS } from "../constants/budget";
import { getTodayCheckin } from "../utils/moodState";
import { getPassiveWeather, hasLocationConsent } from "./context";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fetch AI-powered recommendations from backend.
 * Backend owns shortlist + live Swiggy verification + ranking.
 */
export async function fetchRecommendations(
  quizResults: QuizResults,
  gameData: GameData | null = null,
  refresh = false,
  swiggyAddressId?: string,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  const finalGameData =
    gameData ||
    ((quizResults as any).gameData as GameData | undefined) ||
    null;
  const context = buildRequestContext(quizResults, finalGameData, refresh);
  if (hasLocationConsent()) {
    context.userContext.situational.weather = await getPassiveWeather();
  }
  const body: Record<string, unknown> = {
    ...context,
    request_id: newRequestId(),
  };
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
      signal,
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
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }
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
  const checkin = getTodayCheckin();

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
        energyLevel: checkin?.energy ?? estimateEnergyLevel(mood),
        socialContext: checkin && checkin.social >= 6 ? "friends" : "alone",
        ...(checkin?.hunger != null && { hungerLevel: checkin.hunger }),
        ...(checkin?.stress != null && { stressLevel: checkin.stress }),
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
        ...(checkin?.occasion && { occasion: checkin.occasion }),
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
      count: gameData?.type === "mind_reader" ? 1 : 3,
      diversity: "medium",
      includeExplanations: true,
      includeAlternatives: true,
      ...(gameData?.type === "mind_reader" && { mode: "mind_reader" }),
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
