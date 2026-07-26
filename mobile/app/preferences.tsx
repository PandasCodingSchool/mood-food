import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Leaf, AlertCircle, Wallet, Globe, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import Screen from '../src/components/Screen';
import GradientButton from '../src/components/GradientButton';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';
import { trackEvent } from '../src/utils/analytics';

const DIETS = [
  { id: 'veg', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'keto', label: 'Keto' },
  { id: 'gf', label: 'Gluten-free' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
];
const ALLERGIES = [
  { id: 'nuts', label: 'Nuts' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'soy', label: 'Soy' },
];
const BUDGETS = [
  { id: 0, label: 'Budget' },
  { id: 1, label: 'Moderate' },
  { id: 2, label: 'Splurge' },
  { id: 3, label: 'No limit' },
];
const CUISINES = [
  { id: 'ital', label: 'Italian' },
  { id: 'mex', label: 'Mexican' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'ind', label: 'Indian' },
  { id: 'thai', label: 'Thai' },
  { id: 'kor', label: 'Korean' },
  { id: 'med', label: 'Mediterranean' },
  { id: 'usa', label: 'American' },
];

const DEFAULT_PREFS: UserPreferences = { diets: [], allergies: [], cuisines: [], budget: 1 };

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.orange + '18', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
        <View>
          <Text style={[fw(800), { fontSize: 15, color: theme.text }]}>{title}</Text>
          <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: active ? colors.orange : theme.surface,
        borderWidth: 1,
        borderColor: active ? colors.orange : theme.border,
      }}
    >
      <Text style={[fw(700), { fontSize: 13, color: active ? '#fff' : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PreferencesOnboardingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences()
      .then((p) => setPrefs(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleList = (key: 'diets' | 'allergies' | 'cuisines', id: string) => {
    setPrefs((prev) => {
      const list = prev[key];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [key]: next };
    });
  };

  const setBudget = (id: number) => setPrefs((prev) => ({ ...prev, budget: id }));

  const handleContinue = async () => {
    setSaving(true);
    try {
      await savePreferences(prefs);
      trackEvent('preferences_onboarding_completed');
      router.replace('/home');
    } catch {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[fw(900), { fontSize: 30, color: theme.text, lineHeight: 38 }]}>Let's know your taste</Text>
        <Text style={[fw(600), { fontSize: 15, color: theme.subtext, marginTop: 8, marginBottom: 32 }]}>
          Pick what fits you — you can always change this in Profile.
        </Text>

        <Section
          icon={<Leaf size={18} color={colors.orange} />}
          title="Dietary preferences"
          subtitle="How do you usually eat?"
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DIETS.map((d) => (
              <Chip key={d.id} label={d.label} active={prefs.diets.includes(d.id)} onPress={() => toggleList('diets', d.id)} />
            ))}
          </View>
        </Section>

        <Section
          icon={<AlertCircle size={18} color={colors.orange} />}
          title="Allergies & restrictions"
          subtitle="Things we should skip"
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ALLERGIES.map((a) => (
              <Chip key={a.id} label={a.label} active={prefs.allergies.includes(a.id)} onPress={() => toggleList('allergies', a.id)} />
            ))}
          </View>
        </Section>

        <Section
          icon={<Wallet size={18} color={colors.orange} />}
          title="Default budget"
          subtitle="What fits your wallet?"
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {BUDGETS.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => setBudget(b.id)}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: prefs.budget === b.id ? colors.orange : theme.surface,
                  borderWidth: 1,
                  borderColor: prefs.budget === b.id ? colors.orange : theme.border,
                  alignItems: 'center',
                }}
              >
                <Text style={[fw(800), { fontSize: 12, color: prefs.budget === b.id ? '#fff' : theme.text }]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section
          icon={<Globe size={18} color={colors.orange} />}
          title="Favorite cuisines"
          subtitle="What do you crave most?"
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CUISINES.map((c) => (
              <Chip key={c.id} label={c.label} active={prefs.cuisines.includes(c.id)} onPress={() => toggleList('cuisines', c.id)} />
            ))}
          </View>
        </Section>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 24,
          paddingBottom: 40,
          backgroundColor: theme.bg,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <GradientButton
          label={saving ? 'Saving…' : 'Start exploring'}
          onPress={handleContinue}
          disabled={saving}
          icon={<ChevronRight size={20} color="#fff" />}
        />
      </View>
    </Screen>
  );
}
