import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { DELIVERY_APPS, swiggyDeliveryOption } from '../../src/constants/deliveryApps';
import { fw, colors } from '../../src/constants/theme';
import DishThumbnail from '../../src/components/DishThumbnail';
import type { Recommendation } from '../../src/types';

export default function OrderAppSelectScreen() {
  const router = useRouter();
  const { rec: rawRec, rank: rawRank } = useLocalSearchParams<{ rec: string; rank?: string }>();
  const rec: Recommendation = JSON.parse(rawRec);
  const rank = Number(rawRank || 0);
  const liveOption = swiggyDeliveryOption(rec);
  const apps = liveOption ? [liveOption, ...DELIVERY_APPS] : DELIVERY_APPS;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>Order via</Text>
          <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 1 }]}>Choose your delivery app</Text>
        </View>
      </View>

      <LinearGradient
        colors={['#fff7ed', '#fef3c7']}
        style={{ margin: 24, marginBottom: 0, padding: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <DishThumbnail rec={rec} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[fw(800), { fontSize: 16, color: colors.navy }]} numberOfLines={1}>{rec.dish.name}</Text>
          <Text style={[fw(600), { fontSize: 13, color: '#64748b', marginTop: 2 }]}>{rec.dish.cuisine}</Text>
        </View>
        {rec.practical_details?.estimated_price != null && (
          <Text style={[fw(900), { fontSize: 18, color: colors.orange }]}>₹{rec.practical_details.estimated_price}</Text>
        )}
      </LinearGradient>

      <View style={{ padding: 24, gap: 12 }}>
        {apps.map((app) => (
          <TouchableOpacity
            key={app.name}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/order/confirm',
                params: { rec: rawRec, rank: String(rank), app: JSON.stringify(app) },
              })
            }
            style={{
              padding: 18,
              paddingHorizontal: 20,
              borderRadius: 18,
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: app.isLive ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.06)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: app.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 28 }}>{app.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[fw(800), { fontSize: 16, color: colors.navy }]}>{app.name}</Text>
                {app.isLive && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.12)' }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green }} />
                    <Text style={[fw(800), { fontSize: 9, color: colors.green, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Live</Text>
                  </View>
                )}
              </View>
              {app.isLive && app.restaurantName && (
                <Text style={[fw(600), { fontSize: 11, color: '#64748b', marginTop: 1 }]} numberOfLines={1}>
                  {app.restaurantName}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={[fw(700), { fontSize: 12, color: '#64748b' }]}>{app.eta}</Text>
                <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: '#cbd5e1' }} />
                <Text style={[fw(700), { fontSize: 12, color: '#64748b' }]}>{app.fee}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: '#94a3b8' }}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <View
          style={{
            padding: 14,
            paddingHorizontal: 18,
            borderRadius: 16,
            backgroundColor: 'rgba(124,58,237,0.05)',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(124,58,237,0.2)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 20 }}>🎟️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[fw(800), { fontSize: 13, color: colors.purple }]}>MOODFOOD15</Text>
            <Text style={[fw(600), { fontSize: 11, color: '#94a3b8', marginTop: 1 }]}>15% off your first order</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
