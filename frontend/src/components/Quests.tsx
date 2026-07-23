import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { fetchQuests, type Quest } from "../services/quests";

interface QuestsProps {
  onBack: () => void;
}

// 5.2 — Streaks & taste-discovery quests: inject exploration data,
// fighting the recommender's collapse into the same 5 dishes.
function Quests({ onBack }: QuestsProps) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuests().then((q) => {
      setQuests(q);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onBack}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-6">Quests</h2>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading…</div>
        ) : (
          <div className="flex flex-col gap-4">
            {quests.map((q) => {
              const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
              const done = q.status === "completed";
              return (
                <div
                  key={q.key}
                  className={`p-4 rounded-2xl bg-white border-2 ${done ? "border-green-300" : "border-gray-100"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-extrabold text-gray-900">{q.title}</p>
                    {done && <span className="text-lg">✅</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-semibold mt-1">{q.description}</p>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-3">
                    <div
                      className={`h-full rounded-full ${done ? "bg-gradient-to-r from-green-500 to-green-400" : "bg-gradient-to-r from-orange-500 to-amber-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 font-bold mt-2">
                    {q.progress}/{q.target} {done ? "· Complete!" : ""}
                  </p>
                </div>
              );
            })}
            {quests.length === 0 && (
              <p className="text-center text-gray-400 py-10">No active quests right now.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Quests;
