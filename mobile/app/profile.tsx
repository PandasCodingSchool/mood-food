import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { User } from 'lucide-react-native';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';
import { fetchCurrentUser, logout, type AuthUser } from '../src/services/auth';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';
import { useTheme } from '../src/context/ThemeContext';
import { fetchLearnedProfile } from '../src/services/signals';
import { pressScale, bounceIn } from '../src/utils/animations';
import type { LearnedProfile } from '../src/types';

const DIETS = [
  { id: 'veg', emoji: '🥬', label: 'Vegetarian' },
  { id: 'vegan', emoji: '🌱', label: 'Vegan' },
  { id: 'keto', emoji: '🥩', label: 'Keto' },
  { id: 'gf', emoji: '🌾', label: 'Gluten-free' },
  { id: 'halal', emoji: '🟢', label: 'Halal' },
  { id: 'kosher', emoji: '✡️', label: 'Kosher' },
];
const ALLERGIES = [
  { id: 'nuts', emoji: '🥜', label: 'Nuts' },
  { id: 'dairy', emoji: '🥛', label: 'Dairy' },
  { id: 'shellfish', emoji: '🦐', label: 'Shellfish' },
  { id: 'eggs', emoji: '🥚', label: 'Eggs' },
  { id: 'soy', emoji: '🌱', label: 'Soy' },
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
  { id: 'kor', emoji: '🍲', label: 'Korean' },
  { id: 'med', emoji: '🥗', label: 'Mediterranean' },
  { id: 'usa', emoji: '🍔', label: 'American' },
];

function Chip({ emoji, label, active, onPress }: { emoji: string; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPressIn={() => pressScale(scale, 0.95)}
        onPressOut={() => pressScale(scale, 1)}
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 14,
          backgroundColor: active ? colors.orange : theme.surface,
          borderWidth: 1.5,
          borderColor: active ? colors.orange : theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text style={{ fontSize: 14 }}>{emoji}</Text>
        <Text style={[fw(700), { fontSize: 13, color: active ? '#fff' : theme.text }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>{title}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

function BudgetButton({ emoji, label, active, onPress }: { emoji: string; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <TouchableOpacity
        onPressIn={() => pressScale(scale, 0.95)}
        onPressOut={() => pressScale(scale, 1)}
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          flex: 1,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: active ? colors.orange : theme.surface,
          borderWidth: 1.5,
          borderColor: active ? colors.orange : theme.border,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
        <Text style={[fw(700), { fontSize: 11, color: active ? '#fff' : theme.text, marginTop: 4 }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function MenuRow({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPressIn={() => pressScale(scale, 0.97)}
        onPressOut={() => pressScale(scale, 1)}
        onPress={onPress}
        activeOpacity={0.8}
        style={{ padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 24, alignItems: 'center' }}><Text style={{ fontSize: 20 }}>{emoji}</Text></View>
          <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>{label}</Text>
        </View>
        <Text style={{ fontSize: 14, color: theme.subtext }}>›</Text>
      </TouchableOpacity>
    </Animated.View>
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
  const [learned, setLearned] = useState<LearnedProfile | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    bounceIn(avatarScale, 100);
  }, []);

  useEffect(() => {
    Promise.all([fetchCurrentUser(), fetchPreferences()])
      .then(([u, p]) => {
        if (u) setUser(u);
        setPrefs(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchLearnedProfile().then(setLearned).catch(() => {});
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
  const displaySub = user?.phone ? user.phone : 'Guest user';

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
            <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: colors.orange,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={34} color="#fff" />
              </View>
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={[fw(900), { fontSize: 20, color: theme.text }]}>{displayName}</Text>
              <Text style={[fw(600), { fontSize: 13, color: theme.subtext, marginTop: 2 }]}>{displaySub}</Text>
            </View>
          </View>

          {learned?.persona && (
            <LinearGradient
              colors={['#7c3aed', '#a78bfa']}
              style={{ borderRadius: 18, padding: 16, marginTop: 4, marginBottom: 8 }}
            >
              <Text style={[fw(800), { fontSize: 11, color: 'rgba(255,255,255,0.8)', letterSpacing: 1, textTransform: 'uppercase' }]}>
                Your food character
              </Text>
              <Text style={[fw(900), { fontSize: 18, color: '#fff', marginTop: 4 }]}>
                {learned.persona.archetype}
              </Text>
              <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6, lineHeight: 18 }]}>
                {learned.persona.blurb}
              </Text>
              {learned.persona.drift_line && (
                <Text style={[fw(600), { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6 }]}>
                  {learned.persona.drift_line}
                </Text>
              )}
              {learned.accuracy_meter && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <Text style={{ fontSize: 14 }}>✨</Text>
                  <Text style={[fw(700), { fontSize: 12, color: '#fff' }]}>
                    {Math.round(learned.accuracy_meter.accuracy * 100)}% mind-read accuracy
                  </Text>
                </View>
              )}
            </LinearGradient>
          )}

          <Section title="Dietary Preferences" icon={<Text style={{ fontSize: 16 }}>🥗</Text>}>
            {DIETS.map((d) => (
              <Chip key={d.id} emoji={d.emoji} label={d.label} active={prefs.diets.includes(d.id)} onPress={() => toggleList('diets', d.id)} />
            ))}
          </Section>

          <Section title="Allergies & Restrictions" icon={<Text style={{ fontSize: 16 }}>⚠️</Text>}>
            {ALLERGIES.map((a) => (
              <Chip key={a.id} emoji={a.emoji} label={a.label} active={prefs.allergies.includes(a.id)} onPress={() => toggleList('allergies', a.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 16 }}>💰</Text>
              <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>Default Budget</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {BUDGETS.map((b) => (
                <BudgetButton
                  key={b.id}
                  emoji={b.emoji}
                  label={b.label}
                  active={prefs.budget === b.id}
                  onPress={() => setBudget(b.id)}
                />
              ))}
            </View>
          </View>

          <Section title="Favorite Cuisines" icon={<Text style={{ fontSize: 16 }}>🌍</Text>}>
            {CUISINES.map((c) => (
              <Chip key={c.id} emoji={c.emoji} label={c.label} active={prefs.cuisines.includes(c.id)} onPress={() => toggleList('cuisines', c.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24, gap: 2 }}>
            {[
              { emoji: '🏆', label: 'Quests & streaks', onPress: () => router.push('/quests' as never) },
              { emoji: '🔔', label: 'Notifications', onPress: () => router.push('/notifications' as never) },
              { emoji: '🔗', label: 'Connected delivery apps', onPress: () => router.push('/swiggy-connect' as never) },
            ].map((item) => (
              <MenuRow key={item.label} emoji={item.emoji} label={item.label} onPress={item.onPress} />
            ))}
          </View>

          <View
            style={{
              marginTop: 16,
              padding: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: theme.card,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>{theme.dark ? '🌙' : '☀️'}</Text>
              </View>
              <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>Dark mode</Text>
            </View>
            <Switch
              value={theme.dark}
              onValueChange={toggleDark}
              thumbColor={theme.dark ? colors.orange : '#f8fafc'}
              trackColor={{ false: theme.border, true: colors.orange + '80' }}
            />
          </View>

          {user ? (
            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.8}
              style={{ marginTop: 8, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.08)', flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View style={{ width: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>🚪</Text>
              </View>
              <Text style={[fw(700), { fontSize: 14, color: colors.red }]}>Log out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/login')}
              activeOpacity={0.8}
              style={{ marginTop: 8, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(249,115,22,0.08)', flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View style={{ width: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>👉</Text>
              </View>
              <Text style={[fw(700), { fontSize: 14, color: colors.orange }]}>Log in / Sign up</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <BottomNav active="profile" />
    </View>
  );
}
