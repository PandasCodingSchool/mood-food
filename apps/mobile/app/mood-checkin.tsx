// 2.0 Mood check-in: four 5-level bars + occasion. The screen re-themes live
// as you tap. Saves the same check-in v1 did (1-10 scales, so bars × 2), logs
// signals, bumps the streak quest, then refreshes the app-wide theme.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MOOD_SPECS, shadow, space } from '@moodfood/tokens';
import { Button, Icon, LevelBars, MoodOrb, MoodThemeProvider, Screen, Surface, Text, useTheme, useToast, type IconName } from '@moodfood/ui';
import { MOOD_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { moodFromCheckin } from '../src/hooks/useLiveMoodContext';
import { getTodayCheckin, saveTodayCheckin, today, type Occasion } from '../src/services/moodState';
import { logSignal } from '../src/services/signals';
import { bumpQuestProgress } from '../src/services/quests';
import { trackEvent } from '../src/utils/analytics';

type Key = 'energy' | 'stress' | 'hunger' | 'social';
const ROWS: Array<{ k: Key; label: string; icon: IconName; words: string[] }> = [
  { k: 'energy', label: 'Energy', icon: 'bolt', words: ['Running on empty', 'Low', 'Steady', 'Good', 'Buzzing'] },
  { k: 'stress', label: 'Stress', icon: 'spa', words: ['Zen', 'Calm', 'A little', 'Tense', 'Frazzled'] },
  { k: 'hunger', label: 'Hunger', icon: 'restaurant', words: ['Snacky', 'Peckish', 'Hungry', 'Very hungry', 'Starving'] },
  { k: 'social', label: 'Company', icon: 'group', words: ['Solo', 'Duo', 'Small group', 'Friends over', 'Party'] },
];
// "Comfort" is the default framing and maps to no explicit occasion.
const OCCASIONS: Array<{ id: Occasion | 'comfort'; label: string; icon: IconName }> = [
  { id: 'comfort', label: 'Comfort', icon: 'favorite' },
  { id: 'treat', label: 'Treat', icon: 'cake' },
  { id: 'reward', label: 'Reward', icon: 'military_tech' },
  { id: 'fuel', label: 'Fuel', icon: 'bolt' },
];

const toBars = (v: number) => Math.min(5, Math.max(1, Math.round(v / 2)));

export default function MoodCheckinScreen() {
  const { time, weather } = useLiveMood();
  const [levels, setLevels] = useState<Record<Key, number>>({ energy: 3, stress: 3, hunger: 3, social: 2 });
  const [occasion, setOccasion] = useState<Occasion | 'comfort'>('comfort');

  useEffect(() => {
    getTodayCheckin().then((c) => {
      if (!c) return;
      setLevels({ energy: toBars(c.energy), stress: toBars(c.stress), hunger: toBars(c.hunger), social: toBars(c.social) });
      setOccasion(c.occasion ?? 'comfort');
    });
  }, []);

  const mood = useMemo(
    () =>
      moodFromCheckin({
        energy: levels.energy * 2,
        stress: levels.stress * 2,
        social: levels.social * 2,
        occasion: occasion === 'comfort' ? undefined : occasion,
      }),
    [levels, occasion],
  );

  return (
    <MoodThemeProvider time={time} weather={weather} mood={mood}>
      <CheckinBody levels={levels} setLevels={setLevels} occasion={occasion} setOccasion={setOccasion} />
    </MoodThemeProvider>
  );
}

function CheckinBody({ levels, setLevels, occasion, setOccasion }: {
  levels: Record<Key, number>;
  setLevels: (l: Record<Key, number>) => void;
  occasion: Occasion | 'comfort';
  setOccasion: (o: Occasion | 'comfort') => void;
}) {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { colors, dark, mood } = useTheme();
  const { refreshMood } = useLiveMood();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const values = { energy: levels.energy * 2, stress: levels.stress * 2, hunger: levels.hunger * 2, social: levels.social * 2 };
    const occ = occasion === 'comfort' ? undefined : occasion;
    await saveTodayCheckin({ ...values, occasion: occ });
    void logSignal('mood_checkin', values);
    if (occ) void logSignal('occasion', { occasion: occ });
    void bumpQuestProgress('mood_streak_7', 1, today());
    trackEvent('mood_checkin_saved', { mood, occasion });
    await refreshMood();
    toast('Check-in saved · streak kept alive');
    router.replace((next as never) || '/recommendations');
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <View style={{ paddingHorizontal: space.page, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="label" tone="ink2">Check-in · 20 sec</Text>
          <Button
            label="Skip"
            variant="glass"
            size="sm"
            style={{ height: 34, borderRadius: 17 }}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          />
        </View>
        <Text variant="display36" style={{ paddingHorizontal: space.page, paddingTop: 16 }} accessibilityRole="header">How are you, really?</Text>
        <Text variant="body15" tone="ink2" style={{ paddingHorizontal: space.page, paddingTop: 10 }}>Four taps. We'll handle the rest.</Text>

        <Surface style={{ marginHorizontal: space.gutter, marginTop: 20, paddingHorizontal: 18, paddingVertical: 4 }}>
          {ROWS.map((r) => (
            <View key={r.k} style={{ paddingVertical: 15, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name={r.icon} size={20} tone="accText" />
                <Text variant="bodyStrong15">{r.label}</Text>
                <Text variant="caption13" tone="ink2" style={{ marginLeft: 'auto' }}>{r.words[levels[r.k] - 1]}</Text>
              </View>
              <LevelBars label={r.label} value={levels[r.k]} onChange={(v) => setLevels({ ...levels, [r.k]: v })} />
            </View>
          ))}
        </Surface>

        <Text variant="title21" style={{ paddingHorizontal: space.page, paddingTop: 24, paddingBottom: 12 }}>What's this meal for?</Text>
        <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', gap: 8 }}>
          {OCCASIONS.map((o) => {
            const on = occasion === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => setOccasion(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: on ? 'transparent' : colors.line, backgroundColor: on ? colors.acc : colors.surf }}
              >
                <Icon name={o.icon} size={22} color={on ? colors.onAcc : colors.ink} />
                <Text variant="button13" color={on ? colors.onAcc : colors.ink}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Surface kind="solid" radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 16, boxShadow: shadow.card }}>
          <MoodOrb />
          <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
            <Text variant="label" tone="ink2">Reading you as</Text>
            <Text variant="display26" style={{ marginTop: 2 }}>{MOOD_SPECS[mood].label}</Text>
            <Text variant="caption13" tone="ink2" style={{ marginTop: 2 }}>{`We'll lean ${MOOD_COPY[mood].lean}.`}</Text>
          </View>
        </Surface>

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 14 }}>
          <Button block label="Show my matches" iconRight="arrow_forward" loading={saving} onPress={submit} />
        </View>
      </Screen>
    </View>
  );
}
