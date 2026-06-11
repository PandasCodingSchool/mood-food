import { useState, useRef, useCallback } from "react";
import { ChevronLeft, Check, X, CircleDotDashed, Sparkles } from "lucide-react";
import { trackEvent } from "../../utils/analytics";
import type { WheelSegment, BudgetOption, GameResult } from "../../types";

const WHEEL_SEGMENTS: WheelSegment[] = [
  {
    id: "comfort",
    label: "Comfort",
    color: "#FB7185",
    gradient: "from-rose-400 to-orange-500",
    icon: "🍕",
    mood: "stressed",
  },
  {
    id: "healthy",
    label: "Healthy",
    color: "#34D399",
    gradient: "from-emerald-400 to-teal-500",
    icon: "🥗",
    mood: "relaxed",
  },
  {
    id: "spicy",
    label: "Spicy",
    color: "#F97316",
    gradient: "from-orange-500 to-red-600",
    icon: "🌶️",
    mood: "adventurous",
  },
  {
    id: "sweet",
    label: "Sweet",
    color: "#EC4899",
    gradient: "from-pink-400 to-fuchsia-500",
    icon: "🍰",
    mood: "happy",
  },
  {
    id: "light",
    label: "Light",
    color: "#84CC16",
    gradient: "from-lime-400 to-green-500",
    icon: "🥙",
    mood: "tired",
  },
  {
    id: "indulgent",
    label: "Indulgent",
    color: "#8B5CF6",
    gradient: "from-violet-500 to-indigo-600",
    icon: "🦞",
    mood: "celebrating",
  },
  {
    id: "quick",
    label: "Quick Bite",
    color: "#F59E0B",
    gradient: "from-amber-400 to-yellow-500",
    icon: "🍔",
    mood: "tired",
  },
  {
    id: "exotic",
    label: "Exotic",
    color: "#06B6D4",
    gradient: "from-cyan-400 to-sky-500",
    icon: "🍜",
    mood: "adventurous",
  },
];

const BUDGET_OPTIONS: BudgetOption[] = [
  { id: "budget", label: "Budget", emoji: "💰" },
  { id: "moderate", label: "Moderate", emoji: "💰💰" },
  { id: "splurge", label: "Splurge", emoji: "💰💰💰" },
];

interface SpinWheelProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
}

function SpinWheel({ onComplete, onBack }: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<WheelSegment | null>(
    null,
  );
  const [rejectedSegments, setRejectedSegments] = useState<WheelSegment[]>([]);
  const [acceptedSegments, setAcceptedSegments] = useState<WheelSegment[]>([]);
  const [spinCount, setSpinCount] = useState(0);
  const [finalSelections, setFinalSelections] = useState<Partial<GameResult>>(
    {},
  );
  const [showBudgetPicker, setShowBudgetPicker] = useState(false);
  const [showPreferencePicker, setShowPreferencePicker] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  const wheelRef = useRef<HTMLDivElement>(null);

  const spin = useCallback(() => {
    if (isSpinning) return;

    setIsSpinning(true);
    setSelectedSegment(null);

    const segmentAngle = 360 / WHEEL_SEGMENTS.length;
    const randomOffset = Math.random() * segmentAngle;
    const newRotation = rotation + 1800 + randomOffset;

    setRotation(newRotation);
    setSpinCount((prev) => prev + 1);

    trackEvent("wheel_spun", { spinCount: spinCount + 1 });

    setTimeout(() => {
      const actualRotation = newRotation % 360;
      const segmentIndex =
        Math.floor((360 - actualRotation) / segmentAngle) %
        WHEEL_SEGMENTS.length;
      const segment = WHEEL_SEGMENTS[segmentIndex];

      setSelectedSegment(segment);
      setIsSpinning(false);

      // Confetti burst
      const pieces: ConfettiPiece[] = Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: 40 + Math.random() * 20,
        y: 40 + Math.random() * 20,
        color: ["#f97316", "#ec4899", "#facc15", "#34d399", "#60a5fa"][i % 5],
        size: 6 + Math.random() * 8,
        angle: (i / 18) * 360,
      }));
      setConfetti(pieces);
      setTimeout(() => setConfetti([]), 900);

      trackEvent("wheel_landed", { segment: segment.id, label: segment.label });
    }, 3000);
  }, [isSpinning, rotation, spinCount]);

  const handleAccept = () => {
    if (!selectedSegment) return;

    setAcceptedSegments((prev) => [...prev, selectedSegment]);
    setFinalSelections((prev) => ({
      ...prev,
      craving: selectedSegment.id,
      mood: selectedSegment.mood,
    }));

    trackEvent("wheel_accepted", { segment: selectedSegment.id });

    if (spinCount >= 3) {
      setShowBudgetPicker(true);
    } else {
      setSelectedSegment(null);
    }
  };

  const handleReject = () => {
    if (!selectedSegment) return;

    setRejectedSegments((prev) => [...prev, selectedSegment]);
    trackEvent("wheel_rejected", { segment: selectedSegment.id });

    setSelectedSegment(null);

    setTimeout(() => spin(), 500);
  };

  const handleBudgetSelect = (budget: string) => {
    setFinalSelections((prev) => ({ ...prev, budget }));
    setSelectedBudget(budget);
    trackEvent("wheel_budget_selected", { budget });
    // Move to preference step instead of completing immediately
    setShowBudgetPicker(false);
    setShowPreferencePicker(true);
  };

  const handlePreferenceSelect = (preference: string) => {
    const results: GameResult = {
      mood: finalSelections.mood || "happy",
      craving: finalSelections.craving || "comfort",
      budget: selectedBudget || "moderate",
      preference,
      gameData: {
        type: "spin_wheel",
        spins: spinCount,
        accepted: acceptedSegments.map((s) => s.id),
        rejected: rejectedSegments.map((s) => s.id),
        finalCraving: finalSelections.craving,
        finalMood: finalSelections.mood,
      },
    };
    trackEvent("wheel_complete", results);
    onComplete(results);
  };

  const availableSegments = WHEEL_SEGMENTS.filter(
    (s) => !rejectedSegments.find((r) => r.id === s.id),
  );

  if (showBudgetPicker) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-yellow-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => setShowBudgetPicker(false)}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Pick Your Budget
            </h2>
            <p className="text-gray-600">
              What's your spending mood for {finalSelections.craving} food?
            </p>
          </div>

          <div className="space-y-4">
            {BUDGET_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleBudgetSelect(option.id)}
                className="w-full p-6 bg-white rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-between"
              >
                <div className="flex items-center">
                  <span className="text-3xl mr-4">{option.emoji}</span>
                  <span className="text-xl font-semibold text-gray-800">
                    {option.label}
                  </span>
                </div>
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
                  <Check className="w-5 h-5" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 p-4 bg-white/70 rounded-2xl">
            <h3 className="font-semibold text-gray-700 mb-2">
              Your Selections:
            </h3>
            <div className="flex flex-wrap gap-2">
              {acceptedSegments.map((s) => (
                <span
                  key={s.id}
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: s.color + "30", color: s.color }}
                >
                  {s.icon} {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Preference step (after budget is picked) ────────────
  if (showPreferencePicker) {
    const acceptedVibe = acceptedSegments[acceptedSegments.length - 1];
    const vibeLabel = acceptedVibe?.label ?? "your meal";
    const PREF_OPTIONS = [
      { value: "veg",     label: "Vegetarian",    emoji: "🥬" },
      { value: "non-veg", label: "Non-Vegetarian", emoji: "🍗" },
      { value: "both",    label: "No Preference",  emoji: "🍽️" },
    ];

    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-yellow-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => { setShowPreferencePicker(false); setShowBudgetPicker(true); }}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              One last thing
            </h2>
            <p className="text-gray-600">
              Any dietary preference for your {vibeLabel.toLowerCase()} meal?
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {PREF_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handlePreferenceSelect(option.value)}
                className="p-6 bg-white rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all text-center"
              >
                <span className="text-3xl mb-2 block">{option.emoji}</span>
                <span className="font-semibold text-gray-800 text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-amber-50 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-orange-200 rounded-full blur-3xl opacity-40 blob-drift" />
      <div
        className="absolute top-48 -left-24 w-64 h-64 bg-amber-200 rounded-full blur-3xl opacity-30 blob-drift"
        style={{ animationDelay: "1.5s" }}
      />
      {/* Floating food emojis */}
      <div className="absolute bottom-12 right-8 text-5xl opacity-10 animate-bounce">
        🍕
      </div>
      <div className="absolute top-28 left-6 text-4xl opacity-10 animate-pulse">
        🍜
      </div>
      <div
        className="absolute top-72 right-6 text-3xl opacity-10 animate-bounce"
        style={{ animationDelay: "0.8s" }}
      >
        🍰
      </div>

      <div className="max-w-md mx-auto relative">
        <div className="mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm hover:shadow-md"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl mb-4 shadow-xl shadow-orange-200/70">
              <CircleDotDashed
                className="w-8 h-8 text-white"
                style={{ animation: "spin 6s linear infinite" }}
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-2 tracking-tight">
              Meal{" "}
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                Roulette
              </span>
            </h2>
            <p className="text-gray-600 text-sm max-w-xs mx-auto">
              Let the wheel pick your food vibe. Accept the bite, or spin again!
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-6">
          <div className="text-center">
            <span className="text-2xl font-bold text-primary-600">
              {spinCount}
            </span>
            <p className="text-xs text-gray-500">Spins</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-green-600">
              {acceptedSegments.length}
            </span>
            <p className="text-xs text-gray-500">Accepted</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-red-500">
              {rejectedSegments.length}
            </span>
            <p className="text-xs text-gray-500">Rejected</p>
          </div>
        </div>

        <div className="relative mb-12 mt-12 flex items-center justify-center">
          {/* Confetti */}
          {confetti.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-sm pointer-events-none"
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  "--cx": `${Math.cos((p.angle * Math.PI) / 180) * 80}px`,
                  "--cy": `${Math.sin((p.angle * Math.PI) / 180) * 80}px`,
                  "--cr": `${p.angle * 2}deg`,
                  animation: "confetti-pop 0.8s ease-out forwards",
                  zIndex: 30,
                } as React.CSSProperties
              }
            />
          ))}

          {/* Outer rotating dashed rim (CircleDotDashed vibe) */}
          <div
            className="absolute w-[23rem] h-[23rem] rounded-full border-[3px] border-dashed border-orange-300/70 pointer-events-none"
            style={{
              animation: `spin ${isSpinning ? "2.5s" : "18s"} linear infinite`,
            }}
          />
          <div
            className="absolute w-[25rem] h-[25rem] rounded-full border border-amber-200/60 pointer-events-none"
            style={{
              animation: "spin 30s linear infinite reverse",
            }}
          />

          {/* Pulsing dots around the rim */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * 2 * Math.PI;
            const r = 11.5;
            return (
              <span
                key={i}
                className="absolute w-2 h-2 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 shadow-md"
                style={{
                  left: `calc(50% + ${Math.cos(a) * r}rem - 4px)`,
                  top: `calc(50% + ${Math.sin(a) * r}rem - 4px)`,
                  animation: `pulse 1.6s ease-in-out ${i * 0.08}s infinite`,
                }}
              />
            );
          })}

          {/* Glow ring while spinning */}
          {isSpinning && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 5 }}
            >
              <div className="w-[22rem] h-[22rem] rounded-full glow-ring" />
            </div>
          )}

          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 z-30 flex flex-col items-center">
            <div
              className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[24px] drop-shadow-lg"
              style={{ borderTopColor: "#f97316" }}
            />
            <div className="w-3 h-3 -mt-1 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-md" />
          </div>

          {/* Wheel */}
          <div
            ref={wheelRef}
            className="w-80 h-80 rounded-full relative overflow-hidden shadow-2xl ring-8 ring-white"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning
                ? "transform 3s cubic-bezier(0.23, 1, 0.32, 1)"
                : "none",
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0) 60%)",
            }}
          >
            {WHEEL_SEGMENTS.map((segment, index) => {
              const segCount = WHEEL_SEGMENTS.length;
              const sliceAngle = 360 / segCount;
              const angle = sliceAngle * index;
              const isRejected = rejectedSegments.find(
                (r) => r.id === segment.id,
              );
              const x1 = 50 + 50 * Math.cos(((angle - 90) * Math.PI) / 180);
              const y1 = 50 + 50 * Math.sin(((angle - 90) * Math.PI) / 180);
              const x2 =
                50 + 50 * Math.cos(((angle + sliceAngle - 90) * Math.PI) / 180);
              const y2 =
                50 + 50 * Math.sin(((angle + sliceAngle - 90) * Math.PI) / 180);

              return (
                <div
                  key={segment.id}
                  className={`absolute w-full h-full ${isRejected ? "opacity-30 grayscale" : ""}`}
                  style={{
                    clipPath: `polygon(50% 50%, ${x1}% ${y1}%, ${x2}% ${y2}%)`,
                    background: `linear-gradient(135deg, ${segment.color} 0%, ${segment.color}dd 60%, ${segment.color}88 100%)`,
                    boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)",
                  }}
                >
                  {/* Divider line */}
                  <div
                    className="absolute top-0 left-1/2 w-px h-1/2 bg-white/40"
                    style={{
                      transformOrigin: "bottom center",
                      transform: `translateX(-0.5px) rotate(${angle}deg)`,
                    }}
                  />

                  {/* Plate with emoji */}
                  <div
                    className="absolute top-1/2 left-1/2 text-center"
                    style={{
                      transform: `translate(-50%, -50%) rotate(${angle + sliceAngle / 2}deg) translateY(-90px)`,
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-12 h-12 rounded-full bg-white/95 shadow-md flex items-center justify-center ring-1 ring-white">
                        <span className="text-2xl drop-shadow-sm">
                          {segment.icon}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-white drop-shadow">
                        {segment.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center hub */}
          <button
            onClick={spin}
            disabled={isSpinning || availableSegments.length === 0}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full shadow-xl ring-4 ring-white flex items-center justify-center z-20 transition-transform ${
              isSpinning ? "" : "hover:scale-110 active:scale-95 cursor-pointer"
            } ${
              availableSegments.length === 0
                ? "bg-gray-300"
                : "bg-gradient-to-br from-orange-500 to-amber-500"
            }`}
            aria-label="Meal Roulette"
          >
            <CircleDotDashed
              className="w-9 h-9 text-white"
              style={{
                animation: isSpinning
                  ? "spin 0.6s linear infinite"
                  : "spin 6s linear infinite",
              }}
            />
            {!isSpinning && availableSegments.length > 0 && (
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-wider bg-white text-orange-600 px-2 py-0.5 rounded-full shadow whitespace-nowrap">
                {spinCount === 0 ? "Tap to spin" : "Spin"}
              </span>
            )}
          </button>
        </div>

        {rejectedSegments.length > 0 && (
          <div className="mt-6 p-4 bg-red-50 rounded-2xl">
            <p className="text-sm text-red-600 font-medium mb-2">Rejected:</p>
            <div className="flex flex-wrap gap-2">
              {rejectedSegments.map((s) => (
                <span
                  key={s.id}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs"
                >
                  {s.icon} {s.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-gray-400 text-sm mt-6">
          Tip: What you reject is as telling as what you accept!
        </p>
      </div>

      {/* Result modal */}
      {selectedSegment && !isSpinning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.2s ease" }}
            onClick={handleReject}
          />
          <div
            className="relative w-full max-w-sm p-6 bg-white rounded-3xl shadow-2xl text-center border border-gray-100 overflow-hidden"
            style={{ animation: "slideUpFade 0.3s ease" }}
          >
            <button
              type="button"
              onClick={handleReject}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${selectedSegment.color} 0%, transparent 70%)`,
              }}
            />
            <div className="relative inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              The wheel picked
            </div>
            <div
              className="relative mx-auto mb-3 w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${selectedSegment.color} 0%, ${selectedSegment.color}cc 100%)`,
              }}
            >
              <span className="text-5xl">{selectedSegment.icon}</span>
            </div>
            <h3 className="relative text-2xl font-black text-gray-900 mb-1">
              {selectedSegment.label}
            </h3>
            <p className="relative text-gray-400 text-sm mb-5">
              Vibe:{" "}
              <span className="font-semibold text-primary-600 capitalize">
                {selectedSegment.mood}
              </span>
            </p>

            <div className="relative flex justify-center gap-3">
              <button
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center px-5 py-3.5 bg-green-500 text-white rounded-2xl font-bold text-base hover:bg-green-600 active:scale-95 transition-all shadow-lg shadow-green-200"
              >
                <Check className="w-5 h-5 mr-2" />
                Yes, this!
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center px-5 py-3.5 bg-white text-red-500 border-2 border-red-200 rounded-2xl font-bold text-base hover:bg-red-50 active:scale-95 transition-all"
              >
                <X className="w-5 h-5 mr-2" />
                Nope
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpinWheel;
