import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { trackEvent } from '../src/utils/analytics';

const FOOD_EMOJIS = ['🍕', '🍜', '🌮', '🍣', '🍛', '🥗', '🍔', '🧆', '🍱', '🥘'];

function FloatingEmoji({ emoji, delay, startX }: { emoji: string; delay: number; startX: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(0);
      opacity.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -120, duration: 4000, useNativeDriver: true }),
        ]),
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start(() => animate());
    };
    animate();
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: startX,
        bottom: 60,
        fontSize: 28,
        opacity,
        transform: [{ translateY }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    trackEvent('landing_page_viewed');
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <StatusBar barStyle="dark-content" backgroundColor="#fff7ed" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View className="relative min-h-screen items-center justify-center px-6 py-20">
          {/* Floating emojis */}
          {FOOD_EMOJIS.map((emoji, i) => (
            <FloatingEmoji
              key={i}
              emoji={emoji}
              delay={i * 400}
              startX={(i * 37) % 320}
            />
          ))}

          <Animated.View
            style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
            className="items-center"
          >
            {/* Badge */}
            <View className="mb-6 bg-orange-100 rounded-full px-4 py-2">
              <Text className="text-orange-600 text-sm font-semibold">
                🤖 AI-Powered Food Discovery
              </Text>
            </View>

            {/* Headline */}
            <Text className="text-4xl font-bold text-gray-900 text-center leading-tight mb-4">
              From "I'm hungry"{'\n'}to eating in{' '}
              <Text className="text-orange-500">90 seconds</Text>
            </Text>

            <Text className="text-gray-500 text-lg text-center mb-10 leading-relaxed">
              Answer a few questions, play a game,{'\n'}and get 3 AI-curated meal picks — instantly.
            </Text>

            {/* CTA Buttons */}
            <TouchableOpacity
              className="w-full bg-orange-500 rounded-2xl py-4 mb-4 items-center shadow-lg"
              activeOpacity={0.85}
              onPress={() => {
                trackEvent('quiz_started');
                router.push('/game-selector');
              }}
            >
              <Text className="text-white text-lg font-bold">🍽️ Find My Meal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="w-full border-2 border-orange-300 rounded-2xl py-4 items-center"
              activeOpacity={0.85}
              onPress={() => router.push('/waitlist')}
            >
              <Text className="text-orange-600 text-lg font-semibold">Join Waitlist</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* How It Works */}
        <View className="px-6 py-12 bg-white">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-8">
            How It Works
          </Text>
          {[
            { step: '1', icon: '🎮', title: 'Pick a Game', desc: 'Quiz, Swipe, Spin or Story mode' },
            { step: '2', icon: '🧠', title: 'Share Your Mood', desc: 'Answer a few quick questions' },
            { step: '3', icon: '✨', title: 'Get Your Picks', desc: '3 AI-curated meal recommendations' },
          ].map(({ step, icon, title, desc }) => (
            <View key={step} className="flex-row items-start mb-6">
              <View className="w-10 h-10 rounded-full bg-orange-500 items-center justify-center mr-4 mt-1">
                <Text className="text-white font-bold">{step}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-gray-900">
                  {icon} {title}
                </Text>
                <Text className="text-gray-500 mt-1">{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* The Difference */}
        <View className="px-6 py-12 bg-orange-500">
          <Text className="text-2xl font-bold text-white text-center mb-4">
            The difference
          </Text>
          <Text className="text-orange-100 text-center text-base leading-relaxed">
            Other apps answer "How do I order?"{'\n'}
            <Text className="text-white font-bold">MoodFood answers "What should I eat?"</Text>
          </Text>
        </View>

        {/* Footer nudge */}
        <View className="px-6 py-8 items-center bg-white">
          <TouchableOpacity
            className="bg-orange-500 rounded-2xl py-4 px-8 items-center"
            activeOpacity={0.85}
            onPress={() => {
              trackEvent('quiz_started');
              router.push('/game-selector');
            }}
          >
            <Text className="text-white text-lg font-bold">Get Started Free</Text>
          </TouchableOpacity>
          <Text className="text-gray-400 text-sm mt-4 text-center">
            Built for people who hate deciding what to eat 🍽️
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
