import { ArrowLeft, RefreshCw, MapPin, Star, Share2, Heart, Loader2, Sparkles } from 'lucide-react';
import { fetchRecommendations } from '../services/aiRecommendations';
import { trackEvent } from '../utils/analytics';
import { useState, useEffect } from 'react';
import type { QuizResults, Recommendation } from '../types';

const moodEmojis: Record<string, string> = {
  happy: '😊',
  tired: '😴',
  stressed: '😰',
  celebrating: '🎉',
  relaxed: '😌',
  adventurous: '🤩',
};

interface RecommendationsProps {
  results: QuizResults;
  onBack: () => void;
}

function Recommendations({ results, onBack }: RecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      trackEvent('recommendations_requested', results);
      const data = await fetchRecommendations(results);
      
      setRecommendations(data.recommendations);
      setSource(data.source);
      
      trackEvent('recommendations_received', {
        source: data.source,
        count: data.recommendations.length,
      });
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError('Could not load recommendations. Please try again.');
      trackEvent('recommendations_error', { error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    trackEvent('recommendation_refreshed', results);
    loadRecommendations();
  };

  const handleShare = (item: Recommendation) => {
    trackEvent('recommendation_shared', { food: item.name });
    if (navigator.share) {
      navigator.share({
        title: `Try ${item.name}!`,
        text: `MoodFood recommended ${item.name} for my ${results.mood} mood!`,
        url: window.location.href,
      });
    }
  };

  const handleLike = (item: Recommendation) => {
    setLikedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(item.id)) {
        newSet.delete(item.id);
        trackEvent('recommendation_unliked', { food: item.name });
      } else {
        newSet.add(item.id);
        trackEvent('recommendation_liked', { food: item.name });
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-4xl mx-auto">
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
              <span className="text-2xl">{moodEmojis[results.mood] || '😊'}</span>
              <span className="font-medium text-primary-800 capitalize">
                Feeling {results.mood}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Your Personalized Recommendations
            </h2>
            <p className="text-gray-600">
              Based on your {results.craving} craving, {results.budget} budget, and {results.preference} preference
            </p>
          </div>
        </div>

        {source && (
          <div className="text-center mb-6">
            <span
              className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
                source === 'ai-service'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {source === 'ai-service' ? (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>AI Powered</span>
                </>
              ) : (
                <>
                  <span>Smart Fallback</span>
                </>
              )}
            </span>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
            <p className="text-gray-600">Cooking up personalized recommendations...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-12 bg-red-50 rounded-2xl">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={loadRecommendations}
              className="px-6 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {recommendations.map((item, index) => (
            <div
              key={item.id}
              className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="h-48 bg-gradient-to-br from-primary-400 to-secondary-500 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl">🍽️</span>
                </div>
                <div className="absolute top-4 right-4 flex space-x-2">
                  <button
                    onClick={() => handleLike(item)}
                    className={`p-2 rounded-full transition-colors ${
                      likedItems.has(item.id)
                        ? 'bg-red-500 text-white'
                        : 'bg-white/80 text-gray-600 hover:bg-white'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${likedItems.has(item.id) ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleShare(item)}
                    className="p-2 bg-white/80 text-gray-600 rounded-full hover:bg-white transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="absolute bottom-4 left-4">
                  <span className="bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-medium px-3 py-1 rounded-full">
                    {item.cuisine}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">{item.name}</h3>
                  <div className="flex items-center space-x-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="text-sm font-medium text-gray-600">
                      {(4 + Math.random()).toFixed(1)}
                    </span>
                  </div>
                </div>

                <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                  {item.why}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-gray-500 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>{item.budgetType}</span>
                  </div>
                  <button className="text-primary-600 font-medium text-sm hover:text-primary-700 transition-colors">
                    Find Nearby →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`btn-secondary flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Get New Recommendations'}
          </button>
          <button
            onClick={onBack}
            className="btn-primary flex items-center"
          >
            Start Over
            <ArrowLeft className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Recommendations;
