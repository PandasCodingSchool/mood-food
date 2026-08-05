import { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { pressScale } from '../utils/animations';
import { fw, colors } from '../constants/theme';

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
          backgroundColor: done ? 'rgba(22,163,74,0.06)' : '#fff',
          borderWidth: 1.5, borderColor: done ? colors.green : 'rgba(0,0,0,0.06)',
        }}
      >
        <View
          style={{
            width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1,
            backgroundColor: done ? colors.green : 'rgba(0,0,0,0.04)',
            borderWidth: done ? 0 : 1.5, borderColor: 'rgba(0,0,0,0.15)',
          }}
        >
          <Text style={{ fontSize: 13, color: done ? '#fff' : '#94a3b8' }}>{done ? '✓' : index + 1}</Text>
        </View>
        <Text
          style={[
            fw(600),
            { flex: 1, fontSize: 14, lineHeight: 20, color: done ? '#64748b' : colors.navy, textDecorationLine: done ? 'line-through' : 'none' },
          ]}
        >
          {text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
