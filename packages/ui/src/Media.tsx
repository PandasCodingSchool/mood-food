import { useEffect, useId } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { ambient, palette } from '@moodfood/tokens';
import { GradientFill } from './Ambient';
import { Text } from './Text';
import { useTheme } from './theme';

export interface DishImageProps {
  /** Real photo. Without it the branded striped placeholder renders. */
  uri?: string | null;
  /** Placeholder caption, e.g. "butter chicken · naan". */
  caption?: string;
  height?: number;
  radius?: number;
  /** Bottom-to-dark gradient so white text reads over the photo. */
  scrim?: boolean | number;
  /** Diagonal light sweep used on the hero pick. */
  shimmer?: boolean;
  /** Stripe width (9 for large images, 7 for thumbnails). */
  stripe?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function DishImage({
  uri,
  caption,
  height,
  radius = 0,
  scrim,
  shimmer,
  stripe = 9,
  style,
  children,
}: DishImageProps) {
  const { colors } = useTheme();
  const id = useId().replace(/:/g, '');
  const scrimFrom = typeof scrim === 'number' ? scrim : 0.32;
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <>
          {/* Explicit 100% size: on web an absolutely positioned <svg> otherwise keeps its 300×150 intrinsic size. */}
          <Svg width="100%" height="100%" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}>
            <Defs>
              <Pattern id={id} patternUnits="userSpaceOnUse" width={stripe * 2} height={stripe * 2} patternTransform="rotate(45)">
                <Rect width={stripe} height={stripe * 2} fill={colors.ph1} />
                <Rect x={stripe} width={stripe} height={stripe * 2} fill={colors.ph2} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
          <GradientFill gradient={{ angle: 160, colors: [colors.accSoft, 'rgba(0,0,0,0)'], locations: [0, 0.7] }} />
          {caption ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text variant="labelSmall" tone="ink2">
                {caption}
              </Text>
            </View>
          ) : null}
        </>
      )}
      {scrim ? (
        <LinearGradient
          colors={['rgba(8,8,14,0)', palette.scrim]}
          locations={[scrimFrom, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {shimmer ? <Shimmer /> : null}
      {children}
    </View>
  );
}

function Shimmer() {
  const reduced = useReducedMotion();
  const x = useSharedValue(-1.6);
  useEffect(() => {
    if (reduced) return;
    const t = ambient.shimmer;
    x.value = withRepeat(
      withSequence(withTiming(3.2, { duration: t * 0.6, easing: Easing.inOut(Easing.ease) }), withTiming(3.2, { duration: t * 0.4 }), withTiming(-1.6, { duration: 0 })),
      -1,
      false,
    );
  }, [x, reduced]);
  const style = useAnimatedStyle(() => ({ left: `${x.value * 40}%` }));
  if (reduced) return null;
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '40%' }, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
