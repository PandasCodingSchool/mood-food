import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Smile, Meh, Frown, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw, colors } from '../constants/theme';
import { fetchPendingPredictions, resolvePrediction } from '../services/signals';
import type { PendingPrediction } from '../types';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

const OPTIONS: Array<{ score: number; Icon: LucideIcon; label: string }> = [
  { score: 5, Icon: Smile, label: 'Nailed it' },
  { score: 3, Icon: Meh, label: 'Meh' },
  { score: 1, Icon: Frown, label: 'Wrong call' },
];

// 4.1 — Post-meal feedback loop ("Did we read your mind?"). This is the
// calibration backbone: without ground truth, every other learned signal is
// input with no error signal. One-tap, framed as the AI's accuracy score.
export default function PostMealPrompt() {
  const { theme } = useTheme();
  const [pending, setPending] = useState<PendingPrediction | null>(null);
  const [resolving, setResolving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const items = await fetchPendingPredictions();
      if (items.length > 0) setPending(items[0]);
    })();
  }, []);

  if (!pending || done) return null;

  const handleAnswer = async (score: number) => {
    setResolving(true);
    const ok = await resolvePrediction(pending.id, { actualScore: score });
    setResolving(false);
    if (ok) setDone(true);
  };

  return (
    <View
      style={{
        marginHorizontal: 24,
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.card,
        borderWidth: 1.5,
        borderColor: colors.orange + '20',
        shadowColor: theme.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Sparkles size={16} color={colors.orange} />
        <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>
          Did we read your mind?
        </Text>
      </View>
      <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 2 }]} numberOfLines={1}>
        {pending.dishName ? `How was the ${pending.dishName}?` : 'How was your last pick?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {OPTIONS.map((opt) => {
          const OptionIcon = opt.Icon;
          return (
            <TouchableOpacity
              key={opt.score}
              activeOpacity={0.8}
              disabled={resolving}
              onPress={() => handleAnswer(opt.score)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: theme.surface,
                opacity: resolving ? 0.5 : 1,
              }}
            >
              <OptionIcon size={24} color={colors.orange} />
              <Text style={[fw(700), { fontSize: 10, color: theme.subtext, marginTop: 2 }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
