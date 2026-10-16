// 2.0 Meal Roulette, engine-driven: the wheel holds six real dishes (three you
// love, three new ones marked 🧭). The server decides where each spin lands
// (weighted by your appetite for new food); the wheel animates there. Accept
// the dish, or re-spin up to the engine's limit. Signals are logged by the API.
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { duration, easing, space } from '@moodfood/tokens';
import { Button, Chip, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { TopBar } from '../../src/components/v2';
import { EngineResult, EngineState, titleCase } from '../../src/components/v2/EngineKit';
import { useEngineGame } from '../../src/hooks/useEngineGame';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';
import { playPopSound, playSuccessSound } from '../../src/utils/sounds';

const SIZE = 320;
const R = SIZE / 2;

function slicePath(i: number, n: number) {
  const slice = 360 / n;
  const a0 = ((i * slice - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
  return `M${R},${R} L${R + R * Math.cos(a0)},${R + R * Math.sin(a0)} A${R},${R} 0 0 1 ${R + R * Math.cos(a1)},${R + R * Math.sin(a1)} Z`;
}

export default function MealRouletteScreen() {
  const { colors, dark } = useTheme();
  const { question, decision, busy, error, answer, reset, loading } = useEngineGame('roulette');
  const spinQ = question?.kind === 'spin' ? question : undefined;
  const segments = spinQ?.segments ?? [];
  const n = Math.max(segments.length, 1);
  const slice = 360 / n;
  const [spinning, setSpinning] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const autoSpin = useRef(false);
  const rot = useSharedValue(0);
  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const landed = spinQ?.landed;
  const revealed = !!spinQ && revealedKey === spinQ.key;

  const land = (key: string) => {
    hapticSuccess();
    playSuccessSound();
    setSpinning(false);
    setRevealedKey(key);
  };

  const spin = () => {
    if (!spinQ || !landed || spinning || busy) return;
    const j = segments.findIndex((s) => s.id === landed.id);
    if (j < 0) return land(spinQ.key);
    hapticSelect();
    playPopSound();
    setSpinning(true);
    const cur = rot.value;
    // Bring the centre of the landed slice under the pointer at the top.
    const target = (((360 - (j * slice + slice / 2) - (cur % 360)) % 360) + 360) % 360;
    const key = spinQ.key;
    rot.value = withTiming(cur + 360 * 5 + target, { duration: duration.spin, easing: Easing.bezier(...easing.spin) }, (fin) => {
      if (fin) runOnJS(land)(key);
    });
  };

  // A re-spin answer brings the next landing: spin to it without another tap.
  useEffect(() => {
    if (spinQ && autoSpin.current) {
      autoSpin.current = false;
      spin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinQ?.key]);

  useEffect(() => {
    if (decision) {
      hapticSuccess();
      playSuccessSound();
    }
  }, [decision]);

  const respin = () => {
    autoSpin.current = true;
    void answer({ accept: false });
  };

  const lastSpin = (spinQ?.spins_left ?? 0) <= 0;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <TopBar title="Meal Roulette" subtitle={spinQ && !decision ? `Spin ${spinQ.spin ?? 1} · ${spinQ.spins_left ?? 0} left after this` : undefined} />
        <EngineState loading={loading} error={error} onRetry={reset} label="Loading the wheel" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="The wheel says" line={(name) => `${name}. Fate agrees.`} badge="Your spin" onAgain={reset} />
        ) : spinQ ? (
          <>
            <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 14 }}>
              <Text variant="display32" align="center" accessibilityRole="header">Let fate pick.</Text>
              <Text variant="body14" tone="ink2" align="center" style={{ marginTop: 6 }}>Three dishes you love, three new ones (🧭). Spin and see.</Text>
            </View>

            <View style={{ width: SIZE, height: SIZE, alignSelf: 'center', marginTop: 26 }}>
              <View style={{ position: 'absolute', top: -10, left: R - 13, zIndex: 3, width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.ink }} />
              <Animated.View style={[{ width: SIZE, height: SIZE, borderRadius: R, boxShadow: `0px 30px 60px -25px rgba(0,0,0,0.55), 0px 0px 0px 6px ${colors.solid}` }, wheelStyle]}>
                <Svg width={SIZE} height={SIZE}>
                  {segments.map((s, i) => (
                    <Path key={s.id} d={slicePath(i, n)} fill={i % 2 === 0 ? colors.acc : colors.solid} />
                  ))}
                </Svg>
                {segments.map((s, i) => (
                  <View
                    key={s.id}
                    pointerEvents="none"
                    style={{ position: 'absolute', left: R - 44, top: R - 18, width: 88, height: 36, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${i * slice + slice / 2}deg` }, { translateY: -100 }] }}
                  >
                    <Text variant="micro11" align="center" numberOfLines={2} style={{ fontFamily: 'Geist_600SemiBold', lineHeight: 12.5 }} color={i % 2 === 0 ? colors.onAcc : colors.ink}>
                      {s.stretch ? `🧭 ${s.name}` : s.name}
                    </Text>
                  </View>
                ))}
              </Animated.View>
              <Pressable
                onPress={spin}
                disabled={revealed || spinning || busy}
                accessibilityRole="button"
                accessibilityLabel={spinning ? 'Spinning' : 'Spin the wheel'}
                style={{ position: 'absolute', left: R - 46, top: R - 46, width: 92, height: 92, borderRadius: 46, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: `0px 10px 30px -8px rgba(0,0,0,0.5), 0px 0px 0px 6px ${colors.accSoft}` }}
              >
                <Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 18, letterSpacing: 0.4 }}>{spinning || busy ? '···' : 'SPIN'}</Text>
              </Pressable>
            </View>

            {revealed && landed ? (
              <Animated.View key={spinQ.key} entering={ZoomIn.springify().damping(13)}>
                <Surface kind="solid" radius={26} padding={14} style={{ marginHorizontal: space.gutter, marginTop: 30, gap: 14 }}>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text variant="labelSmall" tone="accText">The wheel says</Text>
                      {landed.stretch ? <Chip variant="accent" label="🧭 Something new" /> : null}
                    </View>
                    <Text variant="title21">{landed.name}</Text>
                    <Text variant="caption12" tone="ink2">{[titleCase(landed.cuisine), landed.veg ? 'veg' : 'non-veg', ...landed.tags.slice(0, 2)].join(' · ')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label={lastSpin ? 'None of these' : 'Spin again'} variant="glass" size="md" onPress={respin} disabled={busy} />
                    <Button label="Yes, that one" size="md" style={{ flex: 1 }} onPress={() => void answer({ accept: true })} disabled={busy} />
                  </View>
                </Surface>
              </Animated.View>
            ) : !spinning ? (
              <Text variant="body13" tone="ink2" align="center" style={{ marginTop: 30 }}>Tap spin. Not feeling it? You can spin again.</Text>
            ) : null}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
