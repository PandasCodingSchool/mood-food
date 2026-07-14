import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARD_STEPS } from '../src/constants/onboarding';
import { fw } from '../src/constants/theme';
import GradientButton from '../src/components/GradientButton';
import { bounceIn, fadeUp, floatLoop } from '../src/utils/animations';

const TOTAL = ONBOARD_STEPS.length;

function OrbitEmoji({ emoji, style, duration, delay }: { emoji: string; style: object; duration: number; delay: number }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => floatLoop(translateY, 10, duration), delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.Text style={[styles.orbitEmoji, style, { transform: [{ translateY }] }]}>
      {emoji}
    </Animated.Text>
  );
}

function OnboardContent({ step, index }: { step: (typeof ONBOARD_STEPS)[number]; index: number }) {
  const mainScale = useRef(new Animated.Value(0.3)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const bodyTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    bounceIn(mainScale);
    fadeUp(bodyOpacity, bodyTranslate, 150);
  }, []);

  return (
    <View style={styles.illustrationArea}>
      <View style={styles.orbitStage}>
        <Animated.Text style={[styles.mainEmoji, { transform: [{ scale: mainScale }] }]}>
          {step.mainEmoji}
        </Animated.Text>
        <OrbitEmoji emoji={step.orbit[0]} style={{ top: 10, left: 30, fontSize: 32, opacity: 0.8 }} duration={3000} delay={0} />
        <OrbitEmoji emoji={step.orbit[1]} style={{ top: 20, right: 25, fontSize: 28, opacity: 0.7 }} duration={2500} delay={400} />
        <OrbitEmoji emoji={step.orbit[2]} style={{ bottom: 30, left: 15, fontSize: 26, opacity: 0.6 }} duration={2800} delay={800} />
        <OrbitEmoji emoji={step.orbit[3]} style={{ bottom: 15, right: 35, fontSize: 30, opacity: 0.75 }} duration={3200} delay={200} />
        <Text style={[styles.sparkle, { top: 50, right: 10, fontSize: 16, opacity: 0.5 }]}>✨</Text>
        <Text style={[styles.sparkle, { bottom: 60, left: 50, fontSize: 14, opacity: 0.4 }]}>✨</Text>
      </View>

      <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodyTranslate }], alignItems: 'center' }}>
        <View style={[styles.tagPill, { backgroundColor: step.tagBg }]}>
          <Text style={[styles.tagText, fw(800), { color: step.tagColor }]}>{step.tag}</Text>
        </View>
        <Text style={[styles.title, fw(900)]}>{step.title}</Text>
        <Text style={[styles.desc, fw(600)]}>{step.desc}</Text>

        {step.features && (
          <View style={styles.featuresList}>
            {step.features.map((feat, i) => (
              <FeatureRow key={i} emoji={feat.emoji} text={feat.text} delay={i * 100} />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function FeatureRow({ emoji, text, delay }: { emoji: string; text: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.featureRow, { opacity, transform: [{ translateX }] }]}>
      <View style={styles.featureIcon}>
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>
      <Text style={[styles.featureText, fw(700)]}>{text} hello</Text>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const step = ONBOARD_STEPS[stepIndex];
  const isLast = stepIndex === TOTAL - 1;

  const goToAuth = () => router.replace('/login');

  const handleNext = () => {
    if (isLast) {
      goToAuth();
    } else {
      setStepIndex((s) => s + 1);
    }
  };

  return (
    <LinearGradient colors={step.colors} style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.dots}>
          {ONBOARD_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: i === stepIndex ? 28 : 8,
                  backgroundColor: i <= stepIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                },
              ]}
            />
          ))}
        </View>
        {!isLast && (
          <TouchableOpacity onPress={goToAuth} activeOpacity={0.7}>
            <Text style={[styles.skip, fw(700)]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <OnboardContent key={stepIndex} step={step} index={stepIndex} />

      <View style={styles.ctaArea}>
        <GradientButton
          label={isLast ? "Let's eat! 🍽️" : 'Continue'}
          colors={step.btnColors}
          onPress={handleNext}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 32, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  skip: { fontSize: 14, color: 'rgba(255,255,255,0.6)', padding: 4 },
  illustrationArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbitStage: { width: 260, height: 260, marginBottom: 16 },
  mainEmoji: { position: 'absolute', top: '50%', left: '50%', marginTop: -40, marginLeft: -40, width: 80, height: 80, fontSize: 80, textAlign: 'center' },
  orbitEmoji: { position: 'absolute' },
  sparkle: { position: 'absolute' },
  tagPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
  tagText: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 26, color: '#fff', lineHeight: 32, textAlign: 'center', maxWidth: 300 },
  desc: { fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 22, textAlign: 'center', maxWidth: 280, marginTop: 12 },
  featuresList: { gap: 10, marginTop: 20, width: '100%' },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  ctaArea: { paddingBottom: 8 },
});
