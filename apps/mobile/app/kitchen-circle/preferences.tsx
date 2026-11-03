import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { FilterChip, Screen, SegmentedControl, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  addPreference, createRule, deletePreference, importMoodFoodPreferences, indiaDate, listMembers, listMyPreferences, listRules, mondayOfDate, removeRule,
  type HouseholdMember, type HouseholdRule, type MemberPreference,
} from '../../src/features/kitchen-circle/api';
import { kc } from '../../src/features/kitchen-circle/brand';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STRENGTHS: Array<{ value: MemberPreference['strength']; label: string; hint: string }> = [
  { value: 'cannot_eat', label: 'Can’t eat', hint: 'Never on a day you’re eating (allergies, diet).' },
  { value: 'never_plan', label: 'Never plan', hint: 'Kept off the whole household’s plan.' },
  { value: 'prefer_less', label: 'Less often', hint: 'Planned less, not banned.' },
  { value: 'favourite', label: 'Favourite', hint: 'Planned more, fairly shared with others.' },
];
const CATEGORIES: Array<{ value: string; label: string; example: string }> = [
  { value: 'diet', label: 'Diet', example: 'vegetarian, vegan, jain, eggetarian' },
  { value: 'allergen', label: 'Allergy', example: 'peanuts, dairy, gluten' },
  { value: 'ingredient', label: 'Ingredient', example: 'mushroom, brinjal' },
  { value: 'cuisine', label: 'Cuisine', example: 'South Indian' },
  { value: 'protein', label: 'Protein', example: 'paneer, chicken' },
  { value: 'dish', label: 'Dish', example: 'Rajma Chawal' },
];

type Preset = { key: string; label: string; strength: HouseholdRule['strength']; category: string; constraint: (extra: string) => Record<string, unknown>; needs?: 'member' | 'amount' };
const PRESETS: Preset[] = [
  { key: 'veg', label: 'Vegetarian day', strength: 'hard', category: 'diet', constraint: () => ({ diet: 'vegetarian' }) },
  { key: 'no_og', label: 'No onion & garlic', strength: 'hard', category: 'ingredient', constraint: () => ({ exclude_ingredients: ['onion', 'garlic'] }) },
  { key: 'quick', label: 'Quick day (30 min)', strength: 'preference', category: 'effort', constraint: () => ({ max_total_minutes: 30 }) },
  { key: 'elaborate', label: 'Elaborate meal welcome', strength: 'contextual', category: 'effort', constraint: () => ({ effort: ['involved', 'medium'] }) },
  { key: 'cook_off', label: 'Cook unavailable', strength: 'contextual', category: 'cook', constraint: () => ({ cook_unavailable: true }) },
  { key: 'budget', label: 'Budget per serving', strength: 'preference', category: 'budget', constraint: (amount) => ({ budget_per_serving_rupees: Number(amount) }), needs: 'amount' },
  { key: 'away', label: 'Someone is usually out', strength: 'hard', category: 'absence', constraint: (userId) => ({ user_id: userId }), needs: 'member' },
];

function describeRule(rule: HouseholdRule, members: HouseholdMember[]) {
  const c = rule.constraint as Record<string, unknown>;
  const day = rule.weekday == null ? 'Every day' : `${WEEKDAYS[rule.weekday]}${rule.appliesToWeekStart ? ' (this week only)' : 's'}`;
  if (rule.category === 'absence') return `${day}: ${members.find((m) => m.userId === c.user_id)?.name ?? 'Someone'} is out`;
  if (c.diet) return `${day}: ${c.diet}`;
  if (Array.isArray(c.exclude_ingredients)) return `${day}: no ${c.exclude_ingredients.join(' or ')}`;
  if (c.max_total_minutes) return `${day}: under ${c.max_total_minutes} min`;
  if (c.cook_unavailable) return `${day}: cook unavailable, keep it simple`;
  if (c.budget_per_serving_rupees) return `${day}: about ₹${c.budget_per_serving_rupees} a serving`;
  if (Array.isArray(c.effort)) return `${day}: ${c.effort.join(' or ')} effort`;
  if (c.cuisine) return `${day}: ${c.cuisine}`;
  return `${day}: ${rule.category}`;
}

/** A member's own (private) food preferences and the household's recurring or this-week rules. */
export default function KitchenCirclePreferencesScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId, role } = useLocalSearchParams<{ householdId: string; role?: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const canEditRules = role !== 'cook';
  const [prefs, setPrefs] = useState<MemberPreference[]>([]);
  const [rules, setRules] = useState<HouseholdRule[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [strength, setStrength] = useState<MemberPreference['strength']>('cannot_eat');
  const [category, setCategory] = useState('allergen');
  const [value, setValue] = useState('');
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [weekday, setWeekday] = useState(0);
  const [scope, setScope] = useState<'every' | 'this'>('every');
  const [extra, setExtra] = useState('');

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true); setError(null);
    try {
      const [p, r, m] = await Promise.all([listMyPreferences(householdId), listRules(householdId), listMembers(householdId)]);
      setPrefs(p); setRules(r); setMembers(m);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load preferences'); }
    finally { setLoading(false); }
  }, [householdId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setNotice(null);
    try { await action(); } catch (err) { setNotice(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(null); }
  };
  const input = { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 16, padding: 12, backgroundColor: kc.raised } as const;
  const strengthLabel = (s: MemberPreference['strength']) => STRENGTHS.find((x) => x.value === s)?.label ?? s;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} title="Food & rules" />
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {loading ? <KcLoader label="Loading preferences" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <>
        {notice ? <Surface radius={16} style={{ padding: 14 }}><Text variant="caption13">{notice}</Text></Surface> : null}

        <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="label" tone="ink2">WHAT I EAT · ONLY YOU SEE THIS</Text>
          <Text variant="caption13" tone="ink2">The planner uses these on days you’re eating. Others only ever see that a meal “fits everyone”.</Text>
          {prefs.map((p) => <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p.strength === 'cannot_eat' ? kc.mirchiTint : p.strength === 'favourite' ? kc.leafTint : kc.sand }}>
              <Text variant="micro12" color={p.strength === 'cannot_eat' ? kc.mirchi : kc.kadhai} style={{ fontFamily: 'Figtree_700Bold' }}>{strengthLabel(p.strength)}</Text>
            </View>
            <Text variant="body14" style={{ flex: 1 }}>{p.value} <Text variant="caption13" tone="ink2">· {CATEGORIES.find((c) => c.value === p.category || (p.category === 'allergy' && c.value === 'allergen'))?.label ?? p.category}</Text></Text>
            <Pressable onPress={() => void run(`del-${p.id}`, async () => { await deletePreference(householdId, p.id); setPrefs(await listMyPreferences(householdId)); })} accessibilityRole="button" accessibilityLabel={`Remove ${p.value}`}>
              <Text variant="caption13" tone="ink2">Remove</Text>
            </Pressable>
          </View>)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {STRENGTHS.map((s) => <FilterChip key={s.value} label={s.label} selected={strength === s.value} onPress={() => setStrength(s.value)} />)}
          </ScrollView>
          <Text variant="caption13" tone="ink2">{STRENGTHS.find((s) => s.value === strength)?.hint}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CATEGORIES.map((c) => <FilterChip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />)}
          </ScrollView>
          <TextInput value={value} onChangeText={setValue} placeholder={`e.g. ${CATEGORIES.find((c) => c.value === category)?.example}`} placeholderTextColor={colors.ink2} style={input} accessibilityLabel="Preference value" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Add" size="md" style={{ flex: 1 }} loading={busy === 'add'} onPress={() => void run('add', async () => {
              if (!value.trim()) throw new Error('Type what it applies to.');
              await addPreference(householdId, { strength, category, value: value.trim() }); setValue(''); setPrefs(await listMyPreferences(householdId));
            })} />
            <Button label="Import from MoodFood" size="md" variant="outline" style={{ flex: 1 }} loading={busy === 'import'} onPress={() => void run('import', async () => {
              const n = await importMoodFoodPreferences(householdId); setPrefs(await listMyPreferences(householdId));
              setNotice(n ? `Imported ${n} from your MoodFood profile — only your diets, allergies and favourite cuisines, never your orders.` : 'Nothing to import from your MoodFood profile yet.');
            })} />
          </View>
        </Surface>

        <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="label" tone="ink2">HOUSEHOLD RULES</Text>
          {rules.length ? rules.map((r) => <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.strength === 'hard' ? kc.curryLeaf : kc.haldi }} />
            <Text variant="body14" style={{ flex: 1 }}>{describeRule(r, members)}</Text>
            {canEditRules ? <Pressable onPress={() => void run(`rr-${r.id}`, async () => { await removeRule(householdId, r.id); setRules(await listRules(householdId)); })} accessibilityRole="button">
              <Text variant="caption13" tone="ink2">Remove</Text></Pressable> : null}
          </View>) : <Text variant="caption13" tone="ink2">No rules yet. Rules shape suggestions and keep every week safe for everyone.</Text>}
          {canEditRules ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: kc.steel, paddingTop: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {PRESETS.map((p) => <FilterChip key={p.key} label={p.label} selected={preset.key === p.key} onPress={() => { setPreset(p); setExtra(''); }} />)}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAYS.map((d, i) => <Pressable key={d} onPress={() => setWeekday(i)} accessibilityRole="button" accessibilityState={{ selected: weekday === i }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: kc.curryLeaf, backgroundColor: weekday === i ? kc.curryLeaf : 'transparent' }}>
                <Text variant="caption13" color={weekday === i ? kc.chawal : kc.curryLeaf} style={{ fontFamily: 'Figtree_700Bold' }}>{d}</Text>
              </Pressable>)}
            </View>
            {preset.needs === 'member' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {members.filter((m) => m.role !== 'cook').map((m) => <FilterChip key={m.userId} label={m.name} selected={extra === m.userId} onPress={() => setExtra(m.userId)} />)}
            </ScrollView> : null}
            {preset.needs === 'amount' ? <TextInput value={extra} onChangeText={setExtra} keyboardType="number-pad" placeholder="₹ per serving" placeholderTextColor={colors.ink2} style={input} accessibilityLabel="Budget per serving in rupees" /> : null}
            <SegmentedControl options={[{ value: 'every', label: 'Every week' }, { value: 'this', label: 'Just this week' }]} value={scope} onChange={setScope} />
            {preset.key === 'budget' ? <Text variant="caption13" tone="ink2">Saved now; suggestions start using it once recipes carry prices.</Text> : null}
            <Button label="Add rule" size="md" variant="outline" loading={busy === 'rule'} onPress={() => void run('rule', async () => {
              if (preset.needs === 'member' && !extra) throw new Error('Choose who is usually out.');
              if (preset.needs === 'amount' && !(Number(extra) > 0)) throw new Error('Enter a budget in rupees.');
              await createRule(householdId, { weekday, strength: preset.strength, category: preset.category, constraint: preset.constraint(extra),
                appliesToWeekStart: scope === 'this' ? mondayOfDate(indiaDate()) : null });
              setRules(await listRules(householdId)); setExtra('');
            })} />
          </View> : null}
        </Surface>
      </>}
    </ScrollView></Screen></View>;
}
