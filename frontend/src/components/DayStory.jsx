import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { STORY_BEATS, STORY_COLD_OPEN } from '../constants/storyBeats';
import { computeMoodFromStory } from '../utils/storyEngine';
import StoryScene from './StoryScene';
import { trackEvent } from '../utils/analytics';

const SEGMENTS = ['Morning', 'Lunch', 'Evening'];

function DayStory({ onComplete, onBack }) {
  const [phase, setPhase] = useState('intro'); // intro | beats | reveal
  const [beatIndex, setBeatIndex] = useState(0);
  const [choices, setChoices] = useState([]);
  const [reveal, setReveal] = useState(null);

  const beat = STORY_BEATS[beatIndex];

  const handleIntroStart = () => {
    trackEvent('story_started');
    setPhase('beats');
  };

  const handleChoice = (choiceId) => {
    const nextChoices = [...choices, choiceId];
    setChoices(nextChoices);

    trackEvent('story_beat_answered', {
      beat: beat.id,
      choice: choiceId,
    });

    if (beatIndex < STORY_BEATS.length - 1) {
      setBeatIndex((i) => i + 1);
    } else {
      const result = computeMoodFromStory(nextChoices);
      setReveal(result);
      setPhase('reveal');
      trackEvent('story_mood_revealed', {
        mood: result.moodSlug,
        summary: result.storySummary,
      });
    }
  };

  const handleBeatBack = () => {
    if (beatIndex > 0) {
      setBeatIndex((i) => i - 1);
      setChoices((c) => c.slice(0, -1));
    }
  };

  const handleContinueToFollowUp = () => {
    if (!reveal) return;
    onComplete({
      mood: reveal.moodSlug,
      storySummary: reveal.storySummary,
      source: 'story',
    });
  };

  if (phase === 'intro') {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <StoryScene scene="morning" />
            <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
              {STORY_COLD_OPEN.title}
            </h1>
            <p className="text-gray-600 mb-8">{STORY_COLD_OPEN.subtitle}</p>
            <button type="button" onClick={handleIntroStart} className="btn-primary w-full text-lg py-4 group">
              Start my day
              <ArrowRight className="w-5 h-5 ml-2 inline group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'reveal' && reveal) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center animate-fade-in">
            <p className="text-sm font-medium text-primary-600 mb-2">Your day in a nutshell</p>
            <div className="text-7xl mb-4">{reveal.moodEmoji}</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Feeling {reveal.moodLabel}</h2>
            <p className="text-gray-600 mb-8">{reveal.storySummary}</p>
            <button type="button" onClick={handleContinueToFollowUp} className="btn-primary w-full text-lg py-4 group">
              What sounds good tonight?
              <ArrowRight className="w-5 h-5 ml-2 inline group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          {beatIndex > 0 ? (
            <button
              type="button"
              onClick={handleBeatBack}
              className="flex items-center text-gray-500 hover:text-gray-700 text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center text-gray-500 hover:text-gray-700 text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Exit
            </button>
          )}
          <div className="flex gap-1 text-xs font-medium text-gray-500">
            {SEGMENTS.map((label, i) => (
              <span
                key={label}
                className={
                  i === beatIndex
                    ? 'text-primary-600'
                    : i < beatIndex
                      ? 'text-primary-400'
                      : ''
                }
              >
                {label}
                {i < SEGMENTS.length - 1 && ' · '}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full flex gap-1 mb-6">
          {SEGMENTS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= beatIndex ? 'bg-primary-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 animate-fade-in">
          <StoryScene scene={beat.scene} />
          <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide mt-4 mb-1">
            {beat.segmentLabel}
          </p>
          <p className="text-lg text-gray-800 mb-6 leading-relaxed">{beat.narrative}</p>

          <div className="flex flex-col gap-3">
            {beat.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleChoice(choice.id)}
                className="flex items-center gap-4 w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50/50 text-left transition-all"
              >
                <span className="text-2xl flex-shrink-0">{choice.emoji}</span>
                <span className="font-medium text-gray-900">{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DayStory;
