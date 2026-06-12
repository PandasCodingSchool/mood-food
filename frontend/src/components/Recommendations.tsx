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
  X,
  Mail,
  User,
  CheckCircle,
  Loader2,
  RotateCw,
  Leaf,
  Wallet,
} from "lucide-react";
import { fetchRecommendations } from "../services/aiRecommendations";
import { trackEvent } from "../utils/analytics";
import { openSwiggy } from "../utils/deliveryLinks";
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

  // Waitlist popup state
  const [showWaitlistPopup, setShowWaitlistPopup] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ name: "", email: "" });
  const [isSubmittingWaitlist, setIsSubmittingWaitlist] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");

  // Flip card state - tracks which cards are flipped
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  const handleFlipCard = (itemId: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  useEffect(() => {
    loadRecommendations();
  }, []);

  // Show waitlist popup 10 seconds after recommendations load
  useEffect(() => {
    if (!loading && !error && recommendations.length > 0) {
      // Only skip if user already joined waitlist (dismissed users will see it again)
      const hasJoined = sessionStorage.getItem("waitlistJoined");
      if (hasJoined) return;

      const timer = setTimeout(() => {
        setShowWaitlistPopup(true);
        trackEvent("waitlist_popup_shown", {
          recommendations_count: recommendations.length,
          mood: results.mood,
        });
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [loading, error, recommendations, results.mood]);

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
      const msg = (err as Error).message;
      setError(
        msg.startsWith("You've")
          ? msg
          : "Could not load recommendations. Please try again.",
      );
      trackEvent("recommendations_error", { error: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleOrderOnSwiggy = (
    dishName: string,
    dishType: "main" | "healthier" | "budget" = "main",
  ) => {
    trackEvent("delivery_link_clicked", {
      platform: "swiggy",
      dish: dishName,
      type: dishType,
    });
    // Track internally for admin dashboard
    fetch("/api/analytics/order-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dish_name: dishName,
        dish_type: dishType,
        platform: "swiggy",
      }),
    }).catch(() => {}); // Silent fail - don't block user experience
    openSwiggy(dishName);
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
        // Show waitlist popup when user likes something (even if dismissed before, but not if joined)
        const hasJoined = sessionStorage.getItem("waitlistJoined");
        if (!hasJoined) {
          setShowWaitlistPopup(true);
          trackEvent("waitlist_popup_shown", {
            trigger: "like",
            food: item.dish.name,
          });
        }
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

  const handleCloseWaitlistPopup = () => {
    setShowWaitlistPopup(false);
    // Don't set any storage on dismiss - popup will show again
    trackEvent("waitlist_popup_dismissed");
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingWaitlist(true);
    setWaitlistError("");

    trackEvent("waitlist_popup_submit_attempted", waitlistForm);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: waitlistForm.name,
          email: waitlistForm.email,
          city: "",
          cuisine: "",
        }),
      });

      if (response.ok) {
        trackEvent("waitlist_popup_submitted", { email: waitlistForm.email });
        setWaitlistSubmitted(true);
        sessionStorage.setItem("waitlistJoined", "true");
        // Close popup after 2 seconds of success message
        setTimeout(() => setShowWaitlistPopup(false), 2000);
      } else {
        throw new Error("Failed to join waitlist");
      }
    } catch (err) {
      setWaitlistError("Something went wrong. Please try again.");
      trackEvent("waitlist_popup_error", { error: (err as Error).message });
    } finally {
      setIsSubmittingWaitlist(false);
    }
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
            {/* Character header (if character match) */}
            {recommendations.length > 0 && recommendations[0]?.characterId && (
              <div className="inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-fuchsia-50 to-purple-50 rounded-full px-4 py-2 border border-fuchsia-200 mb-4">
                <span className="text-2xl">
                  {recommendations[0].ai_reasoning?.nostalgia_factor
                    ? // Extract emoji from character if available
                      "🎬"
                    : "😊"}
                </span>
                <span className="font-medium text-fuchsia-700">
                  Here's what{" "}
                  {recommendations[0].characterId?.charAt(0).toUpperCase() +
                    recommendations[0].characterId?.slice(1)}{" "}
                  would order
                </span>
              </div>
            )}

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
          <div className="text-center py-12 mb-4 bg-red-50 rounded-2xl">
            <p className="text-red-600 mb-4">{error}</p>
            {/* <button
              onClick={() => loadRecommendations()}
              className="px-6 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              Try Again
            </button> */}
          </div>
        )}

        {/* Flip Cards - Mobile Slider / Desktop Grid */}
        {!loading && !error && (
          <div
            className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 mb-8 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {recommendations.map((item, index) => {
              const d = item.dish;
              const pd = item.practical_details;
              const r = item.restaurant;
              const ar = item.ai_reasoning;
              const isFlipped = flippedCards.has(item.id);
              const hasAlternatives =
                item.alternatives && item.alternatives.length > 0;
              const healthierAlt = item.alternatives?.find(
                (a) => a.type === "healthier_swap",
              );
              const budgetAlt = item.alternatives?.find(
                (a) => a.type === "budget_swap",
              );

              return (
                <div
                  key={item.id}
                  className="relative h-[510px] md:h-[520px] perspective-1000 flex-shrink-0 w-[85vw] md:w-auto snap-center"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Flip Container */}
                  <div
                    className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? "rotate-y-180" : ""}`}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* FRONT of card */}
                    <div
                      className="absolute inset-0 backface-hidden"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className="bg-white rounded-3xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col h-full">
                        {/* Image */}
                        <div className="relative h-40 bg-gradient-to-br from-primary-400 to-secondary-500 overflow-hidden flex-shrink-0">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={d.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-5xl">
                              🍽️
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

                          {/* Rank badge + Character badge */}
                          <div className="absolute top-3 left-3 flex items-center gap-2">
                            <div className="bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-bold px-2 py-1 rounded-full">
                              #{item.rank || index + 1}
                            </div>
                            {item.characterBranded && (
                              <div className="bg-fuchsia-500/90 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full">
                                Character pick
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="absolute top-3 right-3 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLike(item);
                              }}
                              className={`p-2 rounded-full transition-colors backdrop-blur-sm ${likedItems.has(item.id) ? "bg-red-500 text-white" : "bg-white/80 text-gray-600 hover:bg-white"}`}
                            >
                              <Heart
                                className={`w-4 h-4 ${likedItems.has(item.id) ? "fill-current" : ""}`}
                              />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShare(item);
                              }}
                              className="p-2 bg-white/80 backdrop-blur-sm text-gray-600 rounded-full hover:bg-white transition-colors"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Bottom info */}
                          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                            <div>
                              <h3 className="text-white font-bold text-base leading-tight drop-shadow">
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
                        <div className="p-4 flex flex-col gap-2 flex-1 overflow-hidden">
                          {/* Tags */}
                          {d.tags && d.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {d.tags.slice(0, 3).map((tag) => (
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
                          <div className="bg-primary-50 rounded-xl p-2.5 min-h-[60px]">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Sparkles className="w-3 h-3 text-primary-500" />
                              <span className="text-xs font-semibold text-primary-600">
                                Why this?
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 leading-snug line-clamp-2">
                              {ar?.psychological_hook ||
                                "Perfect match for your mood and cravings"}
                            </p>
                          </div>

                          {/* Practical details - always show grid for consistency */}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-gray-50 rounded-lg p-1.5">
                              <Flame className="w-3 h-3 text-orange-400 mx-auto mb-0.5" />
                              <p className="text-xs font-semibold text-gray-800">
                                {pd?.calories ?? "—"}
                              </p>
                              <p className="text-[10px] text-gray-400">kcal</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-1.5">
                              <Clock className="w-3 h-3 text-blue-400 mx-auto mb-0.5" />
                              <p className="text-xs font-semibold text-gray-800">
                                {pd?.preparation_time ?? "—"}
                              </p>
                              <p className="text-[10px] text-gray-400">min</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-1.5">
                              <Zap className="w-3 h-3 text-green-400 mx-auto mb-0.5" />
                              <p className="text-xs font-semibold text-gray-800">
                                ₹{pd?.estimated_price ?? "—"}
                              </p>
                              <p className="text-[10px] text-gray-400">est.</p>
                            </div>
                          </div>

                          {/* Health score - always show */}
                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Health score</span>
                              <span className="font-medium">
                                {pd?.health_score ?? "—"}/10
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${healthColor(pd?.health_score || 0)}`}
                                style={{
                                  width: `${((pd?.health_score || 5) / 10) * 100}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Restaurant - always show placeholder if missing */}
                          <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-xl p-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span className="font-medium text-gray-700">
                                {r?.name ?? "Local restaurants"}
                              </span>
                              {r?.rating && (
                                <span className="flex items-center gap-0.5 ml-1">
                                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                                  {r.rating}
                                </span>
                              )}
                            </div>
                            {r?.delivery_time_min && (
                              <div className="flex items-center gap-1">
                                <Truck className="w-3 h-3" />
                                <span>{r.delivery_time_min} min</span>
                              </div>
                            )}
                          </div>

                          {/* Flip hint */}
                          {hasAlternatives && (
                            <button
                              onClick={() => handleFlipCard(item.id)}
                              className="flex items-center justify-center gap-1 text-xs text-primary-500 hover:text-primary-600 transition-colors mt-auto pt-1"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>Flip for healthy & budget options</span>
                            </button>
                          )}

                          {/* Delivery CTA */}
                          <div className="pt-2 border-t border-gray-100 mt-1">
                            <button
                              onClick={() => handleOrderOnSwiggy(d.name)}
                              className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] bg-gradient-to-r from-primary-500 to-secondary-500 shadow-md"
                            >
                              <span className="flex items-center justify-center gap-2">
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                                </svg>
                                Order on Swiggy
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BACK of card - Alternatives */}
                    <div
                      className="absolute inset-0 backface-hidden rotate-y-180"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <div className="bg-white rounded-3xl shadow-md overflow-hidden h-full flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-primary-500 to-secondary-500 p-4 text-white">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-lg">Alternatives</h3>
                            <button
                              onClick={() => handleFlipCard(item.id)}
                              className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-white/80 text-xs mt-1">
                            for {d.name}
                          </p>
                        </div>

                        {/* Alternatives content */}
                        <div className="p-4 flex flex-col gap-3 flex-1">
                          {/* Healthier option */}
                          {healthierAlt ? (
                            <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                  <Leaf className="w-4 h-4 text-green-600" />
                                </div>
                                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                                  Healthier Swap
                                </span>
                              </div>
                              <h4 className="font-bold text-gray-900 text-sm mb-1">
                                {healthierAlt.name}
                              </h4>
                              <p className="text-xs text-gray-600 leading-snug">
                                {healthierAlt.reason}
                              </p>
                              <button
                                onClick={() =>
                                  handleOrderOnSwiggy(
                                    healthierAlt.name,
                                    "healthier",
                                  )
                                }
                                className="mt-3 w-full py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors"
                              >
                                Order This Instead
                              </button>
                            </div>
                          ) : (
                            <div className="bg-green-50 rounded-2xl p-4 border border-green-100 opacity-60">
                              <div className="flex items-center gap-2 mb-2">
                                <Leaf className="w-4 h-4 text-green-600" />
                                <span className="text-xs font-bold text-green-700">
                                  No healthier swap available
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Budget option */}
                          {budgetAlt ? (
                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                                  <Wallet className="w-4 h-4 text-amber-600" />
                                </div>
                                <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                                  Budget Pick
                                </span>
                              </div>
                              <h4 className="font-bold text-gray-900 text-sm mb-1">
                                {budgetAlt.name}
                              </h4>
                              <p className="text-xs text-gray-600 leading-snug">
                                {budgetAlt.reason}
                              </p>
                              <button
                                onClick={() =>
                                  handleOrderOnSwiggy(budgetAlt.name, "budget")
                                }
                                className="mt-3 w-full py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors"
                              >
                                Order This Instead
                              </button>
                            </div>
                          ) : (
                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 opacity-60">
                              <div className="flex items-center gap-2 mb-2">
                                <Wallet className="w-4 h-4 text-amber-600" />
                                <span className="text-xs font-bold text-amber-700">
                                  No budget swap available
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Back button */}
                          <button
                            onClick={() => handleFlipCard(item.id)}
                            className="mt-auto flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
                          >
                            <RotateCw className="w-4 h-4" />
                            Back to main recommendation
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile Swipe Hint & Pagination */}
        {!loading && !error && recommendations.length > 0 && (
          <div className="md:hidden flex flex-col items-center gap-3 mb-6">
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16l-4-4m0 0l4-4m-4 4h18"
                />
              </svg>
              Swipe to see more
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </p>
            <div className="flex gap-2">
              {recommendations.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${index === 0 ? "bg-primary-500" : "bg-gray-300"}`}
                />
              ))}
            </div>
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

        {/* Waitlist Popup Modal */}
        {showWaitlistPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCloseWaitlistPopup}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 md:p-8 animate-in fade-in zoom-in duration-300">
              {/* Close button */}
              <button
                onClick={handleCloseWaitlistPopup}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {waitlistSubmitted ? (
                // Success state
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    You are on the list!
                  </h3>
                  <p className="text-gray-500">
                    We will notify you when MoodFood launches with new features.
                  </p>
                </div>
              ) : (
                // Form state
                <>
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-6 h-6 text-primary-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      Love these picks?
                    </h3>
                    <p className="text-gray-500 text-sm">
                      Join our waitlist to get early access and exclusive food
                      recommendations tailored just for you.
                    </p>
                  </div>

                  {waitlistError && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                      {waitlistError}
                    </div>
                  )}

                  <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <User className="w-4 h-4 inline mr-1.5" />
                        Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={waitlistForm.name}
                        onChange={(e) =>
                          setWaitlistForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                        placeholder="Your name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <Mail className="w-4 h-4 inline mr-1.5" />
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={waitlistForm.email}
                        onChange={(e) =>
                          setWaitlistForm((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                        placeholder="you@example.com"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingWaitlist}
                      className="w-full btn-primary py-3.5 text-base disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmittingWaitlist ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin inline" />
                          Joining...
                        </>
                      ) : (
                        "Join Waitlist"
                      )}
                    </button>

                    <p className="text-center text-gray-400 text-xs">
                      No spam, ever. Unsubscribe anytime.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Recommendations;
