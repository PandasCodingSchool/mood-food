import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Clapperboard,
  Sparkles,
  Trophy,
} from "lucide-react";
import {
  CHARACTERS,
  CHARACTER_QUESTION_BANK,
  FIRST_QUESTION_ID,
  TOTAL_QUESTIONS,
  type CharacterProfile,
  type CharacterQuestionOption,
} from "../../constants/characters";
import {
  buildUserVector,
  matchCharacter,
  type CharacterMatchResult,
} from "../../utils/characterEngine";
import { trackEvent } from "../../utils/analytics";
import type { GameResult } from "../../types";

type Phase = "intro" | "questions" | "computing" | "reveal" | "followUp";
type FollowUpStep = "budget" | "preference";

interface AIMatchResult {
  character_id: string;
  match_percent: number;
  spirit_animal: string;
}

interface CharacterMatchProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

// Small avatar component with fallback to emoji
function CharacterAvatar({
  character,
  size = "md",
  highlighted = false,
}: {
  character: CharacterProfile;
  size?: "sm" | "md" | "lg" | "xl";
  highlighted?: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const sizeClasses = {
    sm: "w-12 h-12 text-2xl",
    md: "w-20 h-20 text-4xl",
    lg: "w-32 h-32 text-6xl",
    xl: "w-44 h-44 text-7xl",
  }[size];

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${character.gradient} p-1 flex items-center justify-center flex-shrink-0 transition-all ${
        highlighted ? "ring-4 ring-white shadow-2xl scale-110" : "shadow-lg"
      }`}
    >
      <div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">
        {imageError ? (
          <span>{character.emoji}</span>
        ) : (
          <img
            src={character.imageUrl}
            alt={character.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}

// Confetti pieces for reveal screen
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2 + Math.random() * 2,
        emoji: ["🎉", "✨", "🍕", "🌟", "🎬"][Math.floor(Math.random() * 5)],
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute text-2xl animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: "-10%",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

function CharacterMatch({ onComplete, onBack }: CharacterMatchProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  // Track current question by ID + a history stack for back navigation
  const [currentQuestionId, setCurrentQuestionId] = useState(FIRST_QUESTION_ID);
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [selections, setSelections] = useState<CharacterQuestionOption[]>([]);
  const [answers, setAnswers] = useState<
    Array<{ questionId: string; optionId: string }>
  >([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [matchResult, setMatchResult] = useState<CharacterMatchResult | null>(
    null,
  );
  const [spiritAnimal, setSpiritAnimal] = useState<string>("");
  const [revealStep, setRevealStep] = useState(0); // for staggered reveal animation
  const [followUpStep, setFollowUpStep] = useState<FollowUpStep>("budget");
  const [followUpAnswers, setFollowUpAnswers] = useState<{ budget?: string; preference?: string }>({});

  const currentQuestion = CHARACTER_QUESTION_BANK[currentQuestionId];
  // depth = how many questions answered so far + 1
  const questionDepth = questionHistory.length + 1;
  const progress = (questionDepth / TOTAL_QUESTIONS) * 100;

  // After all answers, call AI to match the character
  useEffect(() => {
    if (phase !== "computing") return;

    // Build full Q&A for AI using the question bank
    const fullAnswers = answers.map(({ questionId, optionId }) => {
      const question = CHARACTER_QUESTION_BANK[questionId];
      const option = question?.options.find((o) => o.id === optionId);
      return {
        question: question?.prompt ?? questionId,
        selected: option?.label ?? optionId,
        emoji: option?.emoji ?? "",
      };
    });

    const resolveWithFallback = () => {
      const userVector = buildUserVector(selections);
      return matchCharacter(userVector);
    };

    const API_BASE = import.meta.env.VITE_API_URL || "/api";

    // The character is chosen deterministically from the trait vector (unbiased);
    // the AI is only asked to write the spirit-animal blurb for that character.
    const localBlurb = (c: (typeof CHARACTERS)[number]) =>
      `${c.tagline} ${c.vibe}`;

    const runMatch = async () => {
      const local = resolveWithFallback();
      setMatchResult(local);

      try {
        const resp = await fetch(`${API_BASE}/character-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: fullAnswers,
            character_id: local.character.id,
            match_percent: local.matchPercent,
          }),
          signal: AbortSignal.timeout(12000),
        });
        const data: AIMatchResult | null = resp.ok ? await resp.json() : null;
        // Only trust the AI blurb if it describes the character WE chose — a stale
        // backend may re-pick and return a description for the wrong character.
        const matchesChosen =
          !!data?.spirit_animal &&
          (!data.character_id || data.character_id === local.character.id);
        setSpiritAnimal(
          matchesChosen ? data!.spirit_animal : localBlurb(local.character),
        );
      } catch {
        setSpiritAnimal(localBlurb(local.character));
      }

      setPhase("reveal");
    };

    // Minimum 1.5 s of "computing" drama, then resolve
    const [matchPromise] = [runMatch()];
    const minDelay = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.all([matchPromise, minDelay]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Staggered reveal animation
  useEffect(() => {
    if (phase !== "reveal") return;
    setRevealStep(0);
    const steps = [400, 800, 1200, 1600];
    const timers = steps.map((delay, i) =>
      setTimeout(() => setRevealStep(i + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const handleStart = () => {
    trackEvent("character_game_started");
    setPhase("questions");
  };

  const handleSelect = (option: CharacterQuestionOption) => {
    const nextSelections = [...selections, option];
    const nextAnswers = [
      ...answers,
      { questionId: currentQuestion.id, optionId: option.id },
    ];
    setSelections(nextSelections);
    setAnswers(nextAnswers);

    trackEvent("character_question_answered", {
      questionId: currentQuestion.id,
      optionId: option.id,
    });

    if (option.next) {
      // Branch to the linked next question
      setIsAnimating(true);
      setTimeout(() => {
        setQuestionHistory((h) => [...h, currentQuestionId]);
        setCurrentQuestionId(option.next!);
        setIsAnimating(false);
      }, 260);
    } else {
      // No next means this is the final question
      setPhase("computing");
    }
  };

  const handleQuestionBack = () => {
    if (questionHistory.length === 0) {
      setPhase("intro");
      return;
    }
    const prevId = questionHistory[questionHistory.length - 1];
    setQuestionHistory((h) => h.slice(0, -1));
    setCurrentQuestionId(prevId);
    setSelections((s) => s.slice(0, -1));
    setAnswers((a) => a.slice(0, -1));
  };

  const handleTopBack = () => {
    if (phase === "intro") onBack();
    else if (phase === "questions") handleQuestionBack();
    else if (phase === "reveal") {
      // Step back into the final question of the path
      setPhase("questions");
      setSelections((s) => s.slice(0, -1));
      setAnswers((a) => a.slice(0, -1));
      setMatchResult(null);
    }
  };

  const handleFindMeal = () => {
    if (!matchResult) return;
    setFollowUpStep("budget");
    setFollowUpAnswers({});
    setPhase("followUp");
  };

  const handleFollowUpSelect = (value: string) => {
    if (!matchResult) return;
    const c = matchResult.character;

    if (followUpStep === "budget") {
      setFollowUpAnswers({ budget: value });
      setFollowUpStep("preference");
    } else {
      const budget = followUpAnswers.budget || c.budget;
      const preference = value;

      trackEvent("character_game_complete", {
        characterId: c.id,
        mood: c.mood,
        craving: c.craving,
        budget,
        preference,
      });

      onComplete({
        mood: c.mood,
        craving: c.craving,
        budget,
        preference,
        gameData: {
          type: "character_match",
          character: {
            id: c.id,
            name: c.name,
            show: c.show,
            emoji: c.emoji,
            tagline: c.tagline,
            vibe: c.vibe,
            signatureFood: c.signatureFood,
            characterDishes: c.characterDishes,
            traits: c.traits,
          },
          matchPercentage: matchResult.matchPercent,
          userTraits: matchResult.userVector,
          answers,
        },
      });
    }
  };

  const handleTryAgain = () => {
    setPhase("intro");
    setCurrentQuestionId(FIRST_QUESTION_ID);
    setQuestionHistory([]);
    setSelections([]);
    setAnswers([]);
    setMatchResult(null);
    setSpiritAnimal("");
    setFollowUpAnswers({});
    setFollowUpStep("budget");
  };

  // ─────────────── INTRO ───────────────
  if (phase === "intro") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-fuchsia-200 rounded-full blur-3xl opacity-40" />
        <div className="absolute top-48 -left-24 w-64 h-64 bg-purple-200 rounded-full blur-3xl opacity-30" />

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
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-fuchsia-500 to-purple-500 rounded-2xl mb-4 shadow-lg shadow-fuchsia-200">
              <Clapperboard className="w-7 h-7 text-white" />
            </div>

            <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">
              Which TV character{" "}
              <span className="bg-gradient-to-r from-fuchsia-500 to-purple-500 bg-clip-text text-transparent">
                are you tonight?
              </span>
            </h1>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Answer {TOTAL_QUESTIONS} quick questions. We'll match you with a
              sitcom or Bollywood icon, then serve up a meal in their vibe.
            </p>

            {/* Character lineup preview */}
            <div className="mb-8">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                Could you be one of these?
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {CHARACTERS.map((c, i) => (
                  <div
                    key={c.id}
                    className="relative group cursor-default animate-fade-in"
                    style={{ animationDelay: `${i * 0.06}s` }}
                  >
                    <CharacterAvatar character={c} size="md" />
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-base">
                      {c.emoji}
                    </div>
                    <p className="text-[10px] font-semibold text-gray-600 mt-1.5 leading-tight max-w-[80px] mx-auto">
                      {c.name.split(" ")[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStart}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white hover:shadow-xl hover:shadow-fuchsia-200/50 hover:scale-[1.02] transition-all flex items-center justify-center group"
            >
              Let's find out
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>

            <p className="text-xs text-gray-400 mt-6">
              ⏱️ Takes ~30 seconds · {CHARACTERS.length} characters · No
              spoilers
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── COMPUTING ───────────────
  if (phase === "computing") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="relative w-32 h-32 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-fuchsia-200 border-t-fuchsia-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl animate-pulse">🎬</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Casting your character...
          </h2>
          <p className="text-gray-500">Reading the script of your evening</p>
          <div className="flex justify-center gap-2 mt-6">
            {CHARACTERS.slice(0, 5).map((c, i) => (
              <div
                key={c.id}
                className="animate-bounce"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <CharacterAvatar character={c} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── FOLLOW-UP (budget + preference) ───────────────
  if (phase === "followUp" && matchResult) {
    const c = matchResult.character;
    const isBudget = followUpStep === "budget";

    const BUDGET_OPTIONS = [
      { value: "budget", label: "Budget", emoji: "💰", subtitle: "Under ₹300" },
      { value: "moderate", label: "Moderate", emoji: "💰💰", subtitle: "₹300–₹800" },
      { value: "splurge", label: "Splurge", emoji: "💰💰💰", subtitle: "Above ₹800" },
    ];
    const PREF_OPTIONS = [
      { value: "veg", label: "Vegetarian", emoji: "🥬" },
      { value: "non-veg", label: "Non-Vegetarian", emoji: "🍗" },
      { value: "both", label: "No Preference", emoji: "🍽️" },
    ];

    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => isBudget ? setPhase("reveal") : setFollowUpStep("budget")}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Back
          </button>

          <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-fuchsia-100 rounded-full mb-4">
              <span className="text-3xl">{c.emoji}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isBudget ? "What's your budget today?" : "Any dietary preference?"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {isBudget
                ? `${c.name} vibes — but your wallet has the final say.`
                : `So we only show you dishes you'd actually eat.`}
            </p>

            {isBudget ? (
              <div className="space-y-3">
                {BUDGET_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleFollowUpSelect(o.value)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-2 border-transparent hover:border-fuchsia-300 hover:bg-fuchsia-50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{o.emoji}</span>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900">{o.label}</p>
                        <p className="text-xs text-gray-400">{o.subtitle}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {PREF_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleFollowUpSelect(o.value)}
                    className="p-5 rounded-2xl border-2 border-gray-200 hover:border-fuchsia-400 hover:bg-fuchsia-50 hover:scale-105 transition-all text-center"
                  >
                    <span className="text-3xl mb-2 block">{o.emoji}</span>
                    <span className="font-semibold text-gray-900 text-sm">{o.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            <div className={`w-2 h-2 rounded-full ${isBudget ? "bg-fuchsia-500" : "bg-gray-300"}`} />
            <div className={`w-2 h-2 rounded-full ${!isBudget ? "bg-fuchsia-500" : "bg-gray-300"}`} />
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── REVEAL ───────────────
  if (phase === "reveal" && matchResult) {
    const c = matchResult.character;

    return (
      <div
        className={`min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br ${c.gradient} relative overflow-hidden`}
      >
        <Confetti />

        <div className="max-w-lg mx-auto relative">
          <button
            type="button"
            onClick={handleTopBack}
            className="flex items-center text-white/90 hover:text-white transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            {/* Header strip with gradient */}
            <div
              className={`bg-gradient-to-r ${c.gradient} px-6 py-3 flex items-center justify-between text-white`}
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Your Match
                </span>
              </div>
              <span className="text-xs font-medium opacity-90">
                {matchResult.matchPercent}% match
              </span>
            </div>

            {/* Big avatar */}
            <div className="relative px-6 pt-8 pb-4 text-center">
              <p
                className={`text-sm font-medium text-fuchsia-600 mb-3 transition-all duration-500 ${
                  revealStep >= 0
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-2"
                }`}
              >
                You're feeling like...
              </p>

              <div
                className={`inline-block transition-all duration-700 ${
                  revealStep >= 1
                    ? "opacity-100 scale-100 rotate-0"
                    : "opacity-0 scale-50 rotate-12"
                }`}
              >
                <CharacterAvatar character={c} size="xl" highlighted />
              </div>

              <div
                className={`mt-4 transition-all duration-500 ${
                  revealStep >= 2
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-3"
                }`}
              >
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-1">
                  {c.name}
                </h2>
                <p className="text-sm text-gray-500 italic">from {c.show}</p>
              </div>
            </div>

            {/* Tagline + spirit animal / vibe */}
            <div
              className={`px-6 pb-4 transition-all duration-500 ${
                revealStep >= 3
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-3"
              }`}
            >
              <div
                className="rounded-2xl p-4 text-center"
                style={{
                  background: `linear-gradient(to right, rgb(243 244 246), rgb(249 250 251))`,
                }}
              >
                <p className="text-xl font-bold text-gray-900 mb-1.5 italic">
                  "{c.tagline}"
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {spiritAnimal || c.vibe}
                </p>
                {spiritAnimal && (
                  <p className="text-xs text-fuchsia-500 mt-2 font-semibold uppercase tracking-wider">
                    ✨ Your spirit animal tonight
                  </p>
                )}
              </div>
            </div>

            {/* Signature food + mood chips */}
            <div
              className={`px-6 pb-4 transition-all duration-500 ${
                revealStep >= 3
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-3"
              }`}
            >
              <div className="flex items-center gap-2 mb-3 px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-2xl">{c.emoji}</span>
                <div className="text-left flex-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    Signature food
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {c.signatureFood}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-1.5">
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium capitalize">
                  {c.mood}
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium capitalize">
                  {c.craving}
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium capitalize">
                  {c.budget} budget
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium capitalize">
                  {c.preference}
                </span>
              </div>
            </div>

            {/* Runner-ups */}
            {matchResult.runnerUps.length > 0 && (
              <div
                className={`px-6 pb-4 transition-all duration-500 ${
                  revealStep >= 4
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-3"
                }`}
              >
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Also a bit of...
                </p>
                <div className="flex gap-3">
                  {matchResult.runnerUps.map((r) => (
                    <div
                      key={r.character.id}
                      className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-xl"
                    >
                      <CharacterAvatar character={r.character} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {r.character.name.split(" ")[0]}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {r.matchPercent}% match
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="px-6 pb-6 pt-2 space-y-2">
              <button
                type="button"
                onClick={handleFindMeal}
                className={`w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r ${c.gradient} text-white hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center group`}
              >
                Find my {c.name.split(" ")[0]}-coded meal
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                type="button"
                onClick={handleTryAgain}
                className="w-full py-3 rounded-2xl font-medium text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Not me. Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── QUESTIONS ───────────────
  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50">
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
            className="bg-gradient-to-r from-fuchsia-500 to-purple-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Question {questionDepth} of {TOTAL_QUESTIONS}
        </p>

        <div
          className={`bg-white rounded-3xl shadow-xl p-6 md:p-8 ${
            isAnimating
              ? "opacity-0 translate-y-4"
              : "opacity-100 translate-y-0"
          } transition-all duration-300`}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-fuchsia-50 rounded-full px-4 py-2 mb-4">
              <Sparkles className="w-4 h-4 text-fuchsia-500" />
              <span className="text-sm font-medium text-fuchsia-700">
                Tell us about you
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {currentQuestion.prompt}
            </h2>
            {currentQuestion.subtitle && (
              <p className="text-gray-500 text-sm">
                {currentQuestion.subtitle}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {currentQuestion.options.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option)}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-gray-200 hover:border-fuchsia-400 hover:bg-fuchsia-50/40 hover:scale-[1.02] hover:shadow-md transition-all text-left animate-slide-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-100 to-purple-100 flex items-center justify-center text-2xl">
                  {option.emoji}
                </span>
                <span className="font-semibold text-gray-900 text-sm leading-snug">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Mini character reel - hint at upcoming reveal */}
        <div className="mt-6 flex justify-center gap-2 opacity-60">
          {CHARACTERS.slice(0, 6).map((c) => (
            <div
              key={c.id}
              className="w-8 h-8 rounded-full bg-gradient-to-br p-0.5"
              style={{
                backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
              }}
            >
              <CharacterAvatar character={c} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CharacterMatch;
