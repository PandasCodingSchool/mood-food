// 2.0 Bracket: your top 8 real mood matches in knockout rounds
// (quarters → semis → final). Picks go to the learner as real dish ids via
// the same 'bracket' signal v1 used.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn } from 'react-native-reanimated';
import { palette, space } from '@moodfood/tokens';
import { GradientFill, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock } from '../../src/components/v2';
import { DuelCard, GameHeader, GameResult, VersusPuck, useGameRecs } from '../../src/components/v2/GameKit';
import { openMeal } from '../../src/services/orderFlow';
import { logSignal } from '../../src/services/signals';
import type { Recommendation } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

const CAMPAIGN_KEY = 'summer_cravings_2026';
const QF = [[0, 7], [3, 4], [1, 6], [2, 5]];

export default function BracketScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { recs, error, reload } = useGameRecs();
  const b8 = useMemo(() => (recs ?? []).slice(0, 8), [recs]);
  const [picks, setPicks] = useState<Recommendation[]>([]);

  const pair = (m: number): [Recommendation | undefined, Recommendation | undefined] =>
    m < 4 ? [b8[QF[m][0]], b8[QF[m][1]]] : m < 6 ? [picks[(m - 4) * 2], picks[(m - 4) * 2 + 1]] : [picks[4], picks[5]];
  const mi = picks.length;
  const done = mi >= 7;
  const [a, b] = pair(Math.min(mi, 6));
  const champion = picks[6];

  const pick = (winner: Recommendation) => {
    if (done) return;
    hapticSelect();
    const next = [...picks, winner];
    setPicks(next);
    if (next.length === 7) {
      hapticSuccess();
      void logSignal('bracket', { campaign_key: CAMPAIGN_KEY, picks: next.map((r) => ({ dish_id: r.dish.id, dish_name: r.dish.name })) });
      trackEvent('game_completed', { game: 'bracket', winner: winner.dish.name });
    }
  };

  const sub = done ? 'Champion crowned' : mi < 4 ? `Quarter-final · ${mi + 1} of 4` : mi < 6 ? `Semi-final · ${mi - 3} of 2` : 'The final';
  const slot = (r: Recommendation | undefined, m: number) => {
    const win = r && picks[m]?.id === r.id;
    const lose = r && picks[m] && picks[m].id !== r.id;
    const now = r && m === mi;
    return (
      <View
        key={`${m}-${r?.id ?? 'x'}`}
        style={{ height: 26, borderRadius: 8, paddingHorizontal: 7, justifyContent: 'center', backgroundColor: win ? colors.acc : now ? colors.accSoft : colors.tint, borderWidth: 1, borderColor: now ? colors.acc : 'transparent', opacity: lose ? 0.55 : 1 }}
      >
        <Text
          variant="micro11"
          numberOfLines={1}
          style={{ fontFamily: 'Geist_600SemiBold', fontSize: 10.5, textDecorationLine: lose ? 'line-through' : 'none', textAlign: r ? 'left' : 'center' }}
          color={win ? palette.onAccent : lose || !r ? colors.ink2 : colors.ink}
        >
          {r ? r.dish.name : '—'}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <GameHeader title="Bracket" subtitle={b8.length === 8 ? sub : undefined} onReset={() => setPicks([])} />
        {error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !recs ? (
          <LoadingBlock label="Seeding the bracket" />
        ) : b8.length < 8 ? (
          <Text variant="body14" tone="ink2" align="center" style={{ padding: 40 }}>The bracket needs eight picks and we only have {b8.length} right now. Try This or That instead.</Text>
        ) : (
          <>
            {!done && a && b ? (
              <>
                <Text variant="body14" tone="ink2" align="center" style={{ paddingTop: 14 }}>Eight dishes, knockout rounds. Pick a winner.</Text>
                <Animated.View key={mi} entering={FadeIn.duration(250)} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.gutter, paddingTop: 14, height: 274 }}>
                  <DuelCard rec={a} onPick={() => pick(a)} />
                  <DuelCard rec={b} onPick={() => pick(b)} />
                  <VersusPuck label="vs" size={48} />
                </Animated.View>
              </>
            ) : champion ? (
              <GameResult
                eyebrow="Champion"
                line={`${champion.dish.name} won all three rounds.`}
                rec={champion}
                badge="Champion"
                onAgain={() => setPicks([])}
                onEat={() => openMeal(router, champion, 0)}
              />
            ) : null}

            <Surface radius={24} style={{ marginHorizontal: space.gutter, marginTop: 18, marginBottom: 36, paddingVertical: 14, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Quarters', 'Semis', 'Final', 'Winner'].map((t) => (
                  <Text key={t} variant="labelSmall" tone="ink2" align="center" style={{ flex: 1, fontSize: 9.5 }}>{t}</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, height: 244, marginTop: 8 }}>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-around' }}>{[0, 1, 2, 3].flatMap((m) => pair(m).map((r) => slot(r, m)))}</View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-around' }}>{[4, 5].flatMap((m) => pair(m).map((r) => slot(r, m)))}</View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-around' }}>{pair(6).map((r) => slot(r, 6))}</View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-around' }}>
                  <View style={{ height: 34, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: champion ? 0 : 1.5, borderStyle: 'dashed', borderColor: colors.track, backgroundColor: champion ? undefined : colors.tint }}>
                    {champion ? <GradientFill gradient={{ angle: 140, colors: [colors.acc, colors.acc2], locations: [0, 1] }} /> : null}
                    <Text variant="micro11" numberOfLines={1} style={{ fontFamily: 'Geist_700Bold' }} color={champion ? palette.onAccent : colors.ink2}>{champion ? champion.dish.name : '?'}</Text>
                  </View>
                </View>
              </View>
            </Surface>
          </>
        )}
      </Screen>
    </View>
  );
}
