import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Utensils, Sun, ArrowRight, PartyPopper, Zap, Trophy, Battery, Frown, Smile, User, Users } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import SliderRow from '../src/components/inputs/SliderRow';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import { saveTodayCheckin, today, type Occasion } from '../src/services/moodState';
import { logSignal } from '../src/services/signals';
import { bumpQuestProgress } from '../src/services/quests';

type LucideIcon = React.ComponentType<{ size?: number; color?: string }>;

const OCCASIONS: Array<{ id: Occasion; icon: LucideIcon; label: string; sub: string }> = [
  { id: 'treat', icon: PartyPopper, label: 'Treat', sub: 'Indulge tonight' },
  { id: 'fuel', icon: Zap, label: 'Fuel', sub: 'Just get it done' },
  { id: 'reward', icon: Trophy, label: 'Reward', sub: 'Earned this one' },
];

// 1.1 — Mood-first check-in, plus 3.3 budget-vibe framing. A ~20s
// opener gating home once/day: energy, stress, hunger, social, occasion.
// Feeds mood_map + per-occasion spend-band learning.
export default function MoodCheckinScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState<0 | 1>(0);
  const [energy, setEnergy] = useState(5);
  const [stress, setStress] = useState(5);
  const [hunger, setHunger] = useState(5);
  const [social, setSocial] = useState(5);
  const [saving, setSaving] = useState(false);

  const handleOccasion = async (occasion: Occasion) => {
    setSaving(true);
    await saveTodayCheckin({ energy, stress, hunger, social, occasion });
    await logSignal('mood_checkin', { energy, stress, hunger, social });
    await logSignal('occasion', { occasion });
    void bumpQuestProgress('mood_streak_7', 1, today());
    trackEvent('mood_checkin_completed', { energy, stress, hunger, social, occasion });
    setSaving(false);
    router.replace((next as never) || '/home');
  };

  if (step === 1) {
    return (
      <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1 }}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
          <Utensils size={36} color={colors.orange} />
          <Text style={[fw(900), { fontSize: 24, color: theme.text, marginTop: 12 }]}>
            Is tonight a...
          </Text>
          <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 4 }]}>
            Helps us match the right budget — no $40 suggestions on a fuel night.
          </Text>
        </View>
        <View style={{ padding: 24, paddingTop: 36, gap: 12 }}>
          {OCCASIONS.map((opt) => {
            const OccasionIcon = opt.icon;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => handleOccasion(opt.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  paddingHorizontal: 20,
                  borderRadius: 16,
                  backgroundColor: theme.card,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <OccasionIcon size={28} color={colors.orange} />
                <View>
                  <Text style={[fw(800), { fontSize: 16, color: theme.text }]}>{opt.label}</Text>
                  <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1 }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
        <Sun size={36} color={colors.orange} />
        <Text style={[fw(900), { fontSize: 24, color: theme.text, marginTop: 12 }]}>
          How are you feeling?
        </Text>
        <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 4 }]}>
          15 seconds — helps us read the room before we pick.
        </Text>
      </View>

      <View style={{ padding: 24, paddingTop: 36 }}>
        <SliderRow
          label="Energy"
          IconLow={Battery}
          IconHigh={Zap}
          value={energy}
          onChange={setEnergy}
          accent={colors.orange}
        />
        <SliderRow
          label="Stress"
          IconLow={Smile}
          IconHigh={Frown}
          value={stress}
          onChange={setStress}
          accent={colors.rose}
        />
        <SliderRow
          label="Hunger"
          IconLow={Smile}
          IconHigh={Utensils}
          value={hunger}
          onChange={setHunger}
          accent={colors.green}
        />
        <SliderRow
          label="Company tonight"
          IconLow={User}
          IconHigh={Users}
          value={social}
          onChange={setSocial}
          accent={colors.purple}
        />
      </View>

      <View style={{ paddingHorizontal: 32, marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => setStep(1)}
          activeOpacity={0.85}
          style={{
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.orange,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>That's me</Text>
          <ArrowRight size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}
