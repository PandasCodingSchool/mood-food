import { useState } from "react";
import { logSignal } from "../services/signals";

const TRIGGERS = [
  { id: "sick", label: "When sick", emoji: "🤒" },
  { id: "celebration", label: "Celebrating", emoji: "🎉" },
  { id: "sad", label: "Feeling low", emoji: "😔" },
  { id: "homesick", label: "Homesick", emoji: "🏠" },
];

interface NostalgiaPromptProps {
  onDismiss: () => void;
}

// 1.3 — Nostalgia / comfort food map. A periodic single-question card
// (~1/week), warmly framed.
function NostalgiaPrompt({ onDismiss }: NostalgiaPromptProps) {
  const [trigger, setTrigger] = useState<string | null>(null);
  const [food, setFood] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!food.trim() || !trigger) return;
    logSignal("nostalgia", { food: food.trim(), trigger });
    setSubmitted(true);
    setTimeout(onDismiss, 1400);
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto mt-4 p-4 rounded-2xl bg-purple-50 text-center text-sm font-bold text-purple-600">
        Saved — we'll remember that 💜
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-4 p-4 rounded-2xl bg-white border-2 border-purple-100">
      <div className="flex items-center justify-between">
        <p className="font-extrabold text-sm text-gray-900">
          What did you eat as a kid when sick? 🍲
        </p>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {TRIGGERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTrigger(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full border-2 text-xs font-bold ${
              trigger === t.id ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-gray-100 text-gray-700"
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>
      <input
        value={food}
        onChange={(e) => setFood(e.target.value)}
        placeholder="e.g. Mom's chicken soup"
        className="w-full mt-3 px-3 py-2.5 rounded-xl bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-purple-300"
      />
      <button
        onClick={handleSubmit}
        disabled={!food.trim() || !trigger}
        className="w-full mt-3 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-extrabold disabled:opacity-40"
      >
        Save this memory
      </button>
    </div>
  );
}

export default NostalgiaPrompt;
