import { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeliveryApp } from '../../src/constants/deliveryApps';
import { fw, colors } from '../../src/constants/theme';
import { bounceIn, floatLoop, pulseLoop } from '../../src/utils/animations';
import type { Recommendation } from '../../src/types';

function CelebrationEmoji({ emoji, style, duration }: { emoji: string; style: object; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = floatLoop(translateY, 8, duration);
    return () => loop.stop();
  }, []);
  return <Animated.Text style={[{ position: 'absolute' }, style, { transform: [{ translateY }] }]}>{emoji}</Animated.Text>;
}

export default function OrderSuccessScreen() {
  const router = useRouter();
  const { rec: rawRec, app: rawApp, total } = useLocalSearchParams<{ rec: string; app: string; total: string }>();
  const rec: Recommendation = JSON.parse(rawRec);
  const app: DeliveryApp = JSON.parse(rawApp);
  const orderNum = useMemo(() => Math.floor(1000 + Math.random() * 9000).toString(), []);

  const checkScale = useRef(new Animated.Value(0.3)).current;
  const pulseDot = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    bounceIn(checkScale);
    const loop = pulseLoop(pulseDot, 1.4, 750);
    return () => loop.stop();
  }, []);

  return (
    <LinearGradient colors={['#f0fdf4', '#dcfce7', '#bbf7d0']} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 100, paddingHorizontal: 32, paddingBottom: 40 }}>
        <View style={{ marginTop: 20 }}>
          <Animated.View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: checkScale }],
            }}
          >
            <LinearGradient colors={['#22c55e', '#4ade80']} style={{ width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 60, color: '#fff' }}>✓</Text>
            </LinearGradient>
          </Animated.View>
          <CelebrationEmoji emoji="🎉" duration={2000} style={{ top: -20, left: -20, fontSize: 24 }} />
          <CelebrationEmoji emoji="✨" duration={2500} style={{ top: -10, right: -25, fontSize: 20 }} />
          <CelebrationEmoji emoji="🎊" duration={2200} style={{ bottom: -15, left: -15, fontSize: 18 }} />
        </View>

        <Text style={[fw(900), { fontSize: 28, color: colors.navy, textAlign: 'center', marginTop: 32 }]}>Order Confirmed!</Text>
        <Text style={[fw(600), { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, maxWidth: 260, lineHeight: 20 }]}>
          Your {rec.dish.name} is on its way. Sit tight!
        </Text>

        <View style={{ width: '100%', marginTop: 32, padding: 20, borderRadius: 20, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: app.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{app.icon}</Text>
            </View>
            <View>
              <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>
                {app.name}{app.isLive && app.restaurantName ? ` · ${app.restaurantName}` : ''}
              </Text>
              <Text style={[fw(600), { fontSize: 12, color: '#64748b' }]}>Order #MF-{orderNum}</Text>
            </View>
          </View>

          <ProgressStep icon="✓" iconBg={colors.green} label="Order placed" labelColor={colors.navy} lineColor={colors.green} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', transform: [{ scale: pulseDot }] }} />
            </View>
            <Text style={[fw(700), { fontSize: 13, color: colors.navy }]}>Preparing your food</Text>
          </View>
          <View style={{ width: 2, height: 20, backgroundColor: 'rgba(0,0,0,0.08)', marginLeft: 13 }} />
          <ProgressStep icon="🚗" iconBg="rgba(0,0,0,0.06)" label="On its way" labelColor="#94a3b8" lineColor="rgba(0,0,0,0.08)" muted />
          <ProgressStep icon="📦" iconBg="rgba(0,0,0,0.06)" label="Delivered" labelColor="#94a3b8" muted last />

          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(249,115,22,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 20 }}>🕐</Text>
            <View>
              <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>ETA: {app.eta}</Text>
              <Text style={[fw(600), { fontSize: 12, color: '#64748b' }]}>Arriving at your door</Text>
            </View>
          </View>
        </View>

        <View style={{ width: '100%', gap: 10, marginTop: 'auto' }}>
          <TouchableOpacity onPress={() => router.push('/home')} activeOpacity={0.85}>
            <View style={{ height: 52, borderRadius: 26, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>🎮 Play another game</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/history')} activeOpacity={0.7}>
            <View style={{ height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(700), { fontSize: 14, color: '#64748b' }]}>View order history</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

function ProgressStep({
  icon,
  iconBg,
  label,
  labelColor,
  lineColor,
  muted,
  last,
}: {
  icon: string;
  iconBg: string;
  label: string;
  labelColor: string;
  lineColor?: string;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[fw(900), { fontSize: muted ? 14 : 12, color: muted ? undefined : '#fff' }]}>{icon}</Text>
        </View>
        <Text style={[fw(muted ? 600 : 700), { fontSize: 13, color: labelColor }]}>{label}</Text>
      </View>
      {!last && <View style={{ width: 2, height: 20, backgroundColor: lineColor || 'rgba(0,0,0,0.08)', marginLeft: 13 }} />}
    </View>
  );
}
