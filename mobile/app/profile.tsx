import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';
import { fetchCurrentUser, logout, type AuthUser } from '../src/services/auth';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';
import { useTheme } from '../src/context/ThemeContext';

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

const DEFAULT_PREFS: UserPreferences = { diets: [], allergies: [], cuisines: [], budget: 1 };

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, toggleDark } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([fetchCurrentUser(), fetchPreferences()])
      .then(([u, p]) => {
        if (u) setUser(u);
        setPrefs(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persistPrefs = useCallback((next: UserPreferences) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await savePreferences(next);
      } catch {
        // silent — UI already reflects the choice
      } finally {
        setSaving(false);
      }
    }, 600);
  }, []);

  const toggleList = (key: 'diets' | 'allergies' | 'cuisines', id: string) => {
    setPrefs((prev) => {
      const list = prev[key];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      const updated = { ...prev, [key]: next };
      persistPrefs(updated);
      return updated;
    });
  };

  const setBudget = (id: number) => {
    setPrefs((prev) => {
      const updated = { ...prev, budget: id };
      persistPrefs(updated);
      return updated;
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const displayName = user?.name || 'Foodie Explorer';
  const displaySub = user?.phone ? `📱 ${user.phone}` : 'Guest user';

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[fw(900), { fontSize: 24, color: theme.text }]}>Profile</Text>
        {saving && <ActivityIndicator size="small" color={colors.orange} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 }}>
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 36 }}>😎</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>{displayName}</Text>
              <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', marginTop: 2 }]}>{displaySub}</Text>
            </View>
          </View>

          <Section title="🥗 Dietary Preferences">
            {DIETS.map((d) => (
              <Chip key={d.id} emoji={d.emoji} label={d.label} active={prefs.diets.includes(d.id)} onPress={() => toggleList('diets', d.id)} />
            ))}
          </Section>

          <Section title="⚠️ Allergies & Restrictions">
            {ALLERGIES.map((a) => (
              <Chip key={a.id} emoji={a.emoji} label={a.label} active={prefs.allergies.includes(a.id)} onPress={() => toggleList('allergies', a.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24 }}>
            <Text style={[fw(800), { fontSize: 14, color: colors.navy, marginBottom: 12 }]}>💰 Default Budget</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {BUDGETS.map((b) => {
                const active = prefs.budget === b.id;
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
              <Chip key={c.id} emoji={c.emoji} label={c.label} active={prefs.cuisines.includes(c.id)} onPress={() => toggleList('cuisines', c.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24, gap: 2 }}>
            {[
              { icon: '🔔', label: 'Notifications', onPress: () => router.push('/notifications' as never) },
              { icon: '🔗', label: 'Connected delivery apps', onPress: () => router.push('/swiggy-connect' as never) },
              { icon: theme.dark ? '☀️' : '🌙', label: theme.dark ? 'Light mode' : 'Dark mode', onPress: toggleDark },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={item.onPress}
                activeOpacity={0.8}
                style={{ padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>{item.label}</Text>
                </View>
                <Text style={{ fontSize: 14, color: '#94a3b8' }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>

          {user ? (
            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.8}
              style={{ marginTop: 16, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#fff0f0', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#fecaca' }}
            >
              <Text style={{ fontSize: 18 }}>🚪</Text>
              <Text style={[fw(700), { fontSize: 14, color: colors.red }]}>Log out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/login')}
              activeOpacity={0.8}
              style={{ marginTop: 16, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(249,115,22,0.08)', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)' }}
            >
              <Text style={{ fontSize: 18 }}>🔐</Text>
              <Text style={[fw(700), { fontSize: 14, color: colors.orange }]}>Log in / Sign up</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <BottomNav active="profile" />
    </View>
  );
}
