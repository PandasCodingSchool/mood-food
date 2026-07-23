import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { fw, colors } from '../constants/theme';
import { fetchPendingPredictions, resolvePrediction } from '../services/signals';
import type { PendingPrediction } from '../types';

const OPTIONS: Array<{ score: number; emoji: string; label: string }> = [
  { score: 5, emoji: '😍', label: 'Nailed it' },
  { score: 3, emoji: '😐', label: 'Meh' },
  { score: 1, emoji: '🤢', label: 'Wrong call' },
];

// 4.1 — Post-meal feedback loop ("Did we read your mind?"). This is the
// calibration backbone: without ground truth, every other learned signal is
// input with no error signal. One-tap, framed as the AI's accuracy score.
export default function PostMealPrompt() {
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
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: 'rgba(249,115,22,0.15)',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>
        Did we read your mind? 🔮
      </Text>
      <Text style={[fw(600), { fontSize: 12, color: '#64748b', marginTop: 2 }]} numberOfLines={1}>
        {pending.dishName ? `How was the ${pending.dishName}?` : 'How was your last pick?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {OPTIONS.map((opt) => (
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
              backgroundColor: 'rgba(0,0,0,0.03)',
              opacity: resolving ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
            <Text style={[fw(700), { fontSize: 10, color: '#64748b', marginTop: 2 }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
