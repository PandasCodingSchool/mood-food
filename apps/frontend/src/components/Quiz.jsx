import { useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import {
  QUIZ_QUESTION_BANK,
  QUIZ_FIRST_QUESTION_ID,
  QUIZ_TOTAL_QUESTIONS,
} from '../constants/quizQuestions';
import { buildGameSignals } from '../utils/gameSignals';

function Quiz({ onComplete, onBack }) {
  // Track question by ID + history stack for back navigation
  const [currentId, setCurrentId] = useState(QUIZ_FIRST_QUESTION_ID);
  const [history, setHistory] = useState([]);
  const [answers, setAnswers] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);

  const question = QUIZ_QUESTION_BANK[currentId];
  const depth = history.length + 1;
  const progress = (depth / QUIZ_TOTAL_QUESTIONS) * 100;

  const handleSelect = (option) => {
    trackEvent('quiz_question_answered', {
      question: currentId,
      answer: option.value,
    });

    const nextAnswers = { ...answers, [question.outputKey]: option.value };
    setAnswers(nextAnswers);

    if (option.next) {
      setIsAnimating(true);
      setTimeout(() => {
        setHistory((h) => [...h, currentId]);
        setCurrentId(option.next);
        setIsAnimating(false);
      }, 300);
    } else {
      // Terminal question — build results and complete
      trackEvent('quiz_complete', nextAnswers);
      const mood = nextAnswers.mood || 'happy';
      const craving = nextAnswers.craving || 'comfort';
      const budget = nextAnswers.budget || 'moderate';
      const preference = nextAnswers.preference || 'both';
      onComplete({
        mood,
        craving,
        budget,
        preference,
        gameData: buildGameSignals({
          type: 'quiz',
          liked: [mood, craving],
          cravings: [craving],
          budgetTier: budget,
          dietPreference: preference,
          raw: { answers: nextAnswers },
        }),
      });
    }
  };

  const handleBack = () => {
    if (history.length === 0) {
      onBack();
      return;
    }
    const prevId = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentId(prevId);
    // Remove the answer for the question we're going back FROM
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[question.outputKey];
      return copy;
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Question {depth} of {QUIZ_TOTAL_QUESTIONS}
          </p>
        </div>

        {/* Question card */}
        <div
          className={`bg-white rounded-3xl shadow-xl p-8 md:p-12 ${
            isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          } transition-all duration-300`}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-primary-700">Mood Scoop</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              {question.question}
            </h2>
            <p className="text-gray-600">{question.subtitle}</p>
          </div>

          <div
            className={`grid gap-4 ${
              question.options.length <= 3
                ? 'md:grid-cols-3'
                : 'md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleSelect(option)}
                className={`p-6 rounded-2xl border-2 text-center hover:scale-105 transition-all duration-200 ${
                  option.color
                    ? option.color + ' hover:opacity-90'
                    : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <span className="text-4xl mb-3 block">{option.emoji}</span>
                <span className="font-semibold text-gray-900 block mb-1">
                  {option.label}
                </span>
                {option.subtitle && (
                  <span className="text-xs text-gray-500">{option.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Quiz;
