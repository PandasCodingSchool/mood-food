// 2.0 DIY recipe. Generates the recipe (same API as v1), then shows it:
// tick off what you already have, step through the method, then either get
// the ingredients on Instamart (/diy/cart) or go straight to cook mode.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Button, Checkbox, Chip, DishImage, IconButton, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { BottomBar, ErrorBlock, LoadingBlock } from '../../src/components/v2';
import { generateRecipe, type Recipe } from '../../src/services/diy';
import type { Recommendation } from '../../src/types';
import { imageCaption, recView } from '../../src/utils/recView';

export default function DiyRecipeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ rec: string; rank?: string }>();
  const rec = useMemo<Recommendation | null>(() => (params.rec ? JSON.parse(params.rec) : null), [params.rec]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [have, setHave] = useState<Set<number>>(new Set());
  const [step, setStep] = useState(0);

  const load = async () => {
    if (!rec) return;
    setError(null);
    setRecipe(null);
    const result = await generateRecipe(rec.dish.name, 2).catch((e) => ({ success: false, error: String(e?.message ?? e), recipe: undefined }));
    if (!result.success || !result.recipe) {
      setError(result.error || "Couldn't generate a recipe. Please try again.");
      return;
    }
    setRecipe(result.recipe);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rec) return null;
  const v = recView(rec);
  const recipeJson = recipe ? JSON.stringify(recipe) : '';
  const toggleHave = (i: number) =>
    setHave((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Screen edgeToEdge contentContainerStyle={{ paddingBottom: 140 }}>
        <DishImage uri={v.imageUrl} caption={`home-cooked · ${imageCaption(v)}`} height={280} scrim={0.55}>
          <View style={{ position: 'absolute', top: 56, left: 16 }}>
            <IconButton icon="arrow_back" label="Back" variant="photo" onPress={() => router.back()} />
          </View>
        </DishImage>
        <Surface kind="solid" radius={30} style={{ marginTop: -52, marginHorizontal: 12, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20, boxShadow: '0px -10px 40px -20px rgba(0,0,0,0.45)' }}>
          <Chip icon="skillet" label="Cook it yourself" />
          <Text variant="display28" style={{ marginTop: 12 }} accessibilityRole="header">{recipe?.dish || rec.dish.name}</Text>

          {error ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : !recipe ? (
            <LoadingBlock label="Writing your recipe" />
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
                {[
                  { v: String(recipe.servings), l: 'Serves' },
                  { v: String(recipe.items.length), l: 'Ingredients' },
                  { v: String(recipe.steps.length), l: 'Steps' },
                ].map((m) => (
                  <Surface key={m.l} kind="tint" radius={14} style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}>
                    <Text variant="bodyStrong14">{m.v}</Text>
                    <Text variant="micro11" tone="ink2" style={{ marginTop: 2 }}>{m.l}</Text>
                  </Surface>
                ))}
              </View>

              <View style={{ marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text variant="bodyStrong16">Ingredients</Text>
                <Text variant="caption12" tone="ink2">{`You have ${have.size} of ${recipe.items.length}`}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                {recipe.items.map((it, i) => {
                  const on = have.has(i);
                  return (
                    <Pressable
                      key={`${it.name}${i}`}
                      onPress={() => toggleHave(i)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line }}
                    >
                      <Checkbox checked={on} />
                      <Text variant="body14" style={{ flex: 1, fontFamily: 'Geist_500Medium', textDecorationLine: on ? 'line-through' : 'none', opacity: on ? 0.55 : 1 }}>
                        {it.name}
                      </Text>
                      <Text variant="caption13" tone="ink2">{[it.quantity, it.unit].filter(Boolean).join(' ')}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text variant="bodyStrong16" style={{ marginTop: 24 }}>Method</Text>
              <View style={{ marginTop: 10, gap: 8 }}>
                {recipe.steps.map((s, i) => {
                  const cur = i === step;
                  const done = i < step;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setStep(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Step ${i + 1}${done ? ', done' : cur ? ', current' : ''}`}
                      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 18, backgroundColor: cur ? colors.accSoft : colors.tint, borderWidth: 1.5, borderColor: cur ? colors.acc : 'transparent', opacity: done ? 0.6 : 1 }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: cur || done ? colors.acc : colors.solid }}>
                        <Text variant="button13" color={cur || done ? colors.onAcc : colors.ink2}>{done ? '✓' : String(i + 1)}</Text>
                      </View>
                      <Text variant="body14" style={{ flex: 1, fontSize: 14 }}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Surface>
      </Screen>
      {recipe ? (
        <BottomBar>
          <Button
            label="Get ingredients"
            variant="glass"
            style={{ height: 56, borderRadius: 18 }}
            onPress={() => router.push({ pathname: '/diy/cart', params: { recipe: recipeJson, rank: params.rank || '0' } })}
          />
          <Button
            label="Start cooking"
            iconRight="arrow_forward"
            style={{ flex: 1, height: 56, borderRadius: 18 }}
            onPress={() => router.push({ pathname: '/diy/cook', params: { recipe: recipeJson, sessionId: '' } })}
          />
        </BottomBar>
      ) : null}
    </View>
  );
}
