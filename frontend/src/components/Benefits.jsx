import { Clock, Brain, Compass, Heart, Zap } from 'lucide-react';
import AnimateIn from './AnimateIn';

const benefits = [
  {
    icon: Clock,
    title: 'Save Time',
    description: 'No more endless scrolling through restaurant listings. Get recommendations in under 2 minutes.',
  },
  {
    icon: Brain,
    title: 'Reduce Decision Fatigue',
    description: 'We make the decision for you based on your mood and preferences. Less stress, more eating.',
  },
  {
    icon: Compass,
    title: 'Discover New Foods',
    description: 'Break out of your routine and discover cuisines and dishes you have never tried before.',
  },
  {
    icon: Heart,
    title: 'Personalized Suggestions',
    description: 'Recommendations tailored to your taste, dietary preferences, and current cravings.',
  },
  {
    icon: Zap,
    title: 'Fun Experience',
    description: 'Games and quick questions make figuring out dinner feel light, not like another chore.',
  },
];

function Benefits() {
  return (
    <section id="benefits" className="py-20 bg-primary-50/40">
      <div className="section-container">
        <AnimateIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Why Choose MoodFood?
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto font-sans">
            We solve the &quot;What should I eat?&quot; problem that other apps ignore
          </p>
        </AnimateIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <AnimateIn key={benefit.title} delay={(index % 3) * 80} variant="slide-up">
              <div className="card flex items-start space-x-4 h-full transition-all duration-300 hover:-translate-y-1">
                <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                  <benefit.icon className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed font-sans">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>

        <AnimateIn delay={120} variant="scale" className="mt-16 max-w-3xl mx-auto">
          <div className="surface p-8 md:p-10 text-center border-2 border-primary-200 bg-white shadow-sm">
            <h3 className="text-xl md:text-2xl font-semibold text-slate-800 mb-4">
              Current food apps solve: &quot;How do I order?&quot;
            </h3>
            <div className="w-12 h-px bg-primary-200 mx-auto mb-4" />
            <h3 className="text-xl md:text-2xl font-bold text-secondary-600">
              We solve: &quot;What should I eat?&quot;
            </h3>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}

export default Benefits;
