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
  Pencil,
} from "lucide-react";
import { fetchRecommendations } from "../services/aiRecommendations";
import {
  isSwiggyLive,
  getSavedAddressId,
  fetchUser,
  updateUserProfile,
  type EnrichedMatch,
  type MoodFoodUser,
  type UserProfileUpdate,
} from "../services/swiggy";
import { trackEvent } from "../utils/analytics";
import { openSwiggy } from "../utils/deliveryLinks";
import { useState, useEffect, useRef } from "react";
import type { QuizResults, Recommendation } from "../types";
import ChipSelector from "./inputs/ChipSelector";
import BlindBetStars from "./BlindBetStars";
import NostalgiaPrompt from "./NostalgiaPrompt";
import TwinTasteSection from "./TwinTasteSection";
import { logSignal, fetchLearnedProfile } from "../services/signals";
import { shouldShowNostalgiaPrompt, markNostalgiaPromptShown } from "../utils/nostalgiaGate";
import { bumpQuestProgress } from "../services/quests";
import type { LearnedProfile } from "../types";

// 4.2 — Veto + why: turns a useless "no" into a precise model update.
const VETO_REASONS = [
  { id: "too_heavy", label: "Too heavy", emoji: "🍔" },
  { id: "had_recently", label: "Had it recently", emoji: "🔁" },
  { id: "too_pricey", label: "Too pricey", emoji: "💸" },
  { id: "not_feeling_it", label: "Not feeling it", emoji: "🤷" },
];

const moodEmojis: Record<string, string> = {
  happy: "😊",
  tired: "😴",
  stressed: "😰",
  celebrating: "🎉",
  relaxed: "😌",
  adventurous: "🤩",
};


const loaderSteps = [
  { emoji: "🧠", text: "Understanding your mood..." },
  { emoji: "📍", text: "Checking nearby menus..." },
  { emoji: "✨", text: "Ranking your best matches..." },
  { emoji: "🎯", text: "Almost ready..." },
];

interface RecommendationsProps {
  results: QuizResults;
  onBack: () => void;
}

function Recommendations({ results, onBack }: RecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [vetoedIds, setVetoedIds] = useState<Record<string, string>>({});
  const [showVetoReasonsFor, setShowVetoReasonsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaderStep, setLoaderStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAi, setIsAi] = useState(false);
  const [insights, setInsights] = useState<{
    detected_mood_profile?: string;
    next_meal_prediction?: string | null;
  } | null>(null);
  const [learnedProfile, setLearnedProfile] = useState<LearnedProfile | null>(null);
  const [showNostalgia, setShowNostalgia] = useState(false);

  useEffect(() => {
    fetchLearnedProfile().then(setLearnedProfile).catch(() => {});
    setShowNostalgia(shouldShowNostalgiaPrompt());
  }, []);

  // Waitlist popup state
  const [showWaitlistPopup, setShowWaitlistPopup] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ name: "", email: "" });
  const [isSubmittingWaitlist, setIsSubmittingWaitlist] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");

  // Flip card state - tracks which cards are flipped
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  // Which dish is active on each card: the main pick or a chosen swap.
  const [activeDish, setActiveDish] = useState<
    Record<string, "main" | "healthier" | "budget" | "popular">
  >({});

  // Switch the active dish on a card (main ⇄ swap) and flip back to the front.
  // Alternatives are enriched upfront so no lazy fetch needed here.
  const selectDish = (
    item: Recommendation,
    target: "main" | "healthier" | "budget" | "popular",
  ) => {
    setActiveDish((prev) => ({ ...prev, [item.id]: target }));
    setFlippedCards((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    trackEvent("recommendation_swap_selected", { target });
  };

  // Swiggy live discovery (Phase 1): real restaurant matches per dish
  const swiggyLive = isSwiggyLive();
  const [user, setUser] = useState<MoodFoodUser | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfileUpdate>({});
  const [profileError, setProfileError] = useState<string>("");
  const [addressId] = useState<string>(getSavedAddressId());
  const [swiggyMatches, setSwiggyMatches] = useState<
    Record<string, EnrichedMatch>
  >({});
  const [enriching, setEnriching] = useState(false);
  // Hard constraint: when Swiggy is live, cards only render after backend resolves.
  const [enriched, setEnriched] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"live" | "partial" | "offline" | null>(null);
  const requestGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Mobile carousel scroll tracking
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Track which recommendation card is currently visible on mobile.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || recommendations.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));
            if (!Number.isNaN(index)) setActiveIndex(index);
          }
        });
      },
      {
        root: container,
        threshold: 0.5,
      },
    );

    const cards = container.querySelectorAll("[data-index]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [recommendations]);

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
    if (!loading && !enriching) return;
    const interval = setInterval(() => {
      setLoaderStep((s) => (s + 1) % loaderSteps.length);
    }, 900);
    return () => clearInterval(interval);
  }, [loading, enriching]);

  // Load the current MoodFood user (for the profile card).
  useEffect(() => {
    fetchUser().then(setUser);
  }, []);

  const loadRecommendations = async (refresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++requestGenRef.current;

    setLoading(true);
    setEnriching(swiggyLive && !!addressId);
    setLoaderStep(0);
    setError(null);
    setEnriched(false);
    setSwiggyMatches({});
    setLiveStatus(null);

    try {
      trackEvent("recommendations_requested", results);
      const data = await fetchRecommendations(
        results,
        null,
        refresh,
        swiggyLive ? addressId : undefined,
        controller.signal,
      );
      if (gen !== requestGenRef.current) return;

      setRecommendations(data.recommendations);
      setIsAi(data.success === true && !data.error);
      setInsights(data.insights || null);
      setLiveStatus(data.live_status ?? (swiggyLive ? "offline" : null));

      // Backend owns live matching — consume embedded matches and skip client enrich.
      if (data.swiggy_matches && Object.keys(data.swiggy_matches).length > 0) {
        setSwiggyMatches(data.swiggy_matches as Record<string, EnrichedMatch>);
      }
      setEnriched(true);
      setEnriching(false);

      trackEvent("recommendations_received", {
        count: data.recommendations.length,
        live_status: data.live_status,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (gen !== requestGenRef.current) return;
      const msg = (err as Error).message;
      setError(
        msg.startsWith("You've")
          ? msg
          : "Could not load recommendations. Please try again.",
      );
      setEnriched(true);
      setEnriching(false);
      trackEvent("recommendations_error", { error: msg });
    } finally {
      if (gen === requestGenRef.current) {
        setLoading(false);
      }
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

  const startEditingProfile = () => {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setProfileError("");
    setIsEditingProfile(true);
  };

  const cancelEditingProfile = () => {
    setIsEditingProfile(false);
    setProfileError("");
  };

  const handleSaveProfile = async () => {
    setProfileError("");
    const updated = await updateUserProfile({
      name: profileForm.name?.trim() || null,
      email: profileForm.email?.trim() || null,
      phone: profileForm.phone?.trim() || null,
    });
    if (updated) {
      setUser(updated);
      setIsEditingProfile(false);
      trackEvent("profile_saved");
    } else {
      setProfileError("Could not save profile. Please try again.");
    }
  };

  const handleVeto = (item: Recommendation, reason: string) => {
    setVetoedIds((prev) => ({ ...prev, [item.id]: reason }));
    setShowVetoReasonsFor(null);
    logSignal("veto", { dish_id: item.dish.id, dish_name: item.dish.name, reason });
    if (item.is_wildcard) logSignal("wildcard_verdict", { accepted: false });
    trackEvent("recommendation_vetoed", { dish: item.dish.name, reason });
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
        if (item.is_wildcard) {
          logSignal("wildcard_verdict", { accepted: true });
          bumpQuestProgress("adventure_score");
        }
        bumpQuestProgress("try_3_cuisines");
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

  // Gating: when Swiggy is live, keep the loader up until enrich resolves so
  // cards only appear with live restaurant data (hard constraint).
  const preparing =
    loading ||
    enriching ||
    (swiggyLive && recommendations.length > 0 && !error && !enriched);
  const showResults =
    !loading &&
    !error &&
    recommendations.length > 0 &&
    (!swiggyLive || enriched);

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
          {showResults && liveStatus === "partial" && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 text-center">
              Some picks are live on Swiggy; others are curated estimates while we find nearby matches.
            </div>
          )}
          {showResults && liveStatus === "offline" && swiggyLive && (
            <div className="mb-4 rounded-xl bg-gray-100 border border-gray-200 px-4 py-3 text-sm text-gray-600 text-center">
              Showing curated picks — live restaurant data is temporarily unavailable.
            </div>
          )}
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
            {insights?.next_meal_prediction && (
              <p className="text-xs text-gray-400 mt-2">
                🔮 {insights.next_meal_prediction}
              </p>
            )}
          </div>
        </div>

        {showNostalgia && (
          <NostalgiaPrompt
            onDismiss={() => {
              setShowNostalgia(false);
              markNostalgiaPromptShown();
            }}
          />
        )}

        <TwinTasteSection />

        {/* 5.1 — Persona reveal */}
        {learnedProfile?.persona && (
          <div className="max-w-2xl mx-auto mb-6 bg-gradient-to-r from-purple-600 to-purple-400 rounded-2xl p-5 text-white">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/70">
              Your food character
            </p>
            <p className="font-black text-lg mt-1">{learnedProfile.persona.archetype}</p>
            <p className="text-sm text-white/90 mt-2 leading-relaxed">
              {learnedProfile.persona.blurb}
            </p>
            {learnedProfile.accuracy_meter && (
              <p className="text-xs font-bold mt-3">
                🔮 {Math.round(learnedProfile.accuracy_meter.accuracy * 100)}% mind-read accuracy
              </p>
            )}
          </div>
        )}

        {/* AI / Fallback badge */}
        {showResults && (
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

        {/* User profile card */}
        {showResults && user && (
          <div className="max-w-md mx-auto mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-sm">
            {!isEditingProfile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {user.name || "Guest Foodie"}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {user.email ||
                        user.phone ||
                        "Add your profile for a personalized experience"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={startEditingProfile}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  {user.name || user.email || user.phone ? "Edit" : "Add"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">
                    Your profile
                  </span>
                  <button
                    onClick={cancelEditingProfile}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Name"
                  value={profileForm.name || ""}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-400 outline-none"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={profileForm.email || ""}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-400 outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={profileForm.phone || ""}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-400 outline-none"
                />
                {profileError && (
                  <p className="text-red-500 text-xs">{profileError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancelEditingProfile}
                    className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Animated Loader */}
        {preparing && (
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

        {/* Flip Cards */}
        {showResults && (
          <div
            ref={scrollRef}
            className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 mb-2 md:mb-8 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {recommendations.map((item, index) => {
              const mainDishId = item.dish?.id || item.id;
              const mainMatch = swiggyMatches[mainDishId];

              // Swiggy-sourced alternatives from the matched restaurant menu.
              const swiggyAlts = mainMatch?.swiggy_alternatives ?? [];
              const swiggyHealthier = swiggyAlts.find(
                (a) => a.type === "healthier",
              );
              const swiggyBudget = swiggyAlts.find((a) => a.type === "budget");

              // AI alternatives — shown as fallback when no Swiggy alts available.
              const aiHealthierAlt = item.alternatives?.find(
                (a) => a.type === "healthier_swap",
              );
              const aiBudgetAlt = item.alternatives?.find(
                (a) => a.type === "budget_swap",
              );
              const aiPopularAlt = item.alternatives?.find(
                (a) => a.type === "popular_pick",
              );

              // Prefer Swiggy-sourced alternatives when main dish matched.
              const useSwiggyAlts = swiggyAlts.length > 0;
              const hasAlternatives = useSwiggyAlts
                ? true
                : !!(aiHealthierAlt || aiBudgetAlt || aiPopularAlt);

              const activeId = activeDish[item.id] || "main";

              // Determine the active Swiggy alt item (when a Swiggy alt is chosen).
              const activeSwiggyItem =
                useSwiggyAlts && activeId === "healthier" && swiggyHealthier
                  ? swiggyHealthier.item
                  : useSwiggyAlts && activeId === "budget" && swiggyBudget
                    ? swiggyBudget.item
                    : null;

              // AI alt for fallback path.
              const activeAiAlt = !useSwiggyAlts
                ? activeId === "healthier"
                  ? aiHealthierAlt
                  : activeId === "budget"
                    ? aiBudgetAlt
                    : activeId === "popular"
                      ? aiPopularAlt
                      : undefined
                : undefined;

              // The Swiggy live name/image for the main dish — used for Original Pick tile.
              const mainLiveItem = mainMatch?.item;

              // The dish currently shown on the front.
              const d = activeSwiggyItem
                ? {
                    name: activeSwiggyItem.name,
                    cuisine:
                      mainMatch?.restaurant?.cuisines?.[0] || item.dish.cuisine,
                    tags:
                      activeSwiggyItem.is_veg != null
                        ? [activeSwiggyItem.is_veg ? "veg" : "non_veg"]
                        : [],
                  }
                : activeAiAlt
                  ? {
                      name: activeAiAlt.name,
                      cuisine: activeAiAlt.cuisine || "",
                      tags: activeAiAlt.tags || [],
                    }
                  : {
                      name: item.dish.name,
                      cuisine: item.dish.cuisine,
                      tags: item.dish.tags || [],
                    };

              const pd = activeAiAlt
                ? activeAiAlt.practical_details
                : item.practical_details;
              const baseImage = activeAiAlt
                ? activeAiAlt.image_url
                : item.image_url;

              // Live Swiggy data: always the main matched restaurant.
              // For Swiggy alts the restaurant is the same; for AI alts there's no live match.
              const liveRestaurant = mainMatch?.restaurant;
              const liveItem =
                activeSwiggyItem ?? (activeAiAlt ? null : mainLiveItem);
              const r =
                liveRestaurant && !activeAiAlt
                  ? {
                      name: liveRestaurant.name,
                      rating: liveRestaurant.rating ?? undefined,
                      delivery_time_min:
                        liveRestaurant.eta_min ??
                        liveItem?.eta_min ??
                        undefined,
                    }
                  : activeAiAlt
                    ? undefined
                    : item.restaurant;
              const displayPrice =
                liveItem?.price ?? pd?.estimated_price ?? undefined;
              const displayImage = liveItem?.image_url || baseImage;
              const isFlipped = flippedCards.has(item.id);

              return (
                <div
                  key={item.id}

                  className="relative h-[590px] md:h-[600px] perspective-1000 flex-shrink-0 w-[85vw] md:w-auto snap-center"

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
                          {displayImage ? (
                            <img
                              src={displayImage}
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
                            {item.is_wildcard && (
                              <div className="bg-purple-500/90 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full">
                                🎲 Shake it up
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
                                {liveItem?.name || d.name}
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
                        <div className="p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
                          {/* Veg/Non-Veg + contextual mood tags (AI-generated for this user) */}
                          <div className="flex flex-wrap items-center gap-1">
                            {liveItem?.is_veg != null && (
                              <span
                                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${liveItem.is_veg ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                              >
                                <span
                                  className={`inline-flex w-3 h-3 items-center justify-center border rounded-sm ${liveItem.is_veg ? "border-green-600" : "border-red-600"}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${liveItem.is_veg ? "bg-green-600" : "bg-red-600"}`}
                                  />
                                </span>
                                {liveItem.is_veg ? "Veg" : "Non-Veg"}
                              </span>
                            )}
                            {(item.ai_reasoning?.context_tags || []).slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium"
                              >
                                {tag}
                              </span>
                            ))}
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
                                {liveRestaurant
                                  ? (r?.delivery_time_min ?? "—")
                                  : (pd?.preparation_time ?? "—")}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {liveRestaurant ? "delivery" : "prep"}
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-1.5">
                              <Zap className="w-3 h-3 text-green-400 mx-auto mb-0.5" />
                              <p className="text-xs font-semibold text-gray-800">
                                ₹{displayPrice ?? "—"}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {liveItem?.price != null ? "live" : "est."}
                              </p>
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

                          {/* Restaurant name banner */}
                          <div
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 ${liveRestaurant ? "bg-orange-50" : "bg-gray-50"}`}
                          >
                            <MapPin className={`w-3.5 h-3.5 shrink-0 ${liveRestaurant ? "text-orange-500" : "text-gray-400"}`} />
                            <span
                              className={`font-semibold text-sm truncate ${liveRestaurant ? "text-orange-800" : "text-gray-700"}`}
                              title={r?.name}
                            >
                              {r?.name ||
                                (swiggyLive && enriching
                                  ? "Finding restaurants..."
                                  : "Local restaurants")}
                            </span>
                          </div>

                          {/* LIVE badge + rating + delivery time */}
                          {(liveRestaurant || r?.delivery_time_min) && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                              {liveRestaurant && (
                                <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                  LIVE
                                </span>
                              )}
                              {r?.rating && (
                                <span className="flex items-center gap-0.5">
                                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                                  <span className="font-medium text-gray-700">{r.rating}</span>
                                </span>
                              )}
                              {r?.delivery_time_min && (
                                <span className="flex items-center gap-1">
                                  <Truck className="w-3 h-3" />
                                  {r.delivery_time_min} min delivery
                                </span>
                              )}
                            </div>
                          )}

                          {/* Why recommended */}
                          {item.ai_reasoning?.psychological_hook && (
                            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
                              <span className="font-medium text-gray-600">Why this? </span>
                              {item.ai_reasoning.psychological_hook}
                            </div>
                          )}

                          <BlindBetStars dishId={item.dish.id} dishName={item.dish.name} />

                          {/* Veto + why (4.2) */}
                          {vetoedIds[item.id] ? (
                            <p className="text-[11px] text-gray-400 px-1">
                              Noted —{" "}
                              {VETO_REASONS.find((r) => r.id === vetoedIds[item.id])?.label.toLowerCase()}
                              . We'll adjust.
                            </p>
                          ) : showVetoReasonsFor === item.id ? (
                            <div
                              className="pt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ChipSelector
                                options={VETO_REASONS}
                                selected={[]}
                                onToggle={(reason) => handleVeto(item, reason)}
                              />
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowVetoReasonsFor(item.id);
                              }}
                              className="text-[11px] text-gray-400 hover:text-gray-600 text-left px-1"
                            >
                              Not for me →
                            </button>
                          )}

                          {/* Flip hint — offers whatever isn't currently active */}
                          {hasAlternatives && (
                            <button
                              onClick={() => handleFlipCard(item.id)}
                              className="flex items-center justify-center gap-1 text-xs text-primary-500 hover:text-primary-600 transition-colors mt-auto pt-1"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>
                                Flip for{" "}
                                {[
                                  activeId !== "main" && "original",
                                  activeId !== "healthier" &&
                                    (useSwiggyAlts
                                      ? swiggyHealthier
                                      : aiHealthierAlt) &&
                                    "healthier",
                                  activeId !== "budget" &&
                                    (useSwiggyAlts
                                      ? swiggyBudget
                                      : aiBudgetAlt) &&
                                    "budget",
                                  !useSwiggyAlts &&
                                    activeId !== "popular" &&
                                    aiPopularAlt &&
                                    "popular",
                                ]
                                  .filter(Boolean)
                                  .join(" & ")}{" "}
                                options
                              </span>
                            </button>
                          )}

                          {/* Delivery CTA */}
                          <div className="pt-2 border-t border-gray-100 mt-1">
                            <button
                              onClick={() =>
                                handleOrderOnSwiggy(liveItem?.name || d.name)
                              }
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
                            <h3 className="font-bold text-lg">
                              Swap your dish
                            </h3>
                            <button
                              onClick={() => handleFlipCard(item.id)}
                              className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-white/80 text-xs mt-1">
                            Tap an option to make it your pick · now: {d.name}
                          </p>
                        </div>

                        {/* Swap options — tap to make it the active dish */}
                        <div className="p-4 flex flex-col gap-3 flex-1">
                          {[
                            activeId !== "main" && {
                              key: "main" as const,
                              theme: "gray",
                              Icon: RotateCw,
                              label: "Original Pick",
                              // Use Swiggy live name so it matches what was shown on the front.
                              name: mainLiveItem?.name || item.dish.name,
                              sub: "Back to your original recommendation",
                              price:
                                mainLiveItem?.price ??
                                item.practical_details?.estimated_price,
                            },
                            // Healthier tile — Swiggy-sourced when available, AI fallback otherwise.
                            useSwiggyAlts
                              ? swiggyHealthier &&
                                activeId !== "healthier" && {
                                  key: "healthier" as const,
                                  theme: "green",
                                  Icon: Leaf,
                                  label: "Healthier Swap",
                                  name: swiggyHealthier.item.name,
                                  sub: "Lighter pick from the same restaurant",
                                  price: swiggyHealthier.item.price,
                                }
                              : aiHealthierAlt &&
                                activeId !== "healthier" && {
                                  key: "healthier" as const,
                                  theme: "green",
                                  Icon: Leaf,
                                  label: "Healthier Swap",
                                  name: aiHealthierAlt.name,
                                  sub: aiHealthierAlt.reason,
                                  price:
                                    aiHealthierAlt.practical_details
                                      ?.estimated_price,
                                },
                            // Budget tile — Swiggy-sourced when available, AI fallback otherwise.
                            useSwiggyAlts
                              ? swiggyBudget &&
                                activeId !== "budget" && {
                                  key: "budget" as const,
                                  theme: "amber",
                                  Icon: Wallet,
                                  label: "Budget Pick",
                                  name: swiggyBudget.item.name,
                                  sub: "Cheaper option from the same restaurant",
                                  price: swiggyBudget.item.price,
                                }
                              : aiBudgetAlt && activeId !== "budget"
                                ? {
                                    key: "budget" as const,
                                    theme: "amber",
                                    Icon: Wallet,
                                    label: "Budget Pick",
                                    name: aiBudgetAlt.name,
                                    sub: aiBudgetAlt.reason,
                                    price:
                                      aiBudgetAlt.practical_details
                                        ?.estimated_price,
                                  }
                                : aiPopularAlt &&
                                  activeId !== "popular" && {
                                    key: "popular" as const,
                                    theme: "amber",
                                    Icon: Sparkles,
                                    label: "Popular Pick",
                                    name: aiPopularAlt.name,
                                    sub: aiPopularAlt.reason,
                                    price:
                                      aiPopularAlt.practical_details
                                        ?.estimated_price,
                                  },
                          ]
                            .filter(Boolean)
                            .map((opt) => {
                              const o = opt as Extract<
                                typeof opt,
                                { key: string }
                              >;
                              const themes: Record<
                                string,
                                { bg: string; icon: string; label: string }
                              > = {
                                green: {
                                  bg: "bg-green-50 border-green-100 hover:border-green-300",
                                  icon: "bg-green-100 text-green-600",
                                  label: "text-green-700",
                                },
                                amber: {
                                  bg: "bg-amber-50 border-amber-100 hover:border-amber-300",
                                  icon: "bg-amber-100 text-amber-600",
                                  label: "text-amber-700",
                                },
                                gray: {
                                  bg: "bg-gray-50 border-gray-200 hover:border-gray-300",
                                  icon: "bg-gray-200 text-gray-600",
                                  label: "text-gray-700",
                                },
                              };
                              const t = themes[o.theme];
                              return (
                                <button
                                  key={o.key}
                                  onClick={() => selectDish(item, o.key)}
                                  className={`text-left rounded-2xl p-4 border transition-all hover:scale-[1.01] ${t.bg}`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center ${t.icon}`}
                                      >
                                        <o.Icon className="w-4 h-4" />
                                      </div>
                                      <span
                                        className={`text-xs font-bold uppercase tracking-wide ${t.label}`}
                                      >
                                        {o.label}
                                      </span>
                                    </div>
                                    {o.price != null && (
                                      <span className="text-sm font-bold text-gray-800">
                                        ₹{o.price}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="font-bold text-gray-900 text-sm mb-0.5">
                                    {o.name}
                                  </h4>
                                  <p className="text-xs text-gray-600 leading-snug">
                                    {o.sub}
                                  </p>
                                </button>
                              );
                            })}

                          <button
                            onClick={() => handleFlipCard(item.id)}
                            className="mt-auto flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
                          >
                            <RotateCw className="w-4 h-4" />
                            Back
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
                  className={`w-2 h-2 rounded-full transition-colors ${index === activeIndex ? "bg-primary-500 scale-125" : "bg-gray-300"}`}
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
            disabled={preparing}
            className={`btn-secondary flex items-center ${preparing ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <RefreshCw
              className={`w-5 h-5 mr-2 ${preparing ? "animate-spin" : ""}`}
            />
            {preparing ? "Finding picks..." : "Try Again"}
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
