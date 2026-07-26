import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { View, Text, Animated, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Brain, Search, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw, colors } from '../constants/theme';
import { floatLoop } from '../utils/animations';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

const PHASES: Array<{ Icon: LucideIcon; text: string; sub: string }> = [
  { Icon: Brain, text: 'Reading your mood...', sub: 'Analyzing vibes' },
  { Icon: Search, text: 'Matching cuisines...', sub: 'Scanning 500+ restaurants' },
  { Icon: Sparkles, text: 'Curating your picks...', sub: 'Almost there!' },
];

/** Animated multi-phase loading screen shown while fetchRecommendations resolves. */
export default function LoadingScreen() {
  const { theme } = useTheme();
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
  const PhaseIcon = phase.Icon;

  return (
    <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ alignItems: 'center', gap: 24, paddingHorizontal: 32 }}>
        <Animated.View style={{ transform: [{ translateY: floatY }] }}>
          <PhaseIcon size={72} color={colors.orange} />
        </Animated.View>
        <Text style={[fw(900), { fontSize: 22, color: theme.text, textAlign: 'center', maxWidth: 260, lineHeight: 28 }]}>
          {phase.text}
        </Text>
        <View style={{ width: 200, height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' }}>
          <View style={{ height: '100%', borderRadius: 3, backgroundColor: colors.orange, width: `${progress}%` }} />
        </View>
        <Text style={[fw(700), { fontSize: 14, color: theme.subtext }]}>{phase.sub}</Text>
      </View>
    </LinearGradient>
  );
}
