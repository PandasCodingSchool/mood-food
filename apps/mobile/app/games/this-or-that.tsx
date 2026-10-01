// 2.0 This or That: king of the hill over your top 8 real mood matches.
// Each round the holder faces the next dish; the last one standing wins.
// Picks are logged as liked/disliked dishes (game_signals) for the learner.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn } from 'react-native-reanimated';
import { space } from '@moodfood/tokens';
import { Screen, SegmentProgress, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock } from '../../src/components/v2';
import { DuelCard, GameHeader, GameResult, VersusPuck, useGameRecs } from '../../src/components/v2/GameKit';
import { openMeal } from '../../src/services/orderFlow';
import { logSignal } from '../../src/services/signals';
import type { Recommendation } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

export default function ThisOrThatScreen() {
  const router = useRouter();
  const { dark } = useTheme();
  const { recs, error, reload } = useGameRecs();
  const pool = useMemo(() => (recs ?? []).slice(0, 8), [recs]);
  const rounds = Math.max(0, pool.length - 1);
  const [round, setRound] = useState(0);
  const [champ, setChamp] = useState<Recommendation | null>(null);
  const [wins, setWins] = useState(0);
  const [log, setLog] = useState<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] });

  const holder = champ ?? pool[0];
  const challenger = pool[Math.min(round + 1, pool.length - 1)];
  const done = rounds > 0 && round >= rounds;

  const pick = (winner: Recommendation) => {
    if (done) return;
    hapticSelect();
    const loser = winner.id === holder.id ? challenger : holder;
    const nextLog = { liked: [...log.liked, winner.dish.name], disliked: [...log.disliked, loser.dish.name] };
    setLog(nextLog);
    setWins(winner.id === holder.id ? wins + 1 : 1);
    setChamp(winner);
    setRound(round + 1);
    if (round + 1 >= rounds) {
      hapticSuccess();
      void logSignal('game_signals', { game: 'this_or_that', liked: nextLog.liked, disliked: nextLog.disliked, champion: winner.dish.name });
      trackEvent('game_completed', { game: 'this_or_that', champion: winner.dish.name });
    }
  };

  const reset = () => {
    setRound(0);
    setChamp(null);
    setWins(0);
    setLog({ liked: [], disliked: [] });
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="This or That" subtitle={done ? 'Champion crowned' : rounds ? `Round ${round + 1} of ${rounds}` : undefined} onReset={reset} />
        {rounds ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={rounds} index={round} />
          </View>
        ) : null}

        {error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !recs ? (
          <LoadingBlock label="Lining up your dishes" />
        ) : pool.length < 2 ? (
          <Text variant="body14" tone="ink2" align="center" style={{ padding: 40 }}>Not enough picks to duel right now. Try again in a bit.</Text>
        ) : !done ? (
          <>
            <Text variant="body14" tone="ink2" align="center" style={{ paddingTop: 14 }}>Tap the one you'd rather eat right now.</Text>
            <Animated.View key={round} entering={FadeIn.duration(250)} style={{ flex: 1, minHeight: 560, gap: 12, paddingHorizontal: space.gutter, paddingVertical: 14 }}>
              <DuelCard rec={holder} onPick={() => pick(holder)} crown={round > 0 ? `Holding · ${wins} ${wins === 1 ? 'win' : 'wins'}` : undefined} />
              <DuelCard rec={challenger} onPick={() => pick(challenger)} />
              <VersusPuck label="or" />
            </Animated.View>
          </>
        ) : (
          <GameResult
            eyebrow="Last dish standing"
            line={`${holder.dish.name} held on for ${wins} ${wins === 1 ? 'round.' : 'rounds straight.'}`}
            rec={holder}
            badge="Champion"
            onAgain={reset}
            onEat={() => openMeal(router, holder, 0)}
          />
        )}
      </Screen>
    </View>
  );
}
