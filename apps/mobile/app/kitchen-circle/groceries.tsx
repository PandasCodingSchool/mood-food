import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Chip, FilterChip, Icon, Screen, SegmentedControl, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  addGroceryLine, createGroceryList, discardGroceryList, finalizeGroceryList, getGroceryList, getKitchenCirclePantry, KitchenCircleError, listGroceryLists, RECIPE_UNITS,
  setKitchenCirclePantryItem, updateGroceryLine, updateGroceryList, type GroceryLine, type GroceryList, type Pantry,
} from '../../src/features/kitchen-circle/api';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const kindLabel: Record<GroceryLine['kind'], string> = { recipe: 'Recipe', pantry: 'Pantry', optional: 'Optional', manual: 'Added' };
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const amount = (line: GroceryLine) => line.quantity == null ? 'as needed' : `${line.quantity} ${line.unit === 'piece' && line.quantity !== 1 ? 'pieces' : line.unit ?? ''}`.trim();

/** Groups lines into the shopping sections the household acts on. */
function sections(list: GroceryList) {
  const split = list.snapshot.freshnessMode === 'split';
  const buying = list.lines.filter((line) => line.status === 'buy');
  return [
    { title: split ? 'Buy now' : 'Buy', lines: buying.filter((line) => line.kind !== 'manual' && (!split || line.freshnessGroup === 'buy_now')) },
    { title: 'Buy later in the week', hint: 'Perishables needed 3+ days from now stay fresher if bought later.', lines: split ? buying.filter((line) => line.kind !== 'manual' && line.freshnessGroup === 'buy_later') : [] },
    { title: 'Added by you', lines: buying.filter((line) => line.kind === 'manual') },
    { title: 'Already have', hint: 'Pantry staples are left out of the order but still used by recipes.', lines: list.lines.filter((line) => line.status === 'already_have') },
    { title: 'Skipped', lines: list.lines.filter((line) => line.status === 'skipped') },
  ].filter((section) => section.lines.length);
}

export default function KitchenCircleGroceriesScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId, planId, date, role } = useLocalSearchParams<{ householdId: string; planId: string; date?: string; role?: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const editable = role !== 'cook';
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');
  const [price, setPrice] = useState('');
  const [budget, setBudget] = useState('');
  const [newItem, setNewItem] = useState('');
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [pantryItem, setPantryItem] = useState('');

  const show = (next: GroceryList) => { setList(next); setBudget(next.snapshot.budgetPaise == null ? '' : String(next.snapshot.budgetPaise / 100)); };

  const load = useCallback(async () => {
    if (!householdId || !planId) return;
    setLoading(true); setError(null);
    try {
      const lists = await listGroceryLists(householdId, planId);
      // A single-day view only reuses a list that covers that day.
      const current = lists.find((item) => item.status !== 'discarded' && (!date || item.days.includes(date)));
      if (current) show(await getGroceryList(current.id)); else setList(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the grocery list'); }
    finally { setLoading(false); }
  }, [householdId, planId, date]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true); setNotice(null);
    try { await action(); }
    catch (err) {
      if (err instanceof KitchenCircleError && err.status === 409 && Array.isArray(err.details.conflicts)) {
        setConflict((err.details.conflicts as Array<{ plannedFor: string }>).map((item) => item.plannedFor));
      } else if (err instanceof KitchenCircleError && Array.isArray(err.details.excluded)) {
        setNotice(`${err.message} ${(err.details.excluded as Array<{ plannedFor: string; reason: string }>).map((item) => `${item.plannedFor}: ${item.reason}`).join(' ')}`);
      } else setNotice(err instanceof Error ? err.message : fallback);
    } finally { setBusy(false); }
  };

  const build = (override = false) => run(async () => {
    const created = await createGroceryList(householdId, { planId, scope: date ? 'day' : 'week', date, override });
    setConflict(null); show(created);
    const skipped = created.excluded?.filter((item) => item.reason !== 'No meal planned.') ?? [];
    if (skipped.length) setNotice(`Not included — ${skipped.map((item) => `${item.plannedFor}: ${item.reason}`).join(' ')}`);
  }, 'Could not build the grocery list');

  const patchLine = (line: GroceryLine, input: Parameters<typeof updateGroceryLine>[2]) => run(async () => {
    if (!list) return;
    const result = await updateGroceryLine(list.snapshot.id, line.id, input);
    show(await getGroceryList(list.snapshot.id));
    if (result.warning) setNotice(`Heads up: ${result.warning}`);
  }, 'Could not update this item');

  const openLine = (line: GroceryLine) => {
    if (open === line.id) { setOpen(null); return; }
    setOpen(line.id); setQuantity(line.quantity == null ? '' : String(line.quantity)); setUnit(line.unit ?? 'g');
    setPrice(line.estimatedPricePaise == null ? '' : String(line.estimatedPricePaise / 100));
  };

  const saveAmount = (line: GroceryLine) => {
    const next = Number(quantity);
    if (!(next > 0)) { setNotice('Quantity must be greater than zero.'); return; }
    const priceValue = price.trim() ? Math.round(Number(price) * 100) : null;
    if (priceValue !== null && !(priceValue >= 0)) { setNotice('Enter the price in rupees.'); return; }
    void patchLine(line, { quantity: next, unit, estimatedPricePaise: priceValue });
  };

  const saveBudget = () => run(async () => {
    if (!list) return;
    const value = budget.trim() ? Math.round(Number(budget) * 100) : null;
    if (value !== null && !(value >= 0)) throw new Error('Enter a budget in rupees.');
    show(await updateGroceryList(list.snapshot.id, { budgetPaise: value }));
  }, 'Could not save the budget');

  const addItem = () => run(async () => {
    if (!list || !newItem.trim()) return;
    await addGroceryLine(list.snapshot.id, { name: newItem.trim() });
    setNewItem(''); show(await getGroceryList(list.snapshot.id));
  }, 'Could not add this item');

  const togglePantry = () => run(async () => { setPantry(pantry ? null : await getKitchenCirclePantry(householdId)); }, 'Could not load the pantry');
  const changePantry = (name: string, inPantry: boolean) => run(async () => {
    setPantry(await setKitchenCirclePantryItem(householdId, name, inPantry));
    if (inPantry) setPantryItem('');
  }, 'Could not update the pantry');

  const draft = list?.snapshot.status === 'draft';
  const input = { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 12, padding: 10 } as const;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} />
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
        <Text variant="label" tone="accText">{date ? `GROCERIES FOR ${date}` : 'KITCHENCIRCLE GROCERIES'}</Text>
        <Text variant="display36" style={{ marginTop: 6 }}>Grocery list</Text>
        <Text variant="body15" tone="ink2" style={{ marginTop: 8 }}>One combined list from your planned recipes, scaled to servings, with every item traced back to its day and recipe. Nothing is ordered from here.</Text>
      </View>
      {loading ? <KcLoader label="Loading groceries" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <View style={{ padding: space.gutter, gap: 12 }}>
        {notice ? <Surface radius={16} style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><Icon name="info" size={18} tone="accText" /><Text variant="caption13" style={{ flex: 1 }}>{notice}</Text></Surface> : null}

        {!list ? <Surface radius={24} style={{ padding: 20, gap: 12 }}>
          <Icon name="shopping_bag" size={28} tone="accText" />
          <Text variant="display26">{date ? 'Shop for this day' : 'Shop for the rest of the week'}</Text>
          <Text variant="body14" tone="ink2">We combine every day that has a grocery-ready recipe. Days with leftovers, eating out, or no recipe are left out.</Text>
          {conflict ? <View style={{ gap: 8 }}>
            <Text variant="caption13" tone="accText">{conflict.join(', ')} {conflict.length === 1 ? 'is' : 'are'} already on another grocery list. Building again could buy those meals twice.</Text>
            <Button label="Build anyway" variant="glass" block loading={busy} onPress={() => void build(true)} />
          </View> : editable ? <Button label="Build grocery list" block loading={busy} onPress={() => void build()} /> : <Text variant="caption13" tone="ink2">The household owner or a member can build the list.</Text>}
        </Surface> : <>
          <Surface radius={24} style={{ padding: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip label={list.snapshot.status === 'finalized' ? 'Finalized' : 'Draft'} size="sm" variant={list.snapshot.status === 'finalized' ? 'accent' : 'soft'} icon={list.snapshot.status === 'finalized' ? 'lock' : 'edit'} />
              <Chip label={`${list.totals.buy} to buy`} size="sm" variant="glass" />
              <Chip label={`Covers ${list.coverage.map((item) => item.plannedFor.slice(5)).join(', ')}`} size="sm" variant="glass" />
            </View>
            {list.planChanges.length ? <View style={{ gap: 4 }}>
              <Text variant="bodyStrong15">The plan changed after this list was made</Text>
              {list.planChanges.map((change) => <Text key={change.slotId} variant="caption13" tone="accText">• {change.plannedFor}: {change.reason}</Text>)}
              <Text variant="caption13" tone="ink2">This list stays as it was. {draft ? 'Discard it and build again to pick up the changes.' : 'Adjust the next shop instead.'}</Text>
            </View> : null}
            {list.totals.skippedRequired ? <Text variant="caption13" tone="accText">{list.totals.skippedRequired} required {list.totals.skippedRequired === 1 ? 'ingredient is' : 'ingredients are'} skipped — some recipes may not work.</Text> : null}
            <SegmentedControl options={[{ value: 'split', label: 'Buy fresh later' }, { value: 'all_now', label: 'Order all now' }]} value={list.snapshot.freshnessMode}
              onChange={(mode) => draft && editable ? void run(async () => show(await updateGroceryList(list.snapshot.id, { freshnessMode: mode })), 'Could not change this') : undefined} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput value={budget} onChangeText={setBudget} editable={draft && editable} keyboardType="decimal-pad" placeholder="Budget (₹, optional)" placeholderTextColor={colors.ink2} accessibilityLabel="Grocery budget in rupees" style={[input, { flex: 1 }]} />
              {draft && editable ? <Button label="Save" size="sm" variant="glass" onPress={() => void saveBudget()} /> : null}
            </View>
            <Text variant="caption13" tone={list.totals.overBudget ? 'accText' : 'ink2'}>
              {list.totals.estimatedTotalPaise ? `Estimated ${rupees(list.totals.estimatedTotalPaise)} from prices you entered` : 'Add prices to items to track the budget. Live prices arrive with Instamart.'}
              {list.totals.overBudget ? ' — over budget' : ''}
            </Text>
          </Surface>

          {sections(list).map((section) => <View key={section.title} style={{ gap: 8 }}>
            <Text variant="label" tone="ink2" style={{ marginTop: 6 }}>{section.title.toUpperCase()}</Text>
            {section.hint ? <Text variant="caption13" tone="ink2">{section.hint}</Text> : null}
            {section.lines.map((line) => <Surface key={line.id} radius={16} style={{ padding: 14, gap: 8 }}>
              <Pressable onPress={() => openLine(line)} accessibilityRole="button" accessibilityLabel={`${line.displayName}, ${amount(line)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong15" style={{ textTransform: 'capitalize' }}>{line.displayName}</Text>
                  <Text variant="caption13" tone="ink2" numberOfLines={1}>{line.sources.length ? `${line.sources[0].recipeTitle} · ${line.sources[0].plannedFor.slice(5)}${line.sources.length > 1 ? ` +${line.sources.length - 1} more` : ''}` : line.productNote ?? 'Added manually'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="bodyStrong15">{amount(line)}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Chip label={kindLabel[line.kind]} size="sm" variant="glass" />
                    {line.manuallyChanged ? <Chip label="Changed" size="sm" variant="soft" /> : null}
                  </View>
                </View>
              </Pressable>
              {line.unitConflict ? <Text variant="caption13" tone="accText">Also listed in other units that can’t be combined — check both entries.</Text> : null}
              {open === line.id ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
                {line.sources.map((source, index) => <Text key={`${source.slotId}-${index}`} variant="caption13" tone="ink2">• {source.plannedFor} · {source.recipeTitle}: {source.recipeQuantity} {source.recipeUnit} {source.ingredientName}{source.scale !== 1 ? ` × ${source.scale}` : ''}</Text>)}
                {line.manuallyChanged && line.originalQuantity != null ? <Text variant="caption13" tone="ink2">Originally {line.originalQuantity} {line.originalUnit}</Text> : null}
                {draft && editable ? <>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {line.status !== 'buy' ? <Button label="Buy" size="sm" variant="glass" onPress={() => void patchLine(line, { status: 'buy' })} /> : null}
                    {line.status !== 'already_have' ? <Button label="Have it" size="sm" variant="glass" onPress={() => void patchLine(line, { status: 'already_have' })} /> : null}
                    {line.status !== 'skipped' ? <Button label="Skip" size="sm" variant="glass" onPress={() => void patchLine(line, { status: 'skipped' })} /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={colors.ink2} accessibilityLabel={`${line.displayName} quantity`} style={[input, { flex: 1 }]} />
                    <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Price ₹" placeholderTextColor={colors.ink2} accessibilityLabel={`${line.displayName} price in rupees`} style={[input, { flex: 1 }]} />
                    <Button label="Update" size="sm" loading={busy} onPress={() => saveAmount(line)} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {RECIPE_UNITS.map((item) => <FilterChip key={item} label={item} selected={unit === item} onPress={() => setUnit(item)} />)}
                  </ScrollView>
                </> : null}
              </View> : null}
            </Surface>)}
          </View>)}

          {editable ? <Button label="Build Instamart cart" iconLeft="storefront" variant="glass" block
            onPress={() => router.push({ pathname: '/kitchen-circle/cart', params: { listId: list.snapshot.id, householdId } } as never)} /> : null}

          {draft && editable ? <Surface radius={18} style={{ padding: 14, gap: 8 }}>
            <Text variant="bodyStrong15">Add something else</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={newItem} onChangeText={setNewItem} placeholder="e.g. bread, detergent" placeholderTextColor={colors.ink2} accessibilityLabel="New grocery item" style={[input, { flex: 1 }]} onSubmitEditing={() => void addItem()} />
              <Button label="Add" size="sm" variant="glass" iconLeft="add" onPress={() => void addItem()} />
            </View>
          </Surface> : null}

          {draft && editable ? <View style={{ gap: 8 }}>
            {role === 'owner' ? <Button label="Finalize list" iconLeft="lock" block loading={busy} onPress={() => void run(async () => show(await finalizeGroceryList(list.snapshot.id)), 'Could not finalize')} /> : null}
            <Button label="Discard and start over" variant="glass" block loading={busy} onPress={() => void run(async () => { await discardGroceryList(list.snapshot.id); setList(null); setConflict(null); }, 'Could not discard')} />
          </View> : list.snapshot.status === 'finalized' ? <Text variant="caption13" tone="ink2">Finalized lists can’t change, so a later plan edit never alters what was bought.</Text> : null}
        </>}

        <Pressable onPress={() => void togglePantry()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Icon name="kitchen" size={18} tone="accText" /><Text variant="button13" tone="accText">{pantry ? 'Hide pantry staples' : 'Pantry staples'}</Text>
        </Pressable>
        {pantry ? <Surface radius={18} style={{ padding: 14, gap: 10 }}>
          <Text variant="caption13" tone="ink2">These are assumed to be at home and left out of new lists. Remove anything you need to buy.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {pantry.items.map((item) => <Pressable key={item} onPress={() => editable ? void changePantry(item, false) : undefined} accessibilityRole="button" accessibilityLabel={`Remove ${item} from pantry`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text variant="caption13">{item}</Text>{editable ? <Icon name="close" size={12} tone="ink2" /> : null}
            </Pressable>)}
          </View>
          {editable ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={pantryItem} onChangeText={setPantryItem} placeholder="Add a staple, e.g. ghee" placeholderTextColor={colors.ink2} accessibilityLabel="New pantry staple" style={[input, { flex: 1 }]} />
            <Button label="Add" size="sm" variant="glass" onPress={() => pantryItem.trim() ? void changePantry(pantryItem.trim(), true) : undefined} />
          </View> : null}
        </Surface> : null}
      </View>}
    </ScrollView></Screen></View>;
}
