import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import SliderRow from '../src/components/inputs/SliderRow';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import { saveTodayCheckin, type Occasion } from '../src/services/moodState';
import { logSignal } from '../src/services/signals';
import { bumpQuestProgress } from '../src/services/quests';

const OCCASIONS: Array<{ id: Occasion; emoji: string; label: string; sub: string }> = [
  { id: 'treat', emoji: '🎉', label: 'Treat', sub: 'Indulge tonight' },
  { id: 'fuel', emoji: '⚡', label: 'Fuel', sub: 'Just get it done' },
  { id: 'reward', emoji: '🏅', label: 'Reward', sub: 'Earned this one' },
];

// 1.1 — Mood-first emoji check-in, plus 3.3 budget-vibe framing. A ~20s
// opener gating home once/day: energy, stress, hunger, social, occasion.
// Feeds mood_map + per-occasion spend-band learning.
export default function MoodCheckinScreen() {
  const router = useRouter();
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
    void bumpQuestProgress('mood_streak_7');
    trackEvent('mood_checkin_completed', { energy, stress, hunger, social, occasion });
    setSaving(false);
    router.replace((next as never) || '/home');
  };

  if (step === 1) {
    return (
      <LinearGradient colors={['#fff5eb', '#ffffff']} style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 36 }}>🍽️</Text>
          <Text style={[fw(900), { fontSize: 24, color: colors.navy, marginTop: 12 }]}>
            Is tonight a...
          </Text>
          <Text style={[fw(600), { fontSize: 14, color: '#94a3b8', marginTop: 4 }]}>
            Helps us match the right budget — no $40 suggestions on a fuel night.
          </Text>
        </View>
        <View style={{ padding: 24, paddingTop: 36, gap: 12 }}>
          {OCCASIONS.map((opt) => (
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
                backgroundColor: '#fff',
                borderWidth: 2,
                borderColor: 'rgba(0,0,0,0.08)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
              <View>
                <Text style={[fw(800), { fontSize: 16, color: colors.navy }]}>{opt.label}</Text>
                <Text style={[fw(600), { fontSize: 12, color: '#94a3b8' }]}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#fff5eb', '#ffffff']} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 36 }}>🌤️</Text>
        <Text style={[fw(900), { fontSize: 24, color: colors.navy, marginTop: 12 }]}>
          How are you feeling?
        </Text>
        <Text style={[fw(600), { fontSize: 14, color: '#94a3b8', marginTop: 4 }]}>
          15 seconds — helps us read the room before we pick.
        </Text>
      </View>

      <View style={{ padding: 24, paddingTop: 36 }}>
        <SliderRow
          label="Energy"
          emojiLow="🥱"
          emojiHigh="⚡"
          value={energy}
          onChange={setEnergy}
          accent={colors.orange}
        />
        <SliderRow
          label="Stress"
          emojiLow="😌"
          emojiHigh="😰"
          value={stress}
          onChange={setStress}
          accent={colors.rose}
        />
        <SliderRow
          label="Hunger"
          emojiLow="🙂"
          emojiHigh="🍽️"
          value={hunger}
          onChange={setHunger}
          accent={colors.green}
        />
        <SliderRow
          label="Company tonight"
          emojiLow="🧘 Solo"
          emojiHigh="👯 Group"
          value={social}
          onChange={setSocial}
          accent={colors.purple}
        />
      </View>

      <View style={{ paddingHorizontal: 32, marginTop: 8 }}>
        <TouchableOpacity onPress={() => setStep(1)} activeOpacity={0.85}>
          <LinearGradient
            colors={['#f97316', '#fbbf24']}
            style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>That's me →</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}
