import { useState } from "react";
import SliderRow from "./inputs/SliderRow";
import { saveTodayCheckin, type Occasion } from "../utils/moodState";
import { logSignal } from "../services/signals";
import { trackEvent } from "../utils/analytics";
import { hasLocationConsent, setLocationConsent, getPassiveWeather } from "../services/context";
import { bumpQuestProgress } from "../services/quests";

interface MoodCheckInProps {
  onDone: () => void;
}

const OCCASIONS: Array<{ id: Occasion; emoji: string; label: string; sub: string }> = [
  { id: "treat", emoji: "🎉", label: "Treat", sub: "Indulge tonight" },
  { id: "fuel", emoji: "⚡", label: "Fuel", sub: "Just get it done" },
  { id: "reward", emoji: "🏅", label: "Reward", sub: "Earned this one" },
];

// 1.1 — Mood-first emoji check-in, plus 3.3 budget-vibe framing. A ~20s
// opener gating the games once/day: energy, stress, hunger, social, occasion.
function MoodCheckIn({ onDone }: MoodCheckInProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [energy, setEnergy] = useState(5);
  const [stress, setStress] = useState(5);
  const [hunger, setHunger] = useState(5);
  const [social, setSocial] = useState(5);

  const handleOccasion = (occasion: Occasion) => {
    saveTodayCheckin({ energy, stress, hunger, social, occasion });
    logSignal("mood_checkin", { energy, stress, hunger, social });
    logSignal("occasion", { occasion });
    bumpQuestProgress("mood_streak_7");
    trackEvent("mood_checkin_completed", { energy, stress, hunger, social, occasion });
    onDone();
  };

  if (step === 1) {
    return (
      <div className="min-h-screen pt-24 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8 animate-slide-up">
            <div className="text-4xl mb-3">🍽️</div>
            <h2 className="text-3xl font-black text-gray-900">Is tonight a...</h2>
            <p className="text-gray-500 mt-1">
              Helps us match the right budget — no $40 suggestions on a fuel night.
            </p>
          </div>
          <div className="flex flex-col gap-3 animate-slide-up">
            {OCCASIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleOccasion(opt.id)}
                className="flex items-center gap-4 p-4 rounded-2xl bg-white border-2 border-gray-100 hover:border-primary-300 hover:shadow-md transition-all text-left"
              >
                <span className="text-3xl">{opt.emoji}</span>
                <div>
                  <p className="font-extrabold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-400 font-semibold">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>
          {!hasLocationConsent() && (
            <button
              onClick={() => {
                setLocationConsent(true);
                void getPassiveWeather();
                trackEvent("location_consent_granted");
              }}
              className="w-full mt-6 text-center text-xs font-bold text-gray-400 hover:text-gray-600"
            >
              🌦️ Enable weather-aware picks (uses your location)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8 animate-slide-up">
          <div className="text-4xl mb-3">🌤️</div>
          <h2 className="text-3xl font-black text-gray-900">How are you feeling?</h2>
          <p className="text-gray-500 mt-1">
            15 seconds — helps us read the room before we pick.
          </p>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-lg shadow-gray-200/70 animate-slide-up">
          <SliderRow label="Energy" emojiLow="🥱" emojiHigh="⚡" value={energy} onChange={setEnergy} accent="#f97316" />
          <SliderRow label="Stress" emojiLow="😌" emojiHigh="😰" value={stress} onChange={setStress} accent="#e11d48" />
          <SliderRow label="Hunger" emojiLow="🙂" emojiHigh="🍽️" value={hunger} onChange={setHunger} accent="#16a34a" />
          <SliderRow label="Company tonight" emojiLow="🧘 Solo" emojiHigh="👯 Group" value={social} onChange={setSocial} accent="#7c3aed" />

          <button
            onClick={() => setStep(1)}
            className="w-full mt-4 py-4 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-black text-lg shadow-lg hover:scale-[1.02] transition-transform"
          >
            That's me →
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoodCheckIn;
