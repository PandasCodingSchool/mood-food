import { Clock, Brain, Compass, Heart, Zap } from 'lucide-react';

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
    description: 'Answering questions about your mood and cravings makes meal planning enjoyable.',
  },
];

function Benefits() {
  return (
    <section id="benefits" className="py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="section-container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Choose MoodFood?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We solve the "What should I eat?" problem that other apps ignore
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="card flex items-start space-x-4 hover:-translate-y-1 transition-transform duration-300"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                <benefit.icon className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Core Problem Highlight */}
        <div className="mt-16 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-3xl p-8 md:p-12 text-white text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-4">
            Current food apps solve: "How do I order?"
          </h3>
          <div className="w-16 h-1 bg-white/30 mx-auto mb-4 rounded-full" />
          <h3 className="text-2xl md:text-3xl font-bold">
            We solve: "What should I eat?"
          </h3>
        </div>
      </div>
    </section>
  );
}

export default Benefits;
