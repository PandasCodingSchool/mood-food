import { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { pressScale } from '../utils/animations';
import { fw, colors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
  steps: string[];
  completed: Set<number>;
  onToggle: (index: number) => void;
};

export default function StepChecklist({ steps, completed, onToggle }: Props) {
  return (
    <View style={{ gap: 10 }}>
      {steps.map((step, i) => (
        <StepCard key={i} index={i} text={step} done={completed.has(i)} onToggle={() => onToggle(i)} />
      ))}
    </View>
  );
}

function StepCard({ index, text, done, onToggle }: { index: number; text: string; done: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPressIn={() => pressScale(scale, 0.98)}
        onPressOut={() => pressScale(scale, 1)}
        onPress={onToggle}
        style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: done ? 'rgba(22,163,74,0.06)' : theme.card,
          borderWidth: 1.5, borderColor: done ? colors.green : theme.border,
        }}
      >
        <View
          style={{
            width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1,
            backgroundColor: done ? colors.green : theme.overlay,
            borderWidth: done ? 0 : 1.5, borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 13, color: done ? '#fff' : theme.muted }}>{done ? '✓' : index + 1}</Text>
        </View>
        <Text
          style={[
            fw(600),
            { flex: 1, fontSize: 14, lineHeight: 20, color: done ? theme.subtext : theme.text, textDecorationLine: done ? 'line-through' : 'none' },
          ]}
        >
          {text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
