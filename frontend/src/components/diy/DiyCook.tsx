interface DiyCookProps {
  dishName: string;
  steps: string[];
  completed: Set<number>;
  onToggleStep: (index: number) => void;
  onAddToWall: () => void;
}

/** Stage 3 — step-by-step cooking checklist. */
export default function DiyCook({ dishName: _dishName, steps, completed, onToggleStep, onAddToWall }: DiyCookProps) {
  const allDone = steps.length > 0 && completed.size === steps.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-xl bg-green-50">
        <p className="text-xs font-bold text-green-700">
          {completed.size}/{steps.length} steps done — tap a step to check it off.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const done = completed.has(i);
          return (
            <button
              key={i}
              onClick={() => onToggleStep(i)}
              className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-colors ${
                done ? "bg-green-50 border-green-400" : "bg-white border-gray-100"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                  done ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400 border-2 border-gray-200"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-sm font-semibold ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                {step}
              </span>
            </button>
          );
        })}
      </div>

      {allDone && (
        <>
          <div className="p-4 rounded-2xl bg-orange-50 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-extrabold text-gray-900">You cooked it! Snap a photo for your wall.</p>
          </div>
          <button
            onClick={onAddToWall}
            className="w-full py-3.5 rounded-full font-black text-white text-sm bg-gradient-to-r from-orange-500 to-amber-400"
          >
            📸 Add to my wall
          </button>
        </>
      )}
    </div>
  );
}
