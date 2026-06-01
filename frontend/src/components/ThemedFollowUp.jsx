import { useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import {
  CRAVING_OPTIONS,
  BUDGET_OPTIONS,
  PREFERENCE_OPTIONS,
  getMoodByValue,
} from '../constants/moods';
import { FollowUpOptionIcon, MoodIcon } from './icons/Icon';
import { FOLLOW_UP_COPY, FOLLOW_UP_STEPS } from '../constants/followUpCopy';
import { trackEvent } from '../utils/analytics';

const OPTIONS_BY_FIELD = {
  craving: CRAVING_OPTIONS,
  budget: BUDGET_OPTIONS,
  preference: PREFERENCE_OPTIONS,
};

function ThemedFollowUp({
  source,
  mood,
  blendContext = null,
  storySummary = null,
  onComplete,
  onBack,
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);

  const copy = FOLLOW_UP_COPY[source] || FOLLOW_UP_COPY.blender;
  const current = FOLLOW_UP_STEPS[step];
  const stepCopy = copy[current.key];
  const options = OPTIONS_BY_FIELD[current.field];
  const progress = ((step + 1) / FOLLOW_UP_STEPS.length) * 100;

  const moodMeta = getMoodByValue(mood);
  const contextIcon = blendContext?.resultIcon || moodMeta?.icon || mood;
  const contextLabel = blendContext?.blendName || moodMeta?.label || mood;

  const handleSelect = (value) => {
    const field = current.field;
    const updated = { ...answers, [field]: value };

    trackEvent('followup_step_answered', {
      source,
      step: current.key,
      answer: value,
    });

    setAnswers(updated);

    if (step < FOLLOW_UP_STEPS.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setStep((s) => s + 1);
        setIsAnimating(false);
      }, 280);
    } else {
      trackEvent('journey_completed', { source });
      onComplete({
        mood,
        craving: updated.craving,
        budget: updated.budget,
        preference: updated.preference,
        blendContext,
        storySummary,
        source,
      });
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      onBack();
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="sticky top-16 z-10 mb-6 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border border-gray-200 rounded-full px-4 py-2 shadow-sm text-sm">
            <MoodIcon mood={contextIcon} size={28} />
            <span className="font-medium text-gray-800">{contextLabel}</span>
          </div>
          {storySummary && source === 'story' && (
            <p className="text-xs text-gray-500 text-center max-w-sm px-2">{storySummary}</p>
          )}
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div
          className={`bg-white rounded-3xl shadow-xl p-8 md:p-12 ${
            isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          } transition-all duration-300`}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-primary-700 capitalize">
                {source === 'story' ? 'Your evening' : source === 'roulette' ? 'After the spin' : 'Almost there'}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              {stepCopy.title}
            </h2>
            <p className="text-gray-600">{stepCopy.subtitle}</p>
          </div>

          <div
            className={`grid gap-3 ${
              options.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
            }`}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className="p-5 rounded-2xl border-2 border-gray-200 hover:border-primary-300 hover:scale-[1.02] transition-all text-center"
              >
                <span className="mb-2 flex justify-center">
                  <FollowUpOptionIcon field={current.field} option={option} size={44} />
                </span>
                <span className="font-semibold text-gray-900 block text-sm">{option.label}</span>
                {option.subtitle && (
                  <span className="text-xs text-gray-500 mt-1 block">{option.subtitle}</span>
                )}
              </button>
            ))}
          </div>

          {step === FOLLOW_UP_STEPS.length - 1 && (
            <p className="text-center text-xs text-gray-400 mt-6">
              Tap a choice to get your meal picks
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThemedFollowUp;
