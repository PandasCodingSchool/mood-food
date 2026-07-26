import type {
  QuizResults,
  AIRequestContext,
  RecommendationResponse,
  GameData,
  EnrichedMatch,
} from "../types";
import { API_BASE_URL, getHeaders } from "./apiBase";
import { getTodayCheckin } from "./moodState";

// Lightweight in-memory address store (no AsyncStorage dependency).
let _savedAddressId = "";

export async function getSavedAddressId(): Promise<string> {
  return _savedAddressId;
}

export async function saveAddressId(id: string): Promise<void> {
  _savedAddressId = id || "";
}

export function isSwiggyLive(): boolean {
  return process.env.EXPO_PUBLIC_SWIGGY_LIVE === "true";
}

function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchRecommendations(
  quizResults: QuizResults,
  gameData: GameData | null = null,
  refresh = false,
  swiggyAddressId?: string,
): Promise<RecommendationResponse> {
  const finalGameData =
    gameData ||
    ((quizResults as unknown as Record<string, unknown>).gameData as
      | GameData
      | undefined) ||
    null;
  const context = await buildRequestContext(quizResults, finalGameData, refresh);
  const body: Record<string, unknown> = {
    ...context,
    request_id: newRequestId(),
  };
  if (swiggyAddressId) {
    body.swiggy_address_id = swiggyAddressId;
  }

  const response = await fetch(`${API_BASE_URL}/ai-recommendations`, {
    method: "POST",
    headers: await getHeaders(),
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
      swiggy:
        (data.swiggy_matches?.[rec.dish?.id || rec.id] as EnrichedMatch | undefined) ||
        rec.swiggy ||
        null,
    })),
  };
}

async function buildRequestContext(
  quizResults: QuizResults,
  gameData: GameData | null,
  refresh = false,
): Promise<AIRequestContext> {
  const { mood, craving, budget, preference } = quizResults;
  const checkin = await getTodayCheckin();

  const budgetMap: Record<
    string,
    { min: number; max: number; currency: string }
  > = {
    low: { min: 0, max: 200, currency: "INR" },
    budget: { min: 0, max: 300, currency: "INR" },
    moderate: { min: 300, max: 800, currency: "INR" },
    medium: { min: 200, max: 500, currency: "INR" },
    high: { min: 500, max: 2000, currency: "INR" },
    splurge: { min: 800, max: 2000, currency: "INR" },
  };

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

  const energyMap: Record<string, number> = {
    happy: 7,
    tired: 2,
    stressed: 3,
    celebrating: 8,
    relaxed: 6,
    adventurous: 9,
  };

  return {
    userContext: {
      mood: {
        primary: mood,
        energyLevel: checkin?.energy ?? energyMap[mood] ?? 5,
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
      gameData: gameData || { type: "quiz", mood, craving, budget, preference },
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
