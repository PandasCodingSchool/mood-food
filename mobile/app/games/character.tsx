import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CHARACTER_QUESTION_BANK,
  FIRST_QUESTION_ID,
  TOTAL_QUESTIONS,
  type CharacterQuestionOption,
} from '../../src/constants/characters';
import { buildUserVector, matchCharacter } from '../../src/utils/characterEngine';
import { trackEvent } from '../../src/utils/analytics';

type Phase = 'questions' | 'reveal';

export default function CharacterMatchScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('questions');
  const [currentQuestionId, setCurrentQuestionId] = useState(FIRST_QUESTION_ID);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<CharacterQuestionOption[]>([]);
  const [matchResult, setMatchResult] = useState<ReturnType<typeof matchCharacter> | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [preference, setPreference] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const question = CHARACTER_QUESTION_BANK[currentQuestionId];

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleSelect = (option: CharacterQuestionOption) => {
    const newSelections = [...selectedOptions, option];
    setSelectedOptions(newSelections);

    if (!option.next) {
      // Terminal — compute match
      const userVec = buildUserVector(newSelections);
      const result = matchCharacter(userVec);
      setMatchResult(result);
      trackEvent('character_matched', { character: result.character.id, match: result.matchPercent });
      animateNext(() => setPhase('reveal'));
    } else {
      animateNext(() => {
        setCurrentQuestionId(option.next!);
        setQuestionIndex((i) => i + 1);
      });
    }
  };

  const handleConfirm = () => {
    if (!matchResult || !budget || !preference) return;
    const char = matchResult.character;
    const results = {
      mood: char.mood,
      craving: char.craving,
      budget,
      preference,
      gameData: {
        type: 'character_match',
        characterId: char.id,
        characterName: char.name,
        matchPercent: matchResult.matchPercent,
      },
    };
    trackEvent('game_completed', { game: 'character', results });
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  const progress = (questionIndex / TOTAL_QUESTIONS) * 100;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
        >
          <Text className="text-gray-700 text-lg">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Character Match</Text>
          {phase === 'questions' && (
            <Text className="text-gray-400 text-sm">
              Question {questionIndex + 1} of {TOTAL_QUESTIONS}
            </Text>
          )}
        </View>
      </View>

      {phase === 'questions' && (
        <View className="mx-6 h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
          <View className="h-1.5 bg-orange-500 rounded-full" style={{ width: `${progress}%` }} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* QUESTIONS */}
          {phase === 'questions' && question && (
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-2 leading-snug">
                {question.prompt}
              </Text>
              {question.subtitle ? (
                <Text className="text-gray-500 text-base mb-8">{question.subtitle}</Text>
              ) : (
                <View className="mb-8" />
              )}
              {question.options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => handleSelect(option)}
                  className="border-2 border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center bg-white"
                  activeOpacity={0.75}
                  style={{ elevation: 1 }}
                >
                  <Text style={{ fontSize: 28 }} className="mr-4">{option.emoji}</Text>
                  <Text className="flex-1 text-gray-800 font-medium text-base">{option.label}</Text>
                  <Text className="text-gray-300 text-xl">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* REVEAL */}
          {phase === 'reveal' && matchResult && (
            <View>
              <View className="items-center py-6 bg-orange-50 rounded-3xl mb-6">
                <Text style={{ fontSize: 64 }}>{matchResult.character.emoji}</Text>
                <Text className="text-xl font-bold text-gray-900 mt-3">
                  You are {matchResult.character.name}
                </Text>
                <Text className="text-orange-500 font-semibold text-sm mt-1">
                  {matchResult.matchPercent}% match
                </Text>
                <Text className="text-gray-500 text-xs mt-0.5">{matchResult.character.show}</Text>
                <Text className="text-gray-600 text-sm text-center mt-3 px-6 italic">
                  "{matchResult.character.tagline}"
                </Text>
                <Text className="text-gray-500 text-sm text-center mt-2 px-6">
                  {matchResult.character.vibe}
                </Text>
              </View>

              <Text className="text-gray-700 font-semibold mb-2 text-center">
                🍽️ Signature food: {matchResult.character.signatureFood}
              </Text>

              {/* Runner-ups */}
              {matchResult.runnerUps.length > 0 && (
                <View className="flex-row gap-3 mb-6">
                  {matchResult.runnerUps.map((r) => (
                    <View key={r.character.id} className="flex-1 bg-gray-50 rounded-xl p-3 items-center">
                      <Text style={{ fontSize: 24 }}>{r.character.emoji}</Text>
                      <Text className="text-xs text-gray-600 font-medium mt-1 text-center">{r.character.name}</Text>
                      <Text className="text-xs text-gray-400">{r.matchPercent}%</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Budget */}
              {!budget && (
                <View className="mt-2">
                  <Text className="text-lg font-bold text-gray-900 mb-4 text-center">
                    What's your budget tonight?
                  </Text>
                  <View className="flex-row gap-3">
                    {[
                      { v: 'low', label: '💰\nBudget' },
                      { v: 'medium', label: '💰💰\nModerate' },
                      { v: 'high', label: '💰💰💰\nSplurge' },
                    ].map(({ v, label }) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setBudget(v)}
                        className="flex-1 border-2 border-orange-200 rounded-xl py-3 items-center bg-orange-50"
                      >
                        <Text className="text-center text-xs font-semibold text-gray-700">{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Preference */}
              {budget && !preference && (
                <View className="mt-4">
                  <Text className="text-lg font-bold text-gray-900 mb-4 text-center">
                    Dietary preference?
                  </Text>
                  <View className="flex-row gap-3">
                    {[
                      { v: 'veg', label: '🥬\nVeg' },
                      { v: 'non-veg', label: '🍗\nNon-Veg' },
                      { v: 'both', label: '🍽️\nBoth' },
                    ].map(({ v, label }) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setPreference(v)}
                        className="flex-1 border-2 border-orange-200 rounded-xl py-3 items-center bg-orange-50"
                      >
                        <Text className="text-center text-xs font-semibold text-gray-700">{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Confirm */}
              {budget && preference && (
                <TouchableOpacity
                  onPress={handleConfirm}
                  className="mt-6 bg-orange-500 rounded-2xl py-4 items-center"
                >
                  <Text className="text-white text-lg font-bold">Get My Meals ✨</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
