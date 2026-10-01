// 2.0 Launch: logo pop, context tagline and a "reading the room" bar, then
// route on session: signed in → home (which gates on today's check-in),
// otherwise → onboarding. Tap anywhere to skip.
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { MOOD_SPECS, WEATHER_SPECS } from '@moodfood/tokens';
import { AmbientBackground, ProgressBar, Text, useTheme } from '@moodfood/ui';
import { LogoTile } from '../src/components/v2';
import { MOOD_COPY, TIME_COPY, WEATHER_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { isSessionValid } from '../src/services/session';

const LAUNCH_MS = 2700;

function clockText() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function SplashScreen() {
  const router = useRouter();
  const { dark } = useTheme();
  const { time, weather, mood, temperature } = useLiveMood();
  const [progress, setProgress] = useState(0);
  const done = useRef(false);

  const go = async () => {
    if (done.current) return;
    done.current = true;
    const valid = await isSessionValid();
    router.replace(valid ? '/home' : '/onboarding');
  };

  useEffect(() => {
    const start = setTimeout(() => setProgress(1), 60);
    const timer = setTimeout(go, LAUNCH_MS + 300);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = TIME_COPY[time];
  const w = WEATHER_SPECS[weather];
  const chips = [
    `Feeling ${MOOD_COPY[mood].lower}`,
    `${w.label}${temperature != null ? ` ${Math.round(temperature)}°` : ''}`,
    `${t.meal[0].toUpperCase()}${t.meal.slice(1)} picks`,
  ];
  const chipPos = [{ top: 96, left: 22 }, { top: 170, right: 18 }, { bottom: 170, left: 34 }];

  return (
    <Pressable style={{ flex: 1 }} onPress={go} accessibilityRole="button" accessibilityLabel="Skip intro">
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AmbientBackground />
      {chips.map((c, i) => (
        <Animated.View key={c} entering={FadeInDown.delay(400 + i * 200).duration(600)} style={[{ position: 'absolute' }, chipPos[i]]}>
          <ContextChip label={c} />
        </Animated.View>
      ))}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <LogoTile size={200} />
        </Animated.View>
        <Text variant="display34" align="center" style={{ marginTop: 44 }}>
          {t.tagline}
        </Text>
        <Text variant="body15" tone="ink2" align="center" style={{ marginTop: 12 }}>
          {`Tuning ${t.meal} picks to ${WEATHER_COPY[weather].phrase}.`}
        </Text>
      </View>
      <View style={{ position: 'absolute', left: 40, right: 40, bottom: 64, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label" tone="ink2">Reading the room</Text>
          <Text variant="label" tone="ink2">{`${MOOD_SPECS[mood].label} · ${clockText()}`}</Text>
        </View>
        <ProgressBar value={progress} height={4} durationMs={LAUNCH_MS} />
      </View>
    </Pressable>
  );
}

function ContextChip({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.acc }} />
      <Text variant="caption12" style={{ fontFamily: 'Geist_500Medium' }}>{label}</Text>
    </View>
  );
}
