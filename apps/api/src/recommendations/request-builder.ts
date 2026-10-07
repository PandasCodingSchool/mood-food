// Maps the app's camelCase recommendation request to the intelligence
// service's snake_case contract (FE-API-CONTRACT). The server owns the time
// bucket (IST) — clients bucket differently (mobile sends "night" from 19:00).

import { istParts } from '../common/ist.js';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const nonEmpty = (o: Obj | undefined) => !!o && Object.keys(o).length > 0;

// gameData keys mapped explicitly below; anything else (wheel `segment`, quiz
// `scoops`, swipe `likedCount`, …) is preserved under `raw` instead of dropped.
const KNOWN_GAME_KEYS = new Set([
  'type', 'liked', 'disliked', 'cravings', 'cuisines', 'budgetTier', 'dietPreference', 'moodVector',
  'swipes', 'cravingTags', 'duelResults', 'pantryItems', 'sliderValues', 'moodAxes', 'cluster', 'raw', 'mood',
]);
const extraGameKeys = (game: Obj) =>
  Object.fromEntries(Object.entries(game).filter(([k, v]) => !KNOWN_GAME_KEYS.has(k) && v !== undefined));
const list = (v: unknown) => (Array.isArray(v) && v.length ? v : null);

export function buildAiRequest(body: Obj, userId: string | undefined, requestId: string, now: Date = new Date()) {
  const ctx: Obj = body?.userContext ?? {};
  const game: Obj = ctx.gameData ?? {};
  const prefs: Obj = ctx.preferences ?? {};
  const sit: Obj = ctx.situational ?? {};
  const cfg: Obj = body?.recommendationConfig ?? {};
  const mood: Obj = ctx.mood ?? {};
  const ist = istParts(now);
  const gameRaw = { ...extraGameKeys(game), ...(game.raw ?? {}) };

  const user_context = {
    mood: {
      primary: mood.primary || game.mood || 'happy',
      ...(mood.energyLevel != null && { energy_level: mood.energyLevel }),
      ...(mood.socialContext && { social_context: mood.socialContext === 'alone' ? 'solo' : mood.socialContext }),
      ...(mood.hungerLevel != null && { hunger_level: mood.hungerLevel }),
      ...(mood.stressLevel != null && { stress_level: mood.stressLevel }),
    },
    ...(list(ctx.comfortAnchors) && {
      comfort_anchors: (ctx.comfortAnchors as Obj[]).map((a) => ({ food: a.food, trigger: a.trigger })),
    }),
    ...(ctx.automationPref && { automation_pref: ctx.automationPref }),
    ...(nonEmpty(prefs) && {
      preferences: {
        cuisine_types: prefs.cuisineTypes || [],
        dietary_restrictions: prefs.dietaryRestrictions || [],
        allergies: prefs.allergies || [],
        ...(prefs.spiceTolerance && { spice_tolerance: prefs.spiceTolerance }),
      },
    }),
    situational: {
      time_of_day: ist.time_of_day,
      day_of_week: sit.dayOfWeek || ist.day_of_week,
      ...(sit.weather && { weather: sit.weather }),
      ...(sit.budget && { budget: { max: sit.budget.max, min: sit.budget.min, currency: sit.budget.currency } }),
      ...(sit.timeAvailable != null && { time_available: sit.timeAvailable }),
      ...(sit.deliveryPreferred != null && { delivery_preferred: sit.deliveryPreferred }),
      ...(sit.occasion && { occasion: sit.occasion }),
      ...(sit.hoursSinceLastMeal != null && { hours_since_last_meal: sit.hoursSinceLastMeal }),
    },
    ...(nonEmpty(game) && {
      game_data: {
        ...(game.type && { type: game.type }),
        liked: game.liked || [],
        disliked: game.disliked || [],
        cravings: game.cravings || [],
        cuisines: game.cuisines || [],
        ...(game.budgetTier && { budget_tier: game.budgetTier }),
        ...(game.dietPreference && { diet_preference: game.dietPreference }),
        ...(game.moodVector && {
          mood_vector: { energy: game.moodVector.energy, valence: game.moodVector.valence, social: game.moodVector.social },
        }),
        swipes: game.raw?.swipes || game.swipes || [],
        ...(list(game.cravingTags) && { craving_tags: game.cravingTags }),
        ...(list(game.duelResults) && {
          duel_results: (game.duelResults as Obj[]).map((d) => ({
            dimension_a: d.dimensionA ?? d.dimension_a,
            dimension_b: d.dimensionB ?? d.dimension_b,
            winner: d.winner,
          })),
        }),
        ...(list(game.pantryItems) && { pantry_items: game.pantryItems }),
        ...(game.sliderValues && {
          slider_values: {
            adventurous: game.sliderValues.adventurous,
            health_conscious: game.sliderValues.healthConscious,
            spicy: game.sliderValues.spicy,
          },
        }),
        ...(game.moodAxes && {
          mood_axes: {
            cozy_adventurous: game.moodAxes.cozyAdventurous,
            solo_social: game.moodAxes.soloSocial,
            comfort_energy: game.moodAxes.comfortEnergy,
            nostalgic_novelty: game.moodAxes.nostalgicNovelty,
            indulgent_light: game.moodAxes.indulgentLight,
          },
        }),
        ...(game.cluster && {
          cluster: { id: game.cluster.id, name: game.cluster.name, secondary_id: game.cluster.secondaryId },
        }),
        ...(nonEmpty(gameRaw) && { raw: gameRaw }),
      },
    }),
  };

  return {
    user_context,
    recommendation_config: {
      count: cfg.count ?? 3,
      diversity: cfg.diversity ?? 'medium',
      include_explanations: cfg.includeExplanations ?? true,
      include_alternatives: cfg.includeAlternatives ?? true,
      ...(cfg.temperature != null && { temperature: cfg.temperature }),
      ...(cfg.mode && { mode: cfg.mode }),
    },
    ...(body?.swiggy_address_id && { swiggy_address_id: body.swiggy_address_id }),
    ...(userId && { user_id: userId }),
    request_id: typeof body?.request_id === 'string' && body.request_id ? body.request_id : requestId,
  };
}

/** The four quiz answers the rule-based fallback understands. */
export function extractQuizData(body: Obj) {
  const ctx: Obj = body?.userContext ?? {};
  const game: Obj = ctx.gameData ?? {};
  const max = ctx.situational?.budget?.max;
  return {
    mood: String(ctx.mood?.primary || game.mood || 'happy'),
    craving: String(game.cravings?.[0] || game.craving || ctx.preferences?.cuisineTypes?.[0] || 'comfort'),
    budget: String(game.budgetTier || (max > 800 ? 'splurge' : max > 300 ? 'moderate' : 'budget')),
    preference: String(ctx.preferences?.dietaryRestrictions?.[0] || game.dietPreference || 'no-preference'),
    allergies: Array.isArray(ctx.preferences?.allergies) ? (ctx.preferences.allergies as unknown[]).map(String) : [],
  };
}
