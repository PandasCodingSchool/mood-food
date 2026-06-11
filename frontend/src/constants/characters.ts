// Character roster + question bank for the Character Match game.
// Each character maps to standard QuizResults fields (mood, craving, budget, preference)
// so the recommendation API contract stays untouched.

export type TraitKey =
  | "energy" // chill (low) ↔ hyped (high)
  | "social" // alone (low) ↔ party (high)
  | "adventure" // routine (low) ↔ explore (high)
  | "indulgence" // healthy (low) ↔ treat (high)
  | "spice" // mild (low) ↔ fiery (high)
  | "budget"; // thrifty (low) ↔ premium (high)

export type TraitVector = Record<TraitKey, number>;

export interface CharacterProfile {
  id: string;
  name: string;
  show: string;
  emoji: string;
  tagline: string;
  vibe: string;
  // Visuals
  imageUrl: string; // avatar URL (DiceBear)
  gradient: string; // tailwind gradient classes
  accentColor: string; // tailwind text/bg accent
  signatureFood: string; // e.g. "Pizza", "Pav Bhaji"
  characterDishes: string[]; // 12-15 dishes this character loves
  // Pre-baked mapping to QuizResults
  mood: string;
  craving: string;
  budget: string;
  preference: string;
  traits: TraitVector;
}

export interface CharacterQuestionOption {
  id: string;
  label: string;
  emoji: string;
  traitWeights: Partial<TraitVector>;
  next?: string; // question ID to show next (omit on final question)
}

export interface CharacterQuestion {
  id: string;
  prompt: string;
  subtitle?: string;
  options: CharacterQuestionOption[];
}

// ─────────────────────────────────────────────────────────
// Characters
// ─────────────────────────────────────────────────────────
export const CHARACTERS: CharacterProfile[] = [
  // ── Sitcoms ──
  {
    id: "joey",
    name: "Joey Tribbiani",
    show: "Friends",
    emoji: "🍕",
    tagline: "How you doin'?",
    vibe: "Lover of food, all food, and definitely not sharing.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Joey&backgroundColor=ffd5dc,ffdfbf&hairColor=2c1b18&facialHairType=BeardLight",
    gradient: "from-yellow-400 via-orange-500 to-red-500",
    accentColor: "orange",
    signatureFood: "Pizza & meatball subs",
    characterDishes: [
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
    mood: "happy",
    craving: "comfort",
    budget: "moderate",
    preference: "non-veg",
    traits: {
      energy: 6,
      social: 7,
      adventure: 5,
      indulgence: 9,
      spice: 5,
      budget: 4,
    },
  },
  {
    id: "chandler",
    name: "Chandler Bing",
    show: "Friends",
    emoji: "🥪",
    tagline: "Could this BE any more delicious?",
    vibe: "Sarcastic snacker. Late-night munchies, comfort first.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Chandler&backgroundColor=c0e8ff,d4f1f4&hairColor=4a312c",
    gradient: "from-blue-400 via-indigo-500 to-purple-600",
    accentColor: "blue",
    signatureFood: "Late-night sandwiches",
    characterDishes: [
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
    mood: "stressed",
    craving: "comfort",
    budget: "moderate",
    preference: "both",
    traits: {
      energy: 4,
      social: 5,
      adventure: 3,
      indulgence: 7,
      spice: 3,
      budget: 4,
    },
  },
  {
    id: "michael",
    name: "Michael Scott",
    show: "The Office",
    emoji: "🎉",
    tagline: "I declare... dinner!",
    vibe: "Childlike, fun, and ready to celebrate with party food.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=MichaelScott&backgroundColor=ffe4b5,fff0d4&hairColor=2c1b18&topType=ShortHairShortFlat",
    gradient: "from-green-400 via-teal-500 to-cyan-600",
    accentColor: "green",
    signatureFood: "Office party platter",
    characterDishes: [
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
    mood: "celebrating",
    craving: "indulgent",
    budget: "moderate",
    preference: "non-veg",
    traits: {
      energy: 8,
      social: 9,
      adventure: 6,
      indulgence: 8,
      spice: 4,
      budget: 5,
    },
  },
  {
    id: "ted",
    name: "Ted Mosby",
    show: "HIMYM",
    emoji: "🍷",
    tagline: "Kids, let me tell you about this dinner...",
    vibe: "Romantic, thoughtful, classic dinner kind of guy.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Ted&backgroundColor=e0c9a6,f0e0c0&hairColor=4a312c&topType=ShortHairTheCaesar",
    gradient: "from-amber-400 via-rose-400 to-red-500",
    accentColor: "rose",
    signatureFood: "Italian fine dining",
    characterDishes: [
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
    mood: "relaxed",
    craving: "classic",
    budget: "premium",
    preference: "both",
    traits: {
      energy: 5,
      social: 6,
      adventure: 5,
      indulgence: 6,
      spice: 3,
      budget: 7,
    },
  },
  {
    id: "barney",
    name: "Barney Stinson",
    show: "HIMYM",
    emoji: "🥃",
    tagline: "Suit up. Dinner is LEGEN... dary.",
    vibe: "Bold, premium, suit-up energy. Go big or stay hungry.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Barney&backgroundColor=2c3e50,34495e&hairColor=ffd700&clotheType=BlazerShirt",
    gradient: "from-slate-700 via-slate-900 to-black",
    accentColor: "slate",
    signatureFood: "Premium steakhouse",
    characterDishes: [
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
    mood: "celebrating",
    craving: "premium",
    budget: "premium",
    preference: "non-veg",
    traits: {
      energy: 9,
      social: 9,
      adventure: 7,
      indulgence: 8,
      spice: 5,
      budget: 9,
    },
  },

  // ── Bollywood / Indian ──
  {
    id: "geet",
    name: "Geet",
    show: "Jab We Met",
    emoji: "🌶️",
    tagline: "Main apni favourite hoon!",
    vibe: "Bubbly, adventurous, street-food chaser with full masala energy.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Geet&backgroundColor=ffb6c1,ffc0cb&hairColor=2c1b18&topType=LongHairStraight&accessoriesType=Round",
    gradient: "from-pink-500 via-rose-500 to-orange-500",
    accentColor: "pink",
    signatureFood: "Chole bhature & golgappa",
    characterDishes: [
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
    mood: "adventurous",
    craving: "spicy",
    budget: "low",
    preference: "veg",
    traits: {
      energy: 9,
      social: 8,
      adventure: 9,
      indulgence: 6,
      spice: 9,
      budget: 2,
    },
  },
  {
    id: "munna",
    name: "Munna Bhai",
    show: "Munna Bhai M.B.B.S.",
    emoji: "🍛",
    tagline: "Mamu, ek thali laga de full!",
    vibe: "Warm, hearty, big-brother energy. Home-style food, no shortcuts.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Munna&backgroundColor=ffe4b5,deb887&hairColor=2c1b18&facialHairType=MoustacheFancy&topType=ShortHairShortRound",
    gradient: "from-orange-500 via-red-500 to-pink-600",
    accentColor: "orange",
    signatureFood: "Pav bhaji & dal khichdi",
    characterDishes: [
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
    mood: "happy",
    craving: "comfort",
    budget: "moderate",
    preference: "veg",
    traits: {
      energy: 6,
      social: 8,
      adventure: 3,
      indulgence: 7,
      spice: 6,
      budget: 4,
    },
  },
  {
    id: "rancho",
    name: "Rancho",
    show: "3 Idiots",
    emoji: "🥗",
    tagline: "All izz well. And all izz healthy.",
    vibe: "Curious, smart, and surprisingly health-conscious.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Rancho&backgroundColor=98fb98,90ee90&hairColor=2c1b18&topType=ShortHairShortWaved",
    gradient: "from-emerald-400 via-teal-500 to-blue-500",
    accentColor: "emerald",
    signatureFood: "Sprouts salad & smoothie",
    characterDishes: [
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
    mood: "relaxed",
    craving: "healthy",
    budget: "moderate",
    preference: "veg",
    traits: {
      energy: 5,
      social: 5,
      adventure: 7,
      indulgence: 2,
      spice: 4,
      budget: 5,
    },
  },
  {
    id: "kabir",
    name: "Kabir Singh",
    show: "Kabir Singh",
    emoji: "🔥",
    tagline: "Sirf ek hi cheez chahiye. Full flavour.",
    vibe: "Intense, no-nonsense, rich and fiery flavors only.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Kabir&backgroundColor=2c1b18,4a312c&hairColor=000000&facialHairType=BeardMedium&topType=ShortHairShaggyMullet",
    gradient: "from-red-700 via-red-900 to-black",
    accentColor: "red",
    signatureFood: "Andhra spicy biryani",
    characterDishes: [
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
    mood: "stressed",
    craving: "spicy",
    budget: "premium",
    preference: "non-veg",
    traits: {
      energy: 7,
      social: 3,
      adventure: 6,
      indulgence: 8,
      spice: 10,
      budget: 8,
    },
  },
  {
    id: "bunny",
    name: "Bunny",
    show: "Yeh Jawaani Hai Deewani",
    emoji: "🌍",
    tagline: "Main udna chahta hoon... aur khaana chahta hoon.",
    vibe: "Wanderlust foodie. Bring on global flavors and new finds.",
    imageUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Bunny&backgroundColor=87ceeb,b0e0e6&hairColor=2c1b18&topType=ShortHairFrizzle&accessoriesType=Sunglasses",
    gradient: "from-cyan-400 via-blue-500 to-indigo-600",
    accentColor: "cyan",
    signatureFood: "Sushi & global tapas",
    characterDishes: [
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
    mood: "adventurous",
    craving: "global",
    budget: "moderate",
    preference: "both",
    traits: {
      energy: 8,
      social: 7,
      adventure: 10,
      indulgence: 6,
      spice: 6,
      budget: 6,
    },
  },
];

// ─────────────────────────────────────────────────────────
// Branching question bank — each option's `next` field decides
// which question comes up next. Users always answer exactly 4
// questions but the path depends on every previous answer.
//
// Tree structure (10 nodes, 4 per path):
//   q1_night → q2_solo | q2_social | q2_adventure | q2_romance
//   q2_solo      → q3_calm | q3_edge
//   q2_social    → q3_edge | q3_global
//   q2_adventure → q3_edge | q3_global
//   q2_romance   → q3_calm | q3_global
//   q3_calm   → q4_quiet   (final, no next)
//   q3_edge   → q4_bold    (final, no next)
//   q3_global → q4_wander  (final, no next)
// ─────────────────────────────────────────────────────────
export const CHARACTER_QUESTION_BANK: Record<string, CharacterQuestion> = {
  // ── LEVEL 1 — same for everyone ──────────────────────────
  q1_night: {
    id: "q1_night",
    prompt: "It's Saturday night. Your move?",
    subtitle: "Pick what sounds most like you right now",
    options: [
      {
        id: "couch",
        label: "Couch + comfort food",
        emoji: "🛋️",
        traitWeights: { energy: -2, social: -2, indulgence: 2 },
        next: "q2_solo",
      },
      {
        id: "party",
        label: "Out with the squad",
        emoji: "🎉",
        traitWeights: { energy: 3, social: 3, indulgence: 1 },
        next: "q2_social",
      },
      {
        id: "explore",
        label: "Try a new place in town",
        emoji: "🗺️",
        traitWeights: { adventure: 3, energy: 1, budget: 1 },
        next: "q2_adventure",
      },
      {
        id: "date",
        label: "Cozy dinner with someone",
        emoji: "🕯️",
        traitWeights: { social: 1, budget: 2, indulgence: 1 },
        next: "q2_romance",
      },
    ],
  },

  // ── LEVEL 2 — one unique question per Q1 answer ──────────
  q2_solo: {
    id: "q2_solo",
    prompt: "The couch is yours. Pick your companion for tonight.",
    options: [
      {
        id: "binge_show",
        label: "Guilty-pleasure reality show",
        emoji: "📺",
        traitWeights: { energy: -1, indulgence: 2 },
        next: "q3_calm",
      },
      {
        id: "spicy_noodles",
        label: "Something spicy to really feel alive",
        emoji: "🔥",
        traitWeights: { spice: 3, energy: 1 },
        next: "q3_edge",
      },
      {
        id: "good_book",
        label: "A good book or podcast",
        emoji: "📚",
        traitWeights: { energy: -2, adventure: 1 },
        next: "q3_calm",
      },
      {
        id: "doom_scroll",
        label: "Food delivery + doom-scroll",
        emoji: "📱",
        traitWeights: { energy: -1, indulgence: 1 },
        next: "q3_calm",
      },
    ],
  },

  q2_social: {
    id: "q2_social",
    prompt: "You're with the squad. First order of business?",
    options: [
      {
        id: "snack_table",
        label: "Hunt the snack spread — immediately",
        emoji: "🍕",
        traitWeights: { indulgence: 3, social: 1 },
        next: "q3_edge",
      },
      {
        id: "music_on",
        label: "Put on music, get everyone going",
        emoji: "🎵",
        traitWeights: { energy: 3, social: 2 },
        next: "q3_edge",
      },
      {
        id: "new_spot",
        label: "Suggest somewhere none of you have tried",
        emoji: "🌍",
        traitWeights: { adventure: 3, social: 1 },
        next: "q3_global",
      },
      {
        id: "just_vibe",
        label: "Just vibe, catch up, go wherever",
        emoji: "😊",
        traitWeights: { energy: -1, social: 2 },
        next: "q3_calm",
      },
    ],
  },

  q2_adventure: {
    id: "q2_adventure",
    prompt: "You found the hidden gem. No menu — chef decides. You feel...",
    options: [
      {
        id: "love_it",
        label: "Excited — I literally live for this",
        emoji: "✨",
        traitWeights: { adventure: 4, energy: 2 },
        next: "q3_global",
      },
      {
        id: "cautious",
        label: "Cautiously curious — let's see the vibe",
        emoji: "👀",
        traitWeights: { adventure: 1, indulgence: 1 },
        next: "q3_edge",
      },
      {
        id: "googling",
        label: "Fine, but I'm secretly Googling it",
        emoji: "📱",
        traitWeights: { adventure: -1, energy: -1 },
        next: "q3_calm",
      },
      {
        id: "atmosphere",
        label: "Love the atmosphere — food is secondary",
        emoji: "🕯️",
        traitWeights: { social: 2, budget: 2 },
        next: "q3_global",
      },
    ],
  },

  q2_romance: {
    id: "q2_romance",
    prompt: "You're choosing the dinner spot. You pick...",
    options: [
      {
        id: "italian_candlelit",
        label: "Classic Italian, candlelit, proper",
        emoji: "🍷",
        traitWeights: { budget: 3, social: 1 },
        next: "q3_calm",
      },
      {
        id: "street_food_walk",
        label: "Street food walk — casual and honest",
        emoji: "🌮",
        traitWeights: { adventure: 2, indulgence: 1 },
        next: "q3_global",
      },
      {
        id: "healthy_spot",
        label: "Somewhere healthy but impressive",
        emoji: "🥗",
        traitWeights: { indulgence: -2, budget: 2 },
        next: "q3_calm",
      },
      {
        id: "cook_myself",
        label: "I'm cooking. More personal that way.",
        emoji: "🍳",
        traitWeights: { social: 1, indulgence: 2 },
        next: "q3_calm",
      },
    ],
  },

  // ── LEVEL 3 — three variants, reached from Q2 ────────────
  q3_calm: {
    id: "q3_calm",
    prompt: "Honestly, your perfect meal is...",
    subtitle: "No judgment — what actually sounds good",
    options: [
      {
        id: "desi_home",
        label: "Dal-rice, sabzi, roti — the works",
        emoji: "🍛",
        traitWeights: { indulgence: 1, social: 1 },
        next: "q4_quiet",
      },
      {
        id: "comfort_pasta",
        label: "A big bowl of pasta or biryani",
        emoji: "🍝",
        traitWeights: { indulgence: 2, energy: 1 },
        next: "q4_quiet",
      },
      {
        id: "light_fresh",
        label: "Something light — dosa, salad, smoothie",
        emoji: "🥗",
        traitWeights: { indulgence: -2, energy: 1 },
        next: "q4_quiet",
      },
      {
        id: "premium_quiet",
        label: "Steak or a fine-dining main",
        emoji: "🥩",
        traitWeights: { budget: 3, indulgence: 2 },
        next: "q4_quiet",
      },
    ],
  },

  q3_edge: {
    id: "q3_edge",
    prompt: "You need to eat right now. What do you grab?",
    options: [
      {
        id: "pizza_wings",
        label: "Pizza, wings, something messy",
        emoji: "🍕",
        traitWeights: { indulgence: 3, social: 1 },
        next: "q4_bold",
      },
      {
        id: "street_fiery",
        label: "Street food — the spicier the better",
        emoji: "🌶️",
        traitWeights: { spice: 3, adventure: 2 },
        next: "q4_bold",
      },
      {
        id: "bbq_ribs",
        label: "BBQ, ribs, something you eat with hands",
        emoji: "🍖",
        traitWeights: { indulgence: 2, social: 2 },
        next: "q4_bold",
      },
      {
        id: "late_snack",
        label: "Cheesecake, donuts — straight dessert",
        emoji: "🍩",
        traitWeights: { indulgence: 2, energy: -1 },
        next: "q4_bold",
      },
    ],
  },

  q3_global: {
    id: "q3_global",
    prompt: "You're ordering from a menu with 10 world cuisines. You go for...",
    options: [
      {
        id: "sushi_ramen",
        label: "Sushi, ramen, or dim sum",
        emoji: "🍱",
        traitWeights: { adventure: 3, budget: 2 },
        next: "q4_wander",
      },
      {
        id: "pho_banh",
        label: "Pho, banh mi, or something Vietnamese",
        emoji: "🍜",
        traitWeights: { adventure: 3, energy: 1 },
        next: "q4_wander",
      },
      {
        id: "paella_tapas",
        label: "Paella, tapas, or mezze",
        emoji: "🥘",
        traitWeights: { adventure: 2, social: 2 },
        next: "q4_wander",
      },
      {
        id: "thai_curry",
        label: "Thai curry or pad thai",
        emoji: "🌿",
        traitWeights: { spice: 2, adventure: 2 },
        next: "q4_wander",
      },
    ],
  },

  // ── LEVEL 4 — three final questions, no `next` ────────────
  q4_quiet: {
    id: "q4_quiet",
    prompt: "One line that's very you tonight?",
    options: [
      {
        id: "chandler_real",
        label: '"Could this BE any more comforting?"',
        emoji: "🥪",
        traitWeights: { indulgence: 2, energy: -1 },
      },
      {
        id: "rancho_real",
        label: '"All izz well — and all izz light."',
        emoji: "🌱",
        traitWeights: { indulgence: -2, adventure: 1 },
      },
      {
        id: "ted_real",
        label: '"Kids, I have a story about this dinner."',
        emoji: "🍷",
        traitWeights: { budget: 2, social: 1 },
      },
      {
        id: "munna_real",
        label: '"Mamu, ek thali laga de full!"',
        emoji: "🍛",
        traitWeights: { social: 1, indulgence: 1 },
      },
    ],
  },

  q4_bold: {
    id: "q4_bold",
    prompt: "Last question — one line that's you tonight?",
    options: [
      {
        id: "joey_real",
        label: '"Food is my love language."',
        emoji: "🍕",
        traitWeights: { indulgence: 3, social: 1 },
      },
      {
        id: "michael_real",
        label: '"I declared it a party. That\'s why."',
        emoji: "🎉",
        traitWeights: { energy: 2, social: 3 },
      },
      {
        id: "kabir_real",
        label: '"Sirf full flavour. Kuch compromise nahi."',
        emoji: "🔥",
        traitWeights: { spice: 3, indulgence: 2 },
      },
      {
        id: "geet_real",
        label: '"Main apni favourite hoon!"',
        emoji: "💃",
        traitWeights: { energy: 2, adventure: 2 },
      },
    ],
  },

  q4_wander: {
    id: "q4_wander",
    prompt: "One line that captures tonight's energy?",
    options: [
      {
        id: "bunny_real",
        label: '"Main udna chahta hoon — new city, new food."',
        emoji: "🌍",
        traitWeights: { adventure: 4, energy: 2 },
      },
      {
        id: "barney_real",
        label: '"Suit up. Dinner is LEGEN... wait for it."',
        emoji: "🥃",
        traitWeights: { budget: 3, social: 2 },
      },
      {
        id: "geet_wander",
        label: '"Chalo — wherever is fine, as long as it\'s spicy."',
        emoji: "🌶️",
        traitWeights: { spice: 2, adventure: 3 },
      },
      {
        id: "ted_wander",
        label: '"I researched the best spot in town."',
        emoji: "📖",
        traitWeights: { budget: 2, adventure: 1 },
      },
    ],
  },
};

export const FIRST_QUESTION_ID = "q1_night";
export const TOTAL_QUESTIONS = 4;

// Keep CHARACTER_QUESTIONS as a flat list for backwards-compat with characterEngine fallback
export const CHARACTER_QUESTIONS = Object.values(CHARACTER_QUESTION_BANK);
