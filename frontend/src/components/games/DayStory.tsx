import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { getActiveStory, getMoodCravingFollowUp } from "../../constants/storyBeats";
import {
  computeMoodFromStory,
  orderChoicesByVector,
  type StoryMoodResult,
} from "../../utils/storyEngine";
import StoryScene from "./StoryScene";
import { trackEvent } from "../../utils/analytics";
import { fetchGameAssist, type GameAssistResult } from "../../services/gameAssist";
import { buildGameSignals } from "../../utils/gameSignals";
import type { GameResult } from "../../types";

const TIME_SLOT_EMOJI: Record<string, string> = {
  morning: "☀️",
  afternoon: "🌤️",
  evening: "🌆",
  night: "🌙",
};

const TIME_SLOT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Late night",
};
const FOLLOW_UP_STEPS = ["craving", "budget", "preference"] as const;
type FollowUpStep = (typeof FOLLOW_UP_STEPS)[number];
type Phase = "intro" | "beats" | "reveal" | "followUp";

interface DayStoryProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

function DayStory({ onComplete, onBack }: DayStoryProps) {
  // Build the time-of-day-aware story once on mount.
  const activeStory = useMemo(() => getActiveStory(), []);
  const STORY_BEATS = activeStory.beats;
  const STORY_FOLLOW_UP = activeStory.followUp;
  const SEGMENTS = activeStory.segments;
  const STORY_COLD_OPEN = activeStory.coldOpen;
  const timeSlot = activeStory.timeSlot;

  const [phase, setPhase] = useState<Phase>("intro");
  const [beatIndex, setBeatIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [reveal, setReveal] = useState<StoryMoodResult | null>(null);
  const [followUpStep, setFollowUpStep] = useState(0);
  const [followUpAnswers, setFollowUpAnswers] = useState<
    Partial<Record<FollowUpStep, string>>
  >({});
  const [isAnimating, setIsAnimating] = useState(false);
  // LLM assists prefetched while the reveal screen shows; null = use statics.
  const [assistCraving, setAssistCraving] = useState<GameAssistResult | null>(
    null,
  );
  const [assistFlavor, setAssistFlavor] = useState<string | null>(null);

  const beat = STORY_BEATS[beatIndex];
  const lastChoiceId = choices[choices.length - 1];
  // The beat reacts to the previous pick when an override exists, and its
  // choices re-order to follow the mood trajectory so far.
  const beatNarrative =
    (lastChoiceId && beat.narrativeOverrides?.[lastChoiceId]) ||
    beat.narrative;
  const beatChoices = orderChoicesByVector(beat.choices, choices);
  const currentFollowUpKey = FOLLOW_UP_STEPS[followUpStep];
  // Craving step is mood-aware (LLM-personalized when the prefetch landed);
  // budget & preference are static.
  const staticCravingConfig = reveal
    ? getMoodCravingFollowUp(reveal.moodSlug)
    : STORY_FOLLOW_UP.craving;
  const followUpConfig =
    currentFollowUpKey === "craving" && reveal
      ? assistCraving && assistCraving.options.length >= 3
        ? { ...staticCravingConfig, options: assistCraving.options.map((o) => ({
            value: o.value,
            label: o.label,
            emoji: o.emoji || "🍽️",
            ...(o.subtitle && { subtitle: o.subtitle }),
          })) }
        : staticCravingConfig
      : STORY_FOLLOW_UP[currentFollowUpKey];

  const handleIntroStart = () => {
    trackEvent("story_started", { timeSlot });
    setPhase("beats");
  };

  const handleChoice = (choiceId: string) => {
    const nextChoices = [...choices, choiceId];
    setChoices(nextChoices);

    trackEvent("story_beat_answered", {
      beat: beat.id,
      choice: choiceId,
    });

    if (beatIndex < STORY_BEATS.length - 1) {
      setBeatIndex((i) => i + 1);
    } else {
      const result = computeMoodFromStory(nextChoices);
      setReveal(result);
      setPhase("reveal");
      trackEvent("story_mood_revealed", {
        mood: result.moodSlug,
        summary: result.storySummary,
      });
      // Prefetch LLM personalization while the reveal screen shows — the
      // follow-up renders statics if these haven't resolved in time.
      const assistContext = {
        mood: result.moodSlug,
        mood_vector: result.vector,
        story_choices: nextChoices,
        time_slot: timeSlot,
      };
      fetchGameAssist("craving_options", assistContext, {
        gameType: "day_story",
      }).then(setAssistCraving);
      fetchGameAssist("story_beat_flavor", assistContext, {
        gameType: "day_story",
      }).then((r) => setAssistFlavor(r?.flavorText || null));
    }
  };

  const handleBeatBack = () => {
    if (beatIndex > 0) {
      setBeatIndex((i) => i - 1);
      setChoices((c) => c.slice(0, -1));
    }
  };

  const handleContinueToFollowUp = () => {
    setPhase("followUp");
    setFollowUpStep(0);
  };

  const handleFollowUpSelect = (value: string) => {
    const key = currentFollowUpKey;
    const updated = { ...followUpAnswers, [key]: value };
    setFollowUpAnswers(updated);

    trackEvent("story_followup_answered", {
      step: key,
      answer: value,
    });

    if (followUpStep < FOLLOW_UP_STEPS.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setFollowUpStep((s) => s + 1);
        setIsAnimating(false);
      }, 280);
    } else if (reveal) {
      trackEvent("story_complete", {
        mood: reveal.moodSlug,
        craving: updated.craving,
        budget: updated.budget,
      });

      const storySummary = assistFlavor
        ? `${reveal.storySummary} ${assistFlavor}`
        : reveal.storySummary;
      const craving = updated.craving || "comfort";
      onComplete({
        mood: reveal.moodSlug,
        craving,
        budget: updated.budget || "moderate",
        preference: updated.preference || "both",
        gameData: buildGameSignals({
          type: "day_story",
          liked: choices,
          cravings: [craving],
          budgetTier: (updated.budget || "moderate") as
            | "budget"
            | "moderate"
            | "splurge",
          dietPreference: (updated.preference || "both") as
            | "veg"
            | "non-veg"
            | "both",
          // storyEngine vectors are 0..1 centered on 0.5 — convert to -1..1.
          moodVector: {
            energy: (reveal.vector.energy - 0.5) * 2,
            valence: (reveal.vector.valence - 0.5) * 2,
            social: (reveal.vector.social - 0.5) * 2,
          },
          raw: {
            storyChoices: choices,
            storySummary,
            timeSlot,
          },
        }),
      });
    }
  };

  const handleFollowUpBack = () => {
    if (followUpStep > 0) {
      setFollowUpStep((s) => s - 1);
    } else {
      setPhase("reveal");
    }
  };

  const handleTopBack = () => {
    if (phase === "intro") {
      onBack();
    } else if (phase === "beats" && beatIndex === 0) {
      setPhase("intro");
    } else if (phase === "beats") {
      handleBeatBack();
    } else if (phase === "reveal") {
      setPhase("beats");
      setBeatIndex(STORY_BEATS.length - 1);
      setChoices((c) => c.slice(0, -1));
    } else if (phase === "followUp") {
      handleFollowUpBack();
    }
  };

  /* ── Intro ── */
  if (phase === "intro") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="flex flex-col items-center justify-center bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl mb-4">
              <BookOpen className="w-7 h-7 text-white" />
            </div>

            <div className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 mb-4 text-xs font-medium text-gray-600">
              <span>{TIME_SLOT_EMOJI[timeSlot]}</span>
              <span>
                It's {TIME_SLOT_LABEL[timeSlot].toLowerCase()} where you are
              </span>
            </div>

            <StoryScene scene={STORY_BEATS[0]?.scene ?? "morning"} />
            <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
              {STORY_COLD_OPEN.title}
            </h1>
            <p className="text-gray-600 mb-8">{STORY_COLD_OPEN.subtitle}</p>
            <button
              type="button"
              onClick={handleIntroStart}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-primary-500 to-secondary-500 text-white hover:shadow-xl hover:shadow-primary-200/50 hover:scale-[1.02] transition-all flex items-center justify-center group"
            >
              Start my day
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Mood reveal ── */
  if (phase === "reveal" && reveal) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <p className="text-sm font-medium text-primary-600 mb-2">
              Your day in a nutshell
            </p>
            <span className="text-7xl mb-4 block">{reveal.moodEmoji}</span>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Feeling {reveal.moodLabel}
            </h2>
            <p className="text-gray-600 mb-8">
              {reveal.storySummary}
              {assistFlavor && ` ${assistFlavor}`}
            </p>
            <button
              type="button"
              onClick={handleContinueToFollowUp}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-primary-500 to-secondary-500 text-white hover:shadow-xl hover:shadow-primary-200/50 hover:scale-[1.02] transition-all flex items-center justify-center group"
            >
              What sounds good tonight?
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Follow-up (craving → budget → preference) ── */
  if (phase === "followUp" && reveal) {
    const progress = ((followUpStep + 1) / FOLLOW_UP_STEPS.length) * 100;

    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="sticky top-16 z-10 mb-6 flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border border-gray-200 rounded-full px-4 py-2 shadow-sm text-sm">
              <span className="text-xl">{reveal.moodEmoji}</span>
              <span className="font-medium text-gray-800">
                {reveal.moodLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 text-center max-w-sm px-2">
              {reveal.storySummary}
            </p>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Step {followUpStep + 1} of {FOLLOW_UP_STEPS.length}
          </p>

          <div
            className={`bg-white rounded-3xl shadow-xl p-8 ${
              isAnimating
                ? "opacity-0 translate-y-4"
                : "opacity-100 translate-y-0"
            } transition-all duration-300`}
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
                <Sparkles className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-medium text-primary-700">
                  Your evening
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {followUpConfig.title}
              </h2>
              <p className="text-gray-600">{followUpConfig.subtitle}</p>
            </div>

            <div
              className={`grid gap-3 ${
                followUpConfig.options.length <= 3
                  ? "md:grid-cols-3"
                  : "md:grid-cols-2"
              }`}
            >
              {followUpConfig.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleFollowUpSelect(option.value)}
                  className="p-5 rounded-2xl border-2 border-gray-200 hover:border-primary-300 hover:scale-[1.02] transition-all text-center"
                >
                  <span className="text-3xl mb-2 block">{option.emoji}</span>
                  <span className="font-semibold text-gray-900 block text-sm">
                    {option.label}
                  </span>
                  {"subtitle" in option &&
                    (option as { subtitle?: string }).subtitle && (
                      <span className="text-xs text-gray-500 mt-1 block">
                        {(option as { subtitle?: string }).subtitle}
                      </span>
                    )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Story beats ── */
  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-gray-500 hover:text-gray-700 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {beatIndex > 0 ? "Back" : "Exit"}
          </button>
          <div className="flex gap-1 text-xs font-medium text-gray-500">
            {SEGMENTS.map((label, i) => (
              <span
                key={label}
                className={
                  i === beatIndex
                    ? "text-primary-600"
                    : i < beatIndex
                      ? "text-primary-400"
                      : ""
                }
              >
                {label}
                {i < SEGMENTS.length - 1 && " · "}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full flex gap-1 mb-6">
          {SEGMENTS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= beatIndex ? "bg-primary-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 animate-fade-in">
          <StoryScene scene={beat.scene} />
          <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide mt-4 mb-1">
            {beat.segmentLabel}
          </p>
          <p className="text-lg text-gray-800 mb-6 leading-relaxed">
            {beatNarrative}
          </p>

          <div className="flex flex-col gap-3">
            {beatChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleChoice(choice.id)}
                className="flex items-center gap-4 w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50/50 text-left transition-all"
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 flex items-center justify-center text-xl">
                  {choice.emoji}
                </span>
                <span className="font-medium text-gray-900">
                  {choice.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DayStory;
