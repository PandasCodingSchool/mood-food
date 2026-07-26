import { useEffect, useState } from "react";
import { fetchRecommendations } from "../services/aiRecommendations";
import { logSignal } from "../services/signals";
import { trackEvent } from "../utils/analytics";
import type { QuizResults, Recommendation } from "../types";

interface MindReaderProps {
  onAccept: (rec: Recommendation, results: QuizResults) => void;
  onReject: () => void;
}

const QUIZ_RESULTS: QuizResults = {
  mood: "happy",
  craving: "comfort",
  budget: "medium",
  preference: "both",
};

// 4.3 — Mind-reader mode: instead of options, the AI states "I think you
// want ___ tonight" with one confident pick + reasoning. Only reachable when
// confidence > 0.8 (gated server-side by the orchestrator's question_budget).
function MindReader({ onAccept, onReject }: MindReaderProps) {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    fetchRecommendations(QUIZ_RESULTS, { type: "mind_reader" } as never)
      .then((res) => setRec(res.recommendations?.[0] || null))
      .finally(() => setLoading(false));
  }, []);

  const handleVerdict = (accepted: boolean) => {
    setAnswered(true);
    logSignal("mind_reader_verdict", { rec_id: rec?.id, dish_id: rec?.dish.id, accepted });
    trackEvent("mind_reader_verdict", { accepted });
    if (accepted && rec) onAccept(rec, QUIZ_RESULTS);
    else onReject();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 to-indigo-700">
        <div className="text-6xl animate-pulse">🔮</div>
      </div>
    );
  }

  if (!rec) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 gap-4 px-4">
        <div className="text-5xl">🔮</div>
        <p className="text-gray-700 font-bold text-center">Couldn't read your mind this time.</p>
        <button
          onClick={onReject}
          className="px-6 py-3 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-black"
        >
          Back to games
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600 flex flex-col items-center">
      <div className="text-4xl mb-2">🔮</div>
      <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-8">
        I think you want...
      </h2>

      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-44 bg-gradient-to-br from-primary-400 to-secondary-500" />
        <div className="p-6">
          <h3 className="text-xl font-black text-gray-900">{rec.dish.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{rec.dish.cuisine}</p>
          {rec.ai_reasoning?.psychological_hook && (
            <p className="text-sm text-gray-600 italic mt-4 leading-relaxed">
              "{rec.ai_reasoning.psychological_hook}"
            </p>
          )}
        </div>
      </div>

      {!answered && (
        <div className="w-full max-w-sm mt-8 flex flex-col gap-3">
          <button
            onClick={() => handleVerdict(true)}
            className="py-4 rounded-full bg-gradient-to-r from-green-500 to-green-400 text-white font-black text-lg shadow-lg hover:scale-[1.02] transition-transform"
          >
            Yes, exactly!
          </button>
          <button
            onClick={() => handleVerdict(false)}
            className="py-4 rounded-full border-2 border-white/30 text-white font-extrabold hover:bg-white/10 transition-colors"
          >
            Not quite
          </button>
        </div>
      )}
    </div>
  );
}

export default MindReader;
