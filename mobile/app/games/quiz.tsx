import { useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { buildDynamicQuestions, getTotalQuestions, type QuizQuestion } from '../../src/utils/quizEngine';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { playPopSound } from '../../src/utils/sounds';
import { hapticSelect } from '../../src/utils/haptics';

export default function QuizScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const questions = useMemo(() => buildDynamicQuestions(answers), [answers]);
  const question: QuizQuestion = questions[step];
  const totalQuestions = getTotalQuestions();

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleSelect = (value: string) => {
    hapticSelect();
    playPopSound();
    const newAnswers = { ...answers, [question.outputKey]: value };
    setAnswers(newAnswers);

    setTimeout(() => {
      if (step < questions.length - 1) {
        animateNext(() => setStep((s) => s + 1));
      } else {
        trackEvent('quiz_completed', newAnswers);
        const results = {
          mood: newAnswers.mood || 'relaxed',
          craving: newAnswers.craving || 'comfort',
          budget: newAnswers.budget || 'medium',
          preference: 'both',
          gameData: { type: 'mood_scoop', time: newAnswers.time },
        };
        router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
      }
    }, 400);
  };

  const progress = ((step + 1) / totalQuestions) * 100;

  return (
    <LinearGradient colors={['#fff5eb', '#ffffff']} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <LinearGradient
            colors={['#f97316', '#fbbf24']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: '100%', width: `${progress}%`, borderRadius: 3 }}
          />
        </View>
        <Text style={[fw(800), { fontSize: 13, color: '#94a3b8' }]}>
          {step + 1}/{totalQuestions}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, gap: 24 }}>
          <Text style={{ fontSize: 40 }}>{question.emoji}</Text>
          <Text style={[fw(900), { fontSize: 24, color: colors.navy, lineHeight: 30 }]}>{question.question}</Text>

          <View style={{ gap: 12, marginTop: 8 }}>
            {question.options.map((opt, i) => {
              const isSelected = answers[question.outputKey] === opt.value;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => handleSelect(opt.value)}
                  style={{
                    padding: 16,
                    paddingHorizontal: 20,
                    borderRadius: 16,
                    backgroundColor: isSelected ? 'rgba(249,115,22,0.1)' : '#fff',
                    borderWidth: 2,
                    borderColor: isSelected ? colors.orange : 'rgba(0,0,0,0.08)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{opt.emoji}</Text>
                  <View>
                    <Text style={[fw(800), { fontSize: 15, color: isSelected ? colors.orange : colors.navy }]}>
                      {opt.label}
                    </Text>
                    <Text style={[fw(600), { fontSize: 12, color: isSelected ? '#fb923c' : '#94a3b8', marginTop: 2 }]}>
                      {opt.sub}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}
