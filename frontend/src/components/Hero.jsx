import { ArrowRight, Sparkles, Clock, Smile, Star } from 'lucide-react';

const PARTICLES = [
  { emoji: '🍕', left: '8%',  delay: '0s',   dur: '12s', size: '2rem' },
  { emoji: '🍜', left: '18%', delay: '2s',   dur: '15s', size: '1.6rem' },
  { emoji: '🥗', left: '30%', delay: '4s',   dur: '11s', size: '1.8rem' },
  { emoji: '🌮', left: '44%', delay: '1s',   dur: '13s', size: '2.2rem' },
  { emoji: '🍣', left: '58%', delay: '3.5s', dur: '14s', size: '1.5rem' },
  { emoji: '🍔', left: '70%', delay: '0.5s', dur: '10s', size: '2rem' },
  { emoji: '🥘', left: '80%', delay: '2.5s', dur: '16s', size: '1.7rem' },
  { emoji: '🍰', left: '90%', delay: '1.5s', dur: '12s', size: '1.6rem' },
];

function Hero({ onStartQuiz }) {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
      {/* Animated background blobs */}
      <div className="blob-drift absolute top-16 right-[-4rem] w-[32rem] h-[32rem] bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40" style={{ animationDelay: '0s' }} />
      <div className="blob-drift absolute bottom-[-4rem] left-[-4rem] w-[32rem] h-[32rem] bg-secondary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" style={{ animationDelay: '3s' }} />
      <div className="blob-drift absolute top-1/2 left-1/3 w-64 h-64 bg-yellow-200 rounded-full mix-blend-multiply filter blur-3xl opacity-25" style={{ animationDelay: '6s' }} />

      {/* Floating food particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="particle select-none"
          style={{
            left: p.left,
            bottom: '-2rem',
            fontSize: p.size,
            animationDuration: p.dur,
            animationDelay: p.delay,
          }}
        >
          {p.emoji}
        </span>
      ))}

      <div className="section-container relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 bg-white/90 backdrop-blur-sm border border-primary-100 shadow-sm rounded-full px-4 py-2 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-semibold text-primary-700">AI-Powered Food Recommendations</span>
          </div>

          {/* Headline — word-by-word reveal */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-gray-900 mb-6 leading-tight tracking-tight" style={{ perspective: '600px' }}>
            {['Stop', 'Spending'].map((word, i) => (
              <span key={i} className="hero-word mr-[0.25em]" style={{ animationDelay: `${i * 0.1}s` }}>{word}</span>
            ))}
            <span className="hero-word bg-gradient-to-r from-primary-500 via-orange-500 to-secondary-500 bg-clip-text text-transparent mr-[0.25em]" style={{ animationDelay: '0.2s' }}>30</span>
            <span className="hero-word bg-gradient-to-r from-primary-500 via-orange-500 to-secondary-500 bg-clip-text text-transparent" style={{ animationDelay: '0.3s' }}>Minutes</span>
            <br />
            {['Deciding', 'What', 'To', 'Eat.'].map((word, i) => (
              <span key={i} className="hero-word mr-[0.25em]" style={{ animationDelay: `${0.45 + i * 0.1}s` }}>{word}</span>
            ))}
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto animate-slide-up leading-relaxed" style={{ animationDelay: '0.1s' }}>
            Tell us your mood. Get{' '}
            <span className="font-bold text-primary-600">AI-curated meal picks</span>{' '}
            in under 2 minutes — no decision fatigue, just deliciousness.
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-12 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-gray-700">Under 2 min</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 rounded-full px-4 py-2">
              <Smile className="w-4 h-4 text-secondary-500" />
              <span className="text-sm font-medium text-gray-700">Mood-based AI</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 rounded-full px-4 py-2">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium text-gray-700">100% Personalized</span>
            </div>
          </div>

          {/* CTA */}
          <div className="animate-slide-up flex flex-col items-center gap-4" style={{ animationDelay: '0.3s' }}>
            <button
              onClick={onStartQuiz}
              className="btn-primary btn-shimmer text-lg px-10 py-4 group shadow-xl hover:shadow-primary-200/60"
            >
              🍽️ Find My Meal
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-sm text-gray-400">
              No signup required &nbsp;·&nbsp; Free forever &nbsp;·&nbsp; Takes 90 seconds
            </p>
          </div>

          {/* Social proof strip */}
          <div className="mt-16 flex flex-wrap justify-center items-center gap-6 animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="text-center">
              <p className="text-2xl font-black text-primary-600">2,400+</p>
              <p className="text-xs text-gray-500 mt-0.5">on waitlist</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-2xl font-black text-primary-600">8</p>
              <p className="text-xs text-gray-500 mt-0.5">cuisines</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-2xl font-black text-primary-600">4 games</p>
              <p className="text-xs text-gray-500 mt-0.5">to discover your mood</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
