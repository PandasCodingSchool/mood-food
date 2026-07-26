export interface QuizResults {
  mood: string;
  craving: string;
  budget: string;
  preference: string;
}

export interface GameData {
  type: string;
  [key: string]: unknown;
}

export type BudgetTier = 'budget' | 'moderate' | 'splurge';
export type DietPreference = 'veg' | 'non-veg' | 'both';

export interface GameSwipe {
  item: string;
  liked: boolean;
  reactionTime?: number; // ms — faster = stronger subconscious preference
  dishId?: string;
}

export interface GameCharacterSignal {
  id: string;
  name: string;
  show?: string;
  emoji?: string;
  matchPercentage?: number;
  traits?: Record<string, number>;
  runnerUps?: Array<{ id: string; match_percent?: number }>;
}

/** Unified game-signal payload — every game emits this shape (port of web). */
export interface GameSignals extends GameData {
  liked: string[];
  disliked: string[];
  cravings: string[];
  cuisines: string[];
  budgetTier: BudgetTier;
  dietPreference: DietPreference;
  moodVector?: { energy: number; valence: number; social: number };
  sliderValues?: { adventurous: number; healthConscious: number; spicy: number };
  swipes?: GameSwipe[];
  character?: GameCharacterSignal;
  cravingTags?: string[];
  duelResults?: Array<{ dimensionA: string; dimensionB: string; winner: string }>;
  pantryItems?: string[];
  raw?: Record<string, unknown>;
}

/** One event for the personalization signals spine (POST /api/signals). */
export interface SignalEvent {
  type: string;
  payload: Record<string, unknown>;
  context?: Record<string, unknown>;
  clientTs?: string;
}

export interface LearnedProfile {
  confidence?: number;
  question_budget?: number;
  mode?: string;
  game_plan?: Array<{ game: string; eig: number }>;
  accuracy_meter?: { accuracy: number; n: number } | null;
  persona?: { archetype: string; blurb: string; drift_line?: string } | null;
  mood_map_top?: Array<{ archetype: string; weight: number }>;
  next_meal_prediction?: string | null;
  n_signals?: number;
}

export interface PendingPrediction {
  id: string;
  recId: string;
  dishId?: string | null;
  dishName?: string | null;
  userPredictedScore?: number | null;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  rank?: number;
  confidence?: number;
  predicted_score?: number | null;
  is_wildcard?: boolean;
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
    type: 'healthier_swap' | 'budget_swap' | 'similar_tier_swap' | 'popular_pick';
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
    type: 'drink' | 'dessert' | 'side';
    name: string;
    reason: string;
  }>;
  /** Populated client-side after a successful /api/swiggy/enrich match — real menu photo/restaurant, not the static Unsplash placeholder above. */
  swiggy?: EnrichedMatch | null;
}

export interface SwiggyMenuItem {
  id: string;
  name: string;
  price?: number | null;
  image_url?: string | null;
  is_veg?: boolean | null;
  rating?: number | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  eta_min?: number | null;
}

export interface SwiggyRestaurant {
  id: string;
  name: string;
  rating?: number | null;
  eta_min?: number | null;
  distance_km?: number | null;
  cuisines?: string[];
  image_url?: string | null;
  is_open?: boolean;
  cost_for_two?: number | null;
}

export interface SwiggyAlt {
  type: 'healthier' | 'budget' | 'similar_tier';
  item: SwiggyMenuItem;
}

export interface EnrichedMatch {
  dish_id: string;
  matched: boolean;
  item?: SwiggyMenuItem | null;
  restaurant?: SwiggyRestaurant | null;
  swiggy_alternatives?: SwiggyAlt[];
}

export interface EnrichResponse {
  success: boolean;
  address_id?: string | null;
  matches: EnrichedMatch[];
  error?: string;
  address_required?: boolean;
}

export interface RecommendationResponse {
  success: boolean;
  source?: 'ai-service' | 'fallback';
  recommendations: Recommendation[];
  insights?: {
    detected_mood_profile?: string;
    preference_evolution?: string;
    next_meal_prediction?: string | null;
    persona_drift?: string | null;
  } | null;
  meta?: {
    confidence?: number;
    question_budget?: number;
    persona?: string | null;
    mode?: string;
    accuracy_meter?: { accuracy: number; n: number } | null;
  } | null;
  ai_metadata?: {
    model_used?: string;
    tokens_used?: number;
    response_time_s?: number;
    cache_hit?: boolean;
  } | null;
  error?: string;
  swiggy_matches?: Record<string, EnrichedMatch>;
  swiggy_address_id?: string;
  live_status?: 'live' | 'partial' | 'offline' | null;
  request_id?: string;
}

export interface UserContext {
  mood: {
    primary: string;
    energyLevel: number;
    socialContext: string;
    hungerLevel?: number;
    stressLevel?: number;
  };
  preferences: {
    cuisineTypes: string[];
    dietaryRestrictions: string[];
    spiceTolerance: string;
  };
  situational: {
    timeOfDay: string;
    dayOfWeek: string;
    budget: { min: number; max: number; currency: string };
    timeAvailable: number;
    deliveryPreferred: boolean;
    occasion?: 'treat' | 'fuel' | 'reward';
  };
  gameData?: GameData;
  comfortAnchors?: Array<{ food: string; trigger?: string }>;
  automationPref?: 'hands_on' | 'balanced' | 'hands_off';
}

export interface AIRequestContext {
  userContext: UserContext;
  recommendationConfig: {
    count: number;
    diversity: string;
    includeExplanations: boolean;
    includeAlternatives: boolean;
    temperature?: number;
    mode?: 'standard' | 'mind_reader' | 'sos' | 'wildcard' | 'group';
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
  icon: string;
  mood: string;
}

export interface GameResult extends QuizResults {
  gameData: GameData;
}
