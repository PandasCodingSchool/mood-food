import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Chip, Icon, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  applyProposal, autofillPlan, discardProposal, getLatestProposal, recipeSourceLabel, swapProposalDay, type PlanProposal, type ProposalItem,
} from '../../src/features/kitchen-circle/api';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const dayLabel = (value: string) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Review an auto-fill proposal. Nothing reaches the plan until the household applies it. */
export default function KitchenCircleAutofillScreen() {
  const router = useRouter();
  const { dark } = useTheme();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** `keep` preserves the current selection for days still on offer (after a partial apply). */
  const show = (next: PlanProposal | null, keep = false) => {
    setProposal(next);
    const open = next?.items.filter((item) => item.status === 'proposed') ?? [];
    setSelected((current) => new Set(open.map((item) => item.id).filter((id) => !keep || current.has(id))));
    setServings(Object.fromEntries(open.map((item) => [item.id, item.servings])));
  };

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true); setError(null);
    try { show(await getLatestProposal(planId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load suggestions'); }
    finally { setLoading(false); }
  }, [planId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setNotice(null);
    try { await action(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setBusy(null); }
  };

  const suggest = (regenerate = false) => run(regenerate ? 'regenerate' : 'suggest', async () => show(await autofillPlan(planId, { regenerate })));

  const swap = (item: ProposalItem) => run(`swap-${item.id}`, async () => {
    if (!proposal) return;
    const next = await swapProposalDay(item.slotId, proposal.id);
    setProposal({ ...proposal, items: proposal.items.map((current) => current.id === next.id ? next : current) });
  });

  const apply = (all: boolean) => run(all ? 'apply-all' : 'apply', async () => {
    if (!proposal) return;
    const open = proposal.items.filter((item) => item.status === 'proposed');
    const ids = all ? open.map((item) => item.id) : open.filter((item) => selected.has(item.id)).map((item) => item.id);
    if (!ids.length) throw new Error('Choose at least one day to add.');
    const result = await applyProposal(planId, proposal.id, { itemIds: ids, servings: Object.fromEntries(ids.map((id) => [id, servings[id]])) });
    if (result.stale.length) {
      show(result.proposal.status === 'pending' ? result.proposal : null, true);
      setNotice(`Added ${result.applied.length} ${result.applied.length === 1 ? 'day' : 'days'}. Left alone: ${result.stale.map((s) => `${dayLabel(s.plannedFor)} — ${s.reason}`).join(' ')}`);
    } else if (result.proposal.status === 'pending') {
      show(result.proposal, true);
      setNotice(`Added ${result.applied.length} ${result.applied.length === 1 ? 'day' : 'days'} to the plan.`);
    } else leave();
  });

  const discard = () => run('discard', async () => { if (proposal) { await discardProposal(planId, proposal.id); show(null); } });

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const open = proposal?.items.filter((item) => item.status === 'proposed') ?? [];

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} />
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
        <Text variant="label" tone="accText">KITCHENCIRCLE AUTO-FILL</Text>
        <Text variant="display36" style={{ marginTop: 6 }}>Fill the open days</Text>
        <Text variant="body15" tone="ink2" style={{ marginTop: 8 }}>Suggestions respect everyone’s diets and allergies, your household rules, and who is home. Locked and planned days are never touched, and nothing changes until you add it.</Text>
      </View>
      {loading ? <KcLoader label="Loading suggestions" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <View style={{ padding: space.gutter, gap: 12 }}>
        {notice ? <Surface radius={16} style={{ padding: 14, flexDirection: 'row', gap: 10 }}><Icon name="info" size={18} tone="accText" /><Text variant="caption13" style={{ flex: 1 }}>{notice}</Text></Surface> : null}

        {!proposal ? <Surface radius={24} style={{ padding: 20, gap: 12 }}>
          <Icon name="auto_awesome" size={28} tone="accText" />
          <Text variant="display26">Suggest meals for this week</Text>
          <Text variant="body14" tone="ink2">We only fill blank days, using grocery-ready catalog and household recipes.</Text>
          {busy === 'suggest' ? <KcLoader size={72} label="Planning your week around everyone at the table…" /> : <Button label="Suggest meals" block onPress={() => void suggest()} />}
        </Surface> : <>
          {busy === 'regenerate' ? <KcLoader size={72} label="Finding different meals…" /> : null}
          <Surface radius={20} style={{ padding: 16, gap: 6 }}>
            <Text variant="bodyStrong16">{proposal.summary}</Text>
            {proposal.unfilled.map((day) => <Text key={day.slotId} variant="caption13" tone="accText">• {dayLabel(day.plannedFor)}: {day.reason}</Text>)}
            {proposal.ignoredRules.length ? <Text variant="caption13" tone="ink2">Not applied yet: {proposal.ignoredRules.join('; ')}</Text> : null}
          </Surface>

          {open.map((item) => {
            const isSelected = selected.has(item.id);
            const count = servings[item.id] ?? item.servings;
            return <Surface key={item.id} radius={18} style={{ padding: 16, gap: 10, opacity: isSelected ? 1 : 0.6 }}>
              <Pressable onPress={() => toggle(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} accessibilityLabel={`${dayLabel(item.plannedFor)}: ${item.title}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Icon name={isSelected ? 'check_circle' : 'add'} size={22} tone={isSelected ? 'accText' : 'ink2'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption13" tone="ink2">{dayLabel(item.plannedFor)}</Text>
                  <Text variant="bodyStrong15">{item.title}</Text>
                </View>
                <Chip label={recipeSourceLabel[item.source]} size="sm" variant="glass" />
              </Pressable>
              <View style={{ gap: 3 }}>{item.reasons.map((reason) => <Text key={reason} variant="caption13" tone="ink2">• {reason}</Text>)}</View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption13" tone="ink2">Serves</Text>
                <Pressable onPress={() => setServings((s) => ({ ...s, [item.id]: Math.max(1, count - 1) }))} accessibilityRole="button" accessibilityLabel="Fewer servings" hitSlop={8}><Icon name="remove" size={18} tone="accText" /></Pressable>
                <Text variant="bodyStrong15">{count}</Text>
                <Pressable onPress={() => setServings((s) => ({ ...s, [item.id]: Math.min(30, count + 1) }))} accessibilityRole="button" accessibilityLabel="More servings" hitSlop={8}><Icon name="add" size={18} tone="accText" /></Pressable>
                <View style={{ flex: 1 }} />
                <Button label="Swap" size="sm" variant="glass" iconLeft="refresh" loading={busy === `swap-${item.id}`} onPress={() => void swap(item)} />
              </View>
            </Surface>;
          })}

          {open.length ? <View style={{ gap: 8 }}>
            <Button label={`Add ${selected.size} selected ${selected.size === 1 ? 'day' : 'days'}`} block loading={busy === 'apply'} disabled={!selected.size} onPress={() => void apply(false)} />
            {selected.size !== open.length ? <Button label="Add all days" variant="glass" block loading={busy === 'apply-all'} onPress={() => void apply(true)} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Regenerate" variant="glass" iconLeft="refresh" style={{ flex: 1 }} loading={busy === 'regenerate'} onPress={() => void suggest(true)} />
              <Button label="Clear" variant="glass" iconLeft="close" style={{ flex: 1 }} loading={busy === 'discard'} onPress={() => void discard()} />
            </View>
            <Text variant="caption13" tone="ink2">Groceries are not ordered. Build the grocery list separately once the week looks right.</Text>
          </View> : null}
        </>}
      </View>}
    </ScrollView></Screen></View>;
}
