import { useRef, useEffect, useState, useCallback } from 'react';
import type { ComponentType } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, Sparkles, ChevronRight, Clock, Smile, Film, Building2, BookOpen, HelpCircle, IceCream, Hand, Layers, Disc, Gamepad2, Swords, Scale, ScanLine, Trophy, Sun, Users, Target, Package, ChefHat } from 'lucide-react-native';
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
import { shouldShowNostalgiaPrompt, markNostalgiaPromptShown } from '../src/services/nostalgiaGate';
import type { LearnedProfile } from '../src/types';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

const GAMES: Array<{
  id: string;
  route: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
  bgIcon: LucideIcon;
  meta: string;
  colors: readonly [string, string];
}> = [
  {
    id: 'character',
    route: '/games/character',
    title: 'Character Match',
    desc: "Find out which TV character you are tonight — and what they'd eat",
    Icon: Smile,
    bgIcon: Film,
    meta: '2 min · Fun quiz',
    colors: ['#7c3aed', '#a78bfa'] as const,
  },
  {
    id: 'story',
    route: '/games/story',
    title: 'Day Story',
    desc: "Live a mini workday — we'll read your mood from your choices",
    Icon: Building2,
    bgIcon: BookOpen,
    meta: '3 min · Story mode',
    colors: ['#0891b2', '#22d3ee'] as const,
  },
  {
    id: 'quiz',
    route: '/games/quiz',
    title: 'Mood Scoop',
    desc: 'Scoop your mood with quick questions about cravings & budget',
    Icon: HelpCircle,
    bgIcon: IceCream,
    meta: '90 sec · Quick picks',
    colors: ['#f97316', '#fbbf24'] as const,
  },
  {
    id: 'swipe-vibe',
    route: '/games/swipe-vibe',
    title: 'Snack Match',
    desc: 'Swipe food cards left or right until your cravings click',
    Icon: Hand,
    bgIcon: Layers,
    meta: '1 min · Swipe game',
    colors: ['#e11d48', '#fb7185'] as const,
  },
  {
    id: 'wheel',
    route: '/games/wheel',
    title: 'Meal Roulette',
    desc: 'Spin for a meal vibe — accept the winner or roll again',
    Icon: Disc,
    bgIcon: Gamepad2,
    meta: '30 sec · Instant pick',
    colors: ['#16a34a', '#4ade80'] as const,
  },
  {
    id: 'this-or-that',
    route: '/games/this-or-that',
    title: 'This or That',
    desc: 'Quick-fire duels that teach us what you really trade off for',
    Icon: Swords,
    bgIcon: Scale,
    meta: '45 sec · Duels',
    colors: ['#1e1b4b', '#4338ca'] as const,
  },
  {
    id: 'craving-radar',
    route: '/games/craving-radar',
    title: 'Craving Radar',
    desc: 'Tap the sensations pulling you — crunchy, melty, spicy, fresh',
    Icon: ScanLine,
    bgIcon: Sparkles,
    meta: '10 sec · Tap cloud',
    colors: ['#7c2d12', '#f97316'] as const,
  },
  {
    id: 'bracket',
    route: '/games/bracket',
    title: 'Summer Cravings Bracket',
    desc: 'Tournament-style — pick a winner each round, limited time',
    Icon: Trophy,
    bgIcon: Sun,
    meta: '1 min · Seasonal',
    colors: ['#b45309', '#f59e0b'] as const,
  },
  {
    id: 'group',
    route: '/group',
    title: 'Group Decide',
    desc: "Everyone swipes, we find what nobody's miserable about",
    Icon: Users,
    bgIcon: Target,
    meta: '2 min · With friends',
    colors: ['#be185d', '#f472b6'] as const,
  },
  {
    id: 'pantry',
    route: '/games/pantry',
    title: "What's in Your Kitchen",
    desc: 'Tell us what you have — cook it or order instead',
    Icon: Package,
    bgIcon: ChefHat,
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
          {(() => {
            const BgIcon = game.bgIcon;
            const Icon = game.Icon;
            return (
              <>
                <View style={{ position: 'absolute', top: -20, right: -10, opacity: 0.2, transform: [{ rotate: '15deg' }] }}>
                  <BgIcon size={80} color="#fff" />
                </View>
                <View style={{ marginBottom: 8 }}>
                  <Icon size={32} color="#fff" />
                </View>
              </>
            );
          })()}
          <Text style={[fw(800), { fontSize: 18, color: '#fff' }]}>{game.title}</Text>
          <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 18 }]}>
            {game.desc}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <Clock size={12} color="rgba(255,255,255,0.9)" />
            <Text style={[fw(700), { fontSize: 12, color: 'rgba(255,255,255,0.9)' }]}>{game.meta}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
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
            <Text style={[fw(900), { fontSize: 22, color: theme.text }]}>What's your vibe?</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications')} activeOpacity={0.7}>
          <Bell size={28} color={colors.orange} />
        </TouchableOpacity>
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
