import { useEffect } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { duration, easing, fontFamily, palette, shadow } from '@moodfood/tokens';
import { Icon, Text } from './Text';
import type { IconName } from './glyphs';
import { useTheme } from './theme';

const ease = Easing.bezier(...easing.enter);

/* ─────────────────────────── Chips ─────────────────────────── */

export interface ChipProps {
  label: string;
  /** accent = match badges; soft = context tags; glass = quick filters; photo = over imagery. */
  variant?: 'accent' | 'soft' | 'glass' | 'solid' | 'photo' | 'outline' | 'night';
  icon?: IconName;
  size?: 'md' | 'sm';
  style?: ViewStyle;
}

export function Chip({ label, variant = 'soft', icon, size = 'md', style }: ChipProps) {
  const { colors } = useTheme();
  const v = {
    accent: { bg: colors.acc, fg: colors.onAcc },
    soft: { bg: colors.accSoft, fg: colors.accText },
    glass: { bg: colors.surf, fg: colors.ink, border: colors.line },
    solid: { bg: colors.solid, fg: colors.ink },
    photo: { bg: palette.photoGlassStrong, fg: palette.white },
    outline: { bg: 'transparent', fg: colors.ink, border: colors.line },
    night: { bg: palette.night, fg: palette.white },
  }[variant];
  const h = size === 'md' ? 28 : 24;
  return (
    <View
      style={[
        {
          height: h,
          paddingHorizontal: size === 'md' ? 10 : 8,
          borderRadius: h / 2,
          backgroundColor: v.bg,
          borderWidth: 'border' in v ? 1 : 0,
          borderColor: 'border' in v ? v.border : undefined,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 4,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={v.fg} /> : null}
      <Text variant={size === 'md' ? 'chip12' : 'chip11'} color={v.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** "96% match" badge used on every dish card. */
export function MatchBadge({ percent, suffix = 'match', icon, size }: {
  percent: number;
  suffix?: string;
  icon?: IconName;
  size?: 'md' | 'sm';
}) {
  return <Chip variant="accent" icon={icon} size={size} label={`${percent}%${suffix ? ` ${suffix}` : ''}`} />;
}

export interface FilterChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}

/** Toggleable pill (diet chips, quick filters). */
export function FilterChip({ label, selected, onPress, icon }: FilterChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={{
        height: 40,
        paddingLeft: icon ? 12 : 16,
        paddingRight: 16,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        borderWidth: 1,
        borderColor: selected ? 'transparent' : colors.line,
        backgroundColor: selected ? colors.acc : colors.surf,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={selected ? colors.onAcc : colors.accText} /> : null}
      <Text variant="caption13" style={{ fontFamily: fontFamily.bodyMedium }} color={selected ? colors.onAcc : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ─────────────────────── Segmented control ─────────────────────── */

export interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          padding: 4,
          gap: 4,
          borderRadius: 18,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 40,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.solid : 'transparent',
              boxShadow: on ? shadow.segment : undefined,
            }}
          >
            <Text variant="caption13" style={{ fontFamily: fontFamily.bodySemibold, fontSize: 13.5 }} tone={on ? 'ink' : 'ink2'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─────────────────────────── Toggle ─────────────────────────── */

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  const x = useSharedValue(value ? 22 : 2);
  useEffect(() => {
    x.value = withTiming(value ? 22 : 2, { duration: duration.fast });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? colors.acc : colors.track }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 2,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: palette.white,
            boxShadow: '0px 2px 6px rgba(0,0,0,0.25)',
          },
          knob,
        ]}
      />
    </Pressable>
  );
}

/* ───────────────────── Radio / checkbox ───────────────────── */

export function Radio({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: selected ? 6 : 2,
        borderColor: selected ? colors.acc : colors.track,
      }}
    />
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: checked ? colors.acc : 'transparent',
        borderWidth: checked ? 0 : 1.5,
        borderColor: colors.track,
      }}
    >
      {checked ? <Icon name="check" size={17} color={colors.onAcc} /> : null}
    </View>
  );
}

/* ───────────────────── Progress ───────────────────── */

export function ProgressBar({ value, height = 6, color, style, durationMs = duration.pop }: {
  /** 0..1 */
  value: number;
  height?: number;
  color?: string;
  style?: ViewStyle;
  /** Fill animation length (launch bar uses ~2.7s). */
  durationMs?: number;
}) {
  const { colors } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: durationMs, easing: ease });
  }, [value, w, durationMs]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color ?? colors.acc }, fill]} />
    </View>
  );
}

/** Ring gauge (health score). Replaces the design's conic-gradient ring. */
export function ProgressRing({ value, size = 58, stroke = 6, label }: {
  /** 0..100 */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.acc}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - value / 100)}
        />
      </Svg>
      <View
        style={{
          width: size - stroke * 2,
          height: size - stroke * 2,
          borderRadius: size,
          backgroundColor: colors.solid,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="bodyStrong16" style={{ fontFamily: fontFamily.display }}>
          {label ?? String(value)}
        </Text>
      </View>
    </View>
  );
}

/** Onboarding pager dots; the active dot stretches. */
export function StepDots({ count, index }: { count: number; index: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} active={i === index} />
      ))}
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const w = useSharedValue(active ? 26 : 8);
  useEffect(() => {
    w.value = withTiming(active ? 26 : 8, { duration: 300 });
  }, [active, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: active ? colors.acc : colors.track }, style]} />;
}

/** Segmented progress (Swipe Vibe deck position). */
export function SegmentProgress({ count, index }: { count: number; index: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < index ? colors.acc : i === index ? colors.ink2 : colors.track,
          }}
        />
      ))}
    </View>
  );
}

/* ───────────────────── Mood check-in level bars ───────────────────── */

export interface LevelBarsProps {
  /** 1..levels */
  value: number;
  onChange: (value: number) => void;
  levels?: number;
  label: string;
}

/** Five rising bars; tap one to set the level (energy, stress, hunger, company). */
export function LevelBars({ value, onChange, levels = 5, label }: LevelBarsProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: levels, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(levels, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(1, value - 1));
      }}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 34 }}
    >
      {Array.from({ length: levels }, (_, i) => {
        const v = i + 1;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            hitSlop={{ top: 34 - (12 + v * 4.4), bottom: 6 }}
            style={{ flex: 1, height: 12 + v * 4.4, borderRadius: 8, backgroundColor: v <= value ? colors.acc : colors.track }}
          />
        );
      })}
    </View>
  );
}

/** One OTP digit cell. */
export function OtpBox({ digit, state }: { digit?: string; state: 'filled' | 'active' | 'empty' }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        height: 66,
        borderRadius: 18,
        backgroundColor: colors.solid,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: state === 'empty' ? 1 : 2,
        borderColor: state === 'filled' ? colors.acc : state === 'active' ? colors.ink2 : colors.line,
      }}
    >
      <Text variant="display28">{digit ?? ''}</Text>
    </View>
  );
}
