import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { trackEvent } from '../../src/utils/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH - 48, 340);

const SEGMENTS = [
  { id: 'comfort', label: 'Comfort\nFood', color: '#f97316', icon: '🍲', mood: 'tired', craving: 'comfort' },
  { id: 'healthy', label: 'Healthy\nBowl', color: '#22c55e', icon: '🥗', mood: 'relaxed', craving: 'healthy' },
  { id: 'spicy', label: 'Spicy\nKick', color: '#ef4444', icon: '🌶️', mood: 'adventurous', craving: 'spicy' },
  { id: 'indulgent', label: 'Full\nIndulge', color: '#a855f7', icon: '🍰', mood: 'celebrating', craving: 'indulgent' },
  { id: 'light', label: 'Light\nBites', color: '#06b6d4', icon: '🌮', mood: 'relaxed', craving: 'light' },
  { id: 'sweet', label: 'Sweet\nTreats', color: '#ec4899', icon: '🍩', mood: 'happy', craving: 'sweet' },
];

const SEGMENT_ANGLE = 360 / SEGMENTS.length;

export default function SpinWheelScreen() {
  const router = useRouter();
  const [isSpinning, setIsSpinning] = useState(false);
  const [landed, setLanded] = useState<typeof SEGMENTS[0] | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [preference, setPreference] = useState<string | null>(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const currentRotation = useRef(0);

  const spin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setLanded(null);
    trackEvent('wheel_spun');

    const extraSpins = 5 + Math.floor(Math.random() * 5);
    const landAngle = Math.floor(Math.random() * 360);
    const totalDeg = currentRotation.current + extraSpins * 360 + landAngle;
    currentRotation.current = totalDeg;

    rotation.setValue(0);
    Animated.timing(rotation, {
      toValue: totalDeg,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const normalised = ((totalDeg % 360) + 360) % 360;
      const adjustedAngle = (360 - normalised + SEGMENT_ANGLE / 2) % 360;
      const segmentIndex = Math.floor(adjustedAngle / SEGMENT_ANGLE) % SEGMENTS.length;
      const segment = SEGMENTS[segmentIndex];
      setLanded(segment);
      setIsSpinning(false);
      trackEvent('wheel_landed', { segment: segment.id });
    });
  };

  const handleConfirm = () => {
    if (!landed || !budget || !preference) return;
    const results = {
      mood: landed.mood,
      craving: landed.craving,
      budget,
      preference,
      gameData: { type: 'spin_wheel', segment: landed.id },
    };
    trackEvent('game_completed', { game: 'wheel', results });
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
        >
          <Text className="text-gray-700 text-lg">←</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Meal Roulette</Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        {/* Pointer */}
        <View className="mb-2">
          <Text style={{ fontSize: 32 }}>▼</Text>
        </View>

        {/* Wheel */}
        <Animated.View
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            borderRadius: WHEEL_SIZE / 2,
            transform: [{ rotate: rotateInterpolate }],
            overflow: 'hidden',
            borderWidth: 4,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {SEGMENTS.map((seg, i) => {
            const angle = i * SEGMENT_ANGLE;
            return (
              <View
                key={seg.id}
                style={{
                  position: 'absolute',
                  width: WHEEL_SIZE,
                  height: WHEEL_SIZE,
                  borderRadius: WHEEL_SIZE / 2,
                  overflow: 'hidden',
                  transform: [{ rotate: `${angle}deg` }],
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: WHEEL_SIZE / 2,
                    width: WHEEL_SIZE / 2,
                    height: WHEEL_SIZE / 2,
                    backgroundColor: seg.color,
                    transformOrigin: '0% 100%',
                    transform: [{ rotate: `${SEGMENT_ANGLE}deg` }],
                  }}
                />
                {/* Label */}
                <View
                  style={{
                    position: 'absolute',
                    top: WHEEL_SIZE * 0.12,
                    left: WHEEL_SIZE * 0.55,
                    transform: [{ rotate: `${SEGMENT_ANGLE / 2}deg` }],
                  }}
                >
                  <Text style={{ fontSize: 16, textAlign: 'center' }}>{seg.icon}</Text>
                </View>
              </View>
            );
          })}
          {/* Center circle */}
          <View
            style={{
              position: 'absolute',
              top: WHEEL_SIZE / 2 - 28,
              left: WHEEL_SIZE / 2 - 28,
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: '#f97316',
            }}
          >
            <Text style={{ fontSize: 20 }}>🍽️</Text>
          </View>
        </Animated.View>

        {/* Spin button */}
        {!landed && (
          <TouchableOpacity
            onPress={spin}
            disabled={isSpinning}
            className="mt-8 bg-orange-500 rounded-2xl py-4 px-10 items-center"
            style={{ opacity: isSpinning ? 0.6 : 1 }}
          >
            <Text className="text-white text-lg font-bold">
              {isSpinning ? 'Spinning…' : '🎡 Spin!'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Landed result */}
        {landed && !budget && (
          <View className="mt-6 w-full bg-orange-50 rounded-2xl p-5 items-center">
            <Text style={{ fontSize: 40 }}>{landed.icon}</Text>
            <Text className="text-xl font-bold text-gray-900 mt-2">{landed.label.replace('\n', ' ')}</Text>
            <Text className="text-gray-500 text-sm mt-1">What's your budget?</Text>
            <View className="flex-row mt-4 gap-3">
              {[
                { v: 'low', label: '💰 Budget' },
                { v: 'medium', label: '💰💰 Moderate' },
                { v: 'high', label: '💰💰💰 Splurge' },
              ].map(({ v, label }) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setBudget(v)}
                  className="flex-1 border-2 border-orange-300 rounded-xl py-3 items-center bg-white"
                >
                  <Text className="text-gray-800 font-semibold text-xs text-center">{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {landed && budget && !preference && (
          <View className="mt-6 w-full bg-orange-50 rounded-2xl p-5 items-center">
            <Text className="text-lg font-bold text-gray-900 mb-4">Dietary preference?</Text>
            <View className="flex-row gap-3">
              {[
                { v: 'veg', label: '🥬 Veg' },
                { v: 'non-veg', label: '🍗 Non-Veg' },
                { v: 'both', label: '🍽️ Both' },
              ].map(({ v, label }) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setPreference(v)}
                  className="flex-1 border-2 border-orange-300 rounded-xl py-3 items-center bg-white"
                >
                  <Text className="text-gray-800 font-semibold text-xs text-center">{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {landed && budget && preference && (
          <TouchableOpacity
            onPress={handleConfirm}
            className="mt-6 bg-orange-500 rounded-2xl py-4 px-10"
          >
            <Text className="text-white text-lg font-bold">Get My Meals ✨</Text>
          </TouchableOpacity>
        )}

        {landed && (
          <TouchableOpacity onPress={spin} className="mt-3">
            <Text className="text-orange-500 text-sm font-medium">↻ Spin again</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
