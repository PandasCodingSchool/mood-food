import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, View, type LayoutChangeEvent, type PressableProps, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Icon, Text, type IconName } from '@moodfood/ui';
import type { TextVariant } from '@moodfood/tokens';
import { getItem, setItem } from '../../services/secureStorage';
import { kc, KC_TAGLINE } from './brand';

const INTRO = require('../../../assets/kitchen-circle/intro.gif');
export const KC_MARK = require('../../../assets/kitchen-circle/mark.png');

// The switch spans both brands, so it keeps fixed colours from the design rather than either theme.
const SWITCH = { track: '#FDF1E5', outline: '#0F1B2D', ink: '#0F1B2D', food: '#A7511E', muted: '#5B6472' } as const;

export type AppMode = 'moodfood' | 'kitchencircle';

/**
 * MoodFood ⇄ KitchenCircle switch: “NOW” is MoodFood (what to eat right now), “PLANNED” is
 * KitchenCircle (the household week). Sits at the top of both homes.
 */
export function ModeSwitch({ value, onChange, style }: { value: AppMode; onChange: (mode: AppMode) => void; style?: ViewStyle }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(value === 'kitchencircle' ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: value === 'kitchencircle' ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [value, x]);
  const half = Math.max(0, (width - 8) / 2);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const kcOn = value === 'kitchencircle';

  const segment = (mode: AppMode, label: React.ReactNode, a11y: string) => (
    <Pressable onPress={() => mode !== value && onChange(mode)} accessibilityRole="tab" accessibilityState={{ selected: value === mode }} accessibilityLabel={a11y}
      style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
      {label}
    </Pressable>
  );

  return (
    <View style={[{ alignItems: 'center', gap: 6 }, style]}>
      <View onLayout={onLayout} accessibilityRole="tablist"
        style={{ width: '100%', maxWidth: 420, height: 52, borderRadius: 26, borderWidth: 2, borderColor: SWITCH.outline, backgroundColor: SWITCH.track, flexDirection: 'row', padding: 2 }}>
        {width ? <Animated.View style={{
          position: 'absolute', top: 2, left: 2, width: half, bottom: 2, borderRadius: 22, borderWidth: 2, borderColor: SWITCH.outline,
          backgroundColor: kcOn ? kc.curryLeaf : '#FFFFFF',
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }],
        }} /> : null}
        {segment('moodfood', <Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={SWITCH.ink}>Mood<Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={SWITCH.food}>Food</Text></Text>, 'MoodFood: what to eat now')}
        {segment('kitchencircle', <Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={kcOn ? kc.chawal : SWITCH.ink}>KitchenCircle</Text>, 'KitchenCircle: the planned household week')}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="labelSmall" color={kcOn ? SWITCH.muted : SWITCH.ink} style={{ letterSpacing: 2, fontFamily: 'Geist_700Bold' }}>NOW</Text>
        <Text variant="labelSmall" color={SWITCH.muted} style={{ letterSpacing: 2 }}>·</Text>
        <Text variant="labelSmall" color={kcOn ? kc.curryLeaf : SWITCH.muted} style={{ letterSpacing: 2, fontFamily: 'Geist_700Bold' }}>PLANNED</Text>
      </View>
    </View>
  );
}

/** “kitchencircle” wordmark with the tagline — kadhai + curry leaf, Bricolage 800. */
export function KcWordmark({ size = 34, tagline = true }: { size?: number; tagline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Image source={KC_MARK} style={{ width: size * 1.35, height: size * 1.35, borderRadius: size }} contentFit="contain" accessibilityIgnoresInvertColors />
      <View>
        <Text style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: size, lineHeight: size * 1.05, letterSpacing: -size * 0.03 }} color={kc.kadhai} accessibilityRole="header">
          kitchen<Text style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: size, letterSpacing: -size * 0.03 }} color={kc.curryLeaf}>circle</Text>
        </Text>
        {tagline ? <Text variant="labelSmall" color={kc.mutedInk} style={{ letterSpacing: 1.6, marginTop: 2 }}>{KC_TAGLINE.toUpperCase()}</Text> : null}
      </View>
    </View>
  );
}

/** Speaker glyph for read-aloud (not in the shared icon font). */
export function KcSpeakerIcon({ size = 18, color = kc.chawal }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M4 9v6h4l5 4V5L8 9H4z" fill={color} />
      <Path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Stop glyph for read-aloud. */
export function KcStopIcon({ size = 16, color = kc.kadhai }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={6} y={6} width={12} height={12} rx={2} fill={color} />
    </Svg>
  );
}

/** Microphone glyph (the shared icon font has no mic). */
export function KcMicIcon({ size = 22, color = kc.chawal }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} />
      <Path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const SEATS = 6;
const RING_R = 40;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * The brand loader as vectors (no background, sharp at any size): the curry-leaf ring turns with an opening, and the
 * haldi katoris around the table fill one after another. Holds still when the system asks for reduced motion.
 */
export function KcSpinner({ size = 64 }: { size?: number }) {
  const turn = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setStill(v)).catch(() => undefined);
    return () => { live = false; };
  }, []);
  // Spins for as long as it is on screen. Animated.loop stops after one turn on web, so each turn starts the next.
  useEffect(() => {
    if (still) return;
    let on = true;
    let current: Animated.CompositeAnimation | null = null;
    const spin = () => {
      if (!on) return;
      turn.setValue(0);
      current = Animated.timing(turn, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
      current.start(({ finished }) => { if (finished) spin(); });
    };
    spin();
    return () => { on = false; current?.stop(); };
  }, [still, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const seat = size * 0.13;
  const orbit = size * 0.22;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ position: 'absolute', inset: 0, transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={RING_R} stroke={kc.curryLeaf} strokeWidth={8} fill="none" strokeLinecap="round"
            strokeDasharray={`${RING_LEN * 0.82} ${RING_LEN * 0.18}`} />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', left: size / 2 - size * 0.09, top: size / 2 - size * 0.09, width: size * 0.18, height: size * 0.18, borderRadius: size, backgroundColor: kc.curryLeaf }} />
      {Array.from({ length: SEATS }, (_, i) => {
        const angle = (i / SEATS) * 2 * Math.PI - Math.PI / 2;
        const start = i / SEATS;
        // Each katori lights up in turn: (time, opacity) points, kept strictly increasing for interpolate.
        const points = [[0, 0.35], [start, 0.35], [start + 0.1, 1], [start + 0.45, 0.35], [1, 0.35]].filter(([x]) => x <= 1)
          .filter(([x], k, all) => k === 0 || x > all[k - 1][0]);
        const lit = still ? 1 : turn.interpolate({ inputRange: points.map(([x]) => x), outputRange: points.map(([, y]) => y), extrapolate: 'clamp' });
        return <Animated.View key={i} style={{
          position: 'absolute', width: seat, height: seat, borderRadius: seat, backgroundColor: kc.haldi, opacity: lit,
          left: size / 2 + Math.cos(angle) * orbit - seat / 2, top: size / 2 + Math.sin(angle) * orbit - seat / 2,
        }} />;
      })}
    </View>
  );
}

/** Loader with an optional caption. Vector, so it sits on any surface without a box around it. */
export function KcLoader({ label, size = 72 }: { label?: string; size?: number }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 }} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <KcSpinner size={size} />
      {label ? <Text variant="caption13" color={kc.mutedInk} style={{ textAlign: 'center' }}>{label}</Text> : null}
    </View>
  );
}

const INTRO_SEEN_KEY = 'kitchen_circle_intro_seen_v1';
const INTRO_MS = 4_800;

/** Whether the brand intro still needs to play on this device (it plays once). */
export async function shouldPlayIntro(): Promise<boolean> {
  try { return (await getItem(INTRO_SEEN_KEY)) !== '1'; } catch { return false; }
}

/** Full-screen brand intro (ring draws, seats fill, wordmark). Plays once; tap anywhere to skip. */
export function KcIntro({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    void setItem(INTRO_SEEN_KEY, '1').catch(() => undefined);
    Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(onDone);
  };
  useEffect(() => { const timer = setTimeout(finish, INTRO_MS); return () => clearTimeout(timer); });
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: kc.chawal, opacity, zIndex: 50 }}>
      <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Skip the KitchenCircle intro" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={INTRO} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="contain" autoplay accessibilityIgnoresInvertColors />
        <Text variant="caption13" color={kc.mutedInk} style={{ position: 'absolute', bottom: 48 }}>Tap to skip</Text>
      </Pressable>
    </Animated.View>
  );
}

export interface RingDay { id: string; plannedFor: string; state: string; mealTitle: string | null }

/**
 * The week as rings (brand UI language): filled when cooked, haldi for today, an outline when planned,
 * dashed when still blank.
 */
export function DayRings({ days, today, onPress }: { days: RingDay[]; today: string; onPress?: (day: RingDay) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
      {days.map((day) => {
        const label = new Date(`${day.plannedFor}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3);
        const hasMeal = day.state !== 'blank';
        const isToday = day.plannedFor === today;
        const cooked = hasMeal && day.plannedFor < today;
        const ring: ViewStyle = isToday
          ? { backgroundColor: kc.haldi }
          : cooked
            ? { backgroundColor: kc.curryLeaf }
            : hasMeal
              ? { borderWidth: 2, borderColor: kc.curryLeaf }
              : { borderWidth: 2, borderColor: kc.dashed, borderStyle: 'dashed' };
        const color = isToday ? kc.kadhai : cooked ? kc.chawal : hasMeal ? kc.curryLeaf : kc.mutedInk;
        const status = isToday ? 'today' : cooked ? 'cooked' : hasMeal ? 'planned' : 'not planned yet';
        return (
          <Pressable key={day.id} onPress={() => onPress?.(day)} accessibilityRole="button" accessibilityLabel={`${label} ${day.plannedFor}, ${status}${day.mealTitle ? `: ${day.mealTitle}` : ''}`}
            style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, ring]}>
            <Text variant="caption13" color={color} style={{ fontFamily: isToday ? 'Figtree_800ExtraBold' : 'Figtree_700Bold' }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type KcButtonVariant = 'primary' | 'glass' | 'outline' | 'ink' | 'night' | 'photo' | 'ghost';
type KcButtonSize = 'lg' | 'md' | 'sm';

export interface KcButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: KcButtonVariant;
  size?: KcButtonSize;
  iconLeft?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

// Pills throughout (brand: everything is built from circles), 48px minimum touch height.
const KC_SIZES: Record<KcButtonSize, { height: number; px: number; text: TextVariant; icon: number }> = {
  lg: { height: 52, px: 24, text: 'button16', icon: 20 },
  md: { height: 46, px: 18, text: 'button15', icon: 18 },
  sm: { height: 36, px: 14, text: 'button13', icon: 16 },
};

/**
 * KitchenCircle button — same props as the kit `Button`, drawn in the brand: flat (no glow),
 * curry-leaf primary, kadhai 1.5px outline for secondary actions.
 */
export function KcButton({ label, variant = 'primary', size = 'lg', iconLeft, iconRight, block, loading, disabled, style, ...rest }: KcButtonProps) {
  const s = KC_SIZES[size];
  const styles: Record<KcButtonVariant, { bg: string; fg: string; border?: string; width?: number }> = {
    primary: { bg: kc.curryLeaf, fg: kc.chawal },
    ink: { bg: kc.kadhai, fg: kc.chawal },
    glass: { bg: 'rgba(255,255,255,0.78)', fg: kc.kadhai, border: kc.steel, width: 1 },
    outline: { bg: 'transparent', fg: kc.kadhai, border: kc.kadhai, width: 1.5 },
    night: { bg: 'transparent', fg: kc.kadhai, border: kc.kadhai, width: 1.5 },
    photo: { bg: 'transparent', fg: kc.kadhai, border: kc.kadhai, width: 1.5 },
    ghost: { bg: 'transparent', fg: kc.curryLeaf },
  };
  const c = styles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: s.height, borderRadius: 999, paddingHorizontal: variant === 'ghost' ? 0 : s.px, backgroundColor: c.bg,
          borderWidth: c.width ?? 0, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        block ? { alignSelf: 'stretch' } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : <>
        {iconLeft ? <Icon name={iconLeft} size={s.icon} color={c.fg} /> : null}
        <Text variant={s.text} color={c.fg} numberOfLines={1} style={{ fontFamily: 'Figtree_700Bold' }}>{label}</Text>
        {iconRight ? <Icon name={iconRight} size={s.icon} color={c.fg} /> : null}
      </>}
    </Pressable>
  );
}
