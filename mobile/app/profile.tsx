import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType } from 'react';
import { Trophy, Bell, Link2, LogOut, LogIn, Sun, Moon, Sparkles, Leaf, Sprout, Beef, Wheat, CircleDot, Star, Cookie, Milk, Shrimp, Egg, Bean, Circle, Banknote, Wallet, Crown, Sandwich, Fish, Soup, Salad, Utensils, AlertTriangle, Globe } from 'lucide-react-native';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';
import { fetchCurrentUser, logout, type AuthUser } from '../src/services/auth';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';
import { useTheme } from '../src/context/ThemeContext';
import { fetchLearnedProfile } from '../src/services/signals';
import type { LearnedProfile } from '../src/types';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

const DIETS: Array<{ id: string; Icon: LucideIcon; label: string }> = [
  { id: 'veg', Icon: Leaf, label: 'Vegetarian' },
  { id: 'vegan', Icon: Sprout, label: 'Vegan' },
  { id: 'keto', Icon: Beef, label: 'Keto' },
  { id: 'gf', Icon: Wheat, label: 'Gluten-free' },
  { id: 'halal', Icon: CircleDot, label: 'Halal' },
  { id: 'kosher', Icon: Star, label: 'Kosher' },
];
const ALLERGIES: Array<{ id: string; Icon: LucideIcon; label: string }> = [
  { id: 'nuts', Icon: Cookie, label: 'Nuts' },
  { id: 'dairy', Icon: Milk, label: 'Dairy' },
  { id: 'shellfish', Icon: Shrimp, label: 'Shellfish' },
  { id: 'eggs', Icon: Egg, label: 'Eggs' },
  { id: 'soy', Icon: Bean, label: 'Soy' },
];
const BUDGETS: Array<{ id: number; Icon: LucideIcon; label: string }> = [
  { id: 0, Icon: Circle, label: 'Budget' },
  { id: 1, Icon: Banknote, label: 'Moderate' },
  { id: 2, Icon: Wallet, label: 'Splurge' },
  { id: 3, Icon: Crown, label: 'No limit' },
];
const CUISINES: Array<{ id: string; Icon: LucideIcon; label: string }> = [
  { id: 'ital', Icon: Wheat, label: 'Italian' },
  { id: 'mex', Icon: Sandwich, label: 'Mexican' },
  { id: 'jpn', Icon: Fish, label: 'Japanese' },
  { id: 'ind', Icon: Soup, label: 'Indian' },
  { id: 'thai', Icon: Soup, label: 'Thai' },
  { id: 'kor', Icon: Soup, label: 'Korean' },
  { id: 'med', Icon: Salad, label: 'Mediterranean' },
  { id: 'usa', Icon: Beef, label: 'American' },
];

function Chip({ Icon, label, active, onPress }: { Icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
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
      <Icon size={14} color={active ? '#fff' : theme.text} />
      <Text style={[fw(700), { fontSize: 13, color: active ? '#fff' : theme.text }]}>{label}</Text>
    </TouchableOpacity>
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
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Utensils size={32} color="#fff" />
            </LinearGradient>
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
                  <Sparkles size={14} color="#fff" />
                  <Text style={[fw(700), { fontSize: 12, color: '#fff' }]}>
                    {Math.round(learned.accuracy_meter.accuracy * 100)}% mind-read accuracy
                  </Text>
                </View>
              )}
            </LinearGradient>
          )}

          <Section title="Dietary Preferences" icon={<Salad size={16} color={colors.green} />}>
            {DIETS.map((d) => (
              <Chip key={d.id} Icon={d.Icon} label={d.label} active={prefs.diets.includes(d.id)} onPress={() => toggleList('diets', d.id)} />
            ))}
          </Section>

          <Section title="Allergies & Restrictions" icon={<AlertTriangle size={16} color={colors.red} />}>
            {ALLERGIES.map((a) => (
              <Chip key={a.id} Icon={a.Icon} label={a.label} active={prefs.allergies.includes(a.id)} onPress={() => toggleList('allergies', a.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Wallet size={16} color={colors.orange} />
              <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>Default Budget</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {BUDGETS.map((b) => {
                const active = prefs.budget === b.id;
                const BudgetIcon = b.Icon;
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setBudget(b.id)}
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
                    <BudgetIcon size={20} color={active ? '#fff' : theme.text} />
                    <Text style={[fw(700), { fontSize: 11, color: active ? '#fff' : theme.text, marginTop: 4 }]}>{b.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Section title="Favorite Cuisines" icon={<Globe size={16} color={colors.blue} />}>
            {CUISINES.map((c) => (
              <Chip key={c.id} Icon={c.Icon} label={c.label} active={prefs.cuisines.includes(c.id)} onPress={() => toggleList('cuisines', c.id)} />
            ))}
          </Section>

          <View style={{ marginTop: 24, gap: 2 }}>
            {[
              { icon: <Trophy size={20} color={colors.orange} />, label: 'Quests & streaks', onPress: () => router.push('/quests' as never) },
              { icon: <Bell size={20} color={colors.orange} />, label: 'Notifications', onPress: () => router.push('/notifications' as never) },
              { icon: <Link2 size={20} color={colors.orange} />, label: 'Connected delivery apps', onPress: () => router.push('/swiggy-connect' as never) },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={item.onPress}
                activeOpacity={0.8}
                style={{ padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 24, alignItems: 'center' }}>{item.icon}</View>
                  <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>{item.label}</Text>
                </View>
                <Text style={{ fontSize: 14, color: theme.subtext }}>›</Text>
              </TouchableOpacity>
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
                {theme.dark ? <Moon size={20} color={colors.purple} /> : <Sun size={20} color={colors.orange} />}
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
                <LogOut size={20} color={colors.red} />
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
                <LogIn size={20} color={colors.orange} />
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
