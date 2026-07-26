import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import ChipSelector from "../inputs/ChipSelector";
import { PANTRY_ITEMS } from "../../constants/pantryItems";
import { trackEvent } from "../../utils/analytics";
import { logSignal } from "../../services/signals";
import { buildGameSignals } from "../../utils/gameSignals";
import type { GameResult } from "../../types";

interface PantryProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

// 2.3 — Fridge/pantry "cook vs. order" game. Text-chip ingredient input
// (photo + vision ingredient-detection is a documented future enhancement).
function Pantry({ onComplete, onBack }: PantryProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<"cook" | "order" | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleChoice = (chose: "cook" | "order") => {
    setChoice(chose);
    logSignal("pantry", { items: selected, chose });
    trackEvent("game_completed", { game: "pantry", chose, items: selected });
  };

  const handleGetResults = () => {
    onComplete({
      mood: "happy",
      craving: "comfort",
      budget: "moderate",
      preference: "both",
      gameData: buildGameSignals({ type: "quiz", pantryItems: selected }),
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onBack}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">What's in your kitchen?</h2>
        <p className="text-gray-500 mb-8">Tap what you've got — we'll help you decide cook or order.</p>

        <ChipSelector options={PANTRY_ITEMS} selected={selected} onToggle={toggle} accent="#16a34a" />

        {choice ? (
          <div className="mt-8 p-5 rounded-2xl bg-white border-2 border-green-200">
            <p className="font-extrabold text-gray-900">
              {choice === "cook" ? "👨‍🍳 Nice, cooking it is!" : "🛵 Order it is — good call."}
            </p>
            <button
              onClick={handleGetResults}
              className="w-full mt-4 py-3.5 rounded-full bg-gradient-to-r from-green-600 to-green-400 text-white font-black shadow-lg hover:scale-[1.02] transition-transform"
            >
              🍽️ Show me my matches
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              onClick={() => handleChoice("cook")}
              className="py-6 rounded-2xl bg-white border-2 border-gray-100 hover:border-green-300 transition-colors flex flex-col items-center gap-2"
            >
              <span className="text-3xl">👨‍🍳</span>
              <span className="font-extrabold text-sm text-gray-900">I'll cook</span>
            </button>
            <button
              onClick={() => handleChoice("order")}
              className="py-6 rounded-2xl bg-white border-2 border-gray-100 hover:border-green-300 transition-colors flex flex-col items-center gap-2"
            >
              <span className="text-3xl">🛵</span>
              <span className="font-extrabold text-sm text-gray-900">Order in</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Pantry;
