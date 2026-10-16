import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { space } from '@moodfood/tokens';
import { Icon, Surface, Text, useTheme } from '@moodfood/ui';
import { fetchPendingPredictions, resolvePrediction } from '../services/signals';
import type { PendingPrediction } from '../types';

const OPTIONS: Array<{ score: number; emoji: string; label: string }> = [
  { score: 5, emoji: '😋', label: 'Nailed it' },
  { score: 3, emoji: '😐', label: 'Meh' },
  { score: 1, emoji: '😕', label: 'Wrong call' },
];

// 4.1 — Post-meal feedback loop ("Did we read your mind?"). This is the
// calibration backbone: without ground truth, every other learned signal is
// input with no error signal. One-tap, framed as the AI's accuracy score.
export default function PostMealPrompt() {
  const { colors } = useTheme();
  const [pending, setPending] = useState<PendingPrediction | null>(null);
  const [resolving, setResolving] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const items = await fetchPendingPredictions();
      if (items.length > 0) setPending(items[0]);
    })();
  }, []);

  if (!pending) return null;

  const handleAnswer = async (score: number) => {
    setPicked(score);
    setResolving(true);
    const ok = await resolvePrediction(pending.id, { actualScore: score });
    setResolving(false);
    if (ok) setDone(true);
    else setPicked(null);
  };

  if (done) {
    return (
      <Surface kind="accentSoft" radius={24} padding={16} style={{ marginHorizontal: space.gutter, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="check_circle" size={20} tone="accText" filled />
        <Text variant="bodyStrong14" tone="accText">Thanks, that sharpens your next picks</Text>
      </Surface>
    );
  }

  return (
    <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="auto_awesome" size={18} tone="accText" />
        <Text variant="label" tone="ink2">Quick check</Text>
      </View>
      <Text variant="title19" style={{ marginTop: 8 }}>Did we read your mind?</Text>
      <Text variant="caption13" tone="ink2" numberOfLines={1} style={{ marginTop: 4 }}>
        {pending.dishName ? `How was the ${pending.dishName}?` : 'How was your last pick?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {OPTIONS.map((opt) => {
          const on = picked === opt.score;
          return (
            <Pressable
              key={opt.score}
              disabled={resolving}
              onPress={() => handleAnswer(opt.score)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: on, disabled: resolving }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                gap: 6,
                paddingVertical: 12,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: on ? 'transparent' : colors.line,
                backgroundColor: on ? colors.acc : colors.tint,
                opacity: resolving && !on ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 26, lineHeight: 32 }}>{opt.emoji}</Text>
              <Text variant="chip12" color={on ? colors.onAcc : colors.ink}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Surface>
  );
}
