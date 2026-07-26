import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Utensils, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import ChipSelector from '../../src/components/inputs/ChipSelector';
import { CRAVING_TAGS } from '../../src/constants/cravingTags';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { logSignal } from '../../src/services/signals';

// 2.2 — Craving radar: fast sensory-word selection. Texture/temperature
// cravings predict better than cuisine labels. Overrides baseline taste for
// the session (high-weight retrieval filter, acute craving beats history).
export default function CravingRadarScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleContinue = () => {
    void logSignal('craving', { tags: selected });
    trackEvent('game_completed', { game: 'craving_radar', tags: selected });
    const results = {
      mood: 'happy',
      craving: selected[0] || 'comfort',
      budget: 'medium',
      preference: 'both',
      gameData: { type: 'craving_radar', cravingTags: selected },
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
        <Text style={[fw(900), { fontSize: 18, color: theme.text }]}>Craving Radar</Text>
      </View>

      <View style={{ padding: 24, paddingTop: 20 }}>
        <Text style={[fw(800), { fontSize: 20, color: theme.text }]}>What's pulling you right now?</Text>
        <Text style={[fw(600), { fontSize: 13, color: theme.subtext, marginTop: 6 }]}>
          Tap everything that fits — sensations, not cuisines.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, flex: 1 }}>
        <ChipSelector
          options={CRAVING_TAGS}
          selected={selected}
          onToggle={toggle}
          accent={colors.orange}
        />
      </View>

      <View style={{ paddingHorizontal: 32, marginBottom: 24 }}>
        <TouchableOpacity
          onPress={handleContinue}
          disabled={selected.length === 0}
          activeOpacity={0.85}
          style={{ opacity: selected.length === 0 ? 0.5 : 1 }}
        >
          <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Utensils size={20} color="#fff" />
            <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>
              Match my cravings ({selected.length})
            </Text>
            <ArrowRight size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}
