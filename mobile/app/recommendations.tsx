import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchRecommendations,
  getSavedAddressId,
  isSwiggyLive,
} from '../src/services/aiRecommendations';
import { trackEvent } from '../src/utils/analytics';
import { fw, colors } from '../src/constants/theme';
import { dishEmoji, dishGradient, resolveDishImage } from '../src/utils/dishVisuals';
import BottomNav from '../src/components/BottomNav';
import LoadingScreen from '../src/components/LoadingScreen';
import ChipSelector from '../src/components/inputs/ChipSelector';
import BlindBetStars from '../src/components/BlindBetStars';
import { logSignal } from '../src/services/signals';
import type { Recommendation, RecommendationResponse } from '../src/types';

// 4.2 — Veto + why: turns a useless "no" into a precise model update.
const VETO_REASONS = [
  { id: 'too_heavy', label: 'Too heavy', emoji: '🍔' },
  { id: 'had_recently', label: 'Had it recently', emoji: '🔁' },
  { id: 'too_pricey', label: 'Too pricey', emoji: '💸' },
  { id: 'not_feeling_it', label: 'Not feeling it', emoji: '🤷' },
];

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', tired: '😴', stressed: '😰', celebrating: '🥳',
  relaxed: '😌', adventurous: '🤩',
};

function MealCard({
  rec,
  index,
  onTap,
  vetoed,
  onVeto,
}: {
  rec: Recommendation;
  index: number;
  onTap: () => void;
  vetoed: string | null;
  onVeto: (reason: string) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
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
  const liveRestaurant = rec.swiggy?.matched ? rec.swiggy.item?.restaurant_name || rec.swiggy.restaurant?.name : null;
  const livePrice = rec.swiggy?.matched && rec.swiggy.item?.price != null
    ? rec.swiggy.item.price
    : rec.practical_details?.estimated_price;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onTap}
        style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      >
        <View style={{ height: 140 }}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient colors={dishGradient(index)} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 64 }}>{dishEmoji(rec)}</Text>
            </LinearGradient>
          )}
          {matchPct && (
            <View style={{ position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>{matchPct}</Text>
            </View>
          )}
          {index === 0 && (
            <View style={{ position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#4ade80' }}>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>🏆 Top Pick</Text>
            </View>
          )}
          {rec.is_wildcard && (
            <View style={{ position: 'absolute', top: index === 0 ? 40 : 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#a855f7' }}>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>🎲 Shake it up</Text>
            </View>
          )}
          {liveRestaurant && (
            <View style={{ position: 'absolute', bottom: 10, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' }} />
              <Text style={[fw(700), { fontSize: 10, color: '#fff' }]} numberOfLines={1}>Live on Swiggy · {liveRestaurant}</Text>
            </View>
          )}
        </View>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[fw(800), { fontSize: 17, color: colors.navy, flex: 1 }]} numberOfLines={1}>{rec.dish.name}</Text>
            {livePrice != null && (
              <Text style={[fw(800), { fontSize: 15, color: colors.orange }]}>₹{livePrice}</Text>
            )}
          </View>
          <Text style={[fw(600), { fontSize: 13, color: '#64748b', marginTop: 4 }]}>
            {rec.dish.cuisine}{rec.dish.category ? ` · ${rec.dish.category}` : ''}
            {rec.swiggy?.restaurant?.eta_min != null ? ` · ${rec.swiggy.restaurant.eta_min} min` : ''}
          </Text>
          {rec.dish.tags && rec.dish.tags.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {rec.dish.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(249,115,22,0.1)' }}>
                  <Text style={[fw(700), { fontSize: 11, color: colors.orange }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <BlindBetStars dishId={rec.dish.id} dishName={rec.dish.name} />

          {vetoed ? (
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={[fw(700), { fontSize: 12, color: '#94a3b8' }]}>
                Noted — {VETO_REASONS.find((r) => r.id === vetoed)?.label.toLowerCase()}. We'll adjust.
              </Text>
            </View>
          ) : showReasons ? (
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
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
              style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}
            >
              <Text style={[fw(700), { fontSize: 12, color: '#94a3b8' }]}>Not for me →</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RecommendationsScreen() {
  const router = useRouter();
  const { results: rawResults } = useLocalSearchParams<{ results: string }>();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [vetoedIds, setVetoedIds] = useState<Record<string, string>>({});

  const quizResults = rawResults ? JSON.parse(rawResults) : null;

  const load = async (isRefresh = false) => {
    if (!quizResults) return;
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const addressId = isSwiggyLive() ? await getSavedAddressId() : '';
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
      // Backend embeds swiggy_matches and fetchRecommendations maps them onto rec.swiggy.
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => router.push('/home')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={[fw(800), { fontSize: 16, color: colors.navy }]}>Your Picks 🎉</Text>
          <View style={{ width: 40 }} />
        </View>
        {quizResults?.mood && (
          <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 16 }]}>
            Based on your mood: {MOOD_EMOJIS[quizResults.mood] ?? '🍽️'} {quizResults.mood}
          </Text>
        )}
        {data?.live_status === 'partial' && (
          <Text style={[fw(600), { fontSize: 12, color: '#b45309', textAlign: 'center', marginTop: 8 }]}>
            Some picks are live on Swiggy; others are curated estimates.
          </Text>
        )}
        {data?.live_status === 'offline' && isSwiggyLive() && (
          <Text style={[fw(600), { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 8 }]}>
            Showing curated picks — live data temporarily unavailable.
          </Text>
        )}
      </View>

      {error && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 48 }}>😕</Text>
          <Text style={[fw(800), { fontSize: 20, color: colors.navy, marginTop: 16, textAlign: 'center' }]}>Something went wrong</Text>
          <Text style={[fw(600), { color: '#64748b', textAlign: 'center', marginTop: 8, marginBottom: 32 }]}>{error}</Text>
          <TouchableOpacity onPress={() => load(false)} activeOpacity={0.85}>
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ borderRadius: 24, paddingVertical: 16, paddingHorizontal: 32 }}>
              <Text style={[fw(800), { color: '#fff', fontSize: 16 }]}>Try Again</Text>
            </LinearGradient>
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
              borderColor: 'rgba(249,115,22,0.3)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 20 }}>🔄</Text>
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
