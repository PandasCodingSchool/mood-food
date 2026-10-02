import { Clock, Brain, Compass, Heart, Zap, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

const benefits = [
  {
    icon: Clock,
    title: 'Save 30 Minutes Daily',
    description: 'No more doom-scrolling Zomato at 8 PM. Get spot-on recommendations in under 2 minutes.',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50',
  },
  {
    icon: Brain,
    title: 'Zero Decision Fatigue',
    description: 'Your brain makes 35,000 decisions a day. Let us handle "what to eat" so you don\'t have to.',
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-50',
  },
  {
    icon: Compass,
    title: 'Discover Hidden Gems',
    description: 'Break out of your 5-restaurant rotation. We surface cuisines you never knew you\'d love.',
    gradient: 'from-green-500 to-emerald-500',
    bg: 'bg-green-50',
  },
  {
    icon: Heart,
    title: '100% Personalized',
    description: 'Not generic "top 10" lists. Every pick is tailored to your mood, cravings, and budget right now.',
    gradient: 'from-red-500 to-rose-500',
    bg: 'bg-red-50',
  },
  {
    icon: Zap,
    title: 'Actually Fun',
    description: 'Swipe, spin, or quiz. Choosing food becomes a 30-second game, not a 30-minute chore.',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
  },
  {
    icon: Sparkles,
    title: 'AI That Gets You',
    description: 'Powered by smart algorithms that learn your taste over time. The more you use it, the better it gets.',
    gradient: 'from-primary-500 to-secondary-500',
    bg: 'bg-primary-50',
  },
];

function Benefits() {
  const ref = useRef(null);

  useEffect(() => {
    const els = ref.current?.querySelectorAll('.fade-up');
    if (!els) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section id="benefits" className="py-24 bg-gradient-to-br from-gray-50 via-white to-primary-50/30" ref={ref}>
      <div className="section-container">
        <div className="text-center mb-14 fade-up">
          <span className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 font-semibold text-xs uppercase tracking-wider px-4 py-2 rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Why MoodFood
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-4">
            Built for people who <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">hate deciding</span>
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Six reasons why thousands of food lovers are already on our waitlist
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 fade-up"
              style={{ transitionDelay: `${index * 0.08}s` }}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${benefit.gradient} group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
                <benefit.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                {benefit.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Core Problem Highlight */}
        <div className="mt-16 bg-gradient-to-r from-primary-600 via-orange-500 to-secondary-600 rounded-3xl p-8 md:p-12 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M0 0h60v60H0z%22 fill=%22none%22/%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%221.5%22 fill=%22rgba(255,255,255,0.08)%22/%3E%3C/svg%3E')]" />
          <div className="relative">
            <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-4">The difference</p>
            <h3 className="text-xl md:text-2xl font-medium mb-2 text-white/80">
              Other apps ask: <span className="line-through opacity-60">"How do I order?"</span>
            </h3>
            <div className="w-12 h-0.5 bg-white/30 mx-auto my-4 rounded-full" />
            <h3 className="text-3xl md:text-4xl font-black">
              We answer: <span className="underline decoration-yellow-300 decoration-4 underline-offset-4">"What should I eat?"</span>
            </h3>
            <p className="mt-4 text-white/70 text-sm max-w-md mx-auto">
              Because the hardest part isn't ordering. It's deciding.
            </p>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="mt-16 fade-up">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-100 to-secondary-100 text-primary-700 font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-full mb-4">
              <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              Coming Soon
            </span>
            <h3 className="text-2xl md:text-3xl font-black text-gray-900 mt-2">
              The future is <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">delicious</span>
            </h3>
            <p className="text-gray-500 mt-2 max-w-lg mx-auto">
              We're cooking up features that'll make choosing food as exciting as eating it
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { emoji: '📍', title: 'Restaurant Finder', desc: 'Find nearby spots serving your AI-picked dish', tag: 'Q3 2026' },
              { emoji: '👥', title: 'Group Decisions', desc: 'Vote with friends. One link, everyone picks.', tag: 'Q3 2026' },
              { emoji: '📸', title: 'Meal Memories', desc: 'Snap what you ate, build your flavor profile', tag: 'Q4 2026' },
              { emoji: '🔔', title: 'Meal Reminders', desc: '"Hungry yet?" nudges based on your routine', tag: 'Q4 2026' },
              { emoji: '🏆', title: 'Taste Streaks', desc: 'Try new things daily & earn badges', tag: 'Q1 2027' },
              { emoji: '🌍', title: 'Global Palette', desc: 'Explore cuisines from 50+ countries with guides', tag: 'Q1 2027' },
            ].map((item, i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{item.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                      <span className="text-[10px] font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{item.tag}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-400 text-sm">
              Want early access? <a href="#waitlist" className="text-primary-600 font-semibold hover:underline">Join the waitlist</a> and be first in line.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Benefits;
