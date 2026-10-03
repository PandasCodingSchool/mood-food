// 2.0 Home: live context header, tonight's top pick (real recommendations),
// more picks, decision games, mood streak, and the v1 learning prompts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WEATHER_SPECS, palette, space } from '@moodfood/tokens';
import { Button, Icon, IconButton, IconTile, Screen, SectionHeader, Surface, Text, useTheme, useToast, type IconName } from '@moodfood/ui';
import { AppTabBar, ErrorBlock, LoadingBlock, LogoPill, PoweredBySwiggy } from '../src/components/v2';
import { HeroPick, QuickChip, RailCard } from '../src/components/v2/RecCards';
import PostMealPrompt from '../src/components/PostMealPrompt';
import NostalgiaPrompt from '../src/components/NostalgiaPrompt';
import TwinTasteSection from '../src/components/TwinTasteSection';
import { GAMES } from '../src/constants/games';
import { MOOD_COPY, TIME_COPY, WEATHER_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { getActiveOrder, isTerminal, type ActiveOrder } from '../src/services/activeOrder';
import { fetchCurrentUser } from '../src/services/auth';
import { hasCheckedInToday } from '../src/services/moodState';
import { getMoodRecommendations } from '../src/services/moodRecs';
import { fetchNotifications } from '../src/services/notifications';
import { markNostalgiaPromptShown, shouldShowNostalgiaPrompt } from '../src/services/nostalgiaGate';
import { openMeal, startOrder } from '../src/services/orderFlow';
import { fetchStreak } from '../src/services/quests';
import { fetchLearnedProfile, flushSignals } from '../src/services/signals';
import type { LearnedProfile, RecommendationResponse } from '../src/types';
import { trackEvent } from '../src/utils/analytics';
import { recView } from '../src/utils/recView';

// Ask for today's check-in once per app session; "Skip" then sticks.
let promptedCheckinThisSession = false;

export default function HomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors, dark } = useTheme();
  const { time, weather, mood, temperature } = useLiveMood();
  const [name, setName] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [unread, setUnread] = useState(0);
  const [profile, setProfile] = useState<LearnedProfile | null>(null);
  const [checkedIn, setCheckedIn] = useState(true);
  const [showNostalgia, setShowNostalgia] = useState(false);
  const [recs, setRecs] = useState<RecommendationResponse | null>(null);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [allGames, setAllGames] = useState(false);
  const [liveOrder, setLiveOrder] = useState<ActiveOrder | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    trackEvent('landing_page_viewed');
    fetchCurrentUser().then((u) => setName(u?.name?.split(' ')[0] ?? null)).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        void flushSignals();
        getActiveOrder().then((o) => !cancelled && setLiveOrder(o && !isTerminal(o.step) ? o : null));
        const done = await hasCheckedInToday();
        if (cancelled) return;
        setCheckedIn(done);
        if (!done && !promptedCheckinThisSession) {
          promptedCheckinThisSession = true;
          router.push({ pathname: '/mood-checkin', params: { next: '/home' } });
          return;
        }
        const [learned, s, notifs] = await Promise.all([
          fetchLearnedProfile().catch(() => null),
          fetchStreak().catch(() => 0),
          fetchNotifications().catch(() => ({ unreadCount: 0 })),
        ]);
        if (cancelled) return;
        setProfile(learned);
        setStreak(s);
        setUnread(notifs.unreadCount || 0);
        if (await shouldShowNostalgiaPrompt()) setShowNostalgia(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  const loadRecs = useCallback(async () => {
    setRecsError(null);
    try {
      setRecs(await getMoodRecommendations(mood));
    } catch (e) {
      setRecsError(e instanceof Error ? e.message : 'Could not load your picks');
    }
  }, [mood]);

  useEffect(() => {
    if (loadedFor.current === mood) return;
    loadedFor.current = mood;
    setRecs(null);
    void loadRecs();
  }, [mood, loadRecs]);

  const t = TIME_COPY[time];
  const w = WEATHER_SPECS[weather];
  const list = recs?.recommendations ?? [];
  const top = list[0];
  const topV = top ? recView(top) : null;
  const games = allGames ? GAMES : GAMES.slice(0, 4);
  const openGame = (g: (typeof GAMES)[number]) => (g.comingSoon ? toast(`${g.title} is coming soon`) : router.push(g.route as never));

  const quick: Array<{ icon: IconName; label: string; go: () => void }> = [
    { icon: 'bolt', label: 'Quick pick', go: () => router.push('/games/wheel') },
    { icon: 'sentiment_satisfied', label: 'All my matches', go: () => router.replace('/recommendations') },
    ...(profile?.mode === 'mind_reader' ? [{ icon: 'auto_awesome' as IconName, label: 'Read my mind', go: () => router.push('/mind-reader') }] : []),
    { icon: 'history', label: 'Order again', go: () => router.push('/history') },
  ];

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />}>
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LogoPill />
          <Surface radius={20} style={{ height: 40, paddingLeft: 10, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={w.icon as IconName} size={19} tone="accText" />
            <Text variant="caption13" style={{ fontFamily: 'Geist_500Medium' }}>
              {temperature != null ? `${Math.round(temperature)}° · ${w.label}` : w.label}
            </Text>
          </Surface>
          <IconButton icon="notifications" label={unread ? `Notifications, ${unread} unread` : 'Notifications'} size={40} badge={unread > 0} style={{ marginLeft: 'auto' }} onPress={() => router.push('/notifications')} />
          <Pressable
            onPress={() => router.replace('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="bodyStrong15" style={{ fontFamily: 'BricolageGrotesque_700Bold' }} color={colors.onAcc}>
              {(name?.[0] ?? '·').toUpperCase()}
            </Text>
          </Pressable>
        </View>

        {liveOrder ? <LiveOrderBanner order={liveOrder} onPress={() => router.push({ pathname: '/order/track', params: { orderId: liveOrder.orderId } })} /> : null}

        <View style={{ paddingHorizontal: space.page, paddingTop: 24 }}>
          <Text variant="body15" tone="ink2">{t.greet(name)}</Text>
          <Text variant="display40" style={{ marginTop: 6 }} accessibilityRole="header">{t.hero}</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/mood-checkin', params: { next: '/home' } })}
            accessibilityRole="button"
            style={{ marginTop: 16, alignSelf: 'flex-start', height: 36, paddingLeft: 8, paddingRight: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.acc }} />
            <Text variant="caption13" style={{ fontFamily: 'Geist_500Medium' }}>{checkedIn ? `Feeling ${MOOD_COPY[mood].lower}` : 'How are you feeling?'}</Text>
            <Text variant="button13" tone="accText">{checkedIn ? '· Re-check' : '· Check in'}</Text>
          </Pressable>
        </View>

        <Surface radius={18} style={{ marginHorizontal: space.gutter, marginTop: 20, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon name={w.icon as IconName} size={22} tone="accText" />
          <Text variant="body13" style={{ flex: 1 }}>{WEATHER_COPY[weather].insight}</Text>
        </Surface>

        <View style={{ marginTop: 14 }}>
          {topV && top ? (
            <HeroPick
              v={topV}
              height={410}
              eyebrow={`Your ${t.meal} pick`}
              topFor={WEATHER_COPY[weather].topFor}
              why={topV.why}
              onOpen={() => openMeal(router, top, 0)}
              actions={
                <>
                  <Button label="Order now" size="md" style={{ flex: 1 }} onPress={() => void startOrder(router, top, 0)} />
                  <Button label="See why" size="md" variant="photo" onPress={() => openMeal(router, top, 0)} />
                </>
              }
            />
          ) : recsError ? (
            <ErrorBlock message={recsError} onRetry={loadRecs} />
          ) : (
            <LoadingBlock label="Finding tonight's pick" />
          )}
        </View>
        <View style={{ paddingHorizontal: space.page, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="tune" size={15} tone="ink2" />
          <Text variant="micro12" tone="ink2">Based on your mood, the weather and the time of day</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.gutter, paddingTop: 18, paddingBottom: 2 }}>
          {quick.map((q) => (
            <QuickChip key={q.label} icon={q.icon} label={q.label} onPress={q.go} />
          ))}
        </ScrollView>

        {list.length > 1 ? (
          <>
            <SectionHeader title="More for your mood" action="See all" onAction={() => router.replace('/recommendations')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}>
              {list.slice(1, 5).map((r, i) => (
                <RailCard key={r.id} v={recView(r)} onOpen={() => openMeal(router, r, i + 1)} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <PostMealPrompt />
        {showNostalgia ? (
          <NostalgiaPrompt
            onDismiss={() => {
              setShowNostalgia(false);
              void markNostalgiaPromptShown();
            }}
          />
        ) : null}

        <SectionHeader title="Can't decide? Play it out" action={allGames ? 'Fewer' : 'All games'} onAction={() => setAllGames(!allGames)} />
        <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {games.map((g) => (
            <Pressable key={g.id} onPress={() => openGame(g)} accessibilityRole="button" accessibilityLabel={g.title} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Surface radius={24} padding={16} style={{ minHeight: 156, gap: 8 }}>
                <IconTile icon={g.icon} hue={g.hue} />
                <Text variant="title17" style={{ marginTop: 4 }}>{g.title}</Text>
                <Text variant="caption12" tone="ink2">{g.desc}</Text>
                <Text variant="labelSmall" tone="ink2" style={{ marginTop: 'auto' }}>{g.comingSoon ? 'Soon' : g.time}</Text>
              </Surface>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => router.push('/quests')} accessibilityRole="button" accessibilityLabel={`Mood streak, ${streak} days`}>
          <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 14, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text variant="label" tone="ink2">Mood streak</Text>
                <Text variant="display28" style={{ marginTop: 2 }}>{`${streak} ${streak === 1 ? 'day' : 'days'}`}</Text>
              </View>
              <Icon name="local_fire_department" size={30} tone="accText" filled={streak > 0} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {Array.from({ length: 7 }, (_, k) => (
                <View
                  key={k}
                  style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: k < Math.min(streak, 7) ? colors.acc : colors.track, opacity: k < Math.min(streak, 7) ? 1 : 0.6 }}
                />
              ))}
            </View>
            <Text variant="caption13" tone="ink2">
              {checkedIn ? 'Checked in today. See your quests and badges.' : 'Check in today to keep your streak going.'}
            </Text>
          </Surface>
        </Pressable>

        <TwinTasteSection />
        <PoweredBySwiggy style={{ paddingTop: 28 }} />
      </Screen>
    </View>
  );
}

const STAGE: Record<string, { label: string; progress: number }> = {
  placed: { label: 'Order confirmed', progress: 0.08 },
  preparing: { label: "Kitchen's on it", progress: 0.3 },
  on_the_way: { label: 'On the way', progress: 0.7 },
};

/** Dark "live order" strip at the top of home (design: home live banner). */
function LiveOrderBanner({ order, onPress }: { order: ActiveOrder; onPress: () => void }) {
  const { colors } = useTheme();
  const stage = STAGE[order.step] ?? STAGE.placed;
  const eta = order.liveEta || order.eta;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Live order from ${order.restaurant}. ${stage.label}. Open tracking.`}
      style={{ marginHorizontal: space.gutter, marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: palette.night, gap: 10, boxShadow: '0px 16px 30px -16px rgba(0,0,0,0.6)' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="two_wheeler" size={22} color={palette.onAccent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong14" color={palette.white}>{eta ? `Arriving in ${eta}` : stage.label}</Text>
          <Text variant="micro12" color="rgba(255,255,255,0.65)" numberOfLines={1} style={{ marginTop: 2 }}>{`${stage.label} · ${order.restaurant}`}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success }} />
          <Text variant="labelSmall" color={palette.success} style={{ fontFamily: 'GeistMono_500Medium' }}>LIVE</Text>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${stage.progress * 100}%`, borderRadius: 2, backgroundColor: colors.acc }} />
      </View>
    </Pressable>
  );
}
