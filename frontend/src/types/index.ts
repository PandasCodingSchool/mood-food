// Core types for MoodFood application

export interface QuizResults {
  mood: string;
  craving: string;
  budget: string;
  preference: string;
}

export type GameType =
  | "quiz"
  | "character_match"
  | "day_story"
  | "swipe_vibe"
  | "spin_wheel";

export interface GameCharacterSignal {
  id: string;
  name: string;
  show?: string;
  emoji?: string;
  matchPercentage?: number;
  traits?: Record<string, number>;
  runnerUps?: Array<{ id: string; matchPercent: number }>;
  [key: string]: unknown; // games may attach extra display fields (tagline, vibe…)
}

// Unified signal payload every game emits on completion.
export interface GameSignals {
  type: GameType;
  liked: string[]; // accepted segments, right-swipes, chosen options
  disliked: string[]; // rejected segments, left-swipes
  cravings: string[]; // ordered, strongest first
  cuisines: string[];
  budgetTier: "budget" | "moderate" | "splurge";
  dietPreference: "veg" | "non-veg" | "both";
  moodVector?: { energy: number; valence: number; social: number }; // -1..1
  sliderValues?: {
    adventurous: number;
    healthConscious: number;
    spicy: number;
  }; // 1..10
  character?: GameCharacterSignal;
  raw?: Record<string, unknown>; // per-game payload: swipes, storyChoices, answers, spins…
}

// Transitional alias while games migrate to GameSignals.
export interface GameData extends Partial<GameSignals> {
  type: GameType;
  [key: string]: unknown;
}

export interface Recommendation {
  id: string;
  rank?: number;
  confidence?: number;
  dish: {
    id?: string;
    name: string;
    cuisine: string;
    category?: string;
    tags?: string[];
  };
  image_url?: string | null;
  ai_reasoning?: {
    mood_match?: string;
    context_fit?: string;
    psychological_hook?: string;
    nostalgia_factor?: string;
    context_tags?: string[];
  } | null;
  practical_details?: {
    estimated_price?: number;
    preparation_time?: number;
    calories?: number;
    health_score?: number;
  } | null;
  restaurant?: {
    name?: string;
    rating?: number;
    distance_km?: number;
    delivery_time_min?: number;
    is_open?: boolean;
  } | null;
  alternatives?: Array<{
    dish_id: string;
    type: "healthier_swap" | "budget_swap" | "popular_pick";
    name: string;
    reason: string;
    cuisine?: string;
    category?: string;
    tags?: string[];
    image_url?: string | null;
    practical_details?: {
      estimated_price?: number;
      preparation_time?: number;
      calories?: number;
      health_score?: number;
    } | null;
  }>;
  pairing_suggestions?: Array<{
    type: "drink" | "dessert" | "side";
    name: string;
    reason: string;
  }>;
  characterBranded?: boolean;
  characterId?: string;
}

export interface RecommendationResponse {
  success: boolean;
  source?: "ai-service" | "fallback";
  recommendations: Recommendation[];
  insights?: {
    detected_mood_profile?: string;
    preference_evolution?: string;
  } | null;
  ai_metadata?: {
    model_used?: string;
    tokens_used?: number;
    response_time_s?: number;
    cache_hit?: boolean;
  } | null;
  error?: string;
  swiggy_matches?: Record<string, unknown>;
  swiggy_address_id?: string;
}

export interface UserContext {
  mood: {
    primary: string;
    energyLevel: number;
    socialContext: string;
  };
  preferences: {
    cuisineTypes: string[];
    dietaryRestrictions: string[];
    spiceTolerance: string;
  };
  situational: {
    timeOfDay: string;
    dayOfWeek: string;
    budget: {
      min: number;
      max: number;
      currency: string;
    };
    timeAvailable: number;
    deliveryPreferred: boolean;
  };
  gameData?: GameData;
}

export interface AIRequestContext {
  userContext: UserContext;
  recommendationConfig: {
    count: number;
    diversity: string;
    includeExplanations: boolean;
    includeAlternatives: boolean;
  };
}

export interface SwipeItem {
  id: number;
  image: string;
  name: string;
  category: string;
  cuisine: string;
  budget: string;
  vibe: string;
}

export interface SwipeData {
  item: string;
  category: string;
  cuisine: string;
  budget: string;
  vibe: string;
  liked: boolean;
  timestamp: number;
}

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
  gradient?: string;
  icon: string;
  mood: string;
}

export interface BudgetOption {
  id: string;
  label: string;
  emoji: string;
}

export interface GameResult extends QuizResults {
  gameData: GameSignals | GameData;
}

export interface AnalyticsEvent {
  eventName: string;
  properties?: Record<string, unknown>;
}
