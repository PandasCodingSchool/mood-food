import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { fw, colors } from '../constants/theme';
import { logSignal } from '../services/signals';

const TRIGGERS = [
  { id: 'sick', label: 'When sick', emoji: '🤒' },
  { id: 'celebration', label: 'Celebrating', emoji: '🎉' },
  { id: 'sad', label: 'Feeling low', emoji: '😔' },
  { id: 'homesick', label: 'Homesick', emoji: '🏠' },
];

// 1.3 — Nostalgia / comfort food map. A periodic single-question card
// (~1/week), warmly framed. Deploying a matching anchor on a low-mood day
// feels uncannily caring.
export default function NostalgiaPrompt({ onDismiss }: { onDismiss: () => void }) {
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
      <View style={{ marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: 'rgba(124,58,237,0.08)', alignItems: 'center' }}>
        <Text style={[fw(700), { fontSize: 13, color: colors.purple }]}>Saved — we'll remember that 💜</Text>
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: 'rgba(124,58,237,0.15)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>What did you eat as a kid when sick? 🍲</Text>
        <TouchableOpacity onPress={onDismiss}><Text style={{ fontSize: 14, color: '#94a3b8' }}>✕</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {TRIGGERS.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTrigger(t.id)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
              backgroundColor: trigger === t.id ? colors.purple : '#fff',
              borderWidth: 2, borderColor: trigger === t.id ? colors.purple : 'rgba(0,0,0,0.08)',
            }}
          >
            <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
            <Text style={[fw(700), { fontSize: 12, color: trigger === t.id ? '#fff' : colors.navy }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        value={food}
        onChangeText={setFood}
        placeholder="e.g. Mom's chicken soup"
        placeholderTextColor="#94a3b8"
        style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.03)', fontSize: 14, color: colors.navy }}
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
