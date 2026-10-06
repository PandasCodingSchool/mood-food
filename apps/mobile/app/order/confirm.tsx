// 2.0 Checkout for the live Swiggy cart the restaurant menu filled: address,
// coupons, payment method, ₹1000 beta cap → Swiggy app fallback; then
// history + signals + quests. Every order goes through the user's Swiggy account.
// Params: restaurantId, restaurantName, addressId, etaMin?, and dishId/dishName
// of the recommendation that led here (for signals).
import { useState, useEffect, useCallback } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, space } from '@moodfood/tokens';
import { Button, Icon, Radio, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { BottomBar, LoadingBlock, PoweredBySwiggy, TopBar } from '../../src/components/v2';
import { WEATHER_COPY } from '../../src/constants/copy';
import { useLiveMood } from '../../src/context/LiveMood';
import { dishGradient } from '../../src/utils/dishVisuals';
import { saveOrder } from '../../src/services/history';
import { saveActiveOrder } from '../../src/services/activeOrder';
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
  fetchCoupons,
  applyCoupon,
  placeOrder,
  type CartState,
  type Coupon,
} from '../../src/services/swiggyOrder';

export default function OrderConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    restaurantId: string;
    restaurantName?: string;
    addressId?: string;
    etaMin?: string;
    dishId?: string;
    dishName?: string;
  }>();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();

  const [placing, setPlacing] = useState(false);
  const restaurantId = params.restaurantId;
  const restaurantName = params.restaurantName || 'Swiggy';
  const etaTxt = params.etaMin ? `${params.etaMin} min` : null;
  const gradient = dishGradient(0);

  const [addresses, setAddresses] = useState<SwiggyAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(params.addressId || null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [cart, setCart] = useState<CartState | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [capExceeded, setCapExceeded] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === addressId) || null;

  // The menu browser already populated the server-side cart; read it back.
  const loadCartFor = useCallback(
    async (addrId: string) => {
      setCartLoading(true);
      setOrderError(null);
      const result = await getCart(addrId, params.restaurantName);
      setCart(result);
      setCapExceeded((result.total ?? 0) >= 1000);
      if (result.availablePaymentMethods.length > 0) setPaymentMethod(result.availablePaymentMethods[0]);
      if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      else if (!result.success && result.error) setOrderError(result.error);
      setCartLoading(false);
    },
    [params.restaurantName],
  );

  useEffect(() => {
    (async () => {
      const list = await fetchAddresses();
      setAddresses(list);
      let addrId = addressId || (await getSavedAddressId());
      if (!addrId && list.length > 0) {
        addrId = list[0].id;
        await saveAddressId(addrId);
      }
      if (!addrId) {
        setOrderError('Add a delivery address in the Swiggy app to order.');
        setCartLoading(false);
        return;
      }
      setAddressId(addrId);
      await loadCartFor(addrId);
      if (restaurantId) setCoupons(await fetchCoupons(restaurantId, addrId));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const subtotal = cart?.subtotal ?? 0;
  const delivery = cart?.deliveryCharges ?? 0;
  const discount = cart?.couponDiscount ?? 0;
  const total = cart?.total ?? subtotal + delivery - discount;
  const summary = cart?.items?.length ? cart.items.map((i) => `${i.quantity}× ${i.name}`).join(', ') : restaurantName;

  const saveOrderHistory = async (orderId: string | null | undefined) => {
    try {
      await saveOrder({
        dishName: summary,
        cuisine: undefined,
        emoji: '🛒',
        priceInr: Math.round(total),
        platform: 'Swiggy',
        gradientStart: gradient[0],
        gradientEnd: gradient[1],
        ordered: true,
        saved: false,
        swiggyOrderId: orderId || undefined,
        restaurantId: restaurantId || undefined,
        addressId: addressId || undefined,
      });
    } catch {
      // silent — order nav proceeds regardless
    }
  };

  const handlePlaceOrder = async () => {
    if (!addressId) return setOrderError('Select a delivery address first.');
    if (capExceeded) return; // UI shows the "open in Swiggy app" fallback instead of a place button
    setPlacing(true);
    setOrderError(null);
    const result = await placeOrder(addressId, paymentMethod || undefined, true);
    if (!result.success) {
      if (result.capExceeded) setCapExceeded(true);
      else if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      else setOrderError(result.error || 'Could not place the order. Please try again.');
      setPlacing(false);
      return;
    }
    await saveOrderHistory(result.orderId);
    const eta = result.estimatedDeliveryTime || etaTxt || '';
    if (result.orderId) {
      // Powers the home "live order" banner and /order/track.
      await saveActiveOrder({
        orderId: result.orderId,
        restaurant: restaurantName,
        dishId: params.dishId || null,
        dishName: params.dishName || null,
        items: (cart?.items ?? []).map((i) => ({ label: `${i.quantity}× ${i.name}`, total: i.price != null ? `₹${Math.round(i.price * i.quantity)}` : '' })),
        total: `₹${Math.round(total)}`,
        eta,
        placedAt: new Date().toISOString(),
        step: 'placed',
        events: [{ step: 'placed', status: result.status ?? null, at: new Date().toISOString() }],
      });
    }
    void logSignal('order', { dish_id: params.dishId, dish_name: params.dishName || restaurantName, price: Math.round(total) });
    void bumpQuestProgress('try_3_cuisines');
    router.push({
      pathname: '/order/success',
      params: { restaurantName, summary, total: total.toFixed(0), orderId: result.orderId || '', eta },
    });
    setPlacing(false);
  };

  const { weather } = useLiveMood();
  const fmt = (n: number) => `₹${Math.round(n)}`;
  const lines = (cart?.items ?? []).map((i) => ({ key: i.id, name: i.name, qty: i.quantity, total: i.price != null ? fmt(i.price * i.quantity) : '' }));
  const deliveryTxt = delivery === 0 ? 'Included' : fmt(delivery);
  const canPlace = !placing && !cartLoading && !!addressId && lines.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ paddingBottom: 150 + safeBottom }}>
        <TopBar title="Checkout" subtitle={restaurantName} />

        <Surface kind="solid" radius={24} padding={16} style={{ marginHorizontal: space.gutter, marginTop: 12, gap: 14 }}>
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
          <View style={{ height: 1, backgroundColor: c.line }} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="schedule" size={22} tone="accText" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong15">{etaTxt ? `Arriving in about ${etaTxt}` : 'Swiggy confirms the delivery time'}</Text>
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
          {!cartLoading ? (
            <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ paddingBottom: 12 }}>
              <Text variant="button13" tone="accText">Edit items</Text>
            </Pressable>
          ) : null}
        </Surface>

        {coupons.length > 0 ? (
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
          <BillRow label="Item total" value={fmt(subtotal)} />
          <BillRow label="Delivery" value={deliveryTxt} />
          {discount > 0 ? <BillRow label={`Coupon (${appliedCoupon})`} value={`−${fmt(discount)}`} accent /> : null}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 3 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong16">To pay</Text>
            <Text variant="bodyStrong16">{fmt(total)}</Text>
          </View>
        </Surface>

        {cart && cart.availablePaymentMethods.length > 0 ? (
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

        <View style={{ marginHorizontal: space.gutter, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Icon name="link" size={18} color={palette.success} />
          <Text variant="caption12" tone="ink2" style={{ flex: 1 }}>Ordering through your connected Swiggy account</Text>
        </View>

        {capExceeded ? (
          <Surface kind="accentSoft" radius={18} style={{ marginHorizontal: space.gutter, marginTop: 12, padding: 14 }}>
            <Text variant="caption13">Orders of ₹1000 or more need the Swiggy app for now (beta limit).</Text>
          </Surface>
        ) : null}
        {orderError ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">{orderError}</Text>
        ) : null}
        <PoweredBySwiggy style={{ paddingTop: 22 }} />
      </Screen>

      <BottomBar>
        {capExceeded ? (
          <Button block label="Open in Swiggy app" iconRight="arrow_forward" style={{ flex: 1 }} onPress={() => void openSwiggyApp(restaurantId)} />
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
