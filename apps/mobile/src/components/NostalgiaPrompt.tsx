import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { fontFamily, space } from '@moodfood/tokens';
import { Button, FilterChip, Icon, IconButton, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { logSignal } from '../services/signals';

const TRIGGERS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'sick', label: 'When sick', icon: 'water_drop' },
  { id: 'celebration', label: 'Celebrating', icon: 'celebration' },
  { id: 'sad', label: 'Feeling low', icon: 'rainy' },
  { id: 'homesick', label: 'Homesick', icon: 'home' },
];

// 1.3 — Nostalgia / comfort food map. A periodic single-question card
// (~1/week), warmly framed. Deploying a matching anchor on a low-mood day
// feels uncannily caring.
export default function NostalgiaPrompt({ onDismiss }: { onDismiss: () => void }) {
  const { colors } = useTheme();
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
      <Surface kind="accentSoft" radius={24} padding={16} style={{ marginHorizontal: space.gutter, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="favorite" size={20} tone="accText" filled />
        <Text variant="bodyStrong14" tone="accText">Saved, we'll remember that</Text>
      </Surface>
    );
  }

  return (
    <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="soup_kitchen" size={18} tone="accText" />
        <Text variant="label" tone="ink2" style={{ flex: 1 }}>Comfort food memory</Text>
        <IconButton icon="close" label="Dismiss" size={32} onPress={onDismiss} />
      </View>
      <Text variant="title19" style={{ marginTop: 6 }}>What did you eat as a kid when you needed comfort?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {TRIGGERS.map((t) => (
          <FilterChip key={t.id} label={t.label} icon={t.icon} selected={trigger === t.id} onPress={() => setTrigger(t.id)} />
        ))}
      </View>
      <Surface kind="tint" radius={16} style={{ marginTop: 12, paddingHorizontal: 14 }}>
        <TextInput
          value={food}
          onChangeText={setFood}
          placeholder="e.g. Mom's khichdi"
          placeholderTextColor={colors.ink2}
          accessibilityLabel="Comfort food"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          style={{ height: 48, color: colors.ink, fontFamily: fontFamily.bodyMedium, fontSize: 15 }}
        />
      </Surface>
      <Button label="Save this memory" size="md" block disabled={!food.trim() || !trigger} onPress={handleSubmit} style={{ marginTop: 12 }} />
    </Surface>
  );
}
