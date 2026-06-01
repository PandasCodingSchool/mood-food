import { ArrowRight, Sparkles, Clock, Smile, Play } from 'lucide-react';

function Hero({ onOpenPlayHub, onStartQuiz }) {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
      <div className="absolute top-20 right-0 w-96 h-96 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />

      <div className="section-container relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full px-4 py-2 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-medium text-gray-700">
              AI-Powered Food Recommendations
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight animate-slide-up">
            Stop Spending{' '}
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
              30 Minutes
            </span>{' '}
            Deciding What To Eat.
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Play a quick game — story, roulette, or mood blender — then get meals matched to your vibe.
          </p>

          <div className="flex flex-wrap justify-center gap-6 mb-10 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2">
              <Clock className="w-5 h-5 text-primary-500" />
              <span className="text-sm font-medium text-gray-700">Under 2 min</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2">
              <Smile className="w-5 h-5 text-secondary-500" />
              <span className="text-sm font-medium text-gray-700">Mood-based</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-medium text-gray-700">Personalized</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <button
              type="button"
              onClick={onOpenPlayHub}
              className="btn-primary text-lg px-8 py-4 group inline-flex items-center"
            >
              <Play className="w-5 h-5 mr-2" />
              Play
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              type="button"
              onClick={onStartQuiz}
              className="text-gray-600 hover:text-primary-600 font-medium text-sm underline-offset-4 hover:underline transition-colors"
            >
              Or take the quick quiz
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            No signup required • Free forever
          </p>
        </div>
      </div>
    </section>
  );
}

export default Hero;
