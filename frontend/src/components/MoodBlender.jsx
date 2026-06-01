import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { MOOD_OPTIONS } from '../constants/moods';
import { blendMoods } from '../utils/blendEngine';
import { trackEvent } from '../utils/analytics';
import BlenderMixerAnimation from './BlenderMixerAnimation';

const SLOT_IDS = ['slot-a', 'slot-b'];
const BLEND_DURATION_MS = 3400;
const POUR_MS = 550;
const MIX_START_MS = 600;
const REVEAL_MS = 2600;

function DraggableMoodChip({ mood, inTray = true }) {
  const id = inTray ? `tray-${mood.value}` : `slot-item-${mood.value}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { mood: mood.value, fromTray: inTray },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center justify-center min-w-[3.5rem] min-h-[3.5rem] w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 cursor-grab active:cursor-grabbing text-3xl md:text-4xl transition-shadow ${
        mood.color
      } ${isDragging ? 'opacity-40 shadow-lg scale-95' : 'shadow-md hover:shadow-lg hover:scale-105'}`}
      title={mood.label}
    >
      {mood.emoji}
    </div>
  );
}

function DropSlot({ slotId, moodSlug, onClear, poured }) {
  const mood = moodSlug ? MOOD_OPTIONS.find((m) => m.value === moodSlug) : null;
  const { isOver, setNodeRef } = useDroppable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col items-center justify-center w-24 h-24 md:w-32 md:h-32 rounded-2xl border-2 border-dashed transition-all duration-300 ${
        poured ? 'opacity-30 border-gray-200 bg-gray-50 scale-90' : ''
      } ${
        isOver
          ? 'border-primary-500 bg-primary-50 scale-105'
          : mood && !poured
            ? 'border-primary-300 bg-white shadow-md'
            : 'border-gray-300 bg-gray-50/80'
      }`}
    >
      {poured ? (
        <span className="text-xs text-primary-500 font-medium animate-pulse">In blender</span>
      ) : mood ? (
        <>
          <span className="text-4xl md:text-5xl transition-transform">{mood.emoji}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear(slotId);
            }}
            className="absolute -top-2 -right-2 p-1 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
            aria-label="Remove mood"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <span className="text-xs text-gray-400 font-medium text-center px-2">
          Drop here
        </span>
      )}
      <span className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">
        {slotId === 'slot-a' ? 'A' : 'B'}
      </span>
    </div>
  );
}

/** Jar interior: pour emojis → CSS spinning mixer → reveal result */
function JarMixingInterior({ emojiA, emojiB, blendPhase, resultEmoji, morphKey }) {
  const isPour = blendPhase === 'pour';
  const isMix = blendPhase === 'mix';
  const isReveal = blendPhase === 'reveal';
  const showLiquid = isPour || isMix;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
      style={{ top: '26%', width: '52%', height: '46%' }}
    >
      <div
        className="relative w-full h-full overflow-hidden rounded-b-[42%] rounded-t-xl border-x-[3px] border-b-[3px] border-secondary-500/50 shadow-inner bg-gradient-to-b from-purple-100/40 to-orange-100/30"
      >
        {showLiquid && !isMix && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-400/50 via-secondary-500/40 to-primary-500/40" />
        )}

        {/* Pour only: emojis drop in, then vanish when mix starts */}
        {isPour && emojiA && emojiB && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="absolute text-3xl md:text-4xl animate-pour-in-left opacity-90">{emojiA}</span>
            <span className="absolute text-3xl md:text-4xl animate-pour-in-right opacity-90" style={{ animationDelay: '0.1s' }}>
              {emojiB}
            </span>
          </div>
        )}

        {/* Mix phase: pure CSS rotating impeller + liquid */}
        {isMix && <BlenderMixerAnimation active />}

        {/* Reveal: final blended emoji */}
        {isReveal && resultEmoji && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/10">
            <span key={morphKey} className="text-5xl md:text-6xl animate-emoji-pop drop-shadow-lg z-10">
              {resultEmoji}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BlenderIllustration({ isShaking, isBlending, blendPhase, emojiA, emojiB, resultEmoji, morphKey }) {
  return (
    <div
      className={`relative mx-auto w-52 sm:w-56 md:w-64 lg:w-72 ${isShaking ? 'animate-blender-shake' : ''}`}
      style={{ transformOrigin: 'center bottom' }}
    >
      {isBlending && (
        <div
          className="absolute left-1/2 top-[22%] -translate-x-1/2 w-36 h-36 md:w-44 md:h-44 rounded-full bg-gradient-to-br from-secondary-300/70 to-primary-400/60 animate-blend-glow blur-xl z-0"
          aria-hidden
        />
      )}

      {/* Lid — bounces while blending */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-30 w-[88%] transition-transform ${
          isBlending ? 'animate-lid-bounce' : ''
        }`}
        style={{ top: '14%' }}
      >
        <div className="h-5 md:h-6 bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-xl border-2 border-gray-500 shadow-md mx-auto w-full max-w-[200px]" />
        <div className="h-2 bg-gray-500 rounded-b-md mx-auto w-[70%] -mt-px" />
      </div>

      <svg viewBox="0 0 200 240" className="w-full h-60 md:h-72 relative z-10" aria-hidden>
        <defs>
          <linearGradient id="jarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f0abfc" stopOpacity={isBlending ? '0.25' : '0.35'} />
            <stop offset="100%" stopColor="#fdba74" stopOpacity={isBlending ? '0.2' : '0.25'} />
          </linearGradient>
          <clipPath id="jarClip">
            <path d="M 58 98 L 58 182 Q 58 196 100 196 Q 142 196 142 182 L 142 98 Z" />
          </clipPath>
        </defs>
        <ellipse cx="100" cy="220" rx="58" ry="14" fill="#374151" />
        <rect x="68" y="198" width="64" height="22" rx="5" fill="#4b5563" />
        <path
          d="M 55 95 L 55 185 Q 55 200 100 200 Q 145 200 145 185 L 145 95 Z"
          fill="url(#jarGrad)"
          stroke="#c026d3"
          strokeWidth="3"
          opacity={isBlending && blendPhase === 'mix' ? 0.35 : 1}
        />
        {isBlending && (
          <g clipPath="url(#jarClip)">
            <rect x="55" y="95" width="90" height="105" fill="#e879f9" opacity="0.2">
              <animate attributeName="opacity" values="0.15;0.35;0.15" dur="0.9s" repeatCount="indefinite" />
            </rect>
          </g>
        )}
        <circle cx="158" cy="152" r="9" fill="#f97316" stroke="#ea580c" strokeWidth="2">
          {isBlending && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 158 152"
              to="360 158 152"
              dur="0.8s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </svg>

      {isBlending && emojiA && emojiB && (
        <JarMixingInterior
          emojiA={emojiA}
          emojiB={emojiB}
          blendPhase={blendPhase}
          resultEmoji={resultEmoji}
          morphKey={morphKey}
        />
      )}

      {/* Steam / bubbles on desktop */}
      {isBlending && (
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 z-20 w-full max-w-[120px]" style={{ top: '8%' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute text-lg opacity-60 animate-particle-float"
              style={{
                left: `${20 + i * 28}%`,
                animationDelay: `${i * 0.25}s`,
              }}
            >
              💨
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BlendProgressBar({ progress }) {
  return (
    <div className="w-full max-w-xs mx-auto mt-4 px-1">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Mixing</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function MoodBlender({ onComplete, onBack, initialSlots = null, initialBlendResult = null }) {
  const [slots, setSlots] = useState(() => {
    if (initialSlots) return initialSlots;
    if (initialBlendResult?.inputMoods?.length === 2) {
      return {
        'slot-a': initialBlendResult.inputMoods[0].value,
        'slot-b': initialBlendResult.inputMoods[1].value,
      };
    }
    return { 'slot-a': null, 'slot-b': null };
  });
  const [activeDrag, setActiveDrag] = useState(null);
  const [phase, setPhase] = useState(initialBlendResult ? 'result' : 'blend');
  const [blendResult, setBlendResult] = useState(initialBlendResult);
  const [isBlending, setIsBlending] = useState(false);
  const [blendPhase, setBlendPhase] = useState('idle'); // idle | pour | mix | reveal
  const [morphKey, setMorphKey] = useState(0);
  const [blendProgress, setBlendProgress] = useState(0);
  const pendingResultRef = useRef(null);
  const timeoutsRef = useRef([]);
  const progressIntervalRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const bothFilled = slots['slot-a'] && slots['slot-b'];
  const isMorphing = phase === 'morphing';

  const moodA = MOOD_OPTIONS.find((m) => m.value === slots['slot-a']);
  const moodB = MOOD_OPTIONS.find((m) => m.value === slots['slot-b']);
  const emojiA = moodA?.emoji;
  const emojiB = moodB?.emoji;

  const clearBlendTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  useEffect(() => () => clearBlendTimeouts(), []);

  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  };

  const startProgressTicker = () => {
    const start = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / BLEND_DURATION_MS) * 100);
      setBlendProgress(pct);
    }, 50);
  };

  const handleDragStart = (event) => {
    const data = event.active.data.current;
    if (data?.mood) {
      setActiveDrag(MOOD_OPTIONS.find((m) => m.value === data.mood));
    }
  };

  const handleDragEnd = (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !SLOT_IDS.includes(over.id)) return;
    const mood = active.data.current?.mood;
    if (!mood) return;
    setSlots((prev) => ({ ...prev, [over.id]: mood }));
    trackEvent('mood_dropped', { slot: over.id, mood });
  };

  const handleClearSlot = (slotId) => {
    if (isBlending) return;
    setSlots((prev) => ({ ...prev, [slotId]: null }));
  };

  const handleBlend = useCallback(() => {
    if (!bothFilled || isBlending) return;

    const result = blendMoods(slots['slot-a'], slots['slot-b']);
    if (!result) return;

    clearBlendTimeouts();
    pendingResultRef.current = result;

    setIsBlending(true);
    setPhase('morphing');
    setBlendPhase('pour');
    setBlendProgress(0);
    setMorphKey(1);
    startProgressTicker();

    schedule(() => setBlendPhase('mix'), MIX_START_MS);
    schedule(() => {
      setBlendPhase('reveal');
      setMorphKey((k) => k + 1);
    }, REVEAL_MS);

    schedule(() => {
      clearBlendTimeouts();
      setBlendProgress(100);
      setIsBlending(false);
      setBlendResult(pendingResultRef.current);
      setPhase('result');
      setBlendPhase('idle');
      trackEvent('blend_completed', {
        inputs: [slots['slot-a'], slots['slot-b']],
        resultMoodSlug: result.resultMoodSlug,
        blendName: result.blendName,
      });
    }, BLEND_DURATION_MS);
  }, [bothFilled, isBlending, slots]);

  const handleFindFood = () => {
    if (!blendResult) return;
    trackEvent('blender_to_quiz', {
      resultMoodSlug: blendResult.resultMoodSlug,
      blendName: blendResult.blendName,
    });
    onComplete(blendResult);
  };

  const handleBlendAgain = () => {
    clearBlendTimeouts();
    setPhase('blend');
    setBlendResult(null);
    setIsBlending(false);
    setBlendPhase('idle');
    setBlendProgress(0);
    pendingResultRef.current = null;
  };

  if (phase === 'result' && blendResult) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4">
        <div className="max-w-lg mx-auto text-center">
          <button type="button" onClick={onBack} className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <div className="bg-white rounded-3xl shadow-xl p-8 md:p-10 animate-fade-in">
            <p className="text-sm font-medium text-primary-600 mb-2">Your blend</p>
            <div className="text-7xl mb-4 animate-emoji-morph">{blendResult.resultEmoji}</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{blendResult.blendName}</h2>
            <p className="text-gray-600 mb-6">{blendResult.tagline}</p>
            <div className="flex justify-center gap-3 mb-8 text-2xl">
              {blendResult.inputMoods.map((m) => (
                <span key={m.value} title={m.label}>{m.emoji}</span>
              ))}
              <span className="text-gray-400">→</span>
              <span>{blendResult.resultEmoji}</span>
            </div>
            <button type="button" onClick={handleFindFood} className="btn-primary w-full text-lg py-4 group mb-3">
              Find food for this vibe
              <ArrowRight className="w-5 h-5 ml-2 inline group-hover:translate-x-1 transition-transform" />
            </button>
            <button type="button" onClick={handleBlendAgain} className="text-sm text-gray-500 hover:text-gray-700">
              Blend again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusText =
    blendPhase === 'pour'
      ? 'Pouring moods in…'
      : blendPhase === 'mix'
        ? 'Mixer running…'
        : blendPhase === 'reveal'
          ? 'Your blend is ready!'
          : null;

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          disabled={isBlending}
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 bg-secondary-50 rounded-full px-4 py-2 mb-4">
            <Sparkles className="w-4 h-4 text-secondary-500" />
            <span className="text-sm font-medium text-secondary-700">Mood Blender</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Mix your moods</h2>
          <p className="text-gray-600">
            {isMorphing ? statusText : 'Drag two emojis into the slots, then hit Blend.'}
          </p>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 mb-6 relative overflow-hidden">
            {/* Mobile: slots above blender | Desktop: slots flank blender */}
            <div className="flex justify-center gap-6 mb-6 md:hidden">
              <DropSlot slotId="slot-a" moodSlug={slots['slot-a']} onClear={handleClearSlot} poured={isMorphing} />
              <DropSlot slotId="slot-b" moodSlug={slots['slot-b']} onClear={handleClearSlot} poured={isMorphing} />
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-center md:gap-8 lg:gap-12">
              <div className="hidden md:flex md:flex-col md:items-center">
                <DropSlot slotId="slot-a" moodSlug={slots['slot-a']} onClear={handleClearSlot} poured={isMorphing} />
              </div>

              <div className="relative flex flex-col items-center min-h-[18rem] md:min-h-[22rem] flex-1 max-w-md mx-auto">
                <BlenderIllustration
                  isShaking={isBlending}
                  isBlending={isBlending}
                  blendPhase={blendPhase}
                  emojiA={emojiA}
                  emojiB={emojiB}
                  resultEmoji={
                    blendPhase === 'reveal'
                      ? pendingResultRef.current?.resultEmoji
                      : null
                  }
                  morphKey={morphKey}
                />

                {isMorphing && (
                  <p className="mt-2 text-sm font-semibold text-secondary-600 animate-pulse z-30">
                    {statusText}
                  </p>
                )}

                {isMorphing && <BlendProgressBar progress={blendProgress} />}
              </div>

              <div className="hidden md:flex md:flex-col md:items-center">
                <DropSlot slotId="slot-b" moodSlug={slots['slot-b']} onClear={handleClearSlot} poured={isMorphing} />
              </div>
            </div>

            <div className="text-center mt-6 relative z-30">
              <button
                type="button"
                onClick={handleBlend}
                disabled={!bothFilled || isMorphing}
                className="btn-primary px-10 py-3 disabled:opacity-50 disabled:cursor-not-allowed min-w-[10rem]"
              >
                {isMorphing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Blending…
                  </span>
                ) : (
                  'Blend'
                )}
              </button>
            </div>
          </div>

          <p className={`text-center text-sm text-gray-500 mb-3 ${isMorphing ? 'opacity-30' : ''}`}>
            Drag from the tray
          </p>
          <div
            className={`flex flex-wrap justify-center gap-3 transition-all ${
              isMorphing ? 'opacity-20 pointer-events-none scale-95' : ''
            }`}
          >
            {MOOD_OPTIONS.map((mood) => (
              <DraggableMoodChip key={mood.value} mood={mood} inTray />
            ))}
          </div>

          <DragOverlay>
            {activeDrag ? (
              <div className="text-4xl p-4 rounded-2xl bg-white shadow-2xl border-2 border-primary-300">
                {activeDrag.emoji}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

export default MoodBlender;
