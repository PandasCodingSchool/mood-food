import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StatusBar, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchRecommendations } from '../src/services/aiRecommendations';
import { enrichRecommendations, withTimeout } from '../src/services/swiggy';
import { trackEvent } from '../src/utils/analytics';
import { fw, colors } from '../src/constants/theme';
import { dishEmoji, dishGradient, resolveDishImage } from '../src/utils/dishVisuals';
import BottomNav from '../src/components/BottomNav';
import LoadingScreen from '../src/components/LoadingScreen';
import type { Recommendation, RecommendationResponse, EnrichedMatch } from '../src/types';

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', tired: '😴', stressed: '😰', celebrating: '🥳',
  relaxed: '😌', adventurous: '🤩',
};

const ENRICH_TIMEOUT_MS = 10000;

function MealCard({ rec, index, onTap }: { rec: Recommendation; index: number; onTap: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 150, useNativeDriver: true }),
    ]).start();
  }, []);

  const matchPct = rec.confidence != null ? `${Math.round(rec.confidence * 100)}% match` : null;
  const imageUrl = !imageFailed ? resolveDishImage(rec) : null;
  const liveRestaurant = rec.swiggy?.matched ? rec.swiggy.item?.restaurant_name || rec.swiggy.restaurant?.name : null;

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
            {rec.practical_details?.estimated_price != null && (
              <Text style={[fw(800), { fontSize: 15, color: colors.orange }]}>₹{rec.practical_details.estimated_price}</Text>
            )}
          </View>
          <Text style={[fw(600), { fontSize: 13, color: '#64748b', marginTop: 4 }]}>
            {rec.dish.cuisine}{rec.dish.category ? ` · ${rec.dish.category}` : ''}
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

  const quizResults = rawResults ? JSON.parse(rawResults) : null;

  const load = async (isRefresh = false) => {
    if (!quizResults) return;
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const res = await fetchRecommendations(quizResults, null, isRefresh);
      trackEvent('recommendation_viewed', { source: res.source });

      // Phase 1 Swiggy enrichment: swap the AI's static Unsplash photos for real menu
      // photos/restaurants where a live match exists. Bounded so a slow/misconfigured
      // Swiggy integration never blocks results from showing.
      const matches: Record<string, EnrichedMatch> = await withTimeout(
        enrichRecommendations(res.recommendations).catch(() => ({})),
        ENRICH_TIMEOUT_MS,
        {},
      );
      res.recommendations = res.recommendations.map((rec) => ({
        ...rec,
        swiggy: matches[rec.dish?.id || rec.id] || null,
      }));

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
            <Text style={{ fontSize: 18 }}>←</Text>
          </TouchableOpacity>
          <Text style={[fw(800), { fontSize: 16, color: colors.navy }]}>Your Picks 🎉</Text>
          <View style={{ width: 40 }} />
        </View>
        {quizResults?.mood && (
          <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 16 }]}>
            Based on your mood: {MOOD_EMOJIS[quizResults.mood] ?? '🍽️'} {quizResults.mood}
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
