// 2.0 Bracket, engine-driven: eight strong but different dishes seeded 1v8,
// 4v5, 2v7, 3v6; quarterfinals → semifinals → final. The champion leads the picks.
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn } from 'react-native-reanimated';
import { space } from '@moodfood/tokens';
import { Screen, SegmentProgress, Text, useTheme } from '@moodfood/ui';
import { EngineDishCard, EngineResult, EngineState } from '../../src/components/v2/EngineKit';
import { GameHeader, VersusPuck } from '../../src/components/v2/GameKit';
import { useEngineGame } from '../../src/hooks/useEngineGame';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

export default function BracketScreen() {
  const { dark } = useTheme();
  const { question, progress, decision, busy, error, answer, reset, loading } = useEngineGame('bracket');
  const pair = question?.kind === 'duel' ? question.options ?? [] : [];
  const sub = question?.round ? `${question.round} · match ${question.match} of ${question.matches}` : undefined;

  useEffect(() => {
    if (decision) hapticSuccess();
  }, [decision]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="Bracket" subtitle={decision ? 'Champion crowned' : sub} onReset={reset} />
        {progress && !decision ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={progress.max_steps} index={progress.step} />
          </View>
        ) : null}
        <EngineState loading={loading} error={error} onRetry={reset} label="Seeding the bracket" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="Your bracket champion" line={(n) => `${n} takes the crown.`} badge="Champion" onAgain={reset} />
        ) : pair.length === 2 ? (
          <>
            <Text variant="body14" tone="ink2" align="center" style={{ paddingTop: 14 }}>
              {question?.round === 'Final' ? 'The final. Pick your champion.' : 'Who goes through?'}
            </Text>
            <Animated.View key={question?.key} entering={FadeIn.duration(250)} style={{ flex: 1, minHeight: 560, gap: 12, paddingHorizontal: space.gutter, paddingVertical: 14 }}>
              {pair.map((d) => (
                <EngineDishCard key={d.id} dish={d} disabled={busy} onPick={() => { hapticSelect(); void answer({ winner_id: d.id }); }} />
              ))}
              <VersusPuck label="vs" />
            </Animated.View>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
