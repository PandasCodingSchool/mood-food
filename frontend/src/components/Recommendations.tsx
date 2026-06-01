import {
  ArrowLeft,
  RefreshCw,
  Star,
  Share2,
  Heart,
  Sparkles,
  Clock,
  Flame,
  Zap,
  MapPin,
  Truck,
} from "lucide-react";
import { fetchRecommendations } from "../services/aiRecommendations";
import { trackEvent } from "../utils/analytics";
import { useState, useEffect } from "react";
import type { QuizResults, Recommendation } from "../types";

const moodEmojis: Record<string, string> = {
  happy: "😊",
  tired: "😴",
  stressed: "😰",
  celebrating: "🎉",
  relaxed: "😌",
  adventurous: "🤩",
};

const pairingIcons: Record<string, string> = {
  drink: "🥤",
  dessert: "🍮",
  side: "🥗",
};

const loaderSteps = [
  { emoji: "🧠", text: "Reading your mood..." },
  { emoji: "🍳", text: "Consulting the flavor matrix..." },
  { emoji: "✨", text: "Crafting your perfect match..." },
  { emoji: "🎯", text: "Almost there..." },
];

interface RecommendationsProps {
  results: QuizResults;
  onBack: () => void;
}

function Recommendations({ results, onBack }: RecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loaderStep, setLoaderStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAi, setIsAi] = useState(false);
  const [insights, setInsights] = useState<{
    detected_mood_profile?: string;
  } | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoaderStep((s) => (s + 1) % loaderSteps.length);
    }, 900);
    return () => clearInterval(interval);
  }, [loading]);

  const loadRecommendations = async (refresh = false) => {
    setLoading(true);
    setLoaderStep(0);
    setError(null);

    try {
      trackEvent("recommendations_requested", results);
      const data = await fetchRecommendations(results, null, refresh);
      setRecommendations(data.recommendations);
      setIsAi(data.success === true && !data.error);
      setInsights(data.insights || null);
      trackEvent("recommendations_received", {
        count: data.recommendations.length,
      });
    } catch (err) {
      setError("Could not load recommendations. Please try again.");
      trackEvent("recommendations_error", { error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = (item: Recommendation) => {
    trackEvent("recommendation_shared", { food: item.dish.name });
    if (navigator.share) {
      navigator.share({
        title: `Try ${item.dish.name}!`,
        text: `MoodFood recommended ${item.dish.name} for my ${results.mood} mood!`,
        url: window.location.href,
      });
    }
  };

  const handleLike = (item: Recommendation) => {
    setLikedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        trackEvent("recommendation_unliked", { food: item.dish.name });
      } else {
        next.add(item.id);
        trackEvent("recommendation_liked", { food: item.dish.name });
      }
      return next;
    });
  };

  const healthColor = (score?: number) => {
    if (!score) return "bg-gray-300";
    if (score >= 7) return "bg-green-500";
    if (score >= 4) return "bg-yellow-400";
    return "bg-red-400";
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </button>
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-primary-100 rounded-full px-4 py-2 mb-4">
              <span className="text-2xl">
                {moodEmojis[results.mood] || "😊"}
              </span>
              <span className="font-medium text-primary-800 capitalize">
                Feeling {results.mood}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Your Personalized Picks
            </h2>
            {insights?.detected_mood_profile && (
              <p className="text-sm text-primary-600 italic mb-1">
                "{insights.detected_mood_profile}"
              </p>
            )}
            <p className="text-gray-500 text-sm">
              {results.craving} · {results.budget} budget · {results.preference}
            </p>
          </div>
        </div>

        {/* AI / Fallback badge */}
        {!loading && (
          <div className="text-center mb-6">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isAi ? "bg-primary-100 text-primary-700" : "bg-amber-100 text-amber-700"}`}
            >
              {isAi ? (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>AI Powered</span>
                </>
              ) : (
                <span>⚡ Smart Picks</span>
              )}
            </span>
          </div>
        )}

        {/* Animated Loader */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center shadow-lg animate-pulse">
                <span className="text-4xl transition-all duration-500">
                  {loaderSteps[loaderStep].emoji}
                </span>
              </div>
              <div className="absolute -inset-2 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
            </div>
            <p className="text-gray-700 font-medium text-lg transition-all duration-300">
              {loaderSteps[loaderStep].text}
            </p>
            <div className="flex gap-1.5 mt-4">
              {loaderSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${i === loaderStep ? "bg-primary-500 scale-125" : "bg-gray-300"}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-12 bg-red-50 rounded-2xl">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => loadRecommendations()}
              className="px-6 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Cards */}
        {!loading && !error && (
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {recommendations.map((item, index) => {
              const d = item.dish;
              const pd = item.practical_details;
              const r = item.restaurant;
              const ar = item.ai_reasoning;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Image */}
                  <div className="relative h-52 bg-gradient-to-br from-primary-400 to-secondary-500 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={d.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-6xl">
                        🍽️
                      </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

                    {/* Rank badge */}
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-bold px-2 py-1 rounded-full">
                      #{item.rank || index + 1}
                    </div>

                    {/* Action buttons */}
                    <div className="absolute top-3 right-3 flex gap-2">
                      <button
                        onClick={() => handleLike(item)}
                        className={`p-2 rounded-full transition-colors backdrop-blur-sm ${likedItems.has(item.id) ? "bg-red-500 text-white" : "bg-white/80 text-gray-600 hover:bg-white"}`}
                      >
                        <Heart
                          className={`w-4 h-4 ${likedItems.has(item.id) ? "fill-current" : ""}`}
                        />
                      </button>
                      <button
                        onClick={() => handleShare(item)}
                        className="p-2 bg-white/80 backdrop-blur-sm text-gray-600 rounded-full hover:bg-white transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom info */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                      <div>
                        <h3 className="text-white font-bold text-lg leading-tight drop-shadow">
                          {d.name}
                        </h3>
                        <span className="text-white/80 text-xs capitalize">
                          {d.cuisine}
                        </span>
                      </div>
                      {item.confidence && (
                        <span className="bg-white/20 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                          {Math.round(item.confidence * 100)}% match
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    {/* Tags */}
                    {d.tags && d.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* AI Reasoning */}
                    {ar?.psychological_hook && (
                      <div className="bg-primary-50 rounded-xl p-3">
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="w-3 h-3 text-primary-500" />
                          <span className="text-xs font-semibold text-primary-600">
                            Why this?
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">
                          {ar.psychological_hook}
                        </p>
                        {ar.nostalgia_factor && (
                          <p className="text-xs text-primary-500 mt-1 italic">
                            {ar.nostalgia_factor}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Practical details */}
                    {pd && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-gray-50 rounded-xl p-2">
                          <div className="flex justify-center mb-0.5">
                            <Flame className="w-3.5 h-3.5 text-orange-400" />
                          </div>
                          <p className="text-xs font-semibold text-gray-800">
                            {pd.calories ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400">kcal</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2">
                          <div className="flex justify-center mb-0.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                          </div>
                          <p className="text-xs font-semibold text-gray-800">
                            {pd.preparation_time ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400">min</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2">
                          <div className="flex justify-center mb-0.5">
                            <Zap className="w-3.5 h-3.5 text-green-400" />
                          </div>
                          <p className="text-xs font-semibold text-gray-800">
                            ₹{pd.estimated_price ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400">est.</p>
                        </div>
                      </div>
                    )}

                    {/* Health score bar */}
                    {pd?.health_score != null && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Health score</span>
                          <span className="font-medium">
                            {pd.health_score}/10
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${healthColor(pd.health_score)}`}
                            style={{
                              width: `${(pd.health_score / 10) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Restaurant */}
                    {r && (
                      <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-xl p-2.5">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="font-medium text-gray-700">
                            {r.name}
                          </span>
                          {r.rating && (
                            <span className="flex items-center gap-0.5 ml-1">
                              <Star className="w-3 h-3 text-yellow-400 fill-current" />
                              {r.rating}
                            </span>
                          )}
                        </div>
                        {r.delivery_time_min && (
                          <div className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            <span>{r.delivery_time_min} min</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pairing suggestions */}
                    {item.pairing_suggestions &&
                      item.pairing_suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">
                            Pairs well with
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.pairing_suggestions.map((p, i) => (
                              <span
                                key={i}
                                className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full"
                              >
                                <span>{pairingIcons[p.type] || "🍴"}</span>
                                <span>{p.name}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => {
              trackEvent("recommendation_refreshed", results);
              loadRecommendations(true);
            }}
            disabled={loading}
            className={`btn-secondary flex items-center ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <RefreshCw
              className={`w-5 h-5 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Finding picks..." : "Try Again"}
          </button>
          <button onClick={onBack} className="btn-primary flex items-center">
            Start Over
            <ArrowLeft className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Recommendations;
