import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { space } from '@moodfood/tokens';
import { Icon, IconButton, StepDots, Surface, Text, useTheme } from '@moodfood/ui';
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
  const { colors } = useTheme();
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
    <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="auto_awesome" size={18} tone="accText" />
        <Text variant="label" tone="ink2" style={{ flex: 1 }}>Help us understand you</Text>
        <IconButton icon="close" label="Skip questions" size={32} onPress={onDone} />
      </View>
      <Text variant="title19" style={{ marginTop: 6 }}>{question.prompt}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {question.options.map((option) => {
          const on = answeredId === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleAnswer(option.id, option.payload)}
              disabled={answeredId != null}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                height: 40,
                paddingHorizontal: 14,
                borderRadius: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: on ? 'transparent' : colors.line,
                backgroundColor: on ? colors.acc : colors.surf,
                opacity: answeredId != null && !on ? 0.5 : 1,
              }}
            >
              {option.emoji ? <Text variant="caption13">{option.emoji}</Text> : null}
              <Text variant="caption13" style={{ fontFamily: 'Geist_500Medium' }} color={on ? colors.onAcc : colors.ink}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {questions.length > 1 ? (
        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <StepDots count={questions.length} index={index} />
        </View>
      ) : null}
    </Surface>
  );
}
