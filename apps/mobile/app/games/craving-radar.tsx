// 2.0 Craving Radar, engine-driven: quick yes/no on flavours. The engine asks
// the craving that splits your candidates best, with a deck that fits the meal
// (no smoky at breakfast), and stops once it knows.
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Button, Screen, SegmentProgress, Surface, Text, useTheme } from '@moodfood/ui';
import { EngineResult, EngineState, titleCase } from '../../src/components/v2/EngineKit';
import { GameHeader } from '../../src/components/v2/GameKit';
import { useEngineGame } from '../../src/hooks/useEngineGame';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

const TAG_EMOJI: Record<string, string> = {
  crunchy: '🥨', creamy: '🍦', spicy: '🌶️', brothy: '🍲', fresh: '🥗', cheesy: '🧀', sweet: '🍯', tangy: '🍋', smoky: '🔥', melty: '🫕',
};

export default function CravingRadarScreen() {
  const { dark } = useTheme();
  const { question, progress, decision, busy, error, answer, reset, loading } = useEngineGame('craving_radar');
  const tag = question?.kind === 'yes_no' ? question.tag : undefined;

  useEffect(() => {
    if (decision) hapticSuccess();
  }, [decision]);

  const reply = (yes: boolean) => {
    hapticSelect();
    void answer({ yes });
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="Craving Radar" subtitle={decision ? 'Locked on' : progress ? `Signal ${progress.step + 1}` : undefined} onReset={reset} />
        {progress && !decision ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={progress.max_steps} index={progress.step} />
          </View>
        ) : null}
        <EngineState loading={loading} error={error} onRetry={reset} label="Warming up the radar" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="Your radar locked on" line={(n) => `${n} hits the spot.`} badge="Craving match" onAgain={reset} />
        ) : tag ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 22, paddingBottom: 40 }}>
            <Animated.View key={question?.key} entering={ZoomIn.springify().damping(14)}>
              <Surface radius={32} padding={28} style={{ alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 72, lineHeight: 86 }}>{TAG_EMOJI[tag] ?? '🍽️'}</Text>
                <Text variant="display32" align="center" accessibilityRole="header">{`Craving something ${tag}?`}</Text>
                <Text variant="body14" tone="ink2" align="center">{`${titleCase(tag)} — yes or no, go with your gut.`}</Text>
              </Surface>
            </Animated.View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button label="Not really" variant="glass" style={{ flex: 1, height: 56, borderRadius: 18 }} disabled={busy} onPress={() => reply(false)} />
              <Button label="Yes!" style={{ flex: 1, height: 56, borderRadius: 18 }} disabled={busy} onPress={() => reply(true)} />
            </View>
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
