// 2.0 Meal Roulette. Same eight vibe segments and hand-off as v1 (segment
// mood/craving/budget → /recommendations), drawn as the design's wheel.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { duration, easing, space } from '@moodfood/tokens';
import { Button, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { TopBar } from '../../src/components/v2';
import { WHEEL_SEGMENTS, type WheelSegment } from '../../src/constants/wheelSegments';
import { trackEvent } from '../../src/utils/analytics';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';
import { playPopSound, playSuccessSound } from '../../src/utils/sounds';

const SIZE = 320;
const R = SIZE / 2;
const N = WHEEL_SEGMENTS.length;
const SLICE = 360 / N;

function slicePath(i: number) {
  const a0 = ((i * SLICE - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SLICE - 90) * Math.PI) / 180;
  return `M${R},${R} L${R + R * Math.cos(a0)},${R + R * Math.sin(a0)} A${R},${R} 0 0 1 ${R + R * Math.cos(a1)},${R + R * Math.sin(a1)} Z`;
}

export default function MealRouletteScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelSegment | null>(null);
  const rot = useSharedValue(0);
  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const land = (j: number) => {
    const seg = WHEEL_SEGMENTS[j];
    hapticSuccess();
    playSuccessSound();
    setResult(seg);
    setSpinning(false);
    trackEvent('wheel_landed', { segment: seg.label });
  };

  const spin = () => {
    if (spinning) return;
    hapticSelect();
    playPopSound();
    setSpinning(true);
    setResult(null);
    trackEvent('wheel_spun');
    const j = Math.floor(Math.random() * N);
    const cur = rot.value;
    // Bring the centre of slice j under the pointer at the top.
    const target = (((360 - (j * SLICE + SLICE / 2) - (cur % 360)) % 360) + 360) % 360;
    rot.value = withTiming(cur + 360 * 5 + target, { duration: duration.spin, easing: Easing.bezier(...easing.spin) }, (fin) => {
      if (fin) runOnJS(land)(j);
    });
  };

  const accept = () => {
    if (!result) return;
    const results = { mood: result.mood, craving: result.craving, budget: result.budget, preference: 'both', gameData: { type: 'roulette', segment: result.label } };
    trackEvent('game_completed', { game: 'wheel', results });
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <TopBar title="Meal Roulette" />
        <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 14 }}>
          <Text variant="display32" align="center" accessibilityRole="header">Let fate pick.</Text>
          <Text variant="body14" tone="ink2" align="center" style={{ marginTop: 6 }}>Every slice is a vibe we can cook up for you. No bad outcome.</Text>
        </View>

        <View style={{ width: SIZE, height: SIZE, alignSelf: 'center', marginTop: 26 }}>
          <View style={{ position: 'absolute', top: -10, left: R - 13, zIndex: 3, width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.ink }} />
          <Animated.View style={[{ width: SIZE, height: SIZE, borderRadius: R, boxShadow: `0px 30px 60px -25px rgba(0,0,0,0.55), 0px 0px 0px 6px ${colors.solid}` }, wheelStyle]}>
            <Svg width={SIZE} height={SIZE}>
              {WHEEL_SEGMENTS.map((_, i) => (
                <Path key={i} d={slicePath(i)} fill={i % 2 === 0 ? colors.acc : colors.solid} />
              ))}
            </Svg>
            {WHEEL_SEGMENTS.map((s, i) => (
              <View
                key={s.label}
                pointerEvents="none"
                style={{ position: 'absolute', left: R - 40, top: R - 16, width: 80, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${i * SLICE + SLICE / 2}deg` }, { translateY: -104 }] }}
              >
                <Text variant="micro11" align="center" numberOfLines={2} style={{ fontFamily: 'Geist_600SemiBold', lineHeight: 12.5 }} color={i % 2 === 0 ? colors.onAcc : colors.ink}>
                  {s.label}
                </Text>
              </View>
            ))}
          </Animated.View>
          <Pressable
            onPress={spin}
            accessibilityRole="button"
            accessibilityLabel={spinning ? 'Spinning' : 'Spin the wheel'}
            style={{ position: 'absolute', left: R - 46, top: R - 46, width: 92, height: 92, borderRadius: 46, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: `0px 10px 30px -8px rgba(0,0,0,0.5), 0px 0px 0px 6px ${colors.accSoft}` }}
          >
            <Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 18, letterSpacing: 0.4 }}>{spinning ? '···' : 'SPIN'}</Text>
          </Pressable>
        </View>

        {result ? (
          <Animated.View entering={ZoomIn.springify().damping(13)}>
            <Surface kind="solid" radius={26} padding={14} style={{ marginHorizontal: space.gutter, marginTop: 30, gap: 14 }}>
              <View>
                <Text variant="labelSmall" tone="accText">The wheel says</Text>
                <Text variant="title21" style={{ marginTop: 2 }}>{result.label}</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 2 }}>{result.sub}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Spin again" variant="glass" size="md" onPress={spin} />
                <Button label="Deal. Show me" size="md" style={{ flex: 1 }} onPress={accept} />
              </View>
            </Surface>
          </Animated.View>
        ) : !spinning ? (
          <Text variant="body13" tone="ink2" align="center" style={{ marginTop: 30 }}>Tap spin. One free re-spin, we won't tell.</Text>
        ) : null}
      </Screen>
    </View>
  );
}
