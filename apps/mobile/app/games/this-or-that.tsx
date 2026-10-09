// 2.0 This or That, engine-driven: each pair is the one that best separates
// your top candidates right now; the game stops once one dish clearly leads.
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

export default function ThisOrThatScreen() {
  const { dark } = useTheme();
  const { question, progress, decision, busy, error, answer, reset, loading } = useEngineGame('this_or_that');
  const pair = question?.kind === 'duel' ? question.options ?? [] : [];

  useEffect(() => {
    if (decision) hapticSuccess();
  }, [decision]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="This or That" subtitle={decision ? 'Decided' : progress ? `Pick ${progress.step + 1}` : undefined} onReset={reset} />
        {progress && !decision ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={progress.max_steps} index={progress.step} />
          </View>
        ) : null}
        <EngineState loading={loading} error={error} onRetry={reset} label="Lining up your dishes" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="You kept choosing" line={(n) => `${n} wins.`} badge="Winner" onAgain={reset} />
        ) : pair.length === 2 ? (
          <>
            <Text variant="body14" tone="ink2" align="center" style={{ paddingTop: 14 }}>Tap the one you'd rather eat right now.</Text>
            <Animated.View key={question?.key} entering={FadeIn.duration(250)} style={{ flex: 1, minHeight: 560, gap: 12, paddingHorizontal: space.gutter, paddingVertical: 14 }}>
              {pair.map((d) => (
                <EngineDishCard key={d.id} dish={d} disabled={busy} onPick={() => { hapticSelect(); void answer({ winner_id: d.id }); }} />
              ))}
              <VersusPuck label="or" />
            </Animated.View>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
