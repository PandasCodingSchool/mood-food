import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { trackEvent } from "../../utils/analytics";
import { logSignal } from "../../services/signals";
import { buildGameSignals } from "../../utils/gameSignals";
import type { GameResult } from "../../types";

interface BracketProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

interface BracketCard {
  id: string;
  label: string;
  emoji: string;
  gradient: string;
}

const CAMPAIGN_KEY = "summer_cravings_2026";

const CARDS: BracketCard[] = [
  { id: "Pepperoni Pizza", label: "Pepperoni Pizza", emoji: "🍕", gradient: "from-red-600 to-orange-500" },
  { id: "Poke Bowl", label: "Poke Bowl", emoji: "🥗", gradient: "from-teal-600 to-emerald-400" },
  { id: "Loaded Burrito", label: "Loaded Burrito", emoji: "🌯", gradient: "from-amber-700 to-amber-500" },
  { id: "Sushi Platter", label: "Sushi Platter", emoji: "🍣", gradient: "from-blue-700 to-blue-400" },
  { id: "Smash Burger", label: "Smash Burger", emoji: "🍔", gradient: "from-amber-800 to-amber-600" },
  { id: "Pad Thai", label: "Pad Thai", emoji: "🍜", gradient: "from-purple-700 to-purple-400" },
  { id: "Pancake Stack", label: "Pancake Stack", emoji: "🥞", gradient: "from-pink-700 to-pink-400" },
  { id: "Fried Chicken", label: "Fried Chicken", emoji: "🍗", gradient: "from-orange-700 to-orange-400" },
];

function CardView({ card, onPick }: { card: BracketCard; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`w-40 h-48 md:w-48 md:h-56 rounded-3xl bg-gradient-to-br ${card.gradient} flex flex-col items-center justify-center p-4 shadow-xl hover:scale-105 active:scale-95 transition-transform`}
    >
      <span className="text-5xl md:text-6xl">{card.emoji}</span>
      <span className="mt-3 text-white font-black text-center text-base md:text-lg">{card.label}</span>
    </button>
  );
}

// 3.5 — Seasonal / event-driven mini-games. Bracket/tournament format:
// addictive, shareable, scarcity (limited-time) drives return visits.
function Bracket({ onComplete, onBack }: BracketProps) {
  const [round, setRound] = useState<BracketCard[]>(CARDS);
  const [nextRound, setNextRound] = useState<BracketCard[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [champion, setChampion] = useState<BracketCard | null>(null);

  const a = round[matchIdx * 2];
  const b = round[matchIdx * 2 + 1];
  const roundLabel = round.length === 8 ? "Round of 8" : round.length === 4 ? "Semifinal" : "Final";

  const handlePick = (winner: BracketCard) => {
    const updatedPicks = [...picks, winner.id];
    setPicks(updatedPicks);
    const updatedNext = [...nextRound, winner];

    if (matchIdx + 1 < round.length / 2) {
      setNextRound(updatedNext);
      setMatchIdx((i) => i + 1);
      return;
    }

    if (updatedNext.length === 1) {
      setChampion(updatedNext[0]);
      trackEvent("game_completed", { game: "bracket", winner: updatedNext[0].label });
      logSignal("bracket", { campaign_key: CAMPAIGN_KEY, picks: updatedPicks });
      return;
    }

    setRound(updatedNext);
    setNextRound([]);
    setMatchIdx(0);
  };

  const handleGetResults = () => {
    onComplete({
      mood: "happy",
      craving: "comfort",
      budget: "moderate",
      preference: "both",
      gameData: buildGameSignals({ type: "quiz", raw: { champion: champion?.label } }),
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl md:text-2xl font-black text-gray-900">☀️ Summer Cravings Bracket</h2>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[420px]">
          {!champion ? (
            <>
              <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-6">{roundLabel}</p>
              <div className="flex gap-4 md:gap-6">
                <CardView card={a} onPick={() => handlePick(a)} />
                <CardView card={b} onPick={() => handlePick(b)} />
              </div>
            </>
          ) : (
            <div className="text-center animate-slide-up">
              <div className="text-6xl mb-4">{champion.emoji}</div>
              <h3 className="text-2xl font-black text-gray-900">{champion.label} wins the bracket!</h3>
              <button
                onClick={handleGetResults}
                className="mt-8 w-full max-w-xs mx-auto py-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 text-white font-black text-lg shadow-lg hover:scale-[1.02] transition-transform"
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

export default Bracket;
