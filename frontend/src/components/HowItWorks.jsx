import { Gamepad2, SlidersHorizontal, Utensils } from 'lucide-react';
import AnimateIn from './AnimateIn';

const steps = [
  {
    icon: Gamepad2,
    step: '01',
    title: 'Play your way',
    description:
      'Choose Day Story, Mood Roulette, Mood Blender, or the quick quiz — each path reads your vibe differently.',
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
  },
  {
    icon: SlidersHorizontal,
    step: '02',
    title: 'Fine-tune cravings',
    description:
      'Tell us what sounds good, your budget, and dietary preference in a few themed taps.',
    iconBg: 'bg-secondary-100',
    iconColor: 'text-secondary-600',
  },
  {
    icon: Utensils,
    step: '03',
    title: 'Get recommendations',
    description:
      'Receive personalized meal ideas matched to your mood and preferences.',
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-white border-y border-primary-100">
      <div className="section-container">
        <AnimateIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            How It Works
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto font-sans">
            Three steps from playful input to your next meal
          </p>
        </AnimateIn>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((item, index) => (
            <AnimateIn key={item.step} delay={index * 100} variant="slide-up">
              <div className="card text-center h-full transition-transform duration-300 hover:-translate-y-1 bg-gradient-to-b from-white to-primary-50/30">
                <div
                  className={`w-14 h-14 mx-auto mb-6 rounded-full ${item.iconBg} flex items-center justify-center`}
                >
                  <item.icon className={`w-7 h-7 ${item.iconColor}`} />
                </div>
                <span className="text-4xl font-bold text-primary-100 mb-4 block">
                  {item.step}
                </span>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">
                  {item.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed font-sans">
                  {item.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
