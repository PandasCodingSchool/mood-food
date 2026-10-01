// 2.0 "Your matches". Games pass ?results=<QuizResults>; without it we use
// today's mood. Keeps v1 behaviour: likes/vetoes feed signals + quests, live
// Swiggy matching, background swap matching, learning prompts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MOOD_SPECS, WEATHER_SPECS, space } from '@moodfood/tokens';
import { Icon, IconButton, Screen, SectionHeader, Surface, Text, useTheme, useToast } from '@moodfood/ui';
import { AppTabBar, ErrorBlock, LoadingBlock } from '../src/components/v2';
import { HeroPick, MatchCard, SwapRow } from '../src/components/v2/RecCards';
import NostalgiaPrompt from '../src/components/NostalgiaPrompt';
import TwinTasteSection from '../src/components/TwinTasteSection';
import UnderstandMePrompt from '../src/components/UnderstandMePrompt';
import { MOOD_COPY, WEATHER_COPY } from '../src/constants/copy';
import { useLiveMood } from '../src/context/LiveMood';
import { isSwiggyLive } from '../src/services/aiRecommendations';
import { saveOrder, toggleSaved } from '../src/services/history';
import { getMoodRecommendations, onRecommendationsUpdate } from '../src/services/moodRecs';
import { markNostalgiaPromptShown, shouldShowNostalgiaPrompt } from '../src/services/nostalgiaGate';
import { openMeal } from '../src/services/orderFlow';
import { bumpQuestProgress } from '../src/services/quests';
import { fetchUnderstandMeQuestions, logSignal } from '../src/services/signals';
import type { QuizResults, Recommendation, RecommendationResponse, UnderstandMeQuestion } from '../src/types';
import { trackEvent } from '../src/utils/analytics';
import { recView } from '../src/utils/recView';

export default function RecommendationsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { dark } = useTheme();
  const { weather, mood } = useLiveMood();
  const { results: rawResults } = useLocalSearchParams<{ results?: string }>();
  const query = useMemo<QuizResults | undefined>(() => (rawResults ? JSON.parse(rawResults) : undefined), [rawResults]);

  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [vetoed, setVetoed] = useState<Record<string, string>>({});
  const [choosingVeto, setChoosingVeto] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string | false>>({});
  const [showNostalgia, setShowNostalgia] = useState(false);
  const [questions, setQuestions] = useState<UnderstandMeQuestion[]>([]);
  const [answering, setAnswering] = useState(false);
  const [understandDone, setUnderstandDone] = useState(false);

  useEffect(() => {
    shouldShowNostalgiaPrompt().then(setShowNostalgia);
    fetchUnderstandMeQuestions().then(setQuestions).catch(() => {});
    return onRecommendationsUpdate(setData);
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await getMoodRecommendations(mood, { refresh, query });
        setData(res);
        trackEvent('recommendation_viewed', { source: res.source, live_status: res.live_status });
        if (refresh) toast('Fresh picks, same mood');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recommendations');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mood, query, toast],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const toggleLike = (rec: Recommendation) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(rec.id)) {
        next.delete(rec.id);
        trackEvent('recommendation_unliked', { food: rec.dish.name });
      } else {
        next.add(rec.id);
        trackEvent('recommendation_liked', { food: rec.dish.name });
        if (rec.is_wildcard) void logSignal('wildcard_verdict', { accepted: true });
        void bumpQuestProgress('try_3_cuisines');
        toast('Noted — more like this');
      }
      return next;
    });
  };

  const veto = (rec: Recommendation, reason: string) => {
    setChoosingVeto(null);
    setVetoed((p) => ({ ...p, [rec.id]: reason }));
    void logSignal('veto', { dish_id: rec.dish.id, dish_name: rec.dish.name, reason });
    if (rec.is_wildcard) void logSignal('wildcard_verdict', { accepted: false });
    trackEvent('recommendation_vetoed', { dish: rec.dish.name, reason });
  };

  const toggleSave = async (rec: Recommendation) => {
    const historyId = saved[rec.id];
    const nextSaved = !historyId;
    try {
      if (historyId) {
        await toggleSaved(historyId, false);
        setSaved((p) => ({ ...p, [rec.id]: false }));
      } else {
        const id = await saveOrder({
          dishName: rec.dish.name,
          cuisine: rec.dish.cuisine,
          priceInr: rec.practical_details?.estimated_price ?? undefined,
          ordered: false,
          saved: true,
        });
        setSaved((p) => ({ ...p, [rec.id]: id }));
      }
      toast(nextSaved ? 'Saved for later' : 'Removed from saved');
    } catch {
      toast('Could not update saved dishes');
    }
  };

  const share = (rec: Recommendation) => {
    const v = recView(rec);
    void Share.share({ message: `${v.name}${v.restaurantName ? ` from ${v.restaurantName}` : ''} — picked for my mood on MoodFood.` });
  };

  const recs = data?.recommendations ?? [];
  const top = recs[0];
  const topV = top ? recView(top) : null;
  const rest = recs.slice(1, 7);
  const swaps = top?.alternatives?.filter((a) => a.type === 'healthier_swap' || a.type === 'budget_swap') ?? [];
  const ctxLine = `${MOOD_SPECS[mood].label} · ${WEATHER_SPECS[weather].label} · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const waiting = loading || answering;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />}>
        <View style={{ paddingHorizontal: space.page, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="ink2">{ctxLine}</Text>
            <Text variant="display36" style={{ marginTop: 4 }} accessibilityRole="header">Your matches</Text>
          </View>
          <IconButton icon="refresh" label="Get new picks" onPress={() => void load(true)} disabled={refreshing || loading} style={{ opacity: refreshing ? 0.5 : 1 }} />
        </View>

        {!loading && data?.live_status === 'offline' && isSwiggyLive() ? (
          <Banner icon="info" text="Live Swiggy prices are unavailable right now. Showing our best picks." />
        ) : null}
        {!loading && data?.live_status === 'partial' ? <Banner icon="info" text="Some picks are matched to live Swiggy menus." /> : null}

        {showNostalgia ? (
          <NostalgiaPrompt
            onDismiss={() => {
              setShowNostalgia(false);
              void markNostalgiaPromptShown();
            }}
          />
        ) : null}

        {waiting ? (
          <>
            {!understandDone && questions.length > 0 ? (
              <UnderstandMePrompt
                questions={questions}
                onStart={() => setAnswering(true)}
                onDone={() => {
                  setAnswering(false);
                  setUnderstandDone(true);
                }}
              />
            ) : null}
            <LoadingBlock label={`Reading you as ${MOOD_COPY[mood].lower}…`} />
          </>
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load(false)} />
        ) : topV && top ? (
          <>
            <View style={{ marginTop: 18 }}>
              <HeroPick
                v={topV}
                height={330}
                why={topV.why}
                onOpen={() => openMeal(router, top, 0)}
                topRight={
                  <IconButton
                    icon="bookmark"
                    label={saved[top.id] ? 'Remove from saved' : 'Save'}
                    variant="photo"
                    size={38}
                    filled={!!saved[top.id]}
                    onPress={() => void toggleSave(top)}
                  />
                }
              />
            </View>

            {rest.length ? (
              <>
                <SectionHeader title="Also fits right now" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}>
                  {rest.map((r, i) => (
                    <MatchCard
                      key={r.id}
                      v={recView(r)}
                      chip={i === 0 ? WEATHER_COPY[weather].topFor : MOOD_COPY[mood].chip}
                      liked={liked.has(r.id)}
                      saved={!!saved[r.id]}
                      vetoed={vetoed[r.id] ?? null}
                      choosingReason={choosingVeto === r.id}
                      onOpen={() => openMeal(router, r, i + 1)}
                      onVetoStart={() => setChoosingVeto(r.id)}
                      onVeto={(reason) => veto(r, reason)}
                      onLike={() => toggleLike(r)}
                      onSave={() => void toggleSave(r)}
                      onShare={() => share(r)}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {swaps.length ? (
              <>
                <SectionHeader title="Smart swaps" />
                <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
                  {swaps.map((a) => (
                    <SwapRow
                      key={a.dish_id}
                      label={a.type === 'healthier_swap' ? 'Healthier swap' : 'Budget pick'}
                      name={a.name}
                      delta={a.reason}
                      onPress={() =>
                        router.push({ pathname: '/meal-detail', params: { rec: JSON.stringify(top), rank: '0', variant: a.type } })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <TwinTasteSection />
          </>
        ) : (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text variant="body15" tone="ink2" align="center">No picks yet. Try a fresh set or play a game.</Text>
          </View>
        )}
      </Screen>
    </View>
  );
}

function Banner({ icon, text }: { icon: 'info'; text: string }) {
  return (
    <Surface radius={18} style={{ marginHorizontal: space.gutter, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Icon name={icon} size={20} tone="accText" />
      <Text variant="caption13" style={{ flex: 1 }}>{text}</Text>
    </Surface>
  );
}
