import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { trackEvent } from '../../src/utils/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

const SWIPE_ITEMS = [
  { id: 1, image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=400&fit=crop', name: 'Wood-fired Pizza', category: 'comfort', cuisine: 'Italian', budget: 'moderate', vibe: 'casual' },
  { id: 2, image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop', name: 'Ramen Bowl', category: 'comfort', cuisine: 'Japanese', budget: 'budget', vibe: 'cozy' },
  { id: 3, image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop', name: 'Fresh Salad Bowl', category: 'healthy', cuisine: 'Mediterranean', budget: 'moderate', vibe: 'fresh' },
  { id: 4, image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop', name: 'Street Tacos', category: 'spicy', cuisine: 'Mexican', budget: 'budget', vibe: 'lively' },
  { id: 5, image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=400&fit=crop', name: 'Sushi Platter', category: 'light', cuisine: 'Japanese', budget: 'splurge', vibe: 'elegant' },
  { id: 6, image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop', name: 'Gourmet Burger', category: 'comfort', cuisine: 'American', budget: 'moderate', vibe: 'casual' },
  { id: 7, image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&h=400&fit=crop', name: 'Curry Feast', category: 'spicy', cuisine: 'Indian', budget: 'moderate', vibe: 'warm' },
  { id: 8, image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=400&fit=crop', name: 'Seafood Boil', category: 'indulgent', cuisine: 'American', budget: 'splurge', vibe: 'festive' },
];

const VIBE_TO_MOOD: Record<string, string> = {
  cozy: 'tired', casual: 'happy', fresh: 'relaxed', lively: 'celebrating',
  elegant: 'relaxed', warm: 'happy', festive: 'celebrating', indulgent: 'stressed',
};

export default function SwipeVibeScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipes, setSwipes] = useState<Array<{ liked: boolean; item: typeof SWIPE_ITEMS[0] }>>([]);
  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const currentItem = SWIPE_ITEMS[currentIndex];

  const analyzeAndComplete = useCallback((allSwipes: typeof swipes) => {
    const liked = allSwipes.filter((s) => s.liked);
    const countByKey = (key: keyof typeof SWIPE_ITEMS[0]) => {
      const counts: Record<string, number> = {};
      liked.forEach((s) => { const v = String(s.item[key]); counts[v] = (counts[v] || 0) + 1; });
      return counts;
    };
    const getTop = (c: Record<string, number>) =>
      Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const topCategory = getTop(countByKey('category')) || 'comfort';
    const topVibe = getTop(countByKey('vibe')) || 'casual';
    const topBudget = getTop(countByKey('budget')) || 'moderate';
    const topCuisine = getTop(countByKey('cuisine')) || 'Mixed';

    const results = {
      mood: VIBE_TO_MOOD[topVibe] || 'happy',
      craving: topCategory,
      budget: topBudget,
      preference: 'both',
      gameData: { type: 'swipe_vibe', topCategory, topCuisine, likedCount: liked.length },
    };

    trackEvent('game_completed', { game: 'swipe', results });
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  }, [router]);

  const animateSwipe = (direction: 'left' | 'right', item: typeof SWIPE_ITEMS[0]) => {
    const liked = direction === 'right';
    const toX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

    Animated.parallel([
      Animated.timing(position, { toValue: { x: toX, y: 0 }, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      position.setValue({ x: 0, y: 0 });
      opacity.setValue(1);

      const newSwipes = [...swipes, { liked, item }];
      setSwipes(newSwipes);

      if (currentIndex + 1 >= SWIPE_ITEMS.length) {
        analyzeAndComplete(newSwipes);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          animateSwipe('right', currentItem);
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          animateSwipe('left', currentItem);
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (!currentItem) return null;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
        >
          <Text className="text-gray-700 text-lg">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Swipe & Vibe</Text>
          <Text className="text-gray-500 text-sm">{currentIndex + 1} / {SWIPE_ITEMS.length}</Text>
        </View>
      </View>

      {/* Progress */}
      <View className="mx-6 h-1.5 bg-gray-200 rounded-full overflow-hidden mb-4">
        <View
          className="h-1.5 bg-orange-500 rounded-full"
          style={{ width: `${((currentIndex) / SWIPE_ITEMS.length) * 100}%` }}
        />
      </View>

      {/* Card */}
      <View className="flex-1 items-center justify-center px-4">
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [...position.getTranslateTransform(), { rotate }],
            opacity,
            width: SCREEN_WIDTH - 32,
          }}
          className="rounded-3xl overflow-hidden shadow-xl bg-white"
        >
          <Image
            source={{ uri: currentItem.image }}
            style={{ width: '100%', height: 320 }}
            resizeMode="cover"
          />

          {/* LIKE stamp */}
          <Animated.View
            style={{
              position: 'absolute', top: 24, left: 20, opacity: likeOpacity,
              borderWidth: 3, borderColor: '#22c55e', borderRadius: 8, padding: 6,
              transform: [{ rotate: '-15deg' }],
            }}
          >
            <Text style={{ color: '#22c55e', fontWeight: '900', fontSize: 28 }}>LIKE</Text>
          </Animated.View>

          {/* NOPE stamp */}
          <Animated.View
            style={{
              position: 'absolute', top: 24, right: 20, opacity: nopeOpacity,
              borderWidth: 3, borderColor: '#ef4444', borderRadius: 8, padding: 6,
              transform: [{ rotate: '15deg' }],
            }}
          >
            <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 28 }}>NOPE</Text>
          </Animated.View>

          <View className="p-5">
            <Text className="text-2xl font-bold text-gray-900">{currentItem.name}</Text>
            <Text className="text-gray-500 mt-1">
              {currentItem.cuisine} · {currentItem.category}
            </Text>
          </View>
        </Animated.View>

        {/* Action buttons */}
        <View className="flex-row mt-6 gap-6">
          <TouchableOpacity
            onPress={() => animateSwipe('left', currentItem)}
            className="w-16 h-16 rounded-full bg-white items-center justify-center shadow-lg border border-red-100"
          >
            <Text style={{ fontSize: 28 }}>✗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => animateSwipe('right', currentItem)}
            className="w-16 h-16 rounded-full bg-white items-center justify-center shadow-lg border border-green-100"
          >
            <Text style={{ fontSize: 28 }}>♥</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
