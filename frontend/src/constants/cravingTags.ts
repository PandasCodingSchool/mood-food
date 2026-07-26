export interface CravingTag {
  id: string;
  label: string;
  emoji: string;
}

// Sensation-level tags — texture/temperature/richness predict better than
// cuisine labels ("crunchy and warm" routes better than "Thai").
export const CRAVING_TAGS: CravingTag[] = [
  { id: "crunchy", label: "Crunchy", emoji: "🥨" },
  { id: "melty", label: "Melty", emoji: "🧀" },
  { id: "spicy", label: "Spicy", emoji: "🌶️" },
  { id: "brothy", label: "Brothy", emoji: "🍲" },
  { id: "fresh", label: "Fresh", emoji: "🥒" },
  { id: "cheesy", label: "Cheesy", emoji: "🍕" },
  { id: "crispy", label: "Crispy", emoji: "🍗" },
  { id: "creamy", label: "Creamy", emoji: "🍜" },
  { id: "sweet", label: "Sweet", emoji: "🍰" },
  { id: "tangy", label: "Tangy", emoji: "🍋" },
  { id: "smoky", label: "Smoky", emoji: "🔥" },
  { id: "juicy", label: "Juicy", emoji: "🍑" },
];
