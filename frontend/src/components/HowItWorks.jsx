import { Smile, MessageCircle, Utensils } from 'lucide-react';
import { useEffect, useRef } from 'react';

const steps = [
  {
    icon: Smile,
    step: '01',
    title: 'Choose Your Mood',
    description: 'Tell us how you are feeling right now. Happy, tired, stressed, or celebrating?',
    color: 'from-yellow-400 to-orange-500',
  },
  {
    icon: MessageCircle,
    step: '02',
    title: 'Answer Quick Questions',
    description: 'Answer 3-5 fun questions about your cravings, budget, and preferences.',
    color: 'from-primary-400 to-primary-600',
  },
  {
    icon: Utensils,
    step: '03',
    title: 'Get Recommendations',
    description: 'Receive personalized food recommendations tailored just for you.',
    color: 'from-secondary-400 to-secondary-600',
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
    <section id="how-it-works" className="py-20 bg-white" ref={ref}>
      <div className="section-container">
        <div className="text-center mb-16 fade-up">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Three simple steps to discover your perfect meal
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((item, index) => (
            <div
              key={index}
              className="relative group fade-up"
              style={{ transitionDelay: `${index * 0.15}s` }}
            >
              <div className="card text-center group-hover:-translate-y-2 transition-transform duration-300">
                <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg`}>
                  <item.icon className="w-8 h-8 text-white" />
                </div>
                <span className="text-4xl font-bold text-gray-100 mb-4 block">
                  {item.step}
                </span>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-600">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Connecting lines for desktop */}
        <div className="hidden md:block absolute left-1/3 top-1/2 w-1/6 h-px bg-gradient-to-r from-gray-200 to-transparent" />
        <div className="hidden md:block absolute right-1/3 top-1/2 w-1/6 h-px bg-gradient-to-l from-gray-200 to-transparent" />
      </div>
    </section>
  );
}

export default HowItWorks;
