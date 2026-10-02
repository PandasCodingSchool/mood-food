import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw, colors } from '../constants/theme';
import { logSignal } from '../services/signals';
import type { UnderstandMeQuestion } from '../types';

// 5.6 — Quick-tap questions surfaced on the recommendations loading screen.
// Answering one keeps the loading gate up until all questions are done;
// leaving it untouched never blocks the recommendations from showing.
export default function UnderstandMePrompt({
  questions,
  onStart,
  onDone,
}: {
  questions: UnderstandMeQuestion[];
  onStart: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const [index, setIndex] = useState(0);
  const [answeredId, setAnsweredId] = useState<string | null>(null);

  if (index >= questions.length) return null;
  const question = questions[index];

  const handleAnswer = (optionId: string, payload: Record<string, unknown>) => {
    if (index === 0 && answeredId === null) onStart();
    setAnsweredId(optionId);
    void logSignal(question.signal_type, payload);
    setTimeout(() => {
      const next = index + 1;
      if (next >= questions.length) {
        onDone();
      } else {
        setIndex(next);
        setAnsweredId(null);
      }
    }, 350);
  };

  return (
    <View style={{ marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 2, borderColor: colors.orange + '25' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Sparkles size={16} color={colors.orange} />
          <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>{question.prompt}</Text>
        </View>
        <TouchableOpacity onPress={onDone} style={{ padding: 4 }}>
          <X size={16} color={theme.subtext} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {question.options.map((option) => (
          <TouchableOpacity
            key={option.id}
            onPress={() => handleAnswer(option.id, option.payload)}
            disabled={answeredId != null}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
              backgroundColor: answeredId === option.id ? colors.orange : theme.card,
              borderWidth: 2, borderColor: answeredId === option.id ? colors.orange : theme.border,
              opacity: answeredId != null && answeredId !== option.id ? 0.5 : 1,
            }}
          >
            {option.emoji && <Text style={{ fontSize: 13 }}>{option.emoji}</Text>}
            <Text style={[fw(700), { fontSize: 12, color: answeredId === option.id ? '#fff' : theme.text }]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 12, justifyContent: 'center' }}>
        {questions.map((_, i) => (
          <View
            key={i}
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.orange : theme.border }}
          />
        ))}
      </View>
    </View>
  );
}
