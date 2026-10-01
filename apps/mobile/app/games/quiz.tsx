// 2.0 Mood Scoop: three scoops (base, feel, kick) fill a bowl. The feel and
// kick become real craving tags; we fetch real recommendations for them and
// show the top dish as "your bowl".
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { hueTile, palette, space } from '@moodfood/tokens';
import { Icon, IconTile, Screen, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock } from '../../src/components/v2';
import { GameHeader, GameResult, useGameRecs } from '../../src/components/v2/GameKit';
import { useLiveMood } from '../../src/context/LiveMood';
import { openMeal } from '../../src/services/orderFlow';
import { logSignal } from '../../src/services/signals';
import type { QuizResults } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';

type Opt = { t: string; icon: IconName; hue: number; craving?: string; veg?: boolean };
const SCOOPS: Array<{ q: string; opts: Opt[] }> = [
  { q: 'Pick a base', opts: [
    { t: 'Rice', icon: 'rice_bowl', hue: 60 },
    { t: 'Noodles', icon: 'ramen_dining', hue: 30 },
    { t: 'Bread', icon: 'bakery_dining', hue: 75 },
    { t: 'Greens', icon: 'eco', hue: 140, veg: true },
  ] },
  { q: 'How should it feel?', opts: [
    { t: 'Brothy', icon: 'soup_kitchen', hue: 220, craving: 'brothy' },
    { t: 'Crispy', icon: 'grain', hue: 50, craving: 'crispy' },
    { t: 'Creamy', icon: 'water_drop', hue: 85, craving: 'creamy' },
    { t: 'Fresh', icon: 'spa', hue: 160, craving: 'fresh' },
  ] },
  { q: 'Add a kick', opts: [
    { t: 'Spicy', icon: 'local_fire_department', hue: 25, craving: 'spicy' },
    { t: 'Tangy', icon: 'nutrition', hue: 110, craving: 'tangy' },
    { t: 'Mild', icon: 'cloud', hue: 250 },
    { t: 'Sweet', icon: 'cake', hue: 350, craving: 'sweet' },
  ] },
];

export default function QuizScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { mood } = useLiveMood();
  const [picks, setPicks] = useState<number[]>([]);
  const done = picks.length >= 3;
  const chosen = picks.map((p, i) => SCOOPS[i].opts[p]);
  const cravings = chosen.map((o) => o.craving).filter(Boolean) as string[];
  const query: QuizResults | undefined = done
    ? { mood, craving: cravings[0] || 'comfort', budget: 'medium', preference: chosen[0]?.veg ? 'veg' : 'both' }
    : undefined;

  const pick = (j: number) => {
    if (done) return;
    const next = [...picks, j];
    setPicks(next);
    if (next.length === 3) {
      const opts = next.map((p, i) => SCOOPS[i].opts[p]);
      const tags = opts.map((o) => o.craving).filter(Boolean) as string[];
      if (tags.length) void logSignal('craving', { tags });
      trackEvent('game_completed', { game: 'mood_scoop', scoops: opts.map((o) => o.t) });
    }
  };

  const reset = () => setPicks([]);
  const step = Math.min(picks.length, 2);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <GameHeader title="Mood Scoop" subtitle={done ? 'Your bowl is ready' : `${picks.length} of 3 scooped`} onReset={reset} />

        {/* The bowl fills from the bottom with each scoop. */}
        <View style={{ alignItems: 'center', paddingTop: 30 }}>
          <View style={{ width: 250, height: 160 }}>
            <Surface
              kind="glassStrong"
              radius={0}
              accessibilityLabel={chosen.length ? `Bowl with ${chosen.map((o) => o.t).join(', ')}` : 'Empty bowl'}
              style={{ position: 'absolute', left: 5, right: 5, bottom: 0, height: 140, borderBottomLeftRadius: 125, borderBottomRightRadius: 125, borderTopWidth: 0, flexDirection: 'column-reverse', boxShadow: '0px 30px 50px -28px rgba(0,0,0,0.55)' }}
            >
              {chosen.map((o, i) => (
                <Animated.View key={i} entering={FadeInDown.springify().damping(12)} style={{ height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: hueTile(o.hue) }}>
                  <Text variant="button13" style={{ fontSize: 12.5 }} color={palette.onAccent}>{o.t}</Text>
                </Animated.View>
              ))}
            </Surface>
            {!chosen.length ? (
              <Text variant="label" tone="ink2" align="center" style={{ position: 'absolute', left: 0, right: 0, top: 70 }}>Empty bowl</Text>
            ) : null}
            <View style={{ position: 'absolute', left: -6, right: -6, top: 14, height: 12, borderRadius: 6, backgroundColor: colors.ink, opacity: 0.9 }} />
          </View>
        </View>

        {!done ? (
          <>
            <View style={{ paddingHorizontal: space.page, paddingTop: 30 }}>
              <Text variant="label" tone="ink2">{`Scoop ${step + 1} of 3`}</Text>
              <Text variant="display32" style={{ marginTop: 6 }}>{SCOOPS[step].q}</Text>
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, paddingBottom: 36, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {SCOOPS[step].opts.map((o, j) => (
                <Pressable key={o.t} onPress={() => pick(j)} accessibilityRole="button" accessibilityLabel={o.t} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <Surface radius={24} padding={16} style={{ height: 112, justifyContent: 'space-between' }}>
                    <IconTile icon={o.icon} hue={o.hue} size={44} />
                    <Text variant="title17">{o.t}</Text>
                  </Surface>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <ScoopResult
            line={`${chosen.map((o) => o.t).join(', ')}. That's your kind of bowl tonight.`}
            query={query!}
            onAgain={reset}
            onOpen={(rec) => openMeal(router, rec, 0)}
            onAll={() => router.push({ pathname: '/recommendations', params: { results: JSON.stringify({ ...query, gameData: { type: 'mood_scoop', scoops: chosen.map((o) => o.t) } }) } })}
          />
        )}
      </Screen>
    </View>
  );
}

function ScoopResult({ line, query, onAgain, onOpen, onAll }: {
  line: string;
  query: QuizResults;
  onAgain: () => void;
  onOpen: (rec: NonNullable<ReturnType<typeof useGameRecs>['recs']>[number]) => void;
  onAll: () => void;
}) {
  const { recs, error, reload } = useGameRecs(query);
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!recs) return <LoadingBlock label="Filling your bowl" />;
  const top = recs[0] ?? null;
  return (
    <GameResult
      eyebrow="Your scoop"
      line={line}
      rec={top}
      badge="Your bowl"
      onAgain={onAgain}
      onEat={() => (top ? onOpen(top) : onAll())}
      extra={
        recs.length > 1 ? (
          <Pressable onPress={onAll} accessibilityRole="button" style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="button13" tone="accText">{`See all ${recs.length} matches`}</Text>
            <Icon name="chevron_right" size={18} tone="accText" />
          </Pressable>
        ) : null
      }
    />
  );
}
