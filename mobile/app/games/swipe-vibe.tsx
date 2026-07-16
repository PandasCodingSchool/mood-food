import { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Dimensions, PanResponder, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SNACK_CARDS } from '../../src/constants/snackCards';
import { fw, colors } from '../../src/constants/theme';
import { playSwipeSound, playSuccessSound } from '../../src/utils/sounds';
import { hapticSelect, hapticSuccess, hapticWarning } from '../../src/utils/haptics';
import { trackEvent } from '../../src/utils/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

export default function SnackMatchScreen() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const card = SNACK_CARDS[idx];
  const done = idx >= SNACK_CARDS.length;

  const finishSwipe = useCallback(
    (direction: 'left' | 'right' | 'super') => {
      if (direction === 'left') hapticWarning();
      else hapticSelect();
      playSwipeSound();

      const isLike = direction !== 'left';
      const newLiked = isLike ? [...liked, card.emoji] : liked;
      if (isLike) setLiked(newLiked);

      const toX = direction === 'left' ? -SCREEN_WIDTH * 1.5 : direction === 'right' ? SCREEN_WIDTH * 1.5 : 0;
      const toY = direction === 'super' ? -SCREEN_WIDTH * 1.5 : 0;

      Animated.parallel([
        Animated.timing(position, { toValue: { x: toX, y: toY }, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        position.setValue({ x: 0, y: 0 });
        opacity.setValue(1);
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        if (nextIdx >= SNACK_CARDS.length) {
          hapticSuccess();
          playSuccessSound();
          trackEvent('game_completed', { game: 'snack_match', liked: newLiked });
        }
      });
    },
    [idx, liked, card],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => position.setValue({ x: gesture.dx, y: gesture.dy }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) finishSwipe('right');
        else if (gesture.dx < -SWIPE_THRESHOLD) finishSwipe('left');
        else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-20deg', '0deg', '20deg'],
    extrapolate: 'clamp',
  });
  const yumOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const handleGetResults = () => {
    const results = {
      mood: 'happy',
      craving: topCraving(liked),
      budget: 'medium',
      preference: 'both',
      gameData: { type: 'snack_match', likedCount: liked.length },
    };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <LinearGradient colors={['#fef2f2', '#fff1f2', '#ffe4e6']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22, color: colors.navy }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>Snack Match</Text>
          <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 1 }]}>
            {done ? 'All done!' : `${idx + 1} of ${SNACK_CARDS.length}`}
          </Text>
        </View>
        <Text style={{ fontSize: 22, width: 40, textAlign: 'center' }}>👆</Text>
      </View>

      <View style={{ padding: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', height: 420 }}>
        {!done && (
          <>
            <View style={{ position: 'absolute', top: 28, width: 300, height: 380, borderRadius: 24, backgroundColor: '#fff', opacity: 0.4, transform: [{ scale: 0.92 }] }} />
            <View style={{ position: 'absolute', top: 24, width: 310, height: 380, borderRadius: 24, backgroundColor: '#fff', opacity: 0.7, transform: [{ scale: 0.96 }] }} />
            <Animated.View
              {...panResponder.panHandlers}
              style={{
                position: 'absolute',
                top: 20,
                width: 320,
                height: 400,
                borderRadius: 24,
                backgroundColor: '#fff',
                overflow: 'hidden',
                opacity,
                transform: [...position.getTranslateTransform(), { rotate }],
                shadowColor: '#000',
                shadowOpacity: 0.1,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }}
            >
              <LinearGradient colors={card.colors} style={{ height: 260, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 96 }}>{card.emoji}</Text>
                <Animated.View style={{ position: 'absolute', top: 16, left: 16, opacity: nopeOpacity, borderWidth: 3, borderColor: '#ef4444', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, transform: [{ rotate: '-15deg' }] }}>
                  <Text style={[fw(900), { fontSize: 16, color: '#ef4444' }]}>NOPE</Text>
                </Animated.View>
                <Animated.View style={{ position: 'absolute', top: 16, right: 16, opacity: yumOpacity, borderWidth: 3, borderColor: '#22c55e', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, transform: [{ rotate: '15deg' }] }}>
                  <Text style={[fw(900), { fontSize: 16, color: '#22c55e' }]}>YUM!</Text>
                </Animated.View>
              </LinearGradient>
              <View style={{ padding: 16, paddingHorizontal: 20 }}>
                <Text style={[fw(900), { fontSize: 22, color: colors.navy }]}>{card.name}</Text>
                <Text style={[fw(600), { fontSize: 14, color: '#64748b', marginTop: 4 }]}>{card.desc}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {card.tags.map((tag) => (
                    <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(225,29,72,0.08)' }}>
                      <Text style={[fw(700), { fontSize: 11, color: colors.rose }]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          </>
        )}

        {done && (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 64 }}>🎯</Text>
            <Text style={[fw(900), { fontSize: 22, color: colors.navy, textAlign: 'center' }]}>Cravings locked in!</Text>
            <Text style={[fw(600), { fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 240, lineHeight: 20 }]}>
              You liked {liked.length} out of {SNACK_CARDS.length} foods. We know exactly what you want.
            </Text>
          </View>
        )}
      </View>

      {!done && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>
          <TouchableOpacity
            onPress={() => finishSwipe('left')}
            style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(239,68,68,0.15)' }}
          >
            <Text style={[fw(900), { fontSize: 28, color: colors.red }]}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => finishSwipe('super')}
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(59,130,246,0.15)', alignSelf: 'center' }}
          >
            <Text style={{ fontSize: 22 }}>⭐</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => finishSwipe('right')}
            style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(34,197,94,0.15)' }}
          >
            <Text style={{ fontSize: 28, color: colors.green }}>♥</Text>
          </TouchableOpacity>
        </View>
      )}

      {done && (
        <View style={{ paddingHorizontal: 32, marginTop: 8 }}>
          <TouchableOpacity onPress={handleGetResults} activeOpacity={0.85}>
            <LinearGradient colors={['#e11d48', '#fb7185']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>🍽️ Show me my matches</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {liked.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Text style={[fw(800), { fontSize: 11, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }]}>
            You liked
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {liked.map((emoji, i) => (
              <View key={i} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

function topCraving(likedEmojis: string[]): string {
  const counts: Record<string, number> = {};
  likedEmojis.forEach((emoji) => {
    const card = SNACK_CARDS.find((c) => c.emoji === emoji);
    if (card) counts[card.craving] = (counts[card.craving] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'comfort';
}
