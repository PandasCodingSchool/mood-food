import { Smile, Gamepad2, Utensils, ArrowRight } from 'lucide-react';
import { useEffect, useRef } from 'react';

const steps = [
  {
    icon: Smile,
    step: '01',
    title: 'Tell Us Your Mood',
    description: 'Happy? Stressed? Celebrating? Your mood shapes what you actually want to eat.',
    color: 'from-yellow-400 to-orange-500',
    emoji: '😊',
    duration: '5 sec',
  },
  {
    icon: Gamepad2,
    step: '02',
    title: 'Play a Quick Game',
    description: 'Swipe foods, Meal Roulette, or answer a quiz — it\'s fun, not a chore.',
    color: 'from-primary-400 to-primary-600',
    emoji: '🎮',
    duration: '30 sec',
  },
  {
    icon: Utensils,
    step: '03',
    title: 'Get AI-Picked Meals',
    description: 'Receive 3 personalized recommendations with healthier swaps & budget options.',
    color: 'from-secondary-400 to-secondary-600',
    emoji: '🍽️',
    duration: 'instant',
  },
];

function HowItWorks() {
  const ref = useRef(null);

  useEffect(() => {
    const els = ref.current?.querySelectorAll('.fade-up');
    if (!els) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }),
      { threshold: 0.15 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="py-24 bg-white relative overflow-hidden" ref={ref}>
      {/* Subtle bg decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary-50 rounded-full opacity-40 blur-3xl pointer-events-none" />

      <div className="section-container relative">
        <div className="text-center mb-14 fade-up">
          <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 font-semibold text-xs uppercase tracking-wider px-4 py-2 rounded-full mb-4">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Simple as 1-2-3
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-4">
            From <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">"I'm hungry"</span> to eating in 90 seconds
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            No signups. No accounts. No nonsense. Just food answers, fast.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-24 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-yellow-300 via-primary-300 to-secondary-300 rounded-full" />

          <div className="grid md:grid-cols-3 gap-8 relative">
            {steps.map((item, index) => (
              <div
                key={index}
                className="relative group fade-up"
                style={{ transitionDelay: `${index * 0.15}s` }}
              >
                <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-sm group-hover:shadow-xl group-hover:-translate-y-2 transition-all duration-300 relative">
                  {/* Step number bubble */}
                  <div className={`w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 relative z-10`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Step badge */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Step {item.step}
                    <span className="text-gray-300">·</span>
                    <span className="text-primary-500">{item.duration}</span>
                  </span>

                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {item.description}
                  </p>

                  {/* Emoji accent */}
                  <span className="absolute -top-3 -right-2 text-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {item.emoji}
                  </span>
                </div>

                {/* Arrow between cards (desktop) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:flex absolute top-24 -right-4 z-10 w-8 h-8 bg-white rounded-full shadow-md items-center justify-center border border-gray-100">
                    <ArrowRight className="w-4 h-4 text-primary-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <p className="text-center text-gray-400 text-sm mt-10 fade-up" style={{ transitionDelay: '0.5s' }}>
          Total time: under 90 seconds &nbsp;·&nbsp; No app download needed &nbsp;·&nbsp; Works on any device
        </p>
      </div>
    </section>
  );
}

export default HowItWorks;
