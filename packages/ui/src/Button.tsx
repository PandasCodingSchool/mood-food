import { ActivityIndicator, Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import { palette, shadow, type TextVariant } from '@moodfood/tokens';
import { Icon, Text } from './Text';
import type { IconName } from './glyphs';
import { useTheme } from './theme';

type Variant = 'primary' | 'glass' | 'outline' | 'ink' | 'night' | 'photo' | 'ghost';
type Size = 'lg' | 'md' | 'sm';

const SIZES: Record<Size, { height: number; radius: number; px: number; text: TextVariant; icon: number }> = {
  lg: { height: 58, radius: 20, px: 24, text: 'button16', icon: 20 },
  md: { height: 50, radius: 16, px: 18, text: 'button15', icon: 18 },
  sm: { height: 36, radius: 12, px: 14, text: 'button13', icon: 16 },
};

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  iconLeft?: IconName;
  iconRight?: IconName;
  /** Stretch to fill the row. */
  block?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  iconLeft,
  iconRight,
  block,
  loading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const s = SIZES[size];
  const v: Record<Variant, { bg: string; fg: string; border?: string; glow?: string }> = {
    primary: { bg: colors.acc, fg: colors.onAcc, glow: shadow.glow(colors.acc) },
    glass: { bg: colors.surf, fg: colors.ink, border: colors.line },
    outline: { bg: 'transparent', fg: colors.ink2, border: colors.line },
    ink: { bg: colors.ink, fg: colors.solid },
    night: { bg: palette.night, fg: palette.white },
    photo: { bg: 'rgba(255,255,255,0.12)', fg: palette.white, border: 'rgba(255,255,255,0.22)' },
    ghost: { bg: 'transparent', fg: colors.accText },
  };
  const c = v[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      {...rest}
      style={({ pressed }) => [
        {
          height: s.height,
          borderRadius: s.radius,
          paddingHorizontal: variant === 'ghost' ? 0 : s.px,
          backgroundColor: c.bg,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          boxShadow: c.glow,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        block ? { alignSelf: 'stretch' } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {iconLeft ? <Icon name={iconLeft} size={s.icon} color={c.fg} /> : null}
          <Text variant={s.text} color={c.fg} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={s.icon} color={c.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  /** Required for screen readers. */
  label: string;
  /** glass = on the ambient backdrop; photo = over food photography. */
  variant?: 'glass' | 'photo' | 'solid' | 'tint' | 'primary';
  size?: number;
  /** Rounded square instead of a circle. */
  square?: boolean;
  filled?: boolean;
  iconColor?: string;
  /** Small accent dot (unread). */
  badge?: boolean;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  label,
  variant = 'glass',
  size = 44,
  square,
  filled,
  iconColor,
  badge,
  style,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();
  const v = {
    glass: { bg: colors.surf, fg: colors.ink, border: colors.line },
    photo: { bg: palette.photoGlass, fg: palette.white, border: palette.photoBorder },
    solid: { bg: colors.solid, fg: colors.ink, border: colors.line },
    tint: { bg: colors.tint, fg: colors.ink2, border: colors.line },
    primary: { bg: colors.acc, fg: colors.onAcc, border: undefined },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      {...rest}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: square ? 14 : size / 2,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size / 2)} color={iconColor ?? v.fg} filled={filled} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: size * 0.22,
            right: size * 0.25,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.acc,
          }}
        />
      ) : null}
    </Pressable>
  );
}
