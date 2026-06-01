import { useState, useRef, useCallback } from "react";
import { ChevronLeft, RotateCw, Check, X } from "lucide-react";
import { trackEvent } from "../../utils/analytics";
import type { WheelSegment, BudgetOption, GameResult } from "../../types";

const WHEEL_SEGMENTS: WheelSegment[] = [
  {
    id: "comfort",
    label: "Comfort Food",
    color: "#FF6B6B",
    icon: "🍕",
    mood: "stressed",
  },
  {
    id: "healthy",
    label: "Healthy",
    color: "#4ECDC4",
    icon: "🥗",
    mood: "relaxed",
  },
  {
    id: "spicy",
    label: "Spicy",
    color: "#FF9F43",
    icon: "🌶️",
    mood: "adventurous",
  },
  { id: "sweet", label: "Sweet", color: "#FF6B9D", icon: "🍰", mood: "happy" },
  { id: "light", label: "Light", color: "#A8E6CF", icon: "🥙", mood: "tired" },
  {
    id: "indulgent",
    label: "Indulgent",
    color: "#C7CEEA",
    icon: "🦞",
    mood: "celebrating",
  },
  {
    id: "quick",
    label: "Quick Bite",
    color: "#FFD93D",
    icon: "🍔",
    mood: "tired",
  },
  {
    id: "exotic",
    label: "Exotic",
    color: "#95E1D3",
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
    trackEvent("wheel_budget_selected", { budget });

    const results: GameResult = {
      mood: finalSelections.mood || "happy",
      craving: finalSelections.craving || "comfort",
      budget: budget,
      preference: "both",
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

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Spin the Wheel 🎯
            </h2>
            <p className="text-gray-500 text-sm">
              Spin to discover your craving. Accept it or spin again!
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

        <div className="relative mb-8">
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
                } as React.CSSProperties
              }
            />
          ))}

          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
            <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-gray-800" />
          </div>

          {/* Glow ring while spinning */}
          {isSpinning && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 5 }}
            >
              <div className="w-[22rem] h-[22rem] rounded-full glow-ring" />
            </div>
          )}

          <div
            ref={wheelRef}
            className="w-80 h-80 mx-auto rounded-full relative overflow-hidden shadow-2xl"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning
                ? "transform 3s cubic-bezier(0.23, 1, 0.32, 1)"
                : "none",
            }}
          >
            {WHEEL_SEGMENTS.map((segment, index) => {
              const angle = (360 / WHEEL_SEGMENTS.length) * index;
              const isRejected = rejectedSegments.find(
                (r) => r.id === segment.id,
              );

              return (
                <div
                  key={segment.id}
                  className={`absolute w-full h-full ${isRejected ? "opacity-30 grayscale" : ""}`}
                  style={{
                    clipPath: `polygon(50% 50%, ${50 + 50 * Math.cos(((angle - 90) * Math.PI) / 180)}% ${50 + 50 * Math.sin(((angle - 90) * Math.PI) / 180)}%, ${50 + 50 * Math.cos(((angle + 360 / WHEEL_SEGMENTS.length - 90) * Math.PI) / 180)}% ${50 + 50 * Math.sin(((angle + 360 / WHEEL_SEGMENTS.length - 90) * Math.PI) / 180)}%)`,
                    backgroundColor: segment.color,
                  }}
                >
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{
                      transform: `translate(-50%, -50%) rotate(${angle + 360 / WHEEL_SEGMENTS.length / 2}deg) translateX(80px)`,
                    }}
                  >
                    <span className="text-2xl">{segment.icon}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center z-20">
            <span className="text-2xl">🎯</span>
          </div>
        </div>

        {selectedSegment && !isSpinning && (
          <div
            className="mb-6 p-6 bg-white rounded-2xl shadow-xl text-center border border-gray-100"
            style={{ animation: "slideUpFade 0.3s ease" }}
          >
            <span className="text-6xl mb-3 block">{selectedSegment.icon}</span>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {selectedSegment.label}
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              Vibe:{" "}
              <span className="font-semibold text-primary-600 capitalize">
                {selectedSegment.mood}
              </span>
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={handleAccept}
                className="flex items-center px-7 py-3.5 bg-green-500 text-white rounded-2xl font-bold text-base hover:bg-green-600 active:scale-95 transition-all shadow-lg shadow-green-200"
              >
                <Check className="w-5 h-5 mr-2" />
                Yes, this!
              </button>
              <button
                onClick={handleReject}
                className="flex items-center px-7 py-3.5 bg-white text-red-500 border-2 border-red-200 rounded-2xl font-bold text-base hover:bg-red-50 active:scale-95 transition-all"
              >
                <X className="w-5 h-5 mr-2" />
                Nope
              </button>
            </div>
          </div>
        )}

        {!selectedSegment && (
          <button
            onClick={spin}
            disabled={isSpinning || availableSegments.length === 0}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 ${
              isSpinning || availableSegments.length === 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-primary-500 to-secondary-500 text-white hover:shadow-xl hover:shadow-primary-200/50 hover:scale-[1.02] shadow-lg"
            }`}
          >
            {isSpinning ? (
              <>
                <RotateCw className="w-6 h-6 mr-2 animate-spin" />
                Spinning...
              </>
            ) : availableSegments.length === 0 ? (
              "No options left!"
            ) : (
              <>
                <RotateCw className="w-6 h-6 mr-2" />
                {spinCount === 0 ? "🎯 Spin the Wheel!" : "🔄 Spin Again"}
              </>
            )}
          </button>
        )}

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
    </div>
  );
}

export default SpinWheel;
