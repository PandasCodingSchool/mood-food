import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Animated,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchRecommendations } from '../src/services/aiRecommendations';
import { trackEvent } from '../src/utils/analytics';
import type { Recommendation, RecommendationResponse } from '../src/types';

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', tired: '😴', stressed: '😰', celebrating: '🥳',
  relaxed: '😌', adventurous: '🤩',
};

const BUDGET_LABELS: Record<string, string> = {
  low: '💰 Budget', medium: '💰💰 Moderate', high: '💰💰💰 Splurge',
  budget: '💰 Budget', moderate: '💰💰 Moderate', splurge: '💰💰💰 Splurge',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score ?? 0.7) * 100);
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <View className="h-1.5 bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-xs text-gray-500 w-8 text-right">{pct}%</Text>
    </View>
  );
}

function MealCard({ rec, index }: { rec: Recommendation; index: number }) {
  const [liked, setLiked] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 150,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleLike = () => {
    setLiked((l) => !l);
    trackEvent('recommendation_liked', { dish: rec.dish.name });
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `🍽️ MoodFood says: try ${rec.dish.name} (${rec.dish.cuisine})!` });
      trackEvent('recommendation_shared', { dish: rec.dish.name });
    } catch {}
  };

  return (
    <Animated.View
      style={{ transform: [{ scale: scaleAnim }], opacity: scaleAnim }}
      className="bg-white rounded-3xl p-5 mb-4 shadow-sm border border-gray-100"
    >
      {/* Rank badge */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="bg-orange-100 rounded-full w-8 h-8 items-center justify-center">
          <Text className="text-orange-600 font-bold text-sm">#{index + 1}</Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleLike}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: liked ? '#fef3c7' : '#f3f4f6' }}
          >
            <Text style={{ fontSize: 18 }}>{liked ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
          >
            <Text style={{ fontSize: 18 }}>↗️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text className="text-xl font-bold text-gray-900">{rec.dish.name}</Text>
      <Text className="text-gray-500 text-sm mt-0.5 mb-3">
        {rec.dish.cuisine}
        {rec.dish.category ? ` · ${rec.dish.category}` : ''}
      </Text>

      {/* Mood match score */}
      {rec.confidence != null && (
        <View className="mb-3">
          <Text className="text-xs text-gray-400 mb-1">Mood match</Text>
          <ScoreBar score={rec.confidence} />
        </View>
      )}

      {/* AI reasoning */}
      {rec.ai_reasoning?.mood_match && (
        <Text className="text-gray-600 text-sm leading-relaxed mb-3 italic">
          "{rec.ai_reasoning.mood_match}"
        </Text>
      )}

      {/* Practical details */}
      {rec.practical_details && (
        <View className="flex-row flex-wrap gap-2">
          {rec.practical_details.estimated_price != null && (
            <View className="bg-green-50 rounded-full px-3 py-1">
              <Text className="text-green-700 text-xs font-medium">
                ₹{rec.practical_details.estimated_price}
              </Text>
            </View>
          )}
          {rec.practical_details.preparation_time != null && (
            <View className="bg-blue-50 rounded-full px-3 py-1">
              <Text className="text-blue-700 text-xs font-medium">
                ⏱ {rec.practical_details.preparation_time} min
              </Text>
            </View>
          )}
          {rec.practical_details.calories != null && (
            <View className="bg-orange-50 rounded-full px-3 py-1">
              <Text className="text-orange-700 text-xs font-medium">
                🔥 {rec.practical_details.calories} kcal
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Alternatives strip */}
      {rec.alternatives && rec.alternatives.length > 0 && (
        <View className="mt-4 pt-4 border-t border-gray-100">
          <Text className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">
            Also consider
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {rec.alternatives.map((alt) => (
              <View
                key={alt.dish_id}
                className="mr-3 bg-gray-50 rounded-xl p-3 w-36"
              >
                <View className="flex-row items-center mb-1">
                  <Text style={{ fontSize: 14 }} className="mr-1">
                    {alt.type === 'healthier_swap' ? '🥦' : alt.type === 'budget_swap' ? '💰' : '⭐'}
                  </Text>
                  <Text className="text-xs text-gray-400 capitalize">
                    {alt.type.replace('_', ' ')}
                  </Text>
                </View>
                <Text className="text-gray-800 font-semibold text-xs" numberOfLines={2}>
                  {alt.name}
                </Text>
                {alt.practical_details?.estimated_price != null && (
                  <Text className="text-gray-400 text-xs mt-1">
                    ₹{alt.practical_details.estimated_price}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
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
      setData(res);
      trackEvent('recommendation_viewed', { source: res.source });
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

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <StatusBar barStyle="dark-content" backgroundColor="#fff7ed" />

      {/* Header */}
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.replace('/')}
          className="mr-4 w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
        >
          <Text className="text-gray-700 text-lg">⌂</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">Your Picks</Text>
          {quizResults?.mood && (
            <Text className="text-gray-500 text-sm">
              {MOOD_EMOJIS[quizResults.mood] ?? '🍽️'} {quizResults.mood} ·{' '}
              {BUDGET_LABELS[quizResults.budget] ?? quizResults.budget}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => load(true)}
          disabled={refreshing}
          className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
          style={{ opacity: refreshing ? 0.5 : 1 }}
        >
          <Text style={{ fontSize: 20 }}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {loading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="text-gray-500 mt-4 text-base">Finding your perfect meals…</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ fontSize: 48 }}>😕</Text>
          <Text className="text-gray-800 font-bold text-xl mt-4 text-center">Something went wrong</Text>
          <Text className="text-gray-500 text-center mt-2 mb-8">{error}</Text>
          <TouchableOpacity
            onPress={() => load(false)}
            className="bg-orange-500 rounded-2xl py-4 px-8"
          >
            <Text className="text-white font-bold text-base">Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {!loading && !error && data && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {data.insights?.detected_mood_profile && (
            <View className="bg-white rounded-2xl px-5 py-4 mb-4 border border-orange-100">
              <Text className="text-xs text-orange-500 font-semibold uppercase tracking-wide mb-1">
                Mood Profile
              </Text>
              <Text className="text-gray-700 text-sm leading-relaxed">
                {data.insights.detected_mood_profile}
              </Text>
            </View>
          )}

          {data.recommendations.map((rec, i) => (
            <MealCard key={rec.id} rec={rec} index={i} />
          ))}

          {/* Refresh & start over */}
          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={() => load(true)}
              disabled={refreshing}
              className="flex-1 border-2 border-orange-300 rounded-2xl py-4 items-center"
              style={{ opacity: refreshing ? 0.5 : 1 }}
            >
              <Text className="text-orange-600 font-semibold">
                {refreshing ? 'Refreshing…' : '↻ New Picks'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.replace('/')}
              className="flex-1 bg-orange-500 rounded-2xl py-4 items-center"
            >
              <Text className="text-white font-semibold">Start Over</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
