// 2.0 Swipe Vibe ("Snack Match"). Same cards, signals and result hand-off as
// v1 (swipe log with reaction times → /recommendations with the top
// craving), now drag-to-swipe with undo, sending the real current mood.
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { space } from '@moodfood/tokens';
import { Button, DishImage, IconButton, Screen, SegmentProgress, Surface, Text, useTheme } from '@moodfood/ui';
import { TopBar } from '../../src/components/v2';
import { SNACK_CARDS } from '../../src/constants/snackCards';
import { useLiveMood } from '../../src/context/LiveMood';
import { logSignals } from '../../src/services/signals';
import type { GameSwipe } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';
import { hapticSelect, hapticSuccess, hapticWarning } from '../../src/utils/haptics';
import { playSuccessSound, playSwipeSound } from '../../src/utils/sounds';

const THRESHOLD = 80;
const VIBES: Record<string, { word: string; text: string }> = {
  comfort: { word: 'Comfort, always.', text: 'Warm, familiar and filling won tonight.' },
  healthy: { word: 'Light & kind.', text: 'Fresh, clean plates kept getting your yes.' },
  spicy: { word: 'Bold & loud.', text: 'You went for heat and big flavour.' },
  sweet: { word: 'Sweet tooth.', text: 'Dessert-first energy. No judgement.' },
};

function topCraving(likedNames: string[]): string {
  const counts: Record<string, number> = {};
  likedNames.forEach((name) => {
    const card = SNACK_CARDS.find((c) => c.name === name);
    if (card) counts[card.craving] = (counts[card.craving] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'comfort';
}

export default function SnackMatchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, dark } = useTheme();
  const { mood } = useLiveMood();
  const [idx, setIdx] = useState(0);
  const [swipes, setSwipes] = useState<GameSwipe[]>([]);
  const [fly, setFly] = useState<'left' | 'right' | null>(null);
  const shownAt = useRef(Date.now());
  const x = useSharedValue(0);
  const total = SNACK_CARDS.length;
  const done = idx >= total;
  const card = SNACK_CARDS[Math.min(idx, total - 1)];
  const liked = swipes.filter((s) => s.liked).map((s) => s.item);

  useEffect(() => {
    shownAt.current = Date.now();
    x.value = 0;
  }, [idx, x]);

  const commit = (dir: 'left' | 'right') => {
    const isLike = dir === 'right';
    isLike ? hapticSelect() : hapticWarning();
    playSwipeSound();
    const next = [...swipes, { item: card.name, liked: isLike, reactionTime: Date.now() - shownAt.current }];
    setSwipes(next);
    setFly(null);
    setIdx(idx + 1);
    if (idx + 1 >= total) {
      hapticSuccess();
      playSuccessSound();
      const likedNames = next.filter((s) => s.liked).map((s) => s.item);
      trackEvent('game_completed', { game: 'snack_match', liked: likedNames });
      void logSignals([{ type: 'swipe', payload: { swipes: next.map((s) => ({ item: s.item, liked: s.liked, reaction_time: s.reactionTime })) } }]);
    }
  };

  const swipe = (dir: 'left' | 'right') => {
    if (fly || done) return;
    setFly(dir);
    x.value = withTiming(dir === 'right' ? width * 1.3 : -width * 1.3, { duration: 300 }, () => runOnJS(commit)(dir));
  };

  const undo = () => {
    if (!idx || fly) return;
    setSwipes(swipes.slice(0, -1));
    setIdx(idx - 1);
  };

  const pan = Gesture.Pan()
    .enabled(!done && !fly)
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

  const seeMatches = () => {
    const results = { mood, craving: topCraving(liked), budget: 'medium', preference: 'both', gameData: { type: 'snack_match', likedCount: liked.length } };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  const vibe = VIBES[topCraving(liked)] ?? VIBES.comfort;
  const CardIcon = card.Icon;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen scrollEnabled={done} contentContainerStyle={{ flexGrow: 1 }}>
        <TopBar title="Swipe Vibe" subtitle={`${Math.min(idx + 1, total)} of ${total}`} />
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <SegmentProgress count={total} index={idx} />
        </View>

        {!done ? (
          <>
            <View style={{ flex: 1, minHeight: 440, marginHorizontal: 20, marginTop: 16 }}>
              {idx < total - 1 ? (
                <Surface kind="glassStrong" radius={30} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale: 0.93 }, { translateY: 20 }] }} />
              ) : null}
              <GestureDetector gesture={pan}>
                <Animated.View
                  key={idx}
                  entering={FadeIn.duration(200)}
                  accessible
                  accessibilityLabel={`${card.name}. ${card.desc}. Swipe right if you'd eat it, left if not.`}
                  style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden', boxShadow: '0px 30px 50px -24px rgba(0,0,0,0.55)', backgroundColor: colors.solid }, cardStyle]}
                >
                  <DishImage height={undefined} style={{ flex: 1 }} scrim={0.4}>
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 120, alignItems: 'center', justifyContent: 'center' }}>
                      <CardIcon size={88} color={colors.accText} />
                    </View>
                    <Animated.View style={[{ position: 'absolute', top: 28, left: 24, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 3, borderColor: colors.acc, borderRadius: 12, transform: [{ rotate: '-12deg' }] }, yum]}>
                      <Text variant="display28" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={colors.acc}>YUM</Text>
                    </Animated.View>
                    <Animated.View style={[{ position: 'absolute', top: 28, right: 24, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 12, transform: [{ rotate: '12deg' }] }, nah]}>
                      <Text variant="display28" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} tone="white">NAH</Text>
                    </Animated.View>
                    <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {card.tags.slice(0, 3).map((t) => (
                          <View key={t} style={{ height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: colors.acc, justifyContent: 'center' }}>
                            <Text variant="chip11" color={colors.onAcc}>{t}</Text>
                          </View>
                        ))}
                      </View>
                      <Text variant="display28" tone="white">{card.name}</Text>
                      <Text variant="caption13" tone="photo2">{card.desc}</Text>
                    </View>
                  </DishImage>
                </Animated.View>
              </GestureDetector>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 22, paddingBottom: 36 }}>
              <IconButton icon="close" label="Nah" variant="glass" size={66} onPress={() => swipe('left')} />
              <IconButton icon="undo" label="Undo" variant="glass" size={48} onPress={undo} disabled={!idx} style={{ opacity: idx ? 1 : 0.5 }} />
              <IconButton icon="favorite" label="Yum" variant="primary" size={66} filled onPress={() => swipe('right')} />
            </View>
          </>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 36 }}>
            <Text variant="label" tone="ink2">Your vibe right now</Text>
            <Text variant="display44" style={{ marginTop: 6 }} accessibilityRole="header">{liked.length ? vibe.word : 'Hard to please.'}</Text>
            <Text variant="body14" tone="ink2" style={{ marginTop: 10 }}>
              {liked.length
                ? `You swiped right on ${liked.length} of ${total}. ${vibe.text}`
                : "Nothing grabbed you — fair. We'll lean on your mood instead."}
            </Text>
            {liked.length ? (
              <Surface radius={22} padding={16} style={{ marginTop: 22, gap: 8 }}>
                <Text variant="label" tone="ink2">You said yum to</Text>
                <Text variant="bodyStrong15">{liked.join(' · ')}</Text>
              </Surface>
            ) : null}
            <View style={{ marginTop: 'auto', paddingTop: 24, flexDirection: 'row', gap: 10 }}>
              <Button
                label="Play again"
                variant="glass"
                style={{ height: 56, borderRadius: 18 }}
                onPress={() => {
                  setSwipes([]);
                  setIdx(0);
                }}
              />
              <Button label="Show my matches" style={{ flex: 1, height: 56, borderRadius: 18 }} onPress={seeMatches} />
            </View>
          </Animated.View>
        )}
      </Screen>
    </View>
  );
}
