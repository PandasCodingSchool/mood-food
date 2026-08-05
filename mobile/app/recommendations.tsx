import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, Image, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, RefreshCw, Frown, PartyPopper, ArrowRight,
  Heart, Share2, Flame, Clock, Zap, MapPin, Star, Sparkles,
} from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import {
  fetchRecommendations,
  getSavedAddressId,
  isSwiggyLive,
  fetchAddresses,
  saveAddressId,
} from '../src/services/aiRecommendations';
import { enrichRecommendations, enrichAlternatives } from '../src/services/swiggy';
import { trackEvent } from '../src/utils/analytics';
import { fw, colors, gradients } from '../src/constants/theme';
import { dishEmoji, dishGradient, resolveDishImage } from '../src/utils/dishVisuals';
import { pressScale } from '../src/utils/animations';
import { formatTag } from '../src/utils/formatTag';
import BottomNav from '../src/components/BottomNav';
import LoadingScreen from '../src/components/LoadingScreen';
import ChipSelector from '../src/components/inputs/ChipSelector';
import BlindBetStars from '../src/components/BlindBetStars';
import GradientButton from '../src/components/GradientButton';
import { logSignal } from '../src/services/signals';
import { bumpQuestProgress } from '../src/services/quests';
import type { Recommendation, RecommendationResponse } from '../src/types';

function healthColor(score: number | undefined): string {
  if (score == null) return colors.slate300;
  if (score >= 7) return colors.green;
  if (score >= 4) return colors.amber;
  return colors.rose;
}

// 4.2 — Veto + why: turns a useless "no" into a precise model update.
const VETO_REASONS = [
  { id: 'too_heavy', label: 'Too heavy', emoji: '⚖️' },
  { id: 'had_recently', label: 'Had it recently', emoji: '🕓' },
  { id: 'too_pricey', label: 'Too pricey', emoji: '💸' },
  { id: 'not_feeling_it', label: 'Not feeling it', emoji: '😶' },
];

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', tired: '😴', stressed: '😫', celebrating: '🎉',
  relaxed: '😌', adventurous: '🧭',
};

function StatTile({ icon, value, label, theme }: { icon: React.ReactNode; value: string; label: string; theme: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 10 }}>
      {icon}
      <Text style={[fw(800), { fontSize: 13, color: theme.text, marginTop: 4 }]}>{value}</Text>
      <Text style={[fw(600), { fontSize: 10, color: theme.subtext, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}

function MealCard({
  rec,
  index,
  onTap,
  vetoed,
  onVeto,
  liked,
  onToggleLike,
  onOrderNow,
  onDiyIt,
}: {
  rec: Recommendation;
  index: number;
  onTap: () => void;
  vetoed: string | null;
  onVeto: (reason: string) => void;
  liked: boolean;
  onToggleLike: () => void;
  onOrderNow: () => void;
  onDiyIt: () => void;
}) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [imageFailed, setImageFailed] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 150, useNativeDriver: true }),
    ]).start();
  }, []);

  const matchPct = rec.confidence != null ? `${Math.round(rec.confidence * 100)}% match` : null;
  const imageUrl = !imageFailed ? resolveDishImage(rec) : null;
  const liveMatch = rec.swiggy?.matched ? rec.swiggy : null;
  const liveRestaurantName = liveMatch?.item?.restaurant_name || liveMatch?.restaurant?.name;
  const livePrice = liveMatch?.item?.price ?? rec.practical_details?.estimated_price;
  const isLivePrice = liveMatch?.item?.price != null;
  const deliveryOrPrep = liveMatch
    ? liveMatch.restaurant?.eta_min ?? liveMatch.item?.eta_min
    : rec.practical_details?.preparation_time;
  const healthScore = rec.practical_details?.health_score;
  const tags = rec.ai_reasoning?.context_tags?.length ? rec.ai_reasoning.context_tags : rec.dish.tags;

  const handleShare = async () => {
    trackEvent('recommendation_shared', { food: rec.dish.name });
    try {
      await Share.share({ message: `MoodFood recommended ${rec.dish.name} for me!` });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={() => pressScale(scale, 0.97)}
        onPressOut={() => pressScale(scale, 1)}
        onPress={onTap}
        style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: theme.card, marginBottom: 16, shadowColor: theme.shadow, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      >
        <View style={{ height: 170 }}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient colors={dishGradient(index)} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 56 }}>{dishEmoji(rec)}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 }}
          />

          <View style={{ position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.85)' }}>
            <Text style={[fw(800), { fontSize: 11, color: colors.navy }]}>#{index + 1}</Text>
          </View>
          <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={onToggleLike}
              style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: liked ? colors.rose : 'rgba(255,255,255,0.8)' }}
            >
              <Heart size={14} color={liked ? '#fff' : colors.slate500} fill={liked ? '#fff' : 'none'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' }}
            >
              <Share2 size={14} color={colors.slate500} />
            </TouchableOpacity>
          </View>
          {index === 0 && (
            <View style={{ position: 'absolute', top: 50, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#4ade80', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12 }}>🏆</Text>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>Top Pick</Text>
            </View>
          )}
          {rec.is_wildcard && (
            <View style={{ position: 'absolute', top: index === 0 ? 78 : 50, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#a855f7', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12 }}>🎲</Text>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>Shake it up</Text>
            </View>
          )}

          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[fw(800), { fontSize: 17, color: '#fff' }]} numberOfLines={1}>{rec.dish.name}</Text>
              <Text style={[fw(600), { fontSize: 12, color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{rec.dish.cuisine}</Text>
            </View>
            {matchPct && (
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>{matchPct}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ padding: 16 }}>
          {tags && tags.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {liveMatch?.item?.is_veg != null && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: (liveMatch.item.is_veg ? colors.green : colors.rose) + '18', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, borderWidth: 1.5, borderColor: liveMatch.item.is_veg ? colors.green : colors.rose }} />
                  <Text style={[fw(700), { fontSize: 11, color: liveMatch.item.is_veg ? colors.green : colors.rose }]}>{liveMatch.item.is_veg ? 'Veg' : 'Non-Veg'}</Text>
                </View>
              )}
              {tags.slice(0, 3).map((tag) => (
                <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.orange + '18' }}>
                  <Text style={[fw(700), { fontSize: 11, color: colors.orange }]}>{formatTag(tag)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <StatTile
              icon={<Flame size={14} color={colors.orange} />}
              value={rec.practical_details?.calories != null ? String(rec.practical_details.calories) : '—'}
              label="kcal"
              theme={theme}
            />
            <StatTile
              icon={<Clock size={14} color={colors.blue} />}
              value={deliveryOrPrep != null ? String(deliveryOrPrep) : '—'}
              label={liveMatch ? 'delivery' : 'prep'}
              theme={theme}
            />
            <StatTile
              icon={<Zap size={14} color={colors.green} />}
              value={livePrice != null ? `₹${livePrice}` : '—'}
              label={isLivePrice ? 'live' : 'est.'}
              theme={theme}
            />
          </View>

          {healthScore != null && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]}>Health score</Text>
                <Text style={[fw(700), { fontSize: 12, color: theme.text }]}>{healthScore}/10</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.border, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${(healthScore / 10) * 100}%`, borderRadius: 3, backgroundColor: healthColor(healthScore) }} />
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: liveMatch ? colors.orange + '14' : theme.bg }}>
            <MapPin size={14} color={liveMatch ? colors.orange : theme.subtext} style={{ marginTop: 1 }} />
            <Text style={[fw(700), { fontSize: 13, color: liveMatch ? colors.orange : theme.subtext, flex: 1 }]}>
              {liveRestaurantName || 'Local restaurants'}
            </Text>
          </View>

          {liveMatch && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.orange }}>
                <Text style={[fw(800), { fontSize: 9, color: '#fff' }]}>LIVE</Text>
              </View>
              {liveMatch.restaurant?.rating != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Star size={11} color={colors.amber} fill={colors.amber} />
                  <Text style={[fw(700), { fontSize: 11, color: theme.text }]}>{liveMatch.restaurant.rating}</Text>
                </View>
              )}
              {liveMatch.restaurant?.eta_min != null && (
                <Text style={[fw(600), { fontSize: 11, color: theme.subtext }]}>{liveMatch.restaurant.eta_min} min delivery</Text>
              )}
            </View>
          )}

          {rec.ai_reasoning?.psychological_hook && (
            <View style={{ marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.bg }}>
              <Text style={[fw(600), { fontSize: 11, color: theme.subtext }]}>Why this? {rec.ai_reasoning.psychological_hook}</Text>
            </View>
          )}

          <BlindBetStars dishId={rec.dish.id} dishName={rec.dish.name} />

          {vetoed ? (
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
              <Text style={[fw(700), { fontSize: 12, color: theme.subtext }]}>
                Noted — {VETO_REASONS.find((r) => r.id === vetoed)?.label.toLowerCase()}. We'll adjust.
              </Text>
            </View>
          ) : showReasons ? (
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
              <ChipSelector
                options={VETO_REASONS}
                selected={[]}
                onToggle={(id) => {
                  onVeto(id);
                  setShowReasons(false);
                }}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowReasons(true)}
              activeOpacity={0.7}
              style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}
            >
              <Text style={[fw(700), { fontSize: 12, color: theme.subtext }]}>Not for me →</Text>
            </TouchableOpacity>
          )}

          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 12, height: 40, borderRadius: 20,
              backgroundColor: colors.purple + '12', borderWidth: 1.5, borderColor: colors.purple + '40',
            }}
          >
            <Sparkles size={15} color={colors.purple} />
            <Text style={[fw(800), { fontSize: 12.5, color: colors.purple }]}>Healthier & budget swaps · Ask Captain →</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <GradientButton
              label="Order now!"
              colors={gradients.orange}
              height={44}
              fontSize={14}
              icon={<MapPin size={16} color="#fff" />}
              onPress={onOrderNow}
              style={{ flex: 1 }}
            />
            <GradientButton
              label="👨‍🍳 DIY it!"
              colors={gradients.green}
              height={44}
              fontSize={14}
              onPress={onDiyIt}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RecommendationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { results: rawResults } = useLocalSearchParams<{ results: string }>();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [vetoedIds, setVetoedIds] = useState<Record<string, string>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const toggleLike = (rec: Recommendation) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rec.id)) {
        next.delete(rec.id);
        trackEvent('recommendation_unliked', { food: rec.dish.name });
      } else {
        next.add(rec.id);
        trackEvent('recommendation_liked', { food: rec.dish.name });
        if (rec.is_wildcard) {
          void logSignal('wildcard_verdict', { accepted: true });
        }
        void bumpQuestProgress('try_3_cuisines');
      }
      return next;
    });
  };

  const quizResults = rawResults ? JSON.parse(rawResults) : null;

  const load = async (isRefresh = false) => {
    if (!quizResults) return;
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      let addressId = await getSavedAddressId();

      // If Swiggy is live but we have no stored address, try to fetch one.
      if (isSwiggyLive() && !addressId) {
        const addresses = await fetchAddresses();
        if (addresses.length > 0) {
          addressId = addresses[0].id;
          await saveAddressId(addressId);
        }
      }

      const res = await fetchRecommendations(
        quizResults,
        null,
        isRefresh,
        addressId || undefined,
      );
      trackEvent('recommendation_viewed', {
        source: res.source,
        live_status: res.live_status,
      });

      // Fallback: if the backend did not embed live matches but Swiggy is live,
      // call /swiggy/enrich directly to attach real restaurant/menu data.
      const hasLiveMatches = res.swiggy_matches && Object.keys(res.swiggy_matches).length > 0;
      if (isSwiggyLive() && addressId && !hasLiveMatches && res.recommendations.length > 0) {
        try {
          const enriched = await enrichRecommendations(res.recommendations, addressId);
          if (Object.keys(enriched).length > 0) {
            const withOriginalMatches = { ...res, swiggy_matches: enriched, live_status: 'partial' as const };
            setData(withOriginalMatches);
            streamAlternativeMatches(withOriginalMatches.recommendations, addressId);
            return;
          }
        } catch {
          // leave original response untouched on failure
        }
      }

      setData(res);
      if (isSwiggyLive() && addressId) streamAlternativeMatches(res.recommendations, addressId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Original recommendation is already live-matched by this point (fast path,
  // unaffected). Healthier/budget swaps are matched separately in the
  // background so they never delay first paint — badges pop in once ready.
  const streamAlternativeMatches = (recs: Recommendation[], addressId: string) => {
    enrichAlternatives(recs, addressId).then((matches) => {
      if (matches.length === 0) return;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          recommendations: prev.recommendations.map((rec) => {
            if (!rec.alternatives) return rec;
            const patched = rec.alternatives.map((alt) => {
              const m = matches.find((x) => x.rec_id === rec.id && x.dish_id === alt.dish_id);
              return m ? { ...alt, swiggy: m.match } : alt;
            });
            return { ...rec, alternatives: patched };
          }),
        };
      });
    });
  };

  useEffect(() => {
    load(false);
  }, []);

  const handleVeto = (rec: Recommendation, reason: string) => {
    setVetoedIds((prev) => ({ ...prev, [rec.id]: reason }));
    void logSignal('veto', { dish_id: rec.dish.id, dish_name: rec.dish.name, reason });
    if (rec.is_wildcard) void logSignal('wildcard_verdict', { accepted: false });
    trackEvent('recommendation_vetoed', { dish: rec.dish.name, reason });
  };

  if (loading) return <LoadingScreen />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => router.push('/home')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PartyPopper size={18} color={colors.orange} />
            <Text style={[fw(800), { fontSize: 16, color: theme.text }]}>Your Picks</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        {quizResults?.mood && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
            <Text style={{ fontSize: 14 }}>{MOOD_EMOJIS[quizResults.mood] ?? '🍽️'}</Text>
            <Text style={[fw(600), { fontSize: 13, color: theme.subtext, textAlign: 'center' }]}>
              Based on your mood: {quizResults.mood}
            </Text>
          </View>
        )}
        {data?.live_status === 'partial' && (
          <Text style={[fw(600), { fontSize: 12, color: colors.orange, textAlign: 'center', marginTop: 8 }]}>
            Some picks are live on Swiggy; others are curated estimates.
          </Text>
        )}
        {data?.live_status === 'offline' && isSwiggyLive() && (
          <Text style={[fw(600), { fontSize: 12, color: theme.subtext, textAlign: 'center', marginTop: 8 }]}>
            Showing curated picks — live data temporarily unavailable.
          </Text>
        )}
      </View>

      {error && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Frown size={56} color={theme.subtext} />
          <Text style={[fw(800), { fontSize: 20, color: theme.text, marginTop: 16, textAlign: 'center' }]}>Something went wrong</Text>
          <Text style={[fw(600), { color: theme.subtext, textAlign: 'center', marginTop: 8, marginBottom: 32 }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => load(false)}
            activeOpacity={0.85}
            style={{
              borderRadius: 24,
              paddingVertical: 16,
              paddingHorizontal: 32,
              backgroundColor: colors.orange,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text style={[fw(800), { color: '#fff', fontSize: 16 }]}>Try Again</Text>
            <ArrowRight size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {!error && data && (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {data.recommendations.map((rec, i) => (
            <MealCard
              key={rec.id}
              rec={rec}
              index={i}
              vetoed={vetoedIds[rec.id] || null}
              onVeto={(reason) => handleVeto(rec, reason)}
              onTap={() => router.push({ pathname: '/meal-detail', params: { rec: JSON.stringify(rec), rank: String(i) } })}
              liked={likedIds.has(rec.id)}
              onToggleLike={() => toggleLike(rec)}
              onOrderNow={() => router.push({ pathname: '/order/app-select', params: { rec: JSON.stringify(rec), rank: String(i) } })}
              onDiyIt={() => router.push({ pathname: '/diy/recipe', params: { rec: JSON.stringify(rec), rank: String(i) } })}
            />
          ))}

          <TouchableOpacity
            onPress={() => load(true)}
            disabled={refreshing}
            activeOpacity={0.8}
            style={{
              marginTop: 4,
              padding: 16,
              borderRadius: 16,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.orange + '30',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw size={20} color={colors.orange} />
            <Text style={[fw(800), { fontSize: 14, color: colors.orange }]}>
              {refreshing ? 'Refreshing…' : 'Get new picks'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <BottomNav active="results" />
    </View>
  );
}
