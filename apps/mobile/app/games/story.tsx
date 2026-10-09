// 2.0 Story mode, engine-driven: a short story about your day, told for the time
// it is now (past, present or future), reacting to each choice, personalised to
// your habits when we know them, ending on what you're craving.
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Screen, SegmentProgress, Text, useTheme } from '@moodfood/ui';
import { EngineResult, EngineState } from '../../src/components/v2/EngineKit';
import { GameHeader } from '../../src/components/v2/GameKit';
import { useEngineGame } from '../../src/hooks/useEngineGame';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

export default function StoryScreen() {
  const { dark } = useTheme();
  const { question, decision, busy, error, answer, reset, loading } = useEngineGame('story');
  const scene = question?.kind === 'choice' ? question : undefined;

  useEffect(() => {
    if (decision) hapticSuccess();
  }, [decision]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="Story mode" subtitle={decision ? 'Plated' : scene?.segment} onReset={reset} />
        {scene?.of ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={scene.of} index={(scene.step ?? 1) - 1} />
          </View>
        ) : null}
        <EngineState loading={loading} error={error} onRetry={reset} label="Setting the scene" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="After a day like that" line={(n) => `${n} fits it perfectly.`} badge="Story pick" onAgain={reset} />
        ) : scene ? (
          <Animated.View key={scene.key} entering={FadeInDown.duration(350)} style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, gap: 18 }}>
            {scene.cold_open ? <Text variant="label" tone="accText">{scene.cold_open}</Text> : null}
            <Text variant="display28" accessibilityRole="header">{scene.prompt}</Text>
            <View style={{ gap: 10, marginTop: 6 }}>
              {(scene.options ?? []).map((o) => (
                <Button
                  key={o.id}
                  label={`${o.emoji ?? ''} ${o.label ?? ''}`.trim()}
                  variant="glass"
                  disabled={busy}
                  style={{ height: 56, borderRadius: 18, justifyContent: 'flex-start' }}
                  onPress={() => {
                    hapticSelect();
                    void answer({ option_id: o.id });
                  }}
                />
              ))}
            </View>
          </Animated.View>
        ) : null}
      </Screen>
    </View>
  );
}
