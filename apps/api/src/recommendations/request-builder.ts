// Maps the app's camelCase recommendation request to the intelligence
// service's snake_case contract (FE-API-CONTRACT). Ported unchanged from v1.

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TIME_OF_DAY: Record<string, string> = {
  morning: 'breakfast',
  breakfast: 'breakfast',
  afternoon: 'lunch',
  lunch: 'lunch',
  evening: 'dinner',
  dinner: 'dinner',
  night: 'late_night',
  late_night: 'late_night',
};
export const mapTimeOfDay = (t: unknown) => TIME_OF_DAY[String(t).toLowerCase()] ?? 'dinner';

const nonEmpty = (o: Obj | undefined) => !!o && Object.keys(o).length > 0;
const list = (v: unknown) => (Array.isArray(v) && v.length ? v : null);

export function buildAiRequest(body: Obj, userId: string | undefined, requestId: string) {
  const ctx: Obj = body?.userContext ?? {};
  const game: Obj = ctx.gameData ?? {};
  const prefs: Obj = ctx.preferences ?? {};
  const sit: Obj = ctx.situational ?? {};
  const cfg: Obj = body?.recommendationConfig ?? {};
  const mood: Obj = ctx.mood ?? {};

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
    ...(nonEmpty(sit) && {
      situational: {
        ...(sit.timeOfDay && { time_of_day: mapTimeOfDay(sit.timeOfDay) }),
        ...(sit.dayOfWeek && { day_of_week: sit.dayOfWeek }),
        ...(sit.weather && { weather: sit.weather }),
        ...(sit.budget && { budget: { max: sit.budget.max, min: sit.budget.min, currency: sit.budget.currency } }),
        ...(sit.timeAvailable != null && { time_available: sit.timeAvailable }),
        ...(sit.deliveryPreferred != null && { delivery_preferred: sit.deliveryPreferred }),
        ...(sit.occasion && { occasion: sit.occasion }),
        ...(sit.hoursSinceLastMeal != null && { hours_since_last_meal: sit.hoursSinceLastMeal }),
      },
    }),
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
        ...(game.raw && { raw: game.raw }),
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
    preference: String(ctx.preferences?.dietaryRestrictions?.[0] || 'no-preference'),
  };
}
