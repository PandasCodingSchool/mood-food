import { useState } from 'react';
import { ArrowRight, Play, CheckCircle, Loader2 } from 'lucide-react';
import HeroModeBento from './HeroModeBento';
import AnimateIn from './AnimateIn';
import { trackEvent } from '../utils/analytics';
import { markWaitlistJoined, submitWaitlist } from '../utils/waitlist';

function Hero({ onOpenPlayHub, onStartQuiz, waitlistJoined, onWaitlistJoined }) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [localJoined, setLocalJoined] = useState(false);

  const joined = waitlistJoined || localJoined;

  const scrollToWaitlist = () => {
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError('');

    trackEvent('waitlist_join_attempted', { email, entry: 'hero' });

    try {
      await submitWaitlist({ email: email.trim() });
      trackEvent('waitlist_joined', { email, entry: 'hero' });
      markWaitlistJoined();
      setLocalJoined(true);
      onWaitlistJoined?.();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      trackEvent('waitlist_error', { entry: 'hero', error: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden landing-hero-bg border-b border-primary-100/60">
      <div
        className="pointer-events-none absolute -top-24 right-0 w-96 h-96 bg-primary-200/50 rounded-full blur-3xl animate-soft-pulse"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 w-64 h-64 bg-secondary-200/40 rounded-full blur-3xl"
        aria-hidden
      />

      <div className="section-container relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <AnimateIn immediate delay={0}>
              <p className="inline-flex items-center gap-2 text-sm font-medium text-primary-800 bg-primary-100/80 border border-primary-200 rounded-full px-3 py-1.5 mb-6">
                <span
                  className="w-2 h-2 rounded-full bg-primary-500 animate-soft-pulse"
                  aria-hidden
                />
                Mood-based food picks
              </p>
            </AnimateIn>

            <AnimateIn immediate delay={80}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 mb-5 leading-[1.1] tracking-tight">
                Stop spending{' '}
                <span className="text-primary-600">30 minutes</span>{' '}
                deciding what to eat.
              </h1>
            </AnimateIn>

            <AnimateIn immediate delay={160}>
              <p className="text-lg text-slate-600 mb-8 max-w-lg font-sans">
                Play a quick game, then get meals matched to your vibe — story, roulette, blender, or quiz.
              </p>
            </AnimateIn>

            <AnimateIn immediate delay={240}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
                <button
                  type="button"
                  onClick={onOpenPlayHub}
                  className="btn-primary text-lg px-8 py-3.5 group inline-flex items-center justify-center shadow-md shadow-[rgb(var(--color-primary-600)/0.2)]"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Play
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
                <button
                  type="button"
                  onClick={onStartQuiz}
                  className="btn-outline text-lg px-8 py-3.5 hover:-translate-y-0.5 transition-transform duration-200"
                >
                  Quick quiz
                </button>
              </div>
            </AnimateIn>

            <AnimateIn immediate delay={320}>
              {joined ? (
                <div className="flex items-center gap-2 text-sm text-primary-800 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 mb-2 animate-success-pop max-w-md">
                  <CheckCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  <span>You&apos;re on the waitlist — we&apos;ll email you at launch.</span>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} className="mb-2">
                  <div className="flex flex-col sm:flex-row gap-2 max-w-md p-1.5 bg-white/80 border border-primary-200 rounded-full shadow-sm">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="flex-1 px-4 py-3 rounded-full text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-transparent font-sans"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary py-3 px-6 text-sm whitespace-nowrap disabled:opacity-70"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Join waitlist'
                      )}
                    </button>
                  </div>
                  {error && (
                    <p className="text-red-600 text-xs mt-2 animate-fade-in">{error}</p>
                  )}
                </form>
              )}
            </AnimateIn>

            <AnimateIn immediate delay={400}>
              <p className="text-sm text-slate-500 font-sans">
                No signup to play •{' '}
                {!joined && (
                  <button
                    type="button"
                    onClick={scrollToWaitlist}
                    className="text-secondary-600 font-medium hover:underline transition-colors"
                  >
                    Full signup below
                  </button>
                )}
                {joined && 'Free forever'}
              </p>
            </AnimateIn>
          </div>

          <AnimateIn immediate delay={120} variant="scale" className="lg:pl-4">
            <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wider mb-3 font-sans">
              Pick a mode
            </p>
            <HeroModeBento onOpenPlayHub={onOpenPlayHub} />
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}

export default Hero;
