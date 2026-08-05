import { useState } from "react";
import { ArrowRight, ChevronLeft, Sparkles } from "lucide-react";
import {
  OPENING_SCENES,
  SCENE2_OPTION_BANK,
  SCENE2_TEXT,
  TWIST_OPTIONS,
  TWIST_PROMPT,
  TWIST_SUBTITLE,
  type JourneyOption,
  type MoodCluster,
} from "../../constants/moodJourney";
import {
  accumulateAxes,
  matchCluster,
  normalizeAxes,
} from "../../utils/moodJourneyEngine";
import { trackEvent } from "../../utils/analytics";
import { buildGameSignals } from "../../utils/gameSignals";
import type { GameResult } from "../../types";

type Phase = "intro" | "opening" | "scene2" | "twist" | "reveal" | "followUp";
type FollowUpStep = "budget" | "preference";

interface MoodJourneyProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

// Deterministic per-day pick so the opener varies day to day but is stable on replay.
function pickOpeningScene() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000,
  );
  return OPENING_SCENES[dayOfYear % OPENING_SCENES.length];
}

function MoodJourney({ onComplete, onBack }: MoodJourneyProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [openingScene] = useState(pickOpeningScene);
  const [selections, setSelections] = useState<JourneyOption[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [followUpStep, setFollowUpStep] = useState<FollowUpStep>("budget");
  const [followUpAnswers, setFollowUpAnswers] = useState<{
    budget?: string;
    preference?: string;
  }>({});

  const scene2Options = openingScene.scene2OptionIds.map(
    (id) => SCENE2_OPTION_BANK[id],
  );

  const raw = accumulateAxes(selections);
  const normalized = normalizeAxes(raw);
  const matchResult =
    selections.length === 3
      ? matchCluster(raw, selections[2]?.clusterHint)
      : null;
  const cluster: MoodCluster | null = matchResult?.cluster ?? null;

  const handleStart = () => {
    trackEvent("mood_journey_started", { openingScene: openingScene.id });
    setPhase("opening");
  };

  const advance = (option: JourneyOption, nextPhase: Phase) => {
    trackEvent("mood_journey_choice", { phase, optionId: option.id });
    setIsAnimating(true);
    setTimeout(() => {
      setSelections((s) => [...s, option]);
      setPhase(nextPhase);
      setIsAnimating(false);
    }, 220);
  };

  const handleTopBack = () => {
    if (phase === "intro") onBack();
    else if (phase === "opening") setPhase("intro");
    else if (phase === "scene2") {
      setSelections((s) => s.slice(0, -1));
      setPhase("opening");
    } else if (phase === "twist") {
      setSelections((s) => s.slice(0, -1));
      setPhase("scene2");
    } else if (phase === "reveal") {
      setSelections((s) => s.slice(0, -1));
      setPhase("twist");
    }
  };

  const handleFindMeal = () => {
    if (!cluster) return;
    setFollowUpStep("budget");
    setFollowUpAnswers({});
    setPhase("followUp");
  };

  const handleFollowUpSelect = (value: string) => {
    if (!cluster || !matchResult) return;

    if (followUpStep === "budget") {
      setFollowUpAnswers({ budget: value });
      setFollowUpStep("preference");
      return;
    }

    const budget = followUpAnswers.budget || cluster.budgetHint;
    const preference = value;

    trackEvent("mood_journey_complete", {
      clusterId: cluster.id,
      budget,
      preference,
    });

    onComplete({
      mood: cluster.moodLabel,
      craving: cluster.cravingLabel,
      budget,
      preference,
      gameData: buildGameSignals({
        type: "mood_journey",
        liked: selections.map((s) => s.label),
        cravings: [cluster.sampleDish],
        budgetTier: budget as "budget" | "moderate" | "splurge",
        dietPreference: preference as "veg" | "non-veg" | "both",
        moodAxes: normalized,
        cluster: {
          id: cluster.id,
          name: cluster.name,
          secondaryId: matchResult.secondaryCluster?.id,
        },
        raw: {
          openingScene: openingScene.id,
          selections: selections.map((s) => s.id),
          axes: raw,
        },
      }),
    });
  };

  const handleTryAgain = () => {
    setPhase("intro");
    setSelections([]);
    setFollowUpAnswers({});
    setFollowUpStep("budget");
  };

  // ─────────────── INTRO ───────────────
  if (phase === "intro") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-200 rounded-full blur-3xl opacity-40" />
        <div className="absolute top-48 -left-24 w-64 h-64 bg-fuchsia-200 rounded-full blur-3xl opacity-30" />

        <div className="max-w-2xl mx-auto relative">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
              <Sparkles className="w-7 h-7 text-white" />
            </div>

            <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">
              Live{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
                one small moment
              </span>
            </h1>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Three quick choices about how you're feeling — no food, no
              menus. We'll land on tonight's mood, then find the dish that
              fits it.
            </p>

            <button
              type="button"
              onClick={handleStart}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:shadow-xl hover:shadow-indigo-200/50 hover:scale-[1.02] transition-all flex items-center justify-center group"
            >
              Begin
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>

            <p className="text-xs text-gray-400 mt-6">
              ⏱️ Takes ~30 seconds · 3 scenes · One answer
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── FOLLOW-UP (budget + preference) ───────────────
  if (phase === "followUp" && cluster) {
    const isBudget = followUpStep === "budget";
    const BUDGET_OPTIONS = [
      { value: "budget", label: "Budget", emoji: "💰", subtitle: "Under ₹300" },
      { value: "moderate", label: "Moderate", emoji: "💰💰", subtitle: "₹300–₹800" },
      { value: "splurge", label: "Splurge", emoji: "💰💰💰", subtitle: "Above ₹800" },
    ].sort((a, b) =>
      a.value === cluster.budgetHint ? -1 : b.value === cluster.budgetHint ? 1 : 0,
    );
    const PREF_OPTIONS = [
      { value: "veg", label: "Vegetarian", emoji: "🥬" },
      { value: "non-veg", label: "Non-Vegetarian", emoji: "🍗" },
      { value: "both", label: "No Preference", emoji: "🍽️" },
    ];

    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() =>
              isBudget ? setPhase("reveal") : setFollowUpStep("budget")
            }
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Back
          </button>

          <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-100 rounded-full mb-4">
              <span className="text-3xl">{cluster.emoji}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isBudget ? "What's your budget today?" : "Any dietary preference?"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {isBudget
                ? `${cluster.name} usually goes ${cluster.budgetHint} — but your wallet has the final say.`
                : "So we only show you dishes you'd actually eat."}
            </p>

            {isBudget ? (
              <div className="space-y-3">
                {BUDGET_OPTIONS.map((o) => {
                  const isSuggested = o.value === cluster.budgetHint;
                  return (
                    <button
                      key={o.value}
                      onClick={() => handleFollowUpSelect(o.value)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                        isSuggested
                          ? "bg-indigo-50 border-indigo-300 hover:border-indigo-400"
                          : "bg-gray-50 border-transparent hover:border-indigo-300 hover:bg-indigo-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{o.emoji}</span>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900">{o.label}</p>
                          <p className="text-xs text-gray-400">{o.subtitle}</p>
                        </div>
                      </div>
                      {isSuggested && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                          Suggested
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {PREF_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleFollowUpSelect(o.value)}
                    className="p-5 rounded-2xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 hover:scale-105 transition-all text-center"
                  >
                    <span className="text-3xl mb-2 block">{o.emoji}</span>
                    <span className="font-semibold text-gray-900 text-sm">
                      {o.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 mt-6">
            <div
              className={`w-2 h-2 rounded-full ${isBudget ? "bg-indigo-500" : "bg-gray-300"}`}
            />
            <div
              className={`w-2 h-2 rounded-full ${!isBudget ? "bg-indigo-500" : "bg-gray-300"}`}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── REVEAL ───────────────
  if (phase === "reveal" && cluster) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-fuchsia-950 relative overflow-hidden">
        <div className="max-w-lg mx-auto relative">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-white/70 hover:text-white transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-center text-white">
              <span className="text-xs font-bold uppercase tracking-wider">
                Tonight's mood
              </span>
            </div>

            <div className="px-6 pt-8 pb-4 text-center">
              <div className="text-6xl mb-3">{cluster.emoji}</div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-1">
                {cluster.name}
              </h2>
              <p className="text-sm text-gray-500 italic">{cluster.tagline}</p>
            </div>

            <div className="px-6 pb-4">
              <div className="rounded-2xl p-4 text-center bg-gradient-to-r from-gray-50 to-gray-100">
                <p className="text-lg font-bold text-gray-900 mb-1.5">
                  {cluster.revealHeadline}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {cluster.revealBody}
                </p>
              </div>
            </div>

            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-2xl">🍽️</span>
                <div className="text-left flex-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    Tonight, something like
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {cluster.sampleDish}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 space-y-2">
              <button
                type="button"
                onClick={handleFindMeal}
                className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center group"
              >
                Find meals like this
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                type="button"
                onClick={handleTryAgain}
                className="w-full py-3 rounded-2xl font-medium text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── OPENING / SCENE2 / TWIST ───────────────
  const stepConfig =
    phase === "opening"
      ? {
          prompt: openingScene.prompt,
          subtitle: openingScene.subtitle,
          options: openingScene.options,
          next: "scene2" as Phase,
          stepIndex: 1,
        }
      : phase === "scene2"
        ? {
            prompt: SCENE2_TEXT,
            subtitle: "",
            options: scene2Options,
            next: "twist" as Phase,
            stepIndex: 2,
          }
        : {
            prompt: TWIST_PROMPT,
            subtitle: TWIST_SUBTITLE,
            options: TWIST_OPTIONS,
            next: "reveal" as Phase,
            stepIndex: 3,
          };

  const progress = (stepConfig.stepIndex / 3) * 100;

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50">
      <div className="max-w-lg mx-auto">
        <button
          type="button"
          onClick={handleTopBack}
          className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back
        </button>

        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
          <div
            className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Scene {stepConfig.stepIndex} of 3
        </p>

        <div
          className={`bg-white rounded-3xl shadow-xl p-6 md:p-8 ${
            isAnimating ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          } transition-all duration-300`}
        >
          <div className="text-center mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 leading-snug">
              {stepConfig.prompt}
            </h2>
            {stepConfig.subtitle && (
              <p className="text-gray-500 text-sm">{stepConfig.subtitle}</p>
            )}
          </div>

          <div className="grid gap-3">
            {stepConfig.options.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onClick={() => advance(option, stepConfig.next)}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 hover:scale-[1.02] hover:shadow-md transition-all text-left animate-slide-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 flex items-center justify-center text-2xl">
                  {option.emoji}
                </span>
                <span className="font-semibold text-gray-900 text-sm leading-snug">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MoodJourney;
