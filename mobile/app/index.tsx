import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import { bounceIn } from '../src/utils/animations';
import { isSessionValid } from '../src/services/session';

const LOGO_SIZE = 180;

export default function SplashScreen() {
  const router = useRouter();
  const { theme } = useTheme();
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
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={[styles.decorCircle, { top: -40, right: -40, width: 160, height: 160, backgroundColor: colors.orange + '10' }]} />
      <View style={[styles.decorCircle, { bottom: -60, left: -30, width: 200, height: 200, opacity: 0.7, backgroundColor: colors.orange + '10' }]} />

      <View style={styles.center}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: LOGO_SIZE / 2,
              backgroundColor: colors.orange + '40',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            }}
          />
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
            <LinearGradient
              colors={[colors.orange, '#fb923c', '#fbbf24']}
              locations={[0, 0.4, 1]}
              style={{
                width: LOGO_SIZE,
                height: LOGO_SIZE,
                borderRadius: LOGO_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Image
                source={require('../assets/moodfood-logo.png')}
                style={{ width: 140, height: 140, borderRadius: LOGO_SIZE / 2 }}
                resizeMode="contain"
              />
            </LinearGradient>
          </Animated.View>
        </View>
        <Text style={[styles.tagline, fw(700), { color: theme.text }]}>INSTANT GOOD MOOD</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
  },
  center: { alignItems: 'center', gap: 16 },
  tagline: {
    fontSize: 13,
    letterSpacing: 3,
    marginTop: -4,
  },
});
