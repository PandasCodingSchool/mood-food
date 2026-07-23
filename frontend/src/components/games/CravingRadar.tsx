import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import ChipSelector from "../inputs/ChipSelector";
import { CRAVING_TAGS } from "../../constants/cravingTags";
import { trackEvent } from "../../utils/analytics";
import { buildGameSignals } from "../../utils/gameSignals";
import { logSignal } from "../../services/signals";
import type { GameResult } from "../../types";

interface CravingRadarProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

// 2.2 — Craving radar: fast sensory-word selection. Overrides baseline taste
// for the session (acute craving beats long-term preference).
function CravingRadar({ onComplete, onBack }: CravingRadarProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleContinue = () => {
    logSignal("craving", { tags: selected });
    trackEvent("game_completed", { game: "craving_radar", tags: selected });
    onComplete({
      mood: "happy",
      craving: selected[0] || "comfort",
      budget: "moderate",
      preference: "both",
      gameData: buildGameSignals({ type: "craving_radar", cravingTags: selected, cravings: selected }),
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onBack}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">
          What's pulling you right now?
        </h2>
        <p className="text-gray-500 mb-8">
          Tap everything that fits — sensations, not cuisines.
        </p>

        <ChipSelector options={CRAVING_TAGS} selected={selected} onToggle={toggle} accent="#f97316" />

        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="w-full mt-10 py-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 text-white font-black text-lg shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:hover:scale-100"
        >
          🍽️ Match my cravings ({selected.length})
        </button>
      </div>
    </div>
  );
}

export default CravingRadar;
