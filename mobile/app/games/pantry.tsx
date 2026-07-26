import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChefHat, Truck, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import ChipSelector from '../../src/components/inputs/ChipSelector';
import { PANTRY_ITEMS } from '../../src/constants/pantryItems';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { logSignal } from '../../src/services/signals';

// 2.3 — Fridge/pantry "cook vs. order" game. Text-chip ingredient input
// (photo + vision ingredient-detection is a documented future enhancement —
// this version learns the cook-vs-order boundary from the explicit choice).
export default function PantryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<'cook' | 'order' | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleChoice = (chose: 'cook' | 'order') => {
    setChoice(chose);
    void logSignal('pantry', { items: selected, chose });
    trackEvent('game_completed', { game: 'pantry', chose, items: selected });
  };

  const handleGetResults = () => {
    const results = {
      mood: 'happy',
      craving: 'comfort',
      budget: 'medium',
      preference: 'both',
      gameData: { type: 'pantry', pantryItems: selected },
    };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1 }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: theme.text }]}>What's in your kitchen?</Text>
      </View>

      <View style={{ padding: 24, flex: 1 }}>
        <Text style={[fw(600), { fontSize: 13, color: theme.subtext, marginBottom: 16 }]}>
          Tap what you've got — we'll help you decide cook or order.
        </Text>
        <ChipSelector options={PANTRY_ITEMS} selected={selected} onToggle={toggle} accent={colors.green} />

        {choice ? (
          <View style={{ marginTop: 24, padding: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.2)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {choice === 'cook' ? <ChefHat size={20} color={colors.green} /> : <Truck size={20} color={colors.green} />}
              <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>
                {choice === 'cook' ? 'Nice, cooking it is!' : 'Order it is — good call.'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleGetResults} activeOpacity={0.85} style={{ marginTop: 16 }}>
              <LinearGradient colors={['#16a34a', '#4ade80']} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                <Text style={[fw(900), { fontSize: 15, color: '#fff' }]}>Show me my matches</Text>
                <ArrowRight size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginTop: 24, flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={() => handleChoice('cook')}
              style={{ flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center' }}
            >
              <ChefHat size={28} color={colors.green} />
              <Text style={[fw(800), { fontSize: 13, color: theme.text, marginTop: 6 }]}>I'll cook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleChoice('order')}
              style={{ flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center' }}
            >
              <Truck size={28} color={colors.green} />
              <Text style={[fw(800), { fontSize: 13, color: theme.text, marginTop: 6 }]}>Order in</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}
