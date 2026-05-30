import { ArrowLeft, RefreshCw, MapPin, Star, Share2, Heart } from 'lucide-react';
import { getRecommendations } from '../utils/recommendationEngine';
import { trackEvent } from '../utils/analytics';
import { useState } from 'react';

function Recommendations({ results, onBack }) {
  const [recommendations, setRecommendations] = useState(
    getRecommendations(results.mood, results.craving, results.budget, results.preference)
  );
  const [likedItems, setLikedItems] = useState(new Set());

  const handleRefresh = () => {
    trackEvent('recommendation_refreshed', results);
    setRecommendations(getRecommendations(results.mood, results.craving, results.budget, results.preference));
  };

  const handleShare = (item) => {
    trackEvent('recommendation_shared', { food: item.name });
    if (navigator.share) {
      navigator.share({
        title: `Try ${item.name}!`,
        text: `MoodFood recommended ${item.name} for my ${results.mood} mood!`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(`Try ${item.name}! Recommended by MoodFood for ${results.mood} mood.`);
      alert('Copied to clipboard!');
    }
  };

  const handleLike = (item) => {
    const newLiked = new Set(likedItems);
    if (newLiked.has(item.id)) {
      newLiked.delete(item.id);
    } else {
      newLiked.add(item.id);
      trackEvent('recommendation_liked', { food: item.name });
    }
    setLikedItems(newLiked);
  };

  const moodEmojis = {
    happy: '😊',
    tired: '😴',
    stressed: '😰',
    celebrating: '🥳',
    relaxed: '😌',
    adventurous: '🤩',
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-4xl mx-auto">
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

        {/* Recommendations */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {recommendations.map((item, index) => (
            <div
              key={item.id}
              className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Image placeholder with gradient */}
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

                <div className="flex flex-wrap gap-2 mb-4">
                  {item.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

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

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleRefresh}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Get New Recommendations
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
