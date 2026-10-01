// 2.0 Checkout. Logic is v1's unchanged (live Swiggy cart via MCP: address,
// coupons, payment method, ₹1000 beta cap → Swiggy app fallback; demo path
// for non-live apps; history + signals + quests). Only the UI is new.
// Params: single-dish mode {rec, rank, appName} or cart mode {restaurantId, restaurantName, addressId}.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, space } from '@moodfood/tokens';
import { Button, Icon, Radio, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { BottomBar, LoadingBlock, TopBar } from '../../src/components/v2';
import { WEATHER_COPY } from '../../src/constants/copy';
import { useLiveMood } from '../../src/context/LiveMood';
import { dishEmoji, dishGradient, resolveDishImage } from '../../src/utils/dishVisuals';
import { DELIVERY_APPS, swiggyDeliveryOption, type DeliveryApp } from '../../src/constants/deliveryApps';
import type { Recommendation } from '../../src/types';
import { saveOrder } from '../../src/services/history';
import { logSignal } from '../../src/services/signals';
import { bumpQuestProgress } from '../../src/services/quests';
import {
  getSavedAddressId,
  saveAddressId,
  fetchAddresses,
  type SwiggyAddress,
} from '../../src/services/aiRecommendations';
import { openSwiggyApp } from '../../src/services/swiggy';
import {
  getCart,
  updateCart,
  fetchCoupons,
  applyCoupon,
  placeOrder,
  type CartState,
  type Coupon,
} from '../../src/services/swiggyOrder';

export default function OrderConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    // Single-dish mode (the "Order now!" fast path from a recommendation card)
    rec?: string;

    rank?: string;
    appName?: string;
    // Cart mode (from the restaurant menu browser — restaurant-scoped, already
    // has whatever the user picked sitting in the server-side Swiggy cart)
    restaurantId?: string;
    restaurantName?: string;
    addressId?: string;
  }>();
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();

  const [imageFailed, setImageFailed] = useState(false);
  const [placing, setPlacing] = useState(false);

  const rec: Recommendation | null = params.rec ? JSON.parse(params.rec) : null;
  const rank = Number(params.rank || 0);
  const cartMode = !rec;

  // Reconstruct the delivery-app choice from its name (app-select.tsx only
  // passes appName, not the full object) the same way order/success.tsx does.
  const app: DeliveryApp = useMemo(() => {
    if (cartMode) {
      return {
        icon: DELIVERY_APPS[0].icon, name: 'Swiggy', bg: '#fff3e0', eta: '30-40 min',
        fee: 'Live restaurant pricing', feeAmount: 0, isLive: true, restaurantName: params.restaurantName,
      };
    }
    const liveOption = rec ? swiggyDeliveryOption(rec) : null;
    if (liveOption && liveOption.name === params.appName) return liveOption;
    return DELIVERY_APPS.find((a) => a.name === params.appName) ?? DELIVERY_APPS[0];
  }, [cartMode, rec, params.appName, params.restaurantName]);

  const emoji = rec ? dishEmoji(rec) : '🍽️';
  const imageUrl = rec && !imageFailed ? resolveDishImage(rec) : null;
  const gradient = dishGradient(rank);

  // A "live" order goes through the real Swiggy MCP tools (cart/coupon/place).
  // A single-dish rec without a live match, or a demo delivery app, keeps the
  // existing local-only "confirm" flow unchanged.
  const restaurantId = cartMode
    ? params.restaurantId!
    : (rec?.swiggy?.item?.restaurant_id ?? rec?.swiggy?.restaurant?.id ?? null);
  const menuItemId = cartMode ? null : (rec?.swiggy?.item?.id ?? null);
  const isLiveOrder = cartMode || !!(app.isLive && rec?.swiggy?.matched && restaurantId && menuItemId);

  const [addresses, setAddresses] = useState<SwiggyAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(cartMode ? params.addressId || null : null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [cart, setCart] = useState<CartState | null>(null);
  const [cartLoading, setCartLoading] = useState(isLiveOrder);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [capExceeded, setCapExceeded] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === addressId) || null;

  const loadCartFor = useCallback(
    async (addrId: string) => {
      setCartLoading(true);
      setOrderError(null);
      // Cart mode: the menu browser already populated the server-side cart —
      // just read it back. Single-dish mode: write the one item, then read.
      const result = cartMode
        ? await getCart(addrId, params.restaurantName)
        : await updateCart(restaurantId!, addrId, menuItemId!, 1, app.restaurantName);
      setCart(result);
      setCapExceeded((result.total ?? 0) >= 1000);
      if (result.availablePaymentMethods.length > 0) setPaymentMethod(result.availablePaymentMethods[0]);
      if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      else if (!result.success && result.error) setOrderError(result.error);
      setCartLoading(false);
    },
    [cartMode, restaurantId, menuItemId, app.restaurantName, params.restaurantName],
  );

  useEffect(() => {
    if (!isLiveOrder) return;
    (async () => {
      const list = await fetchAddresses();
      setAddresses(list);
      let addrId = addressId || (await getSavedAddressId());
      if (!addrId && list.length > 0) {
        addrId = list[0].id;
        await saveAddressId(addrId);
      }
      if (!addrId) {
        setOrderError('Link a Swiggy address to order in-app.');
        setCartLoading(false);
        return;
      }
      setAddressId(addrId);
      await loadCartFor(addrId);
      if (restaurantId) {
        const fetched = await fetchCoupons(restaurantId, addrId);
        setCoupons(fetched);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveOrder]);

  const handleSelectAddress = async (id: string) => {
    setAddressPickerOpen(false);
    setAddressId(id);
    await saveAddressId(id);
    await loadCartFor(id);
  };

  const handleApplyCoupon = async (code: string) => {
    if (!addressId) return;
    setCartLoading(true);
    const result = await applyCoupon(code, addressId);
    if (result.success) {
      setCart(result);
      setAppliedCoupon(code);
      setCapExceeded((result.total ?? 0) >= 1000);
    } else if (result.error) {
      setOrderError(result.error);
    }
    setCartLoading(false);
  };

  // --- Fake / demo-app path (single-dish mode only, unchanged from before) ---
  const priceNum = rec?.practical_details?.estimated_price ?? 250;
  const delivFee = app.feeAmount;
  const discount = priceNum * 0.15;
  const fakeTotal = priceNum + delivFee - discount;

  // --- Live totals ---
  const liveSubtotal = cart?.subtotal ?? priceNum;
  const liveDelivery = cart?.deliveryCharges ?? 0;
  const liveDiscount = cart?.couponDiscount ?? 0;
  const liveTotal = cart?.total ?? liveSubtotal + liveDelivery - liveDiscount;

  const total = isLiveOrder ? liveTotal : fakeTotal;
  const cartItemCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  const handleOpenInSwiggyApp = async () => {
    await openSwiggyApp(restaurantId || undefined, rec?.dish.name);
  };

  const saveOrderHistory = async (orderId: string | null | undefined) => {
    try {
      if (cartMode) {
        const summary = cart?.items?.length
          ? cart.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')
          : params.restaurantName || 'Order';
        await saveOrder({
          dishName: summary,
          cuisine: undefined,
          emoji: '🛒',
          priceInr: Math.round(total),
          platform: app.name,
          gradientStart: gradient[0],
          gradientEnd: gradient[1],
          ordered: true,
          saved: false,
          swiggyOrderId: orderId || undefined,
          restaurantId: restaurantId || undefined,
          addressId: addressId || undefined,
        });
      } else if (rec) {
        await saveOrder({
          dishName: rec.dish.name,
          cuisine: rec.dish.cuisine,
          emoji,
          priceInr: Math.round(total),
          platform: app.name,
          via: (rec as unknown as Record<string, string>).gameSource || undefined,
          gradientStart: gradient[0],
          gradientEnd: gradient[1],
          ordered: true,
          saved: false,
          swiggyOrderId: orderId || undefined,
          restaurantId: restaurantId || undefined,
          menuItemId: menuItemId || undefined,
          addressId: addressId || undefined,
        });
      }
    } catch {
      // silent — order nav proceeds regardless
    }
  };

  const handlePlaceOrder = async () => {
    setPlacing(true);
    setOrderError(null);

    if (isLiveOrder) {
      if (!addressId) {
        setOrderError('Select a delivery address first.');
        setPlacing(false);
        return;
      }
      if (capExceeded) {
        setPlacing(false);
        return; // UI shows the "open in Swiggy app" fallback instead of a place button
      }
      const result = await placeOrder(addressId, paymentMethod || undefined, true);
      if (!result.success) {
        if (result.capExceeded) setCapExceeded(true);
        else if (result.addressRequired) setOrderError('We need a delivery address to continue.');
        else setOrderError(result.error || 'Could not place the order. Please try again.');
        setPlacing(false);
        return;
      }
      await saveOrderHistory(result.orderId);
      void logSignal('order', {
        dish_id: rec?.dish.id, dish_name: rec?.dish.name || params.restaurantName,
        price: Math.round(total),
      });
      if (rec?.is_wildcard) {
        void logSignal('wildcard_verdict', { accepted: true });
        void bumpQuestProgress('adventure_score');
      }
      void bumpQuestProgress('try_3_cuisines');
      router.push({
        pathname: '/order/success',
        params: {
          rec: params.rec || JSON.stringify({
            dish: { id: '', name: cart?.items?.length ? `${cart.items.length} items` : 'Your order' },
            swiggy: { matched: true, restaurant: { name: params.restaurantName } },
          }),
          appName: app.name, total: total.toFixed(0), orderId: result.orderId || '',
        },
      });
      setPlacing(false);
      return;
    }

    // Fake / demo-app path — unchanged (single-dish mode only).
    await saveOrderHistory(null);
    void logSignal('order', { dish_id: rec?.dish.id, dish_name: rec?.dish.name, price: Math.round(total) });
    if (rec?.is_wildcard) {
      void logSignal('wildcard_verdict', { accepted: true });
      void bumpQuestProgress('adventure_score');
    }
    void bumpQuestProgress('try_3_cuisines');
    router.push({
      pathname: '/order/success',
      params: { rec: params.rec!, appName: app.name, total: total.toFixed(0) },
    });
    setPlacing(false);
  };

  const { weather } = useLiveMood();
  const fmt = (n: number) => `₹${Math.round(n)}`;
  const lines = isLiveOrder
    ? (cart?.items ?? []).map((i) => ({ key: i.id, name: i.name, qty: i.quantity, total: i.price != null ? fmt(i.price * i.quantity) : '' }))
    : rec
      ? [{ key: 'dish', name: rec.dish.name, qty: 1, total: fmt(priceNum) }]
      : [];
  const deliveryTxt = isLiveOrder
    ? liveDelivery === 0 ? 'Included' : fmt(liveDelivery)
    : delivFee === 0 ? (app.isLive ? 'Included' : 'Free') : fmt(delivFee);
  const canPlace = !placing && !cartLoading && !(isLiveOrder && !addressId);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ paddingBottom: 150 + safeBottom }}>
        <TopBar title="Checkout" subtitle={isLiveOrder ? app.restaurantName || params.restaurantName || 'Swiggy' : `Demo · ${app.name}`} />

        <Surface kind="solid" radius={24} padding={16} style={{ marginHorizontal: space.gutter, marginTop: 12, gap: 14 }}>
          {isLiveOrder ? (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="home" size={22} tone="accText" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong15">{selectedAddress?.label || 'Delivery address'}</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{selectedAddress?.line || (addressId ? 'Saved Swiggy address' : 'No address linked yet')}</Text>
              </View>
              {addresses.length > 1 ? (
                <Pressable onPress={() => setAddressPickerOpen(true)} hitSlop={10} accessibilityRole="button">
                  <Text variant="button13" tone="accText">Change</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="info" size={22} tone="accText" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong15">Demo order</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{`${app.name} isn't connected yet, so no restaurant is contacted.`}</Text>
              </View>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: c.line }} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="schedule" size={22} tone="accText" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong15">{`Arriving in ${app.eta}`}</Text>
              <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{WEATHER_COPY[weather].packNote}</Text>
            </View>
          </View>
        </Surface>

        <Surface radius={24} style={{ marginHorizontal: space.gutter, marginTop: 12, paddingHorizontal: 16, paddingVertical: 6 }}>
          {cartLoading ? (
            <LoadingBlock label="Checking your cart" style={{ paddingVertical: 24 }} />
          ) : lines.length ? (
            lines.map((l) => (
              <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ height: 32, minWidth: 34, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="button13">{`${l.qty}×`}</Text>
                </View>
                <Text variant="bodyStrong14" style={{ flex: 1 }} numberOfLines={2}>{l.name}</Text>
                <Text variant="bodyStrong14">{l.total}</Text>
              </View>
            ))
          ) : (
            <Text variant="caption13" tone="ink2" style={{ paddingVertical: 14 }}>Your cart is empty.</Text>
          )}
          {cartMode && !cartLoading ? (
            <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ paddingBottom: 12 }}>
              <Text variant="button13" tone="accText">Edit items</Text>
            </Pressable>
          ) : null}
        </Surface>

        {isLiveOrder && coupons.length > 0 ? (
          <View style={{ paddingHorizontal: space.gutter, marginTop: 12, gap: 8 }}>
            {coupons.map((cp) => {
              const on = appliedCoupon === cp.couponCode;
              return (
                <Pressable key={cp.couponCode} onPress={() => !on && handleApplyCoupon(cp.couponCode)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Surface kind={on ? 'accentSoft' : 'glass'} radius={18} style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Icon name="sell" size={20} tone="accText" />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong14" tone={on ? 'accText' : 'ink'}>{on ? `${cp.couponCode} applied` : cp.couponCode}</Text>
                      {cp.description ? <Text variant="caption12" tone="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{cp.description}</Text> : null}
                    </View>
                    {!on ? <Text variant="button13" tone="accText">Apply</Text> : <Icon name="check_circle" size={20} tone="accText" filled />}
                  </Surface>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Surface kind="solid" radius={24} style={{ marginHorizontal: space.gutter, marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 9 }}>
          <BillRow label="Item total" value={fmt(isLiveOrder ? liveSubtotal : priceNum)} />
          <BillRow label="Delivery" value={deliveryTxt} />
          {isLiveOrder ? (
            liveDiscount > 0 ? <BillRow label={`Coupon (${appliedCoupon})`} value={`−${fmt(liveDiscount)}`} accent /> : null
          ) : (
            <BillRow label="Promo (MOODFOOD15)" value={`−${fmt(discount)}`} accent />
          )}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 3 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong16">To pay</Text>
            <Text variant="bodyStrong16">{fmt(total)}</Text>
          </View>
        </Surface>

        {isLiveOrder && cart && cart.availablePaymentMethods.length > 0 ? (
          <>
            <Text variant="bodyStrong15" style={{ paddingHorizontal: space.page, paddingTop: 22, paddingBottom: 10 }}>Pay with</Text>
            <View style={{ paddingHorizontal: space.gutter, gap: 8 }}>
              {cart.availablePaymentMethods.map((m) => (
                <Pressable key={m} onPress={() => setPaymentMethod(m)} accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === m }}>
                  <Surface radius={18} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Icon name={/cash|cod/i.test(m) ? 'payments' : /upi/i.test(m) ? 'qr_code_2' : 'credit_card'} size={22} tone="ink2" />
                    <Text variant="bodyStrong14" style={{ flex: 1 }}>{m}</Text>
                    <Radio selected={paymentMethod === m} />
                  </Surface>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {isLiveOrder ? (
          <View style={{ marginHorizontal: space.gutter, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="link" size={18} color={palette.success} />
            <Text variant="caption12" tone="ink2" style={{ flex: 1 }}>Ordering through your connected Swiggy account</Text>
          </View>
        ) : null}

        {capExceeded ? (
          <Surface kind="accentSoft" radius={18} style={{ marginHorizontal: space.gutter, marginTop: 12, padding: 14 }}>
            <Text variant="caption13">Orders of ₹1000 or more need the Swiggy app for now (beta limit).</Text>
          </Surface>
        ) : null}
        {orderError ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">{orderError}</Text>
        ) : null}
      </Screen>

      <BottomBar>
        {capExceeded ? (
          <Button block label="Open in Swiggy app" iconRight="arrow_forward" style={{ flex: 1 }} onPress={handleOpenInSwiggyApp} />
        ) : (
          <Button
            block
            style={{ flex: 1 }}
            loading={placing}
            disabled={!canPlace}
            label={`Place order · ${fmt(total)}`}
            onPress={handlePlaceOrder}
          />
        )}
      </BottomBar>

      <Modal visible={addressPickerOpen} transparent animationType="slide" onRequestClose={() => setAddressPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setAddressPickerOpen(false)} accessibilityLabel="Close address picker" />
        <Surface kind="solid" radius={28} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 + safeBottom, gap: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
          <Text variant="title19" style={{ marginBottom: 6 }}>Deliver to</Text>
          {addresses.map((a) => (
            <Pressable key={a.id} onPress={() => handleSelectAddress(a.id)} accessibilityRole="radio" accessibilityState={{ selected: a.id === addressId }}>
              <Surface kind="tint" radius={18} style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong14">{a.label}</Text>
                  <Text variant="caption12" tone="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{a.line}</Text>
                </View>
                <Radio selected={a.id === addressId} />
              </Surface>
            </Pressable>
          ))}
        </Surface>
      </Modal>
    </View>
  );
}

function BillRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="body13" tone="ink2">{label}</Text>
      <Text variant="bodyStrong14" style={{ fontSize: 13.5 }} tone={accent ? 'accText' : 'ink'}>{value}</Text>
    </View>
  );
}
