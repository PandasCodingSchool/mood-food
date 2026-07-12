import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { DAY_SCENES, type DayMood } from '../../src/constants/storyBeats';
import { getDayMood } from '../../src/utils/storyEngine';
import { fw } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { bounceIn, floatLoop } from '../../src/utils/animations';

function Reveal({ mood, onContinue }: { mood: DayMood; onContinue: () => void }) {
  const emojiScale = useRef(new Animated.Value(0.3)).current;
  useEffect(() => { bounceIn(emojiScale); }, []);

  return (
    <LinearGradient colors={['#0f172a', '#1e293b', '#334155']} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
        <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, textTransform: 'uppercase' }]}>
          Your day says you're feeling
        </Text>
        <Animated.Text style={{ fontSize: 64, marginVertical: 12, transform: [{ scale: emojiScale }] }}>{mood.emoji}</Animated.Text>
        <Text style={[fw(900), { fontSize: 30, color: '#fff', textAlign: 'center' }]}>{mood.label}</Text>
        <Text style={[fw(600), { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 280, lineHeight: 20, marginTop: 4 }]}>
          {mood.desc}
        </Text>

        <View style={{ marginTop: 24, width: '100%', flexDirection: 'row', gap: 10 }}>
          {mood.tags.map((tag, i) => (
            <View key={i} style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>{tag.emoji}</Text>
              <Text style={[fw(700), { fontSize: 11, color: 'rgba(255,255,255,0.7)' }]}>{tag.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={{ width: '100%', marginTop: 28 }}>
          <LinearGradient colors={['#0891b2', '#22d3ee']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[fw(900), { fontSize: 16, color: '#fff' }]}>🍽️ Get my meal picks</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export default function DayStoryScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [mood, setMood] = useState<DayMood | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const sceneFloat = useRef(new Animated.Value(0)).current;

  const scene = DAY_SCENES[step];

  useEffect(() => {
    const loop = floatLoop(sceneFloat, 8, 1500);
    return () => loop.stop();
  }, [step]);

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleChoice = (choiceIndex: number) => {
    const newAnswers = [...answers, choiceIndex];
    setAnswers(newAnswers);
    trackEvent('story_beat_answered', { beat: scene.location, choice: choiceIndex });

    setTimeout(() => {
      if (step < DAY_SCENES.length - 1) {
        animateNext(() => setStep((s) => s + 1));
      } else {
        setMood(getDayMood(newAnswers));
      }
    }, 500);
  };

  if (mood) {
    return (
      <Reveal
        mood={mood}
        onContinue={() => {
          const results = {
            mood: mood.mood,
            craving: mood.craving,
            budget: mood.budget,
            preference: mood.preference,
            gameData: { type: 'day_story', dayMood: mood.label },
          };
          trackEvent('game_completed', { game: 'story', results });
          router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
        }}
      />
    );
  }

  return (
    <LinearGradient colors={scene.colors} locations={scene.locations} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {DAY_SCENES.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ paddingTop: 16, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' }}>
          <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.9)' }]}>{scene.time}</Text>
        </View>
        <Text style={[fw(700), { fontSize: 12, color: 'rgba(255,255,255,0.5)' }]}>{scene.location}</Text>
      </View>

      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Animated.View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateY: sceneFloat }],
          }}
        >
          <Text style={{ fontSize: 64 }}>{scene.emoji}</Text>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: fadeAnim, paddingHorizontal: 28 }}>
        <Text style={[fw(900), { fontSize: 20, color: '#fff', lineHeight: 26, marginBottom: 8 }]}>{scene.narrative}</Text>
        <Text style={[fw(600), { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 20 }]}>{scene.subtext}</Text>

        <View style={{ gap: 10, marginTop: 20 }}>
          {scene.choices.map((choice, i) => {
            const isSelected = answers[step] === i;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => handleChoice(i)}
                style={{
                  padding: 14,
                  paddingHorizontal: 18,
                  borderRadius: 16,
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  borderWidth: 1.5,
                  borderColor: isSelected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>{choice.emoji}</Text>
                <Text style={[fw(700), { fontSize: 14, color: '#fff', flex: 1, lineHeight: 18 }]}>{choice.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </LinearGradient>
  );
}
