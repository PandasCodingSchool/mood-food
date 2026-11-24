import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Screen, SegmentedControl, Surface, TabBar, Text, Toggle, useTheme } from '@moodfood/ui';
import { ErrorBlock } from '../../src/components/v2';
import { kc } from '../../src/features/kitchen-circle/brand';
import { CookViewPanel } from '../../src/features/kitchen-circle/cook-view';
import { DayRings, KcButton as Button, KcIntro, KcLoader, KcWordmark, ModeSwitch, shouldPlayIntro } from '../../src/features/kitchen-circle/components';
import {
  COOK_LANGUAGES, createCookLink, createKitchenCircleHousehold, createKitchenCircleNextWeekPlan, getCookWeek, getMemberSettings, getPlanFeedback,
  getPlanPeople, KitchenCircleError, sendCookMenu, speakFromCookWeek, reactToDay, recordMealFeedback, setAttendance, updateMemberSettings, type CookLanguage, type DayPeople, type CookView, type MemberSettings, getKitchenCirclePlan, indiaDate, listKitchenCircleHouseholds, mondayOfDate,
  recipeSourceLabel, setKitchenCircleSlotLock, updateKitchenCircleSlot, type KitchenCircleHousehold, type KitchenCirclePlan, type KitchenCircleSlot,
} from '../../src/features/kitchen-circle/api';

const stateLabel: Record<KitchenCircleSlot['state'], string> = {
  blank: 'Choose a meal', planned: 'Planned', locked: 'Locked', leftovers: 'Leftovers', no_cook: 'No-cook', household_out: 'Eating out',
};

export default function KitchenCircleScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [household, setHousehold] = useState<KitchenCircleHousehold | null>(null);
  const [role, setRole] = useState<'owner' | 'member' | 'cook'>('owner');
  const viewedWeek = useRef<{ householdId: string; weekStart: string } | null>(null);
  const [plan, setPlan] = useState<KitchenCirclePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState('My KitchenCircle');
  const [defaultServings, setDefaultServings] = useState('1');
  const [editing, setEditing] = useState<KitchenCircleSlot | null>(null);
  const [mealTitle, setMealTitle] = useState('');
  const [servings, setServings] = useState('1');
  const [intro, setIntro] = useState(false);
  useEffect(() => { void shouldPlayIntro().then(setIntro); }, []);
  const toMoodFood = () => (router.canGoBack() ? router.back() : router.replace('/home' as never));
  const today = indiaDate();
  const [settings, setSettings] = useState<MemberSettings | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string | null>>({});
  const [cookView, setCookView] = useState<CookView | null>(null);
  const [shareLanguage, setShareLanguage] = useState<CookLanguage>('en');
  const [shared, setShared] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, DayPeople>>({});
  const [missingWeek, setMissingWeek] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const households = await listKitchenCircleHouseholds();
      const first = households[0]?.household ?? null;
      setHousehold(first);
      if (households[0]) setRole(households[0].role);
      // Keep showing the week being edited (e.g. next week) when returning from the recipe picker.
      const weekStart = viewedWeek.current?.householdId === first?.id ? viewedWeek.current?.weekStart : undefined;
      const wanted = weekStart ?? mondayOfDate(indiaDate());
      let loaded: KitchenCirclePlan | null = null;
      try { loaded = first ? await getKitchenCirclePlan(first.id, wanted) : null; setMissingWeek(null); }
      catch (err) { if (err instanceof KitchenCircleError && err.status === 404) setMissingWeek(wanted); else throw err; }
      setPlan(loaded);
      if (first) {
        const mine = await getMemberSettings(first.id).catch(() => null);
        setSettings(mine);
        if (mine) setShareLanguage(mine.cookLanguage);
        if (households[0]?.role === 'cook') setCookView(await getCookWeek(first.id).catch(() => null));
      }
      if (loaded) setFeedback(Object.fromEntries((await getPlanFeedback(loaded.id).catch(() => [])).map((d) => [d.slotId, d.mine])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load KitchenCircle');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (plan) viewedWeek.current = { householdId: plan.householdId, weekStart: plan.weekStart }; }, [plan]);
  // Who's eating and what people think of each day (attendance incl. recurring absence, reactions).
  useEffect(() => { if (plan) void getPlanPeople(plan.id).then((days) => setPeople(Object.fromEntries(days.map((d) => [d.slotId, d])))).catch(() => undefined); }, [plan]);
  const showWeek = (which: 'this' | 'next') => {
    if (!household) return;
    const thisWeek = mondayOfDate(indiaDate());
    const target = which === 'this' ? thisWeek : (() => { const d = new Date(`${thisWeek}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); })();
    viewedWeek.current = { householdId: household.id, weekStart: target };
    void load();
  };

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const create = async () => {
    const count = Number(defaultServings);
    if (!householdName.trim() || !Number.isInteger(count) || count < 1 || count > 30) { setError('Enter a household name and 1–30 servings.'); return; }
    setSaving(true); setError(null);
    try {
      const created = await createKitchenCircleHousehold({ name: householdName.trim(), defaultServings: count });
      setHousehold(created.household); setPlan(created.plan);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create your KitchenCircle'); } finally { setSaving(false); }
  };

  const openEdit = (slot: KitchenCircleSlot) => { if (slot.state === 'locked') return; setEditing(slot); setMealTitle(slot.mealTitle ?? ''); setServings(String(slot.servings)); };
  const closeEdit = () => setEditing(null);
  const chooseRecipe = (slot: KitchenCircleSlot) => {
    if (!household) return;
    closeEdit();
    router.push({ pathname: '/kitchen-circle/recipes', params: { householdId: household.id, slotId: slot.id, slotLabel: slot.plannedFor } } as never);
  };
  const saveSlot = async (state: KitchenCircleSlot['state']) => {
    if (!editing) return;
    const count = Number(servings);
    if (!Number.isInteger(count) || count < 1 || count > 30) { setError('Servings must be between 1 and 30.'); return; }
    if (state === 'planned' && !mealTitle.trim()) { setError('Add a meal name before planning this day.'); return; }
    setSaving(true); setError(null);
    try {
      const slot = await updateKitchenCircleSlot(editing.id, { state, mealTitle: state === 'planned' ? mealTitle.trim() : null, servings: count });
      setPlan((current) => current ? { ...current, slots: current.slots.map((item) => item.id === slot.id ? slot : item) } : current);
      closeEdit();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update this day'); } finally { setSaving(false); }
  };
  const createNextWeek = async () => {
    if (!household) return;
    setSaving(true); setError(null);
    try { setPlan(await createKitchenCircleNextWeekPlan(household.id)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not create next week’s plan'); }
    finally { setSaving(false); }
  };
  const toggleLock = async (slot: KitchenCircleSlot) => {
    setSaving(true); setError(null);
    try {
      const updated = await setKitchenCircleSlotLock(slot.id, slot.state !== 'locked');
      setPlan((current) => current ? { ...current, slots: current.slots.map((item) => item.id === updated.id ? updated : item) } : current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the lock'); } finally { setSaving(false); }
  };

  /** Creates a revocable link for one day and opens the native share sheet (WhatsApp, SMS, copy). */
  const shareWithCook = async (slot: KitchenCircleSlot) => {
    if (!household || !plan) return;
    setSaving(true); setError(null); setShared(null);
    try {
      const { url } = await createCookLink(household.id, { planId: plan.id, slotId: slot.id, language: shareLanguage });
      // The link goes in exactly once: share targets join `text` and `url`, so a message that also contains the link
      // came out as "link text link" — pasted into a browser, that's not a page.
      const text = `${slot.mealTitle ?? 'Today’s meal'} for ${slot.servings} — here’s what to cook:`;
      try {
        const nav = (globalThis as { navigator?: { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } } }).navigator;
        if (Platform.OS === 'web') {
          // Only the link: some targets (Copy, Notes) paste `url` and `text` together, which breaks the link.
          if (nav?.share) { await nav.share({ title: `${text.replace(/:$/, '')}`, url }); setShared(url); }
          else if (nav?.clipboard) { await nav.clipboard.writeText(url); setShared(`Link copied: ${url}`); }
          else setShared(url);
        } else if (Platform.OS === 'ios') {
          await Share.share({ message: text, url });
          setShared(url);
        } else {
          await Share.share({ message: `${text} ${url}` });
          setShared(url);
        }
      } catch { setShared(url); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create a cook link'); }
    finally { setSaving(false); }
  };
  const refreshPeople = async () => { if (plan) setPeople(Object.fromEntries((await getPlanPeople(plan.id)).map((d) => [d.slotId, d]))); };
  const toggleEating = async (slot: KitchenCircleSlot) => {
    const mine = people[slot.id]?.mine;
    try { await setAttendance(slot.id, mine === 'absent' || mine === 'not_eating' ? 'attending' : 'absent'); await refreshPeople(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update that'); }
  };
  const react = async (slot: KitchenCircleSlot, reaction: 'looks_good' | 'not_for_me') => {
    try { await reactToDay(slot.id, reaction); await refreshPeople(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save that'); }
  };
  const giveFeedback = async (slot: KitchenCircleSlot, outcome: 'loved' | 'change' | 'skipped' | 'moved') => {
    setFeedback((current) => ({ ...current, [slot.id]: outcome }));
    try { await recordMealFeedback(slot.id, outcome); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save that'); }
  };
  const changeSetting = async (patch: Partial<MemberSettings>) => {
    if (!household || !settings) return;
    setSettings({ ...settings, ...patch });
    try { setSettings(await updateMemberSettings(household.id, patch)); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your settings'); }
  };
  // Cooks get the read-only cook week; planning controls are for owners and members.
  const canPlan = role !== 'cook';
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
  const chip = (label: string, bg: string, fg: string) => <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}><Text variant="micro12" color={fg} style={{ fontFamily: 'Figtree_700Bold' }}>{label}</Text></View>;
  const input = { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 16, padding: 14, backgroundColor: kc.raised } as const;

  // Bottom bar like the MoodFood home: four places to go, with the household chat raised in the middle.
  const go = (key: string) => {
    if (!household) return;
    const routes: Record<string, { pathname: string; params: Record<string, string> } | null> = {
      groceries: plan ? { pathname: '/kitchen-circle/groceries', params: { householdId: household.id, planId: plan.id, role } } : null,
      recipes: { pathname: '/kitchen-circle/recipes', params: { householdId: household.id, canEdit: String(canPlan) } },
      household: { pathname: '/kitchen-circle/household', params: { householdId: household.id } },
      rules: { pathname: '/kitchen-circle/preferences', params: { householdId: household.id, role } },
      chat: plan ? { pathname: '/kitchen-circle/chat', params: { householdId: household.id, planId: plan.id, weekStart: plan.weekStart } } : null,
    };
    const route = routes[key];
    if (route) router.push(route as never);
    else setError('Start this week’s plan first.');
  };
  const tabBar = household && canPlan ? <TabBar
    tabs={[{ key: 'groceries', label: 'Groceries', icon: 'shopping_bag' }, { key: 'recipes', label: 'Recipes', icon: 'auto_stories' },
      { key: 'household', label: 'Household', icon: 'groups' }, { key: 'rules', label: 'Food & rules', icon: 'tune' }]}
    active="" onTabPress={go} onCenterPress={() => go('chat')} centerIcon="chat" centerLabel="Ask Haldi" centerColor={kc.haldi} centerIconColor={kc.kadhai} /> : null;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen overlay={tabBar}>
    <ScrollView contentContainerStyle={{ paddingBottom: tabBar ? 150 : 48 }} keyboardShouldPersistTaps="handled">
      <ModeSwitch value="kitchencircle" onChange={toMoodFood} style={{ paddingHorizontal: space.gutter, paddingTop: 18 }} />
      <View style={{ paddingHorizontal: space.page, paddingTop: 22, gap: 14 }}>
        <KcWordmark size={28} />
        <Text variant="display36" accessibilityRole="header">What are we making?</Text>
      </View>
      {loading ? <KcLoader label="Getting the week ready" /> : error && !editing ? <ErrorBlock message={error} onRetry={load} /> : !household ? <Surface radius={24} style={{ margin: space.gutter, padding: 22, gap: 14 }}>
        <Text variant="display26">Start your KitchenCircle</Text><Text variant="body14" tone="ink2">Set up a solo household now. You can invite family, roommates, or a cook later.</Text>
        <TextInput value={householdName} onChangeText={setHouseholdName} placeholder="Household name" placeholderTextColor={colors.ink2} style={input} />
        <TextInput value={defaultServings} onChangeText={setDefaultServings} keyboardType="number-pad" placeholder="Default servings" placeholderTextColor={colors.ink2} style={input} />
        <Button label="Create KitchenCircle" block loading={saving} onPress={() => void create()} />
      </Surface> : !canPlan ? <View style={{ padding: space.gutter, gap: 12 }}>
        {cookView ? <CookViewPanel view={cookView}
          speak={(date, part, index) => speakFromCookWeek(household.id, { date, part, index, language: cookView.language })}
          onLanguage={(language) => { void changeSetting({ cookLanguage: language }); void getCookWeek(household.id, { language, transliterate: cookView.transliterate }).then(setCookView); }}
          onTransliterate={(transliterate) => { void changeSetting({ cookTransliterate: transliterate }); void getCookWeek(household.id, { language: cookView.language, transliterate }).then(setCookView); }} />
          : <KcLoader label="Getting the cooking week" />}
      </View> : <View style={{ padding: space.gutter, gap: 12 }}>
        <Surface radius={24} style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View><Text variant="label" tone="ink2">{household.name.toUpperCase()}</Text><Text variant="display26" style={{ marginTop: 4 }}>{(plan?.weekStart ?? missingWeek) === mondayOfDate(today) ? 'This week' : 'Next week'}</Text></View>
            {plan ? <Text variant="caption13" tone="ink2">{plan.startsOn.slice(5)} – {plan.weekEnd.slice(5)}</Text> : null}
          </View>
          <SegmentedControl options={[{ value: 'this', label: 'This week' }, { value: 'next', label: 'Next week' }]}
            value={(plan?.weekStart ?? missingWeek) === mondayOfDate(today) ? 'this' : 'next'} onChange={(w) => showWeek(w as 'this' | 'next')} />
          {!plan && missingWeek ? <View style={{ gap: 8 }}>
            <Text variant="body14" tone="ink2">Next week hasn’t been started yet.</Text>
            {canPlan ? <Button label="Start next week" iconLeft="calendar_today" block loading={saving} onPress={() => void createNextWeek()} /> : null}
          </View> : null}
          {plan ? <DayRings days={plan.slots} today={today} onPress={(day) => { const slot = plan.slots.find((s) => s.id === day.id); if (slot) openEdit(slot); }} /> : null}
          {!canPlan ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label="Recipes" size="md" variant="outline" iconLeft="auto_stories" onPress={() => go('recipes')} />
            <Button label="Household" size="md" variant="outline" iconLeft="groups" onPress={() => go('household')} />
            <Button label="Food & rules" size="md" variant="outline" iconLeft="tune" onPress={() => go('rules')} />
          </View> : null}
          {plan && canPlan && plan.slots.some((slot) => slot.state === 'blank') ? <Button label="Plan my week" iconLeft="auto_awesome" block onPress={() => router.push({ pathname: '/kitchen-circle/autofill', params: { planId: plan.id } } as never)} /> : null}
        </Surface>
        {plan?.slots.map((slot) => {
          const isToday = slot.plannedFor === today;
          return <Surface key={slot.id} radius={20} style={{ padding: 18, gap: 8 }}>
            <Pressable onPress={() => openEdit(slot)} accessibilityRole="button" accessibilityLabel={`Edit ${weekday(slot.plannedFor)}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text variant="labelSmall" tone="ink2" style={{ letterSpacing: 1.4 }}>{weekday(slot.plannedFor).toUpperCase()}{isToday ? ' · TODAY' : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {slot.state === 'locked' ? chip('Locked', kc.haldiTint, kc.haldiDeep) : null}
                  {slot.recipe ? chip(`${slot.recipe.source === 'catalog' ? 'Catalog' : slot.recipe.source === 'household' ? 'Household' : 'AI draft'} · v${slot.recipe.version}`, kc.leafTint, kc.curryLeafDeep) : null}
                </View>
              </View>
              <Text variant="display26" style={{ fontSize: 24, lineHeight: 26 }} color={slot.mealTitle ? kc.kadhai : kc.mutedInk}>{slot.mealTitle ?? stateLabel[slot.state]}</Text>
              <Text variant="caption13" tone="ink2">Serves {slot.servings}{slot.state !== 'planned' && slot.state !== 'locked' && slot.state !== 'blank' ? ` · ${stateLabel[slot.state]}` : ''}</Text>
              {people[slot.id] && slot.state !== 'household_out' ? <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text variant="caption13" tone="ink2">{people[slot.id].eating} of {people[slot.id].people} eating</Text>
                {slot.plannedFor >= today ? <Pressable onPress={() => void toggleEating(slot)} accessibilityRole="switch" accessibilityState={{ checked: people[slot.id].mine === 'attending' }}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, borderColor: people[slot.id].mine === 'attending' ? kc.curryLeaf : kc.dashed }}>
                  <Text variant="micro12" color={people[slot.id].mine === 'attending' ? kc.curryLeaf : kc.mutedInk} style={{ fontFamily: 'Figtree_700Bold' }}>{people[slot.id].mine === 'attending' ? 'I’m eating' : 'I’m out'}</Text>
                </Pressable> : null}
              </View> : null}
            </Pressable>
            {slot.plannedFor > today && slot.mealTitle && (slot.state === 'planned' || slot.state === 'locked') && people[slot.id] ? <View style={{ flexDirection: 'row', gap: 6 }}>
              {([['looks_good', 'Looks good', people[slot.id].reactions.looksGood], ['not_for_me', 'Not for me', people[slot.id].reactions.notForMe]] as const).map(([value, label, count]) => {
                const on = people[slot.id].reactions.mine === value;
                return <Pressable key={value} onPress={() => void react(slot, value)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? (value === 'looks_good' ? kc.curryLeaf : kc.kadhai) : kc.sand }}>
                  <Text variant="caption13" color={on ? kc.chawal : kc.kadhai} style={{ fontFamily: 'Figtree_700Bold' }}>{label}{count ? ` · ${count}` : ''}</Text>
                </Pressable>;
              })}
            </View> : null}
            {slot.plannedFor <= today && (slot.state === 'planned' || slot.state === 'locked') && slot.mealTitle ? <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: kc.steel, paddingTop: 10 }}>
              <Text variant="caption13" tone="ink2">{feedback[slot.id] ? 'Thanks — that helps next week’s plan.' : `How did ${slot.plannedFor === today ? 'today' : weekday(slot.plannedFor)} go?`}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([['loved', 'Loved it'], ['change', 'Change something'], ['skipped', 'Skipped'], ['moved', 'Moved it']] as const).map(([value, label]) => {
                  const on = feedback[slot.id] === value;
                  return <Pressable key={value} onPress={() => void giveFeedback(slot, value)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? kc.curryLeaf : kc.leafTint }}>
                    <Text variant="caption13" color={on ? kc.chawal : kc.curryLeafDeep} style={{ fontFamily: 'Figtree_700Bold' }}>{label}</Text>
                  </Pressable>;
                })}
              </View>
            </View> : null}
            <Pressable onPress={() => void toggleLock(slot)} disabled={saving} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}><Text variant="caption13" tone="accText" style={{ fontFamily: 'Figtree_700Bold' }}>{slot.state === 'locked' ? 'Unlock this day' : 'Lock this day'}</Text></Pressable>
          </Surface>;
        })}
        {settings ? <Surface radius={20} style={{ padding: 18, gap: 12 }}>
          <Text variant="label" tone="ink2">YOUR NOTIFICATIONS</Text>
          <Text variant="caption13" tone="ink2">Push notifications on this phone, just for you.</Text>
          <Toggle label="Someone else changes this week's meals" value={settings.notifyChanges} onChange={(v) => void changeSetting({ notifyChanges: v })} />
          <Toggle label="Saturday nudge to plan next week" value={settings.notifyWeekend} onChange={(v) => void changeSetting({ notifyWeekend: v })} />
          <Toggle label="Morning reminder of what's cooking today" value={settings.notifyTodayMeal} onChange={(v) => void changeSetting({ notifyTodayMeal: v })} />
        </Surface> : null}
      </View>}
      {/* Tapping a day opens it as a sheet over the week, instead of a panel at the bottom of the page. */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={closeEdit}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(28,38,32,0.35)' }} onPress={closeEdit} accessibilityLabel="Close day" />
      {editing ? <View style={{ maxHeight: '88%', backgroundColor: kc.chawal, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
      <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: 10 }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="display26" style={{ fontSize: 22, flex: 1 }}>{weekday(editing.plannedFor)}</Text>
        <Pressable onPress={closeEdit} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text variant="bodyStrong15" tone="ink2">Close</Text></Pressable>
      </View><TextInput value={mealTitle} onChangeText={setMealTitle} placeholder="What are we making?" placeholderTextColor={colors.ink2} style={input} /><TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" placeholder="Servings" placeholderTextColor={colors.ink2} style={input} />{error ? <Text variant="caption13" color={kc.mirchi}>{error}</Text> : null}<Button label="Choose a recipe" iconLeft="auto_stories" block onPress={() => chooseRecipe(editing)} />{editing.mealTitle ? <View style={{ gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {COOK_LANGUAGES.map((l) => <Pressable key={l.code} onPress={() => setShareLanguage(l.code)} accessibilityRole="button" accessibilityState={{ selected: shareLanguage === l.code }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: shareLanguage === l.code ? kc.haldi : kc.sand }}>
              <Text variant="caption13" color={kc.kadhai} style={{ fontFamily: 'Figtree_700Bold' }}>{l.label}</Text>
            </Pressable>)}
          </ScrollView>
          {household && canPlan ? <Button label="Send to our cook now" iconLeft="notifications" block loading={saving} onPress={() => void (async () => {
            setSaving(true); setShared(null);
            try { const r = await sendCookMenu(household.id, editing.plannedFor); setShared(`Sent to ${r.cook}: ${r.title}`); }
            catch (err) { setError(err instanceof Error ? err.message : 'Could not send it to the cook'); }
            finally { setSaving(false); }
          })()} /> : null}
          <Button label="Share a link instead" iconLeft="share" variant="outline" block loading={saving} onPress={() => void shareWithCook(editing)} />
          {shared ? <Text variant="caption13" tone="ink2" selectable>{shared.startsWith('Link copied') || shared.startsWith('Sent to') ? shared : `Shared: ${shared}`}</Text> : null}
        </View> : null}{editing.recipeVersionId ? <Text variant="caption13" tone="ink2">Changing the meal name below removes the linked recipe.</Text> : null}<Button label="Save meal" variant="outline" block loading={saving} onPress={() => void saveSlot('planned')} />{editing.recipeVersionId && plan && household ? <Button label="Groceries for this day" variant="outline" iconLeft="shopping_bag" block onPress={() => { const day = editing.plannedFor; closeEdit(); router.push({ pathname: '/kitchen-circle/groceries', params: { householdId: household.id, planId: plan.id, date: day, role } } as never); }} /> : null}<View style={{ flexDirection: 'row', gap: 8 }}><Button label="Leftovers" variant="outline" style={{ flex: 1 }} onPress={() => void saveSlot('leftovers')} /><Button label="Eating out" variant="outline" style={{ flex: 1 }} onPress={() => void saveSlot('household_out')} /></View><Button label="Cancel" variant="ghost" block onPress={closeEdit} /></ScrollView></View> : null}
      </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    {intro ? <KcIntro onDone={() => setIntro(false)} /> : null}
  </Screen></View>;
}
