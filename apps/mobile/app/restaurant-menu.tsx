// 2.0 Restaurant menu (live Swiggy). Same params as v1 plus addInitial=1
// ("Order now": opens on the list with the dish already in the cart).
// Without it we open on the AI menu chat like v1. The cart is synced to the
// server-side Swiggy cart (debounced); checkout reads it back in cart mode.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, space } from '@moodfood/tokens';
import { Button, DishImage, Icon, IconButton, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock, PoweredBySwiggy } from '../src/components/v2';
import MenuChat from '../src/components/MenuChat';
import { getRestaurantMenu, updateCartItems, type MenuItem, type RestaurantMenu } from '../src/services/swiggyOrder';

const SYNC_DEBOUNCE_MS = 400;

export default function RestaurantMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    restaurantId: string;
    addressId: string;
    restaurantName?: string;
    dishId?: string;
    dishName?: string;
    why?: string;
    initialMenuItemId?: string;
    addInitial?: string;
  }>();
  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [view, setView] = useState<'chat' | 'menu'>(params.addInitial === '1' ? 'menu' : 'chat');
  const [section, setSection] = useState(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getRestaurantMenu(params.restaurantId, params.addressId);
    setMenu(result);
    setLoading(false);
    return result;
  }, [params.restaurantId, params.addressId]);

  const allItems = useMemo(() => {
    const map: Record<string, MenuItem> = {};
    for (const cat of menu?.categories || []) for (const item of cat.items) map[item.id] = item;
    return map;
  }, [menu]);

  const syncCart = useCallback(
    (next: Record<string, number>) => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const items = Object.entries(next)
          .filter(([, q]) => q > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (items.length === 0) return;
        void updateCartItems(params.restaurantId, params.addressId, items, params.restaurantName);
      }, SYNC_DEBOUNCE_MS);
    },
    [params.restaurantId, params.addressId, params.restaurantName],
  );

  const changeQty = useCallback(
    (id: string, delta: number) => {
      setCart((prev) => {
        const next = { ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) };
        if (next[id] === 0) delete next[id];
        syncCart(next);
        return next;
      });
    },
    [syncCart],
  );

  useEffect(() => {
    load().then((m) => {
      const id = params.initialMenuItemId;
      if (params.addInitial === '1' && id && m.categories.some((c) => c.items.some((i) => i.id === id))) changeQty(id, 1);
    });
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = menu?.restaurant;
  const name = r?.name || params.restaurantName || 'Restaurant';
  const sections = useMemo(() => {
    const cats = menu?.categories ?? [];
    const pick = params.initialMenuItemId ? allItems[params.initialMenuItemId] : undefined;
    return pick ? [{ title: 'Your match', note: 'Picked for your mood', items: [pick] }, ...cats.map((c) => ({ ...c, note: '' }))] : cats.map((c) => ({ ...c, note: '' }));
  }, [menu, allItems, params.initialMenuItemId]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((a, [id, q]) => a + (allItems[id]?.price || 0) * q, 0);

  const toCheckout = () =>
    router.push({ pathname: '/order/confirm', params: { restaurantId: params.restaurantId, restaurantName: name, addressId: params.addressId } });

  const cartBar = count > 0 ? (
    <View
      style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(28, insets.bottom + 12), height: 66, borderRadius: 22, backgroundColor: palette.night, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, boxShadow: '0px 20px 40px -16px rgba(0,0,0,0.6)' }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong15" color={palette.white}>{`${count} ${count === 1 ? 'item' : 'items'} · ₹${Math.round(total)}`}</Text>
        <Text variant="micro12" color="rgba(255,255,255,0.65)" style={{ marginTop: 2 }}>{r?.etaMin ? `Arrives in about ${r.etaMin} min` : 'Live Swiggy pricing'}</Text>
      </View>
      <Button label="Checkout" iconRight="arrow_forward" size="md" style={{ height: 46, paddingHorizontal: 16 }} onPress={toCheckout} />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.solid }}>
      <StatusBar style="light" />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }} stickyHeaderIndices={[2]}>
        <DishImage uri={r?.imageUrl} caption="restaurant" height={220}>
          <View style={{ position: 'absolute', top: 56, left: 16 }}>
            <IconButton icon="arrow_back" label="Back" variant="photo" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          </View>
        </DishImage>

        <Surface kind="solid" radius={28} padding={18} style={{ marginTop: -60, marginHorizontal: 12, boxShadow: '0px -10px 40px -20px rgba(0,0,0,0.45)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="display26" accessibilityRole="header">{name}</Text>
              {r?.cuisines?.length ? <Text variant="caption13" tone="ink2" style={{ marginTop: 3 }}>{r.cuisines.slice(0, 3).join(', ')}</Text> : null}
            </View>
            {r?.rating != null ? (
              <View style={{ height: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: palette.rating, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text variant="chip12" style={{ fontSize: 13 }} color={palette.white}>{r.rating.toFixed(1)}</Text>
                <Icon name="star" size={15} color={palette.white} filled />
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Stat label="Delivery" value={r?.etaMin ? `${r.etaMin} min` : '—'} />
            <Stat label="Status" value="Live" color={palette.success} />
            <Stat label="For two" value={r?.costForTwo ? `₹${r.costForTwo}` : '—'} />
          </View>
        </Surface>

        {/* Sticky tabs: AI chat + menu sections */}
        <View style={{ backgroundColor: colors.solid }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.gutter, paddingTop: 18, paddingBottom: 8 }}>
            <Tab label="Ask MoodFood" icon on={view === 'chat'} onPress={() => setView('chat')} />
            {sections.map((s, i) => (
              <Tab
                key={s.title + i}
                label={s.title}
                on={view === 'menu' && section === i}
                onPress={() => {
                  setView('menu');
                  setSection(i);
                  const y = sectionY.current[i];
                  // Section y is relative to the scroll content; subtract the sticky tab row.
                  if (y != null) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 62), animated: true }), 50);
                }}
              />
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <LoadingBlock label="Opening the menu" />
        ) : !menu?.success ? (
          <ErrorBlock message={menu?.error || "Couldn't load this menu right now."} onRetry={() => void load()} />
        ) : view === 'chat' ? (
          <View style={{ minHeight: 480 }}>
            <MenuChat
              restaurantId={params.restaurantId}
              addressId={params.addressId}
              dishContext={{ dishId: params.dishId, dishName: params.dishName, why: params.why }}
              getItem={(id) => allItems[id]}
              onSuggestedItemAdd={(id) => changeQty(id, 1)}
              onExploreMenu={() => setView('menu')}
              bottomInset={count > 0 ? 128 : 0}
            />
          </View>
        ) : (
          sections.map((s, si) => (
            <View key={s.title + si} onLayout={(e) => (sectionY.current[si] = e.nativeEvent.layout.y)}>
              <View style={{ paddingHorizontal: space.page, paddingTop: 22, paddingBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text variant="title19">{s.title}</Text>
                {s.note ? <Text variant="micro12" tone="ink2">{s.note}</Text> : null}
              </View>
              {s.items.map((it) => (
                <ItemRow key={it.id} item={it} qty={cart[it.id] || 0} highlight={it.id === params.initialMenuItemId} onChange={(d) => changeQty(it.id, d)} />
              ))}
            </View>
          ))
        )}
        <PoweredBySwiggy style={{ paddingTop: 28 }} />
      </ScrollView>
      {cartBar}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Surface kind="tint" radius={14} padding={10} style={{ flex: 1 }}>
      <Text variant="micro11" tone="ink2">{label}</Text>
      <Text variant="bodyStrong14" style={{ marginTop: 2 }} color={color}>{value}</Text>
    </Surface>
  );
}

function Tab({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: on ? colors.ink : colors.surf }}
    >
      {icon ? <Icon name="auto_awesome" size={16} color={on ? colors.solid : colors.accText} /> : null}
      <Text variant="caption13" style={{ fontFamily: 'Geist_500Medium' }} color={on ? colors.solid : colors.ink}>{label}</Text>
    </Pressable>
  );
}

function ItemRow({ item, qty, highlight, onChange }: { item: MenuItem; qty: number; highlight: boolean; onChange: (d: number) => void }) {
  const { colors } = useTheme();
  const vegColor = item.isVeg ? palette.veg : palette.nonVeg;
  return (
    <Surface radius={22} padding={14} style={{ marginHorizontal: space.gutter, marginBottom: 10, flexDirection: 'row', gap: 14 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {item.isVeg != null ? (
            <View accessibilityLabel={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'} style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 1.5, borderColor: vegColor, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: vegColor }} />
            </View>
          ) : null}
          {highlight ? <Text variant="labelSmall" tone="accText">Your pick</Text> : null}
        </View>
        <Text variant="bodyStrong15" style={{ fontSize: 15.5, marginTop: 6 }}>{item.name}</Text>
        {item.price != null ? <Text variant="body14" style={{ fontSize: 14, marginTop: 4 }}>{`₹${Math.round(item.price)}`}</Text> : null}
        {item.description ? <Text variant="caption12" tone="ink2" numberOfLines={3} style={{ marginTop: 6 }}>{item.description}</Text> : null}
      </View>
      <View style={{ width: 104, paddingBottom: 14 }}>
        <DishImage uri={item.imageUrl} height={96} radius={16} stripe={7} />
        {qty === 0 ? (
          <Pressable
            onPress={() => onChange(1)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}
            style={{ position: 'absolute', left: 10, right: 10, bottom: 0, height: 34, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 16px -8px rgba(0,0,0,0.35)' }}
          >
            <Text variant="chip12" style={{ fontSize: 13 }} tone="accText">ADD</Text>
          </Pressable>
        ) : (
          <View style={{ position: 'absolute', left: 6, right: 6, bottom: 0, height: 34, borderRadius: 12, backgroundColor: colors.acc, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0px 8px 16px -8px rgba(0,0,0,0.35)' }}>
            <Pressable onPress={() => onChange(-1)} accessibilityLabel={`Remove one ${item.name}`} style={{ width: 32, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="bodyStrong16" style={{ fontSize: 18 }} color={colors.onAcc}>−</Text>
            </Pressable>
            <Text variant="bodyStrong14" color={colors.onAcc} accessibilityLabel={`${qty} in cart`}>{String(qty)}</Text>
            <Pressable onPress={() => onChange(1)} accessibilityLabel={`Add one more ${item.name}`} style={{ width: 32, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="bodyStrong16" style={{ fontSize: 18 }} color={colors.onAcc}>+</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Surface>
  );
}
