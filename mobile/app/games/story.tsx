import { useState, useMemo, useRef } from 'react';
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
import { getActiveStory, getMoodCravingFollowUp, STORY_FOLLOW_UP } from '../../src/constants/storyBeats';
import { computeMoodFromStory } from '../../src/utils/storyEngine';
import { trackEvent } from '../../src/utils/analytics';

type Phase = 'intro' | 'beats' | 'reveal' | 'followUp';
const FOLLOW_UP_STEPS = ['craving', 'budget', 'preference'] as const;

export default function DayStoryScreen() {
  const router = useRouter();
  const activeStory = useMemo(() => getActiveStory(), []);
  const { beats, coldOpen, timeSlot, followUp } = activeStory;

  const [phase, setPhase] = useState<Phase>('intro');
  const [beatIndex, setBeatIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [reveal, setReveal] = useState<ReturnType<typeof computeMoodFromStory> | null>(null);
  const [followUpStep, setFollowUpStep] = useState(0);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const beat = beats[beatIndex];
  const currentFollowUpKey = FOLLOW_UP_STEPS[followUpStep];
  const followUpConfig =
    currentFollowUpKey === 'craving' && reveal
      ? getMoodCravingFollowUp(reveal.moodSlug)
      : followUp[currentFollowUpKey];

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleChoice = (choiceId: string) => {
    const next = [...choices, choiceId];
    setChoices(next);
    trackEvent('story_beat_answered', { beat: beat.id, choice: choiceId });

    if (beatIndex + 1 < beats.length) {
      animateNext(() => setBeatIndex((i) => i + 1));
    } else {
      const result = computeMoodFromStory(next);
      setReveal(result);
      animateNext(() => setPhase('reveal'));
    }
  };

  const handleRevealNext = () => {
    animateNext(() => setPhase('followUp'));
  };

  const handleFollowUp = (value: string) => {
    const newAnswers = { ...followUpAnswers, [currentFollowUpKey]: value };
    setFollowUpAnswers(newAnswers);

    if (followUpStep + 1 < FOLLOW_UP_STEPS.length) {
      animateNext(() => setFollowUpStep((s) => s + 1));
    } else {
      const results = {
        mood: reveal?.moodSlug || 'relaxed',
        craving: newAnswers.craving || 'comfort',
        budget: newAnswers.budget || 'medium',
        preference: newAnswers.preference || 'both',
        gameData: {
          type: 'day_story',
          timeSlot,
          choices,
          moodVector: reveal?.vector,
        },
      };
      trackEvent('game_completed', { game: 'story', results });
      router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
    }
  };

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
        <Text className="text-xl font-bold text-gray-900">Day Story</Text>
        {phase === 'beats' && (
          <Text className="ml-auto text-gray-400 text-sm">
            {beatIndex + 1}/{beats.length}
          </Text>
        )}
      </View>

      {/* Progress bar (beats phase) */}
      {phase === 'beats' && (
        <View className="mx-6 h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
          <View
            className="h-1 bg-orange-400 rounded-full"
            style={{ width: `${((beatIndex) / beats.length) * 100}%` }}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>

          {/* INTRO */}
          {phase === 'intro' && (
            <View className="flex-1 justify-center">
              <Text className="text-3xl font-bold text-gray-900 mb-4 leading-snug">
                {coldOpen.title}
              </Text>
              <Text className="text-gray-500 text-base mb-10 leading-relaxed">
                {coldOpen.subtitle}
              </Text>
              <TouchableOpacity
                onPress={() => { trackEvent('story_started', { timeSlot }); animateNext(() => setPhase('beats')); }}
                className="bg-orange-500 rounded-2xl py-4 items-center"
              >
                <Text className="text-white text-lg font-bold">📖 Begin Story</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* BEATS */}
          {phase === 'beats' && beat && (
            <View>
              <Text className="text-xs font-semibold text-orange-500 uppercase tracking-widest mb-3">
                {beat.segmentLabel}
              </Text>
              <Text className="text-xl font-bold text-gray-900 mb-6 leading-snug">
                {beat.narrative}
              </Text>
              {beat.choices.map((choice) => (
                <TouchableOpacity
                  key={choice.id}
                  onPress={() => handleChoice(choice.id)}
                  className="border-2 border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center bg-white"
                  activeOpacity={0.75}
                  style={{ elevation: 1 }}
                >
                  <Text style={{ fontSize: 28 }} className="mr-4">{choice.emoji}</Text>
                  <Text className="flex-1 text-gray-800 font-medium text-base">{choice.label}</Text>
                  <Text className="text-gray-300 text-xl">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* REVEAL */}
          {phase === 'reveal' && reveal && (
            <View className="items-center justify-center flex-1 py-8">
              <Text style={{ fontSize: 64 }}>{reveal.moodEmoji}</Text>
              <Text className="text-2xl font-bold text-gray-900 mt-4 mb-2 text-center">
                You're feeling {reveal.moodLabel}
              </Text>
              <Text className="text-gray-500 text-base text-center mb-10 leading-relaxed px-4">
                {reveal.storySummary}
              </Text>
              <TouchableOpacity
                onPress={handleRevealNext}
                className="bg-orange-500 rounded-2xl py-4 px-8 items-center"
              >
                <Text className="text-white text-lg font-bold">Find My Meal ✨</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* FOLLOW-UP */}
          {phase === 'followUp' && followUpConfig && (
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-2 leading-snug">
                {followUpConfig.title}
              </Text>
              <Text className="text-gray-500 text-base mb-8">{followUpConfig.subtitle}</Text>
              {followUpConfig.options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => handleFollowUp(opt.value)}
                  className="border-2 border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center bg-white"
                  activeOpacity={0.75}
                  style={{ elevation: 1 }}
                >
                  <Text style={{ fontSize: 28 }} className="mr-4">{opt.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-base">{opt.label}</Text>
                    {'subtitle' in opt && opt.subtitle ? (
                      <Text className="text-gray-400 text-sm mt-0.5">{(opt as { subtitle: string }).subtitle}</Text>
                    ) : null}
                  </View>
                  <Text className="text-gray-300 text-xl">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
