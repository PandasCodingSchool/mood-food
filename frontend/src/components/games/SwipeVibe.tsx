import { useState, useCallback, useEffect } from 'react';
import { Heart, X, RefreshCw, ChevronLeft } from 'lucide-react';
import { trackEvent } from '../../utils/analytics';
import type { SwipeItem, SwipeData, GameResult } from '../../types';

const SWIPE_ITEMS: SwipeItem[] = [
  { id: 1, image: '🍕', name: 'Wood-fired Pizza', category: 'comfort', cuisine: 'Italian', budget: 'moderate', vibe: 'casual' },
  { id: 2, image: '🍜', name: 'Ramen Bowl', category: 'comfort', cuisine: 'Japanese', budget: 'budget', vibe: 'cozy' },
  { id: 3, image: '🥗', name: 'Fresh Salad Bowl', category: 'healthy', cuisine: 'Mediterranean', budget: 'moderate', vibe: 'fresh' },
  { id: 4, image: '🌮', name: 'Street Tacos', category: 'spicy', cuisine: 'Mexican', budget: 'budget', vibe: 'lively' },
  { id: 5, image: '🍣', name: 'Sushi Platter', category: 'light', cuisine: 'Japanese', budget: 'splurge', vibe: 'elegant' },
  { id: 6, image: '🍔', name: 'Gourmet Burger', category: 'comfort', cuisine: 'American', budget: 'moderate', vibe: 'casual' },
  { id: 7, image: '🥘', name: 'Curry Feast', category: 'spicy', cuisine: 'Indian', budget: 'moderate', vibe: 'warm' },
  { id: 8, image: '🦞', name: 'Seafood Boil', category: 'indulgent', cuisine: 'American', budget: 'splurge', vibe: 'festive' },
  { id: 9, image: '🍰', name: 'Dessert Spread', category: 'sweet', cuisine: 'French', budget: 'moderate', vibe: 'indulgent' },
  { id: 10, image: '🥙', name: 'Mediterranean Wrap', category: 'healthy', cuisine: 'Mediterranean', budget: 'budget', vibe: 'quick' },
];

const VIBE_TO_MOOD: Record<string, string> = {
  cozy: 'tired',
  casual: 'happy',
  fresh: 'relaxed',
  lively: 'celebrating',
  elegant: 'relaxed',
  warm: 'happy',
  festive: 'celebrating',
  indulgent: 'stressed',
  quick: 'tired',
};

interface SwipeVibeProps {
  onComplete: (results: GameResult) => void;
  onBack: () => void;
}

function SwipeVibe({ onComplete, onBack }: SwipeVibeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipes, setSwipes] = useState<SwipeData[]>([]);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const currentItem = SWIPE_ITEMS[currentIndex];
  const progress = (currentIndex / SWIPE_ITEMS.length) * 100;
  const remaining = SWIPE_ITEMS.length - currentIndex;

  const handleSwipe = useCallback((liked: boolean) => {
    if (isAnimating || !currentItem) return;

    setIsAnimating(true);
    setDirection(liked ? 'right' : 'left');

    const swipeData: SwipeData = {
      item: currentItem.name,
      category: currentItem.category,
      cuisine: currentItem.cuisine,
      budget: currentItem.budget,
      vibe: currentItem.vibe,
      liked,
      timestamp: Date.now(),
    };

    setSwipes(prev => [...prev, swipeData]);
    
    trackEvent('swipe_vibe_interaction', {
      item: currentItem.name,
      liked,
      index: currentIndex,
    });

    setTimeout(() => {
      setDirection(null);
      setIsAnimating(false);
      
      if (currentIndex >= SWIPE_ITEMS.length - 1) {
        const results = analyzeSwipes([...swipes, swipeData]);
        trackEvent('swipe_vibe_complete', results);
        onComplete(results);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, 300);
  }, [currentIndex, currentItem, isAnimating, swipes, onComplete]);

  const analyzeSwipes = (allSwipes: SwipeData[]): GameResult => {
    const likedSwipes = allSwipes.filter(s => s.liked);
    
    if (likedSwipes.length === 0) {
      return { 
        mood: 'adventurous', 
        craving: 'comfort', 
        budget: 'moderate', 
        preference: 'both',
        gameData: { type: 'swipe_vibe', swipes: allSwipes, topCategory: 'comfort', topCuisine: 'Mixed', likedCount: 0 }
      };
    }

    const countByKey = (key: keyof SwipeData) => {
      const counts: Record<string, number> = {};
      likedSwipes.forEach(s => {
        const val = String(s[key]);
        counts[val] = (counts[val] || 0) + 1;
      });
      return counts;
    };

    const categoryCounts = countByKey('category');
    const cuisineCounts = countByKey('cuisine');
    const budgetCounts = countByKey('budget');
    const vibeCounts = countByKey('vibe');

    const getTop = (counts: Record<string, number>) => 
      Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const topCategory = getTop(categoryCounts) || 'comfort';
    const topCuisine = getTop(cuisineCounts) || 'Mixed';
    const topBudget = getTop(budgetCounts) || 'moderate';
    const topVibe = getTop(vibeCounts) || 'casual';
    const mood = VIBE_TO_MOOD[topVibe] || 'happy';

    return {
      mood,
      craving: topCategory,
      budget: topBudget,
      preference: 'both',
      gameData: {
        type: 'swipe_vibe',
        swipes: allSwipes,
        topCategory,
        topCuisine,
        likedCount: likedSwipes.length,
      },
    };
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') handleSwipe(true);
    if (e.key === 'ArrowLeft') handleSwipe(false);
  }, [handleSwipe]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!currentItem) return null;

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-pink-50 via-white to-purple-50">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Swipe & Vibe</h2>
            <p className="text-gray-600 text-sm">
              Swipe right on foods that appeal to you, left on those that don't
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>{currentIndex + 1} of {SWIPE_ITEMS.length}</span>
            <span>{remaining} remaining</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="relative mb-6">
          <div 
            className={`bg-white rounded-3xl shadow-xl overflow-hidden transition-transform duration-300 ${
              direction === 'right' ? 'translate-x-20 rotate-12 opacity-50' :
              direction === 'left' ? '-translate-x-20 -rotate-12 opacity-50' : ''
            }`}
          >
            <div className="h-80 bg-gradient-to-br from-primary-100 via-secondary-100 to-primary-200 flex items-center justify-center relative">
              <span className="text-9xl">{currentItem.image}</span>
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-700 capitalize">
                  {currentItem.category}
                </span>
              </div>
              <div className="absolute top-4 right-4">
                <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-700">
                  {currentItem.cuisine}
                </span>
              </div>
            </div>

            <div className="p-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentItem.name}</h3>
              <div className="flex gap-3 text-sm text-gray-600">
                <span className="capitalize">{currentItem.vibe} vibe</span>
                <span>•</span>
                <span className="capitalize">{currentItem.budget}</span>
              </div>
            </div>
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            {direction === 'right' && (
              <div className="bg-green-500 text-white px-4 py-2 rounded-full font-bold transform rotate-[-12deg] border-4 border-white shadow-lg">
                LIKE
              </div>
            )}
            {direction === 'left' && (
              <div className="bg-red-500 text-white px-4 py-2 rounded-full font-bold transform rotate-[12deg] border-4 border-white shadow-lg">
                NOPE
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-6">
          <button
            onClick={() => handleSwipe(false)}
            disabled={isAnimating}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center text-red-500 hover:bg-red-50 hover:scale-110 transition-all disabled:opacity-50"
          >
            <X className="w-8 h-8" />
          </button>

          <button
            onClick={() => handleSwipe(true)}
            disabled={isAnimating}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center text-green-500 hover:bg-green-50 hover:scale-110 transition-all disabled:opacity-50"
          >
            <Heart className="w-8 h-8" />
          </button>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          Tip: Use ← → arrow keys to swipe
        </p>

        {swipes.length > 0 && (
          <div className="mt-8 p-4 bg-white/50 rounded-2xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {swipes.filter(s => s.liked).length} liked • {swipes.filter(s => !s.liked).length} passed
              </span>
              <button 
                onClick={() => {
                  setSwipes([]);
                  setCurrentIndex(0);
                  trackEvent('swipe_vibe_restart');
                }}
                className="text-primary-600 hover:text-primary-700 flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Restart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SwipeVibe;
