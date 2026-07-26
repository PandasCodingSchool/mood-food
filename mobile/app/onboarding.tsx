import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Utensils } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { ONBOARD_STEPS, type OnboardIcon } from '../src/constants/onboarding';
import { fw, colors } from '../src/constants/theme';
import GradientButton from '../src/components/GradientButton';
import { bounceIn, fadeUp, floatLoop } from '../src/utils/animations';

const TOTAL = ONBOARD_STEPS.length;

function OrbitIcon({ Icon, size, style, duration, delay }: { Icon: OnboardIcon; size: number; style: object; duration: number; delay: number }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => floatLoop(translateY, 10, duration), delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.orbitIcon, style, { transform: [{ translateY }] }]}>
      <Icon size={size} color={colors.orange} />
    </Animated.View>
  );
}

function OnboardContent({ step, index }: { step: (typeof ONBOARD_STEPS)[number]; index: number }) {
  const { theme } = useTheme();
  const MainIcon = step.mainIcon;
  const mainScale = useRef(new Animated.Value(0.3)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const bodyTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    bounceIn(mainScale);
    fadeUp(bodyOpacity, bodyTranslate, 150);
  }, []);

  return (
    <View style={styles.illustrationContent}>
      <View style={styles.orbitStage}>
        <Animated.View style={[styles.mainIcon, { transform: [{ scale: mainScale }] }]}>
          <MainIcon size={88} color={theme.text} />
        </Animated.View>
        <OrbitIcon Icon={step.orbit[0]} size={32} style={{ top: 10, left: 30, opacity: 0.8 }} duration={3000} delay={0} />
        <OrbitIcon Icon={step.orbit[1]} size={28} style={{ top: 20, right: 25, opacity: 0.7 }} duration={2500} delay={400} />
        <OrbitIcon Icon={step.orbit[2]} size={26} style={{ bottom: 30, left: 15, opacity: 0.6 }} duration={2800} delay={800} />
        <OrbitIcon Icon={step.orbit[3]} size={30} style={{ bottom: 15, right: 35, opacity: 0.75 }} duration={3200} delay={200} />
        <View style={{ position: 'absolute', top: 50, right: 10, opacity: 0.5 }}>
          <Sparkles size={16} color={theme.subtext} />
        </View>
        <View style={{ position: 'absolute', bottom: 60, left: 50, opacity: 0.4 }}>
          <Sparkles size={14} color={theme.subtext} />
        </View>
      </View>

      <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodyTranslate }], alignItems: 'center', width: '100%' }}>
        <View style={[styles.tagPill, { backgroundColor: step.accent + '18', borderColor: step.accent + '30' }]}>
          <Text style={[styles.tagText, fw(800), { color: step.accent }]}>{step.tag}</Text>
        </View>
        <Text style={[styles.title, fw(900), { color: theme.text }]}>{step.title}</Text>
        <Text style={[styles.desc, fw(600), { color: theme.subtext }]}>{step.desc}</Text>

        {step.features && (
          <View style={styles.featuresList}>
            {step.features.map((feat, i) => (
              <FeatureRow key={i} Icon={feat.Icon} text={feat.text} accent={step.accent} delay={i * 100} />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function FeatureRow({ Icon, text, accent, delay }: { Icon: OnboardIcon; text: string; accent: string; delay: number }) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.featureRow, { opacity, transform: [{ translateX }], backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: accent + '18' }]}>
        <Icon size={18} color={accent} />
      </View>
      <Text style={[styles.featureText, fw(700), { color: theme.text }]}>{text}</Text>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
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
    <LinearGradient colors={[theme.bg, theme.surface]} style={styles.container}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.dots}>
            {ONBOARD_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === stepIndex ? 28 : 8,
                    backgroundColor: i <= stepIndex ? theme.text : theme.border,
                  },
                ]}
              />
            ))}
          </View>
          {!isLast && (
            <TouchableOpacity onPress={goToAuth} activeOpacity={0.7}>
              <Text style={[styles.skip, fw(700), { color: theme.subtext }]}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <OnboardContent key={stepIndex} step={step} index={stepIndex} />

        <View style={styles.ctaArea}>
          <GradientButton
            label={isLast ? "Let's eat!" : 'Continue'}
            icon={isLast ? <Utensils size={18} color="#fff" /> : undefined}
            colors={step.btnColors ?? [colors.orange, '#fbbf24']}
            onPress={handleNext}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 60, paddingHorizontal: 32, paddingBottom: 40, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  skip: { fontSize: 14, padding: 4 },
  illustrationContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  orbitStage: { width: 260, height: 260, marginBottom: 16, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  mainIcon: { alignItems: 'center', justifyContent: 'center' },
  orbitIcon: { position: 'absolute' },
  tagPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 16, borderWidth: 1 },
  tagText: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 26, lineHeight: 32, textAlign: 'center', maxWidth: 300 },
  desc: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 280, marginTop: 12 },
  featuresList: { gap: 10, marginTop: 20, width: '100%' },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: 13 },
  ctaArea: { paddingBottom: 8 },
});
