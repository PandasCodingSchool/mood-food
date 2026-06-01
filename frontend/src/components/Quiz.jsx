import { useState, useMemo } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { QUIZ_QUESTIONS } from '../constants/moods';

function Quiz({
  onComplete,
  onBack,
  initialMood = null,
  skipFirstQuestion = false,
  blendContext = null,
}) {
  const activeQuestions = useMemo(() => {
    if (skipFirstQuestion) {
      return QUIZ_QUESTIONS.filter((q) => q.id !== 1);
    }
    return QUIZ_QUESTIONS;
  }, [skipFirstQuestion]);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState(() =>
    initialMood ? { 1: initialMood } : {},
  );
  const [isAnimating, setIsAnimating] = useState(false);

  const handleSelect = (value) => {
    const question = activeQuestions[currentQuestion];
    const updatedAnswers = {
      ...answers,
      [question.id]: value,
    };

    trackEvent('quiz_question_answered', {
      question: question.id,
      answer: value,
    });

    setAnswers(updatedAnswers);

    if (currentQuestion < activeQuestions.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentQuestion((prev) => prev + 1);
        setIsAnimating(false);
      }, 300);
    } else {
      onComplete({
        mood: updatedAnswers[1] || initialMood,
        craving: updatedAnswers[2] || '',
        budget: updatedAnswers[3] || '',
        preference: updatedAnswers[4] || value,
        blendContext,
        source: 'quiz',
      });
    }
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const question = activeQuestions[currentQuestion];
  const progress = ((currentQuestion + 1) / activeQuestions.length) * 100;

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>

          {blendContext && (
            <div className="inline-flex items-center gap-2 bg-secondary-50 border border-secondary-200 rounded-full px-4 py-2 mb-4 text-sm">
              <span className="text-lg">{blendContext.resultEmoji}</span>
              <span className="font-medium text-secondary-800">
                Your blend: {blendContext.blendName}
              </span>
            </div>
          )}

          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Question {currentQuestion + 1} of {activeQuestions.length}
          </p>
        </div>

        <div
          className={`bg-white rounded-3xl shadow-xl p-8 md:p-12 ${
            isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          } transition-all duration-300`}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-primary-700">
                {skipFirstQuestion ? 'Quick picks' : 'Mood Quiz'}
              </span>
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
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`p-6 rounded-2xl border-2 text-center hover:scale-105 transition-all duration-200 ${
                  answers[question.id] === option.value
                    ? 'border-primary-500 bg-primary-50'
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
