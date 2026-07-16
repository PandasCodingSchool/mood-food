import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Animated, Easing, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { WHEEL_SEGMENTS, type WheelSegment } from '../../src/constants/wheelSegments';
import { fw } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { pulseLoop } from '../../src/utils/animations';
import { playPopSound, playSuccessSound } from '../../src/utils/sounds';
import { hapticSelect, hapticSuccess } from '../../src/utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH - 92, 280);
const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

// Matches the design's exact conic-gradient palette, same order as WHEEL_SEGMENTS.
const SEGMENT_COLORS = ['#f97316', '#dc2626', '#16a34a', '#ec4899', '#eab308', '#7c3aed', '#0891b2', '#059669'];

export default function MealRouletteScreen() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelSegment | null>(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const currentRotation = useRef(0);
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!spinning && !result) {
      const loop = pulseLoop(pulseScale, 1.03, 1000);
      return () => loop.stop();
    }
  }, [spinning, result]);

  const spin = () => {
    if (spinning) return;
    hapticSelect();
    playPopSound();
    setSpinning(true);
    setResult(null);
    trackEvent('wheel_spun');

    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const landingSegment = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const targetAngle = extraSpins * 360 + (360 - landingSegment * SEGMENT_ANGLE - SEGMENT_ANGLE / 2);
    const newRotation = currentRotation.current + targetAngle;
    currentRotation.current = newRotation;

    Animated.timing(rotation, {
      toValue: newRotation,
      duration: 4000,
      easing: Easing.bezier(0.17, 0.67, 0.12, 0.99),
      useNativeDriver: true,
    }).start(() => {
      const segment = WHEEL_SEGMENTS[landingSegment];
      hapticSuccess();
      playSuccessSound();
      setResult(segment);
      setSpinning(false);
      trackEvent('wheel_landed', { segment: segment.label });
    });
  };

  const rotateInterpolate = rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  const handleAccept = () => {
    if (!result) return;
    const results = {
      mood: result.mood,
      craving: result.craving,
      budget: result.budget,
      preference: 'both',
      gameData: { type: 'roulette', segment: result.label },
    };
    trackEvent('game_completed', { game: 'wheel', results });
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <LinearGradient colors={['#065f46', '#064e3b']} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[fw(900), { fontSize: 20, color: '#fff' }]}>Meal Roulette</Text>
          <Text style={[fw(600), { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }]}>
            Spin to discover your meal vibe
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 24 }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 14,
            borderRightWidth: 14,
            borderTopWidth: 22,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: '#fbbf24',
            marginBottom: -10,
            zIndex: 10,
          }}
        />

        <Animated.View
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            borderRadius: WHEEL_SIZE / 2,
            transform: [{ rotate: rotateInterpolate }],
            overflow: 'hidden',
            borderWidth: 6,
            borderColor: 'rgba(255,255,255,0.2)',
          }}
        >
          {WHEEL_SEGMENTS.map((seg, i) => {
            const angle = i * SEGMENT_ANGLE;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  width: WHEEL_SIZE,
                  height: WHEEL_SIZE,
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
                    backgroundColor: SEGMENT_COLORS[i],
                    transform: [{ translateX: -WHEEL_SIZE / 2 }, { rotate: `${SEGMENT_ANGLE}deg` }, { translateX: WHEEL_SIZE / 2 }],
                  }}
                />
                <View style={{ position: 'absolute', top: WHEEL_SIZE * 0.14, left: WHEEL_SIZE * 0.56, transform: [{ rotate: `${SEGMENT_ANGLE / 2}deg` }] }}>
                  <Text style={{ fontSize: 20 }}>{seg.emoji}</Text>
                </View>
              </View>
            );
          })}
          <View
            style={{
              position: 'absolute',
              top: WHEEL_SIZE / 2 - 30,
              left: WHEEL_SIZE / 2 - 30,
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 28 }}>🍽️</Text>
          </View>
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 32, alignItems: 'center', gap: 16 }}>
        {result && (
          <>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>{result.emoji}</Text>
              <Text style={[fw(900), { fontSize: 24, color: '#fff' }]}>{result.label}</Text>
              <Text style={[fw(600), { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }]}>{result.sub}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity onPress={handleAccept} style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: '#4ade80', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>✅ Let's go!</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={spin} style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>🔄 Spin again</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!result && !spinning && (
          <>
            <Text style={[fw(700), { fontSize: 16, color: 'rgba(255,255,255,0.8)' }]}>Tap the button to spin!</Text>
            <Animated.View style={{ width: '100%', transform: [{ scale: pulseScale }] }}>
              <TouchableOpacity onPress={spin} activeOpacity={0.85}>
                <LinearGradient colors={['#4ade80', '#22c55e']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>🎡 SPIN THE WHEEL</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}

        {spinning && <Text style={[fw(800), { fontSize: 18, color: 'rgba(255,255,255,0.9)' }]}>Spinning...</Text>}
      </View>
    </LinearGradient>
  );
}
