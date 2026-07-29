import { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Bell, Flame, Play, Sparkles, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import Screen from '../src/components/Screen';
import BottomNav from '../src/components/BottomNav';
import PostMealPrompt from '../src/components/PostMealPrompt';
import NostalgiaPrompt from '../src/components/NostalgiaPrompt';
import TwinTasteSection from '../src/components/TwinTasteSection';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import { hasCheckedInToday } from '../src/services/moodState';
import { fetchLearnedProfile, flushSignals } from '../src/services/signals';
import { fetchStreak } from '../src/services/quests';
import { fetchNotifications } from '../src/services/notifications';
import { shouldShowNostalgiaPrompt, markNostalgiaPromptShown } from '../src/services/nostalgiaGate';
import { fadeUp, floatLoop, bounceIn, pressScale } from '../src/utils/animations';
import type { LearnedProfile } from '../src/types';

const GAMES: Array<{
  id: string;
  route: string;
  title: string;
  desc: string;
  emoji: string;
  bgEmoji: string;
  meta: string;
  colors: readonly [string, string];
  comingSoon?: boolean;
}> = [
  {
    id: 'character',
    route: '/games/character',
    title: 'Character Match',
    desc: "Find out which TV character you are tonight — and what they'd eat",
    emoji: '🎭',
    bgEmoji: '🍿',
    meta: '2 min · Fun quiz',
    colors: ['#7c3aed', '#a78bfa'] as const,
  },
  {
    id: 'story',
    route: '/games/story',
    title: 'Day Story',
    desc: "Live a mini workday — we'll read your mood from your choices",
    emoji: '📖',
    bgEmoji: '☕',
    meta: '3 min · Story mode',
    colors: ['#0891b2', '#22d3ee'] as const,
  },
  {
    id: 'quiz',
    route: '/games/quiz',
    title: 'Mood Scoop',
    desc: 'Scoop your mood with quick questions about cravings & budget',
    emoji: '❓',
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
    bgEmoji: '🍪',
    meta: '1 min · Swipe game',
    colors: ['#e11d48', '#fb7185'] as const,
  },
  {
    id: 'wheel',
    route: '/games/wheel',
    title: 'Meal Roulette',
    desc: 'Spin for a meal vibe — accept the winner or roll again',
    emoji: '🎰',
    bgEmoji: '🎮',
    meta: '30 sec · Instant pick',
    colors: ['#16a34a', '#4ade80'] as const,
  },
  {
    id: 'this-or-that',
    route: '/games/this-or-that',
    title: 'This or That',
    desc: 'Quick-fire duels that teach us what you really trade off for',
    emoji: '⚔️',
    bgEmoji: '⚖️',
    meta: '45 sec · Duels',
    colors: ['#1e1b4b', '#4338ca'] as const,
  },
  {
    id: 'craving-radar',
    route: '/games/craving-radar',
    title: 'Craving Radar',
    desc: 'Tap the sensations pulling you — crunchy, melty, spicy, fresh',
    emoji: '🛰️',
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
    emoji: '👥',
    bgEmoji: '🎯',
    meta: '2 min · With friends',
    colors: ['#be185d', '#f472b6'] as const,
    comingSoon: true,
  },
  {
    id: 'pantry',
    route: '/games/pantry',
    title: "What's in Your Kitchen",
    desc: 'Tell us what you have — cook it or order instead',
    emoji: '🥫',
    bgEmoji: '👨‍🍳',
    meta: '20 sec · Cook or order',
    colors: ['#166534', '#22c55e'] as const,
    comingSoon: true,
  },
];

function GameCard({ game, index }: { game: (typeof GAMES)[number]; index: number }) {
  const router = useRouter();
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(0.3)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeUp(opacity, translateY, index * 80);
    bounceIn(emojiScale, 100);
    const floatAnim = floatLoop(floatY, 10, 1800);
    return () => floatAnim.stop();
  }, []);

  const accent = game.comingSoon ? theme.muted : game.colors[0];

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        activeOpacity={game.comingSoon ? 1 : 0.92}
        disabled={game.comingSoon}
        onPressIn={() => !game.comingSoon && pressScale(scale, 0.97)}
        onPressOut={() => !game.comingSoon && pressScale(scale, 1)}
        onPress={() => {
          if (game.comingSoon) return;
          trackEvent('game_selected', { game: game.id });
          router.push(game.route as never);
        }}
        style={{
          marginBottom: 14,
          borderRadius: 22,
          backgroundColor: game.comingSoon ? theme.surface : theme.card,
          borderWidth: 1.5,
          borderColor: accent,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
          overflow: 'hidden',
        }}
      >
        <View style={{ padding: 18, minHeight: 118, overflow: 'hidden' }}>
          <Animated.View
            style={{
              position: 'absolute',
              top: -18,
              right: -14,
              opacity: game.comingSoon ? 0.08 : 0.18,
              transform: [{ rotate: '12deg' }, { translateY: floatY }],
            }}
          >
            <Text style={{ fontSize: 96 }}>{game.bgEmoji}</Text>
          </Animated.View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Animated.View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: game.comingSoon ? theme.overlay : `${accent}18`,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: emojiScale }],
              }}
            >
              <Text style={{ fontSize: 28, opacity: game.comingSoon ? 0.5 : 1 }}>{game.emoji}</Text>
            </Animated.View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  style={[
                    fw(800),
                    { fontSize: 17, color: game.comingSoon ? theme.muted : theme.text },
                  ]}
                >
                  {game.title}
                </Text>
                {game.comingSoon && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: theme.overlay,
                    }}
                  >
                    <Text style={[fw(800), { fontSize: 9, color: theme.muted }]}>COMING SOON</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  fw(600),
                  {
                    fontSize: 12,
                    color: game.comingSoon ? theme.muted : theme.subtext,
                    marginTop: 3,
                    lineHeight: 17,
                  },
                ]}
                numberOfLines={2}
              >
                {game.desc}
              </Text>
            </View>

            {!game.comingSoon && (
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: `${accent}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={18} color={accent} fill={accent} />
              </View>
            )}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 6,
              marginTop: 14,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
              backgroundColor: game.comingSoon ? theme.overlay : `${accent}15`,
            }}
          >
            <Text style={{ fontSize: 11, color: game.comingSoon ? theme.muted : accent }}>⏱️</Text>
            <Text
              style={[
                fw(700),
                { fontSize: 11, color: game.comingSoon ? theme.muted : accent },
              ]}
            >
              {game.comingSoon ? 'Soon' : game.meta}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<LearnedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
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
        const [learned, currentStreak, notifRes] = await Promise.all([
          fetchLearnedProfile(),
          fetchStreak(),
          fetchNotifications().catch(() => ({ notifications: [], unreadCount: 0 })),
        ]);
        if (!cancelled) {
          setProfile(learned);
          setProfileLoading(false);
          setStreak(currentStreak);
          setUnreadCount(notifRes.unreadCount || 0);
        }
        if (!cancelled && (await shouldShowNostalgiaPrompt())) setShowNostalgia(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  // Always show the full game list on the home screen. The adaptive question
  // budget only controls how many questions the AI asks, not which games are
  // visible.
  const visibleGames = GAMES;

  return (
    <Screen>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={{ paddingTop: 60, paddingBottom: 5, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center'}}>
          <View style={{ width: 62, height: 62, borderRadius: 36, overflow: 'hidden', marginRight: 12 }}>
            <Image
              source={require('../assets/moodfood-logo.png')}
              style={{ width: 62, height: 62 }}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={[fw(700), { fontSize: 12, color: theme.subtext }]}>Hey there</Text>
            <Text style={[fw(900), { fontSize: 20, color: theme.text }]}>What's your vibe?</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push('/quests')}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: `${colors.orange}15`,
            }}
          >
            <Flame size={18} color={colors.orange} fill={colors.orange} />
            <Text style={[fw(800), { fontSize: 13, color: colors.orange }]}>{streak}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/notifications')} activeOpacity={0.7} style={{ position: 'relative' }}>
            <Bell size={28} color={colors.orange} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.red,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: theme.bg,
                  paddingHorizontal: 4,
                }}
              >
                <Text style={[fw(800), { fontSize: 10, color: '#fff' }]}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {profile?.question_budget != null && (
        <TouchableOpacity
          activeOpacity={profile.mode === 'mind_reader' ? 0.85 : 1}
          onPress={() => profile.mode === 'mind_reader' && router.push('/mind-reader')}
          style={{ marginHorizontal: 24, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <Sparkles size={18} color={colors.purple} />
          <Text style={[fw(700), { fontSize: 12, color: colors.purple, flex: 1 }]}>
            {profile.mode === 'mind_reader'
              ? "I've learned enough — tap and I'll just tell you what you want."
              : `I only need ${profile.question_budget} question${profile.question_budget === 1 ? '' : 's'} today.`}
          </Text>
          {profile.mode === 'mind_reader' && <ChevronRight size={18} color={colors.purple} />}
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
    </Screen>
  );
}
