// 2.0 Pantry mode: tick what's in your kitchen; each of your top real picks
// can be checked against a generated recipe (same /recipe/generate as DIY)
// to see what's missing. Cook → DIY recipe; Get N → Instamart cart;
// "Rather order in" → matches. Logs the v1 'pantry' signal (cook vs order).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Button, DishImage, ProgressBar, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock } from '../../src/components/v2';
import { ChoiceChip, GameHeader, useGameRecs } from '../../src/components/v2/GameKit';
import { useLiveMood } from '../../src/context/LiveMood';
import { generateRecipe, type Recipe } from '../../src/services/diy';
import { logSignal } from '../../src/services/signals';
import type { Recommendation } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';
import { imageCaption, recView } from '../../src/utils/recView';

const PANTRY = ['Rice', 'Moong dal', 'Ghee', 'Tomatoes', 'Onion', 'Garlic', 'Paneer', 'Curd', 'Eggs', 'Chicken', 'Butter', 'Cream', 'Bread', 'Pasta', 'Potatoes', 'Black pepper'];
const ASSUMED = ['salt', 'water', 'oil', 'sugar'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
const singular = (s: string) => s.replace(/(es|s)$/, '');

function missingFor(recipe: Recipe, have: Set<string>): string[] {
  const owned = [...have].map((h) => singular(norm(h)));
  return recipe.items
    .map((i) => i.name)
    .filter((name) => {
      const n = norm(name);
      if (ASSUMED.some((a) => n.includes(a))) return false;
      return !owned.some((o) => o && (n.includes(o) || o.includes(singular(n))));
    });
}

type Check = { state: 'loading' } | { state: 'error' } | { state: 'ok'; recipe: Recipe };

export default function PantryScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { mood } = useLiveMood();
  const { recs, error, reload } = useGameRecs();
  const [have, setHave] = useState<Set<string>>(new Set(['Rice', 'Ghee', 'Tomatoes', 'Onion', 'Garlic']));
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const picks = (recs ?? []).slice(0, 4);

  const toggle = (t: string) =>
    setHave((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const check = async (rec: Recommendation) => {
    setChecks((c) => ({ ...c, [rec.id]: { state: 'loading' } }));
    const res = await generateRecipe(rec.dish.name, 2).catch(() => ({ success: false, recipe: undefined }));
    setChecks((c) => ({ ...c, [rec.id]: res.success && res.recipe ? { state: 'ok', recipe: res.recipe } : { state: 'error' } }));
  };

  const chose = (choice: 'cook' | 'order') => {
    void logSignal('pantry', { items: [...have].map(norm), chose: choice });
    trackEvent('game_completed', { game: 'pantry', chose: choice, items: [...have] });
  };

  const ready = picks.filter((r) => {
    const c = checks[r.id];
    return c?.state === 'ok' && missingFor(c.recipe, have).length <= 1;
  }).length;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <GameHeader title="Pantry mode" subtitle={`${have.size} in your kitchen`} onReset={() => setHave(new Set())} />
        <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
          <Text variant="display30" accessibilityRole="header">What's in your kitchen?</Text>
          <Text variant="body14" tone="ink2" style={{ marginTop: 8 }}>Tap what you've got. We'll check it against your mood picks.</Text>
        </View>
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PANTRY.map((t) => (
            <ChoiceChip key={t} label={t} on={have.has(t)} onPress={() => toggle(t)} />
          ))}
        </View>

        <View style={{ paddingHorizontal: space.page, paddingTop: 26, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="title21">You could cook</Text>
          <Text variant="caption12" tone="ink2">{Object.keys(checks).length ? `${ready} ready to cook` : 'Tap Check on a dish'}</Text>
        </View>

        {error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !recs ? (
          <LoadingBlock label="Finding dishes" />
        ) : (
          <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
            {picks.map((r) => {
              const v = recView(r);
              const c = checks[r.id];
              const miss = c?.state === 'ok' ? missingFor(c.recipe, have) : null;
              const total = c?.state === 'ok' ? c.recipe.items.length : 0;
              const ok = miss !== null && miss.length <= 1;
              const recipeJson = c?.state === 'ok' ? JSON.stringify(c.recipe) : '';
              return (
                <Surface key={r.id} radius={22} padding={14} style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <DishImage uri={v.imageUrl} caption={imageCaption(v).split(' ')[0]} height={56} radius={16} stripe={7} style={{ width: 56 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong15" numberOfLines={2}>{v.name}</Text>
                      <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>
                        {c?.state === 'ok' ? `${total} ingredients · serves ${c.recipe.servings}` : v.cuisine}
                      </Text>
                    </View>
                    {!c || c.state === 'error' ? (
                      <Button label={c?.state === 'error' ? 'Retry' : 'Check'} variant="glass" size="sm" style={{ height: 38 }} onPress={() => void check(r)} />
                    ) : c.state === 'loading' ? (
                      <ActivityIndicator color={colors.acc} />
                    ) : ok ? (
                      <Button
                        label="Cook"
                        size="sm"
                        style={{ height: 38 }}
                        onPress={() => {
                          chose('cook');
                          router.push({ pathname: '/diy/recipe', params: { rec: JSON.stringify(r), rank: '0' } });
                        }}
                      />
                    ) : (
                      <Button
                        label={`Get ${miss!.length}`}
                        variant="glass"
                        size="sm"
                        style={{ height: 38 }}
                        onPress={() => {
                          chose('cook');
                          router.push({ pathname: '/diy/cart', params: { recipe: recipeJson, rank: '0' } });
                        }}
                      />
                    )}
                  </View>
                  {miss !== null ? (
                    <>
                      <ProgressBar value={total ? (total - miss.length) / total : 0} />
                      <Text variant="caption12" tone="ink2">{miss.length ? `Missing: ${miss.join(', ')}` : 'You have everything.'}</Text>
                    </>
                  ) : c?.state === 'error' ? (
                    <Text variant="caption12" tone="ink2">Couldn't fetch the recipe. Try again.</Text>
                  ) : null}
                </Surface>
              );
            })}
            <Pressable
              onPress={() => {
                chose('order');
                const results = { mood, craving: 'comfort', budget: 'medium', preference: 'both', gameData: { type: 'pantry', pantryItems: [...have].map(norm) } };
                router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
              }}
              accessibilityRole="button"
              style={{ alignSelf: 'center', paddingVertical: 14, marginBottom: 24 }}
            >
              <Text variant="button13" tone="accText">Rather order in? See your matches</Text>
            </Pressable>
          </View>
        )}
      </Screen>
    </View>
  );
}
