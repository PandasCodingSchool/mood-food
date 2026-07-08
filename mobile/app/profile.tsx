import { useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';

const DIETS = [
  { id: 'veg', emoji: '🥬', label: 'Vegetarian' },
  { id: 'vegan', emoji: '🌱', label: 'Vegan' },
  { id: 'keto', emoji: '🥓', label: 'Keto' },
  { id: 'gf', emoji: '🌾', label: 'Gluten-free' },
  { id: 'halal', emoji: '🕌', label: 'Halal' },
  { id: 'kosher', emoji: '✡️', label: 'Kosher' },
];
const ALLERGIES = [
  { id: 'nuts', emoji: '🥜', label: 'Nuts' },
  { id: 'dairy', emoji: '🥛', label: 'Dairy' },
  { id: 'shellfish', emoji: '🦐', label: 'Shellfish' },
  { id: 'eggs', emoji: '🥚', label: 'Eggs' },
  { id: 'soy', emoji: '🫘', label: 'Soy' },
];
const BUDGETS = [
  { id: 0, emoji: '🪙', label: 'Budget' },
  { id: 1, emoji: '💵', label: 'Moderate' },
  { id: 2, emoji: '💸', label: 'Splurge' },
  { id: 3, emoji: '👑', label: 'No limit' },
];
const CUISINES = [
  { id: 'ital', emoji: '🍝', label: 'Italian' },
  { id: 'mex', emoji: '🌮', label: 'Mexican' },
  { id: 'jpn', emoji: '🍣', label: 'Japanese' },
  { id: 'ind', emoji: '🍛', label: 'Indian' },
  { id: 'thai', emoji: '🍜', label: 'Thai' },
  { id: 'kor', emoji: '🥘', label: 'Korean' },
  { id: 'med', emoji: '🥙', label: 'Mediterranean' },
  { id: 'usa', emoji: '🍔', label: 'American' },
];

function Chip({ emoji, label, active, onPress }: { emoji: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 14,
        backgroundColor: active ? 'rgba(249,115,22,0.1)' : '#fff',
        borderWidth: 2,
        borderColor: active ? colors.orange : 'rgba(0,0,0,0.08)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Text style={[fw(700), { fontSize: 13, color: active ? colors.orange : '#64748b' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[fw(800), { fontSize: 14, color: colors.navy, marginBottom: 12 }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [diets, setDiets] = useState<Record<string, boolean>>({});
  const [allergies, setAllergies] = useState<Record<string, boolean>>({});
  const [budget, setBudget] = useState(1);
  const [cuisines, setCuisines] = useState<Record<string, boolean>>({});

  const toggle = (setter: typeof setDiets, key: string) => setter((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <Text style={[fw(900), { fontSize: 24, color: colors.navy }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 }}>
          <LinearGradient colors={['#f97316', '#fbbf24']} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36 }}>😎</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>Foodie Explorer</Text>
            <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', marginTop: 2 }]}>12 games played · 8 meals saved</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {[{ n: 12, l: 'Games' }, { n: 8, l: 'Saved' }, { n: 3, l: 'Ordered' }].map((s) => (
            <View key={s.l} style={{ flex: 1, padding: 14, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
              <Text style={[fw(900), { fontSize: 24, color: colors.orange }]}>{s.n}</Text>
              <Text style={[fw(700), { fontSize: 11, color: '#94a3b8', marginTop: 2 }]}>{s.l}</Text>
            </View>
          ))}
        </View>

        <Section title="🥗 Dietary Preferences">
          {DIETS.map((d) => (
            <Chip key={d.id} emoji={d.emoji} label={d.label} active={!!diets[d.id]} onPress={() => toggle(setDiets, d.id)} />
          ))}
        </Section>

        <Section title="⚠️ Allergies & Restrictions">
          {ALLERGIES.map((a) => (
            <Chip key={a.id} emoji={a.emoji} label={a.label} active={!!allergies[a.id]} onPress={() => toggle(setAllergies, a.id)} />
          ))}
        </Section>

        <View style={{ marginTop: 24 }}>
          <Text style={[fw(800), { fontSize: 14, color: colors.navy, marginBottom: 12 }]}>💰 Default Budget</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {BUDGETS.map((b) => {
              const active = budget === b.id;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setBudget(b.id)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 14,
                    backgroundColor: active ? 'rgba(249,115,22,0.1)' : '#fff',
                    borderWidth: 2,
                    borderColor: active ? colors.orange : 'rgba(0,0,0,0.08)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{b.emoji}</Text>
                  <Text style={[fw(700), { fontSize: 11, color: active ? colors.orange : '#64748b', marginTop: 4 }]}>{b.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Section title="🌍 Favorite Cuisines">
          {CUISINES.map((c) => (
            <Chip key={c.id} emoji={c.emoji} label={c.label} active={!!cuisines[c.id]} onPress={() => toggle(setCuisines, c.id)} />
          ))}
        </Section>

        <View style={{ marginTop: 24, gap: 2 }}>
          {[
            { icon: '🔔', label: 'Notifications', onPress: () => {} },
            { icon: '🔗', label: 'Connected delivery apps', onPress: () => {} },
            { icon: '🌙', label: 'Dark mode', onPress: () => {} },
            { icon: '📋', label: 'Join waitlist', onPress: () => router.push('/waitlist') },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              activeOpacity={0.8}
              style={{ padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                <Text style={[fw(700), { fontSize: 14, color: colors.navy }]}>{item.label}</Text>
              </View>
              <Text style={{ fontSize: 14, color: '#94a3b8' }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav active="profile" />
    </View>
  );
}
