import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw } from '../src/constants/theme';
import { bounceIn, spinLoop } from '../src/utils/animations';
import { isSessionValid } from '../src/services/session';

export default function SplashScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    bounceIn(logoScale);
    Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    spinLoop(spin, 1000);

    const timer = setTimeout(async () => {
      const valid = await isSessionValid();
      router.replace(valid ? '/home' : '/onboarding');
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <LinearGradient
      colors={['#f97316', '#fb923c', '#fbbf24']}
      locations={[0, 0.4, 1]}
      style={styles.container}
    >
      <View style={[styles.decorCircle, { top: -40, right: -40, width: 160, height: 160 }]} />
      <View style={[styles.decorCircle, { bottom: -60, left: -30, width: 200, height: 200, opacity: 0.7 }]} />

      <View style={styles.center}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Image
            source={require('../assets/moodfood-logo.png')}
            style={{ width: 180, height: 180 }}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={[styles.tagline, fw(700)]}>INSTANT GOOD MOOD</Text>
        <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
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
  spinner: {
    marginTop: 90,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
  },
});
