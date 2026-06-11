import { useState, useCallback, useEffect, useRef } from "react";
import { Heart, X, RefreshCw, ChevronLeft } from "lucide-react";
import { trackEvent } from "../../utils/analytics";
import type { SwipeItem, SwipeData, GameResult } from "../../types";

const SWIPE_ITEMS: SwipeItem[] = [
  {
    id: 1,
    image:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=400&fit=crop",
    name: "Wood-fired Pizza",
    category: "comfort",
    cuisine: "Italian",
    budget: "moderate",
    vibe: "casual",
  },
  {
    id: 2,
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop",
    name: "Ramen Bowl",
    category: "comfort",
    cuisine: "Japanese",
    budget: "budget",
    vibe: "cozy",
  },
  {
    id: 3,
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop",
    name: "Fresh Salad Bowl",
    category: "healthy",
    cuisine: "Mediterranean",
    budget: "moderate",
    vibe: "fresh",
  },
  {
    id: 4,
    image:
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop",
    name: "Street Tacos",
    category: "spicy",
    cuisine: "Mexican",
    budget: "budget",
    vibe: "lively",
  },
  {
    id: 5,
    image:
      "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=400&fit=crop",
    name: "Sushi Platter",
    category: "light",
    cuisine: "Japanese",
    budget: "splurge",
    vibe: "elegant",
  },
  {
    id: 6,
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop",
    name: "Gourmet Burger",
    category: "comfort",
    cuisine: "American",
    budget: "moderate",
    vibe: "casual",
  },
  {
    id: 7,
    image:
      "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&h=400&fit=crop",
    name: "Curry Feast",
    category: "spicy",
    cuisine: "Indian",
    budget: "moderate",
    vibe: "warm",
  },
  {
    id: 8,
    image:
      "https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=400&fit=crop",
    name: "Seafood Boil",
    category: "indulgent",
    cuisine: "American",
    budget: "splurge",
    vibe: "festive",
  },
  {
    id: 9,
    image:
      "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&h=400&fit=crop",
    name: "Dessert Spread",
    category: "sweet",
    cuisine: "French",
    budget: "moderate",
    vibe: "indulgent",
  },
  {
    id: 10,
    image:
      "https://sinfulkitchen.com/wp-content/uploads/2024/01/Mediterranean-Wrap-Sandwich.jpg",
    name: "Mediterranean Wrap",
    category: "healthy",
    cuisine: "Mediterranean",
    budget: "budget",
    vibe: "quick",
  },
];

const VIBE_TO_MOOD: Record<string, string> = {
  cozy: "tired",
  casual: "happy",
  fresh: "relaxed",
  lively: "celebrating",
  elegant: "relaxed",
  warm: "happy",
  festive: "celebrating",
  indulgent: "stressed",
  quick: "tired",
};

interface SwipeVibeProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

const TOUCH_THRESHOLD = 80;

// Preference step: question text adapts to the top-liked category from swipes
const PREFERENCE_BY_CATEGORY: Record<string, { title: string; subtitle: string }> = {
  comfort:   { title: "Any dietary needs for your comfort fix?",   subtitle: "We'll keep it in your comfort zone." },
  spicy:     { title: "All good with meat in your spicy picks?",   subtitle: "Let us know and we'll filter perfectly." },
  healthy:   { title: "Any specific dietary restrictions?",        subtitle: "Healthy choices are easier to tailor." },
  indulgent: { title: "Any lines on your indulgence?",             subtitle: "So nothing surprises you." },
  light:     { title: "Any dietary preferences for lighter bites?", subtitle: "Easier to nail this with your needs." },
  sweet:     { title: "Dietary preference for your sweet tooth?",  subtitle: "Just so we get it right." },
};

function SwipeVibe({ onComplete, onBack }: SwipeVibeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipes, setSwipes] = useState<SwipeData[]>([]);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingResult, setPendingResult] = useState<GameResult | null>(null);
  const touchStartX = useRef<number>(0);

  const currentItem = SWIPE_ITEMS[currentIndex];
  const progress = (currentIndex / SWIPE_ITEMS.length) * 100;

  const analyzeSwipes = useCallback((allSwipes: SwipeData[]): GameResult => {
    const likedSwipes = allSwipes.filter((s) => s.liked);
    if (likedSwipes.length === 0) {
      return {
        mood: "adventurous",
        craving: "comfort",
        budget: "moderate",
        preference: "both",
        gameData: {
          type: "swipe_vibe",
          swipes: allSwipes,
          topCategory: "comfort",
          topCuisine: "Mixed",
          likedCount: 0,
        },
      };
    }
    const countByKey = (key: keyof SwipeData) => {
      const counts: Record<string, number> = {};
      likedSwipes.forEach((s) => {
        const val = String(s[key]);
        counts[val] = (counts[val] || 0) + 1;
      });
      return counts;
    };
    const getTop = (c: Record<string, number>) =>
      Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const topCategory = getTop(countByKey("category")) || "comfort";
    const topCuisine = getTop(countByKey("cuisine")) || "Mixed";
    const topBudget = getTop(countByKey("budget")) || "moderate";
    const topVibe = getTop(countByKey("vibe")) || "casual";
    return {
      mood: VIBE_TO_MOOD[topVibe] || "happy",
      craving: topCategory,
      budget: topBudget,
      preference: "both",
      gameData: {
        type: "swipe_vibe",
        swipes: allSwipes,
        topCategory,
        topCuisine,
        likedCount: likedSwipes.length,
      },
    };
  }, []);

  const handleSwipe = useCallback(
    (liked: boolean) => {
      if (isAnimating || !currentItem) return;
      setIsAnimating(true);
      setDragX(0);
      setIsDragging(false);
      setDirection(liked ? "right" : "left");
      const swipeData: SwipeData = {
        item: currentItem.name,
        category: currentItem.category,
        cuisine: currentItem.cuisine,
        budget: currentItem.budget,
        vibe: currentItem.vibe,
        liked,
        timestamp: Date.now(),
      };
      setSwipes((prev) => [...prev, swipeData]);
      trackEvent("swipe_vibe_interaction", {
        item: currentItem.name,
        liked,
        index: currentIndex,
      });
      setTimeout(() => {
        setDirection(null);
        setIsAnimating(false);
        if (currentIndex >= SWIPE_ITEMS.length - 1) {
          const results = analyzeSwipes([...swipes, swipeData]);
          trackEvent("swipe_vibe_analyzed", results);
          // Hold results and show preference step before completing
          setPendingResult(results);
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      }, 350);
    },
    [currentIndex, currentItem, isAnimating, swipes, onComplete, analyzeSwipes],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleSwipe(true);
      if (e.key === "ArrowLeft") handleSwipe(false);
    },
    [handleSwipe],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setDragX(e.touches[0].clientX - touchStartX.current);
  };
  const onTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) >= TOUCH_THRESHOLD) {
      handleSwipe(dragX > 0);
    } else {
      setDragX(0);
    }
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (isAnimating) return;
    touchStartX.current = e.clientX;
    setIsDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setDragX(e.clientX - touchStartX.current);
  };
  const onMouseUp = () => {
    setIsDragging(false);
    if (Math.abs(dragX) >= TOUCH_THRESHOLD) {
      handleSwipe(dragX > 0);
    } else {
      setDragX(0);
    }
  };

  const tilt = isDragging ? dragX * 0.08 : 0;
  const stampOpacity = Math.min(Math.abs(dragX) / TOUCH_THRESHOLD, 1);
  const showLike = dragX > 20;
  const showNope = dragX < -20;

  const cardStyle: React.CSSProperties = direction
    ? {
        transform: `translateX(${direction === "right" ? "130%" : "-130%"}) rotate(${direction === "right" ? 20 : -20}deg)`,
        opacity: 0,
        transition: "transform 0.35s ease, opacity 0.3s ease",
        cursor: "default",
      }
    : isDragging
      ? {
          transform: `translateX(${dragX}px) rotate(${tilt}deg)`,
          transition: "none",
          cursor: "grabbing",
        }
      : {
          transform: "translateX(0) rotate(0deg)",
          transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
          cursor: "grab",
        };

  // ── Preference step (after all cards are swiped) ────────
  if (pendingResult) {
    const topCategory = (pendingResult.gameData as { topCategory?: string })?.topCategory ?? "comfort";
    const copy = PREFERENCE_BY_CATEGORY[topCategory] ?? PREFERENCE_BY_CATEGORY.comfort;

    const handlePreferenceSelect = (preference: string) => {
      const final: GameResult = { ...pendingResult, preference };
      trackEvent("swipe_vibe_complete", final);
      onComplete(final);
    };

    const PREF_OPTIONS = [
      { value: "veg",     label: "Vegetarian",    emoji: "🥬" },
      { value: "non-veg", label: "Non-Vegetarian", emoji: "🍗" },
      { value: "both",    label: "No Preference",  emoji: "🍽️" },
    ];

    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => setPendingResult(null)}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Back
          </button>

          <div className="bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <span className="text-5xl mb-4 block">🍽️</span>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{copy.title}</h2>
            <p className="text-gray-500 mb-8 text-sm">{copy.subtitle}</p>
            <div className="grid grid-cols-3 gap-4">
              {PREF_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => handlePreferenceSelect(o.value)}
                  className="p-5 rounded-2xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 hover:scale-105 transition-all text-center"
                >
                  <span className="text-3xl mb-2 block">{o.emoji}</span>
                  <span className="font-semibold text-gray-900 text-sm">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentItem) return null;

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Back
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Snack & Match 🍽️
            </h2>
            <p className="text-gray-500 text-sm">
              Swipe right to love it, left to pass
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span className="font-medium">
              {currentIndex + 1} of {SWIPE_ITEMS.length}
            </span>
            <span>
              {swipes.filter((s) => s.liked).length} ❤️ &nbsp;·&nbsp;{" "}
              {swipes.filter((s) => !s.liked).length} ✕
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card stack */}
        <div className="relative mb-6 select-none" style={{ height: "440px" }}>
          {/* Ghost card for depth */}
          {currentIndex + 1 < SWIPE_ITEMS.length && (
            <div
              className="absolute inset-0 bg-white rounded-3xl shadow-md overflow-hidden"
              style={{ transform: "scale(0.95) translateY(12px)", zIndex: 0 }}
            >
              <img
                src={SWIPE_ITEMS[currentIndex + 1].image}
                className="w-full h-64 object-cover opacity-30"
                alt=""
                draggable={false}
              />
            </div>
          )}

          {/* Main card */}
          <div
            style={{ ...cardStyle, position: "absolute", inset: 0, zIndex: 1 }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onMouseDown}
            onMouseMove={isDragging ? onMouseMove : undefined}
            onMouseUp={onMouseUp}
            onMouseLeave={isDragging ? onMouseUp : undefined}
            className="bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="relative h-64">
              <img
                src={currentItem.image}
                alt={currentItem.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute top-4 left-4">
                <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-gray-800 capitalize">
                  {currentItem.category}
                </span>
              </div>
              <div className="absolute top-4 right-4">
                <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-gray-800">
                  {currentItem.cuisine}
                </span>
              </div>
              {/* LIKE stamp */}
              <div
                className="absolute top-8 left-5 border-4 border-green-400 text-green-400 rounded-xl px-3 py-1 font-black text-xl"
                style={{
                  opacity: showLike ? stampOpacity : 0,
                  transform: "rotate(-15deg)",
                  transition: "opacity 0.08s",
                }}
              >
                LIKE ❤️
              </div>
              {/* NOPE stamp */}
              <div
                className="absolute top-8 right-5 border-4 border-red-400 text-red-400 rounded-xl px-3 py-1 font-black text-xl"
                style={{
                  opacity: showNope ? stampOpacity : 0,
                  transform: "rotate(15deg)",
                  transition: "opacity 0.08s",
                }}
              >
                NOPE ✕
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-2xl font-black text-gray-900 mb-3">
                {currentItem.name}
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-sm font-medium capitalize">
                  {currentItem.vibe} vibe
                </span>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium capitalize">
                  {currentItem.budget}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-8 mb-4">
          <button
            onClick={() => handleSwipe(false)}
            disabled={isAnimating}
            className="w-16 h-16 bg-white rounded-full shadow-xl flex items-center justify-center text-red-500 hover:bg-red-50 hover:scale-110 active:scale-95 transition-all disabled:opacity-40 border border-red-100"
          >
            <X className="w-7 h-7" />
          </button>
          <button
            onClick={() => handleSwipe(true)}
            disabled={isAnimating}
            className="w-16 h-16 bg-white rounded-full shadow-xl flex items-center justify-center text-green-500 hover:bg-green-50 hover:scale-110 active:scale-95 transition-all disabled:opacity-40 border border-green-100"
          >
            <Heart className="w-7 h-7" />
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs mb-4">
          Drag the card or use ← → arrow keys
        </p>

        {swipes.length > 0 && (
          <div className="p-4 bg-white/60 rounded-2xl flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {swipes.filter((s) => s.liked).length} liked ·{" "}
              {swipes.filter((s) => !s.liked).length} passed
            </span>
            <button
              onClick={() => {
                setSwipes([]);
                setCurrentIndex(0);
                setDragX(0);
                trackEvent("swipe_vibe_restart");
              }}
              className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" /> Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SwipeVibe;
