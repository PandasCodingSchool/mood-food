import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fw } from '../constants/theme';
import { floatLoop } from '../utils/animations';

const PHASES = [
  { emoji: '🧠', text: 'Reading your mood...', sub: 'Analyzing vibes' },
  { emoji: '🍳', text: 'Matching cuisines...', sub: 'Scanning 500+ restaurants' },
  { emoji: '✨', text: 'Curating your picks...', sub: 'Almost there!' },
];

/** Animated multi-phase loading screen shown while fetchRecommendations resolves. */
export default function LoadingScreen() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [progress, setProgress] = useState(8);
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = floatLoop(floatY, 10, 900);
    const phaseTimer = setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, PHASES.length - 1));
    }, 1300);
    const progressTimer = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 92));
    }, 400);
    return () => {
      loop.stop();
      clearInterval(phaseTimer);
      clearInterval(progressTimer);
    };
  }, []);

  const phase = PHASES[phaseIdx];

  return (
    <LinearGradient colors={['#f97316', '#fb923c', '#fbbf24']} locations={[0, 0.4, 1]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: 24, paddingHorizontal: 32 }}>
        <Animated.Text style={{ fontSize: 72, transform: [{ translateY: floatY }] }}>{phase.emoji}</Animated.Text>
        <Text style={[fw(900), { fontSize: 22, color: '#fff', textAlign: 'center', maxWidth: 260, lineHeight: 28 }]}>
          {phase.text}
        </Text>
        <View style={{ width: 200, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <View style={{ height: '100%', borderRadius: 3, backgroundColor: '#fff', width: `${progress}%` }} />
        </View>
        <Text style={[fw(700), { fontSize: 14, color: 'rgba(255,255,255,0.8)' }]}>{phase.sub}</Text>
      </View>
    </LinearGradient>
  );
}
