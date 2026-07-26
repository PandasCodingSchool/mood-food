import { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, PartyPopper, Sparkles, Gift, Truck, Package, Clock, Home, History } from 'lucide-react-native';
import { DELIVERY_APPS, swiggyDeliveryOption, type AppIcon, type DeliveryApp } from '../../src/constants/deliveryApps';
import { useTheme } from '../../src/context/ThemeContext';
import { fw, colors } from '../../src/constants/theme';
import { bounceIn, floatLoop, pulseLoop } from '../../src/utils/animations';
import type { Recommendation } from '../../src/types';

function CelebrationIcon({ Icon, size, color, style, duration }: { Icon: AppIcon; size: number; color: string; style: object; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = floatLoop(translateY, 8, duration);
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[{ position: 'absolute' }, style, { transform: [{ translateY }] }]}>
      <Icon size={size} color={color} />
    </Animated.View>
  );
}

export default function OrderSuccessScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { rec: rawRec, appName, total } = useLocalSearchParams<{ rec: string; appName: string; total: string }>();
  const rec: Recommendation = JSON.parse(rawRec);
  const app: DeliveryApp = useMemo(() => {
    const liveOption = swiggyDeliveryOption(rec);
    if (liveOption && liveOption.name === appName) return liveOption;
    return DELIVERY_APPS.find((a) => a.name === appName) ?? DELIVERY_APPS[0];
  }, [appName, rec]);
  const AppIcon = app.icon;
  const orderNum = useMemo(() => Math.floor(1000 + Math.random() * 9000).toString(), []);

  const checkScale = useRef(new Animated.Value(0.3)).current;
  const pulseDot = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    bounceIn(checkScale);
    const loop = pulseLoop(pulseDot, 1.4, 750);
    return () => loop.stop();
  }, []);

  return (
    <LinearGradient colors={[theme.bg, theme.surface, theme.surface]} style={{ flex: 1 }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
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
              <Check size={60} color="#fff" />
            </LinearGradient>
          </Animated.View>
          <CelebrationIcon Icon={PartyPopper} size={24} color={colors.orange} duration={2000} style={{ top: -20, left: -20 }} />
          <CelebrationIcon Icon={Sparkles} size={20} color={colors.purple} duration={2500} style={{ top: -10, right: -25 }} />
          <CelebrationIcon Icon={Gift} size={18} color={colors.rose} duration={2200} style={{ bottom: -15, left: -15 }} />
        </View>

        <Text style={[fw(900), { fontSize: 28, color: theme.text, textAlign: 'center', marginTop: 32 }]}>Order Confirmed!</Text>
        <Text style={[fw(600), { fontSize: 14, color: theme.subtext, textAlign: 'center', marginTop: 8, maxWidth: 260, lineHeight: 20 }]}>
          Your {rec.dish.name} is on its way. Sit tight!
        </Text>

        <View style={{ width: '100%', marginTop: 32, padding: 20, borderRadius: 20, backgroundColor: theme.card, shadowColor: theme.shadow, shadowOpacity: 0.12, shadowRadius: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: app.bg, alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon size={22} color={theme.text} />
            </View>
            <View>
              <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>
                {app.name}{app.isLive && app.restaurantName ? ` · ${app.restaurantName}` : ''}
              </Text>
              <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]}>Order #MF-{orderNum}</Text>
            </View>
          </View>

          <ProgressStep Icon={Check} iconBg={colors.green} label="Order placed" labelColor={theme.text} lineColor={colors.green} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', transform: [{ scale: pulseDot }] }} />
            </View>
            <Text style={[fw(700), { fontSize: 13, color: theme.text }]}>Preparing your food</Text>
          </View>
          <View style={{ width: 2, height: 20, backgroundColor: theme.border, marginLeft: 13 }} />
          <ProgressStep Icon={Truck} iconBg={theme.surface} label="On its way" labelColor={theme.subtext} lineColor={theme.border} muted />
          <ProgressStep Icon={Package} iconBg={theme.surface} label="Delivered" labelColor={theme.subtext} muted last />

          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.orange + '0F', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Clock size={20} color={colors.orange} />
            <View>
              <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>ETA: {app.eta}</Text>
              <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]}>Arriving at your door</Text>
            </View>
          </View>
        </View>

        <View style={{ width: '100%', gap: 10, marginTop: 'auto' }}>
          <TouchableOpacity onPress={() => router.push('/home')} activeOpacity={0.85}>
            <View style={{ height: 52, borderRadius: 26, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <Home size={20} color="#fff" />
              <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>Play another game</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/history')} activeOpacity={0.7}>
            <View style={{ height: 48, borderRadius: 24, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
              <History size={18} color={theme.text} />
              <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>View order history</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

function ProgressStep({
  Icon,
  iconBg,
  label,
  labelColor,
  lineColor,
  muted,
  last,
}: {
  Icon: AppIcon;
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
          <Icon size={muted ? 14 : 12} color={muted ? '#94a3b8' : '#fff'} />
        </View>
        <Text style={[fw(muted ? 600 : 700), { fontSize: 13, color: labelColor }]}>{label}</Text>
      </View>
      {!last && <View style={{ width: 2, height: 20, backgroundColor: lineColor || 'rgba(0,0,0,0.08)', marginLeft: 13 }} />}
    </View>
  );
}
