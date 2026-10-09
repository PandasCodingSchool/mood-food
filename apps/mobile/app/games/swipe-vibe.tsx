// 2.0 Swipe Vibe ("Snack Match"), engine-driven: the intelligence picks each
// card (the one that teaches it most about tonight), stops once it's sure, and
// returns real picks. Drag-to-swipe as before; signals are logged by the API.
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DishImage, IconButton, Screen, SegmentProgress, Surface, Text, useTheme } from '@moodfood/ui';
import { TopBar } from '../../src/components/v2';
import { EngineResult, EngineState, titleCase } from '../../src/components/v2/EngineKit';
import { useEngineGame } from '../../src/hooks/useEngineGame';
import { hapticSelect, hapticSuccess, hapticWarning } from '../../src/utils/haptics';
import { playSuccessSound, playSwipeSound } from '../../src/utils/sounds';

const THRESHOLD = 80;

export default function SnackMatchScreen() {
  const { width } = useWindowDimensions();
  const { colors, dark } = useTheme();
  const { question, progress, decision, busy, error, answer, reset, loading } = useEngineGame('swipe');
  const dish = question?.kind === 'swipe' ? question.dish : undefined;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = 0;
  }, [question?.key, x]);

  useEffect(() => {
    if (decision) {
      hapticSuccess();
      playSuccessSound();
    }
  }, [decision]);

  const commit = (dir: 'left' | 'right') => void answer({ liked: dir === 'right' });

  const swipe = (dir: 'left' | 'right') => {
    if (!dish || busy) return;
    dir === 'right' ? hapticSelect() : hapticWarning();
    playSwipeSound();
    x.value = withTiming(dir === 'right' ? width * 1.3 : -width * 1.3, { duration: 280 }, () => runOnJS(commit)(dir));
  };

  const pan = Gesture.Pan()
    .enabled(!!dish && !busy)
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > THRESHOLD) runOnJS(swipe)('right');
      else if (e.translationX < -THRESHOLD) runOnJS(swipe)('left');
      else x.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-width / 2, 0, width / 2], [-16, 0, 16])}deg` }],
  }));
  const yum = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, THRESHOLD], [0, 1], 'clamp') }));
  const nah = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-THRESHOLD, 0], [1, 0], 'clamp') }));

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen scrollEnabled={!!decision} contentContainerStyle={{ flexGrow: 1 }}>
        <TopBar title="Swipe Vibe" subtitle={progress && !decision ? `Card ${progress.step + 1} · up to ${progress.max_steps}` : undefined} />
        {progress && !decision ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <SegmentProgress count={progress.max_steps} index={progress.step} />
          </View>
        ) : null}

        <EngineState loading={loading} error={error} onRetry={reset} label="Shuffling your cards" />
        {decision ? (
          <EngineResult decision={decision} eyebrow="Your swipes say" line={(n) => `${n}, tonight.`} badge="Your match" onAgain={reset} />
        ) : dish ? (
          <>
            <View style={{ flex: 1, minHeight: 440, marginHorizontal: 20, marginTop: 16 }}>
              <Surface kind="glassStrong" radius={30} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale: 0.93 }, { translateY: 20 }] }} />
              <GestureDetector gesture={pan}>
                <Animated.View
                  key={question?.key}
                  entering={FadeIn.duration(200)}
                  accessible
                  accessibilityLabel={`${dish.name}. Swipe right if you'd eat it, left if not.`}
                  style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden', boxShadow: '0px 30px 50px -24px rgba(0,0,0,0.55)', backgroundColor: colors.solid }, cardStyle]}
                >
                  <DishImage uri={dish.image_url ?? undefined} caption={dish.cuisine} height={undefined} style={{ flex: 1 }} scrim={0.4}>
                    <Animated.View style={[{ position: 'absolute', top: 28, left: 24, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 3, borderColor: colors.acc, borderRadius: 12, transform: [{ rotate: '-12deg' }] }, yum]}>
                      <Text variant="display28" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={colors.acc}>YUM</Text>
                    </Animated.View>
                    <Animated.View style={[{ position: 'absolute', top: 28, right: 24, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 12, transform: [{ rotate: '12deg' }] }, nah]}>
                      <Text variant="display28" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} tone="white">NAH</Text>
                    </Animated.View>
                    <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {dish.tags.slice(0, 3).map((t) => (
                          <View key={t} style={{ height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: colors.acc, justifyContent: 'center' }}>
                            <Text variant="chip11" color={colors.onAcc}>{t}</Text>
                          </View>
                        ))}
                      </View>
                      <Text variant="display28" tone="white">{dish.name}</Text>
                      <Text variant="caption13" tone="photo2">{`${titleCase(dish.cuisine)} · ${dish.veg ? 'veg' : 'non-veg'}`}</Text>
                    </View>
                  </DishImage>
                </Animated.View>
              </GestureDetector>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 22, paddingBottom: 36 }}>
              <IconButton icon="close" label="Nah" variant="glass" size={66} onPress={() => swipe('left')} disabled={busy} />
              <IconButton icon="favorite" label="Yum" variant="primary" size={66} filled onPress={() => swipe('right')} disabled={busy} />
            </View>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
