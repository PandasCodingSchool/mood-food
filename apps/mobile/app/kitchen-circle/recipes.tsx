import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Chip, FilterChip, Icon, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  approveKitchenCircleRecipeVersion, browseKitchenCircleRecipes, generateKitchenCircleRecipe, getDishImpact, getKitchenCircleRecipe, KitchenCircleError, recipeSourceLabel, selectKitchenCircleRecipe,
  type DishImpact, type RecipeDetail, type RecipeSource, type RecipeSummary,
} from '../../src/features/kitchen-circle/api';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const filters: Array<{ label: string; source?: RecipeSource }> = [
  { label: 'All' }, { label: 'Catalog', source: 'catalog' }, { label: 'Household', source: 'household' }, { label: 'AI drafts', source: 'ai_draft' },
];

const minutes = (prep: number | null, cook: number | null) => (prep ?? 0) + (cook ?? 0);

/** Browse catalog + private household recipes; with `slotId`, picking a recipe binds its version to that day. */
export default function KitchenCircleRecipesScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId, slotId, slotLabel, canEdit, openRecipeId } = useLocalSearchParams<{ householdId: string; slotId?: string; slotLabel?: string; canEdit?: string; openRecipeId?: string }>();
  // Deep links and web refreshes have no history; fall back to the parent screen.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const editable = canEdit !== 'false';
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<RecipeSource | undefined>();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RecipeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; issues: string[] } | null>(null);
  const [dish, setDish] = useState('');
  const [writing, setWriting] = useState(false);
  const [aiNote, setAiNote] = useState<{ warnings: string[]; alreadyHave: string | null } | null>(null);
  const [impact, setImpact] = useState<{ versionId: string; data: DishImpact | null; error?: string } | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true); setError(null);
    try { setRecipes(await browseKitchenCircleRecipes(householdId, { q: query, source })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load recipes'); }
    finally { setLoading(false); }
  }, [householdId, query, source]);

  // Debounce typing so search does not fire a request per keystroke.
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  useFocusEffect(useCallback(() => { setOpen(null); void load(); }, [load]));

  // Opened from a chat card: show that recipe straight away.
  useEffect(() => {
    if (!openRecipeId || !householdId) return;
    getKitchenCircleRecipe(householdId, openRecipeId).then((detail) => { setQuery(detail.title); setOpen(detail); }).catch(() => undefined);
  }, [householdId, openRecipeId]);

  const fail = (err: unknown, fallback: string) => setActionError(err instanceof KitchenCircleError ? { message: err.message, issues: err.issues } : { message: err instanceof Error ? err.message : fallback, issues: [] });

  const toggle = async (recipe: RecipeSummary) => {
    if (open?.id === recipe.id) { setOpen(null); return; }
    setBusy(true); setActionError(null);
    try { setOpen(await getKitchenCircleRecipe(householdId, recipe.id)); }
    catch (err) { fail(err, 'Could not open this recipe'); }
    finally { setBusy(false); }
  };

  const choose = async (versionId: string) => {
    if (!slotId) return;
    setBusy(true); setActionError(null);
    try { await selectKitchenCircleRecipe(slotId, versionId); leave(); }
    catch (err) { fail(err, 'Could not add this recipe to the day'); }
    finally { setBusy(false); }
  };

  const approve = async (versionId: string) => {
    if (!open) return;
    setBusy(true); setActionError(null);
    try {
      await approveKitchenCircleRecipeVersion(householdId, versionId);
      setOpen(await getKitchenCircleRecipe(householdId, open.id));
      void load();
    } catch (err) { fail(err, 'Could not approve this recipe'); }
    finally { setBusy(false); }
  };

  const write = async () => {
    const name = dish.trim();
    if (name.length < 2) return;
    setWriting(true); setActionError(null); setAiNote(null);
    try {
      const made = await generateKitchenCircleRecipe(householdId, { dish: name });
      setSource(undefined); setQuery(made.recipe.title);
      setAiNote({ warnings: made.warnings, alreadyHave: made.alreadyHave?.title ?? null });
      setOpen(await getKitchenCircleRecipe(householdId, made.recipe.id));
      setDish('');
    } catch (err) { fail(err, 'Could not write that recipe'); }
    finally { setWriting(false); }
  };

  // Approving an AI draft for a day: approve, then plan it in one go.
  const approveAndUse = async (versionId: string) => {
    setBusy(true); setActionError(null);
    try { await approveKitchenCircleRecipeVersion(householdId, versionId); await selectKitchenCircleRecipe(slotId!, versionId); leave(); }
    catch (err) { fail(err, 'Could not approve and plan this recipe'); }
    finally { setBusy(false); }
  };

  const usable = open?.versions.find((version) => version.groceryReady);
  const pending = open?.versions[0] && !open.versions[0].approvedAt ? open.versions[0] : null;
  const shown = pending ?? usable ?? open?.versions[0];
  const impactVersion = slotId ? (pending && !pending.structureIssues.length ? pending : usable) : undefined;

  // Picking for a day: show what this dish does to safety and the week's groceries before it's chosen.
  useEffect(() => {
    if (!slotId || !impactVersion) { setImpact(null); return; }
    let live = true;
    setImpact({ versionId: impactVersion.id, data: null });
    getDishImpact(slotId, impactVersion.id)
      .then((data) => { if (live) setImpact({ versionId: impactVersion.id, data }); })
      .catch((err) => { if (live) setImpact({ versionId: impactVersion.id, data: null, error: err instanceof Error ? err.message : 'Could not check this dish' }); });
    return () => { live = false; };
  }, [slotId, impactVersion?.id]);

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} />
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
        <Text variant="label" tone="accText">{slotId ? `CHOOSE FOR ${String(slotLabel ?? '').toUpperCase()}` : 'KITCHENCIRCLE RECIPES'}</Text>
        <Text variant="display36" style={{ marginTop: 6 }}>Recipes</Text>
        <Text variant="body15" tone="ink2" style={{ marginTop: 8 }}>Only reviewed recipes with measured ingredients can go on the plan. Household recipes stay private to your household.</Text>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12 }}>
          <Icon name="search" size={18} tone="ink2" />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search recipes" placeholderTextColor={colors.ink2} accessibilityLabel="Search recipes" style={{ flex: 1, color: colors.ink, paddingVertical: 12 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {filters.map((filter) => <FilterChip key={filter.label} label={filter.label} selected={source === filter.source} onPress={() => setSource(filter.source)} />)}
        </ScrollView>
        {editable ? <Surface radius={16} style={{ padding: 14, gap: 10 }}>
          <Text variant="bodyStrong15">Not in the catalog? Let AI write it</Text>
          <Text variant="caption13" tone="ink2">It writes measured ingredients and steps, checks them against your household's allergies and diets, and saves a draft for you to review.</Text>
          {writing ? <KcLoader size={72} label={`Writing ${dish.trim() || 'the recipe'} and checking it against your household…`} /> : <>
          <TextInput value={dish} onChangeText={setDish} placeholder="e.g. Thalipeeth, Dal Dhokli" placeholderTextColor={colors.ink2} accessibilityLabel="Dish for AI to write"
            onSubmitEditing={() => void write()} returnKeyType="go" editable={!writing}
            style={{ borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Write with AI" iconLeft="auto_awesome" style={{ flex: 1 }} loading={writing} disabled={dish.trim().length < 2} onPress={() => void write()} />
            <Button label="Write myself" variant="glass" iconLeft="add" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/kitchen-circle/recipe-editor', params: { householdId } } as never)} />
          </View></>}
          {!open && actionError ? <Text variant="caption13" tone="accText">{actionError.message}</Text> : null}
        </Surface> : null}
      </View>
      {loading && !recipes.length ? <KcLoader label="Loading recipes" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <View style={{ padding: space.gutter, gap: 12 }}>
        {!recipes.length ? <Text variant="body14" tone="ink2">No recipes match. Try another search or create a household recipe.</Text> : null}
        {recipes.map((recipe) => <Surface key={recipe.id} radius={18} style={{ padding: 16, gap: 10 }}>
          <Pressable onPress={() => void toggle(recipe)} accessibilityRole="button" accessibilityLabel={`Open ${recipe.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={recipe.source === 'catalog' ? 'auto_stories' : recipe.source === 'ai_draft' ? 'auto_awesome' : 'kitchen'} size={18} tone="accText" /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong15">{recipe.title}</Text>
              <Text variant="caption13" tone="ink2">{[
                recipeSourceLabel[recipe.source],
                recipe.currentVersion ? `serves ${recipe.currentVersion.defaultServings}` : null,
                recipe.currentVersion && minutes(recipe.currentVersion.prepMinutes, recipe.currentVersion.cookMinutes) ? `${minutes(recipe.currentVersion.prepMinutes, recipe.currentVersion.cookMinutes)} min` : null,
              ].filter(Boolean).join(' · ')}</Text>
            </View>
            <Icon name={open?.id === recipe.id ? 'expand_less' : 'expand_more'} size={20} tone="ink2" />
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {recipe.private ? <Chip label="Private" size="sm" icon="lock" variant="glass" /> : null}
            {recipe.pendingReview ? <Chip label="Needs review" size="sm" variant="soft" /> : null}
            {recipe.currentVersion?.groceryReady ? <Chip label="Grocery-ready" size="sm" variant="soft" icon="check" /> : null}
            {recipe.currentVersion?.dietaryTags.slice(0, 2).map((tag) => <Chip key={tag} label={tag.replace(/_/g, ' ')} size="sm" variant="glass" />)}
          </View>
          {open?.id === recipe.id && shown ? <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
            {recipe.source === 'ai_draft' ? <Text variant="caption13" tone="accText">Written by AI — check the ingredients, quantities and steps before you approve it.</Text> : null}
            {aiNote && open.id === recipe.id ? <View style={{ gap: 4 }}>
              {aiNote.alreadyHave ? <Text variant="caption13" tone="ink2">Our catalog already has “{aiNote.alreadyHave}” — search for it if you'd rather use that.</Text> : null}
              {aiNote.warnings.map((w) => <Text key={w} variant="caption13" tone="accText">⚠ {w}</Text>)}
            </View> : null}
            <Text variant="caption13" tone="ink2">Version {shown.version}{shown.approvedAt ? '' : ' · not yet approved'} · serves {shown.defaultServings}{open.versions.length > 1 ? ` · ${open.versions.length} versions` : ''}</Text>
            <Text variant="bodyStrong15">Ingredients</Text>
            {shown.ingredients.map((ingredient, index) => <Text key={`${ingredient.name}-${index}`} variant="body14">• {ingredient.quantity} {ingredient.unit} {ingredient.name}{ingredient.optional ? ' (optional)' : ''}</Text>)}
            <Text variant="bodyStrong15">Method</Text>
            {shown.steps.map((step, index) => <Text key={index} variant="body14">{index + 1}. {step}</Text>)}
            {shown.allergens.length ? <Text variant="caption13" tone="ink2">Contains: {shown.allergens.join(', ')}</Text> : null}
            {shown.structureIssues.length ? <View style={{ gap: 4 }}>{shown.structureIssues.map((issue) => <Text key={issue} variant="caption13" tone="accText">• {issue}</Text>)}</View> : null}
            {actionError ? <View style={{ gap: 4 }}><Text variant="caption13" tone="accText">{actionError.message}</Text>{actionError.issues.map((issue) => <Text key={issue} variant="caption13" tone="accText">• {issue}</Text>)}</View> : null}
            {impact && impactVersion && impact.versionId === impactVersion.id ? <View style={{ gap: 4, padding: 10, borderRadius: 12, backgroundColor: colors.accSoft }}>
              <Text variant="bodyStrong15">If you plan this for {slotLabel ?? 'this day'}</Text>
              {!impact.data && !impact.error ? <KcLoader size={48} label="Checking ingredients and allergies…" /> : null}
              {impact.error ? <Text variant="caption13" tone="ink2">{impact.error}</Text> : null}
              {impact.data?.warnings.map((w) => <Text key={w} variant="caption13" tone="accText">⚠ {w}</Text>)}
              {impact.data?.summary.map((line) => <Text key={line} variant="caption13">• {line}</Text>)}
            </View> : null}
            {slotId && pending && !pending.structureIssues.length && editable ? <Button label={`Approve & use for ${slotLabel ?? 'this day'}`} block loading={busy} onPress={() => void approveAndUse(pending.id)} /> : null}
            {slotId && usable && !(pending && editable && !pending.structureIssues.length) ? <Button label={`Use for ${slotLabel ?? 'this day'}${usable.id !== shown.id ? ` (v${usable.version})` : ''}`} block loading={busy} onPress={() => void choose(usable.id)} /> : null}
            {editable && pending ? <Button label={pending.structureIssues.length ? 'Fix before approving' : 'Approve for our household'} variant={pending.structureIssues.length ? 'glass' : 'primary'} block loading={busy}
              onPress={() => pending.structureIssues.length ? router.push({ pathname: '/kitchen-circle/recipe-editor', params: { householdId, recipeId: open.id } } as never) : void approve(pending.id)} /> : null}
            {editable && open.private ? <Button label="Edit as new version" variant="glass" block onPress={() => router.push({ pathname: '/kitchen-circle/recipe-editor', params: { householdId, recipeId: open.id } } as never)} /> : null}
          </View> : null}
        </Surface>)}
      </View>}
    </ScrollView></Screen></View>;
}
