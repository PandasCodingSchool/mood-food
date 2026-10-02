import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DUEL_ROUNDS, type DuelCard } from "../../constants/duels";
import { trackEvent } from "../../utils/analytics";
import { buildGameSignals } from "../../utils/gameSignals";
import { logSignal } from "../../services/signals";
import type { GameResult } from "../../types";

interface ThisOrThatProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

function DuelCardView({ card, onPick }: { card: DuelCard; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`w-40 h-48 md:w-48 md:h-56 rounded-3xl bg-gradient-to-br ${card.gradient} flex flex-col items-center justify-center p-4 shadow-xl hover:scale-105 active:scale-95 transition-transform`}
    >
      <span className="text-5xl md:text-6xl">{card.emoji}</span>
      <span className="mt-3 text-white font-black text-center text-base md:text-lg">
        {card.label}
      </span>
    </button>
  );
}

// 3.1 — This or That: forced binary duels revealing trade-off weights
// (price vs. health vs. speed vs. adventure vs. comfort) that users can't
// articulate when asked directly. Feeds Bradley-Terry learning.
function ThisOrThat({ onComplete, onBack }: ThisOrThatProps) {
  const [round, setRound] = useState(0);
  const [duels, setDuels] = useState<
    Array<{ dimensionA: string; dimensionB: string; winner: string }>
  >([]);

  const current = DUEL_ROUNDS[round];
  const done = round >= DUEL_ROUNDS.length;
  const progress = (Math.min(round, DUEL_ROUNDS.length) / DUEL_ROUNDS.length) * 100;

  const handlePick = (winnerId: string) => {
    const winnerDimension = winnerId === current.a.id ? current.dimensionA : current.dimensionB;
    const nextDuels = [
      ...duels,
      { dimensionA: current.dimensionA, dimensionB: current.dimensionB, winner: winnerDimension },
    ];
    setDuels(nextDuels);

    if (round + 1 >= DUEL_ROUNDS.length) {
      logSignal("this_or_that", {
        duels: nextDuels.map((d) => ({
          dimension_a: d.dimensionA,
          dimension_b: d.dimensionB,
          winner: d.winner,
        })),
      });
      trackEvent("game_completed", { game: "this_or_that", duels: nextDuels });
    }
    setRound((r) => r + 1);
  };

  const handleGetResults = () => {
    onComplete({
      mood: "happy",
      craving: "comfort",
      budget: "moderate",
      preference: "both",
      gameData: buildGameSignals({ type: "this_or_that", duelResults: duels }),
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-black text-gray-400 whitespace-nowrap">
            {Math.min(round + 1, DUEL_ROUNDS.length)}/{DUEL_ROUNDS.length}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[400px]">
          {!done ? (
            <>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 text-center mb-8">
                {current.prompt}
              </h2>
              <div className="flex gap-4 md:gap-6">
                <DuelCardView card={current.a} onPick={() => handlePick(current.a.id)} />
                <DuelCardView card={current.b} onPick={() => handlePick(current.b.id)} />
              </div>
            </>
          ) : (
            <div className="text-center animate-slide-up">
              <div className="text-6xl mb-4">⚔️</div>
              <h2 className="text-2xl font-black text-gray-900">Trade-offs learned!</h2>
              <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                Now we know what you actually care about when it counts.
              </p>
              <button
                onClick={handleGetResults}
                className="mt-8 w-full max-w-xs mx-auto py-4 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 text-white font-black text-lg shadow-lg hover:scale-[1.02] transition-transform"
              >
                🍽️ Show me my matches
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThisOrThat;
