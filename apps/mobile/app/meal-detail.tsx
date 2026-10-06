// 2.0 Meal detail. Params: rec (JSON), rank, optional variant
// (healthier_swap | budget_swap) to open on a swap. Keeps v1 behaviour:
// variant switching, save to history, live restaurant menu, DIY recipe.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Chip, DishImage, Icon, IconButton, MatchBadge, ProgressRing, Screen, Surface, Text, Button, useTheme, useToast, type IconName } from '@moodfood/ui';
import { BottomBar } from '../src/components/v2';
import { SwapRow } from '../src/components/v2/RecCards';
import { MOOD_COPY, WEATHER_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { getSavedAddressId } from '../src/services/aiRecommendations';
import { saveOrder, toggleSaved } from '../src/services/history';
import { useStartOrder } from '../src/services/orderFlow';
import type { Recommendation } from '../src/types';
import { imageCaption, recView } from '../src/utils/recView';

type Variant = 'original' | 'healthier_swap' | 'budget_swap';

export default function MealDetailScreen() {
  const router = useRouter();
  const { order, ordering } = useStartOrder(router);
  const toast = useToast();
  const { colors, dark } = useTheme();
  const { weather, mood } = useLiveMood();
  const params = useLocalSearchParams<{ rec: string; rank?: string; variant?: Variant }>();
  const rec = useMemo<Recommendation | null>(() => (params.rec ? JSON.parse(params.rec) : null), [params.rec]);
  const rank = Number(params.rank || 0);
  const [variant, setVariant] = useState<Variant>(params.variant ?? 'original');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Same projection v1 used: a swap borrows the original's restaurant context.
  const current = useMemo<Recommendation | null>(() => {
    if (!rec || variant === 'original') return rec;
    const alt = rec.alternatives?.find((a) => a.type === variant);
    if (!alt) return rec;
    return {
      ...rec,
      dish: { ...rec.dish, name: alt.name, cuisine: alt.cuisine ?? rec.dish.cuisine, category: alt.category ?? rec.dish.category, tags: alt.tags ?? rec.dish.tags },
      image_url: alt.image_url ?? null,
      swiggy: alt.swiggy ?? null,
      practical_details: alt.practical_details ? { ...rec.practical_details, ...alt.practical_details } : rec.practical_details,
      ai_reasoning: { ...rec.ai_reasoning, mood_match: alt.reason },
    };
  }, [rec, variant]);

  if (!rec || !current) return null;
  const v = recView(current);
  const swaps = (rec.alternatives ?? []).filter((a) => a.type === 'healthier_swap' || a.type === 'budget_swap');

  const reasons: Array<{ icon: IconName; t: string }> = [
    current.ai_reasoning?.mood_match && { icon: 'self_improvement' as IconName, t: current.ai_reasoning.mood_match },
    current.ai_reasoning?.context_fit && { icon: 'schedule' as IconName, t: current.ai_reasoning.context_fit },
    current.ai_reasoning?.psychological_hook && { icon: 'auto_awesome' as IconName, t: current.ai_reasoning.psychological_hook },
    current.ai_reasoning?.nostalgia_factor && { icon: 'history' as IconName, t: current.ai_reasoning.nostalgia_factor },
  ].filter(Boolean) as Array<{ icon: IconName; t: string }>;

  const toggleSave = async () => {
    if (saving) return;
    const next = !saved;
    setSaved(next);
    setSaving(true);
    try {
      if (savedId) await toggleSaved(savedId, next);
      else
        setSavedId(
          await saveOrder({ dishName: v.name, cuisine: v.cuisine, priceInr: v.price ?? undefined, ordered: false, saved: next }),
        );
      toast(next ? 'Saved for later' : 'Removed from saved');
    } catch {
      setSaved(!next);
    } finally {
      setSaving(false);
    }
  };

  const browseMenu = async () => {
    const addressId = await getSavedAddressId();
    if (!v.restaurantId || !addressId) return;
    router.push({
      pathname: '/restaurant-menu',
      params: {
        restaurantId: v.restaurantId,
        addressId,
        restaurantName: v.restaurantName || '',
        dishId: current.dish.id || '',
        dishName: v.name,
        why: v.why || '',
        initialMenuItemId: v.menuItemId || '',
      },
    });
  };

  const stats: Array<{ key: string; node: ReactNode; label: string }> = [];
  if (v.health != null) stats.push({ key: 'h', node: <ProgressRing value={Math.round(v.health)} size={58} />, label: 'Health score' });
  if (v.kcal != null) stats.push({ key: 'k', node: <Text variant="display26" style={{ fontSize: 24 }}>{Math.round(v.kcal)}</Text>, label: 'kcal' });
  if (v.prepMin != null) stats.push({ key: 'p', node: <Text variant="display26" style={{ fontSize: 24 }}>{`${v.prepMin}m`}</Text>, label: 'prep time' });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Screen edgeToEdge contentContainerStyle={{ paddingBottom: 140 }}>
        <DishImage uri={v.imageUrl} caption={`hero photo · ${imageCaption(v)}`} height={370} scrim={0.55}>
          <View style={{ position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconButton icon="arrow_back" label="Back" variant="photo" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
            <IconButton icon="ios_share" label="Share" variant="photo" onPress={() => void Share.share({ message: `${v.name} — picked for my mood on MoodFood.` })} />
          </View>
        </DishImage>

        <Surface kind="solid" radius={30} style={{ marginTop: -52, marginHorizontal: 12, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20, boxShadow: '0px -10px 40px -20px rgba(0,0,0,0.45)' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {v.match != null ? <MatchBadge percent={v.match} icon="auto_awesome" /> : null}
            {rank === 0 && variant === 'original' ? <Chip label={WEATHER_COPY[weather].topFor} /> : null}
            <Chip label={variant === 'healthier_swap' ? 'Healthier swap' : variant === 'budget_swap' ? 'Budget pick' : MOOD_COPY[mood].chip} />
          </View>
          <Text variant="display30" style={{ marginTop: 14 }} accessibilityRole="header">{v.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10, alignItems: 'center' }}>
            <Text variant="body13" tone="ink2">{v.cuisine}</Text>
            {v.rating != null ? <Meta icon="star" text={v.rating.toFixed(1)} accent /> : null}
            {v.eta != null ? <Meta icon="schedule" text={`${v.eta} min`} /> : null}
            {v.priceTxt ? <Text variant="bodyStrong14" style={{ fontSize: 13.5 }}>{v.priceTxt}</Text> : null}
          </View>

          {reasons.length ? (
            <Surface kind="tint" radius={22} padding={16} style={{ marginTop: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="auto_awesome" size={20} tone="accText" />
                <Text variant="bodyStrong15">Why this fits you</Text>
              </View>
              {reasons.map((r) => (
                <View key={r.t} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name={r.icon} size={18} tone="ink2" style={{ marginTop: 1 }} />
                  <Text variant="body13" style={{ flex: 1 }}>{r.t}</Text>
                </View>
              ))}
            </Surface>
          ) : null}

          {stats.length ? (
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              {stats.map((s) => (
                <Surface key={s.key} kind="tint" radius={20} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {s.node}
                  <Text variant="micro11" tone="ink2">{s.label}</Text>
                </Surface>
              ))}
            </View>
          ) : null}

          {v.tags.length ? (
            <>
              <Text variant="bodyStrong15" style={{ marginTop: 20 }}>What it's like</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {v.tags.slice(0, 8).map((t) => (
                  <View key={t} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' }}>
                    <Text variant="caption13">{t.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {v.restaurantName ? (
            <Surface kind="tint" radius={22} padding={14} style={{ marginTop: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <DishImage height={52} radius={16} stripe={7} style={{ width: 52 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong15" numberOfLines={1}>{v.restaurantName}</Text>
                  <Text variant="caption12" tone="ink2" style={{ marginTop: 2 }}>
                    {[v.rating != null ? `${v.rating.toFixed(1)} ★` : null, v.distanceKm != null ? `${v.distanceKm.toFixed(1)} km` : null, v.eta != null ? `${v.eta} min` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {v.live ? <Button label="Menu" variant="glass" size="sm" onPress={browseMenu} /> : null}
              </View>
              {v.live ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: v.isOpen === false ? palette.danger : palette.success }} />
                  <Text variant="caption12" tone="ink2">{v.isOpen === false ? 'Closed right now' : 'Live on Swiggy · open now'}</Text>
                </View>
              ) : null}
            </Surface>
          ) : null}

          <Pressable onPress={() => router.push({ pathname: '/diy/recipe', params: { rec: JSON.stringify(current), rank: String(rank) } })} accessibilityRole="button">
            <Surface kind="accentSoft" radius={22} padding={14} style={{ marginTop: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="skillet" size={22} tone="accText" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong15">Cook it yourself</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 2 }}>Step-by-step recipe and a shopping list</Text>
              </View>
              <Icon name="chevron_right" size={22} tone="accText" />
            </Surface>
          </Pressable>

          {swaps.length ? (
            <>
              <Text variant="bodyStrong15" style={{ marginTop: 20 }}>Explore alternatives</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {variant !== 'original' ? (
                  <SwapRow compact label="Original pick" name={rec.dish.name} onPress={() => setVariant('original')} />
                ) : null}
                {swaps
                  .filter((a) => a.type !== variant)
                  .map((a) => (
                    <SwapRow
                      key={a.dish_id}
                      compact
                      label={a.type === 'healthier_swap' ? 'Healthier swap' : 'Budget pick'}
                      name={a.name}
                      delta={a.practical_details?.estimated_price != null ? `₹${Math.round(a.practical_details.estimated_price)}` : null}
                      onPress={() => setVariant(a.type as Variant)}
                    />
                  ))}
              </View>
            </>
          ) : null}
        </Surface>
      </Screen>
      <BottomBar>
        <IconButton icon="bookmark" label={saved ? 'Remove from saved' : 'Save'} variant="solid" square size={56} filled={saved} iconColor={saved ? colors.accText : undefined} onPress={toggleSave} style={{ borderRadius: 18 }} />
        <Button label={v.priceTxt ? `Order now · ${v.priceTxt}` : 'Order now'} style={{ flex: 1, height: 56, borderRadius: 18 }} loading={ordering} onPress={() => void order(current)} />
      </BottomBar>
    </View>
  );
}

function Meta({ icon, text, accent }: { icon: IconName; text: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name={icon} size={16} tone={accent ? 'accText' : 'ink2'} />
      <Text variant="body13" tone="ink2">{text}</Text>
    </View>
  );
}
