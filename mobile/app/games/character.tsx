import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CHAR_QUESTIONS, TOTAL_CHAR_QUESTIONS, type CharacterProfile } from '../../src/constants/characters';
import { getCharacterMatch } from '../../src/utils/characterEngine';
import { fw } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { bounceIn, floatLoop } from '../../src/utils/animations';
import { playPopSound, playWinSound } from '../../src/utils/sounds';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

function Sparkle({ style, emoji, duration }: { style: object; emoji: string; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = floatLoop(translateY, 10, duration);
    return () => loop.stop();
  }, []);
  return <Animated.Text style={[{ position: 'absolute' }, style, { transform: [{ translateY }] }]}>{emoji}</Animated.Text>;
}

function Reveal({ character, onContinue }: { character: CharacterProfile; onContinue: () => void }) {
  const emojiScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    bounceIn(emojiScale);
  }, []);

  return (
    <LinearGradient colors={character.bg} style={{ flex: 1 }}>
      <Sparkle emoji="✨" duration={3000} style={{ top: 40, left: 30, fontSize: 24, opacity: 0.6 }} />
      <Sparkle emoji="⭐" duration={2500} style={{ top: 80, right: 40, fontSize: 20, opacity: 0.4 }} />
      <Sparkle emoji="✨" duration={2000} style={{ top: 200, left: 20, fontSize: 16, opacity: 0.3 }} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
        <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 3, textTransform: 'uppercase' }]}>
          Tonight you are
        </Text>
        <Animated.Text style={{ fontSize: 80, marginVertical: 8, transform: [{ scale: emojiScale }] }}>
          {character.emoji}
        </Animated.Text>
        <Text style={[fw(900), { fontSize: 32, color: '#fff', textAlign: 'center' }]}>{character.name}</Text>
        <Text style={[fw(700), { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }]}>{character.show}</Text>

        <View style={{ marginTop: 24, padding: 20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', width: '100%' }}>
          <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }]}>
            Their signature order
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 40 }}>{character.mealEmoji}</Text>
            <View>
              <Text style={[fw(800), { fontSize: 18, color: '#fff' }]}>{character.mealName}</Text>
              <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }]}>{character.mealDesc}</Text>
            </View>
          </View>
        </View>

        <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 12, maxWidth: 280, lineHeight: 20 }]}>
          {character.quote}
        </Text>

        <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={{ width: '100%', marginTop: 20 }}>
          <View style={{ height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[fw(900), { fontSize: 16, color: '#1a1a2e' }]}>🍽️ Find meals like this</Text>
          </View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export default function CharacterMatchScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [match, setMatch] = useState<CharacterProfile | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const question = CHAR_QUESTIONS[step];

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleSelect = (optionIndex: number) => {
    hapticSelect();
    playPopSound();
    const newAnswers = [...answers, optionIndex];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (step < CHAR_QUESTIONS.length - 1) {
        animateNext(() => setStep((s) => s + 1));
      } else {
        const result = getCharacterMatch(newAnswers);
        hapticSuccess();
        playWinSound();
        trackEvent('character_matched', { character: result.name });
        setMatch(result);
      }
    }, 400);
  };

  if (match) {
    return (
      <Reveal
        character={match}
        onContinue={() => {
          const results = {
            mood: match.mood,
            craving: match.craving,
            budget: match.budget,
            preference: match.preference,
            gameData: { type: 'character_match', character: match.name },
          };
          trackEvent('game_completed', { game: 'character', results });
          router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
        }}
      />
    );
  }

  const progress = ((step + 1) / TOTAL_CHAR_QUESTIONS) * 100;

  return (
    <LinearGradient colors={['#1e1b4b', '#312e81']} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
          <LinearGradient
            colors={['#a78bfa', '#c084fc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: '100%', width: `${progress}%`, borderRadius: 3 }}
          />
        </View>
        <Text style={[fw(800), { fontSize: 13, color: 'rgba(255,255,255,0.5)' }]}>
          {step + 1}/{TOTAL_CHAR_QUESTIONS}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 36 }}>{question.emoji}</Text>
            <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.2)' }}>
              <Text style={[fw(800), { fontSize: 11, color: '#c4b5fd', letterSpacing: 1, textTransform: 'uppercase' }]}>
                Character Match
              </Text>
            </View>
          </View>
          <Text style={[fw(900), { fontSize: 22, color: '#fff', lineHeight: 28 }]}>{question.question}</Text>

          <View style={{ gap: 10, marginTop: 4 }}>
            {question.options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => handleSelect(i)}
                style={{
                  padding: 14,
                  paddingHorizontal: 18,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.08)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: opt.iconBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fw(800), { fontSize: 14, color: '#fff' }]}>{opt.label}</Text>
                  <Text style={[fw(600), { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }]}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}
