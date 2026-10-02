import { useState } from "react";
import { logSignal } from "../services/signals";

interface BlindBetStarsProps {
  dishId?: string;
  dishName?: string;
}

// 2.4 — Blind taste bet: predict your own rating before eating. Graded
// against the eventual post-meal score to measure self-knowledge
// calibration per cuisine.
function BlindBetStars({ dishId, dishName }: BlindBetStarsProps) {
  const [bet, setBet] = useState<number | null>(null);

  const handleBet = (score: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setBet(score);
    logSignal("blind_bet", { dish_id: dishId, dish_name: dishName, user_predicted_score: score });
  };

  return (
    <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] font-bold text-gray-400">
        {bet ? "Your bet:" : "How much will you like this?"}
      </span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={(e) => handleBet(n, e)} className="text-sm leading-none">
            <span className={bet != null && n <= bet ? "text-amber-400" : "text-gray-200"}>★</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default BlindBetStars;
