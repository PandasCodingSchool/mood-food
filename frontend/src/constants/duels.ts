export interface DuelCard {
  id: string;
  label: string;
  emoji: string;
  gradient: string; // tailwind gradient classes
}

export interface DuelRound {
  prompt: string;
  dimensionA: string;
  dimensionB: string;
  a: DuelCard;
  b: DuelCard;
}

// Each round probes one trade-off dimension: price, health, speed,
// adventure, comfort. Feeds Bradley-Terry weights per context bucket.
export const DUEL_ROUNDS: DuelRound[] = [
  {
    prompt: "Cheap & fast, or worth the wait?",
    dimensionA: "price",
    dimensionB: "comfort",
    a: { id: "cheap_fast", label: "Cheap & Fast", emoji: "⚡", gradient: "from-green-600 to-green-400" },
    b: { id: "worth_wait", label: "Worth the Wait", emoji: "⏳", gradient: "from-purple-600 to-purple-400" },
  },
  {
    prompt: "Healthy bowl, or indulgent comfort food?",
    dimensionA: "health",
    dimensionB: "comfort",
    a: { id: "healthy", label: "Healthy Bowl", emoji: "🥗", gradient: "from-emerald-600 to-emerald-400" },
    b: { id: "indulgent", label: "Comfort Food", emoji: "🍝", gradient: "from-red-600 to-orange-500" },
  },
  {
    prompt: "Familiar favorite, or something new?",
    dimensionA: "comfort",
    dimensionB: "adventure",
    a: { id: "familiar", label: "Old Favorite", emoji: "🍕", gradient: "from-orange-500 to-amber-400" },
    b: { id: "adventurous", label: "Something New", emoji: "🌶️", gradient: "from-pink-700 to-pink-500" },
  },
  {
    prompt: "Delivered in 15 min, or the good stuff in 45?",
    dimensionA: "speed",
    dimensionB: "price",
    a: { id: "fast", label: "15 Minutes", emoji: "🏍️", gradient: "from-cyan-600 to-cyan-400" },
    b: { id: "slow", label: "Worth the Wait", emoji: "👨‍🍳", gradient: "from-amber-800 to-amber-600" },
  },
  {
    prompt: "Splurge tonight, or keep it light on the wallet?",
    dimensionA: "comfort",
    dimensionB: "price",
    a: { id: "splurge", label: "Splurge", emoji: "🥂", gradient: "from-indigo-900 to-indigo-600" },
    b: { id: "budget", label: "Keep it Light", emoji: "💰", gradient: "from-green-800 to-green-500" },
  },
  {
    prompt: "Exotic cuisine, or a reliable classic?",
    dimensionA: "adventure",
    dimensionB: "comfort",
    a: { id: "exotic", label: "Exotic Pick", emoji: "🌏", gradient: "from-purple-700 to-purple-400" },
    b: { id: "classic", label: "Reliable Classic", emoji: "🍜", gradient: "from-amber-700 to-amber-500" },
  },
];
