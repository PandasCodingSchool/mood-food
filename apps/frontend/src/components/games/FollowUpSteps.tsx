import { useEffect, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";

export interface FollowUpOption {
  value: string;
  label: string;
  emoji?: string;
  subtitle?: string;
}

export interface FollowUpStepConfig {
  key: "craving" | "budget" | "preference";
  title: string;
  subtitle?: string;
  options: FollowUpOption[];
  // Pre-highlighted option (derived from in-game selections). Rendered first
  // with a "Suggested" badge.
  suggestedValue?: string;
  // Optional async provider (LLM prefetch). Resolves to replacement options,
  // or null to keep the static ones. Never blocks: statics render immediately
  // and swap in-place only if this resolves before the user picks.
  loadOptions?: () => Promise<FollowUpOption[] | null>;
}

interface FollowUpStepsProps {
  steps: FollowUpStepConfig[];
  header?: React.ReactNode; // game-specific context chip above the card
  badgeLabel?: string; // small pill inside the card, e.g. "Your evening"
  onDone: (answers: Record<string, string>) => void;
  onBack: () => void;
}

function orderOptions(options: FollowUpOption[], suggestedValue?: string) {
  if (!suggestedValue) return options;
  const suggested = options.find((o) => o.value === suggestedValue);
  if (!suggested) return options;
  return [suggested, ...options.filter((o) => o.value !== suggestedValue)];
}

function FollowUpSteps({
  steps,
  header,
  badgeLabel = "Almost there",
  onDone,
  onBack,
}: FollowUpStepsProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [loadedOptions, setLoadedOptions] = useState<
    Record<string, FollowUpOption[]>
  >({});

  const step = steps[stepIndex];

  // Prefetch dynamic options for the current + next step; results swap in
  // only if they arrive before the user answers.
  useEffect(() => {
    for (const s of [steps[stepIndex], steps[stepIndex + 1]]) {
      if (!s?.loadOptions || loadedOptions[s.key]) continue;
      s.loadOptions().then((opts) => {
        if (opts && opts.length > 0) {
          setLoadedOptions((prev) =>
            prev[s.key] ? prev : { ...prev, [s.key]: opts },
          );
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  if (!step) return null;

  const options = orderOptions(
    loadedOptions[step.key] || step.options,
    step.suggestedValue,
  );
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const handleSelect = (value: string) => {
    const updated = { ...answers, [step.key]: value };
    setAnswers(updated);
    if (stepIndex < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setStepIndex((s) => s + 1);
        setIsAnimating(false);
      }, 280);
    } else {
      onDone(updated);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
    } else {
      onBack();
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back
      </button>

      {header}

      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div
          className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Step {stepIndex + 1} of {steps.length}
      </p>

      <div
        className={`bg-white rounded-3xl shadow-xl p-8 ${
          isAnimating ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        } transition-all duration-300`}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-medium text-primary-700">
              {badgeLabel}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {step.title}
          </h2>
          {step.subtitle && <p className="text-gray-600">{step.subtitle}</p>}
        </div>

        <div
          className={`grid gap-3 ${
            options.length <= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          {options.map((option) => {
            const isSuggested = option.value === step.suggestedValue;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`relative p-5 rounded-2xl border-2 transition-all text-center hover:scale-[1.02] ${
                  isSuggested
                    ? "border-primary-400 bg-primary-50/60 hover:border-primary-500"
                    : "border-gray-200 hover:border-primary-300"
                }`}
              >
                {isSuggested && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                    Suggested
                  </span>
                )}
                {option.emoji && (
                  <span className="text-3xl mb-2 block">{option.emoji}</span>
                )}
                <span className="font-semibold text-gray-900 block text-sm">
                  {option.label}
                </span>
                {option.subtitle && (
                  <span className="text-xs text-gray-500 mt-1 block">
                    {option.subtitle}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FollowUpSteps;
