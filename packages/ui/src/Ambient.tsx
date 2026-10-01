import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ambient, gradientPoints, type Gradient } from '@moodfood/tokens';
import { useTheme } from './theme';

const inOut = Easing.inOut(Easing.ease);

export function GradientFill({ gradient, style }: { gradient: Gradient; style?: ViewStyle }) {
  const { start, end } = gradientPoints(gradient.angle);
  return (
    <LinearGradient
      colors={gradient.colors as [string, string, ...string[]]}
      locations={gradient.locations as [number, number, ...number[]]}
      start={start}
      end={end}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  );
}

/** Soft radial blob: stands in for CSS `filter: blur()` on a solid circle. */
function SoftCircle({ size, color, opacity = 1, falloff = 0.5 }: { size: number; color: string; opacity?: number; falloff?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset={String(falloff)} stopColor={color} stopOpacity={opacity * 0.75} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

function Orb({ color, opacity, pos, period, still }: { color: string; opacity: number; pos: ViewStyle; period: number; still: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    p.value = withRepeat(withTiming(1, { duration: period, easing: inOut }), -1, true);
  }, [p, period, still]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -40 * p.value }, { translateY: 60 * p.value }, { scale: 1 + 0.15 * p.value }],
  }));
  // 340px orb + 80px blur ≈ 500px soft circle.
  return (
    <Animated.View style={[{ position: 'absolute', width: 500, height: 500 }, pos, style]}>
      <SoftCircle size={500} color={color} opacity={opacity} falloff={0.4} />
    </Animated.View>
  );
}

function RainDrop({ i, color, travel, still }: { i: number; color: string; travel: number; still: boolean }) {
  const y = useSharedValue(-140);
  const dur = (0.7 + ((i * 29) % 10) / 18) * 1000;
  const delay = (((i * 53) % 100) / 100) * 1400;
  useEffect(() => {
    if (still) return;
    y.value = withDelay(delay, withRepeat(withTiming(travel, { duration: dur, easing: Easing.linear }), -1, false));
  }, [y, dur, delay, travel, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: `${(i * 37) % 100}%`,
          width: 1.5,
          height: 44 + ((i * 13) % 40),
          opacity: 0.35 + ((i * 7) % 10) / 16,
        },
        still ? { transform: [{ translateY: ((i * 61) % 100) * (travel / 100) }] } : style,
      ]}
    >
      <LinearGradient colors={['rgba(0,0,0,0)', color]} style={{ flex: 1, borderRadius: 2 }} />
    </Animated.View>
  );
}

function Fog({ top, dark, period, still }: { top: number; dark: boolean; period: number; still: boolean }) {
  const { width } = useWindowDimensions();
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    p.value = withRepeat(withTiming(1, { duration: period, easing: inOut }), -1, true);
  }, [p, period, still]);
  const w = width * 1.6;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: w * (-0.25 + 0.45 * p.value) }] }));
  const id = useId().replace(/:/g, '');
  const c = dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.55)';
  return (
    <Animated.View style={[{ position: 'absolute', top, left: -width * 0.3, width: w, height: 200 }, style]}>
      <Svg width={w} height={200}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={c} />
            <Stop offset="0.7" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={100} rx={w / 2} ry={100} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function SunGlow({ still }: { still: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    p.value = withRepeat(withTiming(1, { duration: ambient.sunPulse / 2, easing: inOut }), -1, true);
  }, [p, still]);
  const style = useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * p.value, transform: [{ scale: 1 + 0.1 * p.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: -160, right: -140, width: 460, height: 460 }, style]}>
      <SoftCircle size={460} color="rgb(255,214,120)" opacity={0.75} falloff={0.3} />
    </Animated.View>
  );
}

function Lightning() {
  const o = useSharedValue(0);
  useEffect(() => {
    const t = ambient.lightning;
    // 0–90% dark, flash at 91%, again at 94.5%.
    o.value = withRepeat(
      withSequence(
        withTiming(0, { duration: t * 0.9 }),
        withTiming(0.45, { duration: t * 0.01 }),
        withTiming(0, { duration: t * 0.02 }),
        withTiming(0.3, { duration: t * 0.015 }),
        withTiming(0, { duration: t * 0.015 }),
        withTiming(0, { duration: t * 0.04 }),
      ),
      -1,
      false,
    );
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgb(200,210,255)' }, style]} />;
}

/**
 * The living backdrop: time-of-day gradient, two drifting colour orbs, and a
 * weather layer. Animations stop when the OS "reduce motion" setting is on.
 */
export function AmbientBackground({ animate = true }: { animate?: boolean }) {
  const { backdrop, weather, dark } = useTheme();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const still = reduced || !animate;
  const rainColor = dark ? 'rgba(210,225,255,0.5)' : 'rgba(60,85,125,0.4)';
  const drops = useMemo(() => Array.from({ length: ambient.rainDrops }, (_, i) => i), []);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <GradientFill gradient={backdrop.gradient} />
      <Orb color={backdrop.orbs[0]} opacity={backdrop.orbOpacity} pos={{ top: -170, right: -190 }} period={ambient.orbDrift[0]} still={still} />
      <Orb color={backdrop.orbs[1]} opacity={backdrop.orbOpacity} pos={{ bottom: -140, left: -220 }} period={ambient.orbDrift[1]} still={still} />
      {backdrop.overlay ? <GradientFill gradient={backdrop.overlay} /> : null}
      {weather === 'sunny' ? <SunGlow still={still} /> : null}
      {weather === 'cloudy' ? (
        <>
          <Fog top={140} dark={dark} period={ambient.fog[0]} still={still} />
          <Fog top={470} dark={dark} period={ambient.fog[1]} still={still} />
        </>
      ) : null}
      {weather === 'rainy' || weather === 'stormy'
        ? drops.map((i) => <RainDrop key={i} i={i} color={rainColor} travel={height + 76} still={still} />)
        : null}
      {weather === 'stormy' && !still ? <Lightning /> : null}
    </View>
  );
}

/** Glowing, pulsing orb that visualises the current mood. */
export function MoodOrb({ size = 62 }: { size?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(withTiming(1, { duration: ambient.orbPulse / 2, easing: inOut }), -1, true);
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * p.value, transform: [{ scale: 1 + 0.1 * p.value }] }));
  const id = useId().replace(/:/g, '');
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, boxShadow: `0px 0px ${size * 0.65}px ${colors.accSoft}` }, style]}
      accessible={false}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="35%" cy="30%" r="75%" fx="35%" fy="30%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} />
            <Stop offset="0.45" stopColor={colors.acc} />
            <Stop offset="1" stopColor={colors.acc2} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} rx={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
