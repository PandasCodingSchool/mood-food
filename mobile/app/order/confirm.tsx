import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../src/constants/theme';
import { dishEmoji, dishGradient, resolveDishImage } from '../../src/utils/dishVisuals';
import type { DeliveryApp } from '../../src/constants/deliveryApps';
import type { Recommendation } from '../../src/types';
import { saveOrder } from '../../src/services/history';

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

  const priceNum = rec.practical_details?.estimated_price ?? 250;
  const delivFee = app.feeAmount;
  const discount = priceNum * 0.15;
  const total = priceNum + delivFee - discount;
  const gradient = dishGradient(rank);

  const handlePlaceOrder = async () => {
    setPlacing(true);
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
    router.push({
      pathname: '/order/success',
      params: { rec: rawRec, app: rawApp, total: total.toFixed(0) },
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
            <Text style={{ fontSize: 20 }}>{app.icon}</Text>
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
            <Text style={[fw(600), { fontSize: 13, color: colors.orange }]}>Change</Text>
          </View>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#fff' }}>
            <Text style={[fw(600), { fontSize: 13, color: '#64748b', lineHeight: 18 }]}>
              123 Main Street, Apt 4B{'\n'}New York, NY 10001
            </Text>
          </View>
        </View>

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

        <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', gap: 10 }}>
          <Row label="Subtotal" value={`₹${priceNum.toFixed(0)}`} />
          <Row label="Delivery fee" value={delivFee === 0 ? (app.isLive ? 'Included' : 'Free') : `₹${delivFee.toFixed(0)}`} />
          <Row label="Promo (MOODFOOD15)" value={`-₹${discount.toFixed(0)}`} valueColor={colors.green} />
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>Total</Text>
            <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>₹{total.toFixed(0)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40, backgroundColor: '#fff' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={placing}
          onPress={handlePlaceOrder}
        >
          <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', opacity: placing ? 0.7 : 1 }}>
            <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>{placing ? 'Placing…' : `🛒 Place Order · ₹${total.toFixed(0)}`}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
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
