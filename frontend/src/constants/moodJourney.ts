// Content + data model for the "Tonight's Story" mood journey game.
// Replaces the old character-match trait quiz: 3 short scenes of feeling-based
// choices (no food shown) accumulate scores on 5 hidden axes, which resolve to
// one of 6 named food "moods" (clusters) at the reveal.

export type AxisKey =
  | "cozyAdventurous" // cozy (-) <-> adventurous (+)
  | "soloSocial" // solo (-) <-> social (+)
  | "comfortEnergy" // comfort/slow (-) <-> energetic (+)
  | "nostalgicNovelty" // nostalgic (-) <-> novelty (+)
  | "indulgentLight"; // indulgent (-) <-> light (+)

export const AXIS_KEYS: AxisKey[] = [
  "cozyAdventurous",
  "soloSocial",
  "comfortEnergy",
  "nostalgicNovelty",
  "indulgentLight",
];

export type AxisVector = Record<AxisKey, number>;

export function zeroAxisVector(): AxisVector {
  return {
    cozyAdventurous: 0,
    soloSocial: 0,
    comfortEnergy: 0,
    nostalgicNovelty: 0,
    indulgentLight: 0,
  };
}

export interface JourneyOption {
  id: string;
  label: string;
  emoji: string;
  axisWeights: Partial<AxisVector>;
  /** Only set on the twist scene — used as a tie-break hint at reveal time. */
  clusterHint?: string;
}

export interface OpeningScene {
  id: string;
  /** Which situational contexts this scene is shown for (time of day / weather). */
  contextTag: "evening" | "rainy" | "post_work" | "weekend";
  prompt: string;
  subtitle: string;
  options: JourneyOption[];
  /** Option ids drawn from SCENE2_OPTION_BANK, in display order. */
  scene2OptionIds: string[];
}

export const SCENE2_PROMPT = "Scene 2: ";
export const SCENE2_TEXT =
  "You notice you're actually hungry — not urgent, just present. What sounds right?";

// Shared pool of scene-2 options — opening scenes reference a subset of these,
// so new opening scenes can be added without writing new scene-2 content.
export const SCENE2_OPTION_BANK: Record<string, JourneyOption> = {
  eat_slowly_hands: {
    id: "eat_slowly_hands",
    label: "Something you could eat slowly, with your hands",
    emoji: "🥟",
    axisWeights: { cozyAdventurous: -2, comfortEnergy: -1 },
  },
  made_for_you: {
    id: "made_for_you",
    label: "Something that used to be made for you, not by you",
    emoji: "🍲",
    axisWeights: { nostalgicNovelty: -2, comfortEnergy: -1 },
  },
  never_tried: {
    id: "never_tried",
    label: "Something you've never tried before",
    emoji: "✨",
    axisWeights: { cozyAdventurous: 2, nostalgicNovelty: 1 },
  },
  share_it: {
    id: "share_it",
    label: "Something you'd want to share with someone",
    emoji: "🍽️",
    axisWeights: { soloSocial: 2, indulgentLight: -1 },
  },
  something_light: {
    id: "something_light",
    label: "Something light that won't slow you down",
    emoji: "🥗",
    axisWeights: { indulgentLight: 2, comfortEnergy: 1 },
  },
  big_reward: {
    id: "big_reward",
    label: "Something that feels like a reward for the day you had",
    emoji: "🎉",
    axisWeights: { indulgentLight: -2, soloSocial: 1 },
  },
};

export const OPENING_SCENES: OpeningScene[] = [
  {
    id: "quiet_evening",
    contextTag: "evening",
    prompt:
      "It's just past 9pm. The group chat's been quiet for an hour. You're on the couch, phone in hand, not really looking at anything.",
    subtitle: "What do you do?",
    options: [
      {
        id: "one_lamp",
        label: "Turn on one lamp, leave the rest of the room dark",
        emoji: "🕯️",
        axisWeights: { cozyAdventurous: -2, soloSocial: -1 },
      },
      {
        id: "text_someone",
        label: 'Text someone "you up?"',
        emoji: "📱",
        axisWeights: { soloSocial: 2, nostalgicNovelty: -1 },
      },
      {
        id: "headphones_in",
        label: "Put headphones in, no particular song",
        emoji: "🎧",
        axisWeights: { cozyAdventurous: 1, soloSocial: -1 },
      },
    ],
    scene2OptionIds: ["eat_slowly_hands", "made_for_you", "never_tried"],
  },
  {
    id: "rainy_day",
    contextTag: "rainy",
    prompt:
      "Rain's been coming down since morning. Everything outside looks blurred through the window. You've got nowhere to be.",
    subtitle: "What do you do?",
    options: [
      {
        id: "watch_rain",
        label: "Sit by the window and watch it",
        emoji: "🌧️",
        axisWeights: { cozyAdventurous: -2, comfortEnergy: -1 },
      },
      {
        id: "call_someone",
        label: "Call someone just to hear a voice",
        emoji: "☎️",
        axisWeights: { soloSocial: 2, nostalgicNovelty: -1 },
      },
      {
        id: "reorganize",
        label: "Reorganize something that didn't need it",
        emoji: "📦",
        axisWeights: { comfortEnergy: 1, cozyAdventurous: -1 },
      },
    ],
    scene2OptionIds: ["made_for_you", "eat_slowly_hands", "something_light"],
  },
  {
    id: "post_work",
    contextTag: "post_work",
    prompt:
      "You just closed the laptop. The day took more out of you than it should have. Your shoulders are still up near your ears.",
    subtitle: "What do you do?",
    options: [
      {
        id: "hot_shower",
        label: "Stand under a hot shower longer than needed",
        emoji: "🚿",
        axisWeights: { comfortEnergy: -2, indulgentLight: -1 },
      },
      {
        id: "vent_to_friend",
        label: "Vent to whoever picks up first",
        emoji: "💬",
        axisWeights: { soloSocial: 2, comfortEnergy: -1 },
      },
      {
        id: "walk_it_off",
        label: "Go for a walk, no destination",
        emoji: "🚶",
        axisWeights: { comfortEnergy: 2, cozyAdventurous: 1 },
      },
    ],
    scene2OptionIds: ["big_reward", "something_light", "never_tried"],
  },
  {
    id: "weekend_morning",
    contextTag: "weekend",
    prompt:
      "No alarm went off. Sun's already up. For once, there's nothing you have to do in the next few hours.",
    subtitle: "What do you do?",
    options: [
      {
        id: "stay_in_bed",
        label: "Stay in bed scrolling, in no rush",
        emoji: "🛏️",
        axisWeights: { cozyAdventurous: -1, comfortEnergy: -2 },
      },
      {
        id: "call_the_crew",
        label: "Message the group to make a plan",
        emoji: "👯",
        axisWeights: { soloSocial: 2, cozyAdventurous: 1 },
      },
      {
        id: "go_exploring",
        label: "Get up and go somewhere you haven't been",
        emoji: "🗺️",
        axisWeights: { cozyAdventurous: 2, nostalgicNovelty: 2 },
      },
    ],
    scene2OptionIds: ["share_it", "something_light", "never_tried"],
  },
];

// ── Twist scene (the emotional-payoff beat, and the tie-break input) ──
export const TWIST_PROMPT = "One more thing, before it's decided.";
export const TWIST_SUBTITLE =
  "You think of somewhere else — a kitchen that wasn't yours, or a place you've never been. Either way, something's about to feel familiar.";

export const TWIST_OPTIONS: JourneyOption[] = [
  {
    id: "keep_it_familiar",
    label: "Let it be exactly how you remember it",
    emoji: "🫶",
    axisWeights: { nostalgicNovelty: -2, cozyAdventurous: -1 },
    clusterHint: "rewind",
  },
  {
    id: "make_it_yours",
    label: "Let it be almost like that — but yours",
    emoji: "🌀",
    axisWeights: { nostalgicNovelty: 2, cozyAdventurous: 1 },
    clusterHint: "spark",
  },
];

// ── Clusters ──
export interface MoodCluster {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  /** Target sign per axis: -1, 0, or +1. Used for dot-product scoring. */
  signature: Partial<AxisVector>;
  sampleDish: string;
  revealHeadline: string;
  revealBody: string;
  /** Backward-compat with the QuizResults{mood,craving,budget,preference} contract. */
  moodLabel: string;
  cravingLabel: string;
  budgetHint: "budget" | "moderate" | "splurge";
}

export const CLUSTERS: MoodCluster[] = [
  {
    id: "exhale",
    name: "The Exhale",
    emoji: "🌙",
    tagline: "Slow, warm, no effort required.",
    signature: { cozyAdventurous: -1, comfortEnergy: -1, soloSocial: -0.5 },
    sampleDish: "Khichdi",
    revealHeadline: "You needed to exhale.",
    revealBody:
      "Nothing sharp, nothing loud — just something warm that asks nothing of you. Slow-cooked, soft, the kind of bowl you'd curl up with.",
    moodLabel: "calm",
    cravingLabel: "comfort",
    budgetHint: "moderate",
  },
  {
    id: "rewind",
    name: "The Rewind",
    emoji: "🕰️",
    tagline: "Something that used to be made for you.",
    signature: { nostalgicNovelty: -1, comfortEnergy: -1 },
    sampleDish: "Dal-Chawal, your way",
    revealHeadline: "Not the one someone else makes. The one you'd make, remembering.",
    revealBody:
      "You didn't ask for the recipe. You just remember how it felt. Close enough to the original to mean something, different enough to be yours tonight.",
    moodLabel: "nostalgic",
    cravingLabel: "comfort",
    budgetHint: "moderate",
  },
  {
    id: "spark",
    name: "The Spark",
    emoji: "⚡",
    tagline: "Something you've never tried before.",
    signature: { cozyAdventurous: 1, nostalgicNovelty: 1 },
    sampleDish: "Fusion momos, new chutney",
    revealHeadline: "You're not repeating tonight. You're discovering it.",
    revealBody:
      "Bold, a little unfamiliar, worth the risk. This is the plate that makes tonight different from the last ten.",
    moodLabel: "adventurous",
    cravingLabel: "novelty",
    budgetHint: "moderate",
  },
  {
    id: "fuel",
    name: "The Fuel",
    emoji: "🔋",
    tagline: "Something that won't slow you down.",
    signature: { comfortEnergy: 1, indulgentLight: 1 },
    sampleDish: "Grilled paneer power bowl",
    revealHeadline: "You're still moving. This just keeps you going.",
    revealBody:
      "Clean, efficient, satisfying without the crash. Not a treat — fuel for whatever's still ahead of you tonight.",
    moodLabel: "energetic",
    cravingLabel: "light",
    budgetHint: "budget",
  },
  {
    id: "gathering",
    name: "The Gathering",
    emoji: "🎉",
    tagline: "Something worth sharing.",
    signature: { soloSocial: 1, indulgentLight: -0.5 },
    sampleDish: "Sizzling family thali",
    revealHeadline: "This one's better split across a table.",
    revealBody:
      "Loud, generous, made for passing plates around. Whatever you order, order enough for the people you're with.",
    moodLabel: "happy",
    cravingLabel: "indulgent",
    budgetHint: "splurge",
  },
  {
    id: "treat",
    name: "The Treat",
    emoji: "🍮",
    tagline: "Just for you, no reason needed.",
    signature: { indulgentLight: -1, comfortEnergy: -0.5, soloSocial: -0.5 },
    sampleDish: "Warm gulab jamun",
    revealHeadline: "You earned this one. No further explanation needed.",
    revealBody:
      "Rich, a little indulgent, entirely for you. Not because of anything — just because today happened and you're still here.",
    moodLabel: "happy",
    cravingLabel: "indulgent",
    budgetHint: "splurge",
  },
];

export const CLUSTERS_BY_ID: Record<string, MoodCluster> = Object.fromEntries(
  CLUSTERS.map((c) => [c.id, c]),
);
