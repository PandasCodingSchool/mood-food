// 2.0 Order placed. Tracking logic is v1's unchanged: real Swiggy orders poll
// track_food_order (never faster than 10s) until a terminal state; demo
// orders show a local order number. Params: rec, appName, total, orderId?.
import { useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { palette, space } from '@moodfood/tokens';
import { AmbientBackground, Button, Icon, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { DELIVERY_APPS, swiggyDeliveryOption, type DeliveryApp } from '../../src/constants/deliveryApps';
import { trackOrder } from '../../src/services/swiggyOrder';
import type { Recommendation } from '../../src/types';

// track_food_order must not be polled faster than every 10s (Swiggy MCP docs).
const TRACK_POLL_MS = 10000;
const SWIGGY_SUPPORT_NUMBER = '080-67466729';

type TrackStep = 'placed' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

function stepFromStatus(status: string | null | undefined): TrackStep {
  const s = (status || '').toLowerCase();
  if (s.includes('cancel') || s.includes('fail')) return 'cancelled';
  if (s.includes('deliver') && !s.includes('out')) return 'delivered';
  if (s.includes('way') || s.includes('transit') || s.includes('pickup') || s.includes('rider')) return 'on_the_way';
  if (s.includes('prepar') || s.includes('confirm') || s.includes('accept') || s.includes('placed')) return 'preparing';
  return 'placed';
}

export default function OrderSuccessScreen() {
  const router = useRouter();
  const { rec: rawRec, appName, total, orderId } = useLocalSearchParams<{
    rec: string;
    appName: string;
    total: string;
    orderId?: string;
  }>();
  const rec: Recommendation = JSON.parse(rawRec);
  const app: DeliveryApp = useMemo(() => {
    const liveOption = swiggyDeliveryOption(rec);
    if (liveOption && liveOption.name === appName) return liveOption;
    return DELIVERY_APPS.find((a) => a.name === appName) ?? DELIVERY_APPS[0];
  }, [appName, rec]);
  const orderNum = useMemo(() => Math.floor(1000 + Math.random() * 9000).toString(), []);

  const isRealOrder = !!orderId;
  const [step, setStep] = useState<TrackStep>('placed');
  const [liveEta, setLiveEta] = useState<string | null>(null);
  const [trackError, setTrackError] = useState(false);



  // 4.1-adjacent: real order tracking. Polls no faster than the documented
  // 10s floor and stops once the order reaches a terminal state.
  useEffect(() => {
    if (!isRealOrder || !orderId) return;
    let cancelled = false;
    let failCount = 0;

    const poll = async () => {
      const result = await trackOrder(orderId);
      if (cancelled) return;
      if (!result.success) {
        failCount += 1;
        if (failCount >= 3) setTrackError(true);
        return;
      }
      failCount = 0;
      setTrackError(false);
      setStep(stepFromStatus(result.status));
      if (result.eta) setLiveEta(result.eta);
    };

    poll();
    const interval = setInterval(poll, TRACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRealOrder, orderId]);

  const handleCallSupport = () => {
    Linking.openURL(`tel:${SWIGGY_SUPPORT_NUMBER.replace(/[^0-9]/g, '')}`);
  };

  const preparingActive = step === 'preparing' || step === 'placed';
  const onTheWayActive = step === 'on_the_way';
  const deliveredActive = step === 'delivered';

  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const cancelled = step === 'cancelled';
  const steps: Array<{ key: string; label: string; icon: IconName; on: boolean; done: boolean }> = [
    { key: 'preparing', label: 'Preparing', icon: 'skillet', on: preparingActive, done: onTheWayActive || deliveredActive },
    { key: 'on_the_way', label: 'On the way', icon: 'local_fire_department', on: onTheWayActive, done: deliveredActive },
    { key: 'delivered', label: 'Delivered', icon: 'home', on: deliveredActive, done: deliveredActive },
  ];

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AmbientBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View
          entering={ZoomIn.springify().damping(11)}
          style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: cancelled ? palette.danger : colors.acc, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 0px 0px 14px ${colors.accSoft}, 0px 30px 60px -20px ${colors.acc}` }}
        >
          <Icon name={cancelled ? 'close' : 'check'} size={60} color={cancelled ? palette.white : colors.onAcc} />
        </Animated.View>
        <Text variant="display34" align="center" style={{ marginTop: 36 }} accessibilityRole="header">
          {cancelled ? 'That didn’t go through.' : 'Good choice.'}
        </Text>
        <Text variant="body15" tone="ink2" align="center" style={{ marginTop: 10 }}>
          {cancelled
            ? 'This order was cancelled or couldn’t be tracked.'
            : `${app.isLive && app.restaurantName ? app.restaurantName : app.name} is on it. ${rec.dish.name} arrives in about ${liveEta || app.eta}.`}
        </Text>
        <Text variant="label" tone="ink2" style={{ marginTop: 14 }}>
          {`Order #${isRealOrder ? orderId : `MF-${orderNum}`} · ₹${total}`}
        </Text>

        {!cancelled ? (
          <Surface radius={22} padding={16} style={{ alignSelf: 'stretch', marginTop: 24, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {steps.map((s) => (
                <View key={s.key} style={{ alignItems: 'center', gap: 6, flex: 1 }} accessibilityLabel={`${s.label}${s.on ? ', current' : s.done ? ', done' : ''}`}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: s.on || s.done ? colors.acc : colors.track }}>
                    <Icon name={s.done && !s.on ? 'check' : s.icon} size={20} color={s.on || s.done ? colors.onAcc : colors.ink2} />
                  </View>
                  <Text variant="micro12" tone={s.on ? 'ink' : 'ink2'}>{s.label}</Text>
                </View>
              ))}
            </View>
            <Text variant="caption12" tone="ink2" align="center">
              {!isRealOrder
                ? 'Demo order: no live tracking.'
                : trackError
                  ? 'Live tracking unavailable right now'
                  : `ETA ${liveEta || app.eta} · updates every 10 seconds`}
            </Text>
          </Surface>
        ) : (
          <Button label="Call Swiggy support" iconLeft="call" variant="glass" size="md" style={{ marginTop: 24 }} onPress={handleCallSupport} />
        )}
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(36, insets.bottom + 16), gap: 10 }}>
        {isRealOrder && !cancelled ? (
          <>
            {/* Replace, so this screen's poller stops before tracking starts its own. */}
            <Button block label="Track order" iconRight="arrow_forward" onPress={() => router.replace({ pathname: '/order/track', params: { orderId: orderId! } })} />
            <Button block variant="glass" size="md" label="Back home" onPress={() => router.replace('/home')} />
          </>
        ) : (
          <>
            <Button block label="Back home" onPress={() => router.replace('/home')} />
            <Button block variant="glass" size="md" label="View my orders" onPress={() => router.push('/history')} />
          </>
        )}
      </View>
    </View>
  );
}
