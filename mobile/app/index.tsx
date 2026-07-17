import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw } from '../src/constants/theme';
import { bounceIn } from '../src/utils/animations';
import { isSessionValid } from '../src/services/session';

const LOGO_SIZE = 180;

export default function SplashScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    bounceIn(logoScale);
    Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    );
    pulse.start();

    const timer = setTimeout(async () => {
      const valid = await isSessionValid();
      router.replace(valid ? '/home' : '/onboarding');
    }, 2200);

    return () => {
      clearTimeout(timer);
      pulse.stop();
    };
  }, []);

  return (
    <LinearGradient
      colors={['#f97316', '#fb923c', '#fbbf24']}
      locations={[0, 0.4, 1]}
      style={styles.container}
    >
      <View style={[styles.decorCircle, { top: -40, right: -40, width: 160, height: 160 }]} />
      <View style={[styles.decorCircle, { bottom: -60, left: -30, width: 200, height: 200, opacity: 0.7 }]} />

      <View style={styles.center}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: LOGO_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.4)',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            }}
          />
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
            <View
              style={{
                width: LOGO_SIZE,
                height: LOGO_SIZE,
                borderRadius: LOGO_SIZE / 2,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={require('../assets/moodfood-logo.png')}
                style={{ width: 140, height: 140, borderRadius: LOGO_SIZE / 2 }}
                resizeMode="contain"
              />
            </View>
          </Animated.View>
        </View>
        <Text style={[styles.tagline, fw(700)]}>INSTANT GOOD MOOD</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  center: { alignItems: 'center', gap: 16 },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 3,
    marginTop: -4,
  },
});
