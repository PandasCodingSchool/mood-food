import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Utensils, Sparkles, Star } from 'lucide-react-native';
import {
  OPENING_SCENES,
  SCENE2_OPTION_BANK,
  SCENE2_TEXT,
  TWIST_OPTIONS,
  TWIST_PROMPT,
  TWIST_SUBTITLE,
  type JourneyOption,
  type MoodCluster,
} from '../../src/constants/moodJourney';
import { accumulateAxes, matchCluster, normalizeAxes } from '../../src/utils/moodJourneyEngine';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { bounceIn, floatLoop } from '../../src/utils/animations';
import { playPopSound, playWinSound } from '../../src/utils/sounds';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

type Phase = 'opening' | 'scene2' | 'twist' | 'reveal';

function pickOpeningScene() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return OPENING_SCENES[dayOfYear % OPENING_SCENES.length];
}

function Sparkle({ style, size, color, duration }: { style: object; size: number; color: string; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = floatLoop(translateY, 10, duration);
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[{ position: 'absolute' }, style, { transform: [{ translateY }] }]}>
      <Sparkles size={size} color={color} />
    </Animated.View>
  );
}

function Reveal({ cluster, onContinue }: { cluster: MoodCluster; onContinue: () => void }) {
  const iconScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    bounceIn(iconScale);
  }, []);

  return (
    <LinearGradient colors={cluster.gradient} style={{ flex: 1 }}>
      <Sparkle size={24} color="rgba(255,255,255,0.6)" duration={3000} style={{ top: 40, left: 30, opacity: 0.6 }} />
      <Sparkle size={20} color="rgba(255,255,255,0.4)" duration={2500} style={{ top: 80, right: 40 }} />
      <Sparkle size={16} color="rgba(255,255,255,0.3)" duration={2000} style={{ top: 200, left: 20 }} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
        <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 3, textTransform: 'uppercase' }]}>
          Tonight's mood
        </Text>
        <Animated.View style={{ marginVertical: 8, transform: [{ scale: iconScale }] }}>
          <Text style={{ fontSize: 64 }}>{cluster.emoji}</Text>
        </Animated.View>
        <Text style={[fw(900), { fontSize: 32, color: '#fff', textAlign: 'center' }]}>{cluster.name}</Text>
        <Text style={[fw(700), { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' }]}>
          {cluster.tagline}
        </Text>

        <View style={{ marginTop: 24, padding: 20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', width: '100%' }}>
          <Text style={[fw(800), { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }]}>
            Tonight, something like
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Utensils size={32} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={[fw(800), { fontSize: 18, color: '#fff' }]}>{cluster.sampleDish}</Text>
            </View>
          </View>
        </View>

        <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 12, maxWidth: 280, lineHeight: 20 }]}>
          {cluster.revealBody}
        </Text>

        <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={{ width: '100%', marginTop: 20 }}>
          <View style={{ height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Utensils size={20} color={colors.navy} />
            <Text style={[fw(900), { fontSize: 16, color: colors.navy }]}>Find meals like this</Text>
          </View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export default function MoodJourneyScreen() {
  const router = useRouter();
  const [openingScene] = useState(pickOpeningScene);
  const [phase, setPhase] = useState<Phase>('opening');
  const [selections, setSelections] = useState<JourneyOption[]>([]);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const scene2Options = openingScene.scene2OptionIds.map((id) => SCENE2_OPTION_BANK[id]);

  const stepConfig =
    phase === 'opening'
      ? { prompt: openingScene.prompt, subtitle: openingScene.subtitle, options: openingScene.options, next: 'scene2' as Phase, stepIndex: 1 }
      : phase === 'scene2'
        ? { prompt: SCENE2_TEXT, subtitle: '', options: scene2Options, next: 'twist' as Phase, stepIndex: 2 }
        : { prompt: TWIST_PROMPT, subtitle: TWIST_SUBTITLE, options: TWIST_OPTIONS, next: 'reveal' as Phase, stepIndex: 3 };

  const animateNext = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const handleSelect = (option: JourneyOption) => {
    hapticSelect();
    playPopSound();
    const nextSelections = [...selections, option];
    setSelections(nextSelections);

    setTimeout(() => {
      if (stepConfig.next !== 'reveal') {
        animateNext(() => setPhase(stepConfig.next));
      } else {
        hapticSuccess();
        playWinSound();
        animateNext(() => setPhase('reveal'));
      }
    }, 400);
  };

  if (phase === 'reveal') {
    const raw = accumulateAxes(selections);
    const normalized = normalizeAxes(raw);
    const twistHint = selections[2]?.clusterHint;
    const result = matchCluster(raw, twistHint);
    const cluster = result.cluster;

    return (
      <Reveal
        cluster={cluster}
        onContinue={() => {
          trackEvent('mood_journey_complete', { game: 'character', clusterId: cluster.id });
          const results = {
            mood: cluster.moodLabel,
            craving: cluster.cravingLabel,
            budget: cluster.budgetHint,
            preference: 'both',
            gameData: {
              type: 'mood_journey',
              cravings: [cluster.sampleDish],
              moodAxes: normalized,
              cluster: { id: cluster.id, name: cluster.name, secondaryId: result.secondaryCluster?.id },
            },
          };
          router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
        }}
      />
    );
  }

  const progress = (stepConfig.stepIndex / 3) * 100;

  return (
    <LinearGradient colors={['#1e1b4b', '#312e81']} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color="#fff" />
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
          {stepConfig.stepIndex}/3
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Star size={30} color="#fff" />
            <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.2)' }}>
              <Text style={[fw(800), { fontSize: 11, color: '#c4b5fd', letterSpacing: 1, textTransform: 'uppercase' }]}>
                Tonight's Story
              </Text>
            </View>
          </View>
          <Text style={[fw(900), { fontSize: 22, color: '#fff', lineHeight: 28 }]}>{stepConfig.prompt}</Text>
          {stepConfig.subtitle ? (
            <Text style={[fw(600), { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: -12 }]}>{stepConfig.subtitle}</Text>
          ) : null}

          <View style={{ gap: 10, marginTop: 4 }}>
            {stepConfig.options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.8}
                onPress={() => handleSelect(opt)}
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
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fw(800), { fontSize: 14, color: '#fff' }]}>{opt.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}
