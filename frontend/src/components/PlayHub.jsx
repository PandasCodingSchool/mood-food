import { ArrowLeft, BookOpen, Blend, CircleDot, ClipboardList, Clock } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

const LAST_MODE_KEY = 'moodfood_last_play_mode';

const MODES = [
  {
    id: 'story',
    title: 'Day Story',
    hook: 'Live a mini day — we read your mood from your choices.',
    time: '~45 sec',
    icon: BookOpen,
    color: 'from-amber-400 to-orange-500',
  },
  {
    id: 'roulette',
    title: 'Mood Roulette',
    hook: 'Spin twice, blend your moods, chase a meal.',
    time: '~30 sec',
    icon: CircleDot,
    color: 'from-violet-400 to-purple-600',
  },
  {
    id: 'blender',
    title: 'Mood Blender',
    hook: 'Drag two moods into the jar and mix your vibe.',
    time: '~1 min',
    icon: Blend,
    color: 'from-fuchsia-400 to-secondary-500',
  },
  {
    id: 'quiz',
    title: 'Quick Quiz',
    hook: 'Classic four questions — fastest path to picks.',
    time: '~2 min',
    icon: ClipboardList,
    color: 'from-primary-400 to-primary-600',
  },
];

function PlayHub({ onSelectMode, onBack }) {
  const lastMode = typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem(LAST_MODE_KEY)
    : null;

  const handleSelect = (modeId) => {
    sessionStorage.setItem(LAST_MODE_KEY, modeId);
    trackEvent('mode_selected', { mode: modeId });
    onSelectMode(modeId);
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Pick your path
          </h1>
          <p className="text-gray-600 max-w-md mx-auto">
            Same great recommendations — choose how you want to get there.
          </p>
        </div>

        <div className="grid gap-4">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const isLast = lastMode === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode.id)}
                className="group text-left bg-white rounded-2xl border-2 border-gray-100 hover:border-primary-300 shadow-md hover:shadow-lg p-5 md:p-6 transition-all duration-200 hover:scale-[1.01]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${mode.color} flex items-center justify-center shadow-md`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="text-lg font-bold text-gray-900">{mode.title}</h2>
                      {isLast && (
                        <span className="text-xs font-medium bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                          Last played
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{mode.hook}</p>
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {mode.time}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PlayHub;
