import { ArrowLeft, Heart, Brain, Sparkles, Users } from "lucide-react";

interface AboutProps {
  onBack: () => void;
}

function About({ onBack }: AboutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Home</span>
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-400 to-purple-500 rounded-2xl mb-6">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
            About <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-500">MoodFood</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            AI-powered food recommendations that understand your mood, cravings, and preferences
          </p>
        </div>

        {/* Story Section */}
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Story</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            MoodFood was born from a simple frustration: spending 30 minutes every day deciding what to eat. 
            We believed there had to be a better way to match your food with how you're feeling.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Using AI and a bit of food psychology, we created an app that doesn't just recommend meals—
            it understands your mood, respects your budget, and even channels your favorite movie characters 
            to suggest the perfect dish.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6">
            <div className="w-12 h-12 bg-orange-200 rounded-xl flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">AI-Powered</h3>
            <p className="text-sm text-gray-600">
              Smart recommendations that learn from your preferences and mood patterns
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6">
            <div className="w-12 h-12 bg-purple-200 rounded-xl flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Character Match</h3>
            <p className="text-sm text-gray-600">
              Find out which TV character matches your personality and what they'd eat
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-2xl p-6">
            <div className="w-12 h-12 bg-pink-200 rounded-xl flex items-center justify-center mb-4">
              <Heart className="w-6 h-6 text-pink-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Made with Love</h3>
            <p className="text-sm text-gray-600">
              Built by food lovers who understand that the right meal can make your day
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-3xl shadow-sm p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Get in Touch</h2>
          <p className="text-gray-600 mb-6">
            Have feedback or suggestions? We'd love to hear from you!
          </p>
          <a
            href="mailto:hello@moodfood.fun"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            <span>hello@moodfood.fun</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default About;
