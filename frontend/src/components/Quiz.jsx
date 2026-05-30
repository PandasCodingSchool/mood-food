import { useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

const questions = [
  {
    id: 1,
    question: 'How are you feeling?',
    subtitle: 'Your mood helps us understand what type of food you need right now.',
    options: [
      { value: 'happy', label: 'Happy', emoji: '😊', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
      { value: 'tired', label: 'Tired', emoji: '😴', color: 'bg-blue-100 text-blue-700 border-blue-200' },
      { value: 'stressed', label: 'Stressed', emoji: '😰', color: 'bg-red-100 text-red-700 border-red-200' },
      { value: 'celebrating', label: 'Celebrating', emoji: '🥳', color: 'bg-purple-100 text-purple-700 border-purple-200' },
      { value: 'relaxed', label: 'Relaxed', emoji: '😌', color: 'bg-green-100 text-green-700 border-green-200' },
      { value: 'adventurous', label: 'Adventurous', emoji: '🤩', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    ],
  },
  {
    id: 2,
    question: 'What sounds good?',
    subtitle: 'Tell us what kind of flavors you are craving today.',
    options: [
      { value: 'spicy', label: 'Spicy', emoji: '🌶️', color: 'bg-red-100 text-red-700 border-red-200' },
      { value: 'sweet', label: 'Sweet', emoji: '🍯', color: 'bg-pink-100 text-pink-700 border-pink-200' },
      { value: 'comfort', label: 'Comfort Food', emoji: '🍲', color: 'bg-amber-100 text-amber-700 border-amber-200' },
      { value: 'healthy', label: 'Healthy', emoji: '🥗', color: 'bg-green-100 text-green-700 border-green-200' },
      { value: 'light', label: 'Light', emoji: '🌿', color: 'bg-teal-100 text-teal-700 border-teal-200' },
      { value: 'indulgent', label: 'Indulgent', emoji: '🍰', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    ],
  },
  {
    id: 3,
    question: 'What is your budget?',
    subtitle: 'We will find options that match your spending preference.',
    options: [
      { value: 'low', label: 'Low', subtitle: 'Under ₹200', emoji: '💰', color: 'bg-green-100 text-green-700 border-green-200' },
      { value: 'medium', label: 'Medium', subtitle: '₹200 - ₹500', emoji: '💰💰', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
      { value: 'high', label: 'High', subtitle: 'Above ₹500', emoji: '💰💰💰', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    ],
  },
  {
    id: 4,
    question: 'Food preference?',
    subtitle: 'Help us filter the best options for you.',
    options: [
      { value: 'veg', label: 'Vegetarian', emoji: '🥬', color: 'bg-green-100 text-green-700 border-green-200' },
      { value: 'non-veg', label: 'Non-Vegetarian', emoji: '🍗', color: 'bg-orange-100 text-orange-700 border-orange-200' },
      { value: 'both', label: 'No Preference', emoji: '🍽️', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    ],
  },
];

function Quiz({ onComplete, onBack }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);

  const handleSelect = (value) => {
    trackEvent('quiz_question_answered', {
      question: questions[currentQuestion].id,
      answer: value,
    });

    setAnswers((prev) => ({
      ...prev,
      [questions[currentQuestion].id]: value,
    }));

    if (currentQuestion < questions.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentQuestion((prev) => prev + 1);
        setIsAnimating(false);
      }, 300);
    } else {
      // Complete quiz
      const results = {
        mood: answers[1] || value,
        craving: answers[2] || '',
        budget: answers[3] || '',
        preference: answers[4] || value,
      };
      onComplete(results);
    }
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

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

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Question {currentQuestion + 1} of {questions.length}
          </p>
        </div>

        {/* Question card */}
        <div className={`bg-white rounded-3xl shadow-xl p-8 md:p-12 ${isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'} transition-all duration-300`}>
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-primary-50 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-primary-700">
                Mood Quiz
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              {question.question}
            </h2>
            <p className="text-gray-600">
              {question.subtitle}
            </p>
          </div>

          {/* Options */}
          <div className={`grid gap-4 ${question.options.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleSelect(option.value)}
                className={`p-6 rounded-2xl border-2 text-center hover:scale-105 transition-all duration-200 group ${
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
