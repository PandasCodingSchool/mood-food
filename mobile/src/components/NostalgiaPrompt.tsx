import { useState } from 'react';
import type { ComponentType } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Thermometer, PartyPopper, CloudRain, Home, Soup, X, Heart } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw, colors } from '../constants/theme';
import { logSignal } from '../services/signals';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

const TRIGGERS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'sick', label: 'When sick', Icon: Thermometer },
  { id: 'celebration', label: 'Celebrating', Icon: PartyPopper },
  { id: 'sad', label: 'Feeling low', Icon: CloudRain },
  { id: 'homesick', label: 'Homesick', Icon: Home },
];

// 1.3 — Nostalgia / comfort food map. A periodic single-question card
// (~1/week), warmly framed. Deploying a matching anchor on a low-mood day
// feels uncannily caring.
export default function NostalgiaPrompt({ onDismiss }: { onDismiss: () => void }) {
  const { theme } = useTheme();
  const [trigger, setTrigger] = useState<string | null>(null);
  const [food, setFood] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!food.trim() || !trigger) return;
    void logSignal('nostalgia', { food: food.trim(), trigger });
    setSubmitted(true);
    setTimeout(onDismiss, 1400);
  };

  if (submitted) {
    return (
      <View style={{ marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: colors.purple + '10', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Heart size={14} color={colors.purple} fill={colors.purple} />
          <Text style={[fw(700), { fontSize: 13, color: colors.purple }]}>Saved — we'll remember that</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 2, borderColor: colors.purple + '25' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Soup size={16} color={theme.text} />
          <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>What did you eat as a kid when sick?</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={{ padding: 4 }}>
          <X size={16} color={theme.subtext} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {TRIGGERS.map((t) => {
          const TriggerIcon = t.Icon;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTrigger(t.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
                backgroundColor: trigger === t.id ? colors.purple : theme.card,
                borderWidth: 2, borderColor: trigger === t.id ? colors.purple : theme.border,
              }}
            >
              <TriggerIcon size={14} color={trigger === t.id ? '#fff' : theme.text} />
              <Text style={[fw(700), { fontSize: 12, color: trigger === t.id ? '#fff' : theme.text }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        value={food}
        onChangeText={setFood}
        placeholder="e.g. Mom's chicken soup"
        placeholderTextColor={theme.muted}
        style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: theme.surface, fontSize: 14, color: theme.text }}
      />
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!food.trim() || !trigger}
        style={{ marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.purple, alignItems: 'center', opacity: !food.trim() || !trigger ? 0.5 : 1 }}
      >
        <Text style={[fw(800), { fontSize: 13, color: '#fff' }]}>Save this memory</Text>
      </TouchableOpacity>
    </View>
  );
}
