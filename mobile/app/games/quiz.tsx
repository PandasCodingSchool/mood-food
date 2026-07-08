import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  QUIZ_QUESTION_BANK,
  QUIZ_FIRST_QUESTION_ID,
  QUIZ_TOTAL_QUESTIONS,
} from '../../src/constants/quizQuestions';
import { trackEvent } from '../../src/utils/analytics';

export default function QuizScreen() {
  const router = useRouter();
  const [currentQuestionId, setCurrentQuestionId] = useState(QUIZ_FIRST_QUESTION_ID);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const question = QUIZ_QUESTION_BANK[currentQuestionId];

  useEffect(() => {
    trackEvent('quiz_started');
  }, []);

  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.delay(50),
    ]).start(() => {
      callback();
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const handleSelect = (value: string, next?: string) => {
    const newAnswers = { ...answers, [question.outputKey]: value };
    setAnswers(newAnswers);

    if (!next) {
      // Terminal question — complete quiz
      trackEvent('quiz_completed', newAnswers);
      const results = {
        mood: newAnswers.mood || '',
        craving: newAnswers.craving || '',
        budget: newAnswers.budget || '',
        preference: newAnswers.preference || '',
        gameData: { type: 'quiz', ...newAnswers },
      };
      router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
      return;
    }

    animateTransition(() => {
      setCurrentQuestionId(next);
      setQuestionIndex((i) => i + 1);
    });
  };

  const handleBack = () => {
    if (questionIndex === 0) {
      router.back();
      return;
    }
    // Can't easily go back in branching tree — go to game selector
    router.back();
  };

  const progress = ((questionIndex) / QUIZ_TOTAL_QUESTIONS) * 100;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity
            onPress={handleBack}
            className="mr-4 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
          >
            <Text className="text-gray-700 text-lg">←</Text>
          </TouchableOpacity>
          <Text className="text-gray-500 text-sm">
            Question {questionIndex + 1} of {QUIZ_TOTAL_QUESTIONS}
          </Text>
        </View>

        {/* Progress bar */}
        <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <View
            className="h-2 bg-orange-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
          <Text className="text-2xl font-bold text-gray-900 mb-2 leading-snug">
            {question.question}
          </Text>
          <Text className="text-gray-500 text-base mb-8">{question.subtitle}</Text>

          <View>
            {question.options.map((option) => (
              <TouchableOpacity
                key={option.value}
                className="border-2 border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center bg-white"
                style={{ elevation: 1 }}
                activeOpacity={0.75}
                onPress={() => handleSelect(option.value, option.next)}
              >
                <Text style={{ fontSize: 32 }} className="mr-4">
                  {option.emoji}
                </Text>
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold text-base">{option.label}</Text>
                  {option.subtitle ? (
                    <Text className="text-gray-400 text-sm mt-0.5">{option.subtitle}</Text>
                  ) : null}
                </View>
                <Text className="text-gray-300 text-xl">›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
