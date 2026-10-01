// 2.0 Onboarding: three slides (mood-first, context-aware, never stuck) → login.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MOOD_SPECS, MOODS, WEATHER_SPECS, oklch, space } from '@moodfood/tokens';
import { AmbientBackground, Button, Icon, IconTile, MoodOrb, StepDots, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { LogoPill } from '../src/components/v2';
import { TIME_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { trackEvent } from '../src/utils/analytics';

const SLIDES = [
  { k: 'Mood-first', t: 'Food that matches how you feel.', d: 'A 20-second check-in, and every pick is tuned to your energy, stress and hunger.' },
  { k: 'Context-aware', t: 'Rain, sun, 2 AM. It all counts.', d: 'Weather and time quietly reshape what we suggest, and how the app looks.' },
  { k: 'Never stuck', t: "Can't decide? Play it out.", d: "Swipe, spin or vote with friends. Every game lands on something you'll love." },
];

const GAMES: Array<{ t: string; icon: IconName; hue: number }> = [
  { t: 'Swipe Vibe', icon: 'swipe', hue: 40 },
  { t: 'Meal Roulette', icon: 'casino', hue: 350 },
  { t: "Tonight's Story", icon: 'auto_stories', hue: 310 },
  { t: 'Group decision', icon: 'groups', hue: 180 },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dark } = useTheme();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const toLogin = (via: 'skip' | 'done') => {
    trackEvent('onboarding_finished', { via, step: i });
    router.replace('/login');
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AmbientBackground />
      <View style={{ paddingHorizontal: space.page, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <LogoPill />
        <Button label="Skip" variant="glass" size="sm" onPress={() => toLogin('skip')} style={{ height: 34, borderRadius: 17 }} />
      </View>

      <View style={{ flex: 1, marginHorizontal: space.gutter, marginTop: 16 }}>
        <Animated.View key={i} entering={FadeIn.duration(500)} style={{ flex: 1 }}>
          {i === 0 ? <MoodVisual /> : i === 1 ? <ContextVisual /> : <GamesVisual />}
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
        <Text variant="label" tone="accText">{slide.k}</Text>
        <Text variant="display34" style={{ marginTop: 8 }} accessibilityRole="header">{slide.t}</Text>
        <Text variant="body15" tone="ink2" style={{ marginTop: 10 }}>{slide.d}</Text>
      </View>
      <View style={{ paddingHorizontal: space.page, paddingTop: 26, paddingBottom: Math.max(40, insets.bottom + 16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StepDots count={SLIDES.length} index={i} />
        <Button
          label={last ? 'Get started' : 'Next'}
          iconRight="arrow_forward"
          onPress={() => (last ? toLogin('done') : setI(i + 1))}
          style={{ height: 56 }}
        />
      </View>
    </View>
  );
}

function MoodVisual() {
  const pos = [{ top: 30, left: 14 }, { top: 92, right: 6 }, { bottom: 70, left: 24 }, { bottom: 16, right: 30 }];
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <MoodOrb size={190} />
      {MOODS.map((m, k) => (
        <Surface key={m} kind="glassStrong" radius={20} style={[{ position: 'absolute', height: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, pos[k]]}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: oklch(0.76, MOOD_SPECS[m].chroma, MOOD_SPECS[m].hue) }} />
          <Text variant="bodyStrong14" style={{ fontSize: 13.5 }}>{MOOD_SPECS[m].label}</Text>
        </Surface>
      ))}
    </View>
  );
}

function ContextVisual() {
  const { time, weather, temperature } = useLiveMood();
  const w = WEATHER_SPECS[weather];
  const clock = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 8 }}>
      <Surface kind="glassStrong" radius={24} padding={18} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, transform: [{ rotate: '-2deg' }] }}>
        <Icon name={w.icon as IconName} size={40} tone="accText" />
        <View>
          <Text variant="display26">{temperature != null ? `${Math.round(temperature)}°` : w.label}</Text>
          <Text variant="caption13" tone="ink2">{`${w.label} right now`}</Text>
        </View>
      </Surface>
      <Surface kind="glassStrong" radius={24} padding={18} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 36, transform: [{ rotate: '2deg' }] }}>
        <Icon name="schedule" size={40} tone="accText" />
        <View>
          <Text variant="display26">{clock}</Text>
          <Text variant="caption13" tone="ink2">{`Time for ${TIME_COPY[time].meal}`}</Text>
        </View>
      </Surface>
      <AccentNote />
    </View>
  );
}

function AccentNote() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, backgroundColor: colors.acc, flexDirection: 'row', alignItems: 'center', gap: 12, transform: [{ rotate: '-1deg' }], boxShadow: `0px 20px 40px -20px ${colors.acc}` }}>
      <Icon name="auto_awesome" size={26} color={colors.onAcc} />
      <Text variant="bodyStrong14" color={colors.onAcc} style={{ flex: 1 }}>The app re-themes itself to match</Text>
    </View>
  );
}

function GamesVisual() {
  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', gap: 10, paddingHorizontal: 4 }}>
      {GAMES.map((g) => (
        <Surface key={g.t} kind="glassStrong" radius={24} padding={16} style={{ flexBasis: '47%', flexGrow: 1, minHeight: 120, gap: 8 }}>
          <IconTile icon={g.icon} hue={g.hue} />
          <Text variant="title17" style={{ marginTop: 'auto' }}>{g.t}</Text>
        </Surface>
      ))}
    </View>
  );
}
