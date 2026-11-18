import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { FilterChip, Icon, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  createKitchenCircleRecipe, createKitchenCircleRecipeVersion, getKitchenCircleRecipe, KitchenCircleError, RECIPE_UNITS, recipeSourceLabel, type RecipeSource,
} from '../../src/features/kitchen-circle/api';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

interface IngredientRow { name: string; quantity: string; unit: string; optional: boolean }

const blankIngredient = (): IngredientRow => ({ name: '', quantity: '', unit: 'g', optional: false });
const optionalNumber = (value: string) => value.trim() ? Number(value) : undefined;

/** Creates a private household recipe, or (with `recipeId`) saves an edit as a new immutable version. */
export default function KitchenCircleRecipeEditorScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId, recipeId } = useLocalSearchParams<{ householdId: string; recipeId?: string }>();
  // Deep links and web refreshes have no history; fall back to the parent screen.
  const leave = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/kitchen-circle/recipes', params: { householdId } } as never));
  const [loading, setLoading] = useState(Boolean(recipeId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<RecipeSource>('household');
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('2');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([blankIngredient()]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [unitFor, setUnitFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    void (async () => {
      try {
        const recipe = await getKitchenCircleRecipe(householdId, recipeId);
        const latest = recipe.versions[0];
        setSource(recipe.source); setTitle(recipe.title);
        if (latest) {
          setBaseVersion(latest.version);
          setServings(String(latest.defaultServings));
          setPrep(latest.prepMinutes == null ? '' : String(latest.prepMinutes));
          setCook(latest.cookMinutes == null ? '' : String(latest.cookMinutes));
          setIngredients(latest.ingredients.map((item) => ({ name: item.name, quantity: String(item.quantity), unit: item.unit, optional: Boolean(item.optional) })));
          setSteps(latest.steps.length ? latest.steps : ['']);
        }
      } catch (err) { setLoadError(err instanceof Error ? err.message : 'Could not load this recipe'); }
      finally { setLoading(false); }
    })();
  }, [householdId, recipeId]);

  const updateIngredient = (index: number, patch: Partial<IngredientRow>) => setIngredients((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  /** Mirrors the server's structure rules so most mistakes are caught before a round trip. */
  const localIssues = () => {
    const issues: string[] = [];
    if (!recipeId && !title.trim()) issues.push('Give the recipe a name.');
    const count = Number(servings);
    if (!Number.isInteger(count) || count < 1 || count > 30) issues.push('Servings must be a whole number from 1 to 30.');
    const filled = ingredients.filter((row) => row.name.trim());
    if (!filled.length) issues.push('Add at least one ingredient.');
    for (const row of filled) if (!(Number(row.quantity) > 0)) issues.push(`“${row.name.trim()}” needs a quantity greater than zero.`);
    if (!steps.some((step) => step.trim())) issues.push('Add at least one method step.');
    for (const value of [prep, cook]) if (value.trim() && !(Number.isInteger(Number(value)) && Number(value) >= 0)) issues.push('Prep and cook time must be whole minutes.');
    return issues;
  };

  const save = async () => {
    const issues = localIssues();
    if (issues.length) { setError({ message: 'Almost there — fix these first.', issues }); return; }
    const body = {
      defaultServings: Number(servings),
      ingredients: ingredients.filter((row) => row.name.trim()).map((row) => ({ name: row.name.trim(), quantity: Number(row.quantity), unit: row.unit, ...(row.optional ? { optional: true } : {}) })),
      steps: steps.map((step) => step.trim()).filter(Boolean),
      prepMinutes: optionalNumber(prep),
      cookMinutes: optionalNumber(cook),
    };
    setSaving(true); setError(null);
    try {
      if (recipeId) await createKitchenCircleRecipeVersion(householdId, recipeId, body);
      else await createKitchenCircleRecipe(householdId, { title: title.trim(), ...body });
      leave();
    } catch (err) {
      setError(err instanceof KitchenCircleError ? { message: err.message, issues: err.issues } : { message: err instanceof Error ? err.message : 'Could not save this recipe', issues: [] });
    } finally { setSaving(false); }
  };

  const input = { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 14, padding: 14 } as const;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} />
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
        <Text variant="label" tone="accText">{recipeId ? `${recipeSourceLabel[source].toUpperCase()}${baseVersion ? ` · EDITING V${baseVersion}` : ''}` : 'NEW HOUSEHOLD RECIPE'}</Text>
        <Text variant="display36" style={{ marginTop: 6 }}>{recipeId ? title || 'Edit recipe' : 'Write it down'}</Text>
        <Text variant="body15" tone="ink2" style={{ marginTop: 8 }}>{recipeId
          ? source === 'ai_draft' ? 'Saving creates a new draft version. Approve it from the recipe list once it looks right.' : 'Saving creates a new version. Days already planned keep the version they were planned with.'
          : 'Private to your household. Measure every ingredient so it can be scaled into a grocery list.'}</Text>
      </View>
      {loading ? <KcLoader label="Loading recipe" /> : loadError ? <ErrorBlock message={loadError} onRetry={leave} /> : <View style={{ padding: space.gutter, gap: 12 }}>
        <Surface radius={20} style={{ padding: 16, gap: 10 }}>
          {!recipeId ? <TextInput value={title} onChangeText={setTitle} placeholder="Recipe name" placeholderTextColor={colors.ink2} accessibilityLabel="Recipe name" style={input} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" placeholder="Serves" placeholderTextColor={colors.ink2} accessibilityLabel="Default servings" style={[input, { flex: 1 }]} />
            <TextInput value={prep} onChangeText={setPrep} keyboardType="number-pad" placeholder="Prep min" placeholderTextColor={colors.ink2} accessibilityLabel="Prep minutes" style={[input, { flex: 1 }]} />
            <TextInput value={cook} onChangeText={setCook} keyboardType="number-pad" placeholder="Cook min" placeholderTextColor={colors.ink2} accessibilityLabel="Cook minutes" style={[input, { flex: 1 }]} />
          </View>
        </Surface>

        <Surface radius={20} style={{ padding: 16, gap: 10 }}>
          <Text variant="bodyStrong16">Ingredients</Text>
          {ingredients.map((row, index) => <View key={index} style={{ gap: 8, paddingBottom: 10, borderBottomWidth: index < ingredients.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput value={row.name} onChangeText={(name) => updateIngredient(index, { name })} placeholder="Ingredient" placeholderTextColor={colors.ink2} accessibilityLabel={`Ingredient ${index + 1} name`} style={[input, { flex: 2 }]} />
              <TextInput value={row.quantity} onChangeText={(quantity) => updateIngredient(index, { quantity })} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={colors.ink2} accessibilityLabel={`Ingredient ${index + 1} quantity`} style={[input, { flex: 1 }]} />
              <Pressable onPress={() => setUnitFor(unitFor === index ? null : index)} accessibilityRole="button" accessibilityLabel={`Ingredient ${index + 1} unit, ${row.unit}`} style={[input, { minWidth: 64, alignItems: 'center' }]}><Text variant="body14">{row.unit}</Text></Pressable>
              {ingredients.length > 1 ? <Pressable onPress={() => setIngredients((rows) => rows.filter((_, i) => i !== index))} accessibilityRole="button" accessibilityLabel={`Remove ingredient ${index + 1}`} hitSlop={8}><Icon name="close" size={18} tone="ink2" /></Pressable> : null}
            </View>
            {unitFor === index ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {RECIPE_UNITS.map((unit) => <FilterChip key={unit} label={unit} selected={row.unit === unit} onPress={() => { updateIngredient(index, { unit }); setUnitFor(null); }} />)}
            </View> : null}
            <Pressable onPress={() => updateIngredient(index, { optional: !row.optional })} accessibilityRole="checkbox" accessibilityState={{ checked: row.optional }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={row.optional ? 'check_circle' : 'add'} size={16} tone={row.optional ? 'accText' : 'ink2'} /><Text variant="caption13" tone="ink2">{row.optional ? 'Optional (garnish / to taste)' : 'Mark as optional'}</Text>
            </Pressable>
          </View>)}
          <Button label="Add ingredient" variant="glass" size="md" iconLeft="add" onPress={() => setIngredients((rows) => [...rows, blankIngredient()])} />
        </Surface>

        <Surface radius={20} style={{ padding: 16, gap: 10 }}>
          <Text variant="bodyStrong16">Method</Text>
          {steps.map((step, index) => <View key={index} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text variant="bodyStrong15" style={{ paddingTop: 14 }}>{index + 1}.</Text>
            <TextInput value={step} onChangeText={(value) => setSteps((rows) => rows.map((row, i) => i === index ? value : row))} placeholder="Describe this step" placeholderTextColor={colors.ink2} multiline accessibilityLabel={`Step ${index + 1}`} style={[input, { flex: 1, minHeight: 52 }]} />
            {steps.length > 1 ? <Pressable onPress={() => setSteps((rows) => rows.filter((_, i) => i !== index))} accessibilityRole="button" accessibilityLabel={`Remove step ${index + 1}`} hitSlop={8} style={{ paddingTop: 14 }}><Icon name="close" size={18} tone="ink2" /></Pressable> : null}
          </View>)}
          <Button label="Add step" variant="glass" size="md" iconLeft="add" onPress={() => setSteps((rows) => [...rows, ''])} />
        </Surface>

        {error ? <View style={{ gap: 4 }}><Text variant="caption13" tone="accText">{error.message}</Text>{error.issues.map((issue) => <Text key={issue} variant="caption13" tone="accText">• {issue}</Text>)}</View> : null}
        <Button label={recipeId ? 'Save new version' : 'Save recipe'} block loading={saving} onPress={() => void save()} />
      </View>}
    </ScrollView></Screen></View>;
}
