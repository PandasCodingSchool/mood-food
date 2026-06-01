import { BookOpen, Blend, CircleDot, ClipboardList } from 'lucide-react';
import AnimateIn from './AnimateIn';

const MODES = [
  {
    id: 'story',
    title: 'Day Story',
    hook: 'Your day, your mood',
    icon: BookOpen,
    borderClass: 'border-l-4 border-l-primary-500 bg-primary-50/50',
    iconClass: 'text-primary-600',
    delay: 200,
  },
  {
    id: 'roulette',
    title: 'Mood Roulette',
    hook: 'Spin and blend',
    icon: CircleDot,
    borderClass: 'border-l-4 border-l-secondary-500 bg-secondary-50/50',
    iconClass: 'text-secondary-600',
    delay: 280,
  },
  {
    id: 'blender',
    title: 'Mood Blender',
    hook: 'Mix two vibes',
    icon: Blend,
    borderClass: 'border-l-4 border-l-primary-400 bg-white',
    iconClass: 'text-primary-600',
    delay: 360,
  },
  {
    id: 'quiz',
    title: 'Quick Quiz',
    hook: 'Fast four questions',
    icon: ClipboardList,
    borderClass: 'border-l-4 border-l-secondary-400 bg-white',
    iconClass: 'text-secondary-600',
    delay: 440,
  },
];

function HeroModeBento({ onOpenPlayHub }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        return (
          <AnimateIn key={mode.id} immediate delay={mode.delay} variant="scale">
            <button
              type="button"
              onClick={onOpenPlayHub}
              className={`surface w-full p-4 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-1 active:scale-[0.98] ${mode.borderClass}`}
            >
              <Icon className={`w-5 h-5 mb-2 ${mode.iconClass}`} />
              <h3 className="font-semibold text-slate-900 text-sm">{mode.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">{mode.hook}</p>
            </button>
          </AnimateIn>
        );
      })}
    </div>
  );
}

export default HeroModeBento;
