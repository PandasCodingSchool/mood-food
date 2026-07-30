import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Image, Modal, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../src/constants/theme';
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

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: colors.navy, flex: 1, textAlign: 'center', marginRight: 40 }]}>
          Confirm Order
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: app.bg, alignItems: 'center', justifyContent: 'center' }}>
            <app.icon size={20} color={colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[fw(700), { fontSize: 14, color: '#64748b' }]}>Ordering via {app.name}</Text>
              {app.isLive && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.12)' }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green }} />
                  <Text style={[fw(800), { fontSize: 9, color: colors.green, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Live</Text>
                </View>
              )}
            </View>
            {app.isLive && (params.restaurantName || app.restaurantName) && (
              <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 1 }]} numberOfLines={1}>
                {params.restaurantName || app.restaurantName}
              </Text>
            )}
          </View>
        </View>

        {!cartMode && rec && (
          <View style={{ borderRadius: 20, overflow: 'hidden' }}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: 140 }}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <LinearGradient colors={dishGradient(rank)} style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 72 }}>{emoji}</Text>
              </LinearGradient>
            )}
            <View style={{ padding: 16, paddingHorizontal: 20, backgroundColor: '#fff' }}>
              <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>{rec.dish.name}</Text>
              <Text style={[fw(600), { fontSize: 13, color: '#64748b', marginTop: 4 }]}>{rec.dish.cuisine}</Text>
            </View>
          </View>
        )}

        {/* Itemized cart — the single-dish path shows its one item here too, so
            both modes render the actual cart contents, not just a total. */}
        {!cartLoading && cart && cart.items.length > 0 && (
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 10 }}>
            <Text style={[fw(700), { fontSize: 13, color: colors.navy }]}>
              🧾 {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
            </Text>
            <View style={{ gap: 8 }}>
              {cart.items.map((item) => (
                <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[fw(600), { fontSize: 13, color: colors.navy, flex: 1 }]} numberOfLines={1}>
                    {item.quantity}× {item.name}
                  </Text>
                  {item.price != null && (
                    <Text style={[fw(700), { fontSize: 13, color: '#64748b' }]}>₹{(item.price * item.quantity).toFixed(0)}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 18 }}>📍</Text>
              <Text style={[fw(700), { fontSize: 13, color: colors.navy }]}>Delivery to</Text>
            </View>
            {isLiveOrder && addresses.length > 0 && (
              <TouchableOpacity onPress={() => setAddressPickerOpen(true)}>
                <Text style={[fw(600), { fontSize: 13, color: colors.orange }]}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#fff' }}>
            <Text style={[fw(600), { fontSize: 13, color: '#64748b', lineHeight: 18 }]}>
              {isLiveOrder
                ? selectedAddress
                  ? `${selectedAddress.label}\n${selectedAddress.line}`
                  : 'Loading address…'
                : '123 Main Street, Apt 4B\nNew York, NY 10001'}
            </Text>
          </View>
        </View>

        {isLiveOrder && (
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 10 }}>
            <Text style={[fw(700), { fontSize: 13, color: colors.navy }]}>🎟️ Coupons</Text>
            {coupons.length === 0 ? (
              <Text style={[fw(600), { fontSize: 12, color: '#94a3b8' }]}>No coupons available right now.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {coupons.map((c) => (
                  <TouchableOpacity
                    key={c.couponCode}
                    onPress={() => handleApplyCoupon(c.couponCode)}
                    disabled={cartLoading}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: appliedCoupon === c.couponCode ? 'rgba(34,197,94,0.08)' : '#fff',
                      borderWidth: 2,
                      borderColor: appliedCoupon === c.couponCode ? colors.green : 'rgba(0,0,0,0.06)',
                    }}
                  >
                    <Text style={[fw(800), { fontSize: 13, color: colors.navy }]}>{c.couponCode}</Text>
                    <Text style={[fw(600), { fontSize: 11, color: '#64748b', marginTop: 2 }]}>{c.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {isLiveOrder && cart && cart.availablePaymentMethods.length > 0 && (
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 10 }}>
            <Text style={[fw(700), { fontSize: 13, color: colors.navy }]}>💳 Payment method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cart.availablePaymentMethods.map((method) => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setPaymentMethod(method)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 14,
                    backgroundColor: paymentMethod === method ? colors.navy : '#fff',
                    borderWidth: 2,
                    borderColor: paymentMethod === method ? colors.navy : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <Text style={[fw(700), { fontSize: 12, color: paymentMethod === method ? '#fff' : colors.navy }]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {!cartMode && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: 'rgba(34,197,94,0.06)', alignItems: 'center' }}>
              <Text style={{ fontSize: 24 }}>🕐</Text>
              <Text style={[fw(900), { fontSize: 18, color: colors.navy, marginTop: 4 }]}>{app.eta}</Text>
              <Text style={[fw(700), { fontSize: 11, color: '#64748b', marginTop: 2 }]}>Estimated time</Text>
            </View>
            <View style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.06)', alignItems: 'center' }}>
              <Text style={{ fontSize: 24 }}>🚗</Text>
              <Text style={[fw(900), { fontSize: 18, color: colors.navy, marginTop: 4 }]}>
                {app.distanceKm != null ? `${app.distanceKm.toFixed(1)} km` : '1.2 mi'}
              </Text>
              <Text style={[fw(700), { fontSize: 11, color: '#64748b', marginTop: 2 }]}>Distance</Text>
            </View>
          </View>
        )}

        {cartLoading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={colors.orange} />
          </View>
        ) : (
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 10 }}>
            <Row label="Subtotal" value={`₹${liveSubtotal.toFixed(0)}`} />
            <Row
              label="Delivery fee"
              value={
                isLiveOrder
                  ? liveDelivery === 0
                    ? 'Included'
                    : `₹${liveDelivery.toFixed(0)}`
                  : delivFee === 0
                    ? app.isLive
                      ? 'Included'
                      : 'Free'
                    : `₹${delivFee.toFixed(0)}`
              }
            />
            {isLiveOrder ? (
              liveDiscount > 0 && <Row label={`Coupon (${appliedCoupon})`} value={`-₹${liveDiscount.toFixed(0)}`} valueColor={colors.green} />
            ) : (
              <Row label="Promo (MOODFOOD15)" value={`-₹${discount.toFixed(0)}`} valueColor={colors.green} />
            )}
            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>Total</Text>
              <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>₹{total.toFixed(0)}</Text>
            </View>
          </View>
        )}

        {orderError && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.06)' }}>
            <Text style={[fw(600), { fontSize: 12, color: '#dc2626' }]}>{orderError}</Text>
          </View>
        )}

        {capExceeded && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(249,115,22,0.06)' }}>
            <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>
              Orders of ₹1000 or more need the Swiggy app for now (beta limit).
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40, backgroundColor: '#fff' }}>
        {capExceeded ? (
          <TouchableOpacity activeOpacity={0.85} onPress={handleOpenInSwiggyApp}>
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>Open in Swiggy app</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={placing || cartLoading || (isLiveOrder && !addressId)}
            onPress={handlePlaceOrder}
          >
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', opacity: placing || cartLoading ? 0.7 : 1 }}>
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>{placing ? 'Placing…' : `🛒 Place Order · ₹${total.toFixed(0)}`}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={addressPickerOpen} transparent animationType="slide" onRequestClose={() => setAddressPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 }}>
            <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>Choose delivery address</Text>
            {addresses.map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => handleSelectAddress(a.id)}
                style={{ padding: 14, borderRadius: 14, backgroundColor: a.id === addressId ? 'rgba(249,115,22,0.08)' : 'rgba(0,0,0,0.03)' }}
              >
                <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>{a.label}</Text>
                <Text style={[fw(600), { fontSize: 12, color: '#64748b', marginTop: 2 }]}>{a.line}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setAddressPickerOpen(false)} style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={[fw(700), { fontSize: 13, color: '#94a3b8' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[fw(600), { fontSize: 14, color: '#64748b' }]}>{label}</Text>
      <Text style={[fw(600), { fontSize: 14, color: valueColor || '#64748b' }]}>{value}</Text>
    </View>
  );
}
