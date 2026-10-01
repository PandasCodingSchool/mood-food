// 2.0 Order tracking. Polls Swiggy track_food_order (never faster than 10s)
// until delivered/cancelled; the timeline is the real status changes we saw.
// Swiggy MCP gives no rider identity or GPS, so the map is an illustrative
// route and the rider moves by order stage, not live location.
// Params: orderId? (defaults to the saved active order).
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { WEATHER_SPECS, palette, space } from '@moodfood/tokens';
import { Button, Icon, IconButton, Screen, Surface, Text, useTheme, useToast, type IconName } from '@moodfood/ui';
import { ChoiceChip } from '../../src/components/v2/GameKit';
import { LoadingBlock } from '../../src/components/v2';
import { useLiveMood } from '../../src/context/LiveMood';
import { clearActiveOrder, getActiveOrder, isTerminal, saveActiveOrder, stepFromStatus, type ActiveOrder, type TrackStep } from '../../src/services/activeOrder';
import { fetchPendingPredictions, resolvePrediction } from '../../src/services/signals';
import { trackOrder } from '../../src/services/swiggyOrder';

const TRACK_POLL_MS = 10000;
const SWIGGY_SUPPORT_NUMBER = '080-67466729';
const MAP_W = 390;
const MAP_H = 400;
const ROUTE: Array<[number, number]> = [[90, 300], [90, 232], [196, 232], [196, 170], [300, 170], [300, 150], [320, 150]];

const STEP_COPY: Record<TrackStep, { head: string; sub: string; icon: IconName }> = {
  placed: { head: 'Order confirmed', sub: 'The restaurant has your order.', icon: 'check_circle' },
  preparing: { head: "Kitchen's on it", sub: 'Your food is being cooked fresh.', icon: 'skillet' },
  on_the_way: { head: 'On the way', sub: 'Your rider has picked it up.', icon: 'two_wheeler' },
  delivered: { head: 'Delivered', sub: 'Enjoy. Tell us how it felt.', icon: 'celebration' },
  cancelled: { head: 'Order cancelled', sub: 'This order was cancelled or couldn’t be completed.', icon: 'close' },
};
const ORDER: TrackStep[] = ['placed', 'preparing', 'on_the_way', 'delivered'];
const SEGMENTS: Array<[TrackStep, string]> = [['placed', 'Confirmed'], ['preparing', 'Cooking'], ['on_the_way', 'On the way'], ['delivered', 'Delivered']];
const FEEL: Array<[string, number]> = [['Better', 5], ['Same', 3], ['Food coma', 3], ['Still hungry', 2]];

/** Point at fraction t along the route polyline. */
function along(t: number) {
  const lens = ROUTE.slice(1).map((p, i) => Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]));
  let d = Math.max(0, Math.min(1, t)) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) {
      const k = lens[i] ? d / lens[i] : 0;
      return { x: ROUTE[i][0] + (ROUTE[i + 1][0] - ROUTE[i][0]) * k, y: ROUTE[i][1] + (ROUTE[i + 1][1] - ROUTE[i][1]) * k, i };
    }
    d -= lens[i];
  }
  const e = ROUTE[ROUTE.length - 1];
  return { x: e[0], y: e[1], i: lens.length - 1 };
}

const minutesIn = (eta?: string | null) => {
  const m = eta?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min <= 0 ? 'Now' : `${min} min ago`;
};

export default function OrderTrackScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors, dark } = useTheme();
  const { weather, temperature } = useLiveMood();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [trackError, setTrackError] = useState(false);
  const [feel, setFeel] = useState<string | null>(null);
  const [, tick] = useState(0);
  const orderRef = useRef<ActiveOrder | null>(null);

  useEffect(() => {
    getActiveOrder().then((o) => {
      const match = o && (!params.orderId || o.orderId === params.orderId) ? o : null;
      const resolved =
        match ??
        (params.orderId
          ? { orderId: params.orderId, restaurant: 'Swiggy', items: [], total: '', placedAt: new Date().toISOString(), step: 'placed' as TrackStep, events: [{ step: 'placed' as TrackStep, at: new Date().toISOString() }] }
          : null);
      orderRef.current = resolved;
      setOrder(resolved);
      setLoaded(true);
    });
  }, [params.orderId]);

  // Poll until a terminal state (same cadence/limits as v1).
  useEffect(() => {
    if (!order || isTerminal(order.step)) return;
    let cancelled = false;
    let fails = 0;
    const poll = async () => {
      const res = await trackOrder(order.orderId).catch(() => ({ success: false }) as Awaited<ReturnType<typeof trackOrder>>);
      if (cancelled) return;
      if (!res.success) {
        fails += 1;
        if (fails >= 3) setTrackError(true);
        return;
      }
      fails = 0;
      setTrackError(false);
      const cur = orderRef.current!;
      const step = stepFromStatus(res.status);
      const changed = step !== cur.step;
      const next: ActiveOrder = {
        ...cur,
        step,
        liveEta: res.eta ?? cur.liveEta,
        events: changed ? [...cur.events, { step, status: res.status ?? null, at: new Date().toISOString() }] : cur.events,
      };
      orderRef.current = next;
      setOrder(next);
      void saveActiveOrder(next);
    };
    void poll();
    const id = setInterval(poll, TRACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderId, order && isTerminal(order.step)]);

  // Re-render every 30s so "x min ago" and the rider position stay fresh.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Rider position along the illustrative route, by stage.
  const step = order?.step ?? 'placed';
  const onWayAt = order?.events.find((e) => e.step === 'on_the_way')?.at;
  const etaMin = minutesIn(order?.liveEta ?? order?.eta);
  let t = 0;
  if (step === 'on_the_way') {
    const elapsed = onWayAt ? (Date.now() - new Date(onWayAt).getTime()) / 60000 : 0;
    t = etaMin ? Math.min(0.92, elapsed / (elapsed + Math.max(1, etaMin))) : 0.5;
  } else if (step === 'delivered') t = 1;
  const rider = along(t);
  const rx = useSharedValue(rider.x);
  const ry = useSharedValue(rider.y);
  useEffect(() => {
    rx.value = withTiming(rider.x, { duration: 900, easing: Easing.inOut(Easing.ease) });
    ry.value = withTiming(rider.y, { duration: 900, easing: Easing.inOut(Easing.ease) });
  }, [rider.x, rider.y, rx, ry]);
  const riderStyle = useAnimatedStyle(() => ({ left: `${((rx.value - 22) / MAP_W) * 100}%`, top: ry.value - 22 }));

  if (!loaded) return <LoadingBlock label="Finding your order" style={{ flex: 1 }} />;
  if (!order) {
    return (
      <Screen>
        <View style={{ padding: 40, alignItems: 'center', gap: 14 }}>
          <Text variant="bodyStrong16">No live order right now</Text>
          <Button label="Back home" variant="glass" size="md" onPress={() => router.replace('/home')} />
        </View>
      </Screen>
    );
  }

  const copy = STEP_COPY[step];
  const stepIdx = ORDER.indexOf(step);
  const doneRoute = t > 0 ? [...ROUTE.slice(0, rider.i + 1), [rider.x, rider.y]].map((p) => p.join(',')).join(' ') : '';
  // Swiggy's live ETA is already the time remaining; show it as given.
  const remaining = etaMin != null && !isTerminal(step) ? etaMin : null;
  const w = WEATHER_SPECS[weather];

  const rate = async (label: string, score: number) => {
    setFeel(label);
    const pending = await fetchPendingPredictions();
    const match = pending.find((p) => (order.dishId && p.dishId === order.dishId) || (order.dishName && p.dishName === order.dishName));
    if (match) await resolvePrediction(match.id, { actualScore: score });
    toast("Logged. Tomorrow's picks just got smarter.");
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen edgeToEdge>
        {/* Illustrative map */}
        <View style={{ height: MAP_H, overflow: 'hidden', backgroundColor: colors.solid }} accessibilityLabel={`Illustrative delivery route. ${copy.head}.`}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * 64, height: 3, backgroundColor: colors.tint }} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((i * 72) / MAP_W) * 100}%`, width: 3, backgroundColor: colors.tint }} />
          ))}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 228, height: 9, backgroundColor: colors.track, opacity: 0.6 }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${(192 / MAP_W) * 100}%`, width: 9, backgroundColor: colors.track, opacity: 0.6 }} />
          <Svg width="100%" height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
            <Polyline points={ROUTE.map((p) => p.join(',')).join(' ')} fill="none" stroke={colors.ink2} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" opacity={0.6} />
            {doneRoute ? <Polyline points={doneRoute} fill="none" stroke={colors.acc} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
          <View style={{ position: 'absolute', left: `${(68 / MAP_W) * 100}%`, top: 278, width: 44, height: 44, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="restaurant" size={22} color={colors.solid} />
          </View>
          <View style={{ position: 'absolute', left: `${(296 / MAP_W) * 100}%`, top: 126, width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: colors.acc, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="home" size={22} tone="accText" filled />
          </View>
          {step === 'on_the_way' || step === 'delivered' ? (
            <Animated.View style={[{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center', zIndex: 3, boxShadow: `0px 0px 0px 8px ${colors.accSoft}` }, riderStyle]}>
              <Icon name="two_wheeler" size={24} color={colors.onAcc} />
            </Animated.View>
          ) : null}
          <Text variant="labelSmall" tone="ink2" style={{ position: 'absolute', right: 14, bottom: 52, fontSize: 9, opacity: 0.8 }}>Route is illustrative</Text>
          <View style={{ position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton icon="arrow_back" label="Back" variant="glass" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={{ backgroundColor: colors.surf2 }} />
            {!isTerminal(step) ? (
              <View style={{ marginLeft: 'auto', height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: trackError ? palette.danger : palette.success }} />
                <Text variant="button13" style={{ fontSize: 12.5 }}>{trackError ? 'Reconnecting' : 'Live'}</Text>
              </View>
            ) : (
              <View style={{ marginLeft: 'auto' }} />
            )}
            <View style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={w.icon as IconName} size={17} />
              <Text variant="caption12" style={{ fontFamily: 'Geist_500Medium' }}>{temperature != null ? `${w.label} · ${Math.round(temperature)}°` : w.label}</Text>
            </View>
          </View>
        </View>

        <Surface kind="solid" bordered radius={30} style={{ marginTop: -40, marginHorizontal: 12, paddingVertical: 20, paddingHorizontal: 18, boxShadow: '0px -10px 40px -20px rgba(0,0,0,0.45)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" tone="ink2" numberOfLines={1}>{`${order.restaurant} · #${order.orderId.slice(-6)}`}</Text>
              <Text variant="display28" style={{ marginTop: 6 }} accessibilityRole="header" accessibilityLiveRegion="polite">{copy.head}</Text>
              <Text variant="body13" tone="ink2" style={{ marginTop: 6 }}>{trackError && !isTerminal(step) ? 'Live tracking is unavailable right now. We’ll keep trying.' : copy.sub}</Text>
            </View>
            {remaining != null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="display44" style={{ fontSize: 46, lineHeight: 46 }} tone="accText">{String(remaining)}</Text>
                <Text variant="micro12" tone="ink2">min away</Text>
              </View>
            ) : step === 'delivered' ? (
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={32} color={colors.onAcc} />
              </View>
            ) : null}
          </View>

          {step !== 'cancelled' ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 18 }}>
              {SEGMENTS.map(([s, label], i) => (
                <View key={s} style={{ flex: 1, gap: 8 }} accessibilityLabel={`${label}${i <= stepIdx ? ', done' : ''}`}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= stepIdx ? colors.acc : colors.track }} />
                  <Text variant="micro11" style={{ fontFamily: 'Geist_600SemiBold' }} tone={i <= stepIdx ? 'ink' : 'ink2'} numberOfLines={1}>{label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Button label="Call Swiggy support" iconLeft="call" variant="glass" size="md" style={{ marginTop: 16, alignSelf: 'flex-start' }} onPress={() => Linking.openURL(`tel:${SWIGGY_SUPPORT_NUMBER.replace(/[^0-9]/g, '')}`)} />
          )}

          {step === 'delivered' ? (
            <Surface kind="accentSoft" radius={22} padding={16} style={{ marginTop: 18, gap: 12 }}>
              <Text variant="bodyStrong15">How do you feel now?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {FEEL.map(([label, score]) => (
                  <View key={label} style={{ flexBasis: '47%', flexGrow: 1 }}>
                    <ChoiceChip label={label} on={feel === label} onPress={() => void rate(label, score)} />
                  </View>
                ))}
              </View>
            </Surface>
          ) : null}

          <View style={{ marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="bodyStrong15">Live updates</Text>
            <Text variant="micro12" tone="ink2">Checks every 10 seconds</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            {order.events.slice().reverse().map((e, i, arr) => {
              const c = STEP_COPY[e.step];
              const first = i === 0;
              return (
                <View key={`${e.step}-${e.at}`} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: first ? colors.acc : colors.tint, boxShadow: first ? `0px 0px 0px 5px ${colors.accSoft}` : undefined }}>
                      <Icon name={c.icon} size={17} color={first ? colors.onAcc : colors.ink2} />
                    </View>
                    {i < arr.length - 1 ? <View style={{ flex: 1, width: 2, minHeight: 12, backgroundColor: colors.line, marginVertical: 4 }} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, paddingTop: 5, paddingBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text variant="bodyStrong14">{c.head}</Text>
                      <Text variant="micro12" tone="ink2">{ago(e.at)}</Text>
                    </View>
                    {e.status ? <Text variant="caption13" tone="ink2" style={{ marginTop: 3 }}>{e.status}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>

          {order.items.length || order.total ? (
            <Surface kind="tint" radius={20} padding={14} style={{ marginTop: 4, gap: 8 }}>
              <Text variant="bodyStrong14">{order.restaurant}</Text>
              {order.items.map((it) => (
                <View key={it.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text variant="body13" tone="ink2" style={{ flex: 1 }}>{it.label}</Text>
                  <Text variant="body13">{it.total}</Text>
                </View>
              ))}
              {order.total ? (
                <>
                  <View style={{ height: 1, backgroundColor: colors.line }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong14">Total</Text>
                    <Text variant="bodyStrong14">{order.total}</Text>
                  </View>
                </>
              ) : null}
            </Surface>
          ) : null}

          {isTerminal(step) ? (
            <Pressable
              onPress={async () => {
                await clearActiveOrder();
                router.replace('/home');
              }}
              accessibilityRole="button"
              style={{ marginTop: 14, height: 44, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="caption13" tone="ink2">Done, back home</Text>
            </Pressable>
          ) : null}
        </Surface>
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}
