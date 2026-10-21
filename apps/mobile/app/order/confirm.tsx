// 2.0 Checkout for the live Swiggy cart the restaurant menu filled: address,
// coupons, payment method, ₹1000 beta cap → Swiggy app fallback; then
// history + signals + quests. Every order goes through the user's Swiggy account.
// Params: restaurantId, restaurantName, addressId, etaMin?, and dishId/dishName
// of the recommendation that led here (for signals).
import { useState, useEffect, useCallback, useRef } from 'react';
import { Image, Linking, Modal, Platform, Pressable, TextInput, View } from 'react-native';
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
  waitForUpiPayment,
  type CartState,
  type Coupon,
  type PaymentOption,
  type UpiPayment,
} from '../../src/services/swiggyOrder';

// UPI app intents only open on a phone; the web app pays through Swiggy's QR page.
const usableOn = (o: PaymentOption) => Platform.OS !== 'web' || o.kind !== 'upi_app';
const PAY_ICONS = { upi_app: 'touch_app', upi_qr: 'qr_code_2', swiggy_money: 'savings', cash: 'payments' } as const;

/** Opens the UPI app (intent), falling back to Swiggy's payment page (QR + "open in UPI app"). */
async function openUpiPayment(p: UpiPayment) {
  const urls = Platform.OS === 'web' || p.isQrFlow ? [p.bridgeUrl, p.upiIntentUrl] : [p.upiIntentUrl, p.bridgeUrl];
  for (const url of urls) {
    if (!url) continue;
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // app not installed / scheme blocked: try the next link
    }
  }
}

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
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  // Kept apart from `cart`: a coupon response doesn't carry payment options.
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [upi, setUpi] = useState<{ payment: UpiPayment; label: string } | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => {
    cancelled.current = true;
  }, []);
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
      setAppliedCoupon(result.couponCode ?? null);
      setCapExceeded((result.total ?? 0) >= 1000);
      const options = result.paymentOptions.filter(usableOn);
      setPaymentOptions(options);
      setPaymentId((prev) => (options.some((o) => o.id === prev) ? prev : options[0]?.id ?? null));
      if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      // Errors can ride on a successful read too (Swiggy's gpoError: closed, unserviceable…).
      else if (result.error) setOrderError(result.error);
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
      if (restaurantId) setCoupons(await fetchCoupons(restaurantId, addrId).catch(() => []));
    })().catch(() => {
      setOrderError("Couldn't load checkout. Please go back and try again.");
      setCartLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAddress = async (id: string) => {
    setAddressPickerOpen(false);
    setAddressId(id);
    await saveAddressId(id);
    await loadCartFor(id);
  };

  const handleApplyCoupon = async (raw: string) => {
    const code = cleanCouponCode(raw);
    if (!addressId || !code || applying) return;
    setApplying(code);
    setCouponError(null);
    const result = await applyCoupon(code, addressId);
    if (result.success) {
      setCart(result);
      setAppliedCoupon(result.couponCode ?? code);
      setCapExceeded((result.total ?? 0) >= 1000);
      setCouponInput('');
    } else {
      setCouponError(result.error || "Couldn't apply this coupon.");
    }
    setApplying(null);
  };

  const subtotal = cart?.subtotal ?? 0;
  const delivery = cart?.deliveryCharges ?? 0;
  const discount = cart?.couponDiscount ?? 0;
  const taxes = cart?.taxes ?? 0;
  const total = cart?.total ?? subtotal + delivery + taxes - discount;
  // Swiggy's own waiver counts as a saving too (e.g. ₹51 delivery → free).
  const waived = cart?.freeDelivery && delivery === 0 ? cart.deliveryStrikeoff ?? 0 : 0;
  const savings = discount + waived;
  const suggested = cart?.suggestedCoupon && !coupons.some((cp) => cp.couponCode === cart.suggestedCoupon) ? cart.suggestedCoupon : null;
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

  /** The order exists on Swiggy: history, live-order banner, signals, success screen. */
  const finishOrder = async (orderId: string | null | undefined, status: string | null | undefined, etaFromSwiggy?: string | null) => {
    await saveOrderHistory(orderId);
    const eta = etaFromSwiggy || etaTxt || '';
    if (orderId) {
      // Powers the home "live order" banner and /order/track.
      await saveActiveOrder({
        orderId,
        restaurant: restaurantName,
        dishId: params.dishId || null,
        dishName: params.dishName || null,
        items: (cart?.items ?? []).map((i) => ({ label: `${i.quantity}× ${i.name}`, total: i.price != null ? `₹${Math.round(i.price * i.quantity)}` : '' })),
        total: `₹${Math.round(total)}`,
        eta,
        placedAt: new Date().toISOString(),
        step: 'placed',
        events: [{ step: 'placed', status: status ?? null, at: new Date().toISOString() }],
      });
    }
    void logSignal('order', { dish_id: params.dishId, dish_name: params.dishName || restaurantName, price: Math.round(total) });
    void bumpQuestProgress('try_3_cuisines');
    router.push({
      pathname: '/order/success',
      params: { restaurantName, summary, total: total.toFixed(0), orderId: orderId || '', eta },
    });
  };

  const handlePlaceOrder = async () => {
    if (!addressId) return setOrderError('Select a delivery address first.');
    if (capExceeded) return; // UI shows the "open in Swiggy app" fallback instead of a place button
    const option = paymentOptions.find((o) => o.id === paymentId);
    if (paymentOptions.length > 0 && !option) return setOrderError('Choose how you want to pay.');
    setPlacing(true);
    setOrderError(null);
    const result = await placeOrder(addressId, option, true);
    if (!result.success) {
      if (result.capExceeded) setCapExceeded(true);
      else if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      else setOrderError(result.error || 'Could not place the order. Please try again.');
      setPlacing(false);
      return;
    }
    if (result.payment) {
      // UPI: nothing is placed until Swiggy sees the payment.
      setUpi({ payment: result.payment, label: option?.label || 'your UPI app' });
      await openUpiPayment(result.payment);
      const outcome = await waitForUpiPayment(result.payment, () => cancelled.current);
      setUpi(null);
      if (outcome.state === 'cancelled') return;
      if (outcome.state === 'failed') {
        setOrderError(outcome.error);
        setPlacing(false);
        return;
      }
      await finishOrder(outcome.orderId, 'CONFIRMED', result.estimatedDeliveryTime);
      setPlacing(false);
      return;
    }
    await finishOrder(result.orderId, result.status, result.estimatedDeliveryTime);
    setPlacing(false);
  };

  const { weather } = useLiveMood();
  const fmt = (n: number) => `₹${Math.round(n)}`;
  const lines = (cart?.items ?? []).map((i) => ({ key: i.id, name: i.name, note: (i.customizations ?? []).join(', '), qty: i.quantity, total: i.price != null ? fmt(i.price * i.quantity) : '' }));
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
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong14" numberOfLines={2}>{l.name}</Text>
                  {l.note ? <Text variant="caption12" tone="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{l.note}</Text> : null}
                </View>
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

        {cart?.items?.length ? (
          <View style={{ paddingHorizontal: space.gutter, marginTop: 16, gap: 8 }}>
            <Text variant="title19" style={{ paddingHorizontal: 4 }}>Offers</Text>
            {suggested && appliedCoupon !== suggested ? (
              <CouponCard
                code={suggested}
                title={`Swiggy's best coupon: ${suggested}`}
                note="Suggested for this cart"
                state={applying === suggested ? 'applying' : 'idle'}
                onApply={() => void handleApplyCoupon(suggested)}
              />
            ) : null}
            {coupons.map((cp) => (
              <CouponCard
                key={cp.couponCode}
                code={cp.couponCode}
                title={cp.title || cp.couponCode}
                ribbon={cp.ribbonText}
                note={[cp.subtitle, cp.description].filter(Boolean).join(' · ')}
                terms={cp.terms}
                state={appliedCoupon === cp.couponCode ? 'applied' : applying === cp.couponCode ? 'applying' : cp.applicable === false ? 'blocked' : 'idle'}
                onApply={() => void handleApplyCoupon(cp.couponCode)}
              />
            ))}
            {appliedCoupon && !coupons.some((cp) => cp.couponCode === appliedCoupon) ? (
              <CouponCard code={appliedCoupon} title={appliedCoupon} state="applied" onApply={() => undefined} />
            ) : null}
            <Surface kind="tint" radius={18} style={{ padding: 6, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="sell" size={18} tone="ink2" />
              <TextInput
                value={couponInput}
                onChangeText={(t) => {
                  setCouponInput(t);
                  setCouponError(null);
                }}
                placeholder="Have a coupon code?"
                placeholderTextColor={c.ink2}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void handleApplyCoupon(couponInput)}
                accessibilityLabel="Coupon code"
                style={{ flex: 1, height: 40, fontSize: 14, fontFamily: 'Geist_500Medium', color: c.ink }}
              />
              <Button
                label="Apply"
                size="sm"
                variant="outline"
                loading={!!applying && applying === cleanCouponCode(couponInput)}
                disabled={!cleanCouponCode(couponInput) || !!applying}
                onPress={() => void handleApplyCoupon(couponInput)}
              />
            </Surface>
            {couponError ? (
              <Text variant="caption12" tone="accText" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 4 }}>{couponError}</Text>
            ) : null}
            <Text variant="micro12" tone="ink2" style={{ paddingHorizontal: 4 }}>
              {coupons.length || suggested
                ? 'Swiggy shares its cash-on-delivery coupons with partner apps. Bank and card offers stay in the Swiggy app.'
                : 'No Swiggy coupons for this cart right now. Swiggy shares only its cash-on-delivery coupons with partner apps, so most codes from the Swiggy app work only there.'}
            </Text>
          </View>
        ) : null}

        <Surface kind="solid" radius={24} style={{ marginHorizontal: space.gutter, marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 9 }}>
          <BillRow label="Item total" value={fmt(subtotal)} />
          <BillRow label="Delivery" value={waived > 0 ? 'Free' : deliveryTxt} was={waived > 0 ? fmt(waived) : undefined} accent={waived > 0} />
          {taxes > 0 ? <BillRow label="Taxes & charges" value={fmt(taxes)} /> : null}
          {discount > 0 ? <BillRow label={`Coupon (${cart?.couponCode ?? appliedCoupon})`} value={`−${fmt(discount)}`} accent /> : null}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 3 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong16">To pay</Text>
            <Text variant="bodyStrong16">{fmt(total)}</Text>
          </View>
          {savings > 0 ? (
            <Surface kind="accentSoft" radius={12} style={{ paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 }}>
              <Text variant="caption13" tone="accText">{`You save ${fmt(savings)} on this order`}</Text>
            </Surface>
          ) : null}
        </Surface>

        {paymentOptions.length > 0 ? (
          <>
            <Text variant="bodyStrong15" style={{ paddingHorizontal: space.page, paddingTop: 22, paddingBottom: 10 }}>Pay with</Text>
            <View style={{ paddingHorizontal: space.gutter, gap: 8 }}>
              {paymentOptions.map((o) => (
                <Pressable key={o.id} disabled={placing} onPress={() => setPaymentId(o.id)} accessibilityRole="radio" accessibilityState={{ selected: paymentId === o.id }}>
                  <Surface radius={18} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {o.iconUrl ? (
                      <Image source={{ uri: o.iconUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} accessibilityIgnoresInvertColors />
                    ) : (
                      <Icon name={PAY_ICONS[o.kind]} size={22} tone="ink2" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong14">{o.label}</Text>
                      {o.kind === 'upi_qr' ? <Text variant="caption12" tone="ink2" style={{ marginTop: 2 }}>Scan a QR with any UPI app</Text> : null}
                    </View>
                    <Radio selected={paymentId === o.id} />
                  </Surface>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {upi ? (
          <Surface kind="accentSoft" radius={18} style={{ marginHorizontal: space.gutter, marginTop: 12, padding: 14, gap: 10 }} accessibilityLiveRegion="polite">
            <Text variant="bodyStrong14">{`Waiting for your payment in ${upi.label}`}</Text>
            <Text variant="caption12" tone="ink2">Your order is placed once Swiggy confirms the payment. Keep this screen open.</Text>
            <Pressable onPress={() => void openUpiPayment(upi.payment)} accessibilityRole="button" hitSlop={8}>
              <Text variant="button13" tone="accText">{Platform.OS === 'web' || upi.payment.isQrFlow ? 'Open the payment page again' : 'Open the UPI app again'}</Text>
            </Pressable>
          </Surface>
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
            label={upi ? 'Waiting for payment…' : `${paymentOptions.find((o) => o.id === paymentId)?.kind?.startsWith('upi') ? 'Pay' : 'Place order'} · ${fmt(total)}`}
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

function BillRow({ label, value, accent, was }: { label: string; value: string; accent?: boolean; was?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="body13" tone="ink2">{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
        {was ? <Text variant="caption13" tone="ink2" style={{ textDecorationLine: 'line-through' }}>{was}</Text> : null}
        <Text variant="bodyStrong14" style={{ fontSize: 13.5 }} tone={accent ? 'accText' : 'ink'}>{value}</Text>
      </View>
    </View>
  );
}

/** A pasted code without spaces, line breaks or invisible characters, upper-cased. */
function cleanCouponCode(raw: string): string {
  return raw.normalize('NFKC').replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, '').toUpperCase();
}

function CouponCard({ code, title, ribbon, note, terms, state, onApply }: {
  code: string;
  title: string;
  ribbon?: string | null;
  note?: string;
  terms?: string[];
  state: 'idle' | 'applying' | 'applied' | 'blocked';
  onApply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const on = state === 'applied';
  return (
    <Surface kind={on ? 'accentSoft' : 'glass'} radius={18} style={{ paddingVertical: 12, paddingHorizontal: 14, opacity: state === 'blocked' ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Icon name="sell" size={20} tone="accText" />
        <View style={{ flex: 1 }}>
          {ribbon ? <Text variant="micro11" tone="accText">{ribbon}</Text> : null}
          <Text variant="bodyStrong14" tone={on ? 'accText' : 'ink'}>{on ? `${code} applied` : title}</Text>
          {title !== code && !on ? <Text variant="micro12" tone="ink2" style={{ marginTop: 1 }}>{`Code ${code}`}</Text> : null}
          {note ? <Text variant="caption12" tone="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{note}</Text> : null}
        </View>
        {on ? (
          <Icon name="check_circle" size={20} tone="accText" filled />
        ) : state === 'blocked' ? (
          <Text variant="micro12" tone="ink2">Not yet</Text>
        ) : (
          <Button label="Apply" size="sm" variant="ghost" loading={state === 'applying'} onPress={onApply} accessibilityLabel={`Apply coupon ${code}`} />
        )}
      </View>
      {terms?.length ? (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ marginTop: 6, marginLeft: 30 }}>
          <Text variant="micro12" tone="accText">{open ? 'Hide terms' : 'Terms'}</Text>
          {open ? terms.map((t, i) => <Text key={i} variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{`• ${t}`}</Text>) : null}
        </Pressable>
      ) : null}
    </Surface>
  );
}
