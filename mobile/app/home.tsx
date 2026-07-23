import { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import BottomNav from '../src/components/BottomNav';
import PostMealPrompt from '../src/components/PostMealPrompt';
import NostalgiaPrompt from '../src/components/NostalgiaPrompt';
import TwinTasteSection from '../src/components/TwinTasteSection';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import { hasCheckedInToday } from '../src/services/moodState';
import { fetchLearnedProfile, flushSignals } from '../src/services/signals';
import { shouldShowNostalgiaPrompt, markNostalgiaPromptShown } from '../src/services/nostalgiaGate';
import type { LearnedProfile } from '../src/types';

const GAMES = [
  {
    id: 'character',
    route: '/games/character',
    title: 'Character Match',
    desc: "Find out which TV character you are tonight — and what they'd eat",
    emoji: '🎭',
    bgEmoji: '🎬',
    meta: '2 min · Fun quiz',
    colors: ['#7c3aed', '#a78bfa'] as const,
  },
  {
    id: 'story',
    route: '/games/story',
    title: 'Day Story',
    desc: "Live a mini workday — we'll read your mood from your choices",
    emoji: '🏙️',
    bgEmoji: '📖',
    meta: '3 min · Story mode',
    colors: ['#0891b2', '#22d3ee'] as const,
  },
  {
    id: 'quiz',
    route: '/games/quiz',
    title: 'Mood Scoop',
    desc: 'Scoop your mood with quick questions about cravings & budget',
    emoji: '🍨',
    bgEmoji: '🍦',
    meta: '90 sec · Quick picks',
    colors: ['#f97316', '#fbbf24'] as const,
  },
  {
    id: 'swipe-vibe',
    route: '/games/swipe-vibe',
    title: 'Snack Match',
    desc: 'Swipe food cards left or right until your cravings click',
    emoji: '👆',
    bgEmoji: '🃏',
    meta: '1 min · Swipe game',
    colors: ['#e11d48', '#fb7185'] as const,
  },
  {
    id: 'wheel',
    route: '/games/wheel',
    title: 'Meal Roulette',
    desc: 'Spin for a meal vibe — accept the winner or roll again',
    emoji: '🎡',
    bgEmoji: '🎰',
    meta: '30 sec · Instant pick',
    colors: ['#16a34a', '#4ade80'] as const,
  },
  {
    id: 'this-or-that',
    route: '/games/this-or-that',
    title: 'This or That',
    desc: 'Quick-fire duels that teach us what you really trade off for',
    emoji: '⚔️',
    bgEmoji: '🥊',
    meta: '45 sec · Duels',
    colors: ['#1e1b4b', '#4338ca'] as const,
  },
  {
    id: 'craving-radar',
    route: '/games/craving-radar',
    title: 'Craving Radar',
    desc: 'Tap the sensations pulling you — crunchy, melty, spicy, fresh',
    emoji: '📡',
    bgEmoji: '✨',
    meta: '10 sec · Tap cloud',
    colors: ['#7c2d12', '#f97316'] as const,
  },
  {
    id: 'bracket',
    route: '/games/bracket',
    title: 'Summer Cravings Bracket',
    desc: 'Tournament-style — pick a winner each round, limited time',
    emoji: '🏆',
    bgEmoji: '☀️',
    meta: '1 min · Seasonal',
    colors: ['#b45309', '#f59e0b'] as const,
  },
  {
    id: 'group',
    route: '/group',
    title: 'Group Decide',
    desc: "Everyone swipes, we find what nobody's miserable about",
    emoji: '👯',
    bgEmoji: '🎯',
    meta: '2 min · With friends',
    colors: ['#be185d', '#f472b6'] as const,
  },
  {
    id: 'pantry',
    route: '/games/pantry',
    title: "What's in Your Kitchen",
    desc: 'Tell us what you have — cook it or order instead',
    emoji: '🥫',
    bgEmoji: '🧑‍🍳',
    meta: '20 sec · Cook or order',
    colors: ['#166534', '#22c55e'] as const,
  },
];

function GameCard({ game, index }: { game: (typeof GAMES)[number]; index: number }) {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => {
          trackEvent('game_selected', { game: game.id });
          router.push(game.route as never);
        }}
      >
        <LinearGradient
          colors={game.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20, minHeight: 160, overflow: 'hidden', marginBottom: 16 }}
        >
          <Text
            style={{
              position: 'absolute',
              top: -20,
              right: -10,
              fontSize: 80,
              opacity: 0.2,
              transform: [{ rotate: '15deg' }],
            }}
          >
            {game.bgEmoji}
          </Text>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>{game.emoji}</Text>
          <Text style={[fw(800), { fontSize: 18, color: '#fff' }]}>{game.title}</Text>
          <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 18 }]}>
            {game.desc}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <Text style={{ fontSize: 12 }}>⏱</Text>
            <Text style={[fw(700), { fontSize: 12, color: 'rgba(255,255,255,0.9)' }]}>{game.meta}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<LearnedProfile | null>(null);
  const [showNostalgia, setShowNostalgia] = useState(false);

  useEffect(() => {
    trackEvent('landing_page_viewed');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        void flushSignals();
        const checkedIn = await hasCheckedInToday();
        if (!checkedIn) {
          router.replace({ pathname: '/mood-checkin', params: { next: '/home' } });
          return;
        }
        const learned = await fetchLearnedProfile();
        if (!cancelled) setProfile(learned);
        if (!cancelled && (await shouldShowNostalgiaPrompt())) setShowNostalgia(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  // 5.5 — adaptive question budget: fewer games shown as confidence grows.
  const visibleGames =
    profile?.question_budget != null && profile.question_budget < GAMES.length
      ? GAMES.slice(0, Math.max(2, profile.question_budget + 1))
      : GAMES;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={[fw(700), { fontSize: 14, color: '#94a3b8' }]}>Hey there 👋</Text>
          <Text style={[fw(900), { fontSize: 24, color: '#1a1a2e' }]}>What's your vibe?</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.8}>
          <LinearGradient
            colors={['#f97316', '#fbbf24']}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 20 }}>😎</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {profile?.question_budget != null && (
        <TouchableOpacity
          activeOpacity={profile.mode === 'mind_reader' ? 0.85 : 1}
          onPress={() => profile.mode === 'mind_reader' && router.push('/mind-reader')}
          style={{ marginHorizontal: 24, marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(124,58,237,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ fontSize: 16 }}>🔮</Text>
          <Text style={[fw(700), { fontSize: 12, color: colors.purple, flex: 1 }]}>
            {profile.mode === 'mind_reader'
              ? "I've learned enough — tap and I'll just tell you what you want."
              : `I only need ${profile.question_budget} question${profile.question_budget === 1 ? '' : 's'} today.`}
          </Text>
          {profile.mode === 'mind_reader' && <Text style={{ fontSize: 14, color: colors.purple }}>→</Text>}
        </TouchableOpacity>
      )}

      <PostMealPrompt />

      {showNostalgia && (
        <NostalgiaPrompt
          onDismiss={() => {
            setShowNostalgia(false);
            void markNostalgiaPromptShown();
          }}
        />
      )}

      <TwinTasteSection />

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {visibleGames.map((game, i) => (
          <GameCard key={game.id} game={game} index={i} />
        ))}
      </ScrollView>

      <BottomNav active="games" />
    </View>
  );
}
