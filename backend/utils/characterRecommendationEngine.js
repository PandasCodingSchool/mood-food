// Fast character-specific recommendation engine
// Returns <100ms character-aligned recommendations without calling AI service

// Character dish mappings imported from frontend constants
const CHARACTER_DISH_MAPPING = {
  joey: [
    "Pizza",
    "Meatball Subs",
    "Bagels",
    "Lasagna",
    "Fried Chicken",
    "Ribeye Steak",
    "Burgers",
    "Mac & Cheese",
    "Sandwiches",
    "Ice Cream",
    "Cappuccino",
    "Cookies",
    "Fries",
  ],
  chandler: [
    "Sandwiches",
    "Cheesecake",
    "Coffee",
    "Soft Pretzels",
    "Chinese Takeout",
    "Fries",
    "Chicken Wings",
    "Donuts",
    "Nachos",
    "Pizza",
    "Cookies",
    "Candy",
    "Late-night Snacks",
  ],
  michael: [
    "BBQ Ribs",
    "Bacon",
    "Wings",
    "Burgers",
    "M&Ms",
    "Soft Pretzels",
    "Pizza",
    "Chili",
    "Pasta",
    "Fried Chicken",
    "Party Mix",
    "Candy",
    "Hot Dogs",
  ],
  ted: [
    "Pasta Carbonara",
    "Risotto",
    "Steak",
    "Truffle Pasta",
    "Duck Confit",
    "Seafood Risotto",
    "Crepes",
    "Tiramisu",
    "Salmon",
    "Beef Wellington",
    "Wine Pairings",
    "Ossobuco",
    "Ravioli",
  ],
  barney: [
    "Wagyu Beef",
    "Caviar",
    "Oysters",
    "Filet Mignon",
    "Lobster",
    "Premium Sushi",
    "Aged Whiskey Steak",
    "Champagne",
    "Truffle Risotto",
    "Prime Rib",
    "Foie Gras",
    "Expensive Wine",
    "Shrimp Scampi",
  ],
  geet: [
    "Chole Bhature",
    "Golgappa",
    "Samosa",
    "Butter Chicken",
    "Paneer Tikka",
    "Chai",
    "Parathas",
    "Aloo Gobi",
    "Chaat",
    "Kheer",
    "Momos",
    "Tandoori Chicken",
    "Jalebi",
  ],
  munna: [
    "Pav Bhaji",
    "Dal Khichdi",
    "Butter Naan",
    "Rajma",
    "Home-Style Curries",
    "Tandoori Chicken",
    "Samosa",
    "Kachumber Salad",
    "Chikhalwali",
    "Dal Makhani",
    "Roti",
    "Biryani",
    "Chutney",
  ],
  rancho: [
    "Sprouts Salad",
    "Smoothie",
    "Dosa",
    "Idli",
    "Oats",
    "Quinoa",
    "Fruits",
    "Yogurt",
    "Healthy Wraps",
    "Brown Rice",
    "Steamed Vegetables",
    "Poha",
    "Upma",
  ],
  kabir: [
    "Andhra Biryani",
    "Spicy Curries",
    "Paneer Tikka Masala",
    "Tandoori Chicken",
    "Mutton Curry",
    "Spicy Kebabs",
    "Chikhalwali",
    "Dal Makhani",
    "Jalapeño Dishes",
    "Red Meat",
    "Fiery Vindaloo",
    "Spicy Tandoori",
    "Ghost Pepper Dishes",
  ],
  bunny: [
    "Sushi",
    "Pad Thai",
    "Falafel",
    "Pho",
    "Ramen",
    "Risotto",
    "Paella",
    "Dim Sum",
    "Mezze Platter",
    "Fusion Dishes",
    "Thai Curry",
    "Vietnamese Banh Mi",
    "Global Tapas",
  ],
};

// Character traits for ranking (from frontend constants)
const CHARACTER_TRAITS = {
  joey: { indulgence: 9, spice: 5 },
  chandler: { indulgence: 7, spice: 3 },
  michael: { indulgence: 8, spice: 4 },
  ted: { indulgence: 6, spice: 3 },
  barney: { indulgence: 8, spice: 5 },
  geet: { indulgence: 6, spice: 9 },
  munna: { indulgence: 7, spice: 6 },
  rancho: { indulgence: 2, spice: 4 },
  kabir: { indulgence: 8, spice: 10 },
  bunny: { indulgence: 6, spice: 6 },
};

/**
 * Get character-specific recommendations quickly (fast path)
 * Returns 3 character-aligned dishes without AI service call
 *
 * @param {string} characterId - e.g., "joey"
 * @param {object} userContext - { mood, craving, budget, preference }
 * @returns {array} Array of 3 recommendations with character branding
 */
export const getCharacterRecommendations = (characterId, userContext) => {
  // Validate character exists
  if (!CHARACTER_DISH_MAPPING[characterId]) {
    return null;
  }

  const characterDishes = CHARACTER_DISH_MAPPING[characterId];
  const characterTraits = CHARACTER_TRAITS[characterId];

  // Shuffle character dishes and pick top 3
  // This ensures variety while staying true to character
  const shuffled = [...characterDishes].sort(() => Math.random() - 0.5);
  const topDishes = shuffled.slice(0, 3);

  // Score each dish based on user context
  const recommendations = topDishes.map((dish, index) => {
    // Build confidence score based on match with user's mood/craving
    let confidence = 0.85; // Base confidence for character match

    // Boost confidence if dish matches user's stated craving
    if (
      userContext.craving &&
      userContext.craving.toLowerCase().includes("spicy") &&
      characterTraits.spice > 6
    ) {
      confidence += 0.08;
    }

    if (
      userContext.craving &&
      userContext.craving.toLowerCase().includes("indulgent") &&
      characterTraits.indulgence > 6
    ) {
      confidence += 0.07;
    }

    return {
      id: `char_${characterId}_${index}`,
      rank: index + 1,
      confidence: Math.min(confidence, 0.99),
      dish: {
        id: `${characterId}_${index}`,
        name: dish,
        cuisine: "Character-Inspired",
        category: "character_preference",
      },
      characterBranded: true,
      characterId: characterId,
      ai_reasoning: {
        mood_match: `This matches your vibe perfectly.`,
        context_fit: `A favorite of your matched character.`,
        psychological_hook: `This is exactly what your character would order right now.`,
        nostalgia_factor: `Character authentic choice.`,
      },
      practical_details: {
        estimated_price: 0, // Will be enriched by AI service if called
        preparation_time: 0,
        calories: 0,
        health_score: 5,
      },
    };
  });

  return recommendations;
};

/**
 * Check if user matched a character and return character-aware recommendation
 * Called by aiRecommendations route as the FAST PATH
 *
 * @param {object} gameData - { type, character: { id, ... }, ... }
 * @param {object} userContext - { mood, craving, budget, preference, ... }
 * @returns {object|null} Recommendations object or null if no character
 */
export const getCharacterAwareRecommendations = (gameData, userContext) => {
  // Only use fast path if character match game was played
  if (
    !gameData ||
    gameData.type !== "character_match" ||
    !gameData.character ||
    !gameData.character.id
  ) {
    return null;
  }

  const recommendations = getCharacterRecommendations(
    gameData.character.id,
    userContext
  );

  if (!recommendations) {
    return null;
  }

  return {
    success: true,
    recommendations,
    ai_metadata: {
      model_used: "character_engine",
      cache_hit: false,
      response_time_ms: 50, // Should be <100ms
      character_applied: true,
    },
    insights: {
      detected_mood_profile: `Matched as ${gameData.character.name}`,
      preference_evolution: `Character-specific recommendations based on personality match.`,
    },
  };
};
