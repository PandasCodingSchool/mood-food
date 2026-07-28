import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Image, Modal, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../src/constants/theme';
import { dishEmoji, dishGradient, resolveDishImage } from '../../src/utils/dishVisuals';
import type { DeliveryApp } from '../../src/constants/deliveryApps';
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
  updateCart,
  fetchCoupons,
  applyCoupon,
  placeOrder,
  type CartState,
  type Coupon,
} from '../../src/services/swiggyOrder';

export default function OrderConfirmScreen() {
  const router = useRouter();
  const { rec: rawRec, rank: rawRank, app: rawApp } = useLocalSearchParams<{
    rec: string;
    rank?: string;
    app: string;
  }>();
  const [imageFailed, setImageFailed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const rec: Recommendation = JSON.parse(rawRec);
  const rank = Number(rawRank || 0);
  const app: DeliveryApp = JSON.parse(rawApp);
  const emoji = dishEmoji(rec);
  const imageUrl = !imageFailed ? resolveDishImage(rec) : null;
  const gradient = dishGradient(rank);

  // A "live" order goes through the real Swiggy MCP tools (cart/coupon/place).
  // Anything else (demo delivery apps, or an unmatched dish) keeps the
  // existing local-only "confirm" flow unchanged.
  const restaurantId = rec.swiggy?.item?.restaurant_id ?? rec.swiggy?.restaurant?.id ?? null;
  const menuItemId = rec.swiggy?.item?.id ?? null;
  const isLiveOrder = !!(app.isLive && rec.swiggy?.matched && restaurantId && menuItemId);

  const [addresses, setAddresses] = useState<SwiggyAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
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
      if (!restaurantId || !menuItemId) return;
      setCartLoading(true);
      setOrderError(null);
      const result = await updateCart(restaurantId, addrId, menuItemId, 1, app.restaurantName);
      setCart(result);
      setCapExceeded((result.total ?? 0) >= 1000);
      if (result.availablePaymentMethods.length > 0) setPaymentMethod(result.availablePaymentMethods[0]);
      if (result.addressRequired) setOrderError('We need a delivery address to continue.');
      else if (!result.success && result.error) setOrderError(result.error);
      setCartLoading(false);
    },
    [restaurantId, menuItemId, app.restaurantName],
  );

  useEffect(() => {
    if (!isLiveOrder) return;
    (async () => {
      const list = await fetchAddresses();
      setAddresses(list);
      let addrId = await getSavedAddressId();
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

  // --- Fake / demo-app path (unchanged from before) ---
  const priceNum = rec.practical_details?.estimated_price ?? 250;
  const delivFee = app.feeAmount;
  const discount = priceNum * 0.15;
  const fakeTotal = priceNum + delivFee - discount;

  // --- Live totals ---
  const liveSubtotal = cart?.subtotal ?? priceNum;
  const liveDelivery = cart?.deliveryCharges ?? 0;
  const liveDiscount = cart?.couponDiscount ?? 0;
  const liveTotal = cart?.total ?? liveSubtotal + liveDelivery - liveDiscount;

  const total = isLiveOrder ? liveTotal : fakeTotal;

  const handleOpenInSwiggyApp = async () => {
    await openSwiggyApp(restaurantId || undefined, rec.dish.name);
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
      try {
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
          swiggyOrderId: result.orderId || undefined,
          restaurantId: restaurantId || undefined,
          menuItemId: menuItemId || undefined,
          addressId,
        });
      } catch {
        // silent — order nav proceeds regardless
      }
      void logSignal('order', { dish_id: rec.dish.id, dish_name: rec.dish.name, price: Math.round(total) });
      if (rec.is_wildcard) {
        void logSignal('wildcard_verdict', { accepted: true });
        void bumpQuestProgress('adventure_score');
      }
      void bumpQuestProgress('try_3_cuisines');
      router.push({
        pathname: '/order/success',
        params: { rec: rawRec, appName: app.name, total: total.toFixed(0), orderId: result.orderId || '' },
      });
      setPlacing(false);
      return;
    }

    // Fake / demo-app path — unchanged.
    try {
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
      });
    } catch {
      // silent — order nav proceeds regardless
    }
    void logSignal('order', { dish_id: rec.dish.id, dish_name: rec.dish.name, price: Math.round(total) });
    if (rec.is_wildcard) {
      void logSignal('wildcard_verdict', { accepted: true });
      void bumpQuestProgress('adventure_score');
    }
    void bumpQuestProgress('try_3_cuisines');
    router.push({
      pathname: '/order/success',
      params: { rec: rawRec, appName: app.name, total: total.toFixed(0) },
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
            {app.isLive && app.restaurantName && (
              <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 1 }]} numberOfLines={1}>{app.restaurantName}</Text>
            )}
          </View>
        </View>

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
