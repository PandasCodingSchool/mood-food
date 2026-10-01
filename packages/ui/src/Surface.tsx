import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius as R, shadow } from '@moodfood/tokens';
import { useTheme } from './theme';

export interface SurfaceProps extends ViewProps {
  /** glass = frosted translucent card; solid = opaque sheet; tint = subtle fill inside a solid card. */
  kind?: 'glass' | 'glassStrong' | 'solid' | 'tint' | 'accentSoft';
  radius?: number;
  /** Adds the hairline border (default on for glass). */
  bordered?: boolean;
  elevated?: boolean;
  padding?: number;
}

// Android BlurView needs a dedicated blur target, so glass there is the
// translucent fill alone. Over the ambient gradient this matches the design.
const canBlur = Platform.OS === 'ios' || Platform.OS === 'web';

export function Surface({
  kind = 'glass',
  radius = R.xxl,
  bordered,
  elevated,
  padding,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const { colors, dark } = useTheme();
  const glass = kind === 'glass' || kind === 'glassStrong';
  const bg = {
    glass: colors.surf,
    glassStrong: colors.surf2,
    solid: colors.solid,
    tint: colors.tint,
    accentSoft: colors.accSoft,
  }[kind];
  const base: ViewStyle = {
    borderRadius: radius,
    backgroundColor: bg,
    padding,
    ...((bordered ?? glass) ? { borderWidth: 1, borderColor: colors.line } : null),
    ...(elevated ? { boxShadow: shadow.card } : null),
    ...(glass ? { overflow: 'hidden' } : null),
  };
  return (
    <View {...rest} style={[base, style]}>
      {glass && canBlur ? (
        <BlurView
          intensity={dark ? 24 : 30}
          tint={dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}
